import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./login.css";

const loginInicial = {
  email: "",
  senha: "",
};

const prestadorInicial = {
  email: "",
  senha: "",
};

const conviteInicial = {
  nome: "",
  email: "",
  confirmarEmail: "",
  cargo: "",
  senha: "",
  confirmarSenha: "",
};

function salvarSessaoPrestador(prestadorId, sessao) {
  const chave = `cleanhost:prestador:${prestadorId}`;

  try {
    localStorage.setItem(chave, JSON.stringify(sessao));
    sessionStorage.removeItem(chave);
  } catch {
    sessionStorage.setItem(chave, JSON.stringify(sessao));
  }
}

function Login({ onEntrar }) {
  const { codigo } = useParams();
  const location = useLocation();
  const [modo, setModo] = useState(
    location.pathname.startsWith("/convite/") ? "convite" : "selecionar",
  );
  const [login, setLogin] = useState(loginInicial);
  const [prestador, setPrestador] = useState(prestadorInicial);
  const [convite, setConvite] = useState(conviteInicial);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const navigate = useNavigate();
  const codigoConvite = codigo || "";

  useEffect(() => {
    async function carregarConvite() {
      if (!location.pathname.startsWith("/convite/")) {
        setModo("selecionar");
        return;
      }

      setModo("convite");
      setErro("");
      setSucesso("");

      if (!codigoConvite) {
        setErro("Convite nao informado.");
        return;
      }

      try {
        const resposta = await fetch(
          `/api/invite?codigo=${encodeURIComponent(codigoConvite)}`,
        );
        const dados = await lerRespostaJson(resposta);

        if (!resposta.ok) {
          throw new Error(dados.erro || "Convite invalido.");
        }

        setConvite((dadosAtuais) => ({
          ...dadosAtuais,
          nome: dados.nome || "",
          email: dados.email || "",
          confirmarEmail: dados.email || "",
          cargo: dados.cargo || "",
        }));
      } catch (erroAtual) {
        setErro(erroAtual.message);
      }
    }

    carregarConvite();
  }, [codigoConvite, location.pathname]);

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

  function voltarSelecao() {
    setModo("selecionar");
    setErro("");
    setSucesso("");
    navigate("/");
  }

  function atualizarLogin(event) {
    const { name, value } = event.target;
    setLogin((dados) => ({ ...dados, [name]: value }));
  }

  function atualizarPrestador(event) {
    const { name, value } = event.target;
    setPrestador((dados) => ({ ...dados, [name]: value }));
  }

  function atualizarConvite(event) {
    const { name, value } = event.target;
    setConvite((dados) => ({
      ...dados,
      [name]: value,
    }));
  }

  function validarConvite() {
    if (!codigoConvite) {
      return "Convite nao informado.";
    }

    if (convite.email.trim().toLowerCase() !== convite.confirmarEmail.trim().toLowerCase()) {
      return "Os emails precisam ser iguais.";
    }

    if (convite.senha.length < 6) {
      return "A senha precisa ter pelo menos 6 caracteres.";
    }

    if (convite.senha !== convite.confirmarSenha) {
      return "As senhas precisam ser iguais.";
    }

    return "";
  }

  async function entrarGestao(event) {
    event.preventDefault();

    if (carregando) {
      return;
    }

    setErro("");
    setSucesso("");
    setCarregando(true);

    try {
      const resposta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login),
      });
      const dados = await lerRespostaJson(resposta);

      if (!resposta.ok) {
        throw new Error(dados.erro || "Nao foi possivel entrar.");
      }

      onEntrar(dados.usuario);
      setLogin(loginInicial);
      navigate("/dashboard");
    } catch (erroAtual) {
      setErro(erroAtual.message);
    } finally {
      setCarregando(false);
    }
  }

  async function entrarPrestador(event) {
    event.preventDefault();

    if (carregando) {
      return;
    }

    setErro("");
    setSucesso("");
    setCarregando(true);

    try {
      const resposta = await fetch("/api/provider/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prestador),
      });
      const dados = await lerRespostaJson(resposta);

      if (!resposta.ok) {
        throw new Error(dados.erro || "Nao foi possivel entrar.");
      }

      const sessaoPrestador = {
        ...dados.prestador,
        token: dados.token,
      };

      salvarSessaoPrestador(dados.prestador.id, sessaoPrestador);
      setPrestador(prestadorInicial);
      navigate(`/prestador/${dados.prestador.id}`);
    } catch (erroAtual) {
      setErro(erroAtual.message);
    } finally {
      setCarregando(false);
    }
  }

  async function cadastrarGestora(event) {
    event.preventDefault();

    if (carregando) {
      return;
    }

    const erroConvite = validarConvite();

    if (erroConvite) {
      setErro(erroConvite);
      return;
    }

    setErro("");
    setSucesso("");
    setCarregando(true);

    try {
      const resposta = await fetch("/api/auth/manager-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmarEmail: convite.confirmarEmail,
          senha: convite.senha,
          confirmarSenha: convite.confirmarSenha,
          codigo: codigoConvite,
        }),
      });
      const dados = await lerRespostaJson(resposta);

      if (!resposta.ok) {
        throw new Error(dados.erro || "Nao foi possivel criar a gestora.");
      }

      setConvite(conviteInicial);
      setModo(dados.tipo === "Gestora" ? "gestao" : "prestador");
      setLogin({ ...loginInicial, email: dados.email || "" });
      setPrestador((dadosAtuais) => ({
        ...dadosAtuais,
        email: dados.email || "",
      }));
      setSucesso(
        dados.tipo === "Gestora"
          ? "Conta de gestora criada. Entre pela area de gestao."
          : "Acesso de prestador criado. Entre como prestador.",
      );
      navigate("/");
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
          <h1>
            {modo === "selecionar"
              ? "Acesso restrito"
              : modo === "prestador"
                ? "Sou prestador"
                : modo === "convite"
                  ? "Criar meu acesso"
                  : "Sou da gestao"}
          </h1>
          <p>
            {modo === "selecionar"
              ? "Escolha como deseja acessar o sistema."
              : modo === "prestador"
                ? "Entre para ver somente as tarefas designadas para voce."
                : modo === "convite"
                  ? "Crie sua senha usando o convite enviado pelo Master."
                  : "Acesse o painel administrativo da CleanHost."}
          </p>
        </div>

        {modo === "selecionar" && (
          <>
            <div className="access-choice-grid">
              <button
                className="access-choice-card"
                type="button"
                onClick={() => {
                  setModo("prestador");
                  setErro("");
                  setSucesso("");
                }}
              >
                <span>PS</span>
                <strong>Sou prestador</strong>
                <small>Acessar tarefas de limpeza</small>
              </button>
              <button
                className="access-choice-card"
                type="button"
                onClick={() => {
                  setModo("gestao");
                  setErro("");
                  setSucesso("");
                }}
              >
                <span>GE</span>
                <strong>Sou da gestao</strong>
                <small>Entrar no painel administrativo</small>
              </button>
            </div>
            <p className="login-note">
              Acesso exclusivo para usuarios autorizados.
            </p>
          </>
        )}

        {modo === "gestao" && (
          <form className="login-form" onSubmit={entrarGestao}>
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={login.email}
                onChange={atualizarLogin}
                placeholder="voce@email.com"
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="senha">Senha</label>
              <div className="password-input">
                <input
                  id="senha"
                  name="senha"
                  type={mostrarSenha ? "text" : "password"}
                  value={login.senha}
                  onChange={atualizarLogin}
                  placeholder="Digite sua senha"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setMostrarSenha((mostrar) => !mostrar)}
                >
                  {mostrarSenha ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            {erro && <p className="login-error">{erro}</p>}
            {sucesso && <p className="login-success">{sucesso}</p>}

            <div className="login-actions">
              <button type="submit" disabled={carregando}>
                {carregando ? "Aguarde..." : "Entrar"}
              </button>
            </div>

            <button className="login-back-button" type="button" onClick={voltarSelecao}>
              Voltar
            </button>
          </form>
        )}

        {modo === "prestador" && (
          <form className="login-form" onSubmit={entrarPrestador}>
            <div className="login-field">
              <label htmlFor="prestadorEmail">Email</label>
              <input
                id="prestadorEmail"
                name="email"
                type="email"
                value={prestador.email}
                onChange={atualizarPrestador}
                placeholder="Seu email cadastrado"
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="prestadorSenha">Senha</label>
              <div className="password-input">
                <input
                  id="prestadorSenha"
                  name="senha"
                  type={mostrarSenha ? "text" : "password"}
                  value={prestador.senha}
                  onChange={atualizarPrestador}
                  placeholder="Digite sua senha"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setMostrarSenha((mostrar) => !mostrar)}
                >
                  {mostrarSenha ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            {erro && <p className="login-error">{erro}</p>}

            <div className="login-actions">
              <button type="submit" disabled={carregando}>
                {carregando ? "Aguarde..." : "Entrar"}
              </button>
            </div>

            <button className="login-back-button" type="button" onClick={voltarSelecao}>
              Voltar
            </button>
          </form>
        )}

        {modo === "convite" && (
          <form className="login-form" onSubmit={cadastrarGestora}>
            <div className="login-field">
              <label htmlFor="conviteNome">Nome cadastrado</label>
              <input
                id="conviteNome"
                name="nome"
                type="text"
                value={convite.nome}
                onChange={atualizarConvite}
                placeholder="Seu nome"
                readOnly
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="conviteCargo">Cargo definido</label>
              <input
                id="conviteCargo"
                name="cargo"
                type="text"
                value={convite.cargo}
                readOnly
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="conviteEmail">Email</label>
              <input
                id="conviteEmail"
                name="email"
                type="email"
                value={convite.email}
                onChange={atualizarConvite}
                placeholder="voce@email.com"
                readOnly
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="conviteConfirmarEmail">Confirmar email</label>
              <input
                id="conviteConfirmarEmail"
                name="confirmarEmail"
                type="email"
                value={convite.confirmarEmail}
                onChange={atualizarConvite}
                placeholder="Digite o email novamente"
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="conviteSenha">Criar senha</label>
              <div className="password-input">
                <input
                  id="conviteSenha"
                  name="senha"
                  type={mostrarSenha ? "text" : "password"}
                  value={convite.senha}
                  onChange={atualizarConvite}
                  placeholder="Digite sua senha"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setMostrarSenha((mostrar) => !mostrar)}
                >
                  {mostrarSenha ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="conviteConfirmarSenha">Confirmar senha</label>
              <input
                id="conviteConfirmarSenha"
                name="confirmarSenha"
                type={mostrarSenha ? "text" : "password"}
                value={convite.confirmarSenha}
                onChange={atualizarConvite}
                placeholder="Digite a senha novamente"
                minLength={6}
                required
              />
            </div>

            {erro && <p className="login-error">{erro}</p>}
            {sucesso && <p className="login-success">{sucesso}</p>}

            <div className="login-actions">
              <button type="submit" disabled={carregando || !codigoConvite}>
                {carregando ? "Aguarde..." : "Criar meu acesso"}
              </button>
            </div>

            <button className="login-back-button" type="button" onClick={voltarSelecao}>
              Voltar
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default Login;
