function Dashboard() {
  return (
    <div className="dashboard">
      <h1>Bem Vinda Aline</h1>

      <h2>Limpezas pendentes</h2>

      <div className="card">
        <h3>Apartamento 101</h3>
        <p>Checkout: 11:00</p>
        <p>Status: Pendente</p>
      </div>

      <div className="card">
        <h3>Apartamento 302</h3>
        <p>Checkout: 13:00</p>
        <p>Status: Pendente</p>
      </div>
    </div>
  );
}

export default Dashboard;
