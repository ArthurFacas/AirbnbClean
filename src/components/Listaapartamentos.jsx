import { useNavigate } from "react-router-dom";

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

      <div className="apartment-grid">
        {apartamentos.map((apartamento) => (
          <div className="info-card apartment-card" key={apartamento.id}>
            <div className="apartment-card-top">
              <div>
                <span>Apartamento</span>
                <h3>{apartamento.numero}</h3>
              </div>
            </div>

            <div className="apartment-location">
              <p>{apartamento["nome.do.predio"] || "Predio nao informado"}</p>
              <span>{apartamento.Bairro || "Bairro nao informado"}</span>
            </div>

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
