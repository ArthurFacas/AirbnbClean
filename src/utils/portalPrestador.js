function compararTarefas(tarefaA, tarefaB) {
  return String(tarefaA.checkout || "").localeCompare(
    String(tarefaB.checkout || ""),
  );
}

function obterDataCheckout(tarefa) {
  const valor = tarefa.checkout ?? tarefa.dataCheckout ?? tarefa.data;

  if (!valor) {
    return "";
  }

  const texto = String(valor);

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return texto.slice(0, 10);
  }

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? "" : data.toISOString().slice(0, 10);
}

function obterDataLimitePendentes(dataHoje) {
  const hoje = dataHoje ? new Date(`${dataHoje}T00:00:00`) : new Date();

  if (Number.isNaN(hoje.getTime())) {
    return "";
  }

  hoje.setDate(hoje.getDate() - 30);
  return hoje.toISOString().slice(0, 10);
}

export function obterTarefasPendentesPrestador(
  tarefasBase,
  prestadorId,
  dataHoje,
) {
  const dataLimite = obterDataLimitePendentes(dataHoje);
  const prestadorIdNormalizado = String(prestadorId || "").trim();

  if (!prestadorIdNormalizado) {
    return [];
  }

  return tarefasBase
    .filter((tarefa) => {
      const dataCheckout = obterDataCheckout(tarefa);
      const funcionarioId = String(tarefa.funcionarioId || "").trim();

      return (
        funcionarioId &&
        tarefa.status !== "Concluida" &&
        funcionarioId === prestadorIdNormalizado &&
        (!dataCheckout || !dataLimite || dataCheckout >= dataLimite)
      );
    })
    .sort(compararTarefas);
}

export function obterTarefasCalendarioPrestador(
  tarefasBase,
  prestadorId,
  dataHoje,
) {
  const dataLimite = obterDataLimitePendentes(dataHoje);
  const prestadorIdNormalizado = String(prestadorId || "").trim();

  if (!prestadorIdNormalizado) {
    return [];
  }

  return tarefasBase
    .filter((tarefa) => {
      const dataCheckout = obterDataCheckout(tarefa);
      const funcionarioId = String(tarefa.funcionarioId || "").trim();

      return (
        funcionarioId &&
        funcionarioId === prestadorIdNormalizado &&
        Boolean(dataCheckout) &&
        (!dataLimite || dataCheckout >= dataLimite)
      );
    })
    .sort(compararTarefas);
}
