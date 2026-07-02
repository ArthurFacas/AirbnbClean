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

function Listafuncionarios({ funcionarios, onExcluir }) {
  const navigate = useNavigate();

  return (
    <div className="content-page">
      <div className="page-title-row">
        <div>
          <h1>Funcionarios</h1>
          <p>Lista de funcionarios cadastrados.</p>
        </div>

        <button
          className="primary-action"
          onClick={() => navigate("/dashboard/cadastro-funcionario")}
        >
          Cadastrar funcionario
        </button>
      </div>

      <div className="list-grid">
        {funcionarios.map((funcionario) => (
          <div className="info-card" key={funcionario.id}>
            <h3>{funcionario.nome}</h3>
            <p>Nascimento: {formatarData(funcionario.nascimento)}</p>
            <p>Idade: {calcularIdade(funcionario.nascimento)} anos</p>
            <p>Email: {funcionario.email}</p>
            <p>Cargo: {funcionario.cargo}</p>
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
