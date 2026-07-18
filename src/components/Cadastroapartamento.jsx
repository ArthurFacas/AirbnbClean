import { useState } from "react";
import { useNavigate } from "react-router-dom";

const estadoInicial = {
  Bairro: "",
  rua: "",
  numero: "",
  observacaoEndereco: "",
  "nome.do.predio": "",
  ICALL: "",
  horaCheckout: "",
  hospedesMaximos: "",
  senhaPorta: "",
};

function CadastroApartamento({ onCadastrar }) {
  const [formulario, setFormulario] = useState(estadoInicial);
  const [carregandoIcal, setCarregandoIcal] = useState(false);
  const [erroIcal, setErroIcal] = useState("");
  const [mostrarSenhaPorta, setMostrarSenhaPorta] = useState(false);
  const navigate = useNavigate();

  function atualizarCampo(event) {
    const { name, value } = event.target;

    setFormulario((dadosAtuais) => ({
      ...dadosAtuais,
      [name]: value,
    }));
  }

  async function salvarApartamento(event) {
    event.preventDefault();

    if (carregandoIcal) {
      return;
    }

    setErroIcal("");
    setCarregandoIcal(true);

    try {
      await onCadastrar({
        ...formulario,
        horaCheckout: "11:00",
      });
      setFormulario(estadoInicial);
      navigate("/dashboard/lista-apartamentos");
    } catch {
      setErroIcal(
        "Nao consegui ler o iCal. Cole o link completo exportado pelo Airbnb e tente novamente.",
      );
    } finally {
      setCarregandoIcal(false);
    }
  }

  return (
    <div className="content-page">
      <div className="page-title-row">
        <div>
          <h1>Cadastrar apartamento</h1>
          <p>Preencha os dados para adicionar um apartamento a lista.</p>
        </div>

        <button
          className="secondary-action"
          onClick={() => navigate("/dashboard/lista-apartamentos")}
        >
          Voltar
        </button>
      </div>

      <form className="form-panel" onSubmit={salvarApartamento}>
        <h2 className="form-section-title">Endereco</h2>

        <label htmlFor="Bairro">Bairro</label>
        <input
          type="text"
          id="Bairro"
          name="Bairro"
          value={formulario.Bairro}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="rua">Rua</label>
        <input
          type="text"
          id="rua"
          name="rua"
          value={formulario.rua}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="numero">Numero</label>
        <input
          type="text"
          id="numero"
          name="numero"
          value={formulario.numero}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="observacaoEndereco">Observacao</label>
        <textarea
          id="observacaoEndereco"
          name="observacaoEndereco"
          value={formulario.observacaoEndereco}
          onChange={atualizarCampo}
          placeholder="Ex: apartamento 403, bloco B, fundos, portaria..."
          rows={3}
        />

        <label htmlFor="nome.do.predio">Nome do predio</label>
        <input
          type="text"
          id="nome.do.predio"
          name="nome.do.predio"
          value={formulario["nome.do.predio"]}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="hospedesMaximos">Quantidade maxima de hospedes</label>
        <input
          type="number"
          id="hospedesMaximos"
          name="hospedesMaximos"
          value={formulario.hospedesMaximos}
          onChange={atualizarCampo}
          min="1"
          step="1"
          placeholder="Ex: 4"
          required
        />

        <label htmlFor="senhaPorta">Senha da porta</label>
        <div className="form-password-row">
          <input
            type={mostrarSenhaPorta ? "text" : "password"}
            id="senhaPorta"
            name="senhaPorta"
            value={formulario.senhaPorta}
            onChange={atualizarCampo}
            placeholder="Senha ou codigo de acesso"
          />
          <button
            type="button"
            aria-label={
              mostrarSenhaPorta ? "Ocultar senha da porta" : "Ver senha da porta"
            }
            onClick={() => setMostrarSenhaPorta((valorAtual) => !valorAtual)}
          >
            {mostrarSenhaPorta ? "Ocultar" : "Ver"}
          </button>
        </div>

        <label htmlFor="ICALL">Codigo ICALL</label>
        <input
          type="text"
          id="ICALL"
          name="ICALL"
          value={formulario.ICALL}
          onChange={atualizarCampo}
          placeholder="Cole o link iCal do Airbnb"
          required
        />

        {erroIcal && <p className="form-error">{erroIcal}</p>}

        <button className="primary-action" type="submit" disabled={carregandoIcal}>
          {carregandoIcal ? "Buscando iCal..." : "Cadastrar"}
        </button>
      </form>
    </div>
  );
}

export default CadastroApartamento;
