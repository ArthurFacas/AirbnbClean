import { useNavigate } from "react-router-dom";

function formatarData(data) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

function obterStatus(checkout, horaCheckout) {
  const agora = new Date();
  const dataCheckout = new Date(`${checkout}T${horaCheckout}`);

  if (dataCheckout < agora) {
    return "Pendente";
  }

  return "Reservado";
}

function Listaapartamentos({ apartamentos, onExcluir }) {
  const navigate = useNavigate();

  return (
    <div className="content-page">
      <div className="page-title-row">
        <div>
          <h1>Apartamentos</h1>
          <p>Lista de apartamentos cadastrados.</p>
        </div>

        <button
          className="primary-action"
          onClick={() => navigate("/dashboard/cadastro-apartamento")}
        >
          Cadastrar apartamento
        </button>
      </div>

      <div className="list-grid">
        {apartamentos.map((apartamento) => (
          <div className="info-card" key={apartamento.id}>
            <h3>Apartamento {apartamento.numero}</h3>
            <p>Rua: {apartamento.rua}</p>
            <p>Host: {apartamento.host}</p>
            <p>Reservado em: {formatarData(apartamento.dataReserva)}</p>
            <p>
              Checkout: {formatarData(apartamento.checkout)} as{" "}
              {apartamento.horaCheckout}
            </p>
            <p>
              Status:{" "}
              {obterStatus(apartamento.checkout, apartamento.horaCheckout)}
            </p>
            <button
              className="danger-action"
              onClick={() => onExcluir(apartamento.id)}
            >
              Excluir
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Listaapartamentos;
