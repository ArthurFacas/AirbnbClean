import Usuario from "./Usuario";
import Botao from "./Botao";
import Senha from "./Senha";
import { useState } from "react";

function Login({ irparaDashboard }) {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  return (
    <div className="login">
      <h1>Login</h1>
      <Usuario onChange={(evento) => setUsuario(evento.target.value)} />
      <Senha
        type="password"
        onChange={(evento) => setSenha(evento.target.value)}
      />
      <Botao onClick={irparaDashboard} />
    </div>
  );
}

export default Login;
