import { useState } from "react";
import TarefaCard from "./TarefaCard";
import { criarDataCheckout } from "../utils/tarefas";

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

function montarDiasDoMes(dataMes, tarefasPendentes) {
  const [ano, mes] = dataMes.split("-").map(Number);
  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0);
  const diasAntes = primeiroDia.getDay();
  const totalDias = ultimoDia.getDate();
  const tarefasPorData = tarefasPendentes.reduce((mapa, tarefa) => {
    const data = obterDataCheckout(tarefa);

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

function limparTelefone(telefone) {
  return String(telefone || "").replace(/\D/g, "");
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

function montarMensagemWhatsapp(funcionario, tarefasAmanha, dataAmanha) {
  return [
    `Ola, ${funcionario.nome}.`,
    `Tarefas de ${formatarDataCompleta(dataAmanha)}:`,
    "",
    tarefasAmanha.length
      ? tarefasAmanha
          .map(
            (tarefa, index) =>
              `${index + 1}. Apt ${tarefa.apartamento} - ${
                tarefa.descricao
              } - checkout ${formatarDataCompleta(tarefa.checkout)} ${
                tarefa.horaCheckout || "11:00"
              }${tarefa.prioridade ? " - PRIORIDADE" : ""}`,
          )
          .join("\n")
      : "Nenhuma tarefa atribuida para amanha.",
  ].join("\n");
}

function Tarefas({ tarefas, funcionarios, onAtribuirFuncionario }) {
  const [visualizacao, setVisualizacao] = useState("calendario");
  const [prestadorSelecionado, setPrestadorSelecionado] = useState("");
  const [dataSelecionada, setDataSelecionada] = useState("");
  const [dataAbertaPeloCalendario, setDataAbertaPeloCalendario] =
    useState(false);
  const [mesCalendario, setMesCalendario] = useState(() =>
    obterMesInput(obterHojeInput()),
  );
  const [mesRetornoCalendario, setMesRetornoCalendario] = useState(() =>
    obterMesInput(obterHojeInput()),
  );
  const dataAmanha = obterAmanha();
  const tarefasPendentes = tarefas
    .filter((tarefa) => tarefa.status === "Pendente")
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
  const diasDoCalendario = montarDiasDoMes(mesCalendario, tarefasPendentes);
  const tarefasDaDataSelecionada = dataSelecionada
    ? tarefasPendentes.filter(
        (tarefa) => obterDataCheckout(tarefa) === dataSelecionada,
      )
    : [];
  const gruposPrestadoresBase = [
    ...funcionarios.map((funcionario) => ({
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
      tarefas: tarefasPendentes.filter((tarefa) => !tarefa.funcionarioId),
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

  function voltarParaCalendario() {
    setMesCalendario(mesRetornoCalendario);
    setDataAbertaPeloCalendario(false);
    setVisualizacao("calendario");
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
          <span>Exibindo checkouts pendentes</span>
        </div>
        <div className="task-results-tags">
          <span>{tarefasSemResponsavel} sem responsavel</span>
          <span>{tarefasPrioritarias} prioridade</span>
          <span>{tarefasAmanhaTotal} para amanha</span>
        </div>
      </div>

      {visualizacao === "calendario" && (
        <div className="monthly-calendar">
          <div className="monthly-calendar-header">
            <strong>{formatarMes(mesCalendario)}</strong>
            <input
              type="month"
              value={mesCalendario}
              onChange={(event) => setMesCalendario(event.target.value)}
              aria-label="Escolher mes"
            />
          </div>

          <div className="calendar-weekdays">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((dia) => (
              <span key={dia}>{dia}</span>
            ))}
          </div>

          <div className="calendar-month-grid">
            {diasDoCalendario.map((dia, index) =>
              dia ? (
                <button
                  key={dia.data}
                  type="button"
                  className={`calendar-month-day ${
                    dia.tarefas.length ? "has-tasks" : ""
                  }`}
                  onClick={() => abrirDataDoCalendario(dia.data)}
                >
                  <span>{dia.dia}</span>
                  <div>
                    {dia.tarefas.slice(0, 3).map((tarefa) => (
                      <strong
                        key={tarefa.id}
                        className={tarefa.prioridade ? "priority" : ""}
                      >
                        Apt {tarefa.apartamento}
                      </strong>
                    ))}
                    {dia.tarefas.length > 3 && (
                      <em>+{dia.tarefas.length - 3}</em>
                    )}
                  </div>
                </button>
              ) : (
                <div className="calendar-month-day empty" key={`empty-${index}`} />
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
              funcionarios={funcionarios}
              onAtribuirFuncionario={onAtribuirFuncionario}
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
            <div className="date-picker-card">
              <label htmlFor="data-tarefas">Escolha uma data</label>
              <input
                id="data-tarefas"
                type="date"
                value={dataSelecionada}
                onChange={(event) => setDataSelecionada(event.target.value)}
              />
              {dataSelecionada && (
                <strong>
                  {tarefasDaDataSelecionada.length} tarefa(s) em{" "}
                  {formatarDataCompleta(dataSelecionada)}
                </strong>
              )}
            </div>
          )}

          {dataSelecionada ? (
            tarefasDaDataSelecionada.length ? (
              <div className="list-grid">
                {tarefasDaDataSelecionada.map((tarefa) => (
                  <TarefaCard
                    key={tarefa.id}
                    funcionarios={funcionarios}
                    onAtribuirFuncionario={onAtribuirFuncionario}
                    selectId={`data-funcionario-${tarefa.id}`}
                    tarefa={tarefa}
                  />
                ))}
              </div>
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
            const telefoneFuncionario = limparTelefone(grupo.funcionario?.telefone);
            const tarefasAmanhaFuncionario = grupo.funcionario
              ? grupo.tarefas.filter(
                  (tarefa) => obterDataCheckout(tarefa) === dataAmanha,
                )
              : [];
            const linkWhatsapp =
              grupo.funcionario &&
              telefoneFuncionario &&
              tarefasAmanhaFuncionario.length
                ? `https://wa.me/${telefoneFuncionario}?text=${encodeURIComponent(
                    montarMensagemWhatsapp(
                      grupo.funcionario,
                      tarefasAmanhaFuncionario,
                      dataAmanha,
                    ),
                  )}`
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
                      funcionarios={funcionarios}
                      onAtribuirFuncionario={onAtribuirFuncionario}
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

          {tarefasConcluidas.length > 0 ? (
            <div className="list-grid">
              {tarefasConcluidas.map((tarefa) => (
                <div className="info-card task-card completed" key={tarefa.id}>
                  <div className="task-card-top">
                    <div className="task-card-flags">
                      <span className="assigned-chip">Concluida</span>
                    </div>
                  </div>
                  <div className="task-card-main">
                    <span className="task-apartment-label">Apartamento</span>
                    <h3>{tarefa.apartamento}</h3>
                    <p>{tarefa.descricao}</p>
                  </div>
                  <div className="task-checkout-row">
                    <div>
                      <span>Checkout</span>
                      <strong>{formatarDataCompleta(tarefa.checkout)}</strong>
                    </div>
                    <div>
                      <span>Horario</span>
                      <strong>{tarefa.horaCheckout || "11:00"}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">Nenhuma tarefa concluida ainda.</div>
          )}
        </div>
      )}

      {tarefasPendentes.length === 0 && (
        <div className="empty-state">Nenhuma tarefa pendente encontrada.</div>
      )}
    </div>
  );
}

export default Tarefas;
