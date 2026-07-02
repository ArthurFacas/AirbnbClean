import { useState } from "react";
import { Navigate, Routes, Route } from "react-router-dom";

import Login from "./components/login";
import Dashboard from "./components/Dashboard";
import Listafuncionarios from "./components/Listafuncionarios";
import Cadastrarfuncionario from "./components/Cadastrarfuncionario";
import CadastroApartamento from "./components/Cadastroapartamento";
import Listaapartamentos from "./components/Listaapartamentos";
import Tarefas from "./components/Tarefas";

function App() {
  const [funcionarios, setFuncionarios] = useState([
    {
      id: 1,
      nome: "Luan",
      nascimento: "2001-03-12",
      email: "luan@email.com",
      cargo: "Faxina",
    },
    {
      id: 2,
      nome: "Fernanda",
      nascimento: "1995-09-20",
      email: "fernanda@email.com",
      cargo: "Gestao",
    },
    {
      id: 3,
      nome: "Lucia",
      nascimento: "1998-06-04",
      email: "lucia@email.com",
      cargo: "Faxina",
    },
  ]);
  const [apartamentos, setApartamentos] = useState([
    {
      id: 1,
      numero: "101",
      rua: "xxxxxxxxxx",
      host: "Aline",
      dataReserva: "2026-07-10",
      checkout: "2026-07-12",
      horaCheckout: "11:00",
    },
    {
      id: 2,
      numero: "404",
      rua: "xxxxxxxxxx",
      host: "Aline",
      dataReserva: "2026-07-15",
      checkout: "2026-07-29",
      horaCheckout: "11:00",
    },
  ]);
  const [tarefas, setTarefas] = useState([
    {
      id: 1,
      apartamento: "101",
      descricao: "Limpeza apos checkout",
      checkout: "2026-07-01",
      horaCheckout: "11:00",
      status: "Pendente",
      funcionarioId: "",
    },
    {
      id: 2,
      apartamento: "204",
      descricao: "Limpeza completa",
      checkout: "2026-07-02",
      horaCheckout: "10:00",
      status: "Pendente",
      funcionarioId: "",
    },
    {
      id: 3,
      apartamento: "305",
      descricao: "Reposicao e limpeza",
      checkout: "2026-07-02",
      horaCheckout: "12:30",
      status: "Pendente",
      funcionarioId: "",
    },
  ]);

  const tarefasPendentes = tarefas.filter(
    (tarefa) => tarefa.status === "Pendente"
  );

  function cadastrarFuncionario(funcionario) {
    setFuncionarios((funcionariosAtuais) => [
      ...funcionariosAtuais,
      { ...funcionario, id: Date.now() },
    ]);
  }

  function excluirFuncionario(id) {
    setFuncionarios((funcionariosAtuais) =>
      funcionariosAtuais.filter((funcionario) => funcionario.id !== id)
    );
  }

  function cadastrarApartamento(apartamento) {
    setApartamentos((apartamentosAtuais) => [
      ...apartamentosAtuais,
      { ...apartamento, id: Date.now() },
    ]);
  }

  function excluirApartamento(id) {
    setApartamentos((apartamentosAtuais) =>
      apartamentosAtuais.filter((apartamento) => apartamento.id !== id)
    );
  }

  function atribuirFuncionarioTarefa(tarefaId, funcionarioId) {
    setTarefas((tarefasAtuais) =>
      tarefasAtuais.map((tarefa) =>
        tarefa.id === tarefaId ? { ...tarefa, funcionarioId } : tarefa
      )
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <Dashboard
            apartamentoTotal={apartamentos.length}
            funcionarioTotal={funcionarios.length}
            funcionarios={funcionarios}
            onAtribuirFuncionario={atribuirFuncionarioTarefa}
            tarefasPendentes={tarefasPendentes}
          />
        }
      >
        <Route
          path="lista-funcionarios"
          element={
            <Listafuncionarios
              funcionarios={funcionarios}
              onExcluir={excluirFuncionario}
            />
          }
        />
        <Route
          path="cadastro-funcionario"
          element={
            <Cadastrarfuncionario onCadastrar={cadastrarFuncionario} />
          }
        />
        <Route
          path="cadastro-apartamento"
          element={
            <CadastroApartamento onCadastrar={cadastrarApartamento} />
          }
        />
        <Route
          path="lista-apartamentos"
          element={
            <Listaapartamentos
              apartamentos={apartamentos}
              onExcluir={excluirApartamento}
            />
          }
        />
        <Route
          path="tarefas"
          element={
            <Tarefas
              funcionarios={funcionarios}
              onAtribuirFuncionario={atribuirFuncionarioTarefa}
              tarefas={tarefas}
            />
          }
        />
      </Route>

      <Route
        path="/lista-funcionarios"
        element={<Navigate to="/dashboard/lista-funcionarios" replace />}
      />
      <Route
        path="/Cadastro-funcionario"
        element={<Navigate to="/dashboard/cadastro-funcionario" replace />}
      />
      <Route
        path="/cadastro-apartamento"
        element={<Navigate to="/dashboard/cadastro-apartamento" replace />}
      />
      <Route
        path="/lista-apartamentos"
        element={<Navigate to="/dashboard/lista-apartamentos" replace />}
      />
      <Route
        path="/limpezas"
        element={<Navigate to="/dashboard/tarefas" replace />}
      />
      <Route
        path="/tarefas"
        element={<Navigate to="/dashboard/tarefas" replace />}
      />
    </Routes>
  );
}

export default App;
