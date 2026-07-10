import { Outlet, useLocation, useNavigate } from "react-router-dom";
import TarefaCard from "./TarefaCard";
import { criarDataCheckout } from "../utils/tarefas";
import "./Dashboard.css";

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

function DashboardHome({
  apartamentoTotal,
  funcionarioTotal,
  funcionarios,
  usuario,
  onAtribuirFuncionario,
  tarefasPendentes,
}) {
  const navigate = useNavigate();
  const tarefasOrdenadas = [...tarefasPendentes].sort(
    compararTarefasPorCheckout,
  );

  return (
    <>
      <h1>Bem-vindo, {usuario?.nome || "usuario"}</h1>
      <p>Resumo geral da operacao.</p>

      <section className="cards-resumo">
        <div className="resumo-card">
          <p>Apartamentos</p>
          <h2>{apartamentoTotal}</h2>
        </div>

        <div className="resumo-card">
          <p>Prestadores de servico</p>
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
          {tarefasOrdenadas.map((tarefa) => (
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
  usuario,
  onSair,
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
            Prestadores de servico
          </button>
          <button onClick={() => navigate("/dashboard/lista-apartamentos")}>
            Apartamentos
          </button>
          <button onClick={() => navigate("/dashboard/tarefas")}>Tarefas</button>
        </nav>

        <button
          className="sidebar-logout"
          onClick={() => {
            onSair();
            navigate("/");
          }}
        >
          Sair
        </button>
      </aside>

      <main className="dashboard-main">
        {isDashboardHome ? (
          <DashboardHome
            apartamentoTotal={apartamentoTotal}
            funcionarioTotal={funcionarioTotal}
            funcionarios={funcionarios}
            usuario={usuario}
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
