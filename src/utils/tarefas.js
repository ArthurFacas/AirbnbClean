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
  const dataCheckout = criarDataCheckout(tarefa);
  const horasAteCheckout =
    (dataCheckout.getTime() - Date.now()) / (1000 * 60 * 60);

  if (Number.isNaN(horasAteCheckout)) {
    return {
      chave: "verde",
      label: "Acima de 24h",
      classe: "urgency-green",
    };
  }

  if (horasAteCheckout <= 12) {
    return {
      chave: "vermelha",
      label: "Menos de 12h",
      classe: "urgency-red",
    };
  }

  if (horasAteCheckout <= 24) {
    return {
      chave: "amarela",
      label: "Menos de 24h",
      classe: "urgency-yellow",
    };
  }

  return {
    chave: "verde",
    label: "Acima de 24h",
    classe: "urgency-green",
  };
}
