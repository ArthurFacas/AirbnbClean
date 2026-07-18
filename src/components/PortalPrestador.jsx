import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { calcularUrgencia } from "../utils/tarefas";
import SenhaPorta from "./SenhaPorta";
import "./Dashboard.css";

function formatarData(data) {
  if (!data) {
    return "Sem data";
  }

  const dataFormatada = new Date(`${data}T00:00:00`);

  return Number.isNaN(dataFormatada.getTime())
    ? String(data)
    : dataFormatada.toLocaleDateString("pt-BR");
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

function obterDataCheckout(tarefa) {
  const valor = tarefa.checkout ?? tarefa.dataCheckout ?? tarefa.data;

  if (!valor) {
    return "";
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

function compararTarefas(tarefaA, tarefaB) {
  return String(tarefaA.checkout || "").localeCompare(
    String(tarefaB.checkout || ""),
  );
}

function montarDiasDoMes(dataMes, tarefasPendentes, obterData = obterDataCheckout) {
  const [ano, mes] = dataMes.split("-").map(Number);
  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0);
  const diasAntes = primeiroDia.getDay();
  const totalDias = ultimoDia.getDate();
  const tarefasPorData = tarefasPendentes.reduce((mapa, tarefa) => {
    const data = obterData(tarefa);

    if (!data) {
      return mapa;
    }

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

function chaveSessaoPrestador(prestadorId) {
  return `cleanhost:prestador:${prestadorId}`;
}

function obterSessaoPrestador(prestadorId) {
  const chave = chaveSessaoPrestador(prestadorId);

  try {
    const sessaoLocal = localStorage.getItem(chave);
    const sessaoAntiga = sessionStorage.getItem(chave);
    const sessao = sessaoLocal || sessaoAntiga;

    if (sessaoAntiga && !sessaoLocal) {
      localStorage.setItem(chave, sessaoAntiga);
      sessionStorage.removeItem(chave);
    }

    return sessao ? JSON.parse(sessao) : null;
  } catch {
    return null;
  }
}

function salvarSessaoPrestador(prestadorId, sessao) {
  const chave = chaveSessaoPrestador(prestadorId);

  try {
    localStorage.setItem(chave, JSON.stringify(sessao));
    sessionStorage.removeItem(chave);
  } catch {
    sessionStorage.setItem(chave, JSON.stringify(sessao));
  }
}

function removerSessaoPrestador(prestadorId) {
  const chave = chaveSessaoPrestador(prestadorId);

  try {
    localStorage.removeItem(chave);
  } catch {
    // localStorage pode estar indisponivel em alguns navegadores privados.
  }

  sessionStorage.removeItem(chave);
}

function PrestadorAcesso({ prestadorId, prestador, onEntrar }) {
  const [modo, setModo] = useState("entrar");
  const [email, setEmail] = useState(prestador?.email || "");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    async function verificarAcesso() {
      setCarregando(true);
      setErro("");

      try {
        const resposta = await fetch(
          `/api/provider/access?funcionarioId=${encodeURIComponent(prestadorId)}`,
        );
        const dados = await resposta.json();

        if (!resposta.ok) {
          throw new Error(dados.erro || "Nao foi possivel abrir o acesso.");
        }

        setModo(dados.precisaCriarSenha ? "criar" : "entrar");
        setEmail(dados.prestador?.email || prestador?.email || "");
      } catch (erroAtual) {
        setErro(erroAtual.message);
      } finally {
        setCarregando(false);
      }
    }

    verificarAcesso();
  }, [prestador?.email, prestadorId]);

  async function enviarFormulario(event) {
    event.preventDefault();

    if (carregando) {
      return;
    }

    setErro("");
    setSucesso("");

    if ((modo === "criar" || modo === "recuperar") && senha !== confirmarSenha) {
      setErro("As senhas precisam ser iguais.");
      return;
    }

    setCarregando(true);

    try {
      const endpoint =
        modo === "criar"
          ? "/api/provider/register"
          : modo === "recuperar"
            ? "/api/provider/recover"
            : "/api/provider/login";
      const resposta = await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            funcionarioId: prestadorId,
            email,
            senha,
            confirmarSenha,
          }),
        },
      );
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || "Nao foi possivel entrar.");
      }

      if (modo === "recuperar") {
        setModo("entrar");
        setSenha("");
        setConfirmarSenha("");
        setSucesso("Senha alterada. Entre com a nova senha.");
        return;
      }

      const sessaoPrestador = {
        ...dados.prestador,
        token: dados.token,
      };

      salvarSessaoPrestador(prestadorId, sessaoPrestador);
      onEntrar(sessaoPrestador);
    } catch (erroAtual) {
      setErro(erroAtual.message);
      if (modo === "criar" && erroAtual.message.includes("ja criou")) {
        setModo("entrar");
        setSucesso("Acesso ja criado. Entre com email e senha.");
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="provider-page">
      <div className="provider-auth-card">
        <div className="provider-auth-brand">
          <span>CleanHost</span>
          <h1>
            {modo === "criar"
              ? "Criar acesso de prestador"
              : modo === "recuperar"
                ? "Recuperar senha"
              : "Entrar como prestador"}
          </h1>
          <p>
            {modo === "criar"
              ? "Este link e somente para criar seu login e senha e ver as tarefas designadas para voce."
              : modo === "recuperar"
                ? "Digite o email cadastrado e uma nova senha para trocar o acesso."
              : "Entre para ver somente suas tarefas pendentes, tarefas de hoje e concluidas."}
          </p>
        </div>

        <form className="provider-auth-form" onSubmit={enviarFormulario}>
          <label htmlFor="prestador-email">Login</label>
          <input
            id="prestador-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Seu email cadastrado"
            required
          />

          <label htmlFor="prestador-senha">Senha</label>
          <div className="provider-password-input">
            <input
              id="prestador-senha"
              type={mostrarSenha ? "text" : "password"}
              value={senha}
              minLength={6}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="Digite sua senha"
              required
            />
            <button
              type="button"
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setMostrarSenha((mostrar) => !mostrar)}
            >
              {mostrarSenha ? "Ocultar" : "Ver"}
            </button>
          </div>

          {(modo === "criar" || modo === "recuperar") && (
            <>
              <label htmlFor="prestador-confirmar-senha">Confirmar senha</label>
              <input
                id="prestador-confirmar-senha"
                type={mostrarSenha ? "text" : "password"}
                value={confirmarSenha}
                minLength={6}
                onChange={(event) => setConfirmarSenha(event.target.value)}
                placeholder="Digite novamente"
                required
              />
            </>
          )}

          {erro && <p className="provider-auth-error">{erro}</p>}
          {sucesso && <p className="provider-auth-success">{sucesso}</p>}

          <button
            className="provider-auth-submit"
            type="submit"
            disabled={carregando}
          >
            {carregando
              ? "Aguarde..."
              : modo === "criar"
                ? "Criar e entrar"
                : modo === "recuperar"
                  ? "Trocar senha"
                : "Entrar"}
          </button>

          {modo === "entrar" && (
            <button
              className="provider-auth-link-button"
              type="button"
              disabled={carregando}
              onClick={() => {
                setModo("recuperar");
                setErro("");
                setSucesso("");
                setSenha("");
                setConfirmarSenha("");
              }}
            >
              Recuperar senha
            </button>
          )}

          {modo === "recuperar" && (
            <button
              className="provider-auth-link-button"
              type="button"
              disabled={carregando}
              onClick={() => {
                setModo("entrar");
                setErro("");
                setSucesso("");
                setSenha("");
                setConfirmarSenha("");
              }}
            >
              Voltar para entrar
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function PortalPrestador({
  acessoMaster = false,
  funcionarios,
  onConcluirTarefa,
  tarefas,
}) {
  const { prestadorId } = useParams();
  const navigate = useNavigate();
  const [abaAtiva, setAbaAtiva] = useState("hoje");
  const [mesCalendario, setMesCalendario] = useState(() =>
    obterMesInput(obterHojeInput()),
  );
  const [dataSelecionada, setDataSelecionada] = useState("");
  const [dataConcluidaSelecionada, setDataConcluidaSelecionada] = useState("");
  const [prestadorLogado, setPrestadorLogado] = useState(() => {
    return obterSessaoPrestador(prestadorId);
  });
  const [prestadorRemoto, setPrestadorRemoto] = useState(null);
  const [tarefasRemotas, setTarefasRemotas] = useState([]);
  const [carregandoPortal, setCarregandoPortal] = useState(true);
  const [erroPortal, setErroPortal] = useState("");
  const [atualizandoPortal, setAtualizandoPortal] = useState(false);
  const [tarefasConcluindo, setTarefasConcluindo] = useState({});
  const prestadorLocal = funcionarios.find(
    (funcionario) => String(funcionario.id) === String(prestadorId),
  );
  const prestador = prestadorLocal || prestadorRemoto;
  const tarefasBase = acessoMaster || tarefas.length ? tarefas : tarefasRemotas;
  const tokenPrestador = prestadorLogado?.token || "";

  const carregarPortal = useCallback(
    async function carregarPortal({ silencioso = false } = {}) {
      await Promise.resolve();

      if (acessoMaster || !tokenPrestador) {
        setCarregandoPortal(false);
        return;
      }

      if (silencioso) {
        setAtualizandoPortal(true);
      } else {
        setCarregandoPortal(true);
      }
      setErroPortal("");

      try {
        const resposta = await fetch(
          `/api/provider/portal?funcionarioId=${encodeURIComponent(
            prestadorId,
          )}&token=${encodeURIComponent(tokenPrestador)}`,
        );
        const dados = await resposta.json();

        if (!resposta.ok) {
          throw new Error(dados.erro || "Nao foi possivel carregar o painel.");
        }

        setPrestadorRemoto(dados.prestador);
        setTarefasRemotas(Array.isArray(dados.tarefas) ? dados.tarefas : []);
      } catch (erroAtual) {
        setErroPortal(erroAtual.message);
        if (erroAtual.message.includes("autenticado")) {
          removerSessaoPrestador(prestadorId);
          setPrestadorLogado(null);
        }
      } finally {
        setCarregandoPortal(false);
        setAtualizandoPortal(false);
      }
    },
    [acessoMaster, prestadorId, tokenPrestador],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      carregarPortal();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [carregarPortal]);

  const dataHoje = obterHojeInput();
  const tarefasDoPrestador = useMemo(
    () =>
      tarefasBase
        .filter(
          (tarefa) =>
            tarefa.status === "Pendente" &&
            String(tarefa.funcionarioId) === String(prestadorId) &&
            (!obterDataCheckout(tarefa) || obterDataCheckout(tarefa) >= dataHoje),
        )
        .sort(compararTarefas),
    [dataHoje, prestadorId, tarefasBase],
  );
  const tarefasConcluidas = useMemo(
    () =>
      tarefasBase
        .filter(
          (tarefa) =>
            tarefa.status === "Concluida" &&
            String(tarefa.funcionarioId) === String(prestadorId),
        )
        .sort(compararTarefas),
    [prestadorId, tarefasBase],
  );
  const tarefasHoje = useMemo(
    () =>
      tarefasDoPrestador.filter(
        (tarefa) => obterDataCheckout(tarefa) === dataHoje,
      ),
    [dataHoje, tarefasDoPrestador],
  );
  const diasDoCalendario = useMemo(
    () => montarDiasDoMes(mesCalendario, tarefasDoPrestador),
    [mesCalendario, tarefasDoPrestador],
  );
  const tarefasDaDataSelecionada = dataSelecionada
    ? tarefasDoPrestador.filter(
        (tarefa) => obterDataCheckout(tarefa) === dataSelecionada,
      )
    : [];
  const tarefasConcluidasDaDataSelecionada = dataConcluidaSelecionada
    ? tarefasConcluidas.filter(
        (tarefa) => obterDataConclusao(tarefa) === dataConcluidaSelecionada,
      )
    : [];
  async function concluirTarefaPrestador(tarefaId) {
    if (tarefasConcluindo[tarefaId]) {
      return;
    }

    setTarefasConcluindo((tarefasAtuais) => ({
      ...tarefasAtuais,
      [tarefaId]: true,
    }));

    if (acessoMaster) {
      try {
        onConcluirTarefa(tarefaId);
      } finally {
        setTarefasConcluindo((tarefasAtuais) => ({
          ...tarefasAtuais,
          [tarefaId]: false,
        }));
      }
      return;
    }

    try {
      const resposta = await fetch("/api/provider/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          funcionarioId: prestadorId,
          tarefaId,
          token: tokenPrestador,
        }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || "Nao foi possivel concluir a tarefa.");
      }

      setTarefasRemotas((tarefasAtuais) =>
        tarefasAtuais.map((tarefa) =>
          String(tarefa.id) === String(tarefaId)
            ? {
                ...tarefa,
                status: "Concluida",
                concluidaEm:
                  dados.tarefa?.concluidaEm || new Date().toISOString(),
              }
            : tarefa,
        ),
      );
      onConcluirTarefa(tarefaId);
    } finally {
      setTarefasConcluindo((tarefasAtuais) => ({
        ...tarefasAtuais,
        [tarefaId]: false,
      }));
    }
  }

  function renderizarCardTarefa(tarefa, concluida = false) {
    const urgencia = calcularUrgencia(tarefa);
    const urgenciaVisual = urgencia;
    const estaConcluindo = Boolean(tarefasConcluindo[tarefa.id]);
    const responsavel =
      prestador ||
      funcionarios.find(
        (funcionario) =>
          String(funcionario.id) === String(tarefa.funcionarioId),
      );

    return (
      <article
        className={`provider-task-card ${
          concluida ? "completed" : urgenciaVisual.classe
        }`}
        key={tarefa.id}
      >
        <div className="provider-task-top">
          <strong>Apt {tarefa.apartamento}</strong>
          <div>
            {concluida && <span>Concluida</span>}
            {!concluida && tarefa.prioridade && <span>⚠ Prioridade</span>}
            {!concluida && (
              <span className={`provider-urgency-label ${urgenciaVisual.classe}`}>
                {urgenciaVisual.chave === "vermelha"
                  ? "Urgente"
                  : urgenciaVisual.chave === "amarela"
                    ? "Atencao"
                    : "Normal"}
              </span>
            )}
            {!concluida && <i title={urgenciaVisual.label}></i>}
          </div>
        </div>
        <p>{tarefa.descricao}</p>
        <div className="provider-task-meta">
          <span>Checkout</span>
          <strong>
            {formatarData(tarefa.checkout)} as {tarefa.horaCheckout || "11:00"}
          </strong>
        </div>
        {(tarefa.enderecoApartamento || tarefa.predioApartamento) && (
          <div className="provider-task-meta">
            <span>Endereco</span>
            <strong>
              {[tarefa.predioApartamento, tarefa.enderecoApartamento]
                .filter(Boolean)
                .join(" - ")}
            </strong>
          </div>
        )}
        {tarefa.bairroApartamento && <small>{tarefa.bairroApartamento}</small>}
        {tarefa.hospedes && (
          <div className="provider-task-meta">
            <span>Hospedes</span>
            <strong>{tarefa.hospedes}</strong>
          </div>
        )}
        <SenhaPorta senha={tarefa.senhaPorta} />
        {tarefa.observacaoPrestador && (
          <div className="provider-task-note">
            <span>Observacao</span>
            <p>{tarefa.observacaoPrestador}</p>
          </div>
        )}
        {concluida && (
          <div className="provider-task-done-by">
            <span>Feita por</span>
            <strong>{responsavel?.nome || "Prestador nao identificado"}</strong>
            <span>Concluida em</span>
            <strong>{formatarData(obterDataConclusao(tarefa))}</strong>
          </div>
        )}
        {!concluida && (
          <button
            className="provider-complete-button"
            type="button"
            disabled={estaConcluindo}
            onClick={() => {
              if (window.confirm("Tem certeza que ja terminou este servico?")) {
                concluirTarefaPrestador(tarefa.id).catch((erroAtual) => {
                  window.alert(erroAtual.message);
                });
              }
            }}
          >
            {estaConcluindo ? "Concluindo..." : "Marcar como concluida"}
          </button>
        )}
      </article>
    );
  }

  if (!acessoMaster && String(prestadorLogado?.id) !== String(prestadorId)) {
    return (
      <PrestadorAcesso
        prestador={prestador}
        prestadorId={prestadorId}
        onEntrar={setPrestadorLogado}
      />
    );
  }

  if (carregandoPortal && !prestador) {
    return (
      <div className="provider-page">
        <div className="provider-shell">
          <div className="provider-empty">
            <p>Carregando painel...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!prestador) {
    return (
      <div className="provider-page">
        <div className="provider-shell">
          <div className="provider-empty">
            <h1>Prestador nao encontrado</h1>
            <p>{erroPortal || "Confira se o link recebido esta correto."}</p>
            <button type="button" onClick={() => navigate("/")}>
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="provider-page">
      <div className="provider-shell">
        <header className="provider-header">
          <div>
            <span>CleanHost</span>
            <h1>Ola, {prestador.nome}</h1>
            <p>
              {acessoMaster
                ? "Visualizacao do master, sem login do prestador."
                : "Estas sao as tarefas designadas para voce."}
            </p>
          </div>
          <div className="provider-header-stats">
            <div>
              <span>Hoje</span>
              <strong>{tarefasHoje.length}</strong>
            </div>
            <div>
              <span>Pendentes</span>
              <strong>{tarefasDoPrestador.length}</strong>
            </div>
            <div>
              <span>Concluidas</span>
              <strong>{tarefasConcluidas.length}</strong>
            </div>
            <button
              className="provider-logout"
              type="button"
              disabled={atualizandoPortal}
              onClick={() => carregarPortal({ silencioso: true })}
            >
              {atualizandoPortal ? "Atualizando..." : "Atualizar"}
            </button>
            {acessoMaster ? (
              <button
                className="provider-logout"
                type="button"
                onClick={() => navigate("/dashboard/lista-funcionarios")}
              >
                Voltar
              </button>
            ) : (
              <button
                className="provider-logout"
                type="button"
                onClick={() => {
                  removerSessaoPrestador(prestadorId);
                  setPrestadorLogado(null);
                }}
              >
                Sair
              </button>
            )}
          </div>
        </header>

        <div className="provider-tabs">
          <button
            type="button"
            className={abaAtiva === "hoje" ? "active" : ""}
            onClick={() => setAbaAtiva("hoje")}
          >
            Hoje
            <strong>{tarefasHoje.length}</strong>
          </button>
          <button
            type="button"
            className={abaAtiva === "pendentes" ? "active" : ""}
            onClick={() => setAbaAtiva("pendentes")}
          >
            Pendentes
            <strong>{tarefasDoPrestador.length}</strong>
          </button>
          <button
            type="button"
            className={abaAtiva === "calendario" ? "active" : ""}
            onClick={() => setAbaAtiva("calendario")}
          >
            Calendario
            <strong>{tarefasDoPrestador.length}</strong>
          </button>
          <button
            type="button"
            className={abaAtiva === "concluidas" ? "active" : ""}
            onClick={() => setAbaAtiva("concluidas")}
          >
            Concluidas
            <strong>{tarefasConcluidas.length}</strong>
          </button>
        </div>

        {abaAtiva === "hoje" && (
          <>
            <section className="provider-task-list">
              {tarefasHoje.map((tarefa) => renderizarCardTarefa(tarefa))}
            </section>

            {tarefasHoje.length === 0 && (
              <div className="provider-empty">
                <h2>Nenhuma tarefa para hoje</h2>
                <p>Quando houver tarefas de hoje para voce, elas aparecem aqui.</p>
              </div>
            )}
          </>
        )}

        {abaAtiva === "pendentes" && (
          <>
            <section className="provider-task-list">
              {tarefasDoPrestador.map((tarefa) => renderizarCardTarefa(tarefa))}
            </section>

            {tarefasDoPrestador.length === 0 && (
              <div className="provider-empty">
                <h2>Nenhuma tarefa pendente</h2>
                <p>Quando novas tarefas forem designadas, elas aparecem aqui.</p>
              </div>
            )}
          </>
        )}

        {abaAtiva === "calendario" && (
          <section className="provider-calendar-panel">
            <div className="provider-calendar-header">
              <strong>{formatarMes(mesCalendario)}</strong>
              <input
                aria-label="Escolher mes"
                type="month"
                value={mesCalendario}
                onChange={(event) => {
                  setMesCalendario(event.target.value);
                  setDataSelecionada("");
                }}
              />
            </div>

            <div className="provider-calendar-weekdays">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((dia, index) => (
                <span key={`${dia}-${index}`}>{dia}</span>
              ))}
            </div>

            <div className="provider-calendar-grid">
              {diasDoCalendario.map((dia, index) =>
                dia ? (
                  <button
                    key={dia.data}
                    type="button"
                    className={`provider-calendar-day ${
                      dia.tarefas.length ? "has-tasks" : ""
                    } ${dia.data < dataHoje ? "past-day" : ""} ${
                      dia.data === dataHoje ? "today" : ""
                    } ${dataSelecionada === dia.data ? "active" : ""}`}
                    onClick={() => setDataSelecionada(dia.data)}
                  >
                    <span>{dia.dia}</span>
                    {dia.tarefas.length > 0 && (
                      <strong>{dia.tarefas.length}</strong>
                    )}
                  </button>
                ) : (
                  <div
                    className="provider-calendar-day empty"
                    key={`empty-${index}`}
                  />
                ),
              )}
            </div>

            <div className="provider-calendar-results">
              <div className="provider-calendar-results-header">
                <strong>
                  {dataSelecionada
                    ? formatarData(dataSelecionada)
                    : "Escolha uma data"}
                </strong>
                {dataSelecionada && (
                  <span>{tarefasDaDataSelecionada.length} tarefa(s)</span>
                )}
              </div>

              {dataSelecionada ? (
                tarefasDaDataSelecionada.length ? (
                  <div className="provider-task-list compact">
                    {tarefasDaDataSelecionada.map((tarefa) =>
                      renderizarCardTarefa(tarefa),
                    )}
                  </div>
                ) : (
                  <div className="provider-empty compact">
                    <p>Nenhuma tarefa nessa data.</p>
                  </div>
                )
              ) : (
                <div className="provider-empty compact">
                  <p>Toque em um dia marcado para ver as tarefas.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {abaAtiva === "concluidas" && (
          <section className="provider-completed-section">
            <div className="provider-calendar-panel completed-calendar-panel compact-filter">
              <div className="provider-calendar-header">
                <strong>Tarefas concluidas</strong>
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
                      ? formatarData(dataConcluidaSelecionada)
                      : "Todas as concluidas"}
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
                  <div className="provider-task-list compact">
                    {(dataConcluidaSelecionada
                      ? tarefasConcluidasDaDataSelecionada
                      : tarefasConcluidas
                    ).map((tarefa) => renderizarCardTarefa(tarefa, true))}
                  </div>
                ) : (
                  <div className="provider-empty compact">
                    <p>Nenhuma tarefa concluida encontrada.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default PortalPrestador;
