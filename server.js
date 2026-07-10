import { createServer } from "node:http";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.sqlite");
const DIST_DIR = path.join(__dirname, "dist");

const tipos = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

let banco = null;

async function garantirBanco() {
  await mkdir(DATA_DIR, { recursive: true });

  if (!banco) {
    banco = new DatabaseSync(DB_FILE);
    banco.exec(`
      CREATE TABLE IF NOT EXISTS funcionarios (
        id INTEGER PRIMARY KEY,
        owner_id INTEGER,
        nome TEXT NOT NULL,
        nascimento TEXT,
        email TEXT,
        telefone TEXT,
        cargo TEXT,
        bairro TEXT
      );

      CREATE TABLE IF NOT EXISTS apartamentos (
        id INTEGER PRIMARY KEY,
        owner_id INTEGER,
        numero TEXT,
        bairro TEXT,
        rua TEXT,
        predio TEXT,
        andar TEXT,
        bloco TEXT,
        ical TEXT,
        data_reserva TEXT,
        checkout TEXT,
        hora_checkout TEXT,
        reservas_json TEXT NOT NULL DEFAULT '[]',
        dados_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS tarefas (
        id INTEGER PRIMARY KEY,
        owner_id INTEGER,
        apartamento_id INTEGER,
        apartamento TEXT,
        bairro_apartamento TEXT,
        descricao TEXT,
        checkin TEXT,
        checkout TEXT,
        hora_checkout TEXT,
        status TEXT,
        funcionario_id TEXT,
        origem TEXT,
        prioridade INTEGER NOT NULL DEFAULT 0,
        motivo_prioridade TEXT,
        dados_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        cpf TEXT NOT NULL,
        senha_hash TEXT NOT NULL,
        senha_salt TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS prestador_acessos (
        funcionario_id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        senha_hash TEXT NOT NULL,
        senha_salt TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS prestador_sessoes (
        token_hash TEXT PRIMARY KEY,
        funcionario_id TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    garantirColuna("funcionarios", "owner_id", "INTEGER");
    garantirColuna("apartamentos", "owner_id", "INTEGER");
    garantirColuna("tarefas", "owner_id", "INTEGER");
    atribuirDonoDadosLegados();
  }

  const totalFuncionarios = banco
    .prepare("SELECT COUNT(*) AS total FROM funcionarios")
    .get().total;
  const totalApartamentos = banco
    .prepare("SELECT COUNT(*) AS total FROM apartamentos")
    .get().total;
  const totalTarefas = banco
    .prepare("SELECT COUNT(*) AS total FROM tarefas")
    .get().total;

  if (totalFuncionarios || totalApartamentos || totalTarefas) {
    return;
  }

  // Nao repopula dados antigos quando o banco esta vazio.
  // A partir do SQLite, cada master deve comecar sem apartamentos, prestadores ou tarefas.
}

function garantirColuna(tabela, coluna, tipo) {
  const colunas = banco.prepare(`PRAGMA table_info(${tabela})`).all();
  const existe = colunas.some((item) => item.name === coluna);

  if (!existe) {
    banco.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
  }
}

function obterDonoPadrao() {
  const usuario = banco.prepare("SELECT id FROM usuarios ORDER BY id LIMIT 1").get();
  return usuario?.id || 1;
}

function atribuirDonoDadosLegados() {
  const ownerId = obterDonoPadrao();

  banco
    .prepare("UPDATE funcionarios SET owner_id = ? WHERE owner_id IS NULL")
    .run(ownerId);
  banco
    .prepare("UPDATE apartamentos SET owner_id = ? WHERE owner_id IS NULL")
    .run(ownerId);
  banco
    .prepare("UPDATE tarefas SET owner_id = ? WHERE owner_id IS NULL")
    .run(ownerId);
}

function normalizarOwnerId(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

async function carregarEstado(ownerId) {
  await garantirBanco();

  const donoId = normalizarOwnerId(ownerId);

  if (!donoId) {
    return { funcionarios: [], apartamentos: [], tarefas: [] };
  }

  return normalizarEstadoPrestadorUnico({
    funcionarios: banco
      .prepare(
        `SELECT id, nome, nascimento, email, telefone, cargo, bairro
         FROM funcionarios
         WHERE owner_id = ?
         ORDER BY nome COLLATE NOCASE`,
      )
      .all(donoId),
    apartamentos: banco
      .prepare(
        `SELECT id, numero, bairro, rua, predio, andar, bloco, ical,
                data_reserva, checkout, hora_checkout, reservas_json, dados_json
         FROM apartamentos
         WHERE owner_id = ?
         ORDER BY id`,
      )
      .all(donoId)
      .map(mapearApartamentoDoBanco),
    tarefas: banco
      .prepare(
        `SELECT id, apartamento_id, apartamento, bairro_apartamento, descricao,
                checkin, checkout, hora_checkout, status, funcionario_id,
                origem, prioridade, motivo_prioridade, dados_json
         FROM tarefas
         WHERE owner_id = ?
         ORDER BY checkout, apartamento`,
      )
      .all(donoId)
      .map(mapearTarefaDoBanco),
  });
}

async function salvarEstado(estado, ownerId) {
  await mkdir(DATA_DIR, { recursive: true });

  if (!banco) {
    await garantirBanco();
  }

  const donoId = normalizarOwnerId(ownerId);

  if (!donoId) {
    const erro = new Error("Usuario invalido.");
    erro.status = 400;
    throw erro;
  }

  banco.exec("BEGIN");

  try {
    banco.prepare("DELETE FROM tarefas WHERE owner_id = ?").run(donoId);
    banco.prepare("DELETE FROM apartamentos WHERE owner_id = ?").run(donoId);
    banco.prepare("DELETE FROM funcionarios WHERE owner_id = ?").run(donoId);

    const inserirFuncionario = banco.prepare(`
      INSERT INTO funcionarios (id, owner_id, nome, nascimento, email, telefone, cargo, bairro)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const inserirApartamento = banco.prepare(`
      INSERT INTO apartamentos (
        id, owner_id, numero, bairro, rua, predio, andar, bloco, ical,
        data_reserva, checkout, hora_checkout, reservas_json, dados_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const inserirTarefa = banco.prepare(`
      INSERT INTO tarefas (
        id, owner_id, apartamento_id, apartamento, bairro_apartamento, descricao,
        checkin, checkout, hora_checkout, status, funcionario_id,
        origem, prioridade, motivo_prioridade, dados_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const estadoNormalizado = normalizarEstadoPrestadorUnico({
      funcionarios: normalizarArray(estado.funcionarios),
      apartamentos: normalizarArray(estado.apartamentos),
      tarefas: normalizarArray(estado.tarefas),
    });

    estadoNormalizado.funcionarios.forEach((funcionario) => {
      inserirFuncionario.run(
        Number(funcionario.id) || Date.now(),
        donoId,
        funcionario.nome || "",
        funcionario.nascimento || "",
        funcionario.email || "",
        funcionario.telefone || "",
        funcionario.cargo || "",
        funcionario.bairro || "",
      );
    });

    estadoNormalizado.apartamentos.forEach((apartamento) => {
      inserirApartamento.run(
        Number(apartamento.id) || Date.now(),
        donoId,
        apartamento.numero || "",
        apartamento.Bairro || apartamento.bairro || "",
        apartamento.rua || "",
        apartamento["nome.do.predio"] || apartamento.predio || "",
        apartamento.Andar || apartamento.andar || "",
        apartamento.bloco || "",
        apartamento.ICALL || apartamento.ical || "",
        apartamento.dataReserva || "",
        apartamento.checkout || "",
        apartamento.horaCheckout || "11:00",
        JSON.stringify(normalizarArray(apartamento.reservas)),
        JSON.stringify(apartamento),
      );
    });

    estadoNormalizado.tarefas.forEach((tarefa) => {
      inserirTarefa.run(
        Number(tarefa.id) || Date.now(),
        donoId,
        Number(tarefa.apartamentoId) || null,
        tarefa.apartamento || "",
        tarefa.bairroApartamento || "",
        tarefa.descricao || "",
        tarefa.checkin || "",
        tarefa.checkout || "",
        tarefa.horaCheckout || "11:00",
        tarefa.status || "Pendente",
        String(tarefa.funcionarioId ?? "").trim(),
        tarefa.origem || "",
        tarefa.prioridade ? 1 : 0,
        tarefa.motivoPrioridade || "",
        JSON.stringify(tarefa),
      );
    });

    banco.exec("COMMIT");
  } catch (erro) {
    banco.exec("ROLLBACK");
    throw erro;
  }
}

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : [];
}

function normalizarEstadoPrestadorUnico(estado) {
  const funcionarios = normalizarArray(estado.funcionarios);
  const tarefas = normalizarArray(estado.tarefas);

  if (funcionarios.length !== 1) {
    return {
      ...estado,
      funcionarios,
      tarefas,
    };
  }

  const funcionarioUnico = funcionarios[0];

  return {
    ...estado,
    funcionarios,
    tarefas: tarefas.map((tarefa) => ({
      ...tarefa,
      funcionarioId: funcionarioUnico.id,
    })),
  };
}

function lerJson(valor, fallback) {
  try {
    return valor ? JSON.parse(valor) : fallback;
  } catch {
    return fallback;
  }
}

function mapearApartamentoDoBanco(linha) {
  const dados = lerJson(linha.dados_json, {});

  return {
    ...dados,
    id: linha.id,
    numero: linha.numero,
    Bairro: linha.bairro,
    rua: linha.rua,
    "nome.do.predio": linha.predio,
    Andar: linha.andar,
    bloco: linha.bloco,
    ICALL: linha.ical,
    dataReserva: linha.data_reserva,
    checkout: linha.checkout,
    horaCheckout: linha.hora_checkout,
    reservas: lerJson(linha.reservas_json, []),
  };
}

function mapearTarefaDoBanco(linha) {
  const dados = lerJson(linha.dados_json, {});

  return {
    ...dados,
    id: linha.id,
    apartamentoId: linha.apartamento_id,
    apartamento: linha.apartamento,
    bairroApartamento: linha.bairro_apartamento,
    descricao: linha.descricao,
    checkin: linha.checkin,
    checkout: linha.checkout,
    horaCheckout: linha.hora_checkout,
    status: linha.status,
    funcionarioId: linha.funcionario_id || "",
    origem: linha.origem,
    prioridade: Boolean(linha.prioridade),
    motivoPrioridade: linha.motivo_prioridade,
  };
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function limparNumeros(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function criarHashSenha(senha, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(String(senha), salt, 120000, 32, "sha256").toString(
    "hex",
  );

  return { hash, salt };
}

function criarHashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function validarSenha(senha, hashSalvo, salt) {
  const { hash } = criarHashSenha(senha, salt);
  const hashBuffer = Buffer.from(hash, "hex");
  const hashSalvoBuffer = Buffer.from(hashSalvo, "hex");

  return (
    hashBuffer.length === hashSalvoBuffer.length &&
    timingSafeEqual(hashBuffer, hashSalvoBuffer)
  );
}

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    email: usuario.email,
    nome: usuario.nome,
    telefone: usuario.telefone,
    cpf: usuario.cpf,
  };
}

function prestadorPublico(funcionario) {
  return {
    id: funcionario.id,
    nome: funcionario.nome,
    email: funcionario.email,
    telefone: funcionario.telefone,
    cargo: funcionario.cargo,
    bairro: funcionario.bairro,
  };
}

async function buscarPrestador(funcionarioId) {
  await garantirBanco();

  return banco
    .prepare(
      `SELECT id, nome, nascimento, email, telefone, cargo, bairro
       FROM funcionarios
       WHERE CAST(id AS TEXT) = ?`,
    )
    .get(String(funcionarioId || ""));
}

async function obterStatusAcessoPrestador(funcionarioId) {
  const prestador = await buscarPrestador(funcionarioId);

  if (!prestador) {
    const erro = new Error("Prestador nao encontrado.");
    erro.status = 404;
    throw erro;
  }

  const acesso = banco
    .prepare("SELECT funcionario_id FROM prestador_acessos WHERE funcionario_id = ?")
    .get(String(prestador.id));

  return {
    prestador: prestadorPublico(prestador),
    precisaCriarSenha: !acesso,
  };
}

async function carregarPortalPrestador(funcionarioId) {
  const prestador = await buscarPrestador(funcionarioId);

  if (!prestador) {
    const erro = new Error("Prestador nao encontrado.");
    erro.status = 404;
    throw erro;
  }

  const tarefas = banco
    .prepare(
      `SELECT id, apartamento_id, apartamento, bairro_apartamento, descricao,
              checkin, checkout, hora_checkout, status, funcionario_id,
              origem, prioridade, motivo_prioridade, dados_json
       FROM tarefas
       WHERE funcionario_id = ?
       ORDER BY checkout, apartamento`,
    )
    .all(String(prestador.id))
    .map(mapearTarefaDoBanco);

  return {
    prestador: prestadorPublico(prestador),
    tarefas,
  };
}

function criarSessaoPrestador(funcionarioId) {
  const token = randomBytes(32).toString("hex");

  banco
    .prepare(
      `INSERT INTO prestador_sessoes (token_hash, funcionario_id)
       VALUES (?, ?)`,
    )
    .run(criarHashToken(token), String(funcionarioId));

  return token;
}

function validarSessaoPrestador(funcionarioId, token) {
  if (!funcionarioId || !token) {
    return false;
  }

  const sessao = banco
    .prepare(
      `SELECT funcionario_id
       FROM prestador_sessoes
       WHERE token_hash = ? AND funcionario_id = ?`,
    )
    .get(criarHashToken(token), String(funcionarioId));

  return Boolean(sessao);
}

async function criarUsuario(dados) {
  await garantirBanco();

  const email = String(dados.email || "").trim().toLowerCase();
  const confirmarEmail = String(dados.confirmarEmail || email)
    .trim()
    .toLowerCase();
  const nome = String(dados.nome || "").trim();
  const telefone = limparNumeros(dados.telefone);
  const cpf = limparNumeros(dados.cpf);
  const senha = String(dados.senha || "");
  const confirmarSenha = String(dados.confirmarSenha || senha);

  if (!nome || !validarEmail(email) || telefone.length < 10 || cpf.length !== 11) {
    const erro = new Error("Dados de cadastro invalidos.");
    erro.status = 400;
    throw erro;
  }

  if (email !== confirmarEmail) {
    const erro = new Error("Os emails precisam ser iguais.");
    erro.status = 400;
    throw erro;
  }

  if (senha.length < 6) {
    const erro = new Error("A senha precisa ter pelo menos 6 caracteres.");
    erro.status = 400;
    throw erro;
  }

  if (senha !== confirmarSenha) {
    const erro = new Error("As senhas precisam ser iguais.");
    erro.status = 400;
    throw erro;
  }

  const usuarioExistente = banco
    .prepare("SELECT id FROM usuarios WHERE email = ?")
    .get(email);

  if (usuarioExistente) {
    const erro = new Error("Este email ja esta cadastrado.");
    erro.status = 409;
    throw erro;
  }

  const { hash, salt } = criarHashSenha(senha);
  const resultado = banco
    .prepare(
      `INSERT INTO usuarios (email, nome, telefone, cpf, senha_hash, senha_salt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(email, nome, telefone, cpf, hash, salt);

  return usuarioPublico({
    id: Number(resultado.lastInsertRowid),
    email,
    nome,
    telefone,
    cpf,
  });
}

async function autenticarUsuario(dados) {
  await garantirBanco();

  const email = String(dados.email || "").trim().toLowerCase();
  const senha = String(dados.senha || "");

  if (!validarEmail(email) || !senha) {
    const erro = new Error("Email ou senha invalidos.");
    erro.status = 400;
    throw erro;
  }

  const usuario = banco
    .prepare(
      `SELECT id, email, nome, telefone, cpf, senha_hash, senha_salt
       FROM usuarios
       WHERE email = ?`,
    )
    .get(email);

  if (!usuario || !validarSenha(senha, usuario.senha_hash, usuario.senha_salt)) {
    const erro = new Error("Email ou senha incorretos.");
    erro.status = 401;
    throw erro;
  }

  return usuarioPublico(usuario);
}

async function criarAcessoPrestador(dados) {
  await garantirBanco();

  const funcionarioId = String(dados.funcionarioId || "");
  const email = String(dados.email || "").trim().toLowerCase();
  const senha = String(dados.senha || "");
  const confirmarSenha = String(dados.confirmarSenha || senha);
  const prestador = await buscarPrestador(funcionarioId);

  if (!prestador) {
    const erro = new Error("Prestador nao encontrado.");
    erro.status = 404;
    throw erro;
  }

  if (email !== String(prestador.email || "").trim().toLowerCase()) {
    const erro = new Error("Use o email cadastrado pelo responsavel.");
    erro.status = 400;
    throw erro;
  }

  if (senha.length < 6) {
    const erro = new Error("A senha precisa ter pelo menos 6 caracteres.");
    erro.status = 400;
    throw erro;
  }

  if (senha !== confirmarSenha) {
    const erro = new Error("As senhas precisam ser iguais.");
    erro.status = 400;
    throw erro;
  }

  const acessoExistente = banco
    .prepare("SELECT funcionario_id FROM prestador_acessos WHERE funcionario_id = ?")
    .get(String(prestador.id));

  if (acessoExistente) {
    const erro = new Error("Este prestador ja criou o acesso.");
    erro.status = 409;
    throw erro;
  }

  const { hash, salt } = criarHashSenha(senha);
  banco
    .prepare(
      `INSERT INTO prestador_acessos (funcionario_id, email, senha_hash, senha_salt)
       VALUES (?, ?, ?, ?)`,
    )
    .run(String(prestador.id), email, hash, salt);

  return prestadorPublico(prestador);
}

async function autenticarPrestador(dados) {
  await garantirBanco();

  const funcionarioId = String(dados.funcionarioId || "");
  const email = String(dados.email || "").trim().toLowerCase();
  const senha = String(dados.senha || "");
  const prestador = await buscarPrestador(funcionarioId);

  if (!prestador || !validarEmail(email) || !senha) {
    const erro = new Error("Email ou senha invalidos.");
    erro.status = 400;
    throw erro;
  }

  const acesso = banco
    .prepare(
      `SELECT funcionario_id, email, senha_hash, senha_salt
       FROM prestador_acessos
       WHERE funcionario_id = ?`,
    )
    .get(String(prestador.id));

  if (
    !acesso ||
    email !== String(acesso.email || "").trim().toLowerCase() ||
    !validarSenha(senha, acesso.senha_hash, acesso.senha_salt)
  ) {
    const erro = new Error("Email ou senha incorretos.");
    erro.status = 401;
    throw erro;
  }

  return prestadorPublico(prestador);
}

async function concluirTarefaPrestador(dados) {
  await garantirBanco();

  const funcionarioId = String(dados.funcionarioId || "");
  const tarefaId = Number(dados.tarefaId);
  const token = String(dados.token || "");

  if (!funcionarioId || !Number.isFinite(tarefaId)) {
    const erro = new Error("Tarefa invalida.");
    erro.status = 400;
    throw erro;
  }

  if (!validarSessaoPrestador(funcionarioId, token)) {
    const erro = new Error("Acesso do prestador nao autenticado.");
    erro.status = 401;
    throw erro;
  }

  const tarefa = banco
    .prepare(
      `SELECT id, funcionario_id
       FROM tarefas
       WHERE id = ? AND funcionario_id = ?`,
    )
    .get(tarefaId, funcionarioId);

  if (!tarefa) {
    const erro = new Error("Tarefa nao encontrada para este prestador.");
    erro.status = 404;
    throw erro;
  }

  banco
    .prepare("UPDATE tarefas SET status = ? WHERE id = ? AND funcionario_id = ?")
    .run("Concluida", tarefaId, funcionarioId);

  return { id: tarefaId, status: "Concluida" };
}

function enviarJson(resposta, status, corpo) {
  resposta.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  });
  resposta.end(JSON.stringify(corpo));
}

function lerCorpo(requisicao) {
  return new Promise((resolve, reject) => {
    let corpo = "";

    requisicao.on("data", (parte) => {
      corpo += parte;
    });
    requisicao.on("end", () => resolve(corpo));
    requisicao.on("error", reject);
  });
}

async function servirArquivo(requisicao, resposta) {
  const url = new URL(requisicao.url, `http://${requisicao.headers.host}`);
  const caminhoUrl = url.pathname === "/" ? "/index.html" : url.pathname;
  const caminhoSeguro = path
    .normalize(decodeURIComponent(caminhoUrl))
    .replace(/^(\.\.[/\\])+/, "");
  let arquivo = path.join(DIST_DIR, caminhoSeguro);

  try {
    const info = await stat(arquivo);

    if (info.isDirectory()) {
      arquivo = path.join(arquivo, "index.html");
    }
  } catch {
    arquivo = path.join(DIST_DIR, "index.html");
  }

  try {
    await stat(arquivo);
    resposta.writeHead(200, {
      "Content-Type": tipos[path.extname(arquivo)] || "application/octet-stream",
    });
    createReadStream(arquivo).pipe(resposta);
  } catch {
    resposta.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    resposta.end("Arquivo nao encontrado.");
  }
}

const servidor = createServer(async (requisicao, resposta) => {
  if (requisicao.method === "OPTIONS") {
    enviarJson(resposta, 204, {});
    return;
  }

  if (requisicao.url?.startsWith("/api/state")) {
    try {
      const url = new URL(requisicao.url, `http://${requisicao.headers.host}`);
      const ownerId = normalizarOwnerId(
        url.searchParams.get("ownerId") || url.searchParams.get("usuarioId"),
      );

      if (requisicao.method === "GET") {
        enviarJson(resposta, 200, await carregarEstado(ownerId));
        return;
      }

      if (requisicao.method === "PUT") {
        const corpo = JSON.parse(await lerCorpo(requisicao));
        const donoId = normalizarOwnerId(corpo.ownerId || corpo.usuarioId || ownerId);
        const estado = {
          funcionarios: Array.isArray(corpo.funcionarios)
            ? corpo.funcionarios
            : [],
          apartamentos: Array.isArray(corpo.apartamentos)
            ? corpo.apartamentos
            : [],
          tarefas: Array.isArray(corpo.tarefas) ? corpo.tarefas : [],
        };

        await salvarEstado(estado, donoId);
        enviarJson(resposta, 200, estado);
        return;
      }

      enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
    } catch {
      enviarJson(resposta, 500, { erro: "Nao foi possivel acessar o banco." });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/auth/register")) {
    try {
      if (requisicao.method !== "POST") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      const usuario = await criarUsuario(JSON.parse(await lerCorpo(requisicao)));
      enviarJson(resposta, 201, { usuario });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel criar a conta.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/auth/login")) {
    try {
      if (requisicao.method !== "POST") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      const usuario = await autenticarUsuario(
        JSON.parse(await lerCorpo(requisicao)),
      );
      enviarJson(resposta, 200, { usuario });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel entrar.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/provider/access")) {
    try {
      const url = new URL(requisicao.url, `http://${requisicao.headers.host}`);

      if (requisicao.method !== "GET") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      const funcionarioId = url.searchParams.get("funcionarioId");
      enviarJson(
        resposta,
        200,
        await obterStatusAcessoPrestador(funcionarioId),
      );
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel verificar o acesso.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/provider/portal")) {
    try {
      const url = new URL(requisicao.url, `http://${requisicao.headers.host}`);

      if (requisicao.method !== "GET") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      const funcionarioId = url.searchParams.get("funcionarioId");
      const token = url.searchParams.get("token") || requisicao.headers.authorization?.replace(/^Bearer\s+/i, "");

      if (!validarSessaoPrestador(funcionarioId, token)) {
        enviarJson(resposta, 401, { erro: "Acesso do prestador nao autenticado." });
        return;
      }

      enviarJson(resposta, 200, await carregarPortalPrestador(funcionarioId));
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel carregar o painel.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/provider/register")) {
    try {
      if (requisicao.method !== "POST") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      const prestador = await criarAcessoPrestador(
        JSON.parse(await lerCorpo(requisicao)),
      );
      enviarJson(resposta, 201, {
        prestador,
        token: criarSessaoPrestador(prestador.id),
      });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel criar o acesso.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/provider/login")) {
    try {
      if (requisicao.method !== "POST") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      const prestador = await autenticarPrestador(
        JSON.parse(await lerCorpo(requisicao)),
      );
      enviarJson(resposta, 200, {
        prestador,
        token: criarSessaoPrestador(prestador.id),
      });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel entrar.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/provider/complete")) {
    try {
      if (requisicao.method !== "POST") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      const tarefa = await concluirTarefaPrestador(
        JSON.parse(await lerCorpo(requisicao)),
      );
      enviarJson(resposta, 200, { tarefa });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel concluir a tarefa.",
      });
    }
    return;
  }

  await servirArquivo(requisicao, resposta);
});

servidor.listen(PORT, () => {
  console.log(`Banco/API rodando em http://localhost:${PORT}`);
});
