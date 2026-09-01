import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

import { parsearTodasReservasIcal } from "./ical.js";
import {
  obterTarefasCalendarioPrestador,
  obterTarefasPendentesPrestador,
} from "./portalPrestador.js";

let viteServer;
let appModule;
let tarefasModule;
let apartamentosModule;

test.before(async () => {
  viteServer = await createServer({
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  appModule = await viteServer.ssrLoadModule("/src/App.jsx");
  tarefasModule = await viteServer.ssrLoadModule("/src/components/Tarefas.jsx");
  apartamentosModule = await viteServer.ssrLoadModule("/src/utils/apartamentos.js");
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

test("sync preserva pendentes Airbnb iCal antigas dentro de 30 dias sem mover ou duplicar", () => {
  const hoje = "2026-08-10";
  const apartamento = criarApartamento({
    id: 99,
    numero: "901",
    Bairro: "Bela Vista",
    predio: "Predio Sync",
  });
  const funcionarios = [
    { id: "func-1", nome: "Debora", cargo: "Limpeza", bairro: "Bela Vista" },
  ];
  const criarTarefa = ({
    id,
    checkin,
    checkout,
    status = "Pendente",
    uid,
  }) => ({
    id,
    apartamento: apartamento.numero,
    apartamentoId: apartamento.id,
    bairroApartamento: apartamento.Bairro,
    checkin,
    checkout,
    horaCheckout: "11:00",
    status,
    funcionarioId: "func-1",
    origem: "Airbnb iCal",
    icalKey: uid ? `uid:${uid}` : "",
    observacaoPrestador: `Observacao ${id}`,
  });
  const tarefasOriginais = [
    criarTarefa({
      id: 1,
      checkin: "2026-08-07",
      checkout: "2026-08-09",
      uid: "UID-ONTEM",
    }),
    criarTarefa({
      id: 2,
      checkin: "2026-08-01",
      checkout: "2026-08-05",
      uid: "UID-5",
    }),
    criarTarefa({
      id: 3,
      checkin: "2026-07-18",
      checkout: "2026-07-21",
      uid: "UID-20",
    }),
    criarTarefa({
      id: 4,
      checkin: "2026-07-08",
      checkout: "2026-07-11",
      uid: "UID-30",
    }),
    criarTarefa({
      id: 5,
      checkin: "2026-07-07",
      checkout: "2026-07-10",
      uid: "UID-31",
    }),
    criarTarefa({
      id: 6,
      checkin: "2026-08-01",
      checkout: "2026-08-05",
      status: "Concluida",
      uid: "UID-CONCLUIDA",
    }),
    criarTarefa({
      id: 7,
      checkin: "2026-08-06",
      checkout: "2026-08-08",
    }),
  ];
  const reservas = tarefasOriginais.map((tarefa) => ({
    uid: tarefa.icalKey.replace(/^uid:/, ""),
    checkin: tarefa.checkin,
    checkout: tarefa.checkout,
    resumo: "Reserved",
  }));
  const sincronizar = (tarefasAtuais) => {
    const tarefasRecriadas = appModule.montarTarefasIcal(
      apartamento,
      apartamento.id,
      reservas,
      reservas,
      tarefasAtuais,
      funcionarios,
    );

    return appModule.mesclarTarefasIcalApartamento(
      tarefasAtuais,
      apartamento.id,
      reservas,
      tarefasRecriadas,
      hoje,
    );
  };
  let bancoSimulado = tarefasOriginais;

  ["carregamento", "retorno de aba", "foco", "botao manual"].forEach(() => {
    bancoSimulado = sincronizar(bancoSimulado);
    const ids = bancoSimulado.map((tarefa) => tarefa.id);

    assert.deepEqual(ids, [4, 3, 2, 6, 7, 1]);
    assert.equal(new Set(ids).size, ids.length);
    [1, 2, 3, 4, 7].forEach((id) => {
      const original = tarefasOriginais.find((tarefa) => tarefa.id === id);
      const preservada = bancoSimulado.find((tarefa) => tarefa.id === id);

      assert.ok(preservada);
      assert.equal(preservada.checkout, original.checkout);
      assert.equal(preservada.status, original.status);
      assert.equal(preservada.funcionarioId, original.funcionarioId);
      assert.equal(preservada.observacaoPrestador, original.observacaoPrestador);
      assert.equal(preservada.icalKey, original.icalKey);
    });
    assert.ok(bancoSimulado.every((tarefa) => tarefa.id !== 5));
    assert.equal(bancoSimulado.find((tarefa) => tarefa.id === 6)?.status, "Concluida");
  });

  const calendario = tarefasModule.obterTarefasCalendario(bancoSimulado, hoje);

  assert.ok(calendario.some((tarefa) => tarefa.id === 1));
  assert.ok(calendario.some((tarefa) => tarefa.id === 2));
  assert.ok(calendario.some((tarefa) => tarefa.id === 3));
  assert.ok(calendario.some((tarefa) => tarefa.id === 4));
  assert.ok(calendario.some((tarefa) => tarefa.id === 7));
  assert.ok(calendario.every((tarefa) => tarefa.checkout !== hoje || tarefa.id !== 1));
});

test("sync preserva responsavel manual da tarefa mesmo sem bairro do prestador", () => {
  const apartamento = criarApartamento({
    id: 88,
    numero: "808",
    Bairro: "Bela Vista",
    prestadorResponsavelId: "debora",
  });
  const tarefaManual = {
    id: 88001,
    apartamento: apartamento.numero,
    apartamentoId: apartamento.id,
    bairroApartamento: apartamento.Bairro,
    checkin: "2099-10-01",
    checkout: "2099-10-03",
    horaCheckout: "11:00",
    status: "Pendente",
    funcionarioId: "freelancer",
    atribuicaoManual: true,
    origem: "Airbnb iCal",
    icalKey: "uid:MANUAL",
  };
  const reservaAtualizada = {
    uid: "MANUAL",
    checkin: "2099-10-01",
    checkout: "2099-10-05",
    resumo: "Reserved",
  };
  const funcionarios = [
    { id: "debora", nome: "Debora", cargo: "Limpeza", bairro: "Bela Vista" },
    { id: "freelancer", nome: "Freelancer", cargo: "Limpeza", bairro: "" },
  ];
  const tarefasRecriadas = appModule.montarTarefasIcal(
    apartamento,
    apartamento.id,
    [reservaAtualizada],
    [reservaAtualizada],
    [tarefaManual],
    funcionarios,
  );
  const tarefasFinais = appModule.mesclarTarefasIcalApartamento(
    [tarefaManual],
    apartamento.id,
    [reservaAtualizada],
    tarefasRecriadas,
    "2099-10-01",
  );

  assert.equal(tarefasFinais.length, 1);
  assert.equal(tarefasFinais[0].checkout, "2099-10-05");
  assert.equal(tarefasFinais[0].funcionarioId, "freelancer");
  assert.equal(tarefasFinais[0].atribuicaoManual, true);
});

test("cadastro de apartamento mostra erro claro para campo obrigatorio e erro do backend", () => {
  const formularioValido = {
    Bairro: "Bela Vista",
    rua: "Rua Bela",
    numero: "204",
    "nome.do.predio": "Condominio Bela",
    hospedesMaximos: "4",
    ICALL: "https://example.com/calendario.ics",
  };

  assert.equal(
    apartamentosModule.validarFormularioApartamento({
      ...formularioValido,
      Bairro: "",
    }),
    "Informe o bairro do apartamento.",
  );
  assert.equal(
    apartamentosModule.validarFormularioApartamento(formularioValido),
    "",
  );
  assert.equal(
    apartamentosModule.obterMensagemErroCadastroApartamento(
      new Error("Sem permissao para cadastrar apartamentos."),
    ),
    "Sem permissao para cadastrar apartamentos.",
  );
  assert.equal(
    apartamentosModule.obterMensagemErroCadastroApartamento(null),
    "Nao foi possivel salvar o apartamento. Confira os dados e tente novamente.",
  );
});

test("cadastro de apartamento salva antes de sincronizar iCal e retorna aviso se calendario falhar", async () => {
  const estadosSalvos = [];
  const apartamento = {
    Bairro: "Bela Vista",
    rua: "Rua Bela",
    numero: "204",
    "nome.do.predio": "Condominio Bela",
    hospedesMaximos: "4",
    ICALL: "ical-invalido",
  };
  const resultado = await apartamentosModule.salvarApartamentoComSincronizacaoIcal({
    apartamento,
    apartamentoId: 204,
    apartamentos: [],
    funcionarios: [],
    tarefas: [],
    salvarEstadoAtualizado: async (estado) => {
      estadosSalvos.push(JSON.parse(JSON.stringify(estado)));
    },
    buscarReservasIcal: async () => {
      throw new Error("iCal invalido");
    },
    montarTarefasIcal: () => {
      throw new Error("Nao deveria montar tarefas quando o iCal falha.");
    },
  });

  assert.equal(estadosSalvos.length, 1);
  assert.equal(estadosSalvos[0].apartamentos.length, 1);
  assert.equal(estadosSalvos[0].apartamentos[0].id, 204);
  assert.equal(estadosSalvos[0].apartamentos[0].Bairro, "Bela Vista");
  assert.equal(resultado.apartamento.id, 204);
  assert.equal(resultado.apartamentos.length, 1);
  assert.equal(
    resultado.avisoIcal,
    apartamentosModule.obterAvisoFalhaIcalCadastroApartamento(),
  );
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
      checkout: "2026-09-03",
      concluidaEm: "2026-09-03T10:00:00.000Z",
      apartamento: "706",
      predioApartamento: "Zyz Centro",
    },
    {
      id: 2,
      status: "Pendente",
      checkout: "2026-09-04",
      apartamento: "601",
      predioApartamento: "Zyz Centro",
    },
  ];
  const calendario = tarefasModule.obterTarefasCalendario(tarefas, "2026-09-03");
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
      checkout: "2026-09-05",
      apartamento: "101",
      predioApartamento: "Clean Host",
    },
    {
      id: 2,
      status: "Concluida",
      checkout: "2026-09-05",
      concluidaEm: "2026-09-06T09:00:00.000Z",
      apartamento: "102",
      predioApartamento: "Clean Host",
    },
    {
      id: 3,
      status: "Pendente",
      checkout: "2026-08-17",
      apartamento: "103",
      predioApartamento: "Clean Host",
    },
    {
      id: 4,
      status: "Pendente",
      checkout: "2026-08-06",
      apartamento: "104",
      predioApartamento: "Clean Host",
    },
    {
      id: 5,
      status: "Pendente",
      checkout: "2026-09-06",
      apartamento: "105",
      predioApartamento: "Clean Host",
    },
    {
      id: 6,
      status: "Pendente",
      checkout: "2026-09-12",
      apartamento: "106",
      predioApartamento: "Clean Host",
    },
  ];
  const calendario = tarefasModule.obterTarefasCalendario(tarefas, "2026-09-06");
  const idsCalendario = calendario.map((tarefa) => tarefa.id);
  const tarefasOntem = calendario.filter(
    (tarefa) => tarefasModule.obterDataCheckout(tarefa) === "2026-09-05",
  );
  const tarefasHoje = calendario.filter(
    (tarefa) => tarefasModule.obterDataCheckout(tarefa) === "2026-09-06",
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
  assert.equal(calendario.find((tarefa) => tarefa.id === 1)?.checkout, "2026-09-05");
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

test("WhatsApp envia somente 3 tarefas selecionadas entre 7 visiveis", () => {
  const tarefasFiltradas = Array.from({ length: 7 }, (_, indice) => ({
    id: indice + 1,
    apartamento: String(100 + indice + 1),
    predioApartamento: "Clean Host",
    checkout: "2026-08-18",
    status: "Pendente",
  }));
  const selecionadas = [
    tarefasFiltradas[1],
    tarefasFiltradas[3],
    tarefasFiltradas[6],
  ];
  const tarefasWhatsapp = tarefasModule.obterTarefasWhatsappVisiveis(
    tarefasFiltradas,
    selecionadas,
  );
  const mensagem = tarefasModule.montarMensagemWhatsappTarefas(tarefasWhatsapp);

  assert.deepEqual(
    tarefasWhatsapp.map((tarefa) => tarefa.id),
    [2, 4, 7],
  );
  assert.equal(mensagem.match(/\d+\. \*/g)?.length, 3);
  assert.match(mensagem, /Clean Host - 102/);
  assert.match(mensagem, /Clean Host - 104/);
  assert.match(mensagem, /Clean Host - 107/);
  assert.doesNotMatch(mensagem, /Clean Host - 101/);
  assert.doesNotMatch(mensagem, /Clean Host - 103/);
  assert.doesNotMatch(mensagem, /Clean Host - 105/);
  assert.doesNotMatch(mensagem, /Clean Host - 106/);
  assert.deepEqual(
    tarefasModule.obterTarefasWhatsappVisiveis(tarefasFiltradas, selecionadas),
    selecionadas,
  );
});

test("WhatsApp sem tarefas selecionadas nao envia todas silenciosamente", () => {
  const tarefasFiltradas = Array.from({ length: 7 }, (_, indice) => ({
    id: indice + 1,
    apartamento: String(200 + indice + 1),
    predioApartamento: "Clean Host",
    checkout: "2026-08-18",
    status: "Pendente",
  }));
  const tarefasWhatsapp = tarefasModule.obterTarefasWhatsappVisiveis(
    tarefasFiltradas,
    [],
  );

  assert.deepEqual(tarefasWhatsapp, []);
  assert.equal(
    tarefasModule.obterRotuloEnvioWhatsapp([]),
    "Selecione pelo menos uma tarefa para enviar.",
  );
  assert.equal(
    tarefasModule.montarMensagemWhatsappTarefas(tarefasWhatsapp),
    "*LISTA DE TAREFAS - LIMPEZA*\n\nNenhuma tarefa selecionada.",
  );
  assert.doesNotMatch(
    tarefasModule.montarMensagemWhatsappTarefas(tarefasWhatsapp),
    /Clean Host - 20/,
  );
  assert.equal(
    tarefasModule.obterRotuloEnvioWhatsapp([tarefasFiltradas[0]]),
    "Enviar selecionadas no WhatsApp",
  );
});

test("filtro visual por prestador usa funcionarioId e preserva todos quando vazio", () => {
  const idsResponsaveis = new Set(["501", "502"]);
  const tarefas = [
    {
      id: 1,
      status: "Pendente",
      funcionarioId: "501",
      bairroApartamento: "Centro",
      checkout: "2026-09-02",
    },
    {
      id: 2,
      status: "Pendente",
      funcionarioId: "501",
      bairroApartamento: "Sul",
      checkout: "2026-09-02",
    },
    {
      id: 3,
      status: "Pendente",
      funcionarioId: "501",
      bairroApartamento: "Norte",
      checkout: "2026-09-03",
    },
    {
      id: 4,
      status: "Pendente",
      funcionarioId: "502",
      bairroApartamento: "Centro",
      checkout: "2026-09-02",
    },
    {
      id: 5,
      status: "Pendente",
      funcionarioId: "502",
      bairroApartamento: "Sul",
      checkout: "2026-09-03",
    },
  ];

  assert.deepEqual(
    tarefasModule
      .filtrarTarefasPorPrestadorVisual(tarefas, "501", idsResponsaveis)
      .map((tarefa) => tarefa.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    tarefasModule
      .filtrarTarefasPorPrestadorVisual(tarefas, "502", idsResponsaveis)
      .map((tarefa) => tarefa.id),
    [4, 5],
  );
  assert.deepEqual(
    tarefasModule
      .filtrarTarefasPorPrestadorVisual(tarefas, "", idsResponsaveis)
      .map((tarefa) => tarefa.id),
    [1, 2, 3, 4, 5],
  );
});

test("filtro visual sem responsavel inclui somente pendentes sem funcionarioId valido", () => {
  const idsResponsaveis = new Set(["501"]);
  const tarefas = [
    { id: 1, status: "Pendente", funcionarioId: "", checkout: "2026-09-02" },
    { id: 2, status: "Pendente", checkout: "2026-09-02" },
    {
      id: 3,
      status: "Pendente",
      funcionarioId: "administrativo",
      checkout: "2026-09-02",
    },
    {
      id: 4,
      status: "Concluida",
      funcionarioId: "",
      checkout: "2026-09-02",
    },
    {
      id: 5,
      status: "Pendente",
      funcionarioId: "501",
      checkout: "2026-09-02",
    },
  ];

  assert.deepEqual(
    tarefasModule
      .filtrarTarefasPorPrestadorVisual(
        tarefas,
        "sem-responsavel",
        idsResponsaveis,
      )
      .map((tarefa) => tarefa.id),
    [1, 2, 3],
  );
});

test("WhatsApp com filtro por prestador envia somente selecionadas visiveis", () => {
  const idsResponsaveis = new Set(["501", "502"]);
  const tarefasDaData = [
    {
      id: 1,
      status: "Pendente",
      funcionarioId: "501",
      apartamento: "101",
      predioApartamento: "Clean Host",
      checkout: "2026-09-02",
    },
    {
      id: 2,
      status: "Pendente",
      funcionarioId: "501",
      apartamento: "102",
      predioApartamento: "Clean Host",
      checkout: "2026-09-02",
    },
    {
      id: 3,
      status: "Pendente",
      funcionarioId: "501",
      apartamento: "103",
      predioApartamento: "Clean Host",
      checkout: "2026-09-02",
    },
    {
      id: 4,
      status: "Pendente",
      funcionarioId: "502",
      apartamento: "104",
      predioApartamento: "Clean Host",
      checkout: "2026-09-02",
    },
    {
      id: 5,
      status: "Pendente",
      funcionarioId: "502",
      apartamento: "105",
      predioApartamento: "Clean Host",
      checkout: "2026-09-02",
    },
  ];
  const tarefasDebora = tarefasModule.filtrarTarefasPorPrestadorVisual(
    tarefasDaData,
    "501",
    idsResponsaveis,
  );
  const selecionadasVisiveis = tarefasDebora.filter((tarefa) =>
    ["1", "3"].includes(String(tarefa.id)),
  );
  const tarefasWhatsapp = tarefasModule.obterTarefasWhatsappVisiveis(
    tarefasDebora,
    selecionadasVisiveis,
  );
  const mensagem = tarefasModule.montarMensagemWhatsappTarefas(tarefasWhatsapp);

  assert.deepEqual(
    tarefasWhatsapp.map((tarefa) => tarefa.id),
    [1, 3],
  );
  assert.match(mensagem, /Clean Host - 101/);
  assert.match(mensagem, /Clean Host - 103/);
  assert.doesNotMatch(mensagem, /Clean Host - 102/);
  assert.doesNotMatch(mensagem, /Clean Host - 104/);
  assert.doesNotMatch(mensagem, /Clean Host - 105/);
});

test("portal do prestador mostra pendentes antigas do responsavel na data original", () => {
  const tarefas = [
    {
      id: 1,
      status: "Pendente",
      funcionarioId: "501",
      checkout: "2026-08-16",
      apartamento: "101",
    },
    {
      id: 2,
      status: "Pendente",
      funcionarioId: "501",
      checkout: "2026-08-12",
      apartamento: "102",
    },
    {
      id: 3,
      status: "Pendente",
      funcionarioId: "501",
      checkout: "2026-07-28",
      apartamento: "103",
    },
    {
      id: 4,
      status: "Pendente",
      funcionarioId: "501",
      checkout: "2026-07-18",
      apartamento: "104",
    },
    {
      id: 5,
      status: "Pendente",
      funcionarioId: "501",
      checkout: "2026-07-17",
      apartamento: "105",
    },
  ];

  assert.deepEqual(
    obterTarefasPendentesPrestador(tarefas, "501", "2026-08-17").map(
      (tarefa) => [tarefa.id, tarefa.checkout],
    ),
    [
      [4, "2026-07-18"],
      [3, "2026-07-28"],
      [2, "2026-08-12"],
      [1, "2026-08-16"],
    ],
  );
  assert.ok(
    obterTarefasPendentesPrestador(tarefas, "501", "2026-08-17").every(
      (tarefa) => tarefa.checkout !== "2026-08-17",
    ),
  );
});

test("portal do prestador filtra por funcionario_id e ignora bairro ou tarefas sem responsavel", () => {
  const tarefas = [
    {
      id: 1,
      status: "Pendente",
      funcionarioId: "501",
      bairroApartamento: "Centro",
      checkout: "2026-08-16",
      apartamento: "101",
    },
    {
      id: 2,
      status: "Pendente",
      funcionarioId: "502",
      bairroApartamento: "Centro",
      checkout: "2026-08-16",
      apartamento: "102",
    },
    {
      id: 3,
      status: "Pendente",
      funcionarioId: "",
      bairroApartamento: "Centro",
      checkout: "2026-08-16",
      apartamento: "103",
    },
    {
      id: 4,
      status: "Pendente",
      bairroApartamento: "Centro",
      checkout: "2026-08-16",
      apartamento: "104",
    },
  ];

  assert.deepEqual(
    obterTarefasPendentesPrestador(tarefas, "501", "2026-08-17").map(
      (tarefa) => tarefa.id,
    ),
    [1],
  );
  assert.deepEqual(
    obterTarefasCalendarioPrestador(tarefas, "501", "2026-08-17").map(
      (tarefa) => tarefa.id,
    ),
    [1],
  );
});

test("portal do prestador mantem concluida na data original e fora das pendentes", async () => {
  const tarefas = [
    {
      id: 1,
      status: "Concluida",
      funcionarioId: "501",
      checkout: "2026-08-02",
      concluidaEm: "2026-08-17T12:00:00.000Z",
      apartamento: "101",
    },
    {
      id: 2,
      status: "Pendente",
      funcionarioId: "501",
      checkout: "2026-08-16",
      apartamento: "102",
    },
  ];
  const dashboardCssSource = await readFile(
    new URL("../components/Dashboard.css", import.meta.url),
    "utf8",
  );

  assert.deepEqual(
    obterTarefasPendentesPrestador(tarefas, "501", "2026-08-17").map(
      (tarefa) => tarefa.id,
    ),
    [2],
  );
  assert.deepEqual(
    obterTarefasCalendarioPrestador(tarefas, "501", "2026-08-17").map(
      (tarefa) => [tarefa.id, tarefa.checkout, tarefa.status],
    ),
    [
      [1, "2026-08-02", "Concluida"],
      [2, "2026-08-16", "Pendente"],
    ],
  );
  assert.match(
    dashboardCssSource,
    /\.provider-calendar-task-list strong\.completed/,
  );
});

test("portal do prestador preserva pendente antiga apos reload dos mesmos dados", () => {
  const tarefas = [
    {
      id: 1,
      status: "Pendente",
      funcionarioId: "501",
      checkout: "2026-08-16",
      apartamento: "101",
    },
    {
      id: 2,
      status: "Pendente",
      funcionarioId: "501",
      checkout: "2026-07-28",
      apartamento: "102",
    },
  ];
  const antesDoReload = obterTarefasPendentesPrestador(
    tarefas,
    "501",
    "2026-08-17",
  );
  const depoisDoReload = obterTarefasPendentesPrestador(
    JSON.parse(JSON.stringify(tarefas)),
    "501",
    "2026-08-17",
  );

  assert.deepEqual(
    antesDoReload.map((tarefa) => [tarefa.id, tarefa.checkout]),
    [
      [2, "2026-07-28"],
      [1, "2026-08-16"],
    ],
  );
  assert.deepEqual(
    depoisDoReload.map((tarefa) => [tarefa.id, tarefa.checkout]),
    antesDoReload.map((tarefa) => [tarefa.id, tarefa.checkout]),
  );
});

test("sincronizacao automatica usa login e intervalo de 15 minutos sem foco ou troca de aba", async () => {
  const [appSource, dashboardSource, dashboardCssSource, tarefasSource] = await Promise.all([
    readFile(new URL("../App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Dashboard.jsx", import.meta.url), "utf8"),
    readFile(new URL("../components/Dashboard.css", import.meta.url), "utf8"),
    readFile(new URL("../components/Tarefas.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /sincronizarAutomaticamente\(\);/);
  assert.match(appSource, /INTERVALO_SINCRONIZACAO_AUTOMATICA_MS = 15 \* 60 \* 1000/);
  assert.match(appSource, /setInterval\(/);
  assert.match(appSource, /clearInterval\(/);
  assert.match(appSource, /intervaloSincronizacaoRef/);
  assert.match(appSource, /automatico: true/);
  assert.match(appSource, /sincronizacaoIcalEmAndamentoRef\.current/);
  assert.match(appSource, /edicaoLocalPendenteRef/);
  assert.match(appSource, /elementoEditavel\(document\.activeElement\)/);
  assert.doesNotMatch(appSource, /document\.addEventListener\("visibilitychange"/);
  assert.doesNotMatch(appSource, /window\.addEventListener\("focus"/);
  assert.match(dashboardSource, /onClick=\{onAtualizarDados\}/);
  assert.match(dashboardSource, /sync-status-indicator/);
  assert.match(dashboardSource, /Atualizando dados\.\.\./);
  assert.match(dashboardCssSource, /\.sync-status-indicator/);
  assert.match(dashboardCssSource, /@keyframes sync-pulse/);
  assert.match(tarefasSource, /atualizarDadosComBloqueio/);
  assert.doesNotMatch(appSource, /INTERVALO_SINCRONIZACAO_ICAL_MS/);
});
