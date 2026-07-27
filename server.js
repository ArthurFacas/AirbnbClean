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
const DATA_DIR =
  process.env.DATA_DIR ||
  (process.env.RENDER ? "/var/data/cleanhost" : path.join(__dirname, "data"));
const DB_FILE =
  process.env.DATABASE_FILE || path.join(DATA_DIR, "database.sqlite");
const DIST_DIR = path.join(__dirname, "dist");
const SENHA_PORTA_PREFIXO = "enc:v1";
const CHAVE_SENHA_PORTA = createHash("sha256")
  .update(process.env.CLEANHOST_SECRET || "cleanhost-local-senha-porta")
  .digest();

const PERMISSOES_OPERACIONAIS_PADRAO = [
  "visualizarApartamentos",
  "cadastrarApartamentos",
  "editarApartamentos",
  "excluirApartamentos",
  "visualizarPrestadores",
  "cadastrarPrestadores",
  "editarPrestadores",
  "excluirPrestadores",
  "visualizarTarefas",
  "criarTarefas",
  "editarTarefas",
  "excluirTarefas",
  "atribuirTarefas",
  "visualizarCalendarios",
  "administrarAcessosPrestadores",
];

const PERMISSOES_GESTORA_PADRAO = PERMISSOES_OPERACIONAIS_PADRAO.reduce(
  (permissoes, permissao) => ({
    ...permissoes,
    [permissao]: true,
  }),
  {},
);

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
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
    `);
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

      CREATE TABLE IF NOT EXISTS usuario_sessoes (
        token_hash TEXT PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
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

      CREATE TABLE IF NOT EXISTS convites_acesso (
        codigo_hash TEXT PRIMARY KEY,
        owner_id INTEGER NOT NULL,
        funcionario_id TEXT NOT NULL,
        email TEXT NOT NULL,
        nome TEXT,
        cargo TEXT NOT NULL,
        permissoes_json TEXT,
        apartamentos_acesso TEXT,
        apartamentos_permitidos_json TEXT,
        prestadores_acesso TEXT,
        prestadores_permitidos_json TEXT,
        criado_em TEXT NOT NULL,
        expira_em TEXT NOT NULL,
        utilizado_em TEXT,
        usuario_id TEXT,
        cancelado_em TEXT
      );
    `);

    garantirColuna("funcionarios", "owner_id", "INTEGER");
    garantirColuna("apartamentos", "owner_id", "INTEGER");
    garantirColuna("tarefas", "owner_id", "INTEGER");
    garantirColuna("tarefas", "concluida_em", "TEXT");
    garantirColuna("usuarios", "papel", "TEXT");
    garantirColuna("usuarios", "owner_id", "INTEGER");
    garantirColuna("usuarios", "ativo", "INTEGER NOT NULL DEFAULT 1");
    garantirColuna("usuarios", "permissoes_json", "TEXT");
    garantirColuna("usuarios", "apartamentos_acesso", "TEXT");
    garantirColuna("usuarios", "apartamentos_permitidos_json", "TEXT");
    garantirColuna("usuarios", "prestadores_acesso", "TEXT");
    garantirColuna("usuarios", "prestadores_permitidos_json", "TEXT");
    atualizarUsuariosLegados();
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

function atualizarUsuariosLegados() {
  banco
    .prepare("UPDATE usuarios SET papel = 'Master' WHERE papel IS NULL OR papel = ''")
    .run();
  banco
    .prepare("UPDATE usuarios SET owner_id = id WHERE owner_id IS NULL")
    .run();
  banco
    .prepare("UPDATE usuarios SET ativo = 1 WHERE ativo IS NULL")
    .run();
  banco
    .prepare("UPDATE usuarios SET apartamentos_acesso = 'todos' WHERE apartamentos_acesso IS NULL OR apartamentos_acesso = ''")
    .run();
  banco
    .prepare("UPDATE usuarios SET apartamentos_permitidos_json = '[]' WHERE apartamentos_permitidos_json IS NULL OR apartamentos_permitidos_json = ''")
    .run();
  banco
    .prepare("UPDATE usuarios SET prestadores_acesso = 'todos' WHERE prestadores_acesso IS NULL OR prestadores_acesso = ''")
    .run();
  banco
    .prepare("UPDATE usuarios SET prestadores_permitidos_json = '[]' WHERE prestadores_permitidos_json IS NULL OR prestadores_permitidos_json = ''")
    .run();
  banco
    .prepare(
      `UPDATE usuarios
       SET permissoes_json = ?
       WHERE papel = 'Gestora' AND (permissoes_json IS NULL OR permissoes_json = '')`,
    )
    .run(JSON.stringify(PERMISSOES_GESTORA_PADRAO));
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
  const texto = String(valor || "").trim();
  const textoNormalizado = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (textoNormalizado === cargoLimpezaAntigo) {
    return "Limpeza";
  }

  if (["gestora", "gestao", "gerente"].includes(textoNormalizado)) {
    return "Gestora";
  }

  return texto;
}

function normalizarPapelUsuario(valor) {
  const texto = String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return ["gestora", "gestao", "gerente"].includes(texto)
    ? "Gestora"
    : "Master";
}

function usuarioEhMaster(usuario) {
  return normalizarPapelUsuario(usuario?.papel) === "Master";
}

function usuarioEhGestora(usuario) {
  return normalizarPapelUsuario(usuario?.papel) === "Gestora";
}

function normalizarTipoAcesso(valor) {
  return String(valor || "").trim() === "selecionados"
    ? "selecionados"
    : "todos";
}

function normalizarIdsPermitidos(valor) {
  return normalizarArray(valor)
    .map((id) => String(id || "").trim())
    .filter(Boolean);
}

function obterPermissoesUsuario(usuario) {
  if (usuarioEhMaster(usuario)) {
    return PERMISSOES_GESTORA_PADRAO;
  }

  const permissoesSalvas = lerJson(usuario?.permissoes_json, {});

  return PERMISSOES_OPERACIONAIS_PADRAO.reduce(
    (permissoes, permissao) => ({
      ...permissoes,
      [permissao]:
        permissoesSalvas[permissao] === undefined
          ? true
          : Boolean(permissoesSalvas[permissao]),
    }),
    {},
  );
}

function usuarioPode(usuario, permissao) {
  return usuarioEhMaster(usuario) || Boolean(obterPermissoesUsuario(usuario)[permissao]);
}

function obterEscopoUsuario(usuario) {
  return {
    apartamentosAcesso: normalizarTipoAcesso(usuario?.apartamentos_acesso),
    apartamentosPermitidos: normalizarIdsPermitidos(
      lerJson(usuario?.apartamentos_permitidos_json, []),
    ),
    prestadoresAcesso: normalizarTipoAcesso(usuario?.prestadores_acesso),
    prestadoresPermitidos: normalizarIdsPermitidos(
      lerJson(usuario?.prestadores_permitidos_json, []),
    ),
  };
}

function itemPermitidoPorEscopo(item, tipoAcesso, idsPermitidos) {
  return tipoAcesso === "todos" || idsPermitidos.includes(String(item?.id));
}

function tarefaPermitidaPorEscopo(tarefa, escopo) {
  const apartamentoPermitido =
    escopo.apartamentosAcesso === "todos" ||
    escopo.apartamentosPermitidos.includes(String(tarefa?.apartamentoId));
  const funcionarioId = String(tarefa?.funcionarioId || "").trim();
  const prestadorPermitido =
    escopo.prestadoresAcesso === "todos" ||
    !funcionarioId ||
    escopo.prestadoresPermitidos.includes(funcionarioId);

  return apartamentoPermitido && prestadorPermitido;
}

function filtrarEstadoPorPermissoes(estado, usuario) {
  if (usuarioEhMaster(usuario)) {
    return estado;
  }

  const permissoes = obterPermissoesUsuario(usuario);
  const escopo = obterEscopoUsuario(usuario);
  const apartamentos = permissoes.visualizarApartamentos
    ? normalizarArray(estado.apartamentos).filter((apartamento) =>
        itemPermitidoPorEscopo(
          apartamento,
          escopo.apartamentosAcesso,
          escopo.apartamentosPermitidos,
        ),
      )
    : [];
  const funcionarios = permissoes.visualizarPrestadores
    ? normalizarArray(estado.funcionarios).filter((funcionario) =>
        itemPermitidoPorEscopo(
          funcionario,
          escopo.prestadoresAcesso,
          escopo.prestadoresPermitidos,
        ),
      )
    : [];
  const tarefas = permissoes.visualizarTarefas
    ? normalizarArray(estado.tarefas).filter((tarefa) =>
        tarefaPermitidaPorEscopo(tarefa, escopo),
      )
    : [];

  return { funcionarios, apartamentos, tarefas };
}

function obterOwnerOperacional(usuario) {
  return normalizarOwnerId(usuario?.owner_id || usuario?.ownerId || usuario?.id);
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
  const papel = normalizarPapelUsuario(usuario.papel);
  const ownerId = obterOwnerOperacional(usuario) || Number(usuario.id);
  const escopo = obterEscopoUsuario(usuario);

  return {
    id: usuario.id,
    email: usuario.email,
    nome: usuario.nome,
    telefone: usuario.telefone,
    cpf: usuario.cpf,
    papel,
    ownerId,
    permissoes: obterPermissoesUsuario(usuario),
    apartamentosAcesso: escopo.apartamentosAcesso,
    apartamentosPermitidos: escopo.apartamentosPermitidos,
    prestadoresAcesso: escopo.prestadoresAcesso,
    prestadoresPermitidos: escopo.prestadoresPermitidos,
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

  garantirFuncionarioEhPrestador(prestador);

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

  garantirFuncionarioEhPrestador(prestador);

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

function criarSessaoUsuario(usuarioId) {
  const token = randomBytes(32).toString("hex");

  banco
    .prepare(
      `INSERT INTO usuario_sessoes (token_hash, usuario_id)
       VALUES (?, ?)`,
    )
    .run(criarHashToken(token), Number(usuarioId));

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

function obterTokenAutorizacao(requisicao) {
  return requisicao.headers.authorization?.replace(/^Bearer\s+/i, "");
}

function autenticarRequisicaoUsuario(requisicao) {
  const token = obterTokenAutorizacao(requisicao);

  if (!token) {
    const erro = new Error("Usuario nao autenticado.");
    erro.status = 401;
    throw erro;
  }

  const sessao = banco
    .prepare(
      `SELECT u.id, u.email, u.nome, u.telefone, u.cpf, u.papel, u.owner_id,
              u.ativo, u.permissoes_json, u.apartamentos_acesso,
              u.apartamentos_permitidos_json, u.prestadores_acesso,
              u.prestadores_permitidos_json
       FROM usuario_sessoes s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ?`,
    )
    .get(criarHashToken(token));

  if (!sessao || sessao.ativo === 0) {
    const erro = new Error("Usuario nao autenticado.");
    erro.status = 401;
    throw erro;
  }

  return sessao;
}

function garantirAcessoOperacional(usuario, ownerId) {
  const donoId = normalizarOwnerId(ownerId);
  const ownerOperacional = obterOwnerOperacional(usuario);

  if (!donoId || !ownerOperacional || donoId !== ownerOperacional) {
    const erro = new Error("Sem permissao para acessar estes dados.");
    erro.status = 403;
    throw erro;
  }

  return donoId;
}

function garantirMaster(usuario) {
  if (!usuarioEhMaster(usuario)) {
    const erro = new Error("Apenas o Master pode executar esta acao.");
    erro.status = 403;
    throw erro;
  }
}

function funcionarioEhGestora(funcionario) {
  return normalizarPapelUsuario(funcionario?.cargo) === "Gestora";
}

function garantirFuncionarioEhPrestador(funcionario) {
  if (funcionarioEhGestora(funcionario)) {
    const erro = new Error("Gestora deve acessar pelo painel administrativo.");
    erro.status = 403;
    throw erro;
  }
}

function garantirEstadoOperacionalPermitido(usuario, estado, ownerId) {
  if (usuarioEhMaster(usuario)) {
    return;
  }

  if (!usuarioEhGestora(usuario)) {
    const erro = new Error("Sem permissao para alterar estes dados.");
    erro.status = 403;
    throw erro;
  }

  const funcionariosNovos = normalizarArray(estado.funcionarios);
  const gestoresExistentes = banco
    .prepare(
      `SELECT id, nome, email, telefone, cargo
       FROM funcionarios
       WHERE owner_id = ?
         AND cargo IN ('Gestora', 'gestora', 'Gestao', 'gestao', 'Gestão', 'gestão', 'Gerente', 'gerente')`,
    )
    .all(ownerId);
  const gestoresNovos = funcionariosNovos.filter(funcionarioEhGestora);
  const gestoresPorId = new Map(
    gestoresNovos.map((funcionario) => [String(funcionario.id), funcionario]),
  );
  const gestoresExistentesPorId = new Map(
    gestoresExistentes.map((funcionario) => [String(funcionario.id), funcionario]),
  );
  const escopo = obterEscopoUsuario(usuario);

  gestoresNovos.forEach((gestoraNova) => {
    if (!gestoresExistentesPorId.has(String(gestoraNova.id))) {
      const erro = new Error("A Gestora nao pode criar, remover ou editar gestoras.");
      erro.status = 403;
      throw erro;
    }
  });

  gestoresExistentes.forEach((gestoraAtual) => {
    const gestoraNova = gestoresPorId.get(String(gestoraAtual.id));
    const gestoraVisivel = itemPermitidoPorEscopo(
      gestoraAtual,
      escopo.prestadoresAcesso,
      escopo.prestadoresPermitidos,
    );

    if (
      gestoraVisivel &&
      (!gestoraNova ||
      String(gestoraNova.nome || "") !== String(gestoraAtual.nome || "") ||
      String(gestoraNova.email || "") !== String(gestoraAtual.email || "") ||
      String(gestoraNova.telefone || "") !== String(gestoraAtual.telefone || ""))
    ) {
      const erro = new Error("A Gestora nao pode criar, remover ou editar gestoras.");
      erro.status = 403;
      throw erro;
    }
  });
}

function criarMapaPorId(lista) {
  return new Map(normalizarArray(lista).map((item) => [String(item.id), item]));
}

function idsVisiveis(lista, permitido) {
  return new Set(
    normalizarArray(lista)
      .filter(permitido)
      .map((item) => String(item.id)),
  );
}

function garantirPermissaoAcao(usuario, permissao, mensagem) {
  if (!usuarioPode(usuario, permissao)) {
    const erro = new Error(mensagem || "Sem permissao para executar esta acao.");
    erro.status = 403;
    throw erro;
  }
}

function normalizarPermissoesEntrada(valor, padrao = false) {
  const origem = valor && typeof valor === "object" ? valor : {};

  return PERMISSOES_OPERACIONAIS_PADRAO.reduce(
    (permissoes, permissao) => ({
      ...permissoes,
      [permissao]:
        origem[permissao] === undefined ? padrao : Boolean(origem[permissao]),
    }),
    {},
  );
}

function normalizarConfiguracaoPermissoes(dados, permissoesPadrao = false) {
  const apartamentosAcesso = normalizarTipoAcesso(dados.apartamentosAcesso);
  const apartamentosPermitidos = normalizarIdsPermitidos(
    dados.apartamentosPermitidos,
  );
  const prestadoresAcesso = normalizarTipoAcesso(dados.prestadoresAcesso);
  const prestadoresPermitidos = normalizarIdsPermitidos(
    dados.prestadoresPermitidos,
  );

  if (apartamentosAcesso === "selecionados" && !apartamentosPermitidos.length) {
    const erro = new Error("Selecione pelo menos um apartamento.");
    erro.status = 400;
    throw erro;
  }

  if (prestadoresAcesso === "selecionados" && !prestadoresPermitidos.length) {
    const erro = new Error("Selecione pelo menos um prestador.");
    erro.status = 400;
    throw erro;
  }

  return {
    permissoes: normalizarPermissoesEntrada(dados.permissoes, permissoesPadrao),
    apartamentosAcesso,
    apartamentosPermitidos:
      apartamentosAcesso === "selecionados" ? apartamentosPermitidos : [],
    prestadoresAcesso,
    prestadoresPermitidos:
      prestadoresAcesso === "selecionados" ? prestadoresPermitidos : [],
  };
}

function criarCodigoConvite() {
  return randomBytes(32).toString("base64url");
}

function criarHashConvite(codigo) {
  return createHash("sha256").update(String(codigo || "")).digest("hex");
}

function cargoEhGestora(valor) {
  return normalizarCargo(valor) === "Gestora";
}

function cargoEhPrestador(valor) {
  return !cargoEhGestora(valor);
}

function obterCargoConvite(funcionario) {
  return cargoEhGestora(funcionario?.cargo) ? "Gestora" : "Prestador";
}

function erroConvite(mensagem, status = 403) {
  const erro = new Error(mensagem);
  erro.status = status;
  throw erro;
}

function mapearConvitePublico(convite, link = "") {
  if (!convite) {
    return {
      status: "Acesso nao enviado",
      acao: "Enviar link",
      link: "",
    };
  }

  if (convite.cancelado_em) {
    return {
      status: "Acesso nao enviado",
      acao: "Enviar link",
      link: "",
    };
  }

  if (convite.utilizado_em || convite.usuario_id) {
    return {
      status: "Conta criada",
      acao: "Ver acesso",
      link: "",
    };
  }

  if (new Date(convite.expira_em).getTime() < Date.now()) {
    return {
      status: "Convite expirado",
      acao: "Reenviar convite",
      link: "",
    };
  }

  return {
    status: "Convite enviado",
    acao: "Copiar link",
    link,
  };
}

function buscarFuncionarioOperacional(ownerId, funcionarioId) {
  return banco
    .prepare(
      `SELECT id, nome, nascimento, email, telefone, cargo, bairro
       FROM funcionarios
       WHERE owner_id = ? AND CAST(id AS TEXT) = ?`,
    )
    .get(ownerId, String(funcionarioId || ""));
}

function buscarConviteAtivoPorFuncionario(ownerId, funcionarioId) {
  return banco
    .prepare(
      `SELECT *
       FROM convites_acesso
       WHERE owner_id = ?
         AND funcionario_id = ?
         AND cancelado_em IS NULL
       ORDER BY datetime(criado_em) DESC
       LIMIT 1`,
    )
    .get(ownerId, String(funcionarioId || ""));
}

function buscarConvitePorCodigo(codigo) {
  return banco
    .prepare("SELECT * FROM convites_acesso WHERE codigo_hash = ?")
    .get(criarHashConvite(codigo));
}

function montarLinkConvite(requisicao, codigo) {
  const origem = `http://${requisicao.headers.host}`;

  return `${origem}/#/convite/${encodeURIComponent(codigo)}`;
}

function buscarUsuarioPorEmail(email) {
  return banco
    .prepare(
      `SELECT id, email, nome, telefone, cpf, papel, owner_id, ativo,
              permissoes_json, apartamentos_acesso,
              apartamentos_permitidos_json, prestadores_acesso,
              prestadores_permitidos_json
       FROM usuarios
       WHERE email = ?`,
    )
    .get(String(email || "").trim().toLowerCase());
}

function garantirAlvoPermissoes(usuarioAtual, usuarioAlvo) {
  garantirMaster(usuarioAtual);

  if (!usuarioAlvo || usuarioAlvo.ativo === 0) {
    const erro = new Error("Usuario administrativo nao encontrado.");
    erro.status = 404;
    throw erro;
  }

  if (usuarioEhMaster(usuarioAlvo)) {
    const erro = new Error("As permissoes do Master nao podem ser alteradas.");
    erro.status = 403;
    throw erro;
  }

  if (Number(usuarioAtual.id) === Number(usuarioAlvo.id)) {
    const erro = new Error("Voce nao pode alterar suas proprias permissoes.");
    erro.status = 403;
    throw erro;
  }

  if (obterOwnerOperacional(usuarioAtual) !== obterOwnerOperacional(usuarioAlvo)) {
    const erro = new Error("Sem permissao para alterar este usuario.");
    erro.status = 403;
    throw erro;
  }
}

async function obterPermissoesGestora(email, usuarioAtual) {
  await garantirBanco();
  const usuarioAlvo = buscarUsuarioPorEmail(email);

  garantirAlvoPermissoes(usuarioAtual, usuarioAlvo);

  return usuarioPublico(usuarioAlvo);
}

async function salvarPermissoesGestora(dados, usuarioAtual) {
  await garantirBanco();
  const email = String(dados.email || "").trim().toLowerCase();
  const usuarioAlvo = buscarUsuarioPorEmail(email);

  garantirAlvoPermissoes(usuarioAtual, usuarioAlvo);

  const configuracao = normalizarConfiguracaoPermissoes(dados);

  banco
    .prepare(
      `UPDATE usuarios
       SET permissoes_json = ?,
           apartamentos_acesso = ?,
           apartamentos_permitidos_json = ?,
           prestadores_acesso = ?,
           prestadores_permitidos_json = ?
       WHERE id = ?`,
    )
    .run(
      JSON.stringify(configuracao.permissoes),
      configuracao.apartamentosAcesso,
      JSON.stringify(configuracao.apartamentosPermitidos),
      configuracao.prestadoresAcesso,
      JSON.stringify(configuracao.prestadoresPermitidos),
      usuarioAlvo.id,
    );

  return obterPermissoesGestora(email, usuarioAtual);
}

async function criarConviteAcesso(dados, usuarioAtual, requisicao) {
  await garantirBanco();
  garantirMaster(usuarioAtual);

  const ownerId = obterOwnerOperacional(usuarioAtual);
  const funcionarioId = String(dados.funcionarioId || "").trim();
  const funcionario = buscarFuncionarioOperacional(ownerId, funcionarioId);

  if (!funcionario) {
    erroConvite("Pessoa cadastrada nao encontrada.", 404);
  }

  const email = String(funcionario.email || "").trim().toLowerCase();

  if (!validarEmail(email)) {
    erroConvite("Email cadastrado invalido.", 400);
  }

  const usuarioExistente = buscarUsuarioPorEmail(email);
  const acessoPrestadorExistente = banco
    .prepare("SELECT funcionario_id FROM prestador_acessos WHERE funcionario_id = ?")
    .get(funcionarioId);

  if (cargoEhGestora(funcionario.cargo) && usuarioExistente) {
    erroConvite("Esta gestora ja possui conta criada.", 409);
  }

  if (cargoEhPrestador(funcionario.cargo) && acessoPrestadorExistente) {
    erroConvite("Este prestador ja possui acesso criado.", 409);
  }

  const cargo = obterCargoConvite(funcionario);
  const configuracao = cargo === "Gestora"
    ? normalizarConfiguracaoPermissoes(dados, true)
    : normalizarConfiguracaoPermissoes({}, false);
  const codigo = criarCodigoConvite();
  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + 1000 * 60 * 60 * 24 * 7);

  banco
    .prepare(
      `UPDATE convites_acesso
       SET cancelado_em = ?
       WHERE owner_id = ?
         AND funcionario_id = ?
         AND utilizado_em IS NULL
         AND cancelado_em IS NULL`,
    )
    .run(agora.toISOString(), ownerId, funcionarioId);
  banco
    .prepare(
      `INSERT INTO convites_acesso (
        codigo_hash, owner_id, funcionario_id, email, nome, cargo,
        permissoes_json, apartamentos_acesso, apartamentos_permitidos_json,
        prestadores_acesso, prestadores_permitidos_json, criado_em, expira_em
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      criarHashConvite(codigo),
      ownerId,
      funcionarioId,
      email,
      funcionario.nome || "",
      cargo,
      cargo === "Gestora" ? JSON.stringify(configuracao.permissoes) : "",
      cargo === "Gestora" ? configuracao.apartamentosAcesso : "",
      cargo === "Gestora" ? JSON.stringify(configuracao.apartamentosPermitidos) : "[]",
      cargo === "Gestora" ? configuracao.prestadoresAcesso : "",
      cargo === "Gestora" ? JSON.stringify(configuracao.prestadoresPermitidos) : "[]",
      agora.toISOString(),
      expiraEm.toISOString(),
    );

  const link = montarLinkConvite(requisicao, codigo);

  return {
    ...mapearConvitePublico({ cargo, expira_em: expiraEm.toISOString() }, link),
    cargo,
    email,
    link,
    expiraEm: expiraEm.toISOString(),
  };
}

async function obterStatusConviteAcesso(funcionarioId, usuarioAtual) {
  await garantirBanco();
  garantirMaster(usuarioAtual);

  const ownerId = obterOwnerOperacional(usuarioAtual);
  const funcionario = buscarFuncionarioOperacional(ownerId, funcionarioId);

  if (!funcionario) {
    erroConvite("Pessoa cadastrada nao encontrada.", 404);
  }

  const convite = buscarConviteAtivoPorFuncionario(ownerId, funcionarioId);
  const email = String(funcionario.email || "").trim().toLowerCase();
  const contaCriada = cargoEhGestora(funcionario.cargo)
    ? buscarUsuarioPorEmail(email)
    : banco
        .prepare("SELECT funcionario_id FROM prestador_acessos WHERE funcionario_id = ?")
        .get(String(funcionarioId));

  if (contaCriada && !convite) {
    return {
      status: "Conta criada",
      acao: "Ver acesso",
      link: "",
      cargo: obterCargoConvite(funcionario),
    };
  }

  return {
    ...mapearConvitePublico(convite),
    cargo: obterCargoConvite(funcionario),
  };
}

async function cancelarConviteAcesso(funcionarioId, usuarioAtual) {
  await garantirBanco();
  garantirMaster(usuarioAtual);

  const ownerId = obterOwnerOperacional(usuarioAtual);
  const agora = new Date().toISOString();

  banco
    .prepare(
      `UPDATE convites_acesso
       SET cancelado_em = ?
       WHERE owner_id = ?
         AND funcionario_id = ?
         AND utilizado_em IS NULL
         AND cancelado_em IS NULL`,
    )
    .run(agora, ownerId, String(funcionarioId || ""));

  return { ok: true, status: "Acesso nao enviado", acao: "Enviar link" };
}

async function obterConviteAcesso(codigo) {
  await garantirBanco();
  const convite = buscarConvitePorCodigo(codigo);

  if (!convite) {
    erroConvite("Convite invalido.");
  }

  const funcionario = buscarFuncionarioOperacional(
    convite.owner_id,
    convite.funcionario_id,
  );

  if (!funcionario) {
    erroConvite("Cadastro vinculado ao convite nao encontrado.", 404);
  }

  if (convite.cancelado_em) {
    erroConvite("Convite cancelado.");
  }

  if (convite.utilizado_em || convite.usuario_id) {
    erroConvite("Este convite ja foi utilizado.");
  }

  if (new Date(convite.expira_em).getTime() < Date.now()) {
    erroConvite("Convite expirado.");
  }

  return {
    nome: funcionario.nome || convite.nome || "",
    email: convite.email,
    cargo: convite.cargo,
    expiraEm: convite.expira_em,
  };
}

async function cadastrarAcessoPorConvite(dados) {
  await garantirBanco();
  const convite = buscarConvitePorCodigo(dados.codigo || dados.token);

  if (!convite) {
    erroConvite("Convite invalido.");
  }

  const dadosConvite = await obterConviteAcesso(dados.codigo || dados.token);
  const funcionario = buscarFuncionarioOperacional(
    convite.owner_id,
    convite.funcionario_id,
  );
  const email = String(convite.email || "").trim().toLowerCase();
  const confirmarEmail = String(dados.confirmarEmail || email)
    .trim()
    .toLowerCase();
  const senha = String(dados.senha || "");
  const confirmarSenha = String(dados.confirmarSenha || senha);

  if (!funcionario || !validarEmail(email)) {
    erroConvite("Dados do convite invalidos.", 400);
  }

  if (email !== confirmarEmail) {
    erroConvite("Os emails precisam ser iguais.", 400);
  }

  if (senha.length < 6 || senha !== confirmarSenha) {
    erroConvite("Senha invalida.", 400);
  }

  const agora = new Date().toISOString();
  const { hash, salt } = criarHashSenha(senha);

  if (dadosConvite.cargo === "Gestora") {
    if (buscarUsuarioPorEmail(email)) {
      erroConvite("Esta gestora ja possui conta criada.", 409);
    }

    const resultado = banco
      .prepare(
        `INSERT INTO usuarios (
          email, nome, telefone, cpf, senha_hash, senha_salt, papel, owner_id,
          ativo, permissoes_json, apartamentos_acesso,
          apartamentos_permitidos_json, prestadores_acesso,
          prestadores_permitidos_json
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        email,
        funcionario.nome || convite.nome || "",
        limparNumeros(funcionario.telefone),
        limparNumeros(dados.cpf || "00000000000"),
        hash,
        salt,
        "Gestora",
        convite.owner_id,
        1,
        convite.permissoes_json || JSON.stringify(PERMISSOES_GESTORA_PADRAO),
        normalizarTipoAcesso(convite.apartamentos_acesso),
        convite.apartamentos_permitidos_json || "[]",
        normalizarTipoAcesso(convite.prestadores_acesso),
        convite.prestadores_permitidos_json || "[]",
      );

    banco
      .prepare(
        `UPDATE convites_acesso
         SET utilizado_em = ?, usuario_id = ?
         WHERE codigo_hash = ?`,
      )
      .run(agora, String(resultado.lastInsertRowid), convite.codigo_hash);

    return { tipo: "Gestora", email };
  }

  const acessoExistente = banco
    .prepare("SELECT funcionario_id FROM prestador_acessos WHERE funcionario_id = ?")
    .get(String(convite.funcionario_id));

  if (acessoExistente) {
    erroConvite("Este prestador ja possui acesso criado.", 409);
  }

  banco
    .prepare(
      `INSERT INTO prestador_acessos (funcionario_id, email, senha_hash, senha_salt)
       VALUES (?, ?, ?, ?)`,
    )
    .run(String(convite.funcionario_id), email, hash, salt);
  banco
    .prepare(
      `UPDATE convites_acesso
       SET utilizado_em = ?, usuario_id = ?
       WHERE codigo_hash = ?`,
    )
    .run(agora, String(convite.funcionario_id), convite.codigo_hash);

  return { tipo: "Prestador", email, funcionarioId: String(convite.funcionario_id) };
}

function garantirAlteracoesColecaoPermitidas({
  usuario,
  atuais,
  novas,
  visiveis,
  permissaoCadastrar,
  permissaoEditar,
  permissaoExcluir,
  mensagemCadastrar,
  mensagemEditar,
  mensagemExcluir,
}) {
  const atuaisPorId = criarMapaPorId(atuais);
  const novasPorId = criarMapaPorId(novas);

  novasPorId.forEach((novo, id) => {
    if (!atuaisPorId.has(id)) {
      garantirPermissaoAcao(usuario, permissaoCadastrar, mensagemCadastrar);
      return;
    }

    if (visiveis.has(id) && JSON.stringify(novo) !== JSON.stringify(atuaisPorId.get(id))) {
      garantirPermissaoAcao(usuario, permissaoEditar, mensagemEditar);
    }
  });

  atuaisPorId.forEach((atual, id) => {
    if (visiveis.has(id) && !novasPorId.has(id)) {
      garantirPermissaoAcao(usuario, permissaoExcluir, mensagemExcluir);
    }
  });
}

function mesclarColecaoLimitada(atuais, novas, visiveis) {
  const novasPorId = criarMapaPorId(novas);
  const mescladas = normalizarArray(atuais).map((atual) =>
    visiveis.has(String(atual.id)) && novasPorId.has(String(atual.id))
      ? novasPorId.get(String(atual.id))
      : atual,
  );
  const idsAtuais = new Set(normalizarArray(atuais).map((item) => String(item.id)));
  const adicionais = normalizarArray(novas).filter(
    (novo) => !idsAtuais.has(String(novo.id)),
  );

  return [...mescladas.filter((item) => !visiveis.has(String(item.id)) || novasPorId.has(String(item.id))), ...adicionais];
}

function garantirAtribuicoesPermitidas(usuario, tarefasAtuais, tarefasNovas) {
  const tarefasAtuaisPorId = criarMapaPorId(tarefasAtuais);

  normalizarArray(tarefasNovas).forEach((tarefaNova) => {
    const tarefaAtual = tarefasAtuaisPorId.get(String(tarefaNova.id));

    if (
      tarefaAtual &&
      String(tarefaAtual.funcionarioId || "") !==
        String(tarefaNova.funcionarioId || "")
    ) {
      garantirPermissaoAcao(
        usuario,
        "atribuirTarefas",
        "Sem permissao para atribuir tarefas.",
      );
    }
  });
}

function prepararEstadoParaSalvar(usuario, estadoAtual, estadoNovo) {
  if (usuarioEhMaster(usuario)) {
    return estadoNovo;
  }

  const escopo = obterEscopoUsuario(usuario);
  const apartamentosVisiveis = idsVisiveis(
    estadoAtual.apartamentos,
    (apartamento) =>
      itemPermitidoPorEscopo(
        apartamento,
        escopo.apartamentosAcesso,
        escopo.apartamentosPermitidos,
      ),
  );
  const prestadoresVisiveis = idsVisiveis(
    estadoAtual.funcionarios,
    (funcionario) =>
      itemPermitidoPorEscopo(
        funcionario,
        escopo.prestadoresAcesso,
        escopo.prestadoresPermitidos,
      ),
  );
  const tarefasVisiveis = idsVisiveis(estadoAtual.tarefas, (tarefa) =>
    tarefaPermitidaPorEscopo(tarefa, escopo),
  );

  normalizarArray(estadoNovo.apartamentos).forEach((apartamento) => {
    if (
      !apartamentosVisiveis.has(String(apartamento.id)) &&
      !criarMapaPorId(estadoAtual.apartamentos).has(String(apartamento.id))
    ) {
      if (escopo.apartamentosAcesso === "selecionados") {
        const erro = new Error("Sem permissao para acessar este apartamento.");
        erro.status = 403;
        throw erro;
      }

      garantirPermissaoAcao(
        usuario,
        "cadastrarApartamentos",
        "Sem permissao para cadastrar apartamentos.",
      );
    }
  });

  normalizarArray(estadoNovo.funcionarios).forEach((funcionario) => {
    if (
      !prestadoresVisiveis.has(String(funcionario.id)) &&
      !criarMapaPorId(estadoAtual.funcionarios).has(String(funcionario.id))
    ) {
      if (escopo.prestadoresAcesso === "selecionados") {
        const erro = new Error("Sem permissao para acessar este prestador.");
        erro.status = 403;
        throw erro;
      }

      garantirPermissaoAcao(
        usuario,
        "cadastrarPrestadores",
        "Sem permissao para cadastrar prestadores.",
      );
    }
  });

  normalizarArray(estadoNovo.tarefas).forEach((tarefa) => {
    const tarefaExiste = criarMapaPorId(estadoAtual.tarefas).has(String(tarefa.id));

    if (!tarefaExiste) {
      garantirPermissaoAcao(usuario, "criarTarefas", "Sem permissao para criar tarefas.");

      if (!tarefaPermitidaPorEscopo(tarefa, escopo)) {
        const erro = new Error("Sem permissao para acessar esta tarefa.");
        erro.status = 403;
        throw erro;
      }
    }

    if (tarefasVisiveis.has(String(tarefa.id)) && !tarefaPermitidaPorEscopo(tarefa, escopo)) {
      const erro = new Error("Sem permissao para acessar esta tarefa.");
      erro.status = 403;
      throw erro;
    }
  });

  garantirAlteracoesColecaoPermitidas({
    usuario,
    atuais: estadoAtual.apartamentos,
    novas: estadoNovo.apartamentos,
    visiveis: apartamentosVisiveis,
    permissaoCadastrar: "cadastrarApartamentos",
    permissaoEditar: "editarApartamentos",
    permissaoExcluir: "excluirApartamentos",
    mensagemCadastrar: "Sem permissao para cadastrar apartamentos.",
    mensagemEditar: "Sem permissao para editar apartamentos.",
    mensagemExcluir: "Sem permissao para excluir apartamentos.",
  });
  garantirAlteracoesColecaoPermitidas({
    usuario,
    atuais: estadoAtual.funcionarios,
    novas: estadoNovo.funcionarios,
    visiveis: prestadoresVisiveis,
    permissaoCadastrar: "cadastrarPrestadores",
    permissaoEditar: "editarPrestadores",
    permissaoExcluir: "excluirPrestadores",
    mensagemCadastrar: "Sem permissao para cadastrar prestadores.",
    mensagemEditar: "Sem permissao para editar prestadores.",
    mensagemExcluir: "Sem permissao para excluir prestadores.",
  });
  garantirAlteracoesColecaoPermitidas({
    usuario,
    atuais: estadoAtual.tarefas,
    novas: estadoNovo.tarefas,
    visiveis: tarefasVisiveis,
    permissaoCadastrar: "criarTarefas",
    permissaoEditar: "editarTarefas",
    permissaoExcluir: "excluirTarefas",
    mensagemCadastrar: "Sem permissao para criar tarefas.",
    mensagemEditar: "Sem permissao para editar tarefas.",
    mensagemExcluir: "Sem permissao para excluir tarefas.",
  });
  garantirAtribuicoesPermitidas(usuario, estadoAtual.tarefas, estadoNovo.tarefas);

  return {
    funcionarios: mesclarColecaoLimitada(
      estadoAtual.funcionarios,
      estadoNovo.funcionarios,
      prestadoresVisiveis,
    ),
    apartamentos: mesclarColecaoLimitada(
      estadoAtual.apartamentos,
      estadoNovo.apartamentos,
      apartamentosVisiveis,
    ),
    tarefas: mesclarColecaoLimitada(estadoAtual.tarefas, estadoNovo.tarefas, tarefasVisiveis),
  };
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
      `INSERT INTO usuarios (
        email, nome, telefone, cpf, senha_hash, senha_salt, papel, ativo,
        apartamentos_acesso, apartamentos_permitidos_json,
        prestadores_acesso, prestadores_permitidos_json
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(email, nome, telefone, cpf, hash, salt, "Master", 1, "todos", "[]", "todos", "[]");
  const usuarioId = Number(resultado.lastInsertRowid);

  banco
    .prepare("UPDATE usuarios SET owner_id = ? WHERE id = ?")
    .run(usuarioId, usuarioId);

  return usuarioPublico({
    id: usuarioId,
    email,
    nome,
    telefone,
    cpf,
    papel: "Master",
    owner_id: usuarioId,
    apartamentos_acesso: "todos",
    apartamentos_permitidos_json: "[]",
    prestadores_acesso: "todos",
    prestadores_permitidos_json: "[]",
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
      `SELECT id, email, nome, telefone, cpf, senha_hash, senha_salt, papel,
              owner_id, ativo, permissoes_json, apartamentos_acesso,
              apartamentos_permitidos_json, prestadores_acesso,
              prestadores_permitidos_json
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

  if (usuario.ativo === 0) {
    const erro = new Error("Usuario desativado.");
    erro.status = 403;
    throw erro;
  }

  return {
    ...usuarioPublico(usuario),
    token: criarSessaoUsuario(usuario.id),
  };
}

async function criarGestora(dados, usuarioAtual) {
  await garantirBanco();
  garantirMaster(usuarioAtual);

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

  if (senha.length < 6 || senha !== confirmarSenha) {
    const erro = new Error("Senha invalida.");
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
  const ownerId = obterOwnerOperacional(usuarioAtual);
  const configuracao = normalizarConfiguracaoPermissoes(dados, true);
  const resultado = banco
    .prepare(
      `INSERT INTO usuarios (
        email, nome, telefone, cpf, senha_hash, senha_salt, papel, owner_id,
        ativo, permissoes_json, apartamentos_acesso,
        apartamentos_permitidos_json, prestadores_acesso,
        prestadores_permitidos_json
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      email,
      nome,
      telefone,
      cpf,
      hash,
      salt,
      "Gestora",
      ownerId,
      1,
      JSON.stringify(configuracao.permissoes),
      configuracao.apartamentosAcesso,
      JSON.stringify(configuracao.apartamentosPermitidos),
      configuracao.prestadoresAcesso,
      JSON.stringify(configuracao.prestadoresPermitidos),
    );

  return usuarioPublico({
    id: Number(resultado.lastInsertRowid),
    email,
    nome,
    telefone,
    cpf,
    papel: "Gestora",
    owner_id: ownerId,
    permissoes_json: JSON.stringify(configuracao.permissoes),
    apartamentos_acesso: configuracao.apartamentosAcesso,
    apartamentos_permitidos_json: JSON.stringify(configuracao.apartamentosPermitidos),
    prestadores_acesso: configuracao.prestadoresAcesso,
    prestadores_permitidos_json: JSON.stringify(configuracao.prestadoresPermitidos),
  });
}

async function excluirContaUsuario(dados, usuarioAtual) {
  await garantirBanco();
  garantirMaster(usuarioAtual);

  const usuarioId = normalizarOwnerId(dados.usuarioId || dados.ownerId);

  if (!usuarioId) {
    const erro = new Error("Usuario invalido.");
    erro.status = 400;
    throw erro;
  }

  if (Number(usuarioAtual.id) !== usuarioId) {
    const erro = new Error("Sem permissao para apagar esta conta.");
    erro.status = 403;
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

  garantirFuncionarioEhPrestador(prestador);

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

  const email = String(dados.email || "")
    .trim()
    .toLowerCase();
  const senha = String(dados.senha || "");

  if (!validarEmail(email) || !senha) {
    const erro = new Error("Email ou senha invalidos.");
    erro.status = 400;
    throw erro;
  }

  const acesso = banco
    .prepare(
      `SELECT a.funcionario_id, a.email, a.senha_hash, a.senha_salt,
              f.id, f.nome, f.nascimento, f.telefone, f.cargo, f.bairro
       FROM prestador_acessos a
       JOIN funcionarios f ON CAST(f.id AS TEXT) = a.funcionario_id
       WHERE lower(a.email) = ?
       ORDER BY f.id
       LIMIT 1`,
    )
    .get(email);

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

  const prestador = {
    id: acesso.id,
    nome: acesso.nome,
    nascimento: acesso.nascimento,
    email: acesso.email,
    telefone: acesso.telefone,
    cargo: acesso.cargo,
    bairro: acesso.bairro,
  };

  garantirFuncionarioEhPrestador(prestador);

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

  garantirFuncionarioEhPrestador(prestador);

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

  if (requisicao.url?.startsWith("/api/health")) {
    try {
      await garantirBanco();
      enviarJson(resposta, 200, {
        ok: true,
        databaseFile: DB_FILE,
        persistentDiskPath: DATA_DIR,
        render: Boolean(process.env.RENDER),
      });
    } catch {
      enviarJson(resposta, 500, {
        ok: false,
        erro: "Banco indisponivel.",
      });
    }
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
      const usuarioAtual = autenticarRequisicaoUsuario(requisicao);
      const url = new URL(requisicao.url, `http://${requisicao.headers.host}`);
      const ownerIdSolicitado = normalizarOwnerId(
        url.searchParams.get("ownerId") ||
          url.searchParams.get("usuarioId") ||
          obterOwnerOperacional(usuarioAtual),
      );
      const ownerId = garantirAcessoOperacional(usuarioAtual, ownerIdSolicitado);

      if (requisicao.method === "GET") {
        const estado = await carregarEstado(ownerId);
        enviarJson(resposta, 200, filtrarEstadoPorPermissoes(estado, usuarioAtual));
        return;
      }

      if (requisicao.method === "PUT") {
        const corpo = JSON.parse(await lerCorpo(requisicao));
        const donoId = garantirAcessoOperacional(
          usuarioAtual,
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

        const estadoAtual = await carregarEstado(donoId);
        garantirEstadoOperacionalPermitido(usuarioAtual, estado, donoId);
        const estadoPermitido = prepararEstadoParaSalvar(
          usuarioAtual,
          estadoAtual,
          estado,
        );

        await salvarEstado(estadoPermitido, donoId);
        enviarJson(
          resposta,
          200,
          filtrarEstadoPorPermissoes(estadoPermitido, usuarioAtual),
        );
        return;
      }

      enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel acessar o banco.",
      });
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

      await excluirContaUsuario(
        JSON.parse(await lerCorpo(requisicao)),
        autenticarRequisicaoUsuario(requisicao),
      );
      enviarJson(resposta, 200, { ok: true });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel apagar a conta.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/auth/manager-permissions")) {
    try {
      const usuarioAtual = autenticarRequisicaoUsuario(requisicao);
      const url = new URL(requisicao.url, `http://${requisicao.headers.host}`);

      if (requisicao.method === "GET") {
        enviarJson(
          resposta,
          200,
          await obterPermissoesGestora(
            url.searchParams.get("email"),
            usuarioAtual,
          ),
        );
        return;
      }

      if (requisicao.method === "PUT") {
        enviarJson(
          resposta,
          200,
          await salvarPermissoesGestora(
            JSON.parse(await lerCorpo(requisicao)),
            usuarioAtual,
          ),
        );
        return;
      }

      enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel salvar as permissoes.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/invites")) {
    try {
      const usuarioAtual = autenticarRequisicaoUsuario(requisicao);
      const url = new URL(requisicao.url, `http://${requisicao.headers.host}`);

      if (requisicao.method === "GET") {
        enviarJson(
          resposta,
          200,
          await obterStatusConviteAcesso(
            url.searchParams.get("funcionarioId"),
            usuarioAtual,
          ),
        );
        return;
      }

      if (requisicao.method === "POST") {
        enviarJson(
          resposta,
          201,
          await criarConviteAcesso(
            JSON.parse(await lerCorpo(requisicao)),
            usuarioAtual,
            requisicao,
          ),
        );
        return;
      }

      if (requisicao.method === "DELETE") {
        enviarJson(
          resposta,
          200,
          await cancelarConviteAcesso(
            url.searchParams.get("funcionarioId"),
            usuarioAtual,
          ),
        );
        return;
      }

      enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel acessar o convite.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/invite")) {
    try {
      const url = new URL(requisicao.url, `http://${requisicao.headers.host}`);

      if (requisicao.method === "GET") {
        enviarJson(
          resposta,
          200,
          await obterConviteAcesso(url.searchParams.get("codigo")),
        );
        return;
      }

      if (requisicao.method === "POST") {
        enviarJson(
          resposta,
          201,
          await cadastrarAcessoPorConvite(JSON.parse(await lerCorpo(requisicao))),
        );
        return;
      }

      enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel usar o convite.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/auth/manager-invite")) {
    try {
      const url = new URL(requisicao.url, `http://${requisicao.headers.host}`);

      if (requisicao.method === "GET") {
        enviarJson(
          resposta,
          200,
          await obterConviteAcesso(url.searchParams.get("token")),
        );
        return;
      }

      if (requisicao.method === "POST") {
        enviarJson(
          resposta,
          201,
          await criarConviteAcesso(
            JSON.parse(await lerCorpo(requisicao)),
            autenticarRequisicaoUsuario(requisicao),
            requisicao,
          ),
        );
        return;
      }

      enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel gerar o convite.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/auth/manager-register")) {
    try {
      if (requisicao.method !== "POST") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      enviarJson(
        resposta,
        201,
        await cadastrarAcessoPorConvite(JSON.parse(await lerCorpo(requisicao))),
      );
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel criar a gestora.",
      });
    }
    return;
  }

  if (requisicao.url?.startsWith("/api/auth/manager")) {
    try {
      if (requisicao.method !== "POST") {
        enviarJson(resposta, 405, { erro: "Metodo nao permitido." });
        return;
      }

      const gestora = await criarGestora(
        JSON.parse(await lerCorpo(requisicao)),
        autenticarRequisicaoUsuario(requisicao),
      );
      enviarJson(resposta, 201, { usuario: gestora });
    } catch (erro) {
      enviarJson(resposta, erro.status || 500, {
        erro: erro.message || "Nao foi possivel criar a gestora.",
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
  console.log(`Banco SQLite em ${DB_FILE}`);
});
