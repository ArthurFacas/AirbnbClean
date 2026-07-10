import { useState } from "react";
import { calcularUrgencia } from "../utils/tarefas";

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

function encontrarFuncionario(funcionarios, funcionarioId) {
  return funcionarios.find(
    (funcionario) => String(funcionario.id) === String(funcionarioId),
  );
}

function normalizarBairro(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function funcionarioNoMesmoBairro(funcionario, tarefa) {
  const bairroFuncionario = normalizarBairro(funcionario.bairro);
  const bairroApartamento = normalizarBairro(tarefa.bairroApartamento);

  return Boolean(bairroFuncionario && bairroFuncionario === bairroApartamento);
}

function TarefaCard({ tarefa, funcionarios, onAtribuirFuncionario, selectId }) {
  const funcionario = encontrarFuncionario(funcionarios, tarefa.funcionarioId);
  const urgencia = calcularUrgencia(tarefa);
  const [editando, setEditando] = useState(false);
  const deveMostrarSelecao = !funcionario || editando;
  const funcionariosOrdenados = [...funcionarios].sort((funcionarioA, funcionarioB) => {
    const funcionarioAPerto = funcionarioNoMesmoBairro(funcionarioA, tarefa);
    const funcionarioBPerto = funcionarioNoMesmoBairro(funcionarioB, tarefa);

    if (funcionarioAPerto !== funcionarioBPerto) {
      return funcionarioAPerto ? -1 : 1;
    }

    return funcionarioA.nome.localeCompare(funcionarioB.nome, "pt-BR");
  });
  const funcionarioPerto = funcionario
    ? funcionarioNoMesmoBairro(funcionario, tarefa)
    : false;

  function editarFuncionario() {
    alert("Selecione outro prestador de servico para editar esta tarefa.");
    setEditando(true);
  }

  function selecionarFuncionario(event) {
    onAtribuirFuncionario(tarefa.id, event.target.value);
    setEditando(false);
  }

  return (
    <div className={`info-card task-card ${urgencia.classe}`}>
      <div className="task-card-top">
        <div className="task-card-flags">
          <span className="status-chip">Pendente</span>
          {funcionario && <span className="assigned-chip">Atribuido</span>}
          {tarefa.prioridade && (
            <span className="priority-chip" title={tarefa.motivoPrioridade}>
              Prioridade
            </span>
          )}
        </div>
        <span
          className={`urgency-pill ${urgencia.classe}`}
          aria-label={urgencia.label}
          title={urgencia.label}
        >
          <span className="urgency-dot"></span>
        </span>
      </div>

      <div className="task-card-main">
        <span className="task-apartment-label">Apartamento</span>
        <h3>{tarefa.apartamento}</h3>
        <p>{tarefa.descricao}</p>
      </div>

      <div className="task-checkout-row">
        <div>
          <span>Checkout</span>
          <strong>{formatarData(tarefa.checkout)}</strong>
        </div>
        <div>
          <span>Horario</span>
          <strong>{tarefa.horaCheckout}</strong>
        </div>
      </div>

      {deveMostrarSelecao ? (
        <div className="task-assignment-control">
          <label htmlFor={selectId}>Prestador responsavel</label>
          <select
            id={selectId}
            value={tarefa.funcionarioId}
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
                  {mesmoBairro ? " - mais perto" : ""}
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
          <p className="assigned-text">Responsavel: {funcionario.nome}</p>
          {funcionarioPerto && (
            <p className="distance-hint">Mais perto deste apartamento</p>
          )}
          <button className="secondary-action" onClick={editarFuncionario}>
            Editar
          </button>
        </div>
      )}
    </div>
  );
}

export default TarefaCard;
