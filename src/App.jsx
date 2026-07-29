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
import { funcionarioPodeSerResponsavelLimpeza } from "./utils/cargos";
import { buscarReservasIcal } from "./utils/ical";

function normalizarTelefoneWhatsapp(telefone) {
  const somenteNumeros = String(telefone || "").replace(/\D/g, "");

  if (somenteNumeros.length === 10 || somenteNumeros.length === 11) {
    return `55${somenteNumeros}`;
  }

  return somenteNumeros;
}

function normalizarEmailComparacao(valor) {
  return String(valor || "").trim().toLowerCase();
}

function normalizarTelefoneComparacao(valor) {
  const numeros = String(valor || "").replace(/\D/g, "");

  if (numeros.length > 11 && numeros.startsWith("55")) {
    return numeros.slice(2);
  }

  return numeros;
}

function normalizarTextoComparacao(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizarCargoFuncionario(valor) {
  const texto = normalizarTextoComparacao(valor);
  const cargoLimpezaAntigo = ["fa", "xina"].join("");

  if (texto === cargoLimpezaAntigo) {
    return "Limpeza";
  }

  if (["gestora", "gestao", "gerente"].includes(texto)) {
    return "Gestora";
  }

  return String(valor || "").trim();
}

function usuarioEhMaster(usuario) {
  return String(usuario?.papel || "Master") === "Master";
}

function usuarioPode(usuario, permissao) {
  return usuarioEhMaster(usuario) || Boolean(usuario?.permissoes?.[permissao]);
}

function escolherPrestadorParaTarefa(tarefa, funcionariosAtuais) {
  const funcionarioAtual = funcionariosAtuais.find(
    (funcionario) => String(funcionario.id) === String(tarefa.funcionarioId),
  );

  return funcionarioPodeSerResponsavelLimpeza(funcionarioAtual)
    ? tarefa.funcionarioId
    : "";
}

function atribuirTarefasPorPrestador(tarefasAtuais, funcionariosAtuais) {
  const responsaveisLimpeza = funcionariosAtuais.filter(
    funcionarioPodeSerResponsavelLimpeza,
  );
  const idsResponsaveisLimpeza = new Set(
    responsaveisLimpeza.map((funcionario) => String(funcionario.id)),
  );

  return tarefasAtuais.map((tarefa) => {
    if (
      tarefa.funcionarioId &&
      !idsResponsaveisLimpeza.has(String(tarefa.funcionarioId))
    ) {
      return { ...tarefa, funcionarioId: "" };
    }

    return tarefa;
  });
}

function obterChaveReserva(reserva) {
  if (reserva.uid) {
    return `uid:${String(reserva.uid).trim()}`;
  }

  return [
    String(reserva.checkin || "").slice(0, 10),
    String(reserva.checkout || "").slice(0, 10),
    String(reserva.resumo || "").trim(),
  ].join("|");
}

function obterDataReserva(valor) {
  if (!valor) {
    return "";
  }

  return String(valor).slice(0, 10);
}

function tarefaCorrespondeReserva(tarefa, reserva) {
  const chaveReserva = obterChaveReserva(reserva);
  const chaveTarefa = tarefa.icalKey || tarefa.chaveReserva;

  return (
    (chaveTarefa && chaveTarefa === chaveReserva) ||
    obterDataReserva(tarefa.checkout) === obterDataReserva(reserva.checkout)
  );
}

function obterHojeInput() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function obterOwnerIdUsuario(usuario) {
  return usuario?.ownerId || usuario?.id || "";
}

function obterCabecalhosAutenticados(usuario, extras = {}) {
  return {
    ...extras,
    ...(usuario?.token ? { Authorization: `Bearer ${usuario.token}` } : {}),
  };
}

function estadoTemAlgumDado(estado) {
  return Boolean(
    estado?.funcionarios?.length ||
      estado?.apartamentos?.length ||
      estado?.tarefas?.length,
  );
}

function montarEnderecoApartamento(apartamento) {
  return [
    apartamento.rua,
    apartamento.numero,
    apartamento.Bairro || apartamento.bairro,
  ]
    .filter(Boolean)
    .join(" - ");
}

function enriquecerTarefasComApartamento(tarefasAtuais, apartamentosAtuais) {
  return tarefasAtuais.map((tarefa) => {
    const apartamento = apartamentosAtuais.find(
      (item) => String(item.id) === String(tarefa.apartamentoId),
    );

    if (!apartamento) {
      return tarefa;
    }

    return {
      ...tarefa,
      enderecoApartamento:
        tarefa.enderecoApartamento || montarEnderecoApartamento(apartamento),
      predioApartamento:
        tarefa.predioApartamento ||
        apartamento["nome.do.predio"] ||
        apartamento.predio ||
        "",
    };
  });
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
  const [usuarioEstadoCarregadoId, setUsuarioEstadoCarregadoId] = useState("");

  const carregarEstadoUsuario = useCallback(async function carregarEstadoUsuario(
    usuario,
  ) {
    const ownerId = obterOwnerIdUsuario(usuario);
    const resposta = await fetch(
      `/api/state?ownerId=${encodeURIComponent(ownerId)}`,
      {
        headers: obterCabecalhosAutenticados(usuario),
      },
    );

    if (!resposta.ok) {
      throw new Error("Nao foi possivel carregar o banco.");
    }

    const estado = await resposta.json();

    const funcionariosCarregados = Array.isArray(estado.funcionarios)
      ? estado.funcionarios
      : [];
    const apartamentosCarregados = Array.isArray(estado.apartamentos)
      ? estado.apartamentos
      : [];
    const tarefasCarregadas = Array.isArray(estado.tarefas)
      ? estado.tarefas
      : [];
    const tarefasComApartamento = enriquecerTarefasComApartamento(
      tarefasCarregadas,
      apartamentosCarregados,
    );

    setFuncionarios(funcionariosCarregados);
    setApartamentos(apartamentosCarregados);
    setTarefas(
      atribuirTarefasPorPrestador(
        tarefasComApartamento,
        funcionariosCarregados,
      ),
    );
    setUsuarioEstadoCarregadoId(String(usuario.id));
  }, []);

  useEffect(() => {
    async function carregarBanco() {
      if (!usuarioLogado?.id) {
        setFuncionarios([]);
        setApartamentos([]);
        setTarefas([]);
        setUsuarioEstadoCarregadoId("");
        setBancoCarregado(true);
        return;
      }

      if (!usuarioLogado.token) {
        setUsuarioLogado(null);
        setFuncionarios([]);
        setApartamentos([]);
        setTarefas([]);
        setUsuarioEstadoCarregadoId("");
        setBancoCarregado(true);
        return;
      }

      try {
        setBancoCarregado(false);
        await carregarEstadoUsuario(usuarioLogado);
      } catch {
        setFuncionarios([]);
        setApartamentos([]);
        setTarefas([]);
        setUsuarioEstadoCarregadoId("");
      } finally {
        setBancoCarregado(true);
      }
    }

    carregarBanco();
  }, [carregarEstadoUsuario, usuarioLogado]);

  useEffect(() => {
    if (usuarioLogado) {
      sessionStorage.setItem("cleanhost:usuario", JSON.stringify(usuarioLogado));
    } else {
      sessionStorage.removeItem("cleanhost:usuario");
    }
  }, [usuarioLogado]);

  useEffect(() => {
    const estadoCarregadoParaUsuario =
      bancoCarregado &&
      usuarioLogado?.id &&
      usuarioEstadoCarregadoId === String(usuarioLogado.id);

    if (
      !estadoCarregadoParaUsuario ||
      !estadoTemAlgumDado({ funcionarios, apartamentos, tarefas })
    ) {
      return;
    }

    fetch("/api/state", {
      method: "PUT",
      headers: obterCabecalhosAutenticados(usuarioLogado, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        ownerId: obterOwnerIdUsuario(usuarioLogado),
        funcionarios,
        apartamentos,
        tarefas,
      }),
    }).catch(() => {});
  }, [
    apartamentos,
    bancoCarregado,
    funcionarios,
    tarefas,
    usuarioEstadoCarregadoId,
    usuarioLogado,
  ]);

  const hojeInput = obterHojeInput();
  const tarefasPendentes = tarefas.filter(
    (tarefa) =>
      tarefa.status === "Pendente" &&
      (!obterDataReserva(tarefa.checkout) ||
        obterDataReserva(tarefa.checkout) >= hojeInput),
  );

  async function salvarEstadoAtualizado(estadoAtualizado) {
    const estadoCarregadoParaUsuario =
      bancoCarregado &&
      usuarioLogado?.id &&
      usuarioEstadoCarregadoId === String(usuarioLogado.id);

    if (!estadoCarregadoParaUsuario) {
      return;
    }

    const resposta = await fetch("/api/state", {
      method: "PUT",
      headers: obterCabecalhosAutenticados(usuarioLogado, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        ownerId: obterOwnerIdUsuario(usuarioLogado),
        funcionarios: estadoAtualizado.funcionarios,
        apartamentos: estadoAtualizado.apartamentos,
        tarefas: estadoAtualizado.tarefas,
      }),
    });

    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => ({}));
      throw new Error(dados.erro || "Nao foi possivel salvar no banco.");
    }
  }

  async function cadastrarFuncionario(funcionario) {
    const emailNovo = normalizarEmailComparacao(funcionario.email);
    const telefoneNovo = normalizarTelefoneComparacao(funcionario.telefone);
    const emailJaCadastrado = funcionarios.some(
      (funcionarioAtual) =>
        normalizarEmailComparacao(funcionarioAtual.email) === emailNovo,
    );
    const telefoneJaCadastrado = funcionarios.some(
      (funcionarioAtual) =>
        normalizarTelefoneComparacao(funcionarioAtual.telefone) === telefoneNovo,
    );

    if (emailJaCadastrado) {
      throw new Error("Este email ja esta cadastrado.");
    }

    if (telefoneJaCadastrado) {
      throw new Error("Este WhatsApp ja esta cadastrado.");
    }

    const cargoNormalizado = normalizarCargoFuncionario(funcionario.cargo);
    const novoFuncionario = {
      ...funcionario,
      id: Date.now(),
      bairro: funcionarioPodeSerResponsavelLimpeza({ cargo: cargoNormalizado })
        ? String(funcionario.bairro || "").trim()
        : "",
      cargo: cargoNormalizado,
      telefone: normalizarTelefoneWhatsapp(funcionario.telefone),
    };
    const funcionariosAtualizados = [...funcionarios, novoFuncionario];
    const tarefasAtualizadas = usuarioPode(usuarioLogado, "atribuirTarefas")
      ? atribuirTarefasPorPrestador(tarefas, funcionariosAtualizados)
      : tarefas;

    await salvarEstadoAtualizado({
      funcionarios: funcionariosAtualizados,
      apartamentos,
      tarefas: tarefasAtualizadas,
    });

    setFuncionarios(funcionariosAtualizados);
    setTarefas(tarefasAtualizadas);

    return novoFuncionario;
  }

  async function atualizarFuncionario(funcionarioAtualizado) {
    const idAtualizado = String(funcionarioAtualizado.id);
    const emailNovo = normalizarEmailComparacao(funcionarioAtualizado.email);
    const telefoneNovo = normalizarTelefoneComparacao(funcionarioAtualizado.telefone);
    const emailJaCadastrado = funcionarios.some(
      (funcionarioAtual) =>
        String(funcionarioAtual.id) !== idAtualizado &&
        normalizarEmailComparacao(funcionarioAtual.email) === emailNovo,
    );
    const telefoneJaCadastrado = funcionarios.some(
      (funcionarioAtual) =>
        String(funcionarioAtual.id) !== idAtualizado &&
        normalizarTelefoneComparacao(funcionarioAtual.telefone) === telefoneNovo,
    );

    if (emailJaCadastrado) {
      throw new Error("Este email ja esta cadastrado.");
    }

    if (telefoneJaCadastrado) {
      throw new Error("Este WhatsApp ja esta cadastrado.");
    }

    const cargoNormalizado = normalizarCargoFuncionario(funcionarioAtualizado.cargo);
    const funcionariosAtualizados = funcionarios.map((funcionario) =>
      String(funcionario.id) === idAtualizado
        ? {
            ...funcionario,
            ...funcionarioAtualizado,
            id: funcionario.id,
            bairro: funcionarioPodeSerResponsavelLimpeza({
              cargo: cargoNormalizado,
            })
              ? String(funcionarioAtualizado.bairro || "").trim()
              : "",
            cargo: cargoNormalizado,
            telefone: normalizarTelefoneWhatsapp(funcionarioAtualizado.telefone),
          }
        : funcionario,
    );
    const tarefasAtualizadas = usuarioPode(usuarioLogado, "atribuirTarefas")
      ? atribuirTarefasPorPrestador(tarefas, funcionariosAtualizados)
      : tarefas;

    await salvarEstadoAtualizado({
      funcionarios: funcionariosAtualizados,
      apartamentos,
      tarefas: tarefasAtualizadas,
    });

    setFuncionarios(funcionariosAtualizados);
    setTarefas(tarefasAtualizadas);
  }

  async function excluirFuncionario(id) {
    const funcionariosAtualizados = funcionarios.filter(
      (funcionario) => String(funcionario.id) !== String(id),
    );
    const tarefasAtualizadas = atribuirTarefasPorPrestador(
      tarefas,
      funcionariosAtualizados,
    );

    try {
      await salvarEstadoAtualizado({
        funcionarios: funcionariosAtualizados,
        apartamentos,
        tarefas: tarefasAtualizadas,
      });
      setFuncionarios(funcionariosAtualizados);
      setTarefas(tarefasAtualizadas);
    } catch (erro) {
      window.alert(erro.message || "Nao foi possivel excluir o prestador.");
    }
  }

  function montarTarefasIcal(
    apartamento,
    apartamentoId,
    reservas,
    reservasBase = reservas,
    tarefasExistentes = [],
    funcionariosBase = funcionarios,
  ) {
    const dataMinima = obterHojeInput();
    const datasCheckin = new Set(
      reservasBase
        .map((reserva) => obterDataReserva(reserva.checkin))
        .filter(Boolean),
    );

    return reservas
      .filter((reserva) => {
        const dataCheckout = obterDataReserva(reserva.checkout);

        return dataCheckout && dataCheckout >= dataMinima;
      })
      .map((reserva, index) => {
        const dataCheckout = obterDataReserva(reserva.checkout);
        const temCheckinNoMesmoDia = datasCheckin.has(dataCheckout);
        const chaveReserva = obterChaveReserva(reserva);
        const tarefaExistente = tarefasExistentes.find((tarefa) =>
          tarefaCorrespondeReserva(tarefa, reserva),
        );
        let tarefaId = tarefaExistente?.id || apartamentoId * 1000 + index + 1;

        while (
          !tarefaExistente &&
          tarefasExistentes.some(
            (tarefa) => String(tarefa.id) === String(tarefaId),
          )
        ) {
          tarefaId += 1000;
        }

        return {
          id: tarefaId,
          apartamento: apartamento.numero,
          bairroApartamento: apartamento.Bairro || "",
          enderecoApartamento: montarEnderecoApartamento(apartamento),
          predioApartamento:
            apartamento["nome.do.predio"] || apartamento.predio || "",
          descricao: reserva.resumo || "Limpeza apos checkout Airbnb",
          checkin: obterDataReserva(reserva.checkin),
          checkout: dataCheckout,
          horaCheckout: apartamento.horaCheckout || "11:00",
          status: tarefaExistente?.status || "Pendente",
          funcionarioId:
            tarefaExistente?.funcionarioId ||
            escolherPrestadorParaTarefa(
              { bairroApartamento: apartamento.Bairro || "" },
              funcionariosBase,
            ),
          origem: "Airbnb iCal",
          apartamentoId,
          icalKey: chaveReserva,
          prioridade: temCheckinNoMesmoDia,
          motivoPrioridade: temCheckinNoMesmoDia
            ? "Checkout e check-in no mesmo dia"
            : "",
          observacaoPrestador:
            tarefaExistente?.observacaoPrestador ||
            apartamento.observacaoEndereco ||
            "",
          hospedes:
            tarefaExistente?.hospedes ||
            tarefaExistente?.quantidadeHospedes ||
            apartamento.hospedesMaximos ||
            "",
          senhaPorta: tarefaExistente?.senhaPorta || apartamento.senhaPorta || "",
          concluidaEm: tarefaExistente?.concluidaEm || "",
        };
      });
  }

  async function sincronizarApartamentosIcal(estadoBase) {
    const apartamentosComIcal = estadoBase.apartamentos.filter(
      (apartamento) => apartamento.ICALL || apartamento.ical,
    );
    const dataMinima = obterHojeInput();

    if (!apartamentosComIcal.length) {
      return estadoBase;
    }

    let apartamentosAtualizados = estadoBase.apartamentos;
    let tarefasAtualizadas = estadoBase.tarefas;

    for (const apartamento of apartamentosComIcal) {
      const calendario = await buscarReservasIcal(
        apartamento.ICALL || apartamento.ical,
      );
      const reservas = calendario?.reservas || [];
      const apartamentoAtualizado = {
        ...apartamento,
        ICALL: calendario.urlIcal,
        reservas,
        dataReserva: calendario.proximaReserva?.checkin || "",
        checkout: calendario.proximaReserva?.checkout || "",
        horaCheckout: apartamento.horaCheckout || "11:00",
      };
      const tarefasDoApartamento = tarefasAtualizadas.filter(
        (tarefa) => String(tarefa.apartamentoId) === String(apartamento.id),
      );
      const tarefasRecriadas = montarTarefasIcal(
        apartamentoAtualizado,
        apartamento.id,
        reservas,
        calendario?.todasReservas || reservas,
        tarefasDoApartamento,
        estadoBase.funcionarios,
      );
      const idsRecriados = new Set(
        tarefasRecriadas.map((tarefa) => String(tarefa.id)),
      );

      apartamentosAtualizados = apartamentosAtualizados.map((item) =>
        String(item.id) === String(apartamento.id) ? apartamentoAtualizado : item,
      );
      tarefasAtualizadas = [
        ...tarefasAtualizadas.filter((tarefa) => {
          if (String(tarefa.apartamentoId) !== String(apartamento.id)) {
            return true;
          }

          if (tarefa.status === "Concluida") {
            return true;
          }

          const dataCheckoutTarefa = obterDataReserva(tarefa.checkout);

          if (dataCheckoutTarefa && dataCheckoutTarefa < dataMinima) {
            return false;
          }

          const aindaExiste = reservas.some((reserva) =>
            tarefaCorrespondeReserva(tarefa, reserva),
          );

          return aindaExiste && !idsRecriados.has(String(tarefa.id));
        }),
        ...tarefasRecriadas,
      ].sort((tarefaA, tarefaB) =>
        String(tarefaA.checkout || "").localeCompare(
          String(tarefaB.checkout || ""),
        ),
      );
    }

    return {
      ...estadoBase,
      apartamentos: apartamentosAtualizados,
      tarefas: atribuirTarefasPorPrestador(
        tarefasAtualizadas,
        estadoBase.funcionarios,
      ),
    };
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
          dataReserva: calendario.proximaReserva?.checkin || "",
          checkout: calendario.proximaReserva?.checkout || "",
          horaCheckout: apartamento.horaCheckout || "11:00",
        }
      : { ...apartamento };
    const novoApartamento = { ...apartamentoCompleto, id: apartamentoId };
    const apartamentosAtualizados = [...apartamentos, novoApartamento];
    const tarefasNovas = reservas.length
      ? montarTarefasIcal(
          apartamentoCompleto,
          apartamentoId,
          reservas,
          calendario?.todasReservas || reservas,
          [],
          funcionarios,
        )
      : [];
    const tarefasAtualizadas = reservas.length
      ? [...tarefas, ...tarefasNovas]
      : tarefas;

    await salvarEstadoAtualizado({
      funcionarios,
      apartamentos: apartamentosAtualizados,
      tarefas: tarefasAtualizadas,
    });

    setApartamentos(apartamentosAtualizados);
    setTarefas(tarefasAtualizadas);
  }

  async function excluirApartamento(id) {
    const apartamentosAtualizados = apartamentos.filter(
      (apartamento) => String(apartamento.id) !== String(id),
    );
    const tarefasAtualizadas = tarefas.filter(
      (tarefa) => String(tarefa.apartamentoId) !== String(id),
    );

    try {
      await salvarEstadoAtualizado({
        funcionarios,
        apartamentos: apartamentosAtualizados,
        tarefas: tarefasAtualizadas,
      });
      setApartamentos(apartamentosAtualizados);
      setTarefas(tarefasAtualizadas);
    } catch (erro) {
      window.alert(erro.message || "Nao foi possivel excluir o apartamento.");
    }
  }

  function atualizarApartamento(apartamentoId, campos) {
    const apartamentoAtual = apartamentos.find(
      (apartamento) => String(apartamento.id) === String(apartamentoId),
    );
    const apartamentosAtualizados = apartamentos.map((apartamento) =>
      String(apartamento.id) === String(apartamentoId)
        ? { ...apartamento, ...campos }
        : apartamento,
    );
    const tarefasAtualizadas = tarefas.map((tarefa) => {
      if (String(tarefa.apartamentoId) !== String(apartamentoId)) {
        return tarefa;
      }

      const deveAtualizarHospedes =
        !tarefa.hospedes ||
        String(tarefa.hospedes) === String(apartamentoAtual?.hospedesMaximos || "");
      const deveAtualizarObservacao =
        !tarefa.observacaoPrestador ||
        String(tarefa.observacaoPrestador) ===
          String(apartamentoAtual?.observacaoEndereco || "");

      return {
        ...tarefa,
        apartamento: campos.numero ?? tarefa.apartamento,
        bairroApartamento: campos.Bairro ?? tarefa.bairroApartamento,
        enderecoApartamento: montarEnderecoApartamento({
          ...apartamentoAtual,
          ...campos,
        }),
        predioApartamento:
          campos["nome.do.predio"] ??
          apartamentoAtual?.["nome.do.predio"] ??
          tarefa.predioApartamento,
        senhaPorta: campos.senhaPorta ?? tarefa.senhaPorta,
        hospedes: deveAtualizarHospedes
          ? campos.hospedesMaximos ?? tarefa.hospedes
          : tarefa.hospedes,
        observacaoPrestador: deveAtualizarObservacao
          ? campos.observacaoEndereco ?? tarefa.observacaoPrestador
          : tarefa.observacaoPrestador,
      };
    });

    setApartamentos(apartamentosAtualizados);
    setTarefas(tarefasAtualizadas);

    salvarEstadoAtualizado({
      funcionarios,
      apartamentos: apartamentosAtualizados,
      tarefas: tarefasAtualizadas,
    }).catch(() => {});
  }

  function atribuirFuncionarioTarefa(tarefaId, funcionarioId) {
    const funcionarioSelecionado = funcionarios.find(
      (funcionario) => String(funcionario.id) === String(funcionarioId),
    );
    const funcionarioIdSeguro = funcionarioPodeSerResponsavelLimpeza(
      funcionarioSelecionado,
    )
      ? funcionarioId
      : "";
    const tarefasAtualizadas = tarefas.map((tarefa) =>
      tarefa.id === tarefaId
        ? { ...tarefa, funcionarioId: funcionarioIdSeguro }
        : tarefa,
    );

    setTarefas(tarefasAtualizadas);

    salvarEstadoAtualizado({
      funcionarios,
      apartamentos,
      tarefas: tarefasAtualizadas,
    }).catch(() => {});
  }

  function atualizarTarefa(tarefaId, campos) {
    const tarefasAtualizadas = tarefas.map((tarefa) =>
      String(tarefa.id) === String(tarefaId) ? { ...tarefa, ...campos } : tarefa,
    );

    setTarefas(tarefasAtualizadas);

    salvarEstadoAtualizado({
      funcionarios,
      apartamentos,
      tarefas: tarefasAtualizadas,
    }).catch(() => {});
  }

  function concluirTarefa(tarefaId) {
    const tarefasAtualizadas = tarefas.map((tarefa) =>
      tarefa.id === tarefaId
        ? {
            ...tarefa,
            status: "Concluida",
            concluidaEm: tarefa.concluidaEm || new Date().toISOString(),
          }
        : tarefa,
    );

    setTarefas(tarefasAtualizadas);

    salvarEstadoAtualizado({
      funcionarios,
      apartamentos,
      tarefas: tarefasAtualizadas,
    }).catch(() => {});
  }

  function sair() {
    setUsuarioLogado(null);
  }

  async function excluirConta() {
    if (!usuarioLogado?.id) {
      return;
    }

    const resposta = await fetch("/api/auth/account", {
      method: "DELETE",
      headers: obterCabecalhosAutenticados(usuarioLogado, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        usuarioId: usuarioLogado.id,
      }),
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      throw new Error(dados.erro || "Nao foi possivel apagar a conta.");
    }

    setFuncionarios([]);
    setApartamentos([]);
    setTarefas([]);
    setUsuarioLogado(null);
  }

  async function atualizarDados() {
    if (!usuarioLogado?.id) {
      return;
    }

    const resposta = await fetch(
      `/api/state?ownerId=${encodeURIComponent(
        obterOwnerIdUsuario(usuarioLogado),
      )}`,
      {
        headers: obterCabecalhosAutenticados(usuarioLogado),
      },
    );

    if (!resposta.ok) {
      throw new Error("Nao foi possivel carregar o banco.");
    }

    const estadoBanco = await resposta.json();
    const estadoSincronizado = await sincronizarApartamentosIcal({
      funcionarios: Array.isArray(estadoBanco.funcionarios)
        ? estadoBanco.funcionarios
        : [],
      apartamentos: Array.isArray(estadoBanco.apartamentos)
        ? estadoBanco.apartamentos
        : [],
      tarefas: Array.isArray(estadoBanco.tarefas) ? estadoBanco.tarefas : [],
    });
    const estadoFinal = {
      ...estadoSincronizado,
      tarefas: enriquecerTarefasComApartamento(
        estadoSincronizado.tarefas,
        estadoSincronizado.apartamentos,
      ),
    };

    setFuncionarios(estadoFinal.funcionarios);
    setApartamentos(estadoFinal.apartamentos);
    setTarefas(estadoFinal.tarefas);

    await salvarEstadoAtualizado(estadoFinal);
  }

  return (
    <Routes>
      <Route path="/" element={<Login onEntrar={setUsuarioLogado} />} />
      <Route
        path="/convite/:codigo"
        element={<Login onEntrar={setUsuarioLogado} />}
      />
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
              onExcluirConta={excluirConta}
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
            usuarioPode(usuarioLogado, "visualizarPrestadores") ? (
              <Listafuncionarios
                apartamentos={apartamentos}
                funcionarios={funcionarios}
                onAtualizar={atualizarFuncionario}
                onExcluir={excluirFuncionario}
                usuario={usuarioLogado}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="cadastro-funcionario"
          element={
            usuarioPode(usuarioLogado, "cadastrarPrestadores") ? (
              <Cadastrarfuncionario
                apartamentos={apartamentos}
                funcionarios={funcionarios}
                onCadastrar={cadastrarFuncionario}
                usuario={usuarioLogado}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="cadastro-apartamento"
          element={
            usuarioPode(usuarioLogado, "cadastrarApartamentos") ? (
              <CadastroApartamento onCadastrar={cadastrarApartamento} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="lista-apartamentos"
          element={
            usuarioPode(usuarioLogado, "visualizarApartamentos") ? (
              <Listaapartamentos
                apartamentos={apartamentos}
                onAtualizar={atualizarApartamento}
                onExcluir={excluirApartamento}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="tarefas"
          element={
            usuarioPode(usuarioLogado, "visualizarTarefas") ||
            usuarioPode(usuarioLogado, "visualizarCalendarios") ? (
              <Tarefas
                funcionarios={funcionarios}
                onAtribuirFuncionario={atribuirFuncionarioTarefa}
                onAtualizarDados={atualizarDados}
                onAtualizarTarefa={atualizarTarefa}
                tarefas={tarefas}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
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
