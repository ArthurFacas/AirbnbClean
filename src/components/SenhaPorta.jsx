import { useState } from "react";

function mascararSenha(valor) {
  const tamanho = Math.max(String(valor || "").length, 6);

  return "*".repeat(tamanho);
}

function SenhaPorta({ senha }) {
  const [visivel, setVisivel] = useState(false);
  const senhaNormalizada = String(senha || "").trim();

  if (!senhaNormalizada) {
    return null;
  }

  return (
    <div className="door-password-box">
      <span>Senha da porta</span>
      <div>
        <strong>{visivel ? senhaNormalizada : mascararSenha(senhaNormalizada)}</strong>
        <button
          type="button"
          aria-label={visivel ? "Ocultar senha da porta" : "Ver senha da porta"}
          onClick={() => setVisivel((valorAtual) => !valorAtual)}
        >
          {visivel ? "Ocultar" : "Ver"}
        </button>
      </div>
    </div>
  );
}

export default SenhaPorta;
