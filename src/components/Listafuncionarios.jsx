import { useNavigate } from "react-router-dom";

function calcularIdade(nascimento) {
  const hoje = new Date();
  const dataNascimento = new Date(`${nascimento}T00:00:00`);
  let idade = hoje.getFullYear() - dataNascimento.getFullYear();
  const mesAtual = hoje.getMonth();
  const diaAtual = hoje.getDate();
  const mesNascimento = dataNascimento.getMonth();
  const diaNascimento = dataNascimento.getDate();

  if (
    mesAtual < mesNascimento ||
    (mesAtual === mesNascimento && diaAtual < diaNascimento)
  ) {
    idade -= 1;
  }

  return idade;
}

function formatarData(data) {
  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

function montarLinkPrestador(funcionarioId) {
  return `${window.location.origin}${window.location.pathname}#/prestador/${funcionarioId}`;
}

function montarLinkWhatsapp(funcionario) {
  const telefone = String(funcionario.telefone || "").replace(/\D/g, "");
  const linkPrestador = montarLinkPrestador(funcionario.id);
  const mensagem = [
    `Ola, ${funcionario.nome}.`,
    "Voce recebeu um convite para acessar suas tarefas da CleanHost.",
    "Abra o link, crie seu login e senha de prestador de servico e veja somente as tarefas designadas para voce:",
    linkPrestador,
  ].join("\n");

  return telefone
    ? `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`
    : "";
}

function Listafuncionarios({ funcionarios, onExcluir }) {
  const navigate = useNavigate();

  return (
    <div className="content-page">
      <div className="page-title-row">
        <div>
          <h1>Prestadores de servico</h1>
        </div>

        <button
          className="primary-action"
          onClick={() => navigate("/dashboard/cadastro-funcionario")}
        >
          Cadastrar prestador de servico
        </button>
      </div>

      <div className="list-grid">
        {funcionarios.map((funcionario) => (
          <div className="info-card" key={funcionario.id}>
            <h3>{funcionario.nome}</h3>
            <p>Nascimento: {formatarData(funcionario.nascimento)}</p>
            <p>Idade: {calcularIdade(funcionario.nascimento)} anos</p>
            <p>Email: {funcionario.email}</p>
            <p>WhatsApp: {funcionario.telefone || "Nao informado"}</p>
            <p>Bairro: {funcionario.bairro || "Nao informado"}</p>
            <p>Cargo: {funcionario.cargo}</p>
            <div className="provider-actions">
              <a
                className="secondary-action"
                href={`#/prestador/${funcionario.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver acesso
              </a>
              {montarLinkWhatsapp(funcionario) ? (
                <a
                  className="primary-action"
                  href={montarLinkWhatsapp(funcionario)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Enviar WhatsApp
                </a>
              ) : (
                <button className="secondary-action" type="button" disabled>
                  Sem WhatsApp
                </button>
              )}
            </div>
            <button
              className="danger-action"
              onClick={() => onExcluir(funcionario.id)}
            >
              Excluir
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Listafuncionarios;
