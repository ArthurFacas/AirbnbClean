function Senha({ onChange }) {
  return (
    <div className="login-field">
      <label>Senha</label>
      <input type="password" onChange={onChange} placeholder="Digite sua senha" />
    </div>
  );
}

export default Senha;
