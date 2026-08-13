import assert from "node:assert/strict";
import test from "node:test";

import {
  cargoEhResponsavelLimpeza,
  escolherResponsavelLimpeza,
  normalizarAtribuicoesTarefasLimpeza,
} from "./cargos.js";

const tarefaSemResponsavel = { id: 10, funcionarioId: "" };

function normalizar(tarefas, funcionarios, apartamentos = []) {
  return normalizarAtribuicoesTarefasLimpeza(
    tarefas,
    funcionarios,
    apartamentos,
  ).map(
    (tarefa) => tarefa.funcionarioId,
  );
}

test("uma unica funcionaria de limpeza recebe tarefas novas e antigas sem responsavel", () => {
  const funcionarios = [{ id: 1, nome: "Ana", cargo: "Limpeza" }];
  const tarefas = [
    { id: 1, origem: "Airbnb iCal", funcionarioId: "" },
    { id: 2, origem: "Manual", funcionarioId: "" },
    { id: 3, origem: "Antiga", funcionarioId: "" },
  ];

  assert.deepEqual(normalizar(tarefas, funcionarios), ["1", "1", "1"]);
});

test("gestora nao entra como responsavel automatico quando ha uma limpeza", () => {
  const funcionarios = [
    { id: 1, nome: "Gestao", cargo: "Gestora" },
    { id: 2, nome: "Bia", cargo: "Prestador" },
  ];

  assert.equal(cargoEhResponsavelLimpeza("Gestora"), false);
  assert.deepEqual(normalizar([tarefaSemResponsavel], funcionarios), ["2"]);
});

test("duas funcionarias de limpeza deixam novas tarefas sem responsavel e preservam escolha manual", () => {
  const funcionarios = [
    { id: 1, nome: "Ana", cargo: "Limpeza" },
    { id: 2, nome: "Bia", cargo: "Prestadores" },
  ];
  const tarefas = [
    { id: 1, funcionarioId: "" },
    { id: 2, funcionarioId: "2" },
  ];

  assert.deepEqual(normalizar(tarefas, funcionarios), ["", "2"]);
});

test("duas funcionarias de limpeza usam bairro quando ha uma unica elegivel", () => {
  const funcionarios = [
    { id: 1, nome: "Debora", cargo: "Limpeza", bairro: "Bela Vista" },
    { id: 2, nome: "Maria", cargo: "Prestador", bairro: "Centro" },
  ];
  const tarefas = [
    { id: 1, apartamentoId: 10, funcionarioId: "", bairroApartamento: "Bela Vista" },
    { id: 2, apartamentoId: 11, funcionarioId: "", bairroApartamento: "Centro" },
  ];

  assert.deepEqual(normalizar(tarefas, funcionarios), ["1", "2"]);
});

test("bairro compara ignorando acento, caixa e espacos extras", () => {
  const funcionarios = [
    { id: 1, nome: "Debora", cargo: "Limpeza", bairro: "BÉLA   VISTA" },
    { id: 2, nome: "Maria", cargo: "Limpeza", bairro: "Centro" },
  ];
  const tarefas = [
    { id: 1, funcionarioId: "", bairroApartamento: "bela vista" },
  ];

  assert.deepEqual(normalizar(tarefas, funcionarios), ["1"]);
});

test("conflito de bairro ou bairro sem prestador deixa tarefa sem responsavel", () => {
  const funcionarios = [
    { id: 1, nome: "Debora", cargo: "Limpeza", bairro: "Bela Vista" },
    { id: 2, nome: "Maria", cargo: "Limpeza", bairro: "Bela Vista" },
    { id: 3, nome: "Joana", cargo: "Prestador", bairro: "" },
  ];
  const tarefas = [
    { id: 1, funcionarioId: "", bairroApartamento: "Bela Vista" },
    { id: 2, funcionarioId: "", bairroApartamento: "Moema" },
  ];

  assert.deepEqual(normalizar(tarefas, funcionarios), ["", ""]);
});

test("prestador sem bairro nao recebe por bairro quando existem varios", () => {
  const funcionarios = [
    { id: 1, nome: "Sem bairro", cargo: "Limpeza", bairro: "" },
    { id: 2, nome: "Maria", cargo: "Limpeza", bairro: "Centro" },
  ];

  assert.deepEqual(
    normalizar([{ id: 1, funcionarioId: "", bairroApartamento: "Moema" }], funcionarios),
    [""],
  );
});

test("prestador padrao do apartamento tem prioridade sobre bairro", () => {
  const funcionarios = [
    { id: 1, nome: "Debora", cargo: "Limpeza", bairro: "Bela Vista" },
    { id: 2, nome: "Maria", cargo: "Limpeza", bairro: "Centro" },
  ];
  const apartamentos = [
    { id: 10, Bairro: "Bela Vista", prestadorResponsavelId: "2" },
  ];
  const tarefas = [
    { id: 1, apartamentoId: 10, funcionarioId: "", bairroApartamento: "Bela Vista" },
  ];

  assert.deepEqual(normalizar(tarefas, funcionarios, apartamentos), ["2"]);
});

test("remover prestador padrao faz apartamento voltar para regra automatica", () => {
  const funcionarios = [
    { id: 1, nome: "Debora", cargo: "Limpeza", bairro: "Bela Vista" },
    { id: 2, nome: "Maria", cargo: "Limpeza", bairro: "Centro" },
  ];
  const tarefas = [
    { id: 1, apartamentoId: 10, funcionarioId: "", bairroApartamento: "Bela Vista" },
  ];

  assert.deepEqual(
    normalizar(tarefas, funcionarios, [{ id: 10, Bairro: "Bela Vista" }]),
    ["1"],
  );
});

test("tarefa manual valida nao e substituida por bairro ou prestador padrao", () => {
  const funcionarios = [
    { id: 1, nome: "Debora", cargo: "Limpeza", bairro: "Bela Vista" },
    { id: 2, nome: "Maria", cargo: "Limpeza", bairro: "Centro" },
  ];
  const apartamentos = [
    { id: 10, Bairro: "Bela Vista", prestadorResponsavelId: "1" },
  ];

  assert.deepEqual(
    normalizar(
      [{ id: 1, apartamentoId: 10, funcionarioId: "2", bairroApartamento: "Bela Vista" }],
      funcionarios,
      apartamentos,
    ),
    ["2"],
  );
});

test("tarefas concluidas preservam historico sem autoatribuicao", () => {
  const funcionarios = [{ id: 1, nome: "Ana", cargo: "Limpeza" }];
  const tarefas = [
    { id: 1, status: "Concluida", funcionarioId: "" },
    { id: 2, status: "Pendente", funcionarioId: "" },
  ];

  assert.deepEqual(normalizar(tarefas, funcionarios), ["", "1"]);
});

test("escolha de nova tarefa ignora responsavel atual quando solicitado", () => {
  const funcionarios = [
    { id: 1, nome: "Debora", cargo: "Limpeza", bairro: "Bela Vista" },
    { id: 2, nome: "Maria", cargo: "Limpeza", bairro: "Centro" },
  ];

  assert.equal(
    escolherResponsavelLimpeza({
      tarefa: { funcionarioId: "1", bairroApartamento: "Centro" },
      funcionarios,
      preservarResponsavelAtual: false,
    }),
    "2",
  );
});

test("sem funcionaria de limpeza a tarefa fica sem responsavel e gestora nao e fallback", () => {
  const funcionarios = [{ id: 1, nome: "Gestao", cargo: "Gestora" }];

  assert.deepEqual(normalizar([tarefaSemResponsavel], funcionarios), [""]);
});

test("responsavel valido nao e substituido quando resta somente uma funcionaria valida", () => {
  const funcionarios = [{ id: 1, nome: "Ana", cargo: "Faxina" }];
  const tarefas = [
    { id: 1, funcionarioId: "1" },
    { id: 2, funcionarioId: "" },
  ];

  assert.deepEqual(normalizar(tarefas, funcionarios), ["1", "1"]);
});

test("segunda funcionaria cadastrada mantem tarefas antigas e novas ficam sem atribuicao automatica", () => {
  const antes = [{ id: 1, nome: "Ana", cargo: "Limpeza" }];
  const depois = [
    ...antes,
    { id: 2, nome: "Bia", cargo: "Prestador" },
  ];
  const tarefasAntigas = normalizarAtribuicoesTarefasLimpeza(
    [{ id: 1, funcionarioId: "" }],
    antes,
  );
  const tarefasComNova = [
    ...tarefasAntigas,
    { id: 2, funcionarioId: "" },
  ];

  assert.deepEqual(normalizar(tarefasComNova, depois), ["1", ""]);
});

test("responsavel que muda para gestora perde vinculo invalido e unica limpeza recebe a tarefa", () => {
  const funcionarios = [
    { id: 1, nome: "Ana", cargo: "Gestora" },
    { id: 2, nome: "Bia", cargo: "Limpeza" },
  ];

  assert.deepEqual(normalizar([{ id: 1, funcionarioId: "1" }], funcionarios), [
    "2",
  ]);
});
