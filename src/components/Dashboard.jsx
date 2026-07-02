import { Outlet, useLocation, useNavigate } from "react-router-dom";
import TarefaCard from "./TarefaCard";
import "./Dashboard.css";

function DashboardHome({
  apartamentoTotal,
  funcionarioTotal,
  funcionarios,
  onAtribuirFuncionario,
  tarefasPendentes,
}) {
  const navigate = useNavigate();

  return (
    <>
      <h1>Bem-vinda, Aline</h1>
      <p>Resumo geral da operacao.</p>

      <section className="cards-resumo">
        <div className="resumo-card">
          <p>Apartamentos</p>
          <h2>{apartamentoTotal}</h2>
        </div>

        <div className="resumo-card">
          <p>Funcionarios</p>
          <h2>{funcionarioTotal}</h2>
        </div>

        <div className="resumo-card destaque">
          <p>Tarefas pendentes</p>
          <h2>{tarefasPendentes.length}</h2>
        </div>
      </section>

      <section className="tarefas-pendentes">
        <div className="section-title-row">
          <h2>Tarefas pendentes</h2>
          <button onClick={() => navigate("/dashboard/tarefas")}>
            Ver tarefas
          </button>
        </div>

        <div className="list-grid">
          {tarefasPendentes.map((tarefa) => (
            <TarefaCard
              key={tarefa.id}
              funcionarios={funcionarios}
              onAtribuirFuncionario={onAtribuirFuncionario}
              selectId={`dashboard-funcionario-${tarefa.id}`}
              tarefa={tarefa}
            />
          ))}
        </div>
      </section>
    </>
  );
}

function Dashboard({
  apartamentoTotal,
  funcionarioTotal,
  funcionarios,
  onAtribuirFuncionario,
  tarefasPendentes,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboardHome = location.pathname === "/dashboard";

  return (
    <div className="dashboard-page">
      <aside className="sidebar">
        <h2>CleanHost</h2>

        <nav>
          <button onClick={() => navigate("/dashboard")}>Dashboard</button>
          <button onClick={() => navigate("/dashboard/lista-funcionarios")}>
            Funcionarios
          </button>
          <button onClick={() => navigate("/dashboard/lista-apartamentos")}>
            Apartamentos
          </button>
          <button onClick={() => navigate("/dashboard/tarefas")}>Tarefas</button>
        </nav>
      </aside>

      <main className="dashboard-main">
        {isDashboardHome ? (
          <DashboardHome
            apartamentoTotal={apartamentoTotal}
            funcionarioTotal={funcionarioTotal}
            funcionarios={funcionarios}
            onAtribuirFuncionario={onAtribuirFuncionario}
            tarefasPendentes={tarefasPendentes}
          />
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

export default Dashboard;
