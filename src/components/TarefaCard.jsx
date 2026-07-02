import { useState } from "react";

function formatarData(data) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

function encontrarFuncionario(funcionarios, funcionarioId) {
  return funcionarios.find(
    (funcionario) => String(funcionario.id) === String(funcionarioId)
  );
}

function TarefaCard({ tarefa, funcionarios, onAtribuirFuncionario, selectId }) {
  const funcionario = encontrarFuncionario(funcionarios, tarefa.funcionarioId);
  const [editando, setEditando] = useState(false);
  const deveMostrarSelecao = !funcionario || editando;

  function editarFuncionario() {
    alert("Selecione outro funcionario para editar esta tarefa.");
    setEditando(true);
  }

  function selecionarFuncionario(event) {
    onAtribuirFuncionario(tarefa.id, event.target.value);
    setEditando(false);
  }

  return (
    <div className="info-card task-card">
      <span className="status-chip">Pendente</span>
      <h3>Apartamento {tarefa.apartamento}</h3>
      <p>{tarefa.descricao}</p>
      <p>
        Checkout: {formatarData(tarefa.checkout)} as {tarefa.horaCheckout}
      </p>

      {deveMostrarSelecao ? (
        <>
          <label htmlFor={selectId}>Funcionario responsavel</label>
          <select
            id={selectId}
            value={tarefa.funcionarioId}
            onChange={selecionarFuncionario}
          >
            <option value="">Selecionar funcionario</option>
            {funcionarios.map((funcionarioAtual) => (
              <option key={funcionarioAtual.id} value={funcionarioAtual.id}>
                {funcionarioAtual.nome}
              </option>
            ))}
          </select>
        </>
      ) : (
        <div className="assigned-box">
          <p className="assigned-text">Responsavel: {funcionario.nome}</p>
          <button className="secondary-action" onClick={editarFuncionario}>
            Editar
          </button>
        </div>
      )}
    </div>
  );
}

export default TarefaCard;
