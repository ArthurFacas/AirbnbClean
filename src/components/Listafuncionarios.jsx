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
  if (!data) {
    return "Nao informado";
  }

  return new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
}

function formatarIdade(nascimento) {
  return nascimento ? `${calcularIdade(nascimento)} anos` : "Nao informado";
}

function obterIniciais(nome) {
  const partesNome = String(nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (partesNome.length === 0) {
    return "PS";
  }

  return partesNome
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

function obterValor(valor, fallback = "Nao informado") {
  return valor ? valor : fallback;
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
    <div className="content-page providers-admin-page">
      <div className="page-title-row providers-admin-header">
        <div>
          <h1>Prestadores de servico</h1>
          <p>Gerencie os prestadores cadastrados.</p>
        </div>

        <button
          className="primary-action"
          onClick={() => navigate("/dashboard/cadastro-funcionario")}
        >
          Cadastrar prestador de servico
        </button>
      </div>

      <div className="providers-toolbar" aria-label="Ferramentas de prestadores">
        <label className="providers-search">
          <span>Buscar</span>
          <input type="search" placeholder="Buscar prestador" />
        </label>
        <strong>
          {funcionarios.length}{" "}
          {funcionarios.length === 1 ? "prestador" : "prestadores"}
        </strong>
      </div>

      {funcionarios.length === 0 ? (
        <div className="providers-empty-state">
          <div aria-hidden="true">PS</div>
          <h2>Nenhum prestador cadastrado</h2>
          <p>Cadastre o primeiro prestador para atribuir e acompanhar tarefas.</p>
          <button
            className="primary-action"
            onClick={() => navigate("/dashboard/cadastro-funcionario")}
          >
            Cadastrar primeiro prestador
          </button>
        </div>
      ) : (
        <div className="providers-grid">
          {funcionarios.map((funcionario) => (
            <article className="info-card provider-admin-card" key={funcionario.id}>
              <div className="provider-card-header">
                <div className="provider-avatar" aria-hidden="true">
                  {obterIniciais(funcionario.nome)}
                </div>
                <div>
                  <h3>{obterValor(funcionario.nome, "Prestador sem nome")}</h3>
                  <p>{obterValor(funcionario.cargo, "Cargo nao informado")}</p>
                </div>
                {funcionario.status && (
                  <strong className="provider-status-badge">
                    {funcionario.status}
                  </strong>
                )}
              </div>

              <div className="provider-info-grid">
                <div>
                  <span>Nascimento</span>
                  <strong>{formatarData(funcionario.nascimento)}</strong>
                </div>
                <div>
                  <span>Idade</span>
                  <strong>{formatarIdade(funcionario.nascimento)}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{obterValor(funcionario.email)}</strong>
                </div>
                <div>
                  <span>WhatsApp</span>
                  <strong>{obterValor(funcionario.telefone)}</strong>
                </div>
                <div>
                  <span>Bairro</span>
                  <strong>{obterValor(funcionario.bairro)}</strong>
                </div>
                <div>
                  <span>Cargo</span>
                  <strong>{obterValor(funcionario.cargo)}</strong>
                </div>
              </div>

              <div className="provider-actions">
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() =>
                    navigate(`/prestador-preview/${funcionario.id}`)
                  }
                >
                  Ver acesso
                </button>
                {montarLinkWhatsapp(funcionario) ? (
                  <a
                    className="whatsapp-action"
                    href={montarLinkWhatsapp(funcionario)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Enviar link
                  </a>
                ) : (
                  <button className="secondary-action" type="button" disabled>
                    Sem WhatsApp
                  </button>
                )}
                <button
                  className="danger-action"
                  onClick={() => onExcluir(funcionario.id)}
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default Listafuncionarios;
