import assert from "node:assert/strict";
import test from "node:test";

import {
  cargoEhResponsavelLimpeza,
  normalizarAtribuicoesTarefasLimpeza,
} from "./cargos.js";

const tarefaSemResponsavel = { id: 10, funcionarioId: "" };

function normalizar(tarefas, funcionarios) {
  return normalizarAtribuicoesTarefasLimpeza(tarefas, funcionarios).map(
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
