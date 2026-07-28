# Relatorio de Testes de Seguranca Ativos - Clean Host

Data: 2026-07-27  
Ambiente: local isolado com SQLite temporario  
Escopo: testes controlados de seguranca, sem correcao de codigo e sem alteracao do banco real do Render

## 1. Resumo executivo

Foi executada uma rodada controlada de testes de seguranca no sistema Clean Host usando servidor local e bancos SQLite temporarios criados apenas para os testes. O banco real do Render, localizado em `/var/data/cleanhost/database.sqlite`, nao foi acessado nem modificado.

Resultado consolidado:

- Testes e verificacoes aprovadas: 52
- Falhas criticas confirmadas: 0
- Falhas altas confirmadas: 6
- Falhas medias confirmadas: 6
- Falhas baixas confirmadas: 3

Os controles recentes de cadastro publico de Master, cadastro publico de Prestador sem convite e bloqueio de estado vazio em `PUT /api/state` funcionaram nos testes locais. Tambem foi confirmado que a Gestora, quando configurada corretamente, acessa o dashboard administrativo com dados filtrados conforme permissoes.

Os principais riscos restantes estao concentrados em:

- ausencia de rate limit em rotas sensiveis;
- recuperacao de senha baseada em dados pessoais suficientes para troca imediata;
- falta de limite claro de tamanho de requisicao;
- CORS e headers HTTP de seguranca permissivos ou ausentes;
- exposicao de informacoes internas em rota de diagnostico e dependencias com vulnerabilidades conhecidas.

## 2. Falhas criticas

Nenhuma falha critica foi confirmada nesta rodada controlada.

## 3. Falhas altas

### 3.1 Ausencia de rate limit em login, chave de ativacao, convite e recuperacao

- Gravidade: Alta
- Arquivo: `server.js`
- Funcao: rotas de autenticacao, convites, chave de Master e recuperacao
- Rotas: `/api/auth/login`, `/api/provider/login`, `/api/master-activation/register`, `/api/auth/recover`, `/api/provider/recover`
- Teste executado: varias tentativas consecutivas e controladas com senha, chave ou dados invalidos.
- Resultado esperado: apos varias tentativas, resposta `429 Too Many Requests` ou bloqueio temporario.
- Resultado encontrado: as rotas continuaram respondendo `401` ou `403`, sem bloqueio por IP, usuario ou rota.
- Impacto: permite tentativa automatizada de senhas, chaves de ativacao, convites e recuperacao de senha.
- Possibilidade de exploracao: alta, pois basta repetir chamadas HTTP.
- Correcao sugerida: aplicar rate limit por rota e por identificador relevante, com limites mais restritos em login, convite, chave de Master e recuperacao.
- Risco de quebrar funcionalidade: medio; limite agressivo pode bloquear usuario legitimo. Usar janela curta e mensagens claras.
- Testes de regressao necessarios: login valido apos janela de bloqueio, erro `429` apos tentativas excessivas, fluxo normal de convite e recuperacao dentro do limite.

### 3.2 Recuperacao de senha administrativa permite troca com dados pessoais

- Gravidade: Alta
- Arquivo: `server.js`
- Funcao: recuperacao administrativa
- Rota: `/api/auth/recover`
- Teste executado: envio de e-mail, CPF e telefone ficticios de uma conta administrativa local.
- Resultado esperado: fluxo com token temporario, comprovacao forte ou etapa fora de banda.
- Resultado encontrado: a senha foi alterada com sucesso usando os dados pessoais cadastrados.
- Impacto: quem souber dados pessoais da conta pode assumir acesso administrativo.
- Possibilidade de exploracao: alta quando e-mail, telefone ou CPF forem conhecidos ou vazados.
- Correcao sugerida: trocar para fluxo com token de recuperacao de uso unico, expiracao curta, envio por canal controlado e invalidacao de sessoes antigas.
- Risco de quebrar funcionalidade: medio; o usuario perde o fluxo simples atual de troca direta.
- Testes de regressao necessarios: recuperacao com token valido, token usado, token expirado, dados incompletos, login antigo invalidado.

### 3.3 Recuperacao de senha do Prestador permite troca com dados simples

- Gravidade: Alta
- Arquivo: `server.js`
- Funcao: recuperacao de Prestador
- Rota: `/api/provider/recover`
- Teste executado: envio de e-mail e telefone ficticios de Prestador local.
- Resultado esperado: exigencia de token temporario ou validacao forte.
- Resultado encontrado: a senha foi alterada com sucesso usando dados cadastrais simples.
- Impacto: um atacante com dados de contato pode tomar conta de Prestador.
- Possibilidade de exploracao: alta em caso de vazamento ou conhecimento do telefone/e-mail.
- Correcao sugerida: aplicar o mesmo modelo seguro de recuperacao por token, expiracao, uso unico e rate limit.
- Risco de quebrar funcionalidade: medio; altera o fluxo operacional de recuperacao.
- Testes de regressao necessarios: recuperacao valida, token invalido, token usado, token expirado, login do Prestador apos troca.

### 3.4 Ausencia de limite claro de tamanho de requisicao

- Gravidade: Alta
- Arquivo: `server.js`
- Funcao: parsing JSON e `PUT /api/state`
- Rota: `/api/state`
- Teste executado: envio controlado de corpo com texto grande, dentro de volume local seguro.
- Resultado esperado: rejeicao com `413 Payload Too Large` ou validacao de tamanho por campo.
- Resultado encontrado: a requisicao foi aceita e processada.
- Impacto: risco de consumo excessivo de memoria, crescimento indevido do SQLite e lentidao no servidor.
- Possibilidade de exploracao: media a alta, dependendo da exposicao da API.
- Correcao sugerida: configurar limite em `express.json`, limitar tamanho por campo e limitar quantidade de itens por lista.
- Risco de quebrar funcionalidade: baixo a medio; escolher limites compativeis com o uso real da cliente.
- Testes de regressao necessarios: salvar estado normal, rejeitar corpo acima do limite, manter mensagens claras.

### 3.5 Sessoes sem expiracao ou logout server-side aparente

- Gravidade: Alta
- Arquivo: `server.js`, `src/App.jsx`, componentes de login
- Funcao: autenticacao por token/localStorage
- Rotas: rotas protegidas em geral
- Teste executado: inspecao de fluxo de token e chamadas com token valido/invalido.
- Resultado esperado: token com expiracao clara e possibilidade de invalidacao server-side.
- Resultado encontrado: nao foi encontrada evidencia de expiracao curta nem logout server-side. O logout remove a sessao do navegador, mas nao aparenta revogar token no servidor.
- Impacto: token copiado pode continuar funcionando por tempo indeterminado, salvo invalidacao indireta por troca de senha.
- Possibilidade de exploracao: media a alta em caso de XSS, maquina compartilhada ou vazamento do armazenamento local.
- Correcao sugerida: usar tokens com expiracao, rotacao, lista de revogacao ou versao de sessao por usuario.
- Risco de quebrar funcionalidade: medio; exige cuidado para nao derrubar usuarios durante uso normal.
- Testes de regressao necessarios: token expirado, logout, troca de senha, conta desativada, recarregamento da pagina.

### 3.6 Dependencias com vulnerabilidades conhecidas

- Gravidade: Alta
- Arquivo: `package.json`, `package-lock.json`
- Funcao: cadeia de dependencias
- Rotas: impacto indireto no build e runtime
- Teste executado: `npm audit --audit-level=low`
- Resultado esperado: nenhuma vulnerabilidade conhecida alta em dependencias usadas.
- Resultado encontrado: 4 vulnerabilidades altas reportadas, incluindo `brace-expansion`, `postcss` e `react-router`.
- Impacto: risco varia por pacote; inclui DoS, exposicao via source maps e CSRF em modo especifico do React Router.
- Possibilidade de exploracao: depende de uso efetivo no runtime e configuracao de build.
- Correcao sugerida: avaliar atualizacao controlada, preferindo `npm audit fix` quando nao quebrar versoes; testar com build e fluxo completo.
- Risco de quebrar funcionalidade: medio; `npm audit fix --force` indicou possivel downgrade/alteracao do `react-router-dom`.
- Testes de regressao necessarios: login, rotas, dashboard, calendario, convite, build e smoke test visual.

## 4. Falhas medias

### 4.1 JSON malformado retorna erro 500

- Gravidade: Media
- Arquivo: `server.js`
- Funcao: middleware de JSON/erros
- Rota: `/api/auth/login`
- Teste executado: envio de JSON malformado.
- Resultado esperado: resposta controlada `400 Bad Request`.
- Resultado encontrado: resposta `500`.
- Impacto: comportamento ruidoso, potencial exposicao de erro interno e pior experiencia para clientes HTTP.
- Possibilidade de exploracao: baixa a media; pode ser usado para gerar erros repetidos.
- Correcao sugerida: adicionar middleware de erro para `SyntaxError` do parser JSON retornando `400`.
- Risco de quebrar funcionalidade: baixo.
- Testes de regressao necessarios: JSON valido, JSON malformado, corpo vazio, corpo com tipo invalido.

### 4.2 CORS aceita origem externa falsa com wildcard

- Gravidade: Media
- Arquivo: `server.js`
- Funcao: configuracao CORS
- Rota: `OPTIONS /api/auth/login`
- Teste executado: requisicao com `Origin: https://evil.example`.
- Resultado esperado: origem negada ou ausencia de `Access-Control-Allow-Origin`.
- Resultado encontrado: `Access-Control-Allow-Origin: *`.
- Impacto: qualquer site pode chamar a API a partir do navegador. Com Bearer token em localStorage, o risco principal depende de XSS ou exposicao do token.
- Possibilidade de exploracao: media.
- Correcao sugerida: restringir origens a localhost de desenvolvimento, dominio Render e dominio personalizado.
- Risco de quebrar funcionalidade: medio; precisa incluir todos os dominios legitimos.
- Testes de regressao necessarios: localhost, Render, dominio oficial, origem externa negada, preflight.

### 4.3 Headers HTTP de seguranca ausentes

- Gravidade: Media
- Arquivo: `server.js`
- Funcao: respostas HTTP
- Rotas: aplicavel ao app e API
- Teste executado: leitura de headers no servidor local.
- Resultado esperado: `Content-Security-Policy`, `X-Content-Type-Options`, protecao contra iframe, `Referrer-Policy` e politicas compativeis.
- Resultado encontrado: headers principais ausentes.
- Impacto: aumenta impacto de XSS, clickjacking e vazamento de referencias.
- Possibilidade de exploracao: media, principalmente se outra falha permitir injetar conteudo.
- Correcao sugerida: configurar Helmet ou headers equivalentes com politica testada para Vite/React.
- Risco de quebrar funcionalidade: medio; CSP incorreta pode bloquear assets, scripts ou chamadas API.
- Testes de regressao necessarios: build, login, dashboard, calendario, WhatsApp, icones e assets.

### 4.4 `/api/health` expoe caminhos e detalhes internos

- Gravidade: Media
- Arquivo: `server.js`
- Funcao: healthcheck
- Rota: `/api/health`
- Teste executado: chamada publica local ao endpoint.
- Resultado esperado: resposta minima, como `ok: true`.
- Resultado encontrado: resposta inclui campos como arquivo de banco, caminho de disco persistente e ambiente.
- Impacto: auxilia reconhecimento do ambiente e estrutura interna.
- Possibilidade de exploracao: media; geralmente usada como informacao auxiliar.
- Correcao sugerida: reduzir healthcheck publico e mover detalhes para rota administrativa autenticada.
- Risco de quebrar funcionalidade: baixo a medio; Render pode depender apenas do status 200.
- Testes de regressao necessarios: healthcheck do Render, resposta publica minima, rota admin protegida se criada no futuro.

### 4.5 Segredo local padrao hardcoded para protecao reversivel

- Gravidade: Media
- Arquivo: `server.js`
- Funcao: configuracao `CLEANHOST_SECRET`
- Rota: impacto indireto em dados protegidos
- Teste executado: busca estatica por secrets e configuracoes sensiveis.
- Resultado esperado: segredo obrigatorio via variavel de ambiente em ambiente sensivel.
- Resultado encontrado: fallback local `"cleanhost-local-senha-porta"` definido no codigo.
- Impacto: se usado em ambiente errado, reduz a protecao de dados cifrados.
- Possibilidade de exploracao: media em ambientes sem variavel configurada.
- Correcao sugerida: exigir segredo forte em producao e manter fallback apenas para desenvolvimento local com alerta.
- Risco de quebrar funcionalidade: medio se producao nao tiver variavel configurada.
- Testes de regressao necessarios: inicializacao local, inicializacao em producao com secret, falha controlada sem secret em producao.

### 4.6 Conteudo HTML/script pode ser salvo como texto

- Gravidade: Media
- Arquivo: `server.js`, componentes React que exibem nomes/observacoes
- Funcao: persistencia e exibicao de campos textuais
- Rotas: `/api/state` e rotas que persistem dados operacionais
- Teste executado: payloads inofensivos como `<script>alert(1)</script>` e `<img src=x onerror=alert(1)>`.
- Resultado esperado: validacao ou sanitizacao de campos textuais quando necessario.
- Resultado encontrado: o texto pode ser salvo. Nao foi encontrada evidencia de execucao direta porque React escapa texto por padrao, e nao foi identificado `dangerouslySetInnerHTML` nos componentes principais.
- Impacto: risco residual caso algum componente futuro renderize HTML sem escape ou bibliotecas externas sejam adicionadas.
- Possibilidade de exploracao: baixa a media no estado atual.
- Correcao sugerida: validar tamanho/formato no backend e manter politica de nao renderizar HTML de usuario.
- Risco de quebrar funcionalidade: baixo.
- Testes de regressao necessarios: salvar nomes/observacoes comuns, exibir caracteres especiais como texto, confirmar ausencia de execucao.

## 5. Falhas baixas

### 5.1 SPA fallback retorna 200 para caminhos sensiveis inexistentes

- Gravidade: Baixa
- Arquivo: `server.js`
- Funcao: servir frontend estatico
- Rotas: `/.env`, `/data/database.sqlite`
- Teste executado: requisicao GET para caminhos sensiveis.
- Resultado esperado: idealmente `404` para arquivos sensiveis inexistentes.
- Resultado encontrado: `200` com fallback do app React, sem expor o conteudo real dos arquivos.
- Impacto: pode confundir scanners e logs, mas nao houve exposicao de `.env` ou SQLite no teste.
- Possibilidade de exploracao: baixa.
- Correcao sugerida: negar explicitamente caminhos sensiveis antes do fallback SPA.
- Risco de quebrar funcionalidade: baixo.
- Testes de regressao necessarios: rotas SPA continuam funcionando, arquivos sensiveis retornam 404/403.

### 5.2 Historico Git pode conter arquivos de banco antigos

- Gravidade: Baixa
- Arquivo: historico Git
- Funcao: controle de versao
- Rota: nao aplicavel
- Teste executado: `git ls-files data .env .env.local *.log`.
- Resultado esperado: nenhum banco, `.env` ou log rastreado no estado atual.
- Resultado encontrado: estado atual limpo, mas historico profundo nao foi limpo nesta etapa.
- Impacto: caso banco real ou dados sensiveis tenham sido commitados no passado, podem permanecer acessiveis no historico.
- Possibilidade de exploracao: depende do acesso ao repositorio.
- Correcao sugerida: em etapa separada, auditar historico e, se necessario, rotacionar segredos e limpar historico com processo controlado.
- Risco de quebrar funcionalidade: baixo, mas limpar historico impacta colaboracao Git.
- Testes de regressao necessarios: clone limpo, deploy, ausencia de dados sensiveis no repositorio.

### 5.3 Testes passivos em producao nao foram executados por falta do dominio

- Gravidade: Baixa
- Arquivo: ambiente de producao
- Funcao: verificacoes passivas
- Rota: dominio publicado
- Teste executado: nao executado.
- Resultado esperado: validar HTTPS, certificado, headers e exposicao publica no dominio real.
- Resultado encontrado: dominio de producao nao foi informado na conversa.
- Impacto: lacuna de validacao entre local e Render.
- Possibilidade de exploracao: desconhecida.
- Correcao sugerida: executar apenas verificacoes passivas quando o dominio for informado.
- Risco de quebrar funcionalidade: nenhum, por ser leitura.
- Testes de regressao necessarios: nao aplicavel.

## 6. Testes aprovados

### Autenticacao

- Login Master com credenciais corretas retornou sucesso.
- Login Master com senha errada foi bloqueado.
- Login com e-mail inexistente foi bloqueado.
- Login com campos vazios foi bloqueado.
- Token ausente em rota protegida foi bloqueado.
- Token invalido em rota protegida foi bloqueado.
- Token de Prestador em rota administrativa foi bloqueado.
- Token administrativo no portal de Prestador foi bloqueado.
- Token antigo de administrador foi invalidado apos recuperacao de senha.

### Chaves de Master

- Master autenticado gerou chave de ativacao.
- Chave valida criou novo Master.
- Envio de `papel` forjado no corpo nao transformou o resultado em outro cargo.
- Chave alterada em um caractere foi bloqueada.
- Chave cancelada foi bloqueada.
- Convite de Gestora nao criou Master.
- Cadastro sem chave foi bloqueado pelo fluxo de chave.

### Convites e cargos

- Convite de Gestora criou conta com cargo Gestora definido pelo backend.
- Tentativa de alterar cargo no corpo do convite foi ignorada.
- Alteracao de e-mail no cadastro por convite foi bloqueada.
- Gestora nao conseguiu gerar chave de Master.
- Gestora nao conseguiu alterar as proprias permissoes.
- Gestora nao conseguiu alterar outra Gestora.

### Prestador

- `POST /api/provider/register` sem convite nao criou conta.
- Prestador criado por convite conseguiu login.
- Prestador A nao conseguiu concluir tarefa do Prestador B.
- Prestador com token valido acessou somente rota propria do portal.

### Permissoes e filtros

- Gestora limitada recebeu apenas apartamentos autorizados.
- Gestora limitada recebeu apenas prestadores autorizados.
- Gestora limitada recebeu apenas tarefas dentro do escopo autorizado.
- Master continuou vendo dados completos no banco temporario.

### `/api/state`

- Estado valido foi aceito.
- Tres listas vazias foram bloqueadas com `409`.
- Listas ausentes foram bloqueadas.
- Tipo invalido para lista foi bloqueado.
- Os dados anteriores permaneceram intactos apos tentativa de estado vazio.
- SQL injection simples no login nao autenticou usuario.

### SSRF e iCal

- URL `http://localhost` foi bloqueada.
- URL `file://` foi bloqueada.
- Dominio externo nao permitido foi bloqueado.

### Build, Git e dependencias

- `node --check server.js` passou.
- `npm run lint` passou.
- `npm run build` passou.
- `git ls-files data .env .env.local *.log` nao retornou arquivos rastreados.
- Arquivos SQLite locais, WAL, SHM, `.env` e logs nao aparecem rastreados no estado atual do Git.

## 7. Testes nao realizados

- Testes visuais em navegador, console do frontend e responsividade nao foram executados porque a ferramenta de navegador local nao estava disponivel nesta sessao.
- Testes passivos no dominio de producao nao foram executados porque o dominio publicado nao foi informado.
- Teste de reutilizacao simultanea real da mesma chave foi avaliado logicamente, mas nao foi executado com concorrencia paralela real.
- Teste destrutivo em producao nao foi executado por restricao explicita.
- Limpeza de historico Git nao foi executada porque esta etapa era somente de teste e relatorio.

## 8. Evidencias

### Comandos executados

- `node --check server.js`: aprovado.
- `npm run lint`: aprovado.
- `npm run build`: aprovado.
- `npm audit --audit-level=low`: encontrou 4 vulnerabilidades altas.
- `npm outdated`: encontrou dependencias com versoes novas disponiveis.
- `git ls-files data .env .env.local *.log`: nao retornou arquivos rastreados.
- `git status --short`: limpo antes da criacao deste relatorio.

### Evidencias de API local

- `PUT /api/state` com `funcionarios: []`, `apartamentos: []`, `tarefas: []` retornou `409`.
- `POST /api/provider/register` sem convite retornou bloqueio e nao criou conta.
- `POST /api/master-activation/register` com chave alterada/cancelada/ausente retornou bloqueio.
- `POST /api/auth/login` com JSON malformado retornou `500`.
- `OPTIONS /api/auth/login` com origem externa retornou CORS wildcard.
- `GET /api/health` retornou detalhes internos de ambiente e caminho.
- Requisicoes para `/.env` e `/data/database.sqlite` nao expuseram arquivos, mas retornaram fallback SPA.

## 9. Rotas afetadas

| Metodo | Rota | Resultado principal | Risco |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Login funciona, mas sem rate limit e JSON malformado gera 500 | Alto/Medio |
| POST | `/api/provider/login` | Login funciona, sem rate limit confirmado | Alto |
| POST | `/api/auth/recover` | Troca senha com dados pessoais | Alto |
| POST | `/api/provider/recover` | Troca senha com e-mail/telefone | Alto |
| POST | `/api/master-activation/generate` | Master gera chave; Gestora bloqueada | Aprovado |
| POST | `/api/master-activation/register` | Chave valida cria Master; chave invalida bloqueada; sem rate limit | Alto |
| POST | `/api/master-activation/cancel` | Chave cancelada deixa de funcionar | Aprovado |
| GET | `/api/invites/:token` | Convite validado no backend | Aprovado parcial |
| POST | `/api/invites/:token/accept` | Cargo forjado ignorado e e-mail alterado bloqueado | Aprovado |
| POST | `/api/provider/register` | Cadastro publico sem convite bloqueado | Aprovado |
| GET | `/api/state` | Protege token ausente/invalido e aplica filtros | Aprovado |
| PUT | `/api/state` | Estado vazio bloqueado; corpo grande aceito | Alto |
| POST | `/api/ical` | Bloqueia localhost, file e dominio externo | Aprovado |
| GET | `/api/health` | Expoe detalhes internos | Medio |
| GET | `/.env` | Nao expos arquivo; fallback 200 | Baixo |
| GET | `/data/database.sqlite` | Nao expos arquivo; fallback 200 | Baixo |

## 10. Plano sugerido de correcao por etapas

### Etapa 1 - Abuso e recuperacao de senha

1. Adicionar rate limit nas rotas de login, recuperacao, convites e chaves.
2. Trocar recuperacao direta por fluxo com token temporario, uso unico e expiracao curta.
3. Garantir invalidacao de sessoes apos troca de senha.

Teste necessario: tentativas repetidas, recuperacao valida/invalida, token usado, token expirado, login antigo bloqueado.

### Etapa 2 - Superficie HTTP

1. Definir limite em `express.json`.
2. Adicionar validacao de tamanho por campo e por lista.
3. Corrigir tratamento de JSON malformado para `400`.
4. Reduzir dados expostos em `/api/health`.

Teste necessario: corpos normais aceitos, corpos grandes rejeitados, healthcheck do Render ainda funcional.

### Etapa 3 - Headers, CORS e navegador

1. Restringir CORS aos dominios oficiais.
2. Adicionar headers HTTP com politica compativel.
3. Validar CSP com build do Vite e dashboard real.

Teste necessario: localhost, Render, dominio customizado, origem externa negada, login e assets funcionando.

### Etapa 4 - Dependencias

1. Atualizar dependencias em branch separada.
2. Evitar `npm audit fix --force` sem revisar impacto.
3. Rodar build, lint e teste funcional completo.

Teste necessario: login, convites, dashboard, calendario, portal do Prestador e rotas protegidas.

### Etapa 5 - Repositorio e producao

1. Auditar historico Git para bancos e segredos antigos.
2. Rotacionar qualquer segredo que ja tenha sido versionado.
3. Executar verificacoes passivas no dominio publicado.

Teste necessario: clone limpo, deploy, healthcheck, HTTPS, headers e ausencia de arquivos sensiveis acessiveis.

