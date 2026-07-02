import TarefaCard from "./TarefaCard";

function Tarefas({ tarefas, funcionarios, onAtribuirFuncionario }) {
  const tarefasPendentes = tarefas.filter(
    (tarefa) => tarefa.status === "Pendente"
  );

  return (
    <div className="content-page">
      <div className="page-title-row">
        <div>
          <h1>Tarefas</h1>
          <p>Limpezas pendentes para organizar e atribuir funcionarios.</p>
        </div>
      </div>

      <div className="list-grid">
        {tarefasPendentes.map((tarefa) => (
          <TarefaCard
            key={tarefa.id}
            funcionarios={funcionarios}
            onAtribuirFuncionario={onAtribuirFuncionario}
            selectId={`tarefa-funcionario-${tarefa.id}`}
            tarefa={tarefa}
          />
        ))}
      </div>
    </div>
  );
}

export default Tarefas;
