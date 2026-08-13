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

export function normalizarBairroComparacao(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function obterBairrosAtendidos(funcionario) {
  return String(funcionario?.bairro || "")
    .split(/[,;|]/)
    .map(normalizarBairroComparacao)
    .filter(Boolean);
}

function obterPrestadorPorId(funcionariosResponsaveis, funcionarioId) {
  const id = String(funcionarioId || "").trim();

  if (!id) {
    return null;
  }

  return funcionariosResponsaveis.find(
    (funcionario) => String(funcionario.id) === id,
  );
}

export function escolherResponsavelLimpeza({
  tarefa = {},
  apartamento = null,
  funcionarios = [],
  preservarResponsavelAtual = true,
} = {}) {
  const funcionariosResponsaveis = obterFuncionariosResponsaveisLimpeza(funcionarios);
  const funcionarioIdAtual = String(tarefa?.funcionarioId || "").trim();
  const funcionarioAtual = obterPrestadorPorId(
    funcionariosResponsaveis,
    funcionarioIdAtual,
  );

  if (preservarResponsavelAtual && funcionarioAtual) {
    return funcionarioIdAtual;
  }

  const prestadorApartamento = obterPrestadorPorId(
    funcionariosResponsaveis,
    apartamento?.prestadorResponsavelId,
  );

  if (prestadorApartamento) {
    return String(prestadorApartamento.id);
  }

  if (funcionariosResponsaveis.length === 1) {
    return String(funcionariosResponsaveis[0].id);
  }

  const bairroApartamento = normalizarBairroComparacao(
    tarefa?.bairroApartamento || apartamento?.Bairro || apartamento?.bairro,
  );

  if (bairroApartamento && funcionariosResponsaveis.length > 1) {
    const prestadoresDoBairro = funcionariosResponsaveis.filter((funcionario) =>
      obterBairrosAtendidos(funcionario).includes(bairroApartamento),
    );

    if (prestadoresDoBairro.length === 1) {
      return String(prestadoresDoBairro[0].id);
    }
  }

  return "";
}

export function normalizarResponsavelTarefaLimpeza(
  tarefa,
  funcionarios,
  apartamento = null,
  opcoes = {},
) {
  return escolherResponsavelLimpeza({
    tarefa,
    apartamento,
    funcionarios,
    preservarResponsavelAtual: opcoes.preservarResponsavelAtual !== false,
  });
}

export function normalizarAtribuicoesTarefasLimpeza(
  tarefas,
  funcionarios,
  apartamentos = [],
) {
  const apartamentosPorId = new Map(
    (Array.isArray(apartamentos) ? apartamentos : []).map((apartamento) => [
      String(apartamento.id),
      apartamento,
    ]),
  );

  return (Array.isArray(tarefas) ? tarefas : []).map((tarefa) => {
    if (tarefa?.status === "Concluida") {
      return tarefa;
    }

    const apartamento = apartamentosPorId.get(String(tarefa?.apartamentoId));
    const funcionarioId = normalizarResponsavelTarefaLimpeza(
      tarefa,
      funcionarios,
      apartamento,
    );

    return String(tarefa?.funcionarioId || "") === funcionarioId
      ? tarefa
      : { ...tarefa, funcionarioId };
  });
}
