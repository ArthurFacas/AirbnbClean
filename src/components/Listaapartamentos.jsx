import { useNavigate } from "react-router-dom";

function Listaapartamentos({ apartamentos, onExcluir }) {
  const navigate = useNavigate();
  const possuiStatus = apartamentos.some((apartamento) => apartamento.status);

  function obterStatus(apartamento) {
    return apartamento.status || apartamento.situacao || "Ativo";
  }

  function obterEndereco(apartamento) {
    const partesEndereco = [
      apartamento.rua,
      apartamento.Bairro,
      apartamento["nome.do.predio"],
    ].filter(Boolean);

    return partesEndereco.length
      ? partesEndereco.join(" - ")
      : "Endereco nao informado";
  }

  function obterResponsavel(apartamento) {
    return (
      apartamento.host ||
      apartamento.responsavel ||
      apartamento.anfitriao ||
      "Responsavel nao informado"
    );
  }

  return (
    <div className="content-page apartments-page">
      <div className="page-title-row apartments-header">
        <div>
          <h1>Apartamentos</h1>
          <p>Gerencie os imoveis cadastrados e os dados principais de cada unidade.</p>
        </div>

        <button
          className="primary-action"
          onClick={() => navigate("/dashboard/cadastro-apartamento")}
        >
          Cadastrar apartamento
        </button>
      </div>

      <div className="apartments-toolbar" aria-label="Ferramentas de apartamentos">
        <label className="apartments-search">
          <span>Buscar</span>
          <input type="search" placeholder="Buscar apartamento" />
        </label>

        {possuiStatus && (
          <label className="apartments-status-filter">
            <span>Status</span>
            <select defaultValue="todos" aria-label="Filtrar por status">
              <option value="todos">Todos</option>
              <option value="ativo">Ativo</option>
              <option value="pendente">Pendente</option>
              <option value="inativo">Inativo</option>
            </select>
          </label>
        )}
      </div>

      {apartamentos.length === 0 ? (
        <div className="apartments-empty-state">
          <div aria-hidden="true">AP</div>
          <h2>Nenhum apartamento cadastrado</h2>
          <p>Cadastre o primeiro imovel para importar reservas e organizar as tarefas.</p>
          <button
            className="primary-action"
            onClick={() => navigate("/dashboard/cadastro-apartamento")}
          >
            Cadastrar primeiro apartamento
          </button>
        </div>
      ) : (
        <div className="apartment-grid">
          {apartamentos.map((apartamento) => (
            <article className="info-card apartment-card" key={apartamento.id}>
              <div className="apartment-card-top">
                <div>
                  <span>Apartamento</span>
                  <h3>{apartamento.numero || "Sem numero"}</h3>
                </div>
                <strong className="apartment-status-badge">
                  {obterStatus(apartamento)}
                </strong>
              </div>

              <div className="apartment-location">
                <span>Predio</span>
                <p>{apartamento["nome.do.predio"] || "Predio nao informado"}</p>
              </div>

              <div className="apartment-details">
                <div>
                  <span>Endereco</span>
                  <strong>{obterEndereco(apartamento)}</strong>
                </div>
                <div>
                  <span>Responsavel</span>
                  <strong>{obterResponsavel(apartamento)}</strong>
                </div>
                <div>
                  <span>Hospedes</span>
                  <strong>
                    {apartamento.hospedesMaximos
                      ? `Ate ${apartamento.hospedesMaximos}`
                      : "Nao informado"}
                  </strong>
                </div>
              </div>

              <div className="apartment-actions">
                <button
                  className="danger-action"
                  onClick={() => onExcluir(apartamento.id)}
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default Listaapartamentos;
