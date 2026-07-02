function Usuario({ onChange }) {
  return (
    <div className="login-field">
      <label>Usuario</label>
      <input type="text" onChange={onChange} placeholder="Digite seu usuario" />
    </div>
  );
}

export default Usuario;
