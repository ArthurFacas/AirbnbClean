import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { calcularUrgencia } from "../utils/tarefas";
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

function compararTarefas(tarefaA, tarefaB) {
  return String(tarefaA.checkout || "").localeCompare(
    String(tarefaB.checkout || ""),
  );
}

function chaveSessaoPrestador(prestadorId) {
  return `cleanhost:prestador:${prestadorId}`;
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

    if (modo === "criar" && senha !== confirmarSenha) {
      setErro("As senhas precisam ser iguais.");
      return;
    }

    setCarregando(true);

    try {
      const resposta = await fetch(
        modo === "criar" ? "/api/provider/register" : "/api/provider/login",
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

      const sessaoPrestador = {
        ...dados.prestador,
        token: dados.token,
      };

      sessionStorage.setItem(
        chaveSessaoPrestador(prestadorId),
        JSON.stringify(sessaoPrestador),
      );
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
              : "Entrar como prestador"}
          </h1>
          <p>
            {modo === "criar"
              ? "Este link e somente para criar seu login e senha e ver as tarefas designadas para voce."
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

          {modo === "criar" && (
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

          <button className="provider-auth-submit" type="submit" disabled={carregando}>
            {carregando
              ? "Aguarde..."
              : modo === "criar"
                ? "Criar e entrar"
                : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PortalPrestador({ funcionarios, onConcluirTarefa, tarefas }) {
  const { prestadorId } = useParams();
  const navigate = useNavigate();
  const [abaAtiva, setAbaAtiva] = useState("hoje");
  const [prestadorLogado, setPrestadorLogado] = useState(() => {
    try {
      const sessao = sessionStorage.getItem(chaveSessaoPrestador(prestadorId));
      return sessao ? JSON.parse(sessao) : null;
    } catch {
      return null;
    }
  });
  const [prestadorRemoto, setPrestadorRemoto] = useState(null);
  const [tarefasRemotas, setTarefasRemotas] = useState([]);
  const [carregandoPortal, setCarregandoPortal] = useState(true);
  const [erroPortal, setErroPortal] = useState("");
  const [atualizandoPortal, setAtualizandoPortal] = useState(false);
  const prestadorLocal = funcionarios.find(
    (funcionario) => String(funcionario.id) === String(prestadorId),
  );
  const prestador = prestadorLocal || prestadorRemoto;
  const tarefasBase = tarefas.length ? tarefas : tarefasRemotas;
  const tokenPrestador = prestadorLogado?.token || "";

  const carregarPortal = useCallback(
    async function carregarPortal({ silencioso = false } = {}) {
      await Promise.resolve();

      if (!tokenPrestador) {
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
          sessionStorage.removeItem(chaveSessaoPrestador(prestadorId));
          setPrestadorLogado(null);
        }
      } finally {
        setCarregandoPortal(false);
        setAtualizandoPortal(false);
      }
    },
    [prestadorId, tokenPrestador],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      carregarPortal();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [carregarPortal]);

  useEffect(() => {
    if (!tokenPrestador) {
      return undefined;
    }

    const intervalo = window.setInterval(() => {
      carregarPortal({ silencioso: true });
    }, 8000);

    return () => window.clearInterval(intervalo);
  }, [carregarPortal, tokenPrestador]);

  const tarefasDoPrestador = useMemo(
    () =>
      tarefasBase
        .filter(
          (tarefa) =>
            tarefa.status === "Pendente" &&
            String(tarefa.funcionarioId) === String(prestadorId),
        )
        .sort(compararTarefas),
    [prestadorId, tarefasBase],
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
  const dataHoje = obterHojeInput();
  const tarefasHoje = useMemo(
    () =>
      tarefasDoPrestador.filter(
        (tarefa) => obterDataCheckout(tarefa) === dataHoje,
      ),
    [dataHoje, tarefasDoPrestador],
  );
  async function concluirTarefaPrestador(tarefaId) {
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
          ? { ...tarefa, status: "Concluida" }
          : tarefa,
      ),
    );
    onConcluirTarefa(tarefaId);
  }

  function renderizarCardTarefa(tarefa, concluida = false) {
    const urgencia = calcularUrgencia(tarefa);

    return (
      <article
        className={`provider-task-card ${concluida ? "completed" : urgencia.classe}`}
        key={tarefa.id}
      >
        <div className="provider-task-top">
          <strong>Apt {tarefa.apartamento}</strong>
          <div>
            {concluida && <span>Concluida</span>}
            {!concluida && tarefa.prioridade && <span>Prioridade</span>}
            {!concluida && <i title={urgencia.label}></i>}
          </div>
        </div>
        <p>{tarefa.descricao}</p>
        <div className="provider-task-meta">
          <span>Checkout</span>
          <strong>
            {formatarData(tarefa.checkout)} as {tarefa.horaCheckout || "11:00"}
          </strong>
        </div>
        {tarefa.bairroApartamento && <small>{tarefa.bairroApartamento}</small>}
        {!concluida && (
          <button
            className="provider-complete-button"
            type="button"
            onClick={() => {
              if (window.confirm("Tem certeza que ja terminou este servico?")) {
                concluirTarefaPrestador(tarefa.id).catch((erroAtual) => {
                  window.alert(erroAtual.message);
                });
              }
            }}
          >
            Marcar como concluida
          </button>
        )}
      </article>
    );
  }

  if (String(prestadorLogado?.id) !== String(prestadorId)) {
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
            <p>Estas sao as tarefas designadas para voce.</p>
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
            <button
              className="provider-logout"
              type="button"
              onClick={() => {
                sessionStorage.removeItem(chaveSessaoPrestador(prestadorId));
                setPrestadorLogado(null);
              }}
            >
              Sair
            </button>
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

        {abaAtiva === "concluidas" && (
          <section className="provider-completed-section">
            {tarefasConcluidas.length > 0 ? (
              <div className="provider-task-list">
                {tarefasConcluidas.map((tarefa) =>
                  renderizarCardTarefa(tarefa, true),
                )}
              </div>
            ) : (
              <div className="provider-empty">
                <p>Nenhuma tarefa concluida ainda.</p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export default PortalPrestador;
