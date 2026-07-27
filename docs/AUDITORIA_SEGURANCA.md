# Auditoria de Segurança - Clean Host

Data da análise: 27/07/2026  
Escopo: análise estática e operacional em modo somente leitura.  
Resultado: nenhuma correção aplicada nesta etapa.

## 1. Resumo executivo

Esta auditoria avaliou o sistema Clean Host com foco em autenticação, convites, permissões, sessões, API, SQLite, frontend, dependências, arquivos versionados e configuração de produção.

O sistema já possui alguns controles importantes:

- senhas armazenadas com hash PBKDF2 e salt por senha;
- tokens de sessão armazenados no banco como hash;
- convites com código aleatório forte;
- convites salvos no banco por hash, não em texto puro;
- expiração e uso único de convites;
- uso predominante de SQL parametrizado;
- validações de permissões no backend para parte das ações de Gestora;
- React escapa texto por padrão e não foi encontrado uso de `dangerouslySetInnerHTML`.

Os principais riscos encontrados são:

- cadastro público de Master ainda exposto pela API;
- rota antiga pública para criação de acesso de prestador sem convite;
- arquivos SQLite versionados no Git;
- recuperação de senha baseada apenas em dados pessoais;
- ausência de limite de tentativas para login, convite e recuperação;
- sessões sem expiração;
- tokens salvos no navegador;
- CORS aberto para qualquer origem;
- endpoint `/api/state` salva o estado inteiro e pode causar perda de dados se receber lista vazia ou estado defasado;
- ausência de cabeçalhos HTTP de segurança;
- ausência de limite de tamanho do corpo das requisições;
- vulnerabilidades altas em dependências reportadas por `npm audit`.

## 2. Arquitetura identificada

### Frontend

- Arquivo principal: `src/App.jsx`.
- Tela de login/acesso: `src/components/login.jsx`.
- Dashboard administrativo: `src/components/Dashboard.jsx`.
- Portal do prestador: `src/components/PortalPrestador.jsx`.
- Gestão de prestadores/gestoras: `src/components/Listafuncionarios.jsx`.
- Permissões administrativas: `src/components/PermissoesAdministrativas.jsx` e `src/utils/permissoesAdministrativas.js`.

### Backend

- Arquivo principal: `server.js`.
- Servidor criado com `createServer` de `node:http`.
- Não foi encontrado uso de Express, apesar do contexto do projeto mencionar Express.
- API e servidor estático estão no mesmo arquivo `server.js`.

### Banco de dados

- SQLite aberto em `server.js` com `new DatabaseSync(DB_FILE)`.
- Produção no Render:
  - `DATA_DIR`: `/var/data/cleanhost`, quando `process.env.RENDER` existe.
  - `DB_FILE`: `/var/data/cleanhost/database.sqlite`, salvo quando `DATABASE_FILE` não sobrescreve.
- Local:
  - `DATA_DIR`: `data`.
  - `DB_FILE`: `data/database.sqlite`.
- Usa WAL:
  - `PRAGMA journal_mode = WAL`.
  - `PRAGMA busy_timeout = 5000`.
  - `PRAGMA foreign_keys = ON`.

### Comunicação frontend/backend

- O frontend chama rotas relativas, por exemplo `/api/state`, `/api/auth/login`, `/api/invites`.
- O token administrativo é enviado em `Authorization: Bearer {token}`.
- O token de prestador também é enviado como Bearer em rotas protegidas do portal.

### Autenticação

- Master/Gestora:
  - login por `/api/auth/login`;
  - sessão em `usuario_sessoes`;
  - token aleatório enviado ao navegador;
  - hash do token salvo no banco.
- Prestador:
  - login por `/api/provider/login`;
  - sessão em `prestador_sessoes`;
  - token aleatório enviado ao navegador;
  - hash do token salvo no banco.

### Cargo e permissões

- Usuários administrativos usam `usuarios.papel`.
- Prestadores e Gestoras são cadastrados operacionalmente em `funcionarios.cargo`.
- O cargo Gestora é normalizado para `Gestora`.
- Permissões de Gestora são armazenadas em:
  - `usuarios.permissoes_json`;
  - `usuarios.apartamentos_acesso`;
  - `usuarios.apartamentos_permitidos_json`;
  - `usuarios.prestadores_acesso`;
  - `usuarios.prestadores_permitidos_json`.

### Convites

- Gerados por `criarCodigoConvite()`.
- Código: `randomBytes(32).toString("base64url")`.
- Banco salva `codigo_hash`, não o código completo.
- Validade: 7 dias.
- Convite usado recebe `utilizado_em` e `usuario_id`.
- Convite cancelado recebe `cancelado_em`.
- Ao gerar novo convite, convites anteriores não utilizados são cancelados.

## 3. Pontos que já estão seguros

### Senhas com hash e salt

- Arquivo: `server.js`.
- Funções: `criarHashSenha`, `validarSenha`.
- Evidência: uso de `pbkdf2Sync`, salt aleatório e comparação com `timingSafeEqual`.
- Observação: PBKDF2 é aceitável quando bem parametrizado, mas Argon2id ou bcrypt/scrypt são alternativas recomendadas em muitas arquiteturas modernas.

### Tokens de sessão não são salvos puros no banco

- Arquivo: `server.js`.
- Função: `criarHashToken`.
- Evidência: o banco salva `createHash("sha256").update(token)`.
- Risco residual: o token puro fica no navegador.

### Convites são difíceis de adivinhar

- Arquivo: `server.js`.
- Função: `criarCodigoConvite`.
- Evidência: `randomBytes(32)`.
- Risco residual: falta rate limit para tentativas.

### Convites têm expiração e uso único

- Arquivo: `server.js`.
- Funções: `mapearConvitePublico`, `cadastrarAcessoPorConvite`.
- Evidência: verificação de `expira_em`, `utilizado_em`, `usuario_id` e `cancelado_em`.

### SQL parametrizado

- Arquivo: `server.js`.
- Evidência: uso recorrente de `.prepare(...).get(...)`, `.run(...)`, `.all(...)`.
- Risco residual: `garantirColuna` monta SQL com nomes de tabela/coluna, mas os valores são constantes internos, não entrada do usuário.

### React reduz risco básico de XSS

- Arquivos: `src/**/*.jsx`.
- Evidência: não foi encontrado `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `Function`.
- Risco residual: sem CSP e com tokens no navegador, qualquer XSS futuro teria alto impacto.

## 4. Falhas críticas

### 4.1 Cadastro público de Master pela API

- Gravidade: Crítica.
- Arquivo: `server.js`.
- Rota: `POST /api/auth/register`.
- Função relacionada: `criarUsuario`.
- Evidência: a rota `/api/auth/register` não exige autenticação e `criarUsuario` insere o usuário com papel `Master`.

#### Explicação

Mesmo que a interface atual não mostre cadastro público na tela inicial, a API continua permitindo chamada direta para criar uma conta Master.

#### Como pode ser explorada

Um atacante pode enviar uma requisição HTTP manual para `/api/auth/register` com dados de cadastro e criar uma conta administrativa Master.

#### Impacto possível

- Controle total do sistema.
- Acesso a apartamentos, prestadores, tarefas e calendários.
- Possível alteração ou exclusão de dados.
- Criação de Gestoras e convites indevidos.

#### Correção sugerida

- Remover cadastro público de Master após o primeiro usuário.
- Permitir criação do primeiro Master apenas em bootstrap seguro.
- Exigir segredo de instalação temporário ou variável de ambiente para bootstrap.
- Após existir Master ativo, bloquear completamente `POST /api/auth/register`.

#### Risco de alterar funcionalidade

Alto se o sistema ainda usa essa rota para criar o primeiro Master em banco novo. A correção deve preservar o bootstrap inicial.

#### Teste necessário

- Banco vazio permite criar primeiro Master pelo fluxo autorizado.
- Banco com Master ativo bloqueia novo Master público.
- Login Master existente continua funcionando.

### 4.2 Criação pública de acesso de prestador sem convite

- Gravidade: Crítica.
- Arquivo: `server.js`.
- Rota: `POST /api/provider/register`.
- Função relacionada: `criarAcessoPrestador`.
- Evidência: a rota é pública e cria acesso com `funcionarioId`, e-mail e senha.

#### Explicação

O fluxo novo usa convite, mas a rota antiga ainda permite criar acesso de prestador sem código de convite. Ela valida se o e-mail bate com o prestador cadastrado, mas não exige convite válido.

#### Como pode ser explorada

Se alguém descobrir ou enumerar `funcionarioId` e e-mail de um prestador cadastrado, pode criar a senha antes do prestador real.

#### Impacto possível

- Tomada de conta de prestador.
- Acesso a tarefas atribuídas.
- Visualização de dados operacionais do prestador.
- Marcação indevida de tarefas como concluídas.

#### Correção sugerida

- Exigir convite válido em `/api/provider/register`.
- Ou desativar essa rota se o fluxo oficial for apenas `/api/invite`.
- Preservar login de prestadores já cadastrados.

#### Risco de alterar funcionalidade

Médio. Pode afetar links antigos do portal do prestador, se ainda forem usados para criação de senha.

#### Teste necessário

- Prestador novo só cria acesso por convite.
- Prestador com conta existente continua logando.
- Link antigo sem convite não cria nova conta.

### 4.3 Arquivos SQLite e dados locais versionados no Git

- Gravidade: Crítica.
- Arquivos versionados encontrados:
  - `data/database.json`;
  - `data/database.sqlite`;
  - `data/database.sqlite-shm`;
  - `data/database.sqlite-wal`.
- Arquivo relacionado: `.gitignore`.
- Evidência: `git ls-files data .env .env.local *.sqlite *.sqlite-wal *.sqlite-shm *.log` retornou os arquivos acima.

#### Explicação

O banco local e arquivos auxiliares do SQLite estão rastreados pelo Git. Eles podem conter dados pessoais, tarefas, prestadores, apartamentos, hashes de senha e dados operacionais.

#### Como pode ser explorada

Qualquer pessoa com acesso ao repositório ou histórico Git pode baixar esses arquivos e analisar os dados.

#### Impacto possível

- Vazamento de dados pessoais.
- Vazamento de hashes de senha.
- Vazamento de dados operacionais.
- Risco regulatório e reputacional.

#### Correção sugerida

- Adicionar ao `.gitignore`:
  - `data/*.sqlite`;
  - `data/*.sqlite-wal`;
  - `data/*.sqlite-shm`;
  - `data/database.json`;
  - `.env`;
  - `.env.*`.
- Remover arquivos do índice Git sem apagar localmente.
- Se já houve dados reais no histórico, considerar limpeza de histórico e rotação de segredos.

#### Risco de alterar funcionalidade

Baixo para o funcionamento do app, mas alto operacional se remover o banco errado sem backup. Deve ser feito com cuidado.

#### Teste necessário

- App local continua lendo `data/database.sqlite`.
- Render continua usando `/var/data/cleanhost`.
- `git status` não mostra mais WAL/SHM após uso local.

## 5. Falhas altas

### 5.1 Recuperação de senha baseada apenas em dados pessoais

- Gravidade: Alta.
- Arquivo: `server.js`.
- Funções:
  - `recuperarSenhaUsuario`;
  - `recuperarSenhaPrestador`.
- Rotas:
  - `POST /api/auth/recover`;
  - `POST /api/provider/recover`.

#### Explicação

A recuperação de senha administrativa valida e-mail, CPF e telefone. A recuperação do prestador valida e-mail e WhatsApp. Esses dados podem ser conhecidos, vazados ou obtidos por engenharia social.

#### Como pode ser explorada

Um atacante com dados pessoais suficientes redefine a senha sem acesso ao e-mail real da pessoa.

#### Impacto possível

- Tomada de conta de Master, Gestora ou Prestador.
- Alteração de dados.
- Acesso a informações da operação.

#### Correção sugerida

- Implementar token de recuperação com:
  - código aleatório forte;
  - expiração curta;
  - uso único;
  - envio por canal controlado;
  - invalidação de sessões antigas após troca.
- Manter validação de dados pessoais apenas como camada adicional, não como única prova.

#### Risco de alterar funcionalidade

Médio. O fluxo de recuperação muda para depender de envio de link/código.

#### Teste necessário

- Recuperação válida altera senha.
- Token expirado bloqueia.
- Token usado bloqueia.
- Dados pessoais incorretos bloqueiam.
- Sessões antigas são invalidadas.

### 5.2 Ausência de rate limit

- Gravidade: Alta.
- Arquivo: `server.js`.
- Rotas afetadas:
  - login;
  - recuperação de senha;
  - convite;
  - cadastro;
  - `/api/ical`;
  - `/api/state`.

#### Explicação

Não foi encontrado limite de tentativas por IP, conta, rota ou janela de tempo.

#### Como pode ser explorada

- Força bruta de senha.
- Enumeração de e-mails.
- Teste infinito de convites.
- Sobrecarga do SQLite com muitas requisições.

#### Impacto possível

- Tomada de conta.
- Negação de serviço.
- Lentidão ou travamento do app.

#### Correção sugerida

- Rate limit por rota sensível.
- Bloqueio temporário por e-mail/IP.
- Respostas 429.
- Delay progressivo em login/recover/convite.

#### Risco de alterar funcionalidade

Baixo a médio. Limites agressivos podem bloquear usuários legítimos.

#### Teste necessário

- Tentativas normais continuam funcionando.
- Muitas tentativas retornam 429.
- Limite reseta após janela configurada.

### 5.3 Sessões sem expiração

- Gravidade: Alta.
- Arquivo: `server.js`.
- Tabelas:
  - `usuario_sessoes`;
  - `prestador_sessoes`.
- Funções:
  - `criarSessaoUsuario`;
  - `criarSessaoPrestador`.

#### Explicação

As sessões têm `criado_em`, mas não há validação de expiração. Um token roubado pode permanecer válido indefinidamente.

#### Como pode ser explorada

Se um token for capturado via XSS, computador compartilhado ou extensão maliciosa, pode ser reutilizado por tempo indefinido.

#### Impacto possível

- Acesso persistente não autorizado.
- Dificuldade de revogar sessões comprometidas.

#### Correção sugerida

- Adicionar expiração de sessão.
- Remover sessões antigas.
- Criar logout server-side.
- Rotacionar sessão após login e troca de senha.

#### Risco de alterar funcionalidade

Médio. Usuários precisarão fazer login novamente após expiração.

#### Teste necessário

- Sessão válida funciona.
- Sessão expirada é bloqueada.
- Logout invalida token.
- Troca de senha invalida sessões antigas.

### 5.4 Tokens armazenados no navegador

- Gravidade: Alta.
- Arquivos:
  - `src/App.jsx`;
  - `src/components/login.jsx`;
  - `src/components/PortalPrestador.jsx`.
- Evidência:
  - admin em `sessionStorage`;
  - prestador em `localStorage` com fallback para `sessionStorage`.

#### Explicação

Tokens em `localStorage` e `sessionStorage` podem ser lidos por qualquer script executado na origem. Se houver XSS, o token pode ser roubado.

#### Como pode ser explorada

Um script malicioso injetado no frontend lê o token e envia para atacante.

#### Impacto possível

- Roubo de sessão.
- Acesso administrativo ou de prestador.

#### Correção sugerida

- Migrar para cookie HttpOnly, Secure e SameSite.
- Adicionar CSP forte.
- Reduzir persistência de tokens.

#### Risco de alterar funcionalidade

Médio. Muda o modelo de autenticação no frontend e backend.

#### Teste necessário

- Login admin.
- Login prestador.
- Refresh da página.
- Logout.
- Requisições autenticadas.

### 5.5 CORS aberto

- Gravidade: Alta.
- Arquivo: `server.js`.
- Funções:
  - `enviarJson`;
  - `enviarTexto`.
- Evidência: `Access-Control-Allow-Origin: *`.

#### Explicação

Qualquer origem pode chamar a API. Como a autenticação usa Bearer token e não cookie, o risco de CSRF tradicional é menor, mas CORS aberto aumenta a superfície de exploração se um token for obtido.

#### Como pode ser explorada

Um site externo pode tentar chamar a API diretamente e abusar de tokens expostos.

#### Impacto possível

- Abuso de API por origens não autorizadas.
- Facilita exploração combinada com XSS/token vazado.

#### Correção sugerida

- Criar allowlist:
  - domínio personalizado;
  - domínio Render oficial;
  - localhost apenas em desenvolvimento.
- Responder CORS dinamicamente conforme `Origin`.

#### Risco de alterar funcionalidade

Baixo se a allowlist estiver correta.

#### Teste necessário

- Domínio oficial acessa API.
- Localhost funciona em dev.
- Origem desconhecida é bloqueada.

### 5.6 Endpoint `/api/state` salva estado inteiro

- Gravidade: Alta.
- Arquivo: `server.js`.
- Função: `salvarEstado`.
- Rota: `PUT /api/state`.
- Evidência: uso de `DELETE FROM tarefas`, `DELETE FROM apartamentos`, `DELETE FROM funcionarios` para o owner antes de reinserir listas.

#### Explicação

O frontend envia listas completas de funcionários, apartamentos e tarefas. O backend apaga os dados atuais daquele owner e recria tudo. Uma requisição defasada, vazia ou malformada pode apagar dados.

#### Como pode ser explorada

Um usuário com permissão suficiente envia `funcionarios: []`, `apartamentos: []`, `tarefas: []`, ou envia estado antigo sem registros recentes.

#### Impacto possível

- Perda de dados.
- Sobrescrita concorrente.
- Inconsistência entre tarefas, apartamentos e prestadores.

#### Correção sugerida

- Criar endpoints granulares por entidade e ação.
- Usar controle de versão/revisão para autosave.
- Impedir que lista vazia apague tudo sem ação explícita.

#### Risco de alterar funcionalidade

Alto. O autosave atual depende desse modelo.

#### Teste necessário

- Cadastro/edição/exclusão de cada entidade.
- Dois usuários editando ao mesmo tempo.
- Autosave com estado antigo.
- Gestora limitada salvando dados.

## 6. Falhas médias

### 6.1 Ausência de limite de tamanho do corpo da requisição

- Gravidade: Média.
- Arquivo: `server.js`.
- Função: `lerCorpo`.
- Evidência: concatena chunks sem limite.

#### Risco

Um atacante pode enviar corpo muito grande e consumir memória.

#### Correção sugerida

Adicionar limite por rota, por exemplo 100 KB ou outro valor compatível com o uso real, retornando HTTP 413.

#### Teste necessário

- Requisição normal funciona.
- Requisição acima do limite retorna 413.

### 6.2 `/api/health` expõe informações internas

- Gravidade: Média.
- Arquivo: `server.js`.
- Rota: `GET /api/health`.
- Evidência: retorna `databaseFile`, `persistentDiskPath` e `render`.

#### Risco

Exposição de caminho interno e ambiente de produção.

#### Correção sugerida

Retornar apenas `{ ok: true }` em produção. Manter detalhes somente em ambiente local autenticado.

#### Teste necessário

- Health em produção não mostra caminho.
- Monitoramento do Render continua funcionando.

### 6.3 Ausência de cabeçalhos HTTP de segurança

- Gravidade: Média.
- Arquivo: `server.js`.
- Evidência: não foi encontrado Helmet nem headers equivalentes.

#### Risco

Menor proteção contra XSS, clickjacking, MIME sniffing e vazamento de referência.

#### Correção sugerida

Adicionar:

- `Content-Security-Policy`;
- `Strict-Transport-Security`;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options` ou `frame-ancestors`;
- `Referrer-Policy`;
- `Permissions-Policy`.

#### Teste necessário

- App carrega normalmente.
- Assets do Vite carregam.
- WhatsApp links funcionam.
- iCal continua funcionando.

### 6.4 Segredo padrão para criptografia da senha da porta

- Gravidade: Média.
- Arquivo: `server.js`.
- Trecho: `process.env.CLEANHOST_SECRET || "cleanhost-local-senha-porta"`.

#### Risco

Se `CLEANHOST_SECRET` não estiver configurado em produção, senhas de porta são criptografadas com segredo previsível.

#### Correção sugerida

Exigir `CLEANHOST_SECRET` forte em produção e falhar o boot se ausente.

#### Teste necessário

- Produção inicia com segredo.
- Produção falha sem segredo.
- Local continua podendo usar fallback apenas em desenvolvimento.

### 6.5 Política de senha fraca

- Gravidade: Média.
- Arquivo: `server.js`.
- Funções:
  - `criarUsuario`;
  - `cadastrarAcessoPorConvite`;
  - `criarAcessoPrestador`;
  - `recuperarSenhaUsuario`;
  - `recuperarSenhaPrestador`.
- Evidência: mínimo de 6 caracteres.

#### Risco

Senhas curtas facilitam força bruta e reutilização insegura.

#### Correção sugerida

- Mínimo de 10 ou 12 caracteres.
- Máximo razoável para evitar DoS em hashing.
- Bloqueio de senhas comuns.

#### Teste necessário

- Senhas antigas continuam válidas.
- Novas senhas fracas são recusadas.
- Mensagens continuam claras.

### 6.6 Falta de chaves estrangeiras reais

- Gravidade: Média.
- Arquivo: `server.js`.
- Tabelas:
  - `funcionarios`;
  - `apartamentos`;
  - `tarefas`;
  - `usuarios`;
  - `convites_acesso`.

#### Risco

Apesar de `PRAGMA foreign_keys = ON`, as tabelas não declaram `FOREIGN KEY`. Isso permite tarefas apontarem para apartamento/prestador inexistente.

#### Correção sugerida

Planejar migração controlada com FKs reais ou validações transacionais equivalentes.

#### Teste necessário

- Tarefa não pode apontar para apartamento inexistente.
- Exclusões limpam ou impedem referências órfãs.

### 6.7 Dependências com vulnerabilidades altas

- Gravidade: Média/Alta, conforme exposição.
- Arquivos:
  - `package.json`;
  - `package-lock.json`.
- Evidência: `npm audit --audit-level=low` retornou 4 vulnerabilidades altas.

#### Pacotes afetados

- `brace-expansion`;
- `postcss`;
- `react-router`;
- `react-router-dom`.

#### Correção sugerida

Atualizar dependências em branch separada e rodar testes completos. Não usar `npm audit fix --force` sem validar quebra de versão.

#### Teste necessário

- Build.
- Login.
- Convites.
- Dashboard.
- Portal do prestador.
- Navegação de rotas.

## 7. Falhas baixas

### 7.1 Mensagens de erro podem ajudar enumeração

- Gravidade: Baixa.
- Arquivo: `server.js`.
- Funções:
  - `autenticarUsuario`;
  - `autenticarPrestador`;
  - `recuperarSenhaUsuario`;
  - `recuperarSenhaPrestador`.

#### Risco

Mensagens diferentes podem ajudar a descobrir e-mails existentes ou status de conta.

#### Correção sugerida

Usar mensagens genéricas para login e recuperação, mantendo detalhes apenas em logs internos seguros.

#### Teste necessário

- Usuário entende erro sem revelar existência de conta.

### 7.2 Logs de startup exibem caminho do banco

- Gravidade: Baixa.
- Arquivo: `server.js`.
- Evidência: `console.log` mostra `DB_FILE`.

#### Risco

Exposição em logs de produção.

#### Correção sugerida

Em produção, logar apenas que o banco foi inicializado.

#### Teste necessário

- Logs seguem úteis sem revelar path.

### 7.3 Dados textuais sem tamanho máximo consistente

- Gravidade: Baixa/Média.
- Arquivos:
  - `server.js`;
  - componentes de formulário.

#### Risco

Campos como nome, bairro, observação, endereço, descrição e notas podem receber textos muito longos.

#### Correção sugerida

Validar tamanho máximo no backend e frontend.

#### Teste necessário

- Texto normal salva.
- Texto excessivo é bloqueado com mensagem clara.

## 8. Informações e melhorias recomendadas

### Preservar comportamento atual

As correções devem ser feitas sem alterar a experiência principal:

- Master continua no dashboard administrativo.
- Gestora continua no mesmo dashboard, limitada por permissões.
- Prestador continua no portal do prestador.
- Convites continuam criando login e senha.
- Render continua usando disco persistente.

### Melhorias recomendadas por prioridade

1. Bloquear cadastro público de Master após bootstrap.
2. Exigir convite para criação de acesso de prestador.
3. Parar de versionar banco SQLite e arquivos WAL/SHM.
4. Implementar rate limit.
5. Adicionar expiração de sessão e logout server-side.
6. Refazer recuperação de senha com token temporário.
7. Restringir CORS.
8. Adicionar headers HTTP de segurança.
9. Adicionar limite de body.
10. Atualizar dependências com testes.
11. Planejar substituição gradual de `/api/state` por endpoints específicos.

## 9. Inventário completo das rotas da API

| Método | Caminho | Objetivo | Autenticação | Cargos/permissões | Parâmetros/corpo | Retorno | Validações existentes | Risco |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/health` | Diagnóstico | Não | Pública | Nenhum | `ok`, path do banco, ambiente | Inicializa banco | Expõe informações internas |
| GET | `/api/ical?url=` | Proxy iCal Airbnb | Não | Pública | query `url` | texto iCal ou erro | exige URL `https://airbnb` | Sem rate limit; SSRF parcialmente mitigado |
| GET | `/api/state` | Carregar estado operacional | Sim | Master/Gestora conforme escopo | query ownerId opcional | funcionários, apartamentos, tarefas filtrados | token e owner | Endpoint amplo |
| PUT | `/api/state` | Salvar estado operacional | Sim | Master/Gestora com permissões | listas completas | estado filtrado | owner, permissões, escopo parcial | Perda de dados/mass update |
| POST | `/api/auth/register` | Criar usuário Master | Não | Pública | nome, email, telefone, cpf, senha | usuário público + token | email, telefone, cpf, senha mínima | Crítico: cria Master publicamente |
| POST | `/api/auth/login` | Login Master/Gestora | Não | Pública | email, senha | usuário público + token | email e senha | Sem rate limit |
| POST | `/api/auth/recover` | Recuperar senha gestão | Não | Pública | email, cpf, telefone, senha | ok | dados pessoais e senha | Tomada de conta por PII |
| DELETE | `/api/auth/account` | Excluir conta | Sim | Master | usuarioId | ok | Master, impede último Master | Sensível |
| GET | `/api/auth/manager-permissions` | Ler permissões da Gestora | Sim | Master | email | usuário público | Master e alvo válido | Adequado |
| PUT | `/api/auth/manager-permissions` | Salvar permissões | Sim | Master | email e permissões | usuário público | Master, não Master alvo, não própria conta | Adequado |
| GET | `/api/invites` | Ver status do convite | Sim | Master ou `administrarAcessosPrestadores` | funcionarioId | status, ação, link quando aplicável | cargo/permissão | Baixo |
| POST | `/api/invites` | Gerar convite | Sim | Master para Gestora; permissão para prestador | funcionarioId e permissões de Gestora | link/status | cargo, email, acesso existente | Sem rate limit |
| DELETE | `/api/invites` | Cancelar convite | Sim | Master/permissão | funcionarioId | status | cargo/permissão | Baixo |
| GET | `/api/invite` | Ler convite | Não | Pública com código | codigo | nome, email, cargo, expiração | hash, expiração, cancelamento, uso | Sem rate limit |
| POST | `/api/invite` | Usar convite | Não | Pública com código | codigo, confirmarEmail, senha | tipo/email | hash, uso único, expiração, cancelamento | Sem rate limit |
| GET | `/api/auth/manager-invite` | Ler convite legado | Não | Pública com token | token | dados convite | usa função de convite | Rota duplicada/legada |
| POST | `/api/auth/manager-invite` | Criar convite legado | Sim | Usuário autenticado | dados convite | convite | função atual | Duplicidade de superfície |
| POST | `/api/auth/manager-register` | Criar acesso por convite | Não | Pública com código | codigo, email, senha | tipo/email | convite válido | Adequado, sem rate limit |
| POST | `/api/auth/manager` | Criar Gestora direta | Sim | Master | dados da Gestora | usuário | Master, permissões | Rota sensível/legada |
| GET | `/api/provider/access` | Ver status acesso prestador | Não | Pública | funcionarioId | status | busca por ID | Pode enumerar status |
| GET | `/api/provider/portal` | Carregar portal prestador | Sim | Prestador | funcionarioId/token | tarefas do prestador | sessão prestador | Adequado |
| POST | `/api/provider/register` | Criar acesso prestador | Não | Pública | funcionarioId, email, senha | prestador + token | email bate com cadastro | Crítico: sem convite |
| POST | `/api/provider/login` | Login prestador | Não | Pública | email, senha | prestador + token | email/senha | Sem rate limit |
| POST | `/api/provider/recover` | Recuperar senha prestador | Não | Pública | email, telefone, senha | prestador | email/telefone | Tomada por PII |
| POST | `/api/provider/complete` | Concluir tarefa | Sim | Prestador | funcionarioId, token, tarefaId | tarefa | sessão e tarefa atribuída | Adequado |

## 10. Análise de autenticação

### Cadastro público

Há cadastro público via `/api/auth/register`, que cria Master. Isso é incompatível com a regra operacional de não haver cadastro público livre.

### Convites

Convites atuais são tecnicamente bons em geração e armazenamento:

- código forte;
- hash no banco;
- expiração;
- uso único;
- cancelamento;
- vínculo com funcionário.

Risco residual:

- falta rate limit;
- rotas legadas ainda existem;
- `/api/provider/register` ignora convite.

### Login

Login administrativo e de prestador não possuem rate limit. A resposta não retorna senha/hash, mas os erros podem ajudar enumeração em alguns casos.

### Usuários desativados

Admin: `autenticarRequisicaoUsuario` bloqueia sessão se `ativo === 0`.  
Prestador: não foi identificado campo de ativo em `prestador_acessos`; o status parece depender do cadastro operacional/convite.

## 11. Análise de permissões

### Master

Tem acesso total via `usuarioEhMaster`.

### Gestora

Gestora usa permissões salvas no banco. O backend aplica parte relevante das regras:

- filtra dados em `filtrarEstadoPorPermissoes`;
- impede alteração de permissões do Master;
- impede alteração das próprias permissões;
- limita alterações conforme escopo em `prepararEstadoParaSalvar`;
- exige Master para configurar Gestora.

Risco principal:

- `/api/state` é amplo e complexo; qualquer falha de merge pode permitir alteração indevida ou perda de dados.

### Prestador

Prestador não acessa `/api/state` porque essa rota exige sessão administrativa. Portal usa sessão própria. Conclusão de tarefa valida `funcionarioId` e tarefa atribuída.

Risco principal:

- criação pública de acesso de prestador por rota antiga.

## 12. Análise do banco

### SQL Injection

Baixo risco encontrado. As queries usam parâmetros. Não foi encontrado uso de entrada do usuário interpolada diretamente em SQL crítico.

### Integridade

Risco médio. As tabelas têm IDs relacionados, mas não definem `FOREIGN KEY`. Isso permite referências órfãs.

### Concorrência

Risco alto no modelo de `salvarEstado`: apaga e recria listas inteiras. Com dois usuários ou autosave defasado, há risco de sobrescrita.

### WAL

WAL está habilitado. Arquivos WAL/SHM existem localmente e estão versionados no Git, o que é um problema de segurança e operação.

### Dados pessoais

O banco armazena:

- nome;
- e-mail;
- telefone;
- CPF;
- dados operacionais;
- hashes de senha;
- dados de apartamentos;
- senhas de porta criptografadas.

Não devem ser versionados.

## 13. Análise do frontend

### Proteção de rotas

O frontend protege rotas com `usuarioLogado` e `usuarioPode`, mas isso não deve ser considerado barreira de segurança. O backend precisa continuar sendo a fonte de verdade.

### Tokens

Admin usa `sessionStorage`. Prestador usa `localStorage` com fallback para `sessionStorage`. Isso facilita persistência, mas aumenta impacto de XSS.

### Dados no navegador

O objeto do usuário logado, incluindo permissões e token, fica no navegador. O usuário pode alterar manualmente o objeto local, mas o backend autentica por token e recarrega permissões do banco em rotas protegidas. Ainda assim, ações puramente visuais podem ser enganadas localmente.

### XSS

Não foi encontrado `dangerouslySetInnerHTML`. React escapa textos por padrão. Ainda assim, falta CSP e validação de tamanho/conteúdo.

## 14. Análise de dependências

Comando executado em modo leitura:

```bash
npm audit --audit-level=low
```

Resultado:

- 4 vulnerabilidades altas.

Pacotes:

- `brace-expansion`: risco de DoS por expansão;
- `postcss`: path traversal em source map;
- `react-router`: CSRF bypass em RSC mode;
- `react-router-dom`: depende de versão vulnerável de `react-router`.

Não foi executado `npm audit fix`.

Correção sugerida:

- atualizar dependências em branch separada;
- evitar `--force` sem validação;
- rodar build, lint e testes manuais principais.

## 15. Análise da configuração de produção

### Render e disco persistente

Configuração do caminho do banco está adequada para Render:

- usa `/var/data/cleanhost` quando `process.env.RENDER` existe;
- permite `DATABASE_FILE` customizado.

### HTTPS

Não há configuração explícita no app, provavelmente depende do Render/domínio. Como não há cookies, faltam proteções relacionadas a cookie, mas se migrar para cookies será necessário `Secure` e `SameSite`.

### Headers

Não foram encontrados headers robustos de produção.

### Logs

Startup mostra caminho do banco. Em produção, isso deve ser reduzido.

### Variáveis de ambiente

`CLEANHOST_SECRET` tem fallback previsível. Em produção, deve ser obrigatório.

## 16. Plano de correção por etapas

### Etapa 1 - Reduzir risco crítico sem mudar a experiência

- Bloquear cadastro público de Master após primeiro Master.
- Exigir convite para criação de acesso de prestador.
- Colocar banco SQLite e WAL/SHM no `.gitignore`.
- Remover arquivos de banco do índice Git sem apagar localmente.

Testes:

- criar primeiro Master em banco novo;
- impedir novo Master público em banco já inicializado;
- prestador cria acesso apenas por convite;
- Render segue usando `/var/data/cleanhost`.

### Etapa 2 - Endurecer autenticação

- Rate limit em login, recover, convite e register.
- Expiração de sessão.
- Logout server-side.
- Recuperação de senha por token temporário.

Testes:

- login normal;
- muitas tentativas retornam 429;
- sessão expirada bloqueia;
- recuperação com token válido/expirado/usado.

### Etapa 3 - Endurecer API e dados

- Limite de body.
- Validação de tamanho máximo.
- CORS allowlist.
- Headers HTTP de segurança.

Testes:

- app carrega no domínio oficial;
- localhost funciona em dev;
- origem externa bloqueada;
- payload grande bloqueado.

### Etapa 4 - Reduzir risco estrutural

- Planejar substituição gradual de `/api/state`.
- Criar endpoints por ação:
  - criar prestador;
  - editar prestador;
  - excluir prestador;
  - criar apartamento;
  - editar apartamento;
  - excluir apartamento;
  - criar/editar/excluir tarefa.
- Adicionar revisão/controle de concorrência.

Testes:

- fluxo operacional completo;
- dois usuários editando;
- Gestora limitada;
- Master com acesso total.

### Etapa 5 - Dependências

- Atualizar pacotes vulneráveis.
- Rodar regressão completa.

Testes:

- `npm run lint`;
- `npm run build`;
- login Master/Gestora/Prestador;
- convites;
- dashboard;
- calendário;
- portal do prestador.

## 17. Testes de regressão necessários

### Login e sessão

- Master entra no dashboard.
- Gestora entra no mesmo dashboard.
- Prestador entra no portal.
- Sessão expirada é bloqueada.
- Logout invalida token.
- Usuário desativado não entra.

### Convites

- Master gera convite de Gestora.
- Usuário cria conta pelo convite.
- Convite usado não funciona novamente.
- Convite cancelado não funciona.
- Convite expirado não funciona.
- Prestador cria acesso apenas por convite.

### Permissões

- Master vê tudo.
- Gestora com todas permissões vê dados permitidos.
- Gestora limitada vê apenas apartamentos/prestadores permitidos.
- Gestora não altera Master.
- Gestora não altera próprias permissões.
- Prestador não acessa dashboard.

### Dados operacionais

- Cadastro de apartamento.
- Edição de apartamento.
- Exclusão de apartamento.
- Cadastro de prestador.
- Envio/cancelamento de convite.
- Criação/edição/exclusão de tarefa.
- Calendário com dados filtrados.
- Conclusão de tarefa por prestador.

### Segurança

- `/api/auth/register` não cria Master indevido.
- `/api/provider/register` não cria acesso sem convite.
- Requisição sem token não acessa `/api/state`.
- Token inválido é bloqueado.
- Payload grande é bloqueado.
- Rate limit retorna 429.
- Origem externa é bloqueada por CORS.

## 18. Observações finais

Esta auditoria foi baseada em leitura de código, comandos de inspeção do Git, busca textual e `npm audit` em modo somente leitura. Não foram executados testes destrutivos, não foram criados usuários, não foram chamadas rotas de produção e não foram revelados segredos ou senhas.

Esta etapa foi exclusivamente de análise. Nenhum arquivo do sistema foi alterado e nenhuma funcionalidade do Clean Host foi modificada.
