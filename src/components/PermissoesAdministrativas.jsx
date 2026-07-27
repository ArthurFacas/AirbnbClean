import { PERMISSOES_ADMINISTRATIVAS } from "../utils/permissoesAdministrativas";

function obterRotuloApartamento(apartamento) {
  const predio = String(
    apartamento["nome.do.predio"] || apartamento.predio || "",
  ).trim();
  const numero = String(apartamento.numero || "").trim();

  return [predio, numero].filter(Boolean).join(" - ") || "Apartamento";
}

function obterRotuloPrestador(prestador) {
  return [prestador.nome, prestador.cargo].filter(Boolean).join(" - ");
}

function cargoEhGestora(valor) {
  const texto = String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return ["gestora", "gestao", "gerente"].includes(texto);
}

function alternarId(lista, id) {
  const idTexto = String(id);

  return lista.includes(idTexto)
    ? lista.filter((item) => item !== idTexto)
    : [...lista, idTexto];
}

function ListaSelecionavel({
  itens,
  obterRotulo,
  selecionados,
  onChange,
  tipo,
}) {
  return (
    <div className="permissions-select-list">
      <div className="permissions-inline-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={() => onChange(itens.map((item) => String(item.id)))}
        >
          Selecionar todos
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={() => onChange([])}
        >
          Limpar selecao
        </button>
      </div>

      {itens.length ? (
        itens.map((item) => (
          <label className="permission-check" key={`${tipo}-${item.id}`}>
            <input
              type="checkbox"
              checked={selecionados.includes(String(item.id))}
              onChange={() => onChange(alternarId(selecionados, item.id))}
            />
            <span>{obterRotulo(item)}</span>
          </label>
        ))
      ) : (
        <p className="permissions-empty">Nenhum item cadastrado.</p>
      )}
    </div>
  );
}

function PermissoesAdministrativas({
  apartamentos,
  configuracao,
  funcionarios,
  onChange,
}) {
  function atualizarCampo(campo, valor) {
    onChange({
      ...configuracao,
      [campo]: valor,
    });
  }

  function atualizarPermissao(chave) {
    atualizarCampo("permissoes", {
      ...configuracao.permissoes,
      [chave]: !configuracao.permissoes[chave],
    });
  }

  return (
    <section className="permissions-panel">
      <h2>Permissoes</h2>

      <div className="permissions-grid">
        {PERMISSOES_ADMINISTRATIVAS.map(([chave, rotulo]) => (
          <label className="permission-check" key={chave}>
            <input
              type="checkbox"
              checked={Boolean(configuracao.permissoes[chave])}
              onChange={() => atualizarPermissao(chave)}
            />
            <span>{rotulo}</span>
          </label>
        ))}
      </div>

      <details className="permissions-advanced">
        <summary>Permissoes avancadas</summary>

        <div className="permissions-scope">
          <strong>Apartamentos</strong>
          <label className="permission-check">
            <input
              type="radio"
              name="apartamentosAcesso"
              checked={configuracao.apartamentosAcesso !== "selecionados"}
              onChange={() => atualizarCampo("apartamentosAcesso", "todos")}
            />
            <span>Todos os apartamentos</span>
          </label>
          <label className="permission-check">
            <input
              type="radio"
              name="apartamentosAcesso"
              checked={configuracao.apartamentosAcesso === "selecionados"}
              onChange={() =>
                atualizarCampo("apartamentosAcesso", "selecionados")
              }
            />
            <span>Apenas apartamentos selecionados</span>
          </label>

          {configuracao.apartamentosAcesso === "selecionados" && (
            <ListaSelecionavel
              itens={apartamentos}
              obterRotulo={obterRotuloApartamento}
              selecionados={configuracao.apartamentosPermitidos}
              onChange={(ids) => atualizarCampo("apartamentosPermitidos", ids)}
              tipo="apartamento"
            />
          )}
        </div>

        <div className="permissions-scope">
          <strong>Prestadores</strong>
          <label className="permission-check">
            <input
              type="radio"
              name="prestadoresAcesso"
              checked={configuracao.prestadoresAcesso !== "selecionados"}
              onChange={() => atualizarCampo("prestadoresAcesso", "todos")}
            />
            <span>Todos os prestadores</span>
          </label>
          <label className="permission-check">
            <input
              type="radio"
              name="prestadoresAcesso"
              checked={configuracao.prestadoresAcesso === "selecionados"}
              onChange={() =>
                atualizarCampo("prestadoresAcesso", "selecionados")
              }
            />
            <span>Apenas prestadores selecionados</span>
          </label>

          {configuracao.prestadoresAcesso === "selecionados" && (
            <ListaSelecionavel
              itens={funcionarios.filter(
                (funcionario) => !cargoEhGestora(funcionario.cargo),
              )}
              obterRotulo={obterRotuloPrestador}
              selecionados={configuracao.prestadoresPermitidos}
              onChange={(ids) => atualizarCampo("prestadoresPermitidos", ids)}
              tipo="prestador"
            />
          )}
        </div>
      </details>
    </section>
  );
}

export default PermissoesAdministrativas;
