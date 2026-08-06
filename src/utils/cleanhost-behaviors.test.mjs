import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

import { parsearTodasReservasIcal } from "./ical.js";

let viteServer;
let appModule;
let tarefasModule;

test.before(async () => {
  viteServer = await createServer({
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  appModule = await viteServer.ssrLoadModule("/src/App.jsx");
  tarefasModule = await viteServer.ssrLoadModule("/src/components/Tarefas.jsx");
});

test.after(async () => {
  await viteServer?.close();
});

function criarApartamento(campos = {}) {
  return {
    id: 10,
    numero: "706",
    Bairro: "Centro",
    predio: "Zyz Centro",
    hospedesMaximos: "4",
    observacaoEndereco: "Observacao padrao do apto",
    senhaPorta: "1234",
    horaCheckout: "11:00",
    ...campos,
  };
}

test("reserva com mesmo UID e checkout alterado atualiza uma unica tarefa preservando dados manuais e status", () => {
  const apartamento = criarApartamento();
  const tarefaExistente = {
    id: 77,
    apartamento: "706",
    apartamentoId: apartamento.id,
    checkout: "2099-08-03",
    checkin: "2099-08-01",
    funcionarioId: "func-1",
    observacaoPrestador: "Levar roupa de cama extra",
    status: "Concluida",
    concluidaEm: "2099-08-03T15:00:00.000Z",
    origem: "Airbnb iCal",
    icalKey: "uid:ABC",
    hospedes: "2",
  };
  const reservaEstendida = {
    uid: "ABC",
    checkin: "2099-08-01",
    checkout: "2099-08-05",
    resumo: "Reserved",
    hospedes: "3",
  };
  const tarefasRecriadas = appModule.montarTarefasIcal(
    apartamento,
    apartamento.id,
    [reservaEstendida],
    [reservaEstendida],
    [tarefaExistente],
    [],
  );
  const tarefasFinais = appModule.mesclarTarefasIcalApartamento(
    [tarefaExistente],
    apartamento.id,
    [reservaEstendida],
    tarefasRecriadas,
    "2099-08-01",
  );

  assert.equal(tarefasFinais.length, 1);
  assert.equal(tarefasFinais[0].id, tarefaExistente.id);
  assert.equal(tarefasFinais[0].checkout, "2099-08-05");
  assert.notEqual(tarefasFinais[0].checkout, "2099-08-03");
  assert.equal(tarefasFinais[0].funcionarioId, "func-1");
  assert.equal(tarefasFinais[0].observacaoPrestador, "Levar roupa de cama extra");
  assert.equal(tarefasFinais[0].status, "Concluida");
  assert.equal(tarefasFinais[0].concluidaEm, "2099-08-03T15:00:00.000Z");
  assert.equal(tarefasFinais[0].hospedes, "3");
});

test("reserva nova com UID novo cria uma unica tarefa", () => {
  const apartamento = criarApartamento();
  const reservaNova = {
    uid: "UID-NOVO",
    checkin: "2099-09-01",
    checkout: "2099-09-03",
    resumo: "Reserved",
  };
  const tarefas = appModule.montarTarefasIcal(
    apartamento,
    apartamento.id,
    [reservaNova],
    [reservaNova],
    [],
    [],
  );

  assert.equal(tarefas.length, 1);
  assert.equal(tarefas[0].icalKey, "uid:UID-NOVO");
  assert.equal(tarefas[0].checkout, "2099-09-03");
});

test("bloqueio manual do Airbnb nao gera reserva de limpeza", () => {
  const ical = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:BLOQUEIO-1",
    "DTSTART;VALUE=DATE:20990901",
    "DTEND;VALUE=DATE:20990903",
    "SUMMARY:Blocked",
    "DESCRIPTION:unavailable",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");

  assert.deepEqual(parsearTodasReservasIcal(ical), []);
});

test("calendario inclui concluidas recentes, marca visualmente e nao as trata como pendentes", () => {
  const tarefas = [
    {
      id: 1,
      status: "Concluida",
      checkout: "2026-08-03",
      concluidaEm: "2026-08-03T10:00:00.000Z",
      apartamento: "706",
      predioApartamento: "Zyz Centro",
    },
    {
      id: 2,
      status: "Pendente",
      checkout: "2026-08-04",
      apartamento: "601",
      predioApartamento: "Zyz Centro",
    },
  ];
  const calendario = tarefasModule.obterTarefasCalendario(tarefas, "2026-08-03");
  const pendentes = tarefas.filter((tarefa) => tarefa.status === "Pendente");
  const html = renderToStaticMarkup(
    React.createElement(tarefasModule.default, {
      tarefas,
      funcionarios: [],
      onAtribuirFuncionario: () => {},
      onAtualizarDados: () => Promise.resolve(),
      onAtualizarTarefa: () => {},
      sincronizandoIcal: false,
    }),
  );

  assert.ok(calendario.some((tarefa) => tarefa.id === 1));
  assert.ok(pendentes.every((tarefa) => tarefa.id !== 1));
  assert.match(html, /class="completed"/);
  assert.match(html, /Concluida - Zyz Centro - 706/);
});

test("calendario mantem tarefas antigas na data real de checkout sem duplicar ou mover para hoje", () => {
  const tarefas = [
    {
      id: 1,
      status: "Pendente",
      checkout: "2026-08-05",
      apartamento: "101",
      predioApartamento: "Clean Host",
    },
    {
      id: 2,
      status: "Concluida",
      checkout: "2026-08-05",
      concluidaEm: "2026-08-06T09:00:00.000Z",
      apartamento: "102",
      predioApartamento: "Clean Host",
    },
    {
      id: 3,
      status: "Pendente",
      checkout: "2026-07-17",
      apartamento: "103",
      predioApartamento: "Clean Host",
    },
    {
      id: 4,
      status: "Pendente",
      checkout: "2026-07-06",
      apartamento: "104",
      predioApartamento: "Clean Host",
    },
    {
      id: 5,
      status: "Pendente",
      checkout: "2026-08-06",
      apartamento: "105",
      predioApartamento: "Clean Host",
    },
    {
      id: 6,
      status: "Pendente",
      checkout: "2026-08-12",
      apartamento: "106",
      predioApartamento: "Clean Host",
    },
  ];
  const calendario = tarefasModule.obterTarefasCalendario(tarefas, "2026-08-06");
  const idsCalendario = calendario.map((tarefa) => tarefa.id);
  const tarefasOntem = calendario.filter(
    (tarefa) => tarefasModule.obterDataCheckout(tarefa) === "2026-08-05",
  );
  const tarefasHoje = calendario.filter(
    (tarefa) => tarefasModule.obterDataCheckout(tarefa) === "2026-08-06",
  );
  const html = renderToStaticMarkup(
    React.createElement(tarefasModule.default, {
      tarefas,
      funcionarios: [],
      onAtribuirFuncionario: () => {},
      onAtualizarDados: () => Promise.resolve(),
      onAtualizarTarefa: () => {},
      sincronizandoIcal: false,
    }),
  );

  assert.deepEqual(idsCalendario, [3, 1, 2, 5, 6]);
  assert.equal(new Set(idsCalendario).size, idsCalendario.length);
  assert.ok(tarefasOntem.some((tarefa) => tarefa.id === 1));
  assert.ok(tarefasOntem.some((tarefa) => tarefa.id === 2));
  assert.ok(tarefasHoje.every((tarefa) => tarefa.id !== 1));
  assert.ok(tarefasHoje.every((tarefa) => tarefa.id !== 2));
  assert.ok(calendario.some((tarefa) => tarefa.id === 3));
  assert.ok(calendario.every((tarefa) => tarefa.id !== 4));
  assert.equal(calendario.find((tarefa) => tarefa.id === 1)?.checkout, "2026-08-05");
  assert.match(html, /Clean Host - 101/);
  assert.match(html, /class="completed"/);
  assert.match(html, /Concluida - Clean Host - 102/);
});

test("calendario inclui concluida ha 30 dias e exclui concluida ha 31 dias", () => {
  const tarefas = [
    {
      id: 30,
      status: "Concluida",
      checkout: "2026-07-04",
      concluidaEm: "2026-07-04T12:00:00.000Z",
      apartamento: "706",
    },
    {
      id: 31,
      status: "Concluida",
      checkout: "2026-07-03",
      concluidaEm: "2026-07-03T12:00:00.000Z",
      apartamento: "601",
    },
  ];
  const calendario = tarefasModule.obterTarefasCalendario(tarefas, "2026-08-03");

  assert.ok(calendario.some((tarefa) => tarefa.id === 30));
  assert.ok(calendario.every((tarefa) => tarefa.id !== 31));
});

test("mensagem de WhatsApp aplica hospedes, comentarios reais, comentarios tecnicos e prioridade", () => {
  const mensagem = tarefasModule.montarMensagemWhatsappTarefas([
    {
      apartamento: "706",
      predioApartamento: "Zyz Centro",
      checkout: "2026-05-07",
      horaCheckout: "11:00",
      funcionarioId: "func-1",
      responsavel: "Maria",
      hospedes: "3",
      observacaoPrestador: "Levar roupa de cama extra",
      prioridade: false,
    },
    {
      apartamento: "601",
      predioApartamento: "Zyz Centro",
      checkout: "2026-05-08",
      hospedes: "4",
      observacaoPrestador: "",
      descricao: "Reserved",
      prioridade: true,
    },
    {
      apartamento: "602",
      predioApartamento: "Zyz Centro",
      checkout: "2026-05-09",
      descricao: "reservation",
      prioridade: false,
    },
    {
      apartamento: "603",
      predioApartamento: "Zyz Centro",
      checkout: "2026-05-10",
      descricao: " blocked ",
      prioridade: false,
    },
    {
      apartamento: "604",
      predioApartamento: "Zyz Centro",
      checkout: "2026-05-11",
      descricao: "UNAVAILABLE",
      prioridade: false,
    },
  ]);

  assert.match(mensagem, /\*LISTA DE TAREFAS - LIMPEZA\*/);
  assert.match(mensagem, /Quantidade hóspedes: 3/);
  assert.match(mensagem, /Quantidade hóspedes: 4/);
  assert.match(mensagem, /Comentários: Levar roupa de cama extra/);
  assert.doesNotMatch(mensagem, /11:00/);
  assert.doesNotMatch(mensagem, /Maria/);
  assert.doesNotMatch(mensagem, /Sem observ/);
  assert.doesNotMatch(mensagem, /Comentários: Reserved/i);
  assert.doesNotMatch(mensagem, /Comentários: reservation/i);
  assert.doesNotMatch(mensagem, /Comentários: blocked/i);
  assert.doesNotMatch(mensagem, /Comentários: unavailable/i);
  assert.equal(
    mensagem.match(/Prioridade: Check-in e Check-out no mesmo dia/g)?.length,
    1,
  );
});

test("sincronizacao automatica mantem eventos permitidos, bloqueio simultaneo e nao possui intervalo de 5 minutos", async () => {
  const [appSource, dashboardSource, tarefasSource] = await Promise.all([
    readFile(new URL("../App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Dashboard.jsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Tarefas.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /sincronizarAutomaticamente\(\);/);
  assert.match(appSource, /document\.addEventListener\("visibilitychange"/);
  assert.match(appSource, /window\.addEventListener\("focus"/);
  assert.match(appSource, /sincronizacaoIcalEmAndamentoRef\.current/);
  assert.match(dashboardSource, /onClick=\{onAtualizarDados\}/);
  assert.match(tarefasSource, /atualizarDadosComBloqueio/);
  assert.doesNotMatch(appSource, /setInterval/);
  assert.doesNotMatch(appSource, /clearInterval/);
  assert.doesNotMatch(appSource, /INTERVALO_SINCRONIZACAO_ICAL_MS/);
  assert.doesNotMatch(appSource, /5 \* 60 \* 1000/);
});
