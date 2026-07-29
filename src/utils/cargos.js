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
