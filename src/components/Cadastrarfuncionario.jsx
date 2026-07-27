import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PermissoesAdministrativas from "./PermissoesAdministrativas";
import {
  criarConfiguracaoPermissoesPadrao,
} from "../utils/permissoesAdministrativas";

const estadoInicial = {
  nome: "",
  nascimento: "",
  email: "",
  telefone: "",
  bairro: "",
  cargo: "",
  cpf: "",
  senha: "",
  confirmarSenha: "",
};

function usuarioEhMaster(usuario) {
  return String(usuario?.papel || "Master") === "Master";
}

function formatarCpf(valor) {
  const numeros = String(valor || "").replace(/\D/g, "").slice(0, 11);

  return numeros
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function Cadastrarfuncionario({
  apartamentos = [],
  funcionarios = [],
  onCadastrar,
  usuario,
}) {
  const [formulario, setFormulario] = useState(estadoInicial);
  const [configuracaoPermissoes, setConfiguracaoPermissoes] = useState(
    criarConfiguracaoPermissoesPadrao,
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const navigate = useNavigate();
  const cadastrandoGestora = formulario.cargo === "Gestora";

  function atualizarCampo(event) {
    const { name, value } = event.target;

    setFormulario((dadosAtuais) => ({
      ...dadosAtuais,
      [name]: name === "cpf" ? formatarCpf(value) : value,
    }));
  }

  async function salvarFuncionario(event) {
    event.preventDefault();

    if (salvando) {
      return;
    }

    setErro("");

    if (cadastrandoGestora) {
      const cpfNumeros = formulario.cpf.replace(/\D/g, "");

      if (!usuarioEhMaster(usuario)) {
        setErro("Apenas o Master pode cadastrar uma gestora.");
        return;
      }

      if (cpfNumeros.length !== 11) {
        setErro("CPF precisa ter 11 numeros.");
        return;
      }

      if (formulario.senha.length < 6) {
        setErro("A senha precisa ter pelo menos 6 caracteres.");
        return;
      }

      if (formulario.senha !== formulario.confirmarSenha) {
        setErro("As senhas precisam ser iguais.");
        return;
      }

      if (
        configuracaoPermissoes.apartamentosAcesso === "selecionados" &&
        !configuracaoPermissoes.apartamentosPermitidos.length
      ) {
        setErro("Selecione pelo menos um apartamento.");
        return;
      }

      if (
        configuracaoPermissoes.prestadoresAcesso === "selecionados" &&
        !configuracaoPermissoes.prestadoresPermitidos.length
      ) {
        setErro("Selecione pelo menos um prestador.");
        return;
      }
    }

    setSalvando(true);

    try {
      await onCadastrar({
        ...formulario,
        ...(cadastrandoGestora ? configuracaoPermissoes : {}),
      });
      setFormulario(estadoInicial);
      setConfiguracaoPermissoes(criarConfiguracaoPermissoesPadrao());
      navigate("/dashboard/lista-funcionarios");
    } catch {
      setErro("Nao foi possivel salvar o prestador. Tente novamente.");
    } finally {
      setSalvando(false);
    }
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

        <label htmlFor="bairro">Bairro(s) que atende</label>
        <input
          type="text"
          id="bairro"
          name="bairro"
          value={formulario.bairro}
          onChange={atualizarCampo}
          placeholder="Ex: Centro, Jardins, Pinheiros"
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
          <option value="Limpeza">Limpeza</option>
          <option value="Gestao">Gestao</option>
          {usuarioEhMaster(usuario) && <option value="Gestora">Gestora</option>}
          <option value="Motoristas">Motoristas</option>
        </select>

        {cadastrandoGestora && (
          <>
            <label htmlFor="cpf">CPF da gestora</label>
            <input
              type="text"
              id="cpf"
              name="cpf"
              value={formulario.cpf}
              onChange={atualizarCampo}
              placeholder="000.000.000-00"
              maxLength={14}
              required
            />

            <label htmlFor="senha">Senha da gestora</label>
            <input
              type="password"
              id="senha"
              name="senha"
              value={formulario.senha}
              onChange={atualizarCampo}
              minLength={6}
              required
            />

            <label htmlFor="confirmarSenha">Confirmar senha</label>
            <input
              type="password"
              id="confirmarSenha"
              name="confirmarSenha"
              value={formulario.confirmarSenha}
              onChange={atualizarCampo}
              minLength={6}
              required
            />

            <PermissoesAdministrativas
              apartamentos={apartamentos}
              configuracao={configuracaoPermissoes}
              funcionarios={funcionarios}
              onChange={setConfiguracaoPermissoes}
            />
          </>
        )}

        {erro && <p className="form-error">{erro}</p>}

        <button className="primary-action" type="submit" disabled={salvando}>
          {salvando ? "Salvando..." : "Cadastrar"}
        </button>
      </form>
    </div>
  );
}

export default Cadastrarfuncionario;
