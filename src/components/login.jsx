import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./login.css";

const loginInicial = {
  email: "",
  senha: "",
};

const cadastroInicial = {
  nome: "",
  email: "",
  confirmarEmail: "",
  telefone: "",
  cpf: "",
  senha: "",
  confirmarSenha: "",
};

function Login({ onEntrar }) {
  const [modo, setModo] = useState("entrar");
  const [login, setLogin] = useState(loginInicial);
  const [cadastro, setCadastro] = useState(cadastroInicial);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const navigate = useNavigate();
  const criandoConta = modo === "criar";

  async function lerRespostaJson(resposta) {
    const texto = await resposta.text();

    if (!texto) {
      return {};
    }

    try {
      return JSON.parse(texto);
    } catch {
      throw new Error("Resposta invalida do servidor. Verifique se a API local esta rodando.");
    }
  }

  function atualizarLogin(event) {
    const { name, value } = event.target;
    setLogin((dados) => ({ ...dados, [name]: value }));
  }

  function formatarCpf(valor) {
    const numeros = String(valor || "").replace(/\D/g, "").slice(0, 11);

    return numeros
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function atualizarCadastro(event) {
    const { name, value } = event.target;
    setCadastro((dados) => ({
      ...dados,
      [name]: name === "cpf" ? formatarCpf(value) : value,
    }));
  }

  function validarCadastro() {
    const cpfNumeros = cadastro.cpf.replace(/\D/g, "");

    if (cpfNumeros.length !== 11) {
      return "CPF precisa ter 11 numeros.";
    }

    if (cadastro.email.trim().toLowerCase() !== cadastro.confirmarEmail.trim().toLowerCase()) {
      return "Os emails precisam ser iguais.";
    }

    if (cadastro.senha.length < 6) {
      return "A senha precisa ter pelo menos 6 caracteres.";
    }

    if (cadastro.senha !== cadastro.confirmarSenha) {
      return "As senhas precisam ser iguais.";
    }

    return "";
  }

  async function enviarFormulario(event) {
    event.preventDefault();

    if (carregando) {
      return;
    }

    setErro("");
    setSucesso("");

    if (criandoConta) {
      const erroCadastro = validarCadastro();

      if (erroCadastro) {
        setErro(erroCadastro);
        return;
      }
    }

    setCarregando(true);

    try {
      const resposta = await fetch(
        criandoConta ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(criandoConta ? cadastro : login),
        },
      );
      const dados = await lerRespostaJson(resposta);

      if (!resposta.ok) {
        throw new Error(dados.erro || "Nao foi possivel entrar.");
      }

      if (criandoConta) {
        setCadastro(cadastroInicial);
        setLogin({ ...loginInicial, email: cadastro.email });
        setModo("entrar");
        setSucesso("Conta criada. Entre com seu email e senha.");
      } else {
        onEntrar(dados.usuario);
        setLogin(loginInicial);
        navigate("/dashboard");
      }
    } catch (erroAtual) {
      setErro(erroAtual.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span>CleanHost</span>
          <h1>{criandoConta ? "Criar conta" : "Entrar"}</h1>
          <p>
            Acesse o painel para gerenciar limpezas, prestadores de servico e
            apartamentos.
          </p>
        </div>

        <div className="auth-mode-switch">
          <button
            type="button"
            className={!criandoConta ? "active" : ""}
            onClick={() => {
              setModo("entrar");
              setErro("");
              setSucesso("");
            }}
          >
            Entrar
          </button>
          <button
            type="button"
            className={criandoConta ? "active" : ""}
            onClick={() => {
              setModo("criar");
              setErro("");
              setSucesso("");
            }}
          >
            Criar conta
          </button>
        </div>

        <form className="login-form" onSubmit={enviarFormulario}>
          {criandoConta && (
            <div className="login-field">
              <label htmlFor="nome">Nome</label>
              <input
                id="nome"
                name="nome"
                type="text"
                value={cadastro.nome}
                onChange={atualizarCadastro}
                placeholder="Seu nome"
                required
              />
            </div>
          )}

          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={criandoConta ? cadastro.email : login.email}
              onChange={criandoConta ? atualizarCadastro : atualizarLogin}
              placeholder="voce@email.com"
              required
            />
          </div>

          {criandoConta && (
            <>
              <div className="login-field">
                <label htmlFor="confirmarEmail">Confirmar email</label>
                <input
                  id="confirmarEmail"
                  name="confirmarEmail"
                  type="email"
                  value={cadastro.confirmarEmail}
                  onChange={atualizarCadastro}
                  placeholder="Digite o email novamente"
                  required
                />
              </div>

              <div className="login-field">
                <label htmlFor="telefone">Numero</label>
                <input
                  id="telefone"
                  name="telefone"
                  type="tel"
                  value={cadastro.telefone}
                  onChange={atualizarCadastro}
                  placeholder="(11) 99999-9999"
                  required
                />
              </div>

              <div className="login-field">
                <label htmlFor="cpf">CPF</label>
                <input
                  id="cpf"
                  name="cpf"
                  type="text"
                  value={cadastro.cpf}
                  onChange={atualizarCadastro}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  required
                />
              </div>
            </>
          )}

          <div className="login-field">
            <label htmlFor="senha">Senha</label>
            <div className="password-input">
              <input
                id="senha"
                name="senha"
                type={mostrarSenha ? "text" : "password"}
                value={criandoConta ? cadastro.senha : login.senha}
                onChange={criandoConta ? atualizarCadastro : atualizarLogin}
                placeholder="Digite sua senha"
                minLength={6}
                required
              />
              <button
                type="button"
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setMostrarSenha((mostrar) => !mostrar)}
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="18"
                  viewBox="0 0 24 24"
                  width="18"
                >
                  <path
                    d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </button>
            </div>
          </div>

          {criandoConta && (
            <div className="login-field">
              <label htmlFor="confirmarSenha">Confirmar senha</label>
              <div className="password-input">
                <input
                  id="confirmarSenha"
                  name="confirmarSenha"
                  type={mostrarSenha ? "text" : "password"}
                  value={cadastro.confirmarSenha}
                  onChange={atualizarCadastro}
                  placeholder="Digite a senha novamente"
                  minLength={6}
                  required
                />
              </div>
            </div>
          )}

          {erro && <p className="login-error">{erro}</p>}
          {sucesso && <p className="login-success">{sucesso}</p>}

          <div className="login-actions">
            <button type="submit" disabled={carregando}>
              {carregando
                ? "Aguarde..."
                : criandoConta
                  ? "Criar conta"
                  : "Entrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;
