import Usuario from "./Usuario";
import Botao from "./Botao";
import Senha from "./Senha";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./login.css";

function Login({ irparaDashboard }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");

  const navigate = useNavigate();

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span>CleanHost</span>
          <h1>Entrar</h1>
          <p>Acesse o painel para gerenciar limpezas, funcionarios e apartamentos.</p>
        </div>

        <div className="login-form">
          <Usuario onChange={(evento) => setUsuario(evento.target.value)} />
          <Senha
            type="password"
            onChange={(evento) => setSenha(evento.target.value)}
          />
          <div className="login-actions">
            <Botao texto="Entrar" onClick={() => navigate("/dashboard")} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
