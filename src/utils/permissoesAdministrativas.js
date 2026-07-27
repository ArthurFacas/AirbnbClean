export const PERMISSOES_ADMINISTRATIVAS = [
  ["visualizarApartamentos", "Visualizar apartamentos"],
  ["cadastrarApartamentos", "Cadastrar apartamentos"],
  ["editarApartamentos", "Editar apartamentos"],
  ["excluirApartamentos", "Excluir apartamentos"],
  ["visualizarPrestadores", "Visualizar prestadores"],
  ["cadastrarPrestadores", "Cadastrar prestadores"],
  ["editarPrestadores", "Editar prestadores"],
  ["excluirPrestadores", "Excluir ou desativar prestadores"],
  ["visualizarTarefas", "Visualizar tarefas"],
  ["criarTarefas", "Criar tarefas"],
  ["editarTarefas", "Editar tarefas"],
  ["excluirTarefas", "Excluir tarefas"],
  ["atribuirTarefas", "Atribuir tarefas"],
  ["visualizarCalendarios", "Visualizar calendarios"],
  ["administrarAcessosPrestadores", "Administrar acessos de prestadores"],
];

export function criarPermissoesPadrao() {
  return PERMISSOES_ADMINISTRATIVAS.reduce(
    (permissoes, [chave]) => ({
      ...permissoes,
      [chave]: true,
    }),
    {},
  );
}

export function criarConfiguracaoPermissoesPadrao() {
  return {
    permissoes: criarPermissoesPadrao(),
    apartamentosAcesso: "todos",
    apartamentosPermitidos: [],
    prestadoresAcesso: "todos",
    prestadoresPermitidos: [],
  };
}
