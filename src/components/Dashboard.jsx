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
  onAtualizarDados,
  onAtualizarTarefa,
  tarefasPendentes,
}) {
  const navigate = useNavigate();
  const tarefasOrdenadas = [...tarefasPendentes].sort(
    compararTarefasPorCheckout,
  );
  const inicialUsuario = (usuario?.nome || "U").trim().slice(0, 1).toUpperCase();

  return (
    <div className="dashboard-home">
      <header className="dashboard-topbar">
        <div>
          <span className="dashboard-eyebrow">Painel operacional</span>
          <h1>Bem-vindo, {usuario?.nome || "usuario"}</h1>
          <p>Resumo geral da operacao e tarefas em aberto.</p>
        </div>

        <div className="dashboard-profile" aria-label="Perfil do usuario">
          <span>{inicialUsuario}</span>
          <div>
            <strong>{usuario?.nome || "Usuario"}</strong>
            <small>Master</small>
          </div>
        </div>
      </header>

      <section className="cards-resumo">
        <div className="resumo-card">
          <span className="summary-icon" aria-hidden="true">
            AP
          </span>
          <div>
            <p>Apartamentos</p>
            <h2>{apartamentoTotal}</h2>
          </div>
        </div>

        <div className="resumo-card">
          <span className="summary-icon" aria-hidden="true">
            PS
          </span>
          <div>
            <p>Prestadores de servico</p>
            <h2>{funcionarioTotal}</h2>
          </div>
        </div>

        <div className="resumo-card destaque">
          <span className="summary-icon" aria-hidden="true">
            TP
          </span>
          <div>
            <p>Tarefas pendentes</p>
            <h2>{tarefasPendentes.length}</h2>
          </div>
        </div>
      </section>

      <section className="tarefas-pendentes">
        <div className="section-title-row">
          <div>
            <span className="section-kicker">Operacao</span>
            <h2>Tarefas pendentes</h2>
          </div>
          <div>
            <button type="button" onClick={onAtualizarDados}>
              Atualizar
            </button>
            <button type="button" onClick={() => navigate("/dashboard/tarefas")}>
              Ver tarefas
            </button>
          </div>
        </div>

        {tarefasOrdenadas.length ? (
          <div className="list-grid">
            {tarefasOrdenadas.map((tarefa) => (
              <TarefaCard
                key={tarefa.id}
                funcionarios={funcionarios}
                onAtribuirFuncionario={onAtribuirFuncionario}
                onAtualizarTarefa={onAtualizarTarefa}
                selectId={`dashboard-funcionario-${tarefa.id}`}
                tarefa={tarefa}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            Nenhuma tarefa pendente encontrada.
          </div>
        )}
      </section>
    </div>
  );
}

function Dashboard({
  apartamentoTotal,
  funcionarioTotal,
  funcionarios,
  usuario,
  onSair,
  onAtribuirFuncionario,
  onAtualizarDados,
  onAtualizarTarefa,
  tarefasPendentes,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboardHome = location.pathname === "/dashboard";
  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: "DB" },
    {
      path: "/dashboard/lista-funcionarios",
      label: "Prestadores de servico",
      icon: "PS",
    },
    {
      path: "/dashboard/lista-apartamentos",
      label: "Apartamentos",
      icon: "AP",
    },
    { path: "/dashboard/tarefas", label: "Tarefas", icon: "TF" },
  ];

  function rotaAtiva(path) {
    return path === "/dashboard"
      ? location.pathname === path
      : location.pathname.startsWith(path);
  }

  return (
    <div className="dashboard-page">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span aria-hidden="true">CH</span>
          <h2>CleanHost</h2>
        </div>

        <nav aria-label="Navegacao principal">
          {navItems.map((item) => (
            <button
              aria-current={rotaAtiva(item.path) ? "page" : undefined}
              className={rotaAtiva(item.path) ? "active" : ""}
              key={item.path}
              onClick={() => navigate(item.path)}
              type="button"
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <button
          className="sidebar-logout"
          onClick={() => {
            onSair();
            navigate("/");
          }}
          type="button"
        >
          <span aria-hidden="true">SA</span>
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
            onAtualizarDados={onAtualizarDados}
            onAtualizarTarefa={onAtualizarTarefa}
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
