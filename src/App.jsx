import { useCallback, useEffect, useState } from "react";
import { Navigate, Routes, Route } from "react-router-dom";

import Login from "./components/login";
import Dashboard from "./components/Dashboard";
import Listafuncionarios from "./components/Listafuncionarios";
import Cadastrarfuncionario from "./components/Cadastrarfuncionario";
import CadastroApartamento from "./components/Cadastroapartamento";
import Listaapartamentos from "./components/Listaapartamentos";
import PortalPrestador from "./components/PortalPrestador";
import Tarefas from "./components/Tarefas";
import { buscarReservasIcal } from "./utils/ical";

function normalizarTelefoneWhatsapp(telefone) {
  const somenteNumeros = String(telefone || "").replace(/\D/g, "");

  if (somenteNumeros.length === 10 || somenteNumeros.length === 11) {
    return `55${somenteNumeros}`;
  }

  return somenteNumeros;
}

function atribuirTarefasAoPrestadorUnico(tarefasAtuais, funcionariosAtuais) {
  if (funcionariosAtuais.length !== 1) {
    return tarefasAtuais;
  }

  const funcionarioUnico = funcionariosAtuais[0];
  const precisaAtribuir = tarefasAtuais.some(
    (tarefa) => String(tarefa.funcionarioId) !== String(funcionarioUnico.id),
  );

  if (!precisaAtribuir) {
    return tarefasAtuais;
  }

  return tarefasAtuais.map((tarefa) =>
    String(tarefa.funcionarioId) === String(funcionarioUnico.id)
      ? tarefa
      : { ...tarefa, funcionarioId: funcionarioUnico.id },
  );
}

function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(() => {
    try {
      const usuarioSalvo = sessionStorage.getItem("cleanhost:usuario");
      return usuarioSalvo ? JSON.parse(usuarioSalvo) : null;
    } catch {
      return null;
    }
  });
  const [funcionarios, setFuncionarios] = useState([]);
  const [apartamentos, setApartamentos] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [bancoCarregado, setBancoCarregado] = useState(false);

  const carregarEstadoUsuario = useCallback(async function carregarEstadoUsuario(
    usuarioId,
  ) {
    const resposta = await fetch(
      `/api/state?ownerId=${encodeURIComponent(usuarioId)}`,
    );

    if (!resposta.ok) {
      throw new Error("Nao foi possivel carregar o banco.");
    }

    const estado = await resposta.json();

    setFuncionarios(
      Array.isArray(estado.funcionarios) ? estado.funcionarios : [],
    );
    setApartamentos(
      Array.isArray(estado.apartamentos) ? estado.apartamentos : [],
    );
    setTarefas(Array.isArray(estado.tarefas) ? estado.tarefas : []);
  }, []);

  useEffect(() => {
    async function carregarBanco() {
      if (!usuarioLogado?.id) {
        setFuncionarios([]);
        setApartamentos([]);
        setTarefas([]);
        setBancoCarregado(true);
        return;
      }

      try {
        setBancoCarregado(false);
        await carregarEstadoUsuario(usuarioLogado.id);
      } catch {
        setFuncionarios([]);
        setApartamentos([]);
        setTarefas([]);
      } finally {
        setBancoCarregado(true);
      }
    }

    carregarBanco();
  }, [carregarEstadoUsuario, usuarioLogado?.id]);

  useEffect(() => {
    if (usuarioLogado) {
      sessionStorage.setItem("cleanhost:usuario", JSON.stringify(usuarioLogado));
    } else {
      sessionStorage.removeItem("cleanhost:usuario");
    }
  }, [usuarioLogado]);

  useEffect(() => {
    if (!bancoCarregado || !usuarioLogado?.id) {
      return;
    }

    fetch("/api/state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerId: usuarioLogado.id,
        funcionarios,
        apartamentos,
        tarefas,
      }),
    }).catch(() => {});
  }, [apartamentos, bancoCarregado, funcionarios, tarefas, usuarioLogado?.id]);

  const tarefasPendentes = tarefas.filter(
    (tarefa) => tarefa.status === "Pendente",
  );

  async function salvarEstadoAtualizado(estadoAtualizado) {
    if (!usuarioLogado?.id) {
      return;
    }

    const resposta = await fetch("/api/state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ownerId: usuarioLogado.id,
        funcionarios: estadoAtualizado.funcionarios,
        apartamentos: estadoAtualizado.apartamentos,
        tarefas: estadoAtualizado.tarefas,
      }),
    });

    if (!resposta.ok) {
      throw new Error("Nao foi possivel salvar no banco.");
    }
  }

  async function cadastrarFuncionario(funcionario) {
    const novoFuncionario = {
      ...funcionario,
      id: Date.now(),
      bairro: String(funcionario.bairro || "").trim(),
      telefone: normalizarTelefoneWhatsapp(funcionario.telefone),
    };
    const funcionariosAtualizados = [...funcionarios, novoFuncionario];
    const tarefasAtualizadas = atribuirTarefasAoPrestadorUnico(
      tarefas,
      funcionariosAtualizados,
    );

    await salvarEstadoAtualizado({
      funcionarios: funcionariosAtualizados,
      apartamentos,
      tarefas: tarefasAtualizadas,
    });
    setFuncionarios(funcionariosAtualizados);
    setTarefas(tarefasAtualizadas);

    return novoFuncionario;
  }

  function excluirFuncionario(id) {
    setFuncionarios((funcionariosAtuais) => {
      const funcionariosAtualizados = funcionariosAtuais.filter(
        (funcionario) => funcionario.id !== id,
      );

      setTarefas((tarefasAtuais) =>
        atribuirTarefasAoPrestadorUnico(tarefasAtuais, funcionariosAtualizados),
      );

      return funcionariosAtualizados;
    });
  }

  function obterDataReserva(valor) {
    if (!valor) {
      return "";
    }

    return String(valor).slice(0, 10);
  }

  function montarTarefasIcal(
    apartamento,
    apartamentoId,
    reservas,
    reservasBase = reservas,
  ) {
    const datasCheckin = new Set(
      reservasBase
        .map((reserva) => obterDataReserva(reserva.checkin))
        .filter(Boolean),
    );

    return reservas.map((reserva, index) => {
      const dataCheckout = obterDataReserva(reserva.checkout);
      const temCheckinNoMesmoDia = datasCheckin.has(dataCheckout);

      return {
        id: apartamentoId * 1000 + index + 1,
        apartamento: apartamento.numero,
        bairroApartamento: apartamento.Bairro || "",
        descricao: reserva.resumo || "Limpeza apos checkout Airbnb",
        checkin: obterDataReserva(reserva.checkin),
        checkout: dataCheckout,
        horaCheckout: apartamento.horaCheckout || "11:00",
        status: "Pendente",
        funcionarioId: funcionarios.length === 1 ? funcionarios[0].id : "",
        origem: "Airbnb iCal",
        apartamentoId,
        prioridade: temCheckinNoMesmoDia,
        motivoPrioridade: temCheckinNoMesmoDia
          ? "Checkout e check-in no mesmo dia"
          : "",
      };
    });
  }

  async function cadastrarApartamento(apartamento) {
    const apartamentoId = Date.now();
    const calendario = apartamento.ICALL
      ? await buscarReservasIcal(apartamento.ICALL)
      : null;
    const reservas = calendario?.reservas || [];
    const apartamentoCompleto = calendario
      ? {
          ...apartamento,
          ICALL: calendario.urlIcal,
          reservas,
          dataReserva: calendario.proximaReserva.checkin,
          checkout: calendario.proximaReserva.checkout,
          horaCheckout: apartamento.horaCheckout || "11:00",
        }
      : { ...apartamento };

    setApartamentos((apartamentosAtuais) => [
      ...apartamentosAtuais,
      { ...apartamentoCompleto, id: apartamentoId },
    ]);

    if (reservas.length) {
      setTarefas((tarefasAtuais) => [
        ...tarefasAtuais,
        ...montarTarefasIcal(
          apartamentoCompleto,
          apartamentoId,
          reservas,
          calendario?.todasReservas || reservas,
        ),
      ]);
    }
  }

  function excluirApartamento(id) {
    setApartamentos((apartamentosAtuais) =>
      apartamentosAtuais.filter((apartamento) => apartamento.id !== id),
    );
    setTarefas((tarefasAtuais) =>
      tarefasAtuais.filter((tarefa) => tarefa.apartamentoId !== id),
    );
  }

  function atribuirFuncionarioTarefa(tarefaId, funcionarioId) {
    setTarefas((tarefasAtuais) =>
      tarefasAtuais.map((tarefa) =>
        tarefa.id === tarefaId ? { ...tarefa, funcionarioId } : tarefa,
      ),
    );
  }

  function atualizarTarefa(tarefaId, campos) {
    setTarefas((tarefasAtuais) =>
      tarefasAtuais.map((tarefa) =>
        tarefa.id === tarefaId ? { ...tarefa, ...campos } : tarefa,
      ),
    );
  }

  function concluirTarefa(tarefaId) {
    setTarefas((tarefasAtuais) =>
      tarefasAtuais.map((tarefa) =>
        tarefa.id === tarefaId
          ? {
              ...tarefa,
              status: "Concluida",
              concluidaEm: tarefa.concluidaEm || new Date().toISOString(),
            }
          : tarefa,
      ),
    );
  }

  function sair() {
    setUsuarioLogado(null);
  }

  function atualizarDados() {
    if (!usuarioLogado?.id) {
      return Promise.resolve();
    }

    return carregarEstadoUsuario(usuarioLogado.id);
  }

  return (
    <Routes>
      <Route path="/" element={<Login onEntrar={setUsuarioLogado} />} />
      <Route
        path="/prestador/:prestadorId"
        element={
          <PortalPrestador
            funcionarios={funcionarios}
            onConcluirTarefa={concluirTarefa}
            tarefas={tarefas}
          />
        }
      />
      <Route
        path="/prestador-preview/:prestadorId"
        element={
          usuarioLogado && bancoCarregado ? (
            <PortalPrestador
              acessoMaster
              funcionarios={funcionarios}
              onConcluirTarefa={concluirTarefa}
              tarefas={tarefas}
            />
          ) : usuarioLogado ? (
            <div className="provider-page">
              <div className="provider-shell">
                <div className="provider-empty">
                  <p>Carregando acesso do prestador...</p>
                </div>
              </div>
            </div>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          usuarioLogado ? (
            <Dashboard
              apartamentoTotal={apartamentos.length}
              funcionarioTotal={funcionarios.length}
              funcionarios={funcionarios}
              usuario={usuarioLogado}
              onSair={sair}
              onAtribuirFuncionario={atribuirFuncionarioTarefa}
              onAtualizarDados={atualizarDados}
              onAtualizarTarefa={atualizarTarefa}
              tarefasPendentes={tarefasPendentes}
            />
          ) : (
            <Navigate to="/" replace />
          )
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
              onAtualizarDados={atualizarDados}
              onAtualizarTarefa={atualizarTarefa}
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
