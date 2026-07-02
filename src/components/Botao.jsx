import { useNavigate } from "react-router-dom";

function Botao({ texto, onClick }) {
  return (
    <div>
      <button onClick={onClick}>{texto}</button>
    </div>
  );
}

export default Botao;
