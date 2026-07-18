import { createServer } from "node:http";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE =
  process.env.DATABASE_FILE || path.join(DATA_DIR, "database.sqlite");
const DIST_DIR = path.join(__dirname, "dist");
const SENHA_PORTA_PREFIXO = "enc:v1";
const CHAVE_SENHA_PORTA = createHash("sha256")
  .update(process.env.CLEANHOST_SECRET || "cleanhost-local-senha-porta")
  .digest();

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
        concluida_em TEXT,
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
    garantirColuna("tarefas", "concluida_em", "TEXT");
    atribuirDonoDadosLegados();
    removerTarefasConcluidasExpiradas();
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
  const usuario = banco
    .prepare("SELECT id FROM usuarios ORDER BY id LIMIT 1")
    .get();
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

function removerTarefasConcluidasExpiradas() {
  banco
    .prepare(
      `DELETE FROM tarefas
       WHERE status = 'Concluida'
         AND concluida_em IS NOT NULL
         AND datetime(concluida_em) < datetime('now', '-30 days')`,
    )
    .run();
}

function normalizarOwnerId(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

async function carregarEstado(ownerId) {
  await garantirBanco();
  removerTarefasConcluidasExpiradas();

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
      .all(donoId)
      .map(mapearFuncionarioDoBanco),
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
                origem, prioridade, motivo_prioridade, concluida_em, dados_json
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
  removerTarefasConcluidasExpiradas();

  const donoId = normalizarOwnerId(ownerId);

  if (!donoId) {
    const erro = new Error("Usuario invalido.");
    erro.status = 400;
    throw erro;
  }

  banco.exec("BEGIN");

  try {
    const tarefasPersistidas = new Map(
      banco
        .prepare(
          "SELECT id, status, concluida_em FROM tarefas WHERE owner_id = ?",
        )
        .all(donoId)
        .map((tarefa) => [String(tarefa.id), tarefa]),
    );

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
        origem, prioridade, motivo_prioridade, concluida_em, dados_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        normalizarCargo(funcionario.cargo),
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
        JSON.stringify(protegerSenhaPorta(apartamento)),
      );
    });

    estadoNormalizado.tarefas.forEach((tarefa) => {
      const tarefaPersistida = tarefasPersistidas.get(String(tarefa.id));
      const statusPersistido = tarefaPersistida?.status;
      const statusFinal =
        statusPersistido === "Concluida" && tarefa.status !== "Concluida"
          ? "Concluida"
          : tarefa.status || "Pendente";
      const concluidaEmFinal =
        statusFinal === "Concluida"
          ? tarefa.concluidaEm ||
            tarefaPersistida?.concluida_em ||
            new Date().toISOString()
          : "";
      const tarefaParaSalvar = {
        ...tarefa,
        status: statusFinal,
        concluidaEm: concluidaEmFinal,
      };

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
        statusFinal,
        String(tarefa.funcionarioId ?? "").trim(),
        tarefa.origem || "",
        tarefa.prioridade ? 1 : 0,
        tarefa.motivoPrioridade || "",
        concluidaEmFinal,
        JSON.stringify(protegerSenhaPorta(tarefaParaSalvar)),
      );
    });

    banco.exec("COMMIT");
    removerTarefasConcluidasExpiradas();
  } catch (erro) {
    banco.exec("ROLLBACK");
    throw erro;
  }
}

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : [];
}

function normalizarCargo(valor) {
  const cargoLimpezaAntigo = ["fa", "xina"].join("");

  return String(valor || "").trim().toLowerCase() === cargoLimpezaAntigo
    ? "Limpeza"
    : String(valor || "");
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

function criptografarSenhaPorta(valor) {
  const texto = String(valor || "");

  if (!texto || texto.startsWith(`${SENHA_PORTA_PREFIXO}:`)) {
    return texto;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", CHAVE_SENHA_PORTA, iv);
  const criptografado = Buffer.concat([
    cipher.update(texto, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    SENHA_PORTA_PREFIXO,
    iv.toString("hex"),
    tag.toString("hex"),
    criptografado.toString("hex"),
  ].join(":");
}

function descriptografarSenhaPorta(valor) {
  const texto = String(valor || "");

  if (!texto.startsWith(`${SENHA_PORTA_PREFIXO}:`)) {
    return texto;
  }

  const partes = texto.slice(`${SENHA_PORTA_PREFIXO}:`.length).split(":");

  if (partes.length !== 3) {
    return "";
  }

  try {
    const [ivHex, tagHex, conteudoHex] = partes;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      CHAVE_SENHA_PORTA,
      Buffer.from(ivHex, "hex"),
    );

    decipher.setAuthTag(Buffer.from(tagHex, "hex"));

    return Buffer.concat([
      decipher.update(Buffer.from(conteudoHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function protegerSenhaPorta(dados) {
  if (!dados || typeof dados !== "object" || !dados.senhaPorta) {
    return dados;
  }

  return {
    ...dados,
    senhaPorta: criptografarSenhaPorta(dados.senhaPorta),
  };
}

function revelarSenhaPorta(dados) {
  if (!dados || typeof dados !== "object" || !dados.senhaPorta) {
    return dados;
  }

  return {
    ...dados,
    senhaPorta: descriptografarSenhaPorta(dados.senhaPorta),
  };
}

function mapearApartamentoDoBanco(linha) {
  const dados = revelarSenhaPorta(lerJson(linha.dados_json, {}));

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

function mapearFuncionarioDoBanco(linha) {
  return {
    ...linha,
    cargo: normalizarCargo(linha.cargo),
  };
}

function mapearTarefaDoBanco(linha) {
  const dados = revelarSenhaPorta(lerJson(linha.dados_json, {}));

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
    concluidaEm: linha.concluida_em || dados.concluidaEm || "",
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
    cargo: normalizarCargo(funcionario.cargo),
    bairro: funcionario.bairro,
  };
}

function montarEnderecoApartamentoBanco(linha) {
  return [linha.apt_rua, linha.apt_numero, linha.apt_bairro]
    .filter(Boolean)
    .join(" - ");
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
    .prepare(
      "SELECT funcionario_id FROM prestador_acessos WHERE funcionario_id = ?",
    )
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
      `SELECT t.id, t.apartamento_id, t.apartamento, t.bairro_apartamento,
              t.descricao, t.checkin, t.checkout, t.hora_checkout, t.status,
              t.funcionario_id, t.origem, t.prioridade, t.motivo_prioridade,
              t.concluida_em, t.dados_json, a.rua AS apt_rua,
              a.numero AS apt_numero, a.bairro AS apt_bairro,
              a.predio AS apt_predio
       FROM tarefas t
       LEFT JOIN apartamentos a ON a.id = t.apartamento_id
       WHERE t.funcionario_id = ?
       ORDER BY t.checkout, t.apartamento`,
    )
    .all(String(prestador.id))
    .map((linha) => {
      const tarefa = mapearTarefaDoBanco(linha);

      return {
        ...tarefa,
        enderecoApartamento:
          tarefa.enderecoApartamento || montarEnderecoApartamentoBanco(linha),
        predioApartamento: tarefa.predioApartamento || linha.apt_predio || "",
      };
    });

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

  const email = String(dados.email || "")
    .trim()
    .toLowerCase();
  const confirmarEmail = String(dados.confirmarEmail || email)
    .trim()
    .toLowerCase();
  const nome = String(dados.nome || "").trim();
  const telefone = limparNumeros(dados.telefone);
  const cpf = limparNumeros(dados.cpf);
  const senha = String(dados.senha || "");
  const confirmarSenha = String(dados.confirmarSenha || senha);

  if (
    !nome ||
    !validarEmail(email) ||
    telefone.length < 10 ||
    cpf.length !== 11
  ) {
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

  const email = String(dados.email || "")
    .trim()
    .toLowerCase();
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

  if (
    !usuario ||
    !validarSenha(senha, usuario.senha_hash, usuario.senha_salt)
  ) {
    const erro = new Error("Email ou senha incorretos.");
    erro.status = 401;
    throw erro;
  }

  return usuarioPublico(usuario);
}

async function excluirContaUsuario(dados) {
  await garantirBanco();

  const usuarioId = normalizarOwnerId(dados.usuarioId || dados.ownerId);

  if (!usuarioId) {
    const erro = new Error("Usuario invalido.");
    erro.status = 400;
    throw erro;
  }

  const usuario = banco
    .prepare("SELECT id FROM usuarios WHERE id = ?")
    .get(usuarioId);

  if (!usuario) {
    const erro = new Error("Usuario nao encontrado.");
    erro.status = 404;
    throw erro;
  }

  banco.exec("BEGIN");

  try {
    const funcionariosConta = banco
      .prepare("SELECT id FROM funcionarios WHERE owner_id = ?")
      .all(usuarioId)
      .map((funcionario) => String(funcionario.id));

    funcionariosConta.forEach((funcionarioId) => {
      banco
        .prepare("DELETE FROM prestador_sessoes WHERE funcionario_id = ?")
        .run(funcionarioId);
      banco
        .prepare("DELETE FROM prestador_acessos WHERE funcionario_id = ?")
        .run(funcionarioId);
    });

    banco.prepare("DELETE FROM tarefas WHERE owner_id = ?").run(usuarioId);
    banco.prepare("DELETE FROM apartamentos WHERE owner_id = ?").run(usuarioId);
    banco.prepare("DELETE FROM funcionarios WHERE owner_id = ?").run(usuarioId);
    banco.prepare("DELETE FROM usuarios WHERE id = ?").run(usuarioId);

    banco.exec("COMMIT");
  } catch (erro) {
    banco.exec("ROLLBACK");
    throw erro;
  }
}

async function criarAcessoPrestador(dados) {
  await garantirBanco();

  const funcionarioId = String(dados.funcionarioId || "");
  const email = String(dados.email || "")
    .trim()
    .toLowerCase();
  const senha = String(dados.senha || "");
  const confirmarSenha = String(dados.confirmarSenha || senha);
  const prestador = await buscarPrestador(funcionarioId);

  if (!prestador) {
    const erro = new Error("Prestador nao encontrado.");
    erro.status = 404;
    throw erro;
  }

  if (
    email !==
    String(prestador.email || "")
      .trim()
      .toLowerCase()
  ) {
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
    .prepare(
      "SELECT funcionario_id FROM prestador_acessos WHERE funcionario_id = ?",
    )
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
  const email = String(dados.email || "")
    .trim()
    .toLowerCase();
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
    email !==
      String(acesso.email || "")
        .trim()
        .toLowerCase() ||
    !validarSenha(senha, acesso.senha_hash, acesso.senha_salt)
  ) {
    const erro = new Error("Email ou senha incorretos.");
    erro.status = 401;
    throw erro;
  }

  return prestadorPublico(prestador);
}

async function recuperarSenhaPrestador(dados) {
  await garantirBanco();

  const funcionarioId = String(dados.funcionarioId || "");
  const email = String(dados.email || "")
    .trim()
    .toLowerCase();
  const senha = String(dados.senha || dados.novaSenha || "");
  const confirmarSenha = String(dados.confirmarSenha || senha);
  const prestador = await buscarPrestador(funcionarioId);

  if (!prestador || !validarEmail(email)) {
    const erro = new Error("Email invalido.");
    erro.status = 400;
    throw erro;
  }

  if (
    email !==
    String(prestador.email || "")
      .trim()
      .toLowerCase()
  ) {
    const erro = new Error("Email nao confere com o cadastro do prestador.");
    erro.status = 401;
    throw erro;
  }

  const acesso = banco
    .prepare(
      "SELECT funcionario_id FROM prestador_acessos WHERE funcionario_id = ?",
    )
    .get(String(prestador.id));

  if (!acesso) {
    const erro = new Error("Este prestador ainda nao criou o acesso.");
    erro.status = 404;
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

  const { hash, salt } = criarHashSenha(senha);

  banco
    .prepare(
      `UPDATE prestador_acessos
       SET email = ?, senha_hash = ?, senha_salt = ?
       WHERE funcionario_id = ?`,
    )
    .run(email, hash, salt, String(prestador.id));
  banco
    .prepare("DELETE FROM prestador_sessoes WHERE funcionario_id = ?")
    .run(String(prestador.id));

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

  const concluidaEm = new Date().toISOString();

  banco
    .prepare(
      `UPDATE tarefas
       SET status = ?, concluida_em = COALESCE(concluida_em, ?)
       WHERE id = ? AND funcionario_id = ?`,
    )
    .run("Concluida", concluidaEm, tarefaId, funcionarioId);

  return { id: tarefaId, status: "Concluida", concluidaEm };
}

function enviarJson(resposta, status, corpo) {
  resposta.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  });
  resposta.end(JSON.stringify(corpo));
}

function enviarTexto(
  resposta,
  status,
  texto,
  tipo = "text/plain; charset=utf-8",
) {
  resposta.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": tipo,
  });
  resposta.end(texto);
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
      "Content-Type":
        tipos[path.extname(arquivo)] || "application/octet-stream",
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

  if (requisicao.url?.startsWith("/api/ical")) {
    try {
      if (requisicao.method !== "GET") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      const url = new URL(requisicao.url, `http://${requisicao.headers.host}`);
      const urlIcal = url.searchParams.get("url");

      if (!urlIcal || !/^https:\/\/(www\.)?airbnb\./i.test(urlIcal)) {
        enviarJson(resposta, 400, { erro: "URL iCal invalida." });
        return;
      }

      const respostaIcal = await fetch(urlIcal, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CleanHost/1.0; +https://localhost)",
          Accept: "text/calendar,text/plain,*/*",
        },
      });

      if (!respostaIcal.ok) {
        enviarJson(resposta, respostaIcal.status, {
          erro: `Airbnb retornou HTTP ${respostaIcal.status}.`,
        });
        return;
      }

      enviarTexto(
        resposta,
        200,
        await respostaIcal.text(),
        "text/calendar; charset=utf-8",
      );
    } catch {
      enviarJson(resposta, 500, { erro: "Nao foi possivel ler o iCal." });
    }
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
        const donoId = normalizarOwnerId(
          corpo.ownerId || corpo.usuarioId || ownerId,
        );
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

      const usuario = await criarUsuario(
        JSON.parse(await lerCorpo(requisicao)),
      );
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

  if (requisicao.url?.startsWith("/api/auth/account")) {
    try {
      if (requisicao.method !== "DELETE") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      await excluirContaUsuario(JSON.parse(await lerCorpo(requisicao)));
      enviarJson(resposta, 200, { ok: true });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel apagar a conta.",
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
      const token =
        url.searchParams.get("token") ||
        requisicao.headers.authorization?.replace(/^Bearer\s+/i, "");

      if (!validarSessaoPrestador(funcionarioId, token)) {
        enviarJson(resposta, 401, {
          erro: "Acesso do prestador nao autenticado.",
        });
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

  if (requisicao.url?.startsWith("/api/provider/recover")) {
    try {
      if (requisicao.method !== "POST") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      const prestador = await recuperarSenhaPrestador(
        JSON.parse(await lerCorpo(requisicao)),
      );
      enviarJson(resposta, 200, { prestador });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel recuperar a senha.",
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
