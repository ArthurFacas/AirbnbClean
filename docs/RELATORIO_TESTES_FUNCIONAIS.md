# Relatorio de Testes Funcionais - Clean Host

Data da varredura: 27/07/2026  
Escopo: validacao funcional local antes de novas alteracoes de seguranca.  
Ambiente usado para testes destrutivos: servidor local com SQLite temporario em `%TEMP%`.  
Banco real do Render: nao acessado, nao alterado e nao usado nos testes.

## 1. Resumo geral

Foram executadas validacoes de inicializacao, build, lint, API, login, criacao de Master por chave, convites de Gestora e Prestador, portal do prestador, permissao, rotas principais, `/api/state`, frontend via HTTP e Git/banco local.

Resultado consolidado:

- Testes aprovados: 43
- Testes funcionais com falha confirmada: 1
- Comandos tecnicos executados:
  - `node --check server.js`: aprovado
  - `npm run lint`: aprovado
  - `npm run build`: aprovado
  - `npm audit --audit-level=low`: encontrou 4 vulnerabilidades altas

Falha funcional confirmada:

- `PUT /api/state` com estado vazio apaga funcionarios, apartamentos e tarefas do owner no banco temporario. Isso confirma que o risco antigo de sobrescrita por estado vazio ainda existe.

Observacoes:

- A ferramenta de navegador in-app nao estava exposta nesta sessao. Por isso, nao foi possivel inspecionar console visualmente. A abertura do frontend foi validada por HTTP, build Vite e titulo HTML.
- Um teste inicial de conclusao de tarefa por Prestador falhou porque a chamada foi feita sem o token no corpo. O teste foi repetido com o contrato correto (`token` no corpo) e passou.

## 2. Testes aprovados

### Inicializacao e build

| Teste | Resultado | Evidencia |
|---|---:|---|
| Servidor inicia e `/api/health` responde | Aprovado | HTTP 200 |
| Banco temporario abre corretamente | Aprovado | `/api/health` apontou para arquivo temporario |
| Criacao/migration de tabelas no SQLite temporario | Aprovado | Rotas dependentes das tabelas funcionaram |
| `node --check server.js` | Aprovado | Exit code 0 |
| `npm run lint` | Aprovado | Exit code 0 |
| `npm run build` | Aprovado | Build Vite concluido |
| Frontend abre por HTTP | Aprovado | GET `/` retornou 200 |
| Titulo da aba no HTML | Aprovado | `<title>HomeAway</title>` |

### Login Master

| Teste | Resultado | Evidencia |
|---|---:|---|
| Login Master com senha correta | Aprovado | HTTP 200 e token retornado |
| Login Master com senha errada | Aprovado | HTTP 401 |
| Login com e-mail inexistente | Aprovado | HTTP 401 |
| Token invalido em `/api/state` | Aprovado | HTTP 401 |
| Master existente continua logando depois de criar outro Master | Aprovado | Login do primeiro Master retornou `papel=Master` |
| Sessao criada corretamente | Aprovado | Resposta de login retornou token |

Observacao: nao existe logica de expiracao de token atualmente; portanto, token expirado nao foi testavel.

### Criacao de Master por chave

| Teste | Resultado | Evidencia |
|---|---:|---|
| Cadastro Master sem chave | Aprovado | HTTP 403 |
| Chave invalida | Aprovado | HTTP 403 |
| Chave valida cria Master | Aprovado | HTTP 201 e `papel=Master` |
| Pode existir mais de um Master | Aprovado | Segundo Master criado com outra chave |
| Chave usada nao funciona novamente | Aprovado | HTTP 403 |
| Chave expirada | Aprovado | HTTP 403 |
| Chave cancelada | Aprovado | Cancelamento HTTP 200, uso HTTP 403 |
| Corpo tentando enviar `papel=Gestora` | Aprovado | Usuario criado como `Master` |
| Corpo tentando enviar `papel=Prestador` | Aprovado | Usuario criado como `Master` |
| Master autenticado gera chave | Aprovado | `POST /api/auth/master-activation-keys` retornou 201 |

### Gestora

| Teste | Resultado | Evidencia |
|---|---:|---|
| Master gera convite para Gestora | Aprovado | `POST /api/invites` retornou link |
| Gestora cria login e senha por convite | Aprovado | `POST /api/invite` retornou 201 e tipo `Gestora` |
| Convite de Gestora usado nao funciona novamente | Aprovado | HTTP 403 |
| Convite expirado bloqueado | Aprovado | HTTP 403 em convite expirado |
| Convite cancelado bloqueado | Aprovado | HTTP 403 apos cancelamento |
| Gestora faz login | Aprovado | HTTP 200 e `papel=Gestora` |
| Gestora acessa estado/admin | Aprovado | `GET /api/state` retornou 200 |
| Gestora nao altera proprias permissoes | Aprovado | HTTP 403 |
| Gestora nao altera Master | Aprovado | HTTP 403 |
| Gestora nao vira Master por corpo de requisicao | Aprovado | HTTP 403 sem chave valida |
| Permissoes limitadas respeitadas | Aprovado | Gestora limitada nao recebeu prestadores sem permissao |

Observacao: o teste confirmou o backend. Nao houve validacao visual da sidebar por navegador por indisponibilidade da ferramenta de browser.

### Prestador

| Teste | Resultado | Evidencia |
|---|---:|---|
| Master gera convite para Prestador | Aprovado | `POST /api/invites` retornou link |
| Prestador cria login/senha por convite | Aprovado | `POST /api/invite` retornou 201 e tipo `Prestador` |
| `/api/provider/register` sem convite | Aprovado | HTTP 403 |
| Convite usado nao funciona novamente | Aprovado | HTTP 403 |
| Convite expirado bloqueado | Aprovado | HTTP 403 |
| Prestador faz login | Aprovado | HTTP 200 e token retornado |
| Prestador abre portal | Aprovado | `GET /api/provider/portal` retornou 200 |
| Prestador ve tarefas proprias | Aprovado | Portal retornou tarefa atribuida |
| Prestador conclui tarefa atribuida | Aprovado | `POST /api/provider/complete` retornou 200 e status `Concluida` |
| Prestador errado nao conclui tarefa | Aprovado | HTTP 401/404 |
| Prestador nao acessa `/api/state` | Aprovado | HTTP 401 |

Observacao: a rota `/api/provider/complete` exige `token` no corpo da requisicao. Com esse contrato, o teste passou.

### Apartamentos, prestadores e tarefas

Como o sistema usa `/api/state` para persistir listas, os testes foram feitos por esse endpoint em banco temporario.

| Teste | Resultado | Evidencia |
|---|---:|---|
| Criar apartamento | Aprovado | Salvo e retornado em `/api/state` |
| Editar apartamento | Aprovado | Numero alterado retornou corretamente |
| Criar prestador | Aprovado | Prestador retornado em `/api/state` |
| Criar Gestora operacional | Aprovado | Gestora retornada em `/api/state` |
| Criar tarefa | Aprovado | Tarefa retornada em `/api/state` |
| Editar tarefa | Aprovado | Estado editado persistiu |
| Atribuir apartamento | Aprovado | `apartamentoId` persistiu |
| Atribuir prestador | Aprovado | `funcionarioId` persistiu |
| Duas alteracoes proximas preservam dados | Aprovado | Duas listas salvas e recarregadas com 2 apartamentos e 2 tarefas |

Nao foram validados visualmente calendario e cards no navegador por indisponibilidade da ferramenta de browser nesta sessao.

### API e respostas

| Teste | Resultado | Evidencia |
|---|---:|---|
| Metodo incorreto em rota de login | Aprovado | HTTP 405 |
| ID inexistente no portal bloqueado | Aprovado | HTTP diferente de 200 |
| Resposta de login nao retorna hash de senha | Aprovado | Sem `senha_hash`/`senha_salt` na resposta |
| Resposta nao expõe hash de chave | Aprovado | Sem `codigo_hash` na resposta publica validada |

### Banco e Git

| Teste | Resultado | Evidencia |
|---|---:|---|
| Ambiente local usa `data/database.sqlite` por padrao | Aprovado por leitura de codigo | `DATA_DIR` local aponta para `data` |
| Render usa `/var/data/cleanhost/database.sqlite` | Aprovado por leitura de codigo | `process.env.RENDER ? "/var/data/cleanhost"` |
| Arquivos SQLite locais nao estao rastreados pelo Git | Aprovado | `git ls-files data .env .env.local` retornou vazio |
| `.env` nao esta rastreado | Aprovado | `git ls-files` retornou vazio |
| WAL/SHM ignorados | Aprovado | `.gitignore` contem `data/*.sqlite-wal` e `data/*.sqlite-shm` |
| Arquivos locais continuam no computador | Aprovado | `Test-Path` retornou `True` para os quatro arquivos locais |

## 3. Testes que falharam

### 3.1 `PUT /api/state` com estado vazio apaga dados

- Gravidade: Alta.
- Arquivo: `server.js`.
- Funcao/rota: `salvarEstado`, `PUT /api/state`.
- Comportamento esperado: uma requisicao acidental com estado vazio nao deveria apagar todos os funcionarios, apartamentos e tarefas ja salvos, ou deveria exigir uma acao explicita de exclusao total.
- Comportamento encontrado: em banco temporario, apos salvar dados validos e depois enviar:

```json
{
  "ownerId": 1,
  "funcionarios": [],
  "apartamentos": [],
  "tarefas": []
}
```

o recarregamento retornou:

```text
apartamentos=0, funcionarios=0, tarefas=0
```

- Evidencia: teste `estado vazio nao apaga dados` falhou com `apt=0, funcs=0, tarefas=0`.
- Risco: perda de dados se o frontend fizer autosave antes de carregar o banco, se uma sessao trocar de usuario com estado vazio, se houver estado local defasado ou se alguem chamar a API manualmente com listas vazias.
- Sugestao de correcao: nao aplicar nesta etapa. Em etapa futura, proteger `/api/state` contra sobrescrita total acidental, separar endpoints por entidade ou exigir uma flag explicita e permissao reforcada para exclusao total.

## 4. Erros encontrados

### 4.1 Vulnerabilidades em dependencias

- Gravidade: Alta para manutencao, nao necessariamente falha funcional imediata.
- Comando: `npm audit --audit-level=low`.
- Resultado: 4 vulnerabilidades altas.
- Pacotes reportados:
  - `brace-expansion`;
  - `postcss`;
  - `react-router`;
  - `react-router-dom`.
- Evidencia: `npm audit` retornou exit code 1 e informou correcoes disponiveis.
- Risco: DoS, path traversal/source map disclosure e alerta de CSRF em modo RSC do React Router.
- Sugestao de correcao: nao executar `npm audit fix` nesta etapa. Atualizar dependencias em branch separada e rodar regressao completa.

### 4.2 Navegador/console nao validado visualmente

- Gravidade: Baixa.
- Motivo: a ferramenta de browser in-app nao estava exposta para esta sessao.
- O que foi validado no lugar:
  - `npm run build`;
  - GET `/` retornando 200;
  - HTML contendo `<title>HomeAway</title>`.
- Risco: erros de console ou problemas visuais podem existir sem serem detectados nesta varredura.
- Sugestao: quando a ferramenta de navegador estiver disponivel, abrir o app local e verificar console, navegacao, responsividade e fluxo visual.

## 5. Riscos de quebra

1. `/api/state` ainda e o principal risco funcional.
   - Ele salva listas completas e pode apagar dados quando recebe estado vazio.
   - Risco maior em autosave, troca de sessao, estado local defasado e edicoes concorrentes.

2. Dependencias vulneraveis.
   - Atualizar pode alterar comportamento de rotas, build ou desenvolvimento.
   - Precisa regressao antes de subir.

3. Testes visuais nao executados no navegador.
   - Build passa, mas nao substitui validacao real de UI.

4. Fluxo de primeira criacao de Master depende de chave.
   - Como agora o cadastro sempre exige chave, precisa existir um procedimento operacional para gerar/fornecer a primeira chave em ambientes novos.
   - No teste, a primeira chave foi semeada diretamente no banco temporario para simular provisionamento inicial seguro.

## 6. Rotas testadas

| Metodo | Rota | Status testado | Resultado |
|---|---|---:|---|
| GET | `/api/health` | 200 | Aprovado |
| GET | `/` | 200 | Aprovado |
| POST | `/api/auth/register` sem chave | 403 | Aprovado |
| POST | `/api/auth/register` com chave invalida | 403 | Aprovado |
| POST | `/api/auth/register` com chave valida | 201 | Aprovado |
| POST | `/api/auth/register` com chave usada | 403 | Aprovado |
| POST | `/api/auth/register` com chave expirada | 403 | Aprovado |
| POST | `/api/auth/register` com chave cancelada | 403 | Aprovado |
| POST | `/api/auth/login` correto | 200 | Aprovado |
| POST | `/api/auth/login` senha errada | 401 | Aprovado |
| PUT | `/api/auth/login` | 405 | Aprovado |
| POST | `/api/auth/master-activation-keys` | 201 | Aprovado |
| DELETE | `/api/auth/master-activation-keys` | 200 | Aprovado |
| GET | `/api/state` token valido | 200 | Aprovado |
| GET | `/api/state` token invalido | 401 | Aprovado |
| PUT | `/api/state` estado valido | 200 | Aprovado |
| PUT | `/api/state` estado vazio | 200 | Falha funcional: apagou dados |
| POST | `/api/invites` Gestora | 201 | Aprovado |
| POST | `/api/invites` Prestador | 201 | Aprovado |
| DELETE | `/api/invites` | 200 | Aprovado |
| POST | `/api/invite` convite valido | 201 | Aprovado |
| POST | `/api/invite` convite usado | 403 | Aprovado |
| POST | `/api/invite` convite expirado | 403 | Aprovado |
| POST | `/api/invite` convite cancelado | 403 | Aprovado |
| POST | `/api/provider/register` sem convite | 403 | Aprovado |
| POST | `/api/provider/login` | 200 | Aprovado |
| GET | `/api/provider/portal` | 200 | Aprovado |
| POST | `/api/provider/complete` tarefa correta | 200 | Aprovado |
| POST | `/api/provider/complete` prestador errado | 401/404 | Aprovado |
| PUT | `/api/auth/manager-permissions` por Gestora | 403 | Aprovado |
| PUT | `/api/auth/manager-permissions` por Master | 200 | Aprovado |

Rotas nao testadas diretamente:

- `/api/ical`: nao foi chamada para evitar requisicoes externas e dependencia do Airbnb.
- `/api/auth/recover`: nao foi testada para evitar ampliar escopo de recuperacao de senha nesta etapa.
- `/api/provider/recover`: nao foi testada pelo mesmo motivo.
- `/api/auth/account`: nao foi testada porque e destrutiva para contas, mesmo em banco temporario, e nao era necessaria para validar as mudancas recentes.
- `/api/auth/manager-invite` e `/api/auth/manager`: rotas legadas nao exercitadas nesta varredura.

## 7. Funcionalidades nao testadas e motivo

| Funcionalidade | Motivo |
|---|---|
| Console do navegador | Ferramenta de browser nao exposta nesta sessao |
| Responsividade visual | Sem ferramenta de navegador/screenshot disponivel |
| Clique real em botoes do frontend | Sem ferramenta de navegador exposta |
| Calendario visual | Validacao visual indisponivel; dados de tarefas foram testados por API |
| Ctrl+F5 | Requer navegador |
| iCal real do Airbnb | Evitado para nao depender de rede externa/servico terceiro |
| Recuperacao de senha | Fora do foco das mudancas recentes e evita criar variacoes de dados sensiveis |
| Exclusao de conta Master | Rota destrutiva e nao necessaria para a varredura principal |

## 8. Recomendacoes antes da proxima etapa de seguranca

1. Priorizar correcao de `/api/state` contra sobrescrita por estado vazio.
   - Esta e a unica falha funcional confirmada.
   - Deve ser corrigida antes de aplicar mudancas maiores de seguranca.

2. Antes de corrigir `/api/state`, definir regra de comportamento:
   - quando uma lista vazia e uma exclusao intencional;
   - quando e apenas estado ainda nao carregado;
   - como diferenciar autosave de operacao destrutiva.

3. Executar teste visual assim que o navegador estiver disponivel:
   - tela inicial;
   - login Master/Gestora/Prestador;
   - formulario de criar Master;
   - lista de prestadores;
   - calendario;
   - portal do prestador;
   - console sem erros.

4. Tratar vulnerabilidades do `npm audit` em uma etapa propria.
   - Nao usar `npm audit fix --force` sem regressao.

5. Manter todos os testes destrutivos em banco temporario.
   - Nenhum teste desta etapa usou o banco real do Render.

## 9. Confirmacoes finais

- Nenhum teste foi executado contra o banco real do Render.
- Nenhum dado real foi criado, editado ou apagado.
- O banco temporario foi removido apos os testes.
- Nenhum commit foi feito.
- Nenhum push foi feito.
- Nenhuma correcao foi aplicada nesta etapa.
- Nenhum segredo, token ou senha real foi registrado neste relatorio.
