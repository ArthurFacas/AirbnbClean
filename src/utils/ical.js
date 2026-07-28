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
      eventoAtual = {};
      return;
    }

    if (linha === "END:VEVENT") {
      if (eventoAtual?.checkin && eventoAtual?.checkout) {
        eventos.push(eventoAtual);
      }
      eventoAtual = null;
      return;
    }

    if (!eventoAtual) {
      return;
    }

    if (linha.startsWith("DTSTART")) {
      eventoAtual.checkin = normalizarDataIcal(extrairValorIcal(linha));
    }

    if (linha.startsWith("DTEND")) {
      const checkout = normalizarDataIcal(extrairValorIcal(linha));
      eventoAtual.checkout = checkout && /VALUE=DATE/i.test(linha)
        ? subtrairUmDiaCalendario(checkout)
        : checkout;
    }

    if (linha.startsWith("SUMMARY")) {
      eventoAtual.resumo = extrairValorIcal(linha);
    }
  });

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  const hojeInput = `${ano}-${mes}-${dia}`;

  const reservasFuturas = eventos
    .filter((evento) => evento.checkout >= hojeInput)
    .sort((a, b) => a.checkout.localeCompare(b.checkout));

  return {
    reservas: eventos.sort((a, b) => a.checkout.localeCompare(b.checkout)),
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
