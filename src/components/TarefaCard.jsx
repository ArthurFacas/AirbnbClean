import { useState } from "react";
import { calcularUrgencia } from "../utils/tarefas";
import {
  funcionarioPodeSerResponsavelLimpeza,
  normalizarBairroComparacao,
} from "../utils/cargos";
import SenhaPorta from "./SenhaPorta";

function formatarData(data) {
  if (!data) {
    return "";
  }

  const texto = String(data);
  const dataNormalizada = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? new Date(`${texto}T00:00:00`)
    : new Date(texto);

  return Number.isNaN(dataNormalizada.getTime())
    ? texto
    : dataNormalizada.toLocaleDateString("pt-BR");
}

function formatarHorario(horario) {
  const texto = String(horario || "11:00").trim();
  const resultado = texto.match(/^(\d{1,2}):(\d{2})/);

  if (!resultado) {
    return texto || "11:00";
  }

  return `${resultado[1].padStart(2, "0")}:${resultado[2]}`;
}

function formatarDescricao(descricao) {
  const texto = String(descricao || "").trim();

  if (!texto || /not available/i.test(texto)) {
    return "Informacao indisponivel";
  }

  return texto;
}

function encontrarFuncionario(funcionarios, funcionarioId) {
  return funcionarios.find(
    (funcionario) => String(funcionario.id) === String(funcionarioId),
  );
}

function obterBairrosAtendidos(funcionario) {
  return String(funcionario?.bairro || "")
    .split(/[,;|]/)
    .map(normalizarBairroComparacao)
    .filter(Boolean);
}

function funcionarioNoMesmoBairro(funcionario, tarefa) {
  const bairroApartamento = normalizarBairroComparacao(tarefa.bairroApartamento);

  return Boolean(
    bairroApartamento &&
    obterBairrosAtendidos(funcionario).includes(bairroApartamento),
  );
}

function obterTituloTarefa(tarefa) {
  const predio = String(tarefa.predioApartamento || "").trim();
  const apartamento = String(tarefa.apartamento || "").trim();

  if (predio && apartamento) {
    return `${predio} - ${apartamento}`;
  }

  return predio || apartamento || "Apartamento";
}

function TarefaCard({
  tarefa,
  funcionarios,
  onAtribuirFuncionario,
  onAtualizarTarefa,
  selectId,
}) {
  const funcionariosResponsaveis = funcionarios.filter(
    funcionarioPodeSerResponsavelLimpeza,
  );
  const funcionarioEncontrado = encontrarFuncionario(
    funcionarios,
    tarefa.funcionarioId,
  );
  const funcionario = funcionarioPodeSerResponsavelLimpeza(funcionarioEncontrado)
    ? funcionarioEncontrado
    : null;
  const urgencia = calcularUrgencia(tarefa);
  const urgenciaVisual = urgencia;
  const [editando, setEditando] = useState(false);
  const deveMostrarSelecao = !funcionario || editando;
  const funcionariosOrdenados = [...funcionariosResponsaveis].sort(
    (funcionarioA, funcionarioB) => {
      const funcionarioAPerto = funcionarioNoMesmoBairro(funcionarioA, tarefa);
      const funcionarioBPerto = funcionarioNoMesmoBairro(funcionarioB, tarefa);

      if (funcionarioAPerto !== funcionarioBPerto) {
        return funcionarioAPerto ? -1 : 1;
      }

      return funcionarioA.nome.localeCompare(funcionarioB.nome, "pt-BR");
    },
  );
  const funcionarioPerto = funcionario
    ? funcionarioNoMesmoBairro(funcionario, tarefa)
    : false;
  const responsavel = funcionario?.nome || "Nao atribuido";
  const observacao = String(tarefa.observacaoPrestador || "").trim();
  const tituloTarefa = obterTituloTarefa(tarefa);

  function editarFuncionario() {
    alert("Selecione outro prestador de servico para editar esta tarefa.");
    setEditando(true);
  }

  function selecionarFuncionario(event) {
    onAtribuirFuncionario(tarefa.id, event.target.value);
    setEditando(false);
  }

  return (
    <div className={`info-card task-card ${urgenciaVisual.classe}`}>
      <div className="task-card-top">
        <span className="status-chip">Pendente</span>
        {tarefa.prioridade && (
          <span className="priority-chip">🚨 Prioridade</span>
        )}
        <span
          className={`urgency-pill ${urgenciaVisual.classe}`}
          aria-label={urgenciaVisual.label}
          title={urgenciaVisual.label}
        >
          <span className="urgency-dot"></span>
          <strong>
            {urgenciaVisual.chave === "vermelha" ? "Urgente" : "Normal"}
          </strong>
        </span>
      </div>

      <div className="task-card-main">
        <span className="task-apartment-label">
          {tarefa.predioApartamento ? "Predio" : "Apartamento"}
        </span>
        <h3>{tituloTarefa}</h3>
        <p>{formatarDescricao(tarefa.descricao)}</p>
      </div>

      <div className="task-checkout-row">
        <div>
          <span>Checkout</span>
          <strong>{formatarData(tarefa.checkout)}</strong>
        </div>
        <div>
          <span>Horario</span>
          <strong>{formatarHorario(tarefa.horaCheckout)}</strong>
        </div>
      </div>

      <div className="task-responsible-box">
        <span>Responsavel</span>
        <strong className={funcionario ? "" : "unassigned"}>
          {responsavel}
        </strong>
        {funcionarioPerto && <small>Atende o bairro deste apartamento</small>}
      </div>

      {deveMostrarSelecao ? (
        <div className="task-assignment-control">
          <label htmlFor={selectId}>Prestador responsavel</label>
          <select
            id={selectId}
            value={funcionario ? tarefa.funcionarioId : ""}
            onChange={selecionarFuncionario}
          >
            <option value="">Selecionar prestador de servico</option>
            {funcionariosOrdenados.map((funcionarioAtual) => {
              const mesmoBairro = funcionarioNoMesmoBairro(
                funcionarioAtual,
                tarefa,
              );

              return (
                <option key={funcionarioAtual.id} value={funcionarioAtual.id}>
                  {funcionarioAtual.nome}
                  {mesmoBairro ? " - atende o bairro" : ""}
                </option>
              );
            })}
          </select>
          {tarefa.bairroApartamento && (
            <p className="distance-hint">
              Bairro do apartamento: {tarefa.bairroApartamento}
            </p>
          )}
        </div>
      ) : (
        <div className="assigned-box">
          <button className="secondary-action" onClick={editarFuncionario}>
            Editar
          </button>
        </div>
      )}

      <div className={`task-observation-box ${observacao ? "has-note" : ""}`}>
        <div>
          <span>Observacao</span>
          {observacao && <strong>Para o prestador</strong>}
        </div>
        <p>{observacao || "Sem observacoes"}</p>
      </div>

      <SenhaPorta senha={tarefa.senhaPorta} />

      <div className="task-note-control">
        <label htmlFor={`hospedes-${tarefa.id}`}>Hospedes nesta tarefa</label>
        <input
          id={`hospedes-${tarefa.id}`}
          type="number"
          min="1"
          step="1"
          value={tarefa.hospedes || ""}
          onChange={(event) =>
            onAtualizarTarefa?.(tarefa.id, {
              hospedes: event.target.value,
            })
          }
          placeholder="Quantidade de hospedes"
        />
      </div>

      {onAtualizarTarefa && (
        <div className="task-note-control">
          <label htmlFor={`observacao-${tarefa.id}`}>
            Observacao para o prestador
          </label>
          <textarea
            id={`observacao-${tarefa.id}`}
            value={tarefa.observacaoPrestador || ""}
            onChange={(event) =>
              onAtualizarTarefa(tarefa.id, {
                observacaoPrestador: event.target.value,
              })
            }
            placeholder="Ex: conferir enxoval, levar produto especifico..."
            rows={3}
          />
        </div>
      )}
    </div>
  );
}

export default TarefaCard;
