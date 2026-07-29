export function normalizarCargoComparacao(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function cargoEhGestora(valor) {
  return ["gestora", "gestao", "gerente"].includes(
    normalizarCargoComparacao(valor),
  );
}

export function cargoEhResponsavelLimpeza(valor) {
  const cargo = normalizarCargoComparacao(valor);
  const cargoLimpezaAntigo = ["fa", "xina"].join("");

  return ["prestador", "prestadores", "limpeza", cargoLimpezaAntigo].includes(
    cargo,
  );
}

export function funcionarioPodeSerResponsavelLimpeza(funcionario) {
  return cargoEhResponsavelLimpeza(funcionario?.cargo);
}

export function obterFuncionariosResponsaveisLimpeza(funcionarios) {
  return (Array.isArray(funcionarios) ? funcionarios : []).filter(
    funcionarioPodeSerResponsavelLimpeza,
  );
}

export function normalizarResponsavelTarefaLimpeza(tarefa, funcionarios) {
  const funcionariosResponsaveis = obterFuncionariosResponsaveisLimpeza(funcionarios);
  const idsResponsaveis = new Set(
    funcionariosResponsaveis.map((funcionario) => String(funcionario.id)),
  );
  const funcionarioIdAtual = String(tarefa?.funcionarioId || "").trim();

  if (funcionarioIdAtual && idsResponsaveis.has(funcionarioIdAtual)) {
    return funcionarioIdAtual;
  }

  if (funcionariosResponsaveis.length === 1) {
    return String(funcionariosResponsaveis[0].id);
  }

  return "";
}

export function normalizarAtribuicoesTarefasLimpeza(tarefas, funcionarios) {
  return (Array.isArray(tarefas) ? tarefas : []).map((tarefa) => {
    const funcionarioId = normalizarResponsavelTarefaLimpeza(tarefa, funcionarios);

    return String(tarefa?.funcionarioId || "") === funcionarioId
      ? tarefa
      : { ...tarefa, funcionarioId };
  });
}
