import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SenhaPorta from "./SenhaPorta";

function obterValor(valor, fallback = "Nao informado") {
  return String(valor || "").trim() || fallback;
}

function obterRotuloApartamento(apartamento) {
  const predio = String(
    apartamento["nome.do.predio"] || apartamento.predio || "",
  ).trim();
  const numero = String(apartamento.numero || "").trim();

  if (predio && numero) {
    return `${predio} - ${numero}`;
  }

  return predio || numero || "Predio nao informado";
}

function normalizarBusca(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function apartamentoCombinaComBusca(apartamento, busca) {
  const termo = normalizarBusca(busca);

  if (!termo) {
    return true;
  }

  const predio = String(
    apartamento["nome.do.predio"] || apartamento.predio || "",
  ).trim();
  const numero = String(apartamento.numero || "").trim();
  const camposBusca = [
    predio,
    numero,
    `${predio}${numero}`,
    `${predio}apt${numero}`,
    obterRotuloApartamento(apartamento),
  ];

  return camposBusca.some((campo) => normalizarBusca(campo).includes(termo));
}

function criarFormularioApartamento(apartamento) {
  return {
    Bairro: apartamento.Bairro || apartamento.bairro || "",
    rua: apartamento.rua || "",
    numero: apartamento.numero || "",
    observacaoEndereco: apartamento.observacaoEndereco || "",
    "nome.do.predio":
      apartamento["nome.do.predio"] || apartamento.predio || "",
    hospedesMaximos: apartamento.hospedesMaximos || "",
    senhaPorta: apartamento.senhaPorta || "",
    ICALL: apartamento.ICALL || apartamento.ical || "",
  };
}

function Listaapartamentos({ apartamentos, onAtualizar, onExcluir }) {
  const navigate = useNavigate();
  const [apartamentoEditando, setApartamentoEditando] = useState("");
  const [formulario, setFormulario] = useState({});
  const [mostrarSenhaPorta, setMostrarSenhaPorta] = useState(false);
  const [buscaApartamento, setBuscaApartamento] = useState("");
  const possuiStatus = apartamentos.some((apartamento) => apartamento.status);
  const apartamentosFiltrados = apartamentos.filter((apartamento) =>
    apartamentoCombinaComBusca(apartamento, buscaApartamento),
  );

  function obterStatus(apartamento) {
    return apartamento.status || apartamento.situacao || "Ativo";
  }

  function obterEndereco(apartamento) {
    const partesEndereco = [
      apartamento.rua,
      apartamento.numero,
      apartamento.Bairro,
    ].filter(Boolean);

    return partesEndereco.length
      ? partesEndereco.join(" - ")
      : "Endereco nao informado";
  }

  function editarApartamento(apartamento) {
    setApartamentoEditando(String(apartamento.id));
    setFormulario(criarFormularioApartamento(apartamento));
    setMostrarSenhaPorta(false);
  }

  function atualizarCampo(event) {
    const { name, value } = event.target;

    setFormulario((dadosAtuais) => ({
      ...dadosAtuais,
      [name]: value,
    }));
  }

  function salvarEdicao(event, apartamento) {
    event.preventDefault();
    onAtualizar(apartamento.id, formulario);
    setApartamentoEditando("");
    setFormulario({});
    setMostrarSenhaPorta(false);
  }

  function cancelarEdicao() {
    setApartamentoEditando("");
    setFormulario({});
    setMostrarSenhaPorta(false);
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
          <input
            type="search"
            value={buscaApartamento}
            onChange={(event) => setBuscaApartamento(event.target.value)}
            placeholder="Ex: aquarela-211"
          />
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
      ) : apartamentosFiltrados.length ? (
          <div className="apartment-grid">
            {apartamentosFiltrados.map((apartamento) => {
              const editando =
                apartamentoEditando === String(apartamento.id);

              return (
                <article className="info-card apartment-card" key={apartamento.id}>
                {editando ? (
                  <form
                    className="apartment-edit-form"
                    onSubmit={(event) => salvarEdicao(event, apartamento)}
                  >
                    <label htmlFor={`apt-bairro-${apartamento.id}`}>Bairro</label>
                    <input
                      id={`apt-bairro-${apartamento.id}`}
                      name="Bairro"
                      value={formulario.Bairro || ""}
                      onChange={atualizarCampo}
                      required
                    />

                    <label htmlFor={`apt-rua-${apartamento.id}`}>Rua</label>
                    <input
                      id={`apt-rua-${apartamento.id}`}
                      name="rua"
                      value={formulario.rua || ""}
                      onChange={atualizarCampo}
                      required
                    />

                    <label htmlFor={`apt-numero-${apartamento.id}`}>
                      Numero do apt
                    </label>
                    <input
                      id={`apt-numero-${apartamento.id}`}
                      name="numero"
                      value={formulario.numero || ""}
                      onChange={atualizarCampo}
                      required
                    />

                    <label htmlFor={`apt-observacao-${apartamento.id}`}>
                      Observacao
                    </label>
                    <textarea
                      id={`apt-observacao-${apartamento.id}`}
                      name="observacaoEndereco"
                      value={formulario.observacaoEndereco || ""}
                      onChange={atualizarCampo}
                      rows={3}
                    />

                    <label htmlFor={`apt-predio-${apartamento.id}`}>
                      Nome do predio
                    </label>
                    <input
                      id={`apt-predio-${apartamento.id}`}
                      name="nome.do.predio"
                      value={formulario["nome.do.predio"] || ""}
                      onChange={atualizarCampo}
                      required
                    />

                    <label htmlFor={`apt-hospedes-${apartamento.id}`}>
                      Quantidade maxima de hospedes
                    </label>
                    <input
                      id={`apt-hospedes-${apartamento.id}`}
                      name="hospedesMaximos"
                      type="number"
                      min="1"
                      step="1"
                      value={formulario.hospedesMaximos || ""}
                      onChange={atualizarCampo}
                      required
                    />

                    <label htmlFor={`apt-senha-${apartamento.id}`}>
                      Senha da porta
                    </label>
                    <div className="form-password-row">
                      <input
                        id={`apt-senha-${apartamento.id}`}
                        name="senhaPorta"
                        type={mostrarSenhaPorta ? "text" : "password"}
                        value={formulario.senhaPorta || ""}
                        onChange={atualizarCampo}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setMostrarSenhaPorta((valorAtual) => !valorAtual)
                        }
                      >
                        {mostrarSenhaPorta ? "Ocultar" : "Ver"}
                      </button>
                    </div>

                    <label htmlFor={`apt-ical-${apartamento.id}`}>Codigo ICALL</label>
                    <input
                      id={`apt-ical-${apartamento.id}`}
                      name="ICALL"
                      value={formulario.ICALL || ""}
                      onChange={atualizarCampo}
                      required
                    />

                    <div className="apartment-actions">
                      <button className="primary-action" type="submit">
                        Salvar
                      </button>
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={cancelarEdicao}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="apartment-card-top">
                      <div>
                        <span>Predio</span>
                        <h3>{obterRotuloApartamento(apartamento)}</h3>
                      </div>
                      <strong className="apartment-status-badge">
                        {obterStatus(apartamento)}
                      </strong>
                    </div>

                    <div className="apartment-location">
                      <span>Apartamento</span>
                      <p>{apartamento.numero || "Numero nao informado"}</p>
                    </div>

                    <div className="apartment-details">
                      <div>
                        <span>Endereco</span>
                        <strong>{obterEndereco(apartamento)}</strong>
                      </div>
                      <div>
                        <span>Observacao</span>
                        <strong>
                          {obterValor(apartamento.observacaoEndereco)}
                        </strong>
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

                    <SenhaPorta senha={apartamento.senhaPorta} />

                    <div className="apartment-actions">
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => editarApartamento(apartamento)}
                      >
                        Editar
                      </button>
                      <button
                        className="danger-action"
                        type="button"
                        onClick={() => onExcluir(apartamento.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </>
                )}
                </article>
              );
            })}
          </div>
      ) : (
        <div className="apartments-empty-state">
          <div aria-hidden="true">AP</div>
          <h2>Nenhum apartamento encontrado</h2>
          <p>Tente buscar pelo nome do predio ou pelo numero do apartamento.</p>
        </div>
      )}
    </div>
  );
}

export default Listaapartamentos;
