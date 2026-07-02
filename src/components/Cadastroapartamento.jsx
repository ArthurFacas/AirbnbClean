import { useState } from "react";
import { useNavigate } from "react-router-dom";

const estadoInicial = {
  rua: "",
  numero: "",
  host: "",
  dataReserva: "",
  checkout: "",
  horaCheckout: "",
};

function CadastroApartamento({ onCadastrar }) {
  const [formulario, setFormulario] = useState(estadoInicial);
  const navigate = useNavigate();

  function atualizarCampo(event) {
    const { name, value } = event.target;

    setFormulario((dadosAtuais) => ({
      ...dadosAtuais,
      [name]: value,
    }));
  }

  function salvarApartamento(event) {
    event.preventDefault();
    onCadastrar(formulario);
    setFormulario(estadoInicial);
    navigate("/dashboard/lista-apartamentos");
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
        <label htmlFor="rua">Rua</label>
        <input
          type="text"
          id="rua"
          name="rua"
          value={formulario.rua}
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

        <label htmlFor="host">Nome do host</label>
        <input
          type="text"
          id="host"
          name="host"
          value={formulario.host}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="dataReserva">Data reservada</label>
        <input
          type="date"
          id="dataReserva"
          name="dataReserva"
          value={formulario.dataReserva}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="checkout">Checkout</label>
        <input
          type="date"
          id="checkout"
          name="checkout"
          value={formulario.checkout}
          onChange={atualizarCampo}
          required
        />

        <label htmlFor="horaCheckout">Hora do checkout</label>
        <input
          type="time"
          id="horaCheckout"
          name="horaCheckout"
          value={formulario.horaCheckout}
          onChange={atualizarCampo}
          required
        />

        <button className="primary-action" type="submit">
          Cadastrar
        </button>
      </form>
    </div>
  );
}

export default CadastroApartamento;
