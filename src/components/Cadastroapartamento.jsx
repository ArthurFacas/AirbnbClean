import { useState } from "react";
import { useNavigate } from "react-router-dom";

const estadoInicial = {
  Bairro: "",
  rua: "",
  "nome.do.predio": "",
  numero: "",
  Andar: "",
  bloco: "",
  ICALL: "",
  horaCheckout: "",
};

function CadastroApartamento({ onCadastrar }) {
  const [formulario, setFormulario] = useState(estadoInicial);
  const [carregandoIcal, setCarregandoIcal] = useState(false);
  const [erroIcal, setErroIcal] = useState("");
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

        <label htmlFor="nome do prédio">Nome do prédio</label>
        <input
          type="text"
          id="nome.do.predio"
          name="nome.do.predio"
          value={formulario["nome.do.predio"]}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="numero">Numero do apartamento</label>
        <input
          type="text"
          id="numero"
          name="numero"
          value={formulario.numero}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="host">Andar</label>
        <input
          type="text"
          id="Andar"
          name="Andar"
          value={formulario.Andar}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="bloco">bloco</label>
        <input
          type="text"
          id="bloco"
          name="bloco"
          value={formulario.bloco}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="dataReserva">Código ICALL</label>
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
