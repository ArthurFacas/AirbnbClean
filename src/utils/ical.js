export function montarUrlIcal(valor) {
  const codigo = String(valor || "").trim();

  if (/^https?:\/\//i.test(codigo)) {
    return codigo;
  }

  return `https://www.airbnb.com/calendar/ical/${codigo}.ics`;
}

function normalizarDataIcal(valor) {
  if (!valor) {
    return "";
  }

  const texto = String(valor).trim();

  if (/^\d{8}$/.test(texto)) {
    return `${texto.slice(0, 4)}-${texto.slice(4, 6)}-${texto.slice(6, 8)}`;
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

  return `${ano}-${mes}-${dia}`;
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
      eventoAtual.checkout = normalizarDataIcal(extrairValorIcal(linha));
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

      if (!reservas.length) {
        throw new Error("Nenhuma reserva futura encontrada no iCal.");
      }

      return {
        urlIcal,
        reservas,
        todasReservas: calendario.reservas,
        proximaReserva: reservas[0],
      };
    } catch (erro) {
      ultimoErro = erro;
    }
  }

  throw ultimoErro || new Error("Nao foi possivel ler o calendario iCal.");
}
