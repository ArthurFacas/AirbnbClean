import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PermissoesAdministrativas from "./PermissoesAdministrativas";
import {
  criarConfiguracaoPermissoesPadrao,
} from "../utils/permissoesAdministrativas";
import { cargoEhGestora } from "../utils/cargos";

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
  const cargoLimpezaAntigo = ["fa", "xina"].join("");
  const texto = String(valor || "");

  return texto
    ? texto.replace(new RegExp(`\\b${cargoLimpezaAntigo}\\b`, "gi"), "Limpeza")
    : fallback;
}

function normalizarBairroComparacao(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizarNomeBairro(valor) {
  return String(valor || "").trim().replace(/\s+/g, " ");
}

function separarBairros(valor) {
  return String(valor || "")
    .split(",")
    .map(normalizarNomeBairro)
    .filter(Boolean);
}

function deduplicarBairros(bairros) {
  const bairrosUnicos = new Map();

  bairros.map(normalizarNomeBairro).filter(Boolean).forEach((bairro) => {
    const chave = normalizarBairroComparacao(bairro);

    if (!bairrosUnicos.has(chave)) {
      bairrosUnicos.set(chave, bairro);
    }
  });

  return [...bairrosUnicos.values()];
}

function montarBairrosDisponiveis(apartamentos, bairrosAtuais = []) {
  const bairros = new Map();

  [...apartamentos.map((apartamento) => apartamento.Bairro || apartamento.bairro), ...bairrosAtuais]
    .map(normalizarNomeBairro)
    .filter(Boolean)
    .forEach((bairro) => {
      const chave = normalizarBairroComparacao(bairro);

      if (!bairros.has(chave)) {
        bairros.set(chave, bairro);
      }
    });

  return [...bairros.values()].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  );
}

function montarLinkWhatsapp(funcionario, linkConvite) {
  const telefone = String(funcionario.telefone || "").replace(/\D/g, "");
  const mensagem = [
    `Ola, ${funcionario.nome}.`,
    "Voce recebeu um convite para criar seu acesso da CleanHost.",
    "Abra o link e crie seu login e senha:",
    linkConvite,
  ].join("\n");

  return telefone
    ? `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`
    : "";
}

function usuarioEhMaster(usuario) {
  return normalizarCargo(usuario?.papel || "Master") === "master";
}

function usuarioPode(usuario, permissao) {
  return usuarioEhMaster(usuario) || Boolean(usuario?.permissoes?.[permissao]);
}

function normalizarCargo(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function funcionarioEhGestora(funcionario) {
  return ["gestora", "gestao", "gerente"].includes(
    normalizarCargo(funcionario?.cargo),
  );
}

function obterCabecalhosAutenticados(usuario, extras = {}) {
  return {
    ...extras,
    ...(usuario?.token ? { Authorization: `Bearer ${usuario.token}` } : {}),
  };
}

function montarConfiguracaoUsuario(usuarioPermissoes) {
  return {
    ...criarConfiguracaoPermissoesPadrao(),
    permissoes:
      usuarioPermissoes?.permissoes || criarConfiguracaoPermissoesPadrao().permissoes,
    apartamentosAcesso: usuarioPermissoes?.apartamentosAcesso || "todos",
    apartamentosPermitidos: Array.isArray(usuarioPermissoes?.apartamentosPermitidos)
      ? usuarioPermissoes.apartamentosPermitidos.map(String)
      : [],
    prestadoresAcesso: usuarioPermissoes?.prestadoresAcesso || "todos",
    prestadoresPermitidos: Array.isArray(usuarioPermissoes?.prestadoresPermitidos)
      ? usuarioPermissoes.prestadoresPermitidos.map(String)
      : [],
  };
}

function Listafuncionarios({
  apartamentos = [],
  funcionarios,
  onAtualizar,
  onExcluir,
  usuario,
}) {
  const navigate = useNavigate();
  const podeAlterarGestora = usuarioEhMaster(usuario);
  const podeEditarPrestadores = usuarioPode(usuario, "editarPrestadores");
  const podeAdministrarAcessos = usuarioPode(
    usuario,
    "administrarAcessosPrestadores",
  );
  const [funcionarioPermissoes, setFuncionarioPermissoes] = useState("");
  const [configuracaoPermissoes, setConfiguracaoPermissoes] = useState(
    criarConfiguracaoPermissoesPadrao,
  );
  const [salvandoPermissoes, setSalvandoPermissoes] = useState(false);
  const [erroPermissoes, setErroPermissoes] = useState("");
  const [convites, setConvites] = useState({});
  const [carregandoConvite, setCarregandoConvite] = useState("");
  const [funcionarioEditando, setFuncionarioEditando] = useState("");
  const [formularioEdicao, setFormularioEdicao] = useState({});
  const [bairroManual, setBairroManual] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [erroEdicao, setErroEdicao] = useState("");
  const funcionarioEmEdicao = funcionarios.find(
    (funcionario) => String(funcionario.id) === funcionarioEditando,
  );
  const editandoGestora = cargoEhGestora(formularioEdicao.cargo);
  const mostrarBairrosNoModal = funcionarioEmEdicao && !editandoGestora;
  const bairrosSelecionadosEdicao = deduplicarBairros(
    separarBairros(formularioEdicao.bairrosSelecionados?.join(",")),
  );
  const bairrosDisponiveisEdicao = montarBairrosDisponiveis(
    apartamentos,
    separarBairros(funcionarioEmEdicao?.bairro),
  );

  useEffect(() => {
    if (!podeAdministrarAcessos || !usuario?.token) {
      return;
    }

    funcionarios.forEach((funcionario) => {
      fetch(
        `/api/invites?funcionarioId=${encodeURIComponent(funcionario.id)}`,
        {
          headers: obterCabecalhosAutenticados(usuario),
        },
      )
        .then((resposta) => resposta.json())
        .then((dados) => {
          setConvites((convitesAtuais) => ({
            ...convitesAtuais,
            [funcionario.id]: dados,
          }));
        })
        .catch(() => {});
    });
  }, [funcionarios, podeAdministrarAcessos, usuario]);

  async function abrirPermissoes(funcionario) {
    setErroPermissoes("");
    setFuncionarioPermissoes(String(funcionario.id));

    try {
      const resposta = await fetch(
        `/api/auth/manager-permissions?email=${encodeURIComponent(
          funcionario.email,
        )}`,
        {
          headers: obterCabecalhosAutenticados(usuario),
        },
      );
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || "Nao foi possivel carregar permissoes.");
      }

      setConfiguracaoPermissoes(montarConfiguracaoUsuario(dados));
    } catch (erro) {
      setErroPermissoes(erro.message || "Nao foi possivel carregar permissoes.");
    }
  }

  async function salvarPermissoes(funcionario) {
    setErroPermissoes("");

    if (
      configuracaoPermissoes.apartamentosAcesso === "selecionados" &&
      !configuracaoPermissoes.apartamentosPermitidos.length
    ) {
      setErroPermissoes("Selecione pelo menos um apartamento.");
      return;
    }

    if (
      configuracaoPermissoes.prestadoresAcesso === "selecionados" &&
      !configuracaoPermissoes.prestadoresPermitidos.length
    ) {
      setErroPermissoes("Selecione pelo menos um prestador.");
      return;
    }

    setSalvandoPermissoes(true);

    try {
      const resposta = await fetch("/api/auth/manager-permissions", {
        method: "PUT",
        headers: obterCabecalhosAutenticados(usuario, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          email: funcionario.email,
          ...configuracaoPermissoes,
        }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || "Nao foi possivel salvar permissoes.");
      }

      setFuncionarioPermissoes("");
    } catch (erro) {
      setErroPermissoes(erro.message || "Nao foi possivel salvar permissoes.");
    } finally {
      setSalvandoPermissoes(false);
    }
  }

  async function gerarConvite(funcionario) {
    setCarregandoConvite(String(funcionario.id));
    setErroPermissoes("");

    try {
      const resposta = await fetch("/api/invites", {
        method: "POST",
        headers: obterCabecalhosAutenticados(usuario, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          funcionarioId: funcionario.id,
          ...(funcionarioEhGestora(funcionario)
            ? criarConfiguracaoPermissoesPadrao()
            : {}),
        }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || "Nao foi possivel gerar o convite.");
      }

      setConvites((convitesAtuais) => ({
        ...convitesAtuais,
        [funcionario.id]: dados,
      }));

      if (dados.link && funcionario.telefone) {
        window.open(montarLinkWhatsapp(funcionario, dados.link), "_blank", "noopener,noreferrer");
      }
    } catch (erro) {
      setErroPermissoes(erro.message || "Nao foi possivel gerar o convite.");
    } finally {
      setCarregandoConvite("");
    }
  }

  async function copiarConvite(funcionario) {
    const convite = convites[funcionario.id];

    if (!convite?.link) {
      await gerarConvite(funcionario);
      return;
    }

    await navigator.clipboard?.writeText(convite.link);
  }

  async function cancelarConvite(funcionario) {
    setCarregandoConvite(String(funcionario.id));
    setErroPermissoes("");

    try {
      const resposta = await fetch(
        `/api/invites?funcionarioId=${encodeURIComponent(funcionario.id)}`,
        {
          method: "DELETE",
          headers: obterCabecalhosAutenticados(usuario),
        },
      );
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || "Nao foi possivel cancelar o convite.");
      }

      setConvites((convitesAtuais) => ({
        ...convitesAtuais,
        [funcionario.id]: dados,
      }));
    } catch (erro) {
      setErroPermissoes(erro.message || "Nao foi possivel cancelar o convite.");
    } finally {
      setCarregandoConvite("");
    }
  }

  function abrirAcesso(funcionario) {
    if (funcionarioEhGestora(funcionario)) {
      navigate("/dashboard");
      return;
    }

    navigate(`/prestador-preview/${funcionario.id}`);
  }

  function abrirEdicao(funcionario) {
    const bairrosSelecionados = deduplicarBairros(separarBairros(funcionario.bairro));

    setErroEdicao("");
    setBairroManual("");
    setFuncionarioEditando(String(funcionario.id));
    setFormularioEdicao({
      id: funcionario.id,
      nome: funcionario.nome || "",
      nascimento: funcionario.nascimento || "",
      email: funcionario.email || "",
      telefone: funcionario.telefone || "",
      cargo: funcionario.cargo || "",
      bairrosSelecionados,
    });
  }

  function atualizarCampoEdicao(event) {
    const { name, value } = event.target;

    if (name === "cargo" && cargoEhGestora(value)) {
      setErroEdicao("");
      setBairroManual("");
    }

    setFormularioEdicao((dadosAtuais) => ({
      ...dadosAtuais,
      [name]: value,
      ...(name === "cargo" && cargoEhGestora(value)
        ? { bairrosSelecionados: [] }
        : {}),
    }));
  }

  function alternarBairroEdicao(bairro) {
    setFormularioEdicao((dadosAtuais) => {
      const selecionados = deduplicarBairros(
        separarBairros(dadosAtuais.bairrosSelecionados?.join(",")),
      );
      const chave = normalizarBairroComparacao(bairro);
      const bairroSelecionado = selecionados.some(
        (item) => normalizarBairroComparacao(item) === chave,
      );
      const bairrosSelecionados = bairroSelecionado
        ? selecionados.filter((item) => normalizarBairroComparacao(item) !== chave)
        : [...selecionados, bairro];

      return {
        ...dadosAtuais,
        bairrosSelecionados,
      };
    });
  }

  function adicionarBairroManual() {
    const bairro = normalizarNomeBairro(bairroManual);

    if (!bairro) {
      return;
    }

    setFormularioEdicao((dadosAtuais) => ({
      ...dadosAtuais,
      bairrosSelecionados: deduplicarBairros([
        ...separarBairros(dadosAtuais.bairrosSelecionados?.join(",")),
        bairro,
      ]),
    }));
    setBairroManual("");
  }

  function removerBairroSelecionado(bairro) {
    const chave = normalizarBairroComparacao(bairro);

    setFormularioEdicao((dadosAtuais) => ({
      ...dadosAtuais,
      bairrosSelecionados: deduplicarBairros(
        separarBairros(dadosAtuais.bairrosSelecionados?.join(",")),
      ).filter((item) => normalizarBairroComparacao(item) !== chave),
    }));
  }

  function fecharEdicao() {
    setFuncionarioEditando("");
    setFormularioEdicao({});
    setBairroManual("");
    setErroEdicao("");
  }

  async function salvarEdicao(funcionario) {
    if (!onAtualizar || salvandoEdicao) {
      return;
    }

    const bairrosSelecionados = deduplicarBairros(
      separarBairros(formularioEdicao.bairrosSelecionados?.join(",")),
    );

    if (!editandoGestora && !bairrosSelecionados.length) {
      setErroEdicao("Selecione pelo menos um bairro atendido.");
      return;
    }

    setSalvandoEdicao(true);
    setErroEdicao("");

    try {
      await onAtualizar({
        ...funcionario,
        ...formularioEdicao,
        bairro: editandoGestora ? "" : bairrosSelecionados.join(", "),
      });
      fecharEdicao();
    } catch (erro) {
      setErroEdicao(
        erro.message || "Nao foi possivel salvar as alteracoes do prestador.",
      );
    } finally {
      setSalvandoEdicao(false);
    }
  }

  function confirmarExclusao(funcionario) {
    const confirmou = window.confirm(
      `Tem certeza que deseja excluir ${funcionario.nome || "este cadastro"}?`,
    );

    if (confirmou) {
      onExcluir(funcionario.id);
    }
  }

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
                {!funcionarioEhGestora(funcionario) && (
                  <div>
                    <span>Bairro(s) que atende</span>
                    <strong>{obterValor(funcionario.bairro)}</strong>
                  </div>
                )}
                <div>
                  <span>Cargo</span>
                  <strong>{obterValor(funcionario.cargo)}</strong>
                </div>
                <div>
                  <span>Acesso</span>
                  <strong>
                    {convites[funcionario.id]?.status || "Acesso nao enviado"}
                  </strong>
                </div>
              </div>

              <div className="provider-actions">
                {podeAdministrarAcessos && (
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={carregandoConvite === String(funcionario.id)}
                    onClick={() => {
                      const convite = convites[funcionario.id];

                      if (convite?.status === "Conta criada") {
                        abrirAcesso(funcionario);
                        return;
                      }

                      if (convite?.status === "Convite enviado") {
                        copiarConvite(funcionario).catch(() => {});
                        return;
                      }

                      gerarConvite(funcionario);
                    }}
                  >
                    {carregandoConvite === String(funcionario.id)
                      ? "Gerando..."
                      : convites[funcionario.id]?.acao || "Enviar link"}
                  </button>
                )}
                {convites[funcionario.id]?.status === "Convite enviado" && (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => cancelarConvite(funcionario)}
                  >
                    Cancelar convite
                  </button>
                )}
                {podeAlterarGestora && funcionarioEhGestora(funcionario) && (
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() => abrirPermissoes(funcionario)}
                  >
                    Permissoes
                  </button>
                )}
                {podeEditarPrestadores &&
                  (podeAlterarGestora || !funcionarioEhGestora(funcionario)) && (
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => abrirEdicao(funcionario)}
                    >
                      Editar
                    </button>
                  )}
                {podeAlterarGestora || !funcionarioEhGestora(funcionario) ? (
                  <button
                    className="danger-action"
                    onClick={() => confirmarExclusao(funcionario)}
                  >
                    Excluir
                  </button>
                ) : null}
              </div>

              {funcionarioPermissoes === String(funcionario.id) && (
                <div className="provider-permissions-editor">
                  <PermissoesAdministrativas
                    apartamentos={apartamentos}
                    configuracao={configuracaoPermissoes}
                    funcionarios={funcionarios}
                    onChange={setConfiguracaoPermissoes}
                  />
                  {erroPermissoes && (
                    <p className="form-error">{erroPermissoes}</p>
                  )}
                  <div className="provider-actions">
                    <button
                      className="primary-action"
                      type="button"
                      disabled={salvandoPermissoes}
                      onClick={() => salvarPermissoes(funcionario)}
                    >
                      {salvandoPermissoes ? "Salvando..." : "Salvar permissoes"}
                    </button>
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => setFuncionarioPermissoes("")}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {funcionarioEmEdicao && (
        <div
          className="provider-edit-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              fecharEdicao();
            }
          }}
        >
          <form
            aria-modal="true"
            className="provider-edit-modal"
            role="dialog"
            onSubmit={(event) => {
              event.preventDefault();
              salvarEdicao(funcionarioEmEdicao);
            }}
          >
            <div className="provider-edit-modal-header">
              <div>
                <span>Editar acesso</span>
                <h2>{obterValor(funcionarioEmEdicao.nome, "Prestador")}</h2>
              </div>
              <button
                aria-label="Fechar edicao"
                className="provider-edit-close"
                type="button"
                onClick={fecharEdicao}
              >
                x
              </button>
            </div>

            <section className="provider-edit-section">
              <h3>Dados pessoais</h3>
              <div className="provider-edit-grid">
                <label>
                  <span>Nome</span>
                  <input
                    type="text"
                    name="nome"
                    value={formularioEdicao.nome || ""}
                    onChange={atualizarCampoEdicao}
                    required
                  />
                </label>
                <label>
                  <span>Nascimento</span>
                  <input
                    type="date"
                    name="nascimento"
                    value={formularioEdicao.nascimento || ""}
                    onChange={atualizarCampoEdicao}
                    required
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    name="email"
                    value={formularioEdicao.email || ""}
                    onChange={atualizarCampoEdicao}
                    required
                  />
                </label>
                <label>
                  <span>WhatsApp</span>
                  <input
                    type="tel"
                    name="telefone"
                    value={formularioEdicao.telefone || ""}
                    onChange={atualizarCampoEdicao}
                    required
                  />
                </label>
                <label>
                  <span>Cargo</span>
                  <select
                    name="cargo"
                    value={formularioEdicao.cargo || ""}
                    onChange={atualizarCampoEdicao}
                    required
                  >
                    <option value="">Selecione um cargo</option>
                    <option value="Limpeza">Limpeza</option>
                    {podeAlterarGestora && <option value="Gestora">Gestora</option>}
                    <option value="Motoristas">Motoristas</option>
                  </select>
                </label>
              </div>
            </section>

            {mostrarBairrosNoModal && (
            <section className="provider-edit-section">
              <div className="provider-edit-section-heading">
                <h3>Bairros atendidos</h3>
                <div className="provider-neighborhood-actions">
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() =>
                      setFormularioEdicao((dadosAtuais) => ({
                        ...dadosAtuais,
                        bairrosSelecionados: bairrosDisponiveisEdicao,
                      }))
                    }
                  >
                    Selecionar todos
                  </button>
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={() =>
                      setFormularioEdicao((dadosAtuais) => ({
                        ...dadosAtuais,
                        bairrosSelecionados: [],
                      }))
                    }
                  >
                    Limpar selecao
                  </button>
                </div>
              </div>

              <div className="provider-neighborhood-options">
                {bairrosDisponiveisEdicao.map((bairro) => {
                  const selecionado = bairrosSelecionadosEdicao.some(
                    (item) =>
                      normalizarBairroComparacao(item) ===
                      normalizarBairroComparacao(bairro),
                  );

                  return (
                    <button
                      className={selecionado ? "active" : ""}
                      key={normalizarBairroComparacao(bairro)}
                      type="button"
                      onClick={() => alternarBairroEdicao(bairro)}
                    >
                      {bairro}
                    </button>
                  );
                })}
              </div>

              <label className="provider-manual-neighborhood">
                <span>Outro bairro</span>
                <div>
                  <input
                    type="text"
                    value={bairroManual}
                    onChange={(event) => setBairroManual(event.target.value)}
                    placeholder="Digite um bairro"
                  />
                  <button
                    className="secondary-action"
                    type="button"
                    onClick={adicionarBairroManual}
                  >
                    Adicionar
                  </button>
                </div>
              </label>

              {bairrosSelecionadosEdicao.length > 0 && (
                <div className="provider-selected-neighborhoods">
                  {bairrosSelecionadosEdicao.map((bairro) => (
                    <button
                      key={normalizarBairroComparacao(bairro)}
                      type="button"
                      onClick={() => removerBairroSelecionado(bairro)}
                    >
                      {bairro} <span aria-hidden="true">x</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            )}

            {erroEdicao && <p className="form-error">{erroEdicao}</p>}

            <div className="provider-edit-modal-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={fecharEdicao}
              >
                Cancelar
              </button>
              <button
                className="primary-action"
                type="submit"
                disabled={salvandoEdicao}
              >
                {salvandoEdicao ? "Salvando..." : "Salvar alteracoes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Listafuncionarios;
