export function criarDataCheckout(tarefa) {
  const valor =
    tarefa.checkout ??
    tarefa.dataCheckout ??
    tarefa.end ??
    tarefa.dtend ??
    tarefa.data;

  if (valor instanceof Date) {
    return valor;
  }

  if (!valor) {
    return new Date(NaN);
  }

  const texto = String(valor);

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return new Date(`${texto}T${tarefa.horaCheckout || "00:00"}`);
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(texto)) {
    return new Date(texto);
  }

  return new Date(`${texto.slice(0, 10)}T${tarefa.horaCheckout || "00:00"}`);
}

export function calcularUrgencia(tarefa) {
  if (tarefa?.prioridade) {
    return {
      chave: "vermelha",
      label: "Checkout e check-in no mesmo dia",
      classe: "urgency-red",
    };
  }

  return {
    chave: "verde",
    label: "Sem troca no mesmo dia",
    classe: "urgency-green",
  };
}
