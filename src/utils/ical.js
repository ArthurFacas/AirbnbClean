export function montarUrlIcal(valor) {
  const codigo = String(valor || "").trim();

  if (/^https?:\/\//i.test(codigo)) {
    return codigo;
  }

  return `https://www.airbnb.com/calendar/ical/${codigo}.ics`;
}

function formatarDataCalendario(ano, mes, dia) {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function obterDiasNoMes(ano, mes) {
  return new Date(ano, mes, 0).getDate();
}

function subtrairUmDiaCalendario(data) {
  let ano = Number(data.slice(0, 4));
  let mes = Number(data.slice(5, 7));
  let dia = Number(data.slice(8, 10)) - 1;

  if (dia > 0) {
    return formatarDataCalendario(ano, mes, dia);
  }

  mes -= 1;

  if (mes < 1) {
    mes = 12;
    ano -= 1;
  }

  return formatarDataCalendario(ano, mes, obterDiasNoMes(ano, mes));
}

function normalizarDataIcal(valor) {
  if (!valor) {
    return "";
  }

  const texto = String(valor).trim();

  if (/^\d{8}$/.test(texto)) {
    return formatarDataCalendario(
      texto.slice(0, 4),
      texto.slice(4, 6),
      texto.slice(6, 8),
    );
  }

  if (/^\d{8}T/.test(texto)) {
    return `${texto.slice(0, 4)}-${texto.slice(4, 6)}-${texto.slice(6, 8)}`;
  }

  const data = new Date(texto.replace(/Z$/, "+00:00"));

  if (Number.isNaN(data.getTime())) {
    return "";
  }

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return formatarDataCalendario(ano, mes, dia);
}

function normalizarTextoComparacao(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extrairQuantidadeHospedes(valor) {
  const texto = String(valor || "").replace(/\\n/g, "\n");
  const padroes = [
    /(?:quantidade\s+(?:de\s+)?)?h[oó]spedes?\s*[:=-]\s*(\d+)/i,
    /guests?\s*[:=-]\s*(\d+)/i,
    /(\d+)\s*(?:h[oó]spedes?|guests?)/i,
  ];

  for (const padrao of padroes) {
    const resultado = texto.match(padrao);

    if (resultado?.[1]) {
      return resultado[1];
    }
  }

  return "";
}

function desdobrarLinhasIcal(texto) {
  return texto
    .replace(/\r\n/g, "\n")
    .split("\n")
    .reduce((linhas, linha) => {
      if (/^[ \t]/.test(linha) && linhas.length) {
        linhas[linhas.length - 1] += linha.slice(1);
      } else {
        linhas.push(linha);
      }

      return linhas;
    }, []);
}

function extrairValorIcal(linha) {
  return linha.slice(linha.indexOf(":") + 1).trim();
}

function extrairNomePropriedadeIcal(linha) {
  const fim = linha.search(/[;:]/);

  return (fim >= 0 ? linha.slice(0, fim) : linha).trim().toUpperCase();
}

function definirPropriedadeEvento(evento, linha) {
  const propriedade = extrairNomePropriedadeIcal(linha);
  const valor = extrairValorIcal(linha);

  if (!propriedade) {
    return;
  }

  evento.propriedades[propriedade] = valor;

  if (propriedade === "DTSTART") {
    evento.checkin = normalizarDataIcal(valor);
    evento.dtstartLinha = linha;
  }

  if (propriedade === "DTEND") {
    const checkout = normalizarDataIcal(valor);
    evento.checkout = checkout;
    evento.ultimoDiaOcupado =
      checkout && /VALUE=DATE/i.test(linha)
        ? subtrairUmDiaCalendario(checkout)
        : checkout;
    evento.dtendLinha = linha;
  }

  if (propriedade === "SUMMARY") {
    evento.resumo = valor;
    evento.hospedes = evento.hospedes || extrairQuantidadeHospedes(valor);
  }

  if (propriedade === "DESCRIPTION") {
    evento.descricao = valor;
    evento.hospedes = evento.hospedes || extrairQuantidadeHospedes(valor);
  }

  if (propriedade === "UID") {
    evento.uid = valor;
  }

  if (propriedade === "STATUS") {
    evento.status = valor;
  }
}

export function classificarEventoIcal(evento) {
  const resumo = normalizarTextoComparacao(evento?.resumo);
  const descricao = normalizarTextoComparacao(evento?.descricao);
  const uid = normalizarTextoComparacao(evento?.uid);
  const status = normalizarTextoComparacao(evento?.status);
  const texto = [resumo, descricao, uid].filter(Boolean).join(" ");

  if (!evento?.checkin || !evento?.checkout || status === "cancelled") {
    return "desconhecido";
  }

  if (
    /\b(not available|unavailable|blocked|block|hold|indisponivel|indisponivel|bloqueado|bloqueio)\b/i.test(
      texto,
    )
  ) {
    return "bloqueio";
  }

  if (
    /\b(reserved|reservation|reserva|booked|booking|airbnb)\b/i.test(texto) &&
    !/\b(not available|unavailable|blocked|block|indisponivel|bloqueado|bloqueio)\b/i.test(
      texto,
    )
  ) {
    return "reserva";
  }

  return "desconhecido";
}

function normalizarEventoIcal(evento) {
  const tipo = classificarEventoIcal(evento);

  return {
    ...evento,
    tipo,
    geraLimpeza: tipo === "reserva",
    geraPrioridade: tipo === "reserva",
  };
}

function obterChaveEventoIcal(evento) {
  if (evento.uid) {
    return `uid:${String(evento.uid).trim()}`;
  }

  return [
    String(evento.checkin || "").slice(0, 10),
    String(evento.checkout || "").slice(0, 10),
    String(evento.resumo || "").trim(),
  ].join("|");
}

function deduplicarEventosIcal(eventos) {
  const eventosUnicos = new Map();

  eventos.forEach((evento) => {
    const chave = obterChaveEventoIcal(evento);

    if (!eventosUnicos.has(chave)) {
      eventosUnicos.set(chave, evento);
    }
  });

  return [...eventosUnicos.values()];
}

export function parsearReservasIcal(texto) {
  return parsearTodosEventosIcal(texto).reservasFuturas;
}

export function parsearTodasReservasIcal(texto) {
  return parsearTodosEventosIcal(texto).reservas;
}

function parsearTodosEventosIcal(texto) {
  const linhas = desdobrarLinhasIcal(texto);
  const eventos = [];
  let eventoAtual = null;

  linhas.forEach((linha) => {
    if (linha === "BEGIN:VEVENT") {
      eventoAtual = { propriedades: {} };
      return;
    }

    if (linha === "END:VEVENT") {
      const eventoNormalizado = normalizarEventoIcal(eventoAtual);

      if (eventoNormalizado.checkin && eventoNormalizado.checkout) {
        eventos.push(eventoNormalizado);
      }
      eventoAtual = null;
      return;
    }

    if (!eventoAtual) {
      return;
    }

    definirPropriedadeEvento(eventoAtual, linha);
  });

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  const hojeInput = `${ano}-${mes}-${dia}`;

  const reservas = deduplicarEventosIcal(
    eventos.filter((evento) => evento.geraLimpeza),
  )
    .sort((a, b) => a.checkout.localeCompare(b.checkout));
  const reservasFuturas = reservas
    .filter((evento) => evento.checkout >= hojeInput)
    .sort((a, b) => a.checkout.localeCompare(b.checkout));

  return {
    eventos: eventos.sort((a, b) => a.checkout.localeCompare(b.checkout)),
    reservas,
    reservasFuturas,
  };
}

export async function buscarReservasIcal(codigoIcal) {
  const urlIcal = montarUrlIcal(codigoIcal);
  const urls = [
    `/api/ical?url=${encodeURIComponent(urlIcal)}`,
    urlIcal,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(urlIcal)}`,
    `https://corsproxy.io/?${encodeURIComponent(urlIcal)}`,
  ];

  let ultimoErro = null;

  for (const url of urls) {
    try {
      const resposta = await fetch(url);

      if (!resposta.ok) {
        throw new Error(`HTTP ${resposta.status}`);
      }

      const texto = await resposta.text();
      const calendario = parsearTodosEventosIcal(texto);
      const reservas = calendario.reservasFuturas;

      return {
        urlIcal,
        reservas,
        todasReservas: calendario.reservas,
        proximaReserva: reservas[0] || {},
      };
    } catch (erro) {
      ultimoErro = erro;
    }
  }

  throw ultimoErro || new Error("Nao foi possivel ler o calendario iCal.");
}
