export const camposObrigatoriosApartamento = [
  ["Bairro", "Informe o bairro do apartamento."],
  ["rua", "Informe a rua do apartamento."],
  ["numero", "Informe o numero do apartamento."],
  ["nome.do.predio", "Informe o nome do predio."],
  ["hospedesMaximos", "Informe a quantidade maxima de hospedes."],
  ["ICALL", "Informe o codigo ICALL do Airbnb."],
];

export function validarFormularioApartamento(formulario) {
  const campoInvalido = camposObrigatoriosApartamento.find(
    ([campo]) => !String(formulario[campo] || "").trim(),
  );

  return campoInvalido?.[1] || "";
}

export function obterMensagemErroCadastroApartamento(erro) {
  return (
    erro?.message ||
    "Nao foi possivel salvar o apartamento. Confira os dados e tente novamente."
  );
}

export function obterAvisoFalhaIcalCadastroApartamento() {
  return (
    "Apartamento cadastrado, mas nao foi possivel sincronizar o calendario iCal. " +
    "Confira o link do Airbnb na lista de apartamentos."
  );
}

export async function salvarApartamentoComSincronizacaoIcal({
  apartamento,
  apartamentoId,
  apartamentos,
  funcionarios,
  tarefas,
  salvarEstadoAtualizado,
  buscarReservasIcal,
  montarTarefasIcal,
}) {
  const novoApartamento = {
    ...apartamento,
    id: apartamentoId,
    horaCheckout: apartamento.horaCheckout || "11:00",
  };
  const apartamentosSalvos = [...apartamentos, novoApartamento];

  await salvarEstadoAtualizado({
    funcionarios,
    apartamentos: apartamentosSalvos,
    tarefas,
  });

  if (!apartamento.ICALL) {
    return {
      apartamento: novoApartamento,
      apartamentos: apartamentosSalvos,
      tarefas,
    };
  }

  try {
    const calendario = await buscarReservasIcal(apartamento.ICALL);
    const reservas = calendario?.reservas || [];
    const apartamentoCompleto = {
      ...novoApartamento,
      ICALL: calendario.urlIcal,
      reservas,
      dataReserva: calendario.proximaReserva?.checkin || "",
      checkout: calendario.proximaReserva?.checkout || "",
    };
    const apartamentosAtualizados = apartamentosSalvos.map((item) =>
      String(item.id) === String(apartamentoId) ? apartamentoCompleto : item,
    );
    const tarefasNovas = reservas.length
      ? montarTarefasIcal(
          apartamentoCompleto,
          apartamentoId,
          reservas,
          calendario?.todasReservas || reservas,
          [],
          funcionarios,
        )
      : [];
    const tarefasAtualizadas = reservas.length ? [...tarefas, ...tarefasNovas] : tarefas;

    await salvarEstadoAtualizado({
      funcionarios,
      apartamentos: apartamentosAtualizados,
      tarefas: tarefasAtualizadas,
    });

    return {
      apartamento: apartamentoCompleto,
      apartamentos: apartamentosAtualizados,
      tarefas: tarefasAtualizadas,
    };
  } catch {
    return {
      apartamento: novoApartamento,
      apartamentos: apartamentosSalvos,
      tarefas,
      avisoIcal: obterAvisoFalhaIcalCadastroApartamento(),
    };
  }
}
