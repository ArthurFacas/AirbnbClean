import { useState } from "react";
import TarefaCard from "./TarefaCard";
import { criarDataCheckout } from "../utils/tarefas";
import { funcionarioPodeSerResponsavelLimpeza } from "../utils/cargos";

function formatarDataCompleta(data) {
  if (!data) {
    return "sem data";
  }

  const dataFormatada = new Date(`${data}T00:00:00`);

  return Number.isNaN(dataFormatada.getTime())
    ? String(data)
    : dataFormatada.toLocaleDateString("pt-BR");
}

function obterDataCheckout(tarefa) {
  const valor =
    tarefa.checkout ??
    tarefa.dataCheckout ??
    tarefa.end ??
    tarefa.dtend ??
    tarefa.data;

  if (!valor) {
    return "";
  }

  if (valor instanceof Date) {
    return valor.toISOString().slice(0, 10);
  }

  const texto = String(valor);

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return texto.slice(0, 10);
  }

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? "" : data.toISOString().slice(0, 10);
}

function obterDataConclusao(tarefa) {
  const valor = tarefa.concluidaEm || tarefa.concluida_em;

  if (!valor) {
    return obterDataCheckout(tarefa);
  }

  const texto = String(valor);

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {
    return texto.slice(0, 10);
  }

  const data = new Date(texto);
  return Number.isNaN(data.getTime())
    ? obterDataCheckout(tarefa)
    : data.toISOString().slice(0, 10);
}

function obterAmanha() {
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);

  const ano = amanha.getFullYear();
  const mes = String(amanha.getMonth() + 1).padStart(2, "0");
  const dia = String(amanha.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function obterHojeInput() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function formatarDataInput(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function alterarDiaInput(dataInput, deslocamento) {
  const dataBase = dataInput
    ? new Date(`${dataInput}T00:00:00`)
    : new Date(`${obterHojeInput()}T00:00:00`);

  if (Number.isNaN(dataBase.getTime())) {
    return obterHojeInput();
  }

  dataBase.setDate(dataBase.getDate() + deslocamento);

  return formatarDataInput(dataBase);
}

function obterDataLimiteCalendario(dataHoje) {
  const limite = new Date(`${dataHoje}T00:00:00`);
  limite.setDate(limite.getDate() - 30);

  return formatarDataInput(limite);
}

function obterMesInput(data) {
  const dataBase = data ? new Date(`${data}T00:00:00`) : new Date();

  if (Number.isNaN(dataBase.getTime())) {
    return obterHojeInput().slice(0, 7);
  }

  const ano = dataBase.getFullYear();
  const mes = String(dataBase.getMonth() + 1).padStart(2, "0");

  return `${ano}-${mes}`;
}

function formatarMes(dataMes) {
  const data = new Date(`${dataMes}-01T00:00:00`);

  return data.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function alterarMesInput(dataMes, deslocamento) {
  const data = new Date(`${dataMes}-01T00:00:00`);

  if (Number.isNaN(data.getTime())) {
    return obterMesInput(obterHojeInput());
  }

  data.setMonth(data.getMonth() + deslocamento);

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");

  return `${ano}-${mes}`;
}

function montarDiasDoMes(dataMes, tarefasPendentes, obterData = obterDataCheckout) {
  const [ano, mes] = dataMes.split("-").map(Number);
  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0);
  const diasAntes = primeiroDia.getDay();
  const totalDias = ultimoDia.getDate();
  const tarefasPorData = tarefasPendentes.reduce((mapa, tarefa) => {
    const data = obterData(tarefa);

    if (!mapa[data]) {
      mapa[data] = [];
    }

    mapa[data].push(tarefa);
    return mapa;
  }, {});
  const dias = [];

  for (let index = 0; index < diasAntes; index += 1) {
    dias.push(null);
  }

  for (let dia = 1; dia <= totalDias; dia += 1) {
    const data = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(
      2,
      "0",
    )}`;

    dias.push({
      data,
      dia,
      tarefas: tarefasPorData[data] || [],
    });
  }

  return dias;
}

function compararTarefasPorCheckout(tarefaA, tarefaB) {
  const dataA = criarDataCheckout(tarefaA).getTime();
  const dataB = criarDataCheckout(tarefaB).getTime();
  const valorA = Number.isNaN(dataA) ? Number.MAX_SAFE_INTEGER : dataA;
  const valorB = Number.isNaN(dataB) ? Number.MAX_SAFE_INTEGER : dataB;

  if (valorA !== valorB) {
    return valorA - valorB;
  }

  return String(tarefaA.apartamento || "").localeCompare(
    String(tarefaB.apartamento || ""),
    "pt-BR",
    { numeric: true },
  );
}

function obterRotuloTarefaCalendario(tarefa) {
  const predio = String(tarefa.predioApartamento || "").trim();
  const apartamento = String(tarefa.apartamento || "").trim();

  if (predio && apartamento) {
    return `${predio} - ${apartamento}`;
  }

  return predio || apartamento || "Apartamento";
}

function normalizarBusca(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function tarefaCombinaComBusca(tarefa, busca) {
  const termo = normalizarBusca(busca);

  if (!termo) {
    return true;
  }

  const predio = String(tarefa.predioApartamento || "").trim();
  const apartamento = String(tarefa.apartamento || "").trim();
  const camposBusca = [
    predio,
    apartamento,
    `${predio}${apartamento}`,
    `${predio}apt${apartamento}`,
    obterRotuloTarefaCalendario(tarefa),
  ];

  return camposBusca.some((campo) => normalizarBusca(campo).includes(termo));
}

function obterComentarioWhatsapp(tarefa) {
  return (
    String(tarefa.observacaoPrestador || tarefa.comentarios || tarefa.descricao || "")
      .trim() || "Sem observacoes"
  );
}

function montarMensagemWhatsappTarefas(tarefasSelecionadas) {
  return [
    "🧹 *LISTA DE TAREFAS - LIMPEZA*",
    "",
    tarefasSelecionadas.length
      ? tarefasSelecionadas
          .map((tarefa, index) => {
            const linhas = [
              `${index + 1}. *${obterRotuloTarefaCalendario(tarefa)}*`,
              `📅 Data: ${formatarDataCompleta(obterDataCheckout(tarefa))}`,
            ];

            if (tarefa.prioridade) {
              linhas.push(
                "⚠️ Prioridade: Check-in e Check-out no mesmo dia",
              );
            }

            linhas.push(`📝 Comentários: ${obterComentarioWhatsapp(tarefa)}`);

            return linhas.join("\n");
          })
          .join("\n\n")
      : "Nenhuma tarefa selecionada.",
  ].join("\n");
}

function montarLinkWhatsapp(tarefasSelecionadas) {
  return `https://wa.me/?text=${encodeURIComponent(
    montarMensagemWhatsappTarefas(tarefasSelecionadas),
  )}`;
}

function encontrarFuncionario(funcionarios, funcionarioId) {
  return funcionarios.find(
    (funcionario) => String(funcionario.id) === String(funcionarioId),
  );
}

function Tarefas({
  tarefas,
  funcionarios,
  onAtribuirFuncionario,
  onAtualizarDados,
  onAtualizarTarefa,
}) {
  const [visualizacao, setVisualizacao] = useState("calendario");
  const [prestadorSelecionado, setPrestadorSelecionado] = useState("");
  const [dataSelecionada, setDataSelecionada] = useState("");
  const [dataAbertaPeloCalendario, setDataAbertaPeloCalendario] =
    useState(false);
  const [atualizandoDados, setAtualizandoDados] = useState(false);
  const [mesCalendario, setMesCalendario] = useState(() =>
    obterMesInput(obterHojeInput()),
  );
  const [mesFiltroData, setMesFiltroData] = useState(() =>
    obterMesInput(obterHojeInput()),
  );
  const [mesRetornoCalendario, setMesRetornoCalendario] = useState(() =>
    obterMesInput(obterHojeInput()),
  );
  const [dataConcluidaSelecionada, setDataConcluidaSelecionada] = useState("");
  const [dataInicioPeriodo, setDataInicioPeriodo] = useState("");
  const [dataFimPeriodo, setDataFimPeriodo] = useState("");
  const [dataInicioFiltro, setDataInicioFiltro] = useState("");
  const [dataFimFiltro, setDataFimFiltro] = useState("");
  const [buscaApartamento, setBuscaApartamento] = useState("");
  const [diasCalendarioExpandidos, setDiasCalendarioExpandidos] = useState({});
  const dataAmanha = obterAmanha();
  const dataHoje = obterHojeInput();
  const funcionariosResponsaveis = funcionarios.filter(
    funcionarioPodeSerResponsavelLimpeza,
  );
  const idsFuncionariosResponsaveis = new Set(
    funcionariosResponsaveis.map((funcionario) => String(funcionario.id)),
  );
  const tarefasPendentes = tarefas
    .filter(
      (tarefa) =>
        tarefa.status === "Pendente" &&
        (!obterDataCheckout(tarefa) || obterDataCheckout(tarefa) >= dataHoje),
    )
    .filter((tarefa) => tarefaCombinaComBusca(tarefa, buscaApartamento))
    .sort(compararTarefasPorCheckout);
  const dataLimiteCalendario = obterDataLimiteCalendario(dataHoje);
  const tarefasPendentesCalendario = tarefas
    .filter((tarefa) => {
      const dataCheckout = obterDataCheckout(tarefa);

      return (
        tarefa.status === "Pendente" &&
        (!dataCheckout || dataCheckout >= dataLimiteCalendario)
      );
    })
    .filter((tarefa) => tarefaCombinaComBusca(tarefa, buscaApartamento))
    .sort(compararTarefasPorCheckout);
  const tarefasConcluidas = tarefas
    .filter((tarefa) => tarefa.status === "Concluida")
    .sort(compararTarefasPorCheckout);
  const tarefasAmanhaTotal = tarefasPendentes.filter(
    (tarefa) => obterDataCheckout(tarefa) === dataAmanha,
  ).length;
  const tarefasSemResponsavel = tarefasPendentes.filter(
    (tarefa) => !tarefa.funcionarioId,
  ).length;
  const tarefasPrioritarias = tarefasPendentes.filter(
    (tarefa) => tarefa.prioridade,
  ).length;
  const diasDoCalendario = montarDiasDoMes(
    mesCalendario,
    tarefasPendentesCalendario,
  );
  const diasDoFiltroData = montarDiasDoMes(
    mesFiltroData,
    tarefasPendentesCalendario,
  );
  const tarefasDaDataSelecionada = dataSelecionada
    ? tarefasPendentesCalendario.filter(
        (tarefa) => obterDataCheckout(tarefa) === dataSelecionada,
      )
    : [];
  const tarefasDoPeriodoSelecionado = tarefasPendentesCalendario.filter((tarefa) => {
    const dataCheckout = obterDataCheckout(tarefa);

    if (!dataCheckout) {
      return false;
    }

    if (!dataInicioPeriodo) {
      return false;
    }

    if (!dataFimPeriodo) {
      return dataCheckout === dataInicioPeriodo;
    }

    if (dataCheckout < dataInicioPeriodo) {
      return false;
    }

    if (dataCheckout > dataFimPeriodo) {
      return false;
    }

    return true;
  });
  const tarefasConcluidasDaDataSelecionada = dataConcluidaSelecionada
    ? tarefasConcluidas.filter(
        (tarefa) => obterDataConclusao(tarefa) === dataConcluidaSelecionada,
      )
    : [];
  const tarefasFiltroDataVisiveis = dataSelecionada
    ? tarefasDaDataSelecionada
    : tarefasDoPeriodoSelecionado;
  const tituloPeriodoWhatsapp = dataSelecionada
    ? `de ${formatarDataCompleta(dataSelecionada)}`
    : dataInicioPeriodo && dataFimPeriodo
      ? `de ${formatarDataCompleta(dataInicioPeriodo)} ate ${formatarDataCompleta(
          dataFimPeriodo,
        )}`
      : dataInicioPeriodo
        ? `de ${formatarDataCompleta(dataInicioPeriodo)}`
        : "filtradas";
  const linkWhatsappFiltroData = tarefasFiltroDataVisiveis.length
    ? montarLinkWhatsapp(tarefasFiltroDataVisiveis)
    : "";
  const gruposPrestadoresBase = [
    ...funcionariosResponsaveis.map((funcionario) => ({
      tipo: "funcionario",
      funcionario,
      titulo: funcionario.nome,
      subtitulo: funcionario.bairro
        ? `${funcionario.cargo} - ${funcionario.bairro}`
        : funcionario.cargo,
      tarefas: tarefasPendentes.filter(
        (tarefa) => String(tarefa.funcionarioId) === String(funcionario.id),
      ),
    })),
    {
      tipo: "sem-responsavel",
      funcionario: null,
      titulo: "Sem responsavel",
      subtitulo: "Tarefas aguardando atribuicao",
      tarefas: tarefasPendentes.filter(
        (tarefa) =>
          !tarefa.funcionarioId ||
          !idsFuncionariosResponsaveis.has(String(tarefa.funcionarioId)),
      ),
    },
  ];
  const gruposPrestadores = gruposPrestadoresBase.filter(
    (grupo) => grupo.tarefas.length || grupo.tipo === "sem-responsavel",
  );
  const gruposPrestadoresVisiveis = gruposPrestadores.filter(
    (grupo) =>
      String(grupo.funcionario?.id || grupo.tipo) === prestadorSelecionado,
  );

  function abrirDataDoCalendario(data) {
    setMesRetornoCalendario(mesCalendario);
    setDataSelecionada(data);
    setDataAbertaPeloCalendario(true);
    setVisualizacao("data");
  }

  function navegarDiaSelecionado(deslocamento) {
    const proximaData = alterarDiaInput(
      dataSelecionada || dataInicioPeriodo || dataHoje,
      deslocamento,
    );

    setDataSelecionada(proximaData);
    setDataInicioPeriodo(proximaData);
    setDataFimPeriodo("");
    setDataInicioFiltro(proximaData);
    setDataFimFiltro("");
    setMesFiltroData(obterMesInput(proximaData));
    setVisualizacao("data");
  }

  function alternarDiaCalendarioExpandido(data) {
    setDiasCalendarioExpandidos((diasAtuais) => ({
      ...diasAtuais,
      [data]: !diasAtuais[data],
    }));
  }

  function voltarParaCalendario() {
    setMesCalendario(mesRetornoCalendario);
    setDataAbertaPeloCalendario(false);
    setVisualizacao("calendario");
  }

  function selecionarDataNoFiltro(data) {
    if (dataInicioFiltro && !dataFimFiltro && data > dataInicioFiltro) {
      setDataFimFiltro(data);
      return;
    }

    setDataInicioFiltro(data);
    setDataFimFiltro("");
  }

  function aplicarFiltroData() {
    if (!dataInicioFiltro) {
      return;
    }

    setDataInicioPeriodo(dataInicioFiltro);
    setDataFimPeriodo(dataFimFiltro);
    setDataSelecionada(dataFimFiltro ? "" : dataInicioFiltro);
  }

  function obterClasseDiaFiltro(dia) {
    if (!dia) {
      return "";
    }

    const selecionado =
      dia.data === dataInicioFiltro || dia.data === dataFimFiltro;
    const noIntervalo =
      dataInicioFiltro &&
      dataFimFiltro &&
      dia.data > dataInicioFiltro &&
      dia.data < dataFimFiltro;

    return `${selecionado ? "active" : ""} ${noIntervalo ? "in-range" : ""}`;
  }

  async function atualizarDadosComBloqueio() {
    if (atualizandoDados) {
      return;
    }

    setAtualizandoDados(true);

    try {
      await onAtualizarDados();
    } finally {
      setAtualizandoDados(false);
    }
  }

  return (
    <div className="content-page tasks-page">
      <div className="view-switcher" aria-label="Visualizacao das tarefas">
        <button
          type="button"
          className={visualizacao === "calendario" ? "active" : ""}
          onClick={() => setVisualizacao("calendario")}
        >
          Calendario
        </button>
        <button
          type="button"
          className={visualizacao === "lista" ? "active" : ""}
          onClick={() => setVisualizacao("lista")}
        >
          Lista
        </button>
        <button
          type="button"
          className={visualizacao === "data" ? "active" : ""}
          onClick={() => {
            setDataAbertaPeloCalendario(false);
            setVisualizacao("data");
          }}
        >
          Por data
        </button>
        <button
          type="button"
          className={visualizacao === "prestador" ? "active" : ""}
          onClick={() => setVisualizacao("prestador")}
        >
          Por prestador de servico
        </button>
        <button
          type="button"
          className={visualizacao === "concluidas" ? "active" : ""}
          onClick={() => setVisualizacao("concluidas")}
        >
          Concluidas
        </button>
      </div>

      <div className="task-results-bar">
        <div>
          <strong>{tarefasPendentes.length} tarefa(s)</strong>
          <span>
            {buscaApartamento
              ? `Filtrando por ${buscaApartamento}`
              : "Exibindo checkouts pendentes"}
          </span>
        </div>
        <div className="task-results-tags">
          <label className="task-search-control">
            <span>Buscar apt</span>
            <input
              type="search"
              value={buscaApartamento}
              onChange={(event) => setBuscaApartamento(event.target.value)}
              placeholder="Ex: aquarela-211"
            />
          </label>
          <span>{tarefasSemResponsavel} sem responsavel</span>
          <span>{tarefasPrioritarias} prioridade</span>
          <span>{tarefasAmanhaTotal} para amanha</span>
          <button
            className="task-refresh-button"
            type="button"
            disabled={atualizandoDados}
            onClick={() => {
              atualizarDadosComBloqueio().catch((erro) => {
                window.alert(erro.message || "Nao foi possivel atualizar.");
              });
            }}
          >
            {atualizandoDados ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {visualizacao === "calendario" && (
        <div className="monthly-calendar">
          <div className="monthly-calendar-header">
            <strong>{formatarMes(mesCalendario)}</strong>
            <div className="calendar-header-controls">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() =>
                  setMesCalendario((mesAtual) => alterarMesInput(mesAtual, -1))
                }
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setMesCalendario(obterMesInput(obterHojeInput()))}
              >
                Hoje
              </button>
              <button
                type="button"
                aria-label="Proximo mes"
                onClick={() =>
                  setMesCalendario((mesAtual) => alterarMesInput(mesAtual, 1))
                }
              >
                ›
              </button>
              <input
                type="month"
                value={mesCalendario}
                onChange={(event) => setMesCalendario(event.target.value)}
                aria-label="Escolher mes"
              />
            </div>
          </div>

          <div className="calendar-weekdays">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((dia) => (
              <span key={dia}>{dia}</span>
            ))}
          </div>

          <div className="calendar-month-grid">
            {diasDoCalendario.map((dia, index) =>
              dia ? (
                <div
                  key={dia.data}
                  role="button"
                  tabIndex={0}
                  className={`calendar-month-day ${
                    dia.tarefas.length ? "has-tasks" : ""
                  } ${dia.data < dataHoje ? "past-day" : ""} ${
                    dia.data === dataHoje ? "today" : ""
                  }`}
                  onClick={() => abrirDataDoCalendario(dia.data)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      abrirDataDoCalendario(dia.data);
                    }
                  }}
                >
                  <span>{dia.dia}</span>
                  <div>
                    {(diasCalendarioExpandidos[dia.data]
                      ? dia.tarefas
                      : dia.tarefas.slice(0, 3)
                    ).map((tarefa) => (
                      <strong
                        key={tarefa.id}
                        className={tarefa.prioridade ? "priority" : ""}
                        title={obterRotuloTarefaCalendario(tarefa)}
                      >
                        {obterRotuloTarefaCalendario(tarefa)}
                      </strong>
                    ))}
                    {dia.tarefas.length > 3 && (
                      <button
                        className="calendar-more-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          alternarDiaCalendarioExpandido(dia.data);
                        }}
                      >
                        {diasCalendarioExpandidos[dia.data]
                          ? "Recolher"
                          : `+ ${dia.tarefas.length - 3} mais`}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="calendar-month-day empty"
                  key={`empty-${index}`}
                />
              ),
            )}
          </div>
        </div>
      )}

      {visualizacao === "lista" && (
        <div className="list-grid">
          {tarefasPendentes.map((tarefa) => (
            <TarefaCard
              key={tarefa.id}
              funcionarios={funcionariosResponsaveis}
              onAtribuirFuncionario={onAtribuirFuncionario}
              onAtualizarTarefa={onAtualizarTarefa}
              selectId={`lista-funcionario-${tarefa.id}`}
              tarefa={tarefa}
            />
          ))}
        </div>
      )}

      {visualizacao === "data" && (
        <div className="date-view-panel">
          {dataAbertaPeloCalendario ? (
            <div className="date-back-row">
              <button
                className="back-to-calendar"
                type="button"
                onClick={voltarParaCalendario}
              >
                Voltar para calendario
              </button>
            </div>
          ) : (
            <div className="date-filter-toolbar">
              <div className="date-filter-status">
                <strong>
                  {dataInicioPeriodo
                    ? dataFimPeriodo
                      ? `${formatarDataCompleta(
                          dataInicioPeriodo,
                        )} ate ${formatarDataCompleta(dataFimPeriodo)}`
                      : formatarDataCompleta(dataInicioPeriodo)
                    : "Selecione uma data"}
                </strong>
                <span>
                  {dataInicioFiltro
                    ? dataFimFiltro
                      ? "Intervalo pronto para ver"
                      : "Dia selecionado"
                    : "Clique em um dia ou em duas datas para intervalo"}
                </span>
              </div>

              <div className="date-filter-calendar">
                <div className="date-filter-calendar-header">
                <strong>{formatarMes(mesFiltroData)}</strong>
                <input
                  type="month"
                  value={mesFiltroData}
                  onChange={(event) => setMesFiltroData(event.target.value)}
                  aria-label="Escolher mes do filtro"
                />
              </div>

              <div className="date-filter-weekdays">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((dia) => (
                  <span key={dia}>{dia}</span>
                ))}
              </div>

              <div className="date-filter-grid">
                {diasDoFiltroData.map((dia, index) =>
                  dia ? (
                    <button
                      key={dia.data}
                      type="button"
                      className={`date-filter-day ${
                        dia.tarefas.length ? "has-tasks" : ""
                      } ${dia.data < dataHoje ? "past-day" : ""} ${
                        dia.data === dataHoje ? "today" : ""
                      } ${obterClasseDiaFiltro(dia)}`}
                      onClick={() => selecionarDataNoFiltro(dia.data)}
                    >
                      <span>{dia.dia}</span>
                      {dia.tarefas.length > 0 && <small>{dia.tarefas.length}</small>}
                    </button>
                  ) : (
                    <div
                      className="date-filter-day empty"
                      key={`filter-empty-${index}`}
                    />
                  ),
                )}
              </div>

                <button
                  className="primary-action date-filter-apply"
                  type="button"
                  disabled={!dataInicioFiltro}
                  onClick={aplicarFiltroData}
                >
                  Ver
                </button>
              </div>
            </div>
          )}

          {dataSelecionada && (
            <div className="date-navigation-row">
              <button
                type="button"
                aria-label="Dia anterior"
                onClick={() => navegarDiaSelecionado(-1)}
              >
                â€¹
              </button>
              <strong>{formatarDataCompleta(dataSelecionada)}</strong>
              <button
                type="button"
                aria-label="Dia seguinte"
                onClick={() => navegarDiaSelecionado(1)}
              >
                â€º
              </button>
            </div>
          )}

          {dataSelecionada || dataInicioPeriodo ? (
            (dataSelecionada
              ? tarefasDaDataSelecionada
              : tarefasDoPeriodoSelecionado
            ).length ? (
              <>
                {linkWhatsappFiltroData && (
                  <div className="date-whatsapp-panel">
                    <div className="whatsapp-task-box compact">
                      <div>
                        <strong>Lista de tarefas</strong>
                        <p>
                          {tarefasFiltroDataVisiveis.length} tarefa(s){" "}
                          {tituloPeriodoWhatsapp}.
                        </p>
                      </div>
                      <a
                        href={linkWhatsappFiltroData}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Enviar no WhatsApp
                      </a>
                    </div>
                  </div>
                )}

                <div className="list-grid">
                  {(dataSelecionada
                    ? tarefasDaDataSelecionada
                    : tarefasDoPeriodoSelecionado
                  ).map((tarefa) => (
                    <TarefaCard
                      key={tarefa.id}
                      funcionarios={funcionariosResponsaveis}
                      onAtribuirFuncionario={onAtribuirFuncionario}
                      onAtualizarTarefa={onAtualizarTarefa}
                      selectId={`data-funcionario-${tarefa.id}`}
                      tarefa={tarefa}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                Nenhuma tarefa pendente nessa data.
              </div>
            )
          ) : (
            <div className="empty-state">
              Selecione uma data para ver os checkouts.
            </div>
          )}
        </div>
      )}

      {visualizacao === "prestador" && (
        <div className="employee-task-board">
          <div className="provider-picker">
            <span>Prestador</span>
            <div>
              {gruposPrestadores.map((grupo) => (
                <button
                  key={grupo.funcionario?.id || grupo.tipo}
                  type="button"
                  className={
                    prestadorSelecionado ===
                    String(grupo.funcionario?.id || grupo.tipo)
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    setPrestadorSelecionado(
                      String(grupo.funcionario?.id || grupo.tipo),
                    )
                  }
                >
                  {grupo.titulo}
                  <strong>{grupo.tarefas.length}</strong>
                </button>
              ))}
            </div>
          </div>

          {!prestadorSelecionado && (
            <div className="empty-state">
              Escolha um prestador para ver somente as tarefas dele.
            </div>
          )}

          {prestadorSelecionado && gruposPrestadoresVisiveis.length === 0 && (
            <div className="empty-state">
              Nenhuma tarefa pendente para este prestador.
            </div>
          )}

          {gruposPrestadoresVisiveis.map((grupo) => {
            const tarefasAmanhaFuncionario = grupo.funcionario
              ? grupo.tarefas.filter(
                  (tarefa) => obterDataCheckout(tarefa) === dataAmanha,
                )
              : [];
            const linkWhatsapp =
              grupo.funcionario && tarefasAmanhaFuncionario.length
                ? montarLinkWhatsapp(tarefasAmanhaFuncionario)
                : "";

            return (
              <section className="employee-task-section" key={grupo.titulo}>
                <div className="employee-task-header">
                  <div>
                    <h2>{grupo.titulo}</h2>
                    <p>{grupo.subtitulo}</p>
                  </div>
                  <strong>{grupo.tarefas.length} tarefa(s)</strong>
                </div>

                {grupo.funcionario && (
                  <div className="whatsapp-task-box compact">
                    <div>
                      <strong>Tarefas de amanha</strong>
                      <p>
                        {tarefasAmanhaFuncionario.length} tarefa(s) para{" "}
                        {formatarDataCompleta(dataAmanha)}.
                      </p>
                    </div>
                    {linkWhatsapp ? (
                      <a
                        href={linkWhatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Enviar no WhatsApp
                      </a>
                    ) : (
                      <button type="button" disabled>
                        Nada para enviar
                      </button>
                    )}
                  </div>
                )}

                <div className="list-grid">
                  {grupo.tarefas.map((tarefa) => (
                    <TarefaCard
                      key={tarefa.id}
                      funcionarios={funcionariosResponsaveis}
                      onAtribuirFuncionario={onAtribuirFuncionario}
                      onAtualizarTarefa={onAtualizarTarefa}
                      selectId={`prestador-funcionario-${tarefa.id}`}
                      tarefa={tarefa}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {visualizacao === "concluidas" && (
        <div className="completed-task-board">
          <div className="provider-section-title">
            <h2>Tarefas concluidas</h2>
            <strong>{tarefasConcluidas.length}</strong>
          </div>

          <div className="provider-calendar-panel completed-calendar-panel compact-filter">
            <div className="provider-calendar-header">
              <strong>
                {dataConcluidaSelecionada
                  ? formatarDataCompleta(dataConcluidaSelecionada)
                  : "Todas as concluidas"}
              </strong>
              <input
                aria-label="Filtrar concluidas por data"
                type="date"
                value={dataConcluidaSelecionada}
                onChange={(event) =>
                  setDataConcluidaSelecionada(event.target.value)
                }
              />
            </div>
            <div className="provider-calendar-results">
              <div className="provider-calendar-results-header">
                <strong>
                  {dataConcluidaSelecionada
                    ? formatarDataCompleta(dataConcluidaSelecionada)
                    : "Lista em ordem normal"}
                </strong>
                <span>
                  {(dataConcluidaSelecionada
                    ? tarefasConcluidasDaDataSelecionada
                    : tarefasConcluidas
                  ).length} tarefa(s)
                </span>
              </div>

              {(dataConcluidaSelecionada
                ? tarefasConcluidasDaDataSelecionada
                : tarefasConcluidas
              ).length ? (
                <div className="list-grid">
                  {(dataConcluidaSelecionada
                    ? tarefasConcluidasDaDataSelecionada
                    : tarefasConcluidas
                  ).map((tarefa) => {
                    const responsavel = encontrarFuncionario(
                      funcionariosResponsaveis,
                      tarefa.funcionarioId,
                    );

                    return (
                      <div
                        className="info-card task-card completed"
                        key={tarefa.id}
                      >
                        <div className="task-card-main">
                          <span className="task-apartment-label">
                            {tarefa.predioApartamento ? "Predio" : "Apartamento"}
                          </span>
                          <h3>{obterRotuloTarefaCalendario(tarefa)}</h3>
                          <p>{tarefa.descricao}</p>
                        </div>
                        <div className="provider-task-done-by">
                          <span>Feita por</span>
                          <strong>
                            {responsavel?.nome ||
                              "Prestador nao identificado"}
                          </strong>
                          <span>Concluida em</span>
                          <strong>
                            {formatarDataCompleta(obterDataConclusao(tarefa))}
                          </strong>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="provider-empty compact">
                  <p>Nenhuma tarefa concluida encontrada.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {visualizacao === "lista" && tarefasPendentes.length === 0 && (
        <div className="empty-state">Nenhuma tarefa pendente encontrada.</div>
      )}
    </div>
  );
}

export default Tarefas;
