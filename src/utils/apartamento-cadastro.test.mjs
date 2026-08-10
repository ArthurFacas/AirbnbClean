import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import test from "node:test";

const porta = 43000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${porta}`;
const raizProjeto = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
let pastaTemporaria;
let processoServidor;

function hashCodigo(codigo) {
  return createHash("sha256").update(String(codigo || "")).digest("hex");
}

async function requisicaoJson(caminho, opcoes = {}) {
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    ...opcoes,
    headers: {
      ...(opcoes.body ? { "Content-Type": "application/json" } : {}),
      ...opcoes.headers,
    },
  });
  const dados = await resposta.json().catch(() => ({}));

  return { resposta, dados };
}

async function aguardarServidor() {
  const inicio = Date.now();

  while (Date.now() - inicio < 10000) {
    try {
      const { resposta } = await requisicaoJson("/api/health");

      if (resposta.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    }
  }

  throw new Error("Servidor de teste nao iniciou.");
}

async function criarChaveAtivacao(codigo) {
  const banco = new DatabaseSync(path.join(pastaTemporaria, "database.sqlite"));

  try {
    banco
      .prepare(
        `INSERT INTO chaves_ativacao_master (
          codigo_hash, criado_por_usuario_id, criado_em, expira_em
        )
        VALUES (?, ?, ?, ?)`,
      )
      .run(
        hashCodigo(codigo),
        0,
        new Date().toISOString(),
        new Date(Date.now() + 86400000).toISOString(),
      );
  } finally {
    banco.close();
  }
}

async function cadastrarMaster() {
  const chaveAtivacao = "chave-teste-apartamento";

  await criarChaveAtivacao(chaveAtivacao);

  const cadastro = await requisicaoJson("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      chaveAtivacao,
      nome: "Master Teste",
      email: "master-apartamento@example.com",
      confirmarEmail: "master-apartamento@example.com",
      telefone: "11999999999",
      cpf: "12345678901",
      senha: "senhateste",
      confirmarSenha: "senhateste",
    }),
  });

  assert.equal(cadastro.resposta.status, 201, cadastro.dados.erro);

  const login = await requisicaoJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "master-apartamento@example.com",
      senha: "senhateste",
    }),
  });

  assert.equal(login.resposta.status, 200, login.dados.erro);
  return login.dados.usuario;
}

function cabecalho(usuario) {
  return { Authorization: `Bearer ${usuario.token}` };
}

function apartamento(id, Bairro, rua, numero, predio) {
  return {
    id,
    Bairro,
    rua,
    numero,
    "nome.do.predio": predio,
    observacaoEndereco: "",
    hospedesMaximos: "4",
    senhaPorta: "",
    ICALL: "https://example.com/calendario.ics",
    horaCheckout: "11:00",
  };
}

test.before(async () => {
  pastaTemporaria = await mkdtemp(path.join(tmpdir(), "cleanhost-apt-"));
  processoServidor = spawn(process.execPath, ["server.js"], {
    cwd: raizProjeto,
    env: {
      ...process.env,
      PORT: String(porta),
      DATA_DIR: pastaTemporaria,
      DATABASE_FILE: path.join(pastaTemporaria, "database.sqlite"),
      CLEANHOST_SECRET: "segredo-teste-apartamento",
    },
    stdio: "ignore",
  });

  await aguardarServidor();
});

test.after(async () => {
  if (processoServidor && processoServidor.exitCode === null) {
    processoServidor.kill();
    await Promise.race([once(processoServidor, "exit"), delay(3000)]);
  }

  await rm(pastaTemporaria, { recursive: true, force: true });
});

test("cadastro de apartamentos permite bairro repetido, bairro novo e persiste apos recarregar", async () => {
  const master = await cadastrarMaster();
  assert.equal(master.papel, "Master");
  assert.equal(master.apartamentosAcesso, "todos");

  const apartamentosIniciais = [
    apartamento(101, "Bela Vista", "Rua Um", "101", "Condominio Bela"),
    apartamento(102, "Bela Vista", "Rua Dois", "202", "Condominio Bela"),
    {
      ...apartamento(103, "Jardim Paulista", "Rua Tres", "303", "Condominio Jardim"),
      ICALL: "ical-invalido",
    },
  ];

  const salvar = await requisicaoJson("/api/state", {
    method: "PUT",
    headers: cabecalho(master),
    body: JSON.stringify({
      ownerId: master.ownerId,
      funcionarios: [],
      apartamentos: apartamentosIniciais,
      tarefas: [],
    }),
  });

  assert.equal(salvar.resposta.status, 200, salvar.dados.erro);
  assert.ok(salvar.dados.apartamentos.some((item) => item.id === 101));
  assert.ok(salvar.dados.apartamentos.some((item) => item.id === 102));
  assert.ok(salvar.dados.apartamentos.some((item) => item.id === 103));
  assert.equal(salvar.dados.apartamentos.length, 3);
  assert.deepEqual(
    salvar.dados.apartamentos.map((item) => item.Bairro),
    ["Bela Vista", "Bela Vista", "Jardim Paulista"],
  );

  const recarregar = await requisicaoJson(`/api/state?ownerId=${master.ownerId}`, {
    headers: cabecalho(master),
  });

  assert.equal(recarregar.resposta.status, 200, recarregar.dados.erro);
  assert.deepEqual(
    recarregar.dados.apartamentos.map((item) => item.id),
    [101, 102, 103],
  );

  const loginDepoisReload = await requisicaoJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "master-apartamento@example.com",
      senha: "senhateste",
    }),
  });
  const masterDepoisReload = loginDepoisReload.dados.usuario;
  const estadoDepoisReload = await requisicaoJson(
    `/api/state?ownerId=${masterDepoisReload.ownerId}`,
    {
      headers: cabecalho(masterDepoisReload),
    },
  );

  assert.equal(estadoDepoisReload.resposta.status, 200, estadoDepoisReload.dados.erro);
  assert.deepEqual(
    estadoDepoisReload.dados.apartamentos.map((item) => item.id),
    [101, 102, 103],
  );
});

test("gestora com apartamentos selecionados pode cadastrar novo apartamento sem regra de bairro ou funcionario interferir", async () => {
  const loginMaster = await requisicaoJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "master-apartamento@example.com",
      senha: "senhateste",
    }),
  });
  const master = loginMaster.dados.usuario;
  const gestora = await requisicaoJson("/api/auth/manager", {
    method: "POST",
    headers: cabecalho(master),
    body: JSON.stringify({
      nome: "Gestora Teste",
      email: "gestora-apartamento@example.com",
      confirmarEmail: "gestora-apartamento@example.com",
      telefone: "11988888888",
      cpf: "12345678902",
      senha: "senhateste",
      confirmarSenha: "senhateste",
      permissoes: {
        visualizarApartamentos: true,
        cadastrarApartamentos: true,
      },
      apartamentosAcesso: "selecionados",
      apartamentosPermitidos: ["101"],
      prestadoresAcesso: "todos",
    }),
  });

  assert.equal(gestora.resposta.status, 201, gestora.dados.erro);

  const loginGestora = await requisicaoJson("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: "gestora-apartamento@example.com",
      senha: "senhateste",
    }),
  });
  const usuarioGestora = loginGestora.dados.usuario;
  const estadoGestora = await requisicaoJson(`/api/state?ownerId=${master.ownerId}`, {
    headers: cabecalho(usuarioGestora),
  });

  assert.equal(estadoGestora.resposta.status, 200, estadoGestora.dados.erro);
  assert.deepEqual(
    estadoGestora.dados.apartamentos.map((item) => item.id),
    [101],
  );

  const novoApartamento = apartamento(
    104,
    "Bela Vista",
    "Rua Quatro",
    "404",
    "Condominio Bela",
  );
  const salvar = await requisicaoJson("/api/state", {
    method: "PUT",
    headers: cabecalho(usuarioGestora),
    body: JSON.stringify({
      ownerId: master.ownerId,
      funcionarios: estadoGestora.dados.funcionarios,
      apartamentos: [...estadoGestora.dados.apartamentos, novoApartamento],
      tarefas: estadoGestora.dados.tarefas,
    }),
  });

  assert.equal(salvar.resposta.status, 200, salvar.dados.erro);
  assert.ok(salvar.dados.apartamentos.some((item) => item.id === 104));

  const recarregarMaster = await requisicaoJson(`/api/state?ownerId=${master.ownerId}`, {
    headers: cabecalho(master),
  });
  const apartamentos = recarregarMaster.dados.apartamentos;

  assert.equal(recarregarMaster.resposta.status, 200, recarregarMaster.dados.erro);
  assert.ok(apartamentos.some((item) => item.id === 104));
  assert.equal(apartamentos.filter((item) => item.Bairro === "Bela Vista").length, 3);
  assert.deepEqual(apartamentos.map((item) => item.id), [101, 102, 103, 104]);
});
