import { useState } from "react";
import { useNavigate } from "react-router-dom";

const estadoInicial = {
  nome: "",
  nascimento: "",
  email: "",
  telefone: "",
  bairro: "",
  cargo: "",
};

function Cadastrarfuncionario({ onCadastrar }) {
  const [formulario, setFormulario] = useState(estadoInicial);
  const navigate = useNavigate();

  function atualizarCampo(event) {
    const { name, value } = event.target;

    setFormulario((dadosAtuais) => ({
      ...dadosAtuais,
      [name]: value,
    }));
  }

  function salvarFuncionario(event) {
    event.preventDefault();
    onCadastrar(formulario);
    setFormulario(estadoInicial);
    navigate("/dashboard/lista-funcionarios");
  }

  return (
    <div className="content-page">
      <div className="page-title-row">
        <div>
          <h1>Cadastrar Prestador de serviço</h1>
          <p>
            Preencha os dados para adicionar um prestador de serviço a lista.
          </p>
        </div>

        <button
          className="secondary-action"
          onClick={() => navigate("/dashboard/lista-funcionarios")}
        >
          Voltar
        </button>
      </div>

      <form className="form-panel" onSubmit={salvarFuncionario}>
        <label htmlFor="nome">Nome</label>
        <input
          type="text"
          id="nome"
          name="nome"
          value={formulario.nome}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="nascimento">Nascimento</label>
        <input
          type="date"
          id="nascimento"
          name="nascimento"
          value={formulario.nascimento}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="email">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          value={formulario.email}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="telefone">WhatsApp</label>
        <input
          type="tel"
          id="telefone"
          name="telefone"
          value={formulario.telefone}
          onChange={atualizarCampo}
          placeholder="(11) 99999-9999"
          required
        />

        <label htmlFor="bairro">Bairro onde mora</label>
        <input
          type="text"
          id="bairro"
          name="bairro"
          value={formulario.bairro}
          onChange={atualizarCampo}
          placeholder="Ex: Centro"
          required
        />

        <label htmlFor="cargo">Cargo</label>
        <select
          id="cargo"
          name="cargo"
          value={formulario.cargo}
          onChange={atualizarCampo}
          required
        >
          <option value="">Selecione um cargo</option>
          <option value="Faxina">Faxina</option>
          <option value="Gestao">Gestao</option>
          <option value="Motoristas">Motoristas</option>
        </select>

        <button className="primary-action" type="submit">
          Cadastrar
        </button>
      </form>
    </div>
  );
}

export default Cadastrarfuncionario;
