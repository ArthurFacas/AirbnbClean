function Usuario({ onChange }) {
  return (
    <div>
      <label>Usuario</label>
      <input onChange={onChange}></input>
    </div>
  );
}

export default Usuario;
