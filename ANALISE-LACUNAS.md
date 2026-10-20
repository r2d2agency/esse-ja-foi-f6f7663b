# Análise de lacunas — trabalho interno (NÃO faz parte da documentação oficial)

**Status:** Rascunho de trabalho • **Data:** 2026-10-20

> ⚠️ **Documento interno, fora da entrega ao cliente.** Não está indexado em
> [docs/README.md](docs/README.md) e não deve ser referenciado na documentação publicada.
> Serve de fila de trabalho: à medida que cada item for corrigido, ele sai daqui e a
> documentação oficial é atualizada com o estado final.

Inventário de problemas reais encontrados no código, **classificados pelo risco de correção**:

| Faixa | Significado |
|---|---|
| **🔴 P0 — Segurança** | Falhas exploráveis (escalada de privilégio, IDOR, segredo fixo, webhook fail-open). Prioridade máxima, mas cada uma cabe em um patch pequeno. |
| **A — Correções locais seguras** | Mudança isolada, sem migração, sem mudança de contrato. Risco de regressão baixo. |
| **B — Correções que exigem cuidado** | Toca telas/fluxos ou dado já gravado. Precisa de teste manual do fluxo. |
| **C — Exigem migração ou mudança de contrato** | Mudança de schema, de API ou de formato. Precisa de plano de deploy. |

> A regra do projeto ([07-convencoes.md §3](docs/07-convencoes.md)) é: **não mexer** nos caminhos de
> escrita já protegidos (`registrarLance`, repasse com `FOR UPDATE`, motor de dripping com
> `SKIP LOCKED`). Eles estão corretos.

---

## 🔴 P0 — Segurança: achados que precisam de ação imediata

> Esta seção foi acrescentada depois de uma segunda auditoria focada em segurança e deploy. Os
> itens abaixo **não** são "melhoria de qualidade": são falhas exploráveis por qualquer pessoa
> autenticada no sistema (inclusive um `vendedor` ou `comprador`) e, em alguns casos, por
> qualquer visitante.

### P0.1. Escalada de privilégio: qualquer autenticado pode se tornar admin
> ✅ **Fechado (2026-10-20).** `gerenciarUsuarioFn` e `excluirPerfilFn` agora exigem
> `adminDaSessao()` dentro do `try` — o erro vira `{ ok: false, message }`, o mesmo formato que
> a tela já sabe mostrar. O `role`/`password` do corpo seguem aceitos, mas só um admin ativo
> chega até lá.
**Arquivo:** `src/lib/admin.functions.ts:71-105` (`gerenciarUsuarioFn`)

O validator aceita `role` e `password` **do cliente** e o handler grava sem checar quem chama:

```ts
.validator((d) => z.object({
  role: z.enum(['admin','operacao','vistoriador','comprador','vendedor']).optional(),
  password: z.string().optional(),
  ...
}).parse(d))
```

Um `vendedor` autenticado que chame `gerenciarUsuarioFn` no console com
`{ email: "x@x.com", role: "admin", password: "..." }` **cria uma conta admin**. Não há
`usuarioDaSessao()`, não há `role`, não há OTP.

**Correção:** exigir `superadminDaSessao()` (ou `role === 'admin'`) e **ignorar** `role`/`password`
vindos do corpo — a senha de admin só pode ser trocada por outro admin, com auditoria.
**Risco: baixo** — a tela `Admin > Usuários` já é restrita ao admin no client; o gap é só o
servidor. Mas testar o fluxo de "criar usuário interno" e "redefinir senha de usuário".

### P0.2. Funções administrativas sensíveis sem nenhuma checagem
> 🟡 **Parcialmente fechado (2026-10-20).** Fechado o **subset "admin puro"** da Fase 0 —
> 48 server fns em 6 arquivos (`admin`, `logs`, `relatorios`, `demo`, `admin-checklist`,
> `marketing`), com dois níveis de guard:
>
> | Nível | Quem passa | Para quê |
> |---|---|---|
> | `adminOuOperacaoDaSessao()` | `admin` **ou** `operacao` ativos | leitura de backoffice (logs, relatórios, listagens, config Uazapi mascarada) |
> | `adminDaSessao()` | só `admin` ativo | escrita/destruição (limpar logs, setar comissão, demo, checklist, marketing, config) |
>
> O nível `operacao` existe porque o login leva `admin` **e** `operacao` para `/admin`
> ([src/routes/login.tsx:73-89](src/routes/login.tsx#L73-L89)) — um guard `role === 'admin'`
> puro cortaria o operador da própria tela. Os helpers novos ficam em
> [src/lib/sessao.server.ts](src/lib/sessao.server.ts). O guard é colocado **dentro** do `try`,
> para a falha virar `{ ok: false, message }` — o formato que a tela já sabe mostrar.
>
> ⏳ **Ainda em aberto:** o resto dos 43 arquivos (compliance, financeiro, pagamentos, catálogo
> etc.) — ver **B1**, que pede matriz de permissão por papel, não `role === 'admin'`.
A varredura encontrou **43 arquivos** de `src/lib/*.functions.ts` sem checagem de role no
servidor (o [07-convencoes.md §3](docs/07-convencoes.md) citava 5). As de maior dano:

| Função | Arquivo:linha | O que permite |
|---|---|---|
✅ | `excluirPerfilFn` | `src/lib/admin.functions.ts:108` | Apagar vendedor/comprador — **sem role e sem OTP** (o gate de OTP de `superadmin.functions.ts` cobre só as ações *forçadas*) |
✅ | `salvarConfiguracaoFn` | `src/lib/admin.functions.ts:131` | Gravar chave/valor arbitrário em `configuracoes_sistema` — inclusive segredos de integração |
| `atualizarComplianceFn` | `src/lib/admin-compliance.functions.ts:20` | Aprovar/reprovar compliance e forçar `cadastro_completo = true` |
| `aprovarParaPublicacaoFn` | `src/lib/admin-veiculo-detalhe.functions.ts:174` | Publicar veículo **sem vistoria** — fraude de anúncio |
| `aprovarVendedorComplianceFn`, `solicitarPendenciaComplianceFn`, `atualizarStatusDocumentoFn` | `src/lib/vendedores-compliance.functions.ts:72/87/46` | Aprovar/reprovar compliance de vendedor |
| `aprovarCompradorFn`, `reprovarCompradorFn`, `solicitarPendenciaCompradorFn`, `preCadastrarCompradorFn` | `src/lib/admin-compradores.functions.ts:112/178/134/156` | Criar/aprovar/reprovar comprador |
| `autorizarRepasseFn`, `confirmarConclusaoRepasseFn` | `src/lib/financeiro.functions.ts:29/35` | Autorizar e confirmar **repasse de dinheiro** — e aceitam `adminId` do corpo, não da sessão |
| `salvarDadosBancariosFn` | `src/lib/financeiro.functions.ts:41` | Gravar chave PIX/CPF de **outro** vendedor (IDOR de escrita) |
| `confirmarPagamentoManualFn` | `src/lib/pagamentos.functions.ts:67` | Confirmar pagamento manualmente |
| `getComprovanteFn` | `src/lib/pagamentos.functions.ts:58` | Ler comprovante de compra de terceiro — só exige `comprador_id` no corpo, sem checar posse |
✅ | `limparLogsFn` | `src/lib/logs.functions.ts:81` | `DELETE FROM logs` — apaga a trilha de auditoria |
✅ | `getSystemLogsFn` | `src/lib/logs.functions.ts:6` | Ler a trilha de auditoria |
✅ | `getRelatoriosGeraisFn`, `getRelatoriosVendasFn`, `getRelatorioComissoesFn`, `setComissaoPadraoFn` | `src/lib/relatorios.functions.ts:11/28/44/62` | Exportar faturamento/comissões e **alterar a margem** |
✅ | `converterContatoEmCompradorFn` | `src/lib/marketing.functions.ts:181` | Criar conta de comprador **com senha definida** |
✅ | `semearDemoFn`, `resetarChecklistDemoFn`, `criarLeilaoDemoFn` | `src/lib/demo.functions.ts:21/29/47` | Semear base demo e criar usuários com senha fixa — sem guard e sem checar que é ambiente demo |
✅ | `adminExcluirCategoriaFn`, `adminExcluirItemFn` | `src/lib/admin-checklist.functions.ts:47/102` | Apagar config de checklist |
✅ | `salvarUazapiConfigFn` | `src/lib/marketing.functions.ts:225` | Gravar o token do WhatsApp |

**Correção:** `role === 'admin'` (mais `superadminDaSessao()` nas destrutivas) nestas funções.
**Risco: baixo por função**, mas **alto em volume** — e o guia é: **não aplicar em bloco**.
Ver **B1** para o ordem correto e para as funções que **não** podem receber esse guard.

### P0.3. `seedSuperAdmin` expõe o e-mail do admin — e força a criação da conta
> ✅ **Fechado (2026-10-20).** A fn agora exige `adminDaSessao()` antes de criar a conta; sem
> sessão de admin ela devolve `{ ok: false }` e o e-mail do superadmin não sai mais.
**Arquivo:** `src/lib/auth.functions.ts:4-13`

Server fn **pública** que chama `ensureSuperAdmin()` e devolve `{ email: SUPERADMIN_EMAIL }`.
Qualquer visitante descobre o e-mail do administrador e pode forçar a criação da conta.

**Correção:** proteger com `superadminDaSessao()` ou remover o export.
**Risco:** baixo — verificar se alguma tela depende dele.

### P0.4. Segredo de sessão e credencial de admin fixos no código
> ✅ **Fechado (2026-10-20).** Adaptado para funcionar **sem** nenhuma variável de ambiente
> setada no Easypanel (env vars de produção não existem neste deploy).
**Arquivos:** `src/db/auth.server.ts` (segredo de sessão + senha inicial do superadmin)

O problema original:

```ts
const secret = process.env["SESSION_SECRET"] ?? "<segredo-fixo-publicado-no-repo>";
```

Com `SESSION_SECRET` ausente, o sistema **funcionava normalmente** com um segredo público no
repositório — e o payload do cookie é só base64, não criptografado. Qualquer um forjava
`ejf_sessao` com `sub` = UUID de um admin. Era **falha aberta**: sem erro, sem log, sem aviso.
A credencial fixa do superadmin, usada por `ensureSuperAdmin()` (chamada **a cada login**),
também estava no código-fonte do repo público.

**Correção aplicada — resolução em três degraus (env → banco → gerado):**

1. `SESSION_SECRET` do ambiente, se existir e tiver comprimento útil (≥ 16);
2. senão, o segredo **persistido no banco**, em `configuracoes_sistema` na chave
   `segredo_sessao` (fora do allowlist `CHAVES_CONFIG_PUBLICAS`, então nunca chega ao
   navegador);
3. senão, um segredo novo gerado com `randomBytes(32)`, gravado com
   `ON CONFLICT (chave) DO NOTHING` e **re-lido** — assim, em duas requisições simultâneas,
   a que perder a corrida adota o segredo da outra em vez de invalidar as sessões dela.

O fallback público saiu do código: um segredo por instalação, fora do repo. Uma vez persistido,
trocar o valor da linha `segredo_sessao` invalida todas as sessões (todo mundo desloga) — isso é
esperado.

**Senha do superadmin:** a constante fixa saiu do código. `ensureSuperAdmin()` agora:
- se a conta **já tem** `senha_hash`, **preserva** (o `COALESCE` do `ON CONFLICT` continua
  como segunda linha de defesa);
- se é conta nova, usa `SUPERADMIN_PASSWORD` do ambiente quando existir (≥ 8 caracteres), ou
  gera uma senha aleatória (`EJf-…`) **impressa uma única vez no log do servidor**;
- **não rotaciona** senha existente — trocar a senha do admin em produção por conta própria.

**Risco resolvido:** deploy não quebra por falta de variável de ambiente. O que **precisa** ser
feito uma vez, manualmente: se a conta do superadmin em produção ainda tem a senha antiga
(publicada), trocá-la pelo caminho normal do painel — a correção do código **não** faz isso.

### P0.5. `.env` versionado no git e `.gitignore` sem regra para `.env`
> ✅ **Fechado (2026-10-20).**
**Arquivo:** `.gitignore`

O `.gitignore` **não tinha** entrada `.env`, e `git ls-files` confirmava que `.env` e
`.dbg/admin-vehicle-detail.env` estavam **trackados**. O `.env` commitado carregava o projeto
Supabase e a `publishable_key`.

**Correção aplicada:** `.env`, `.env.*` (com `!.env.example`) entraram no `.gitignore`, e
`git rm --cached .env .dbg/admin-vehicle-detail.env` tirou os dois do índice (os arquivos
continuam no disco — só saem do versionamento). O `.dockerignore` já excluía `.env`, então o
container não é afetado.

**⚠️ Pendência de rotação:** a `publishable_key` do Supabase que estava no `.env` continua no
**histórico do git** — removê-lo do índice não apaga o passado. A chave deve ser considerada
**queimada** e rotacionada no painel do Supabase; o `REVOKE` do `anon` do **P0.6** fecha o
resto do estrago.

### P0.6. `GRANT` de leitura para `anon` em `otp_codes` e `profiles`
**Arquivos:** `src/db/mail.server.ts:30`, `src/db/auth.server.ts:141`, `src/db/perfil.server.ts:62`

```sql
GRANT ALL ON public.otp_codes TO anon;      -- códigos de recuperação de senha
GRANT SELECT ON public.profiles TO anon;   -- cpf, endereço, e-mail, senha_hash
```

O app se conecta pelo `DATABASE_URL` (service role), então esses grants só importam se o
**Supabase REST** expõe as tabelas — e a `publishable_key` está no `.env` commitado (P0.5).
Um visitor com a chave pública poderia ler os **códigos OTP válidos**.

**Correção:** revogar `anon` em `otp_codes` e restringir `profiles` às colunas não sensíveis.
**Risco: médio** — `src/integrations/supabase/client.ts` é usado por `vendedor.financeiro.tsx` e
`auth-attacher.ts`; rodar o `REVOKE` e testar essas duas telas.

### P0.7. Webhook do WhatsApp **aceita** requisição quando falta o `app_secret`
> ✅ **Fechado (2026-10-20), com saída de emergência explícita.**
**Arquivo:** `src/routes/api/public/webhooks/whatsapp.ts`

O HMAC era validado corretamente quando o `appSecret` existia. Mas se ele **não** estivesse
gravado, a validação era ignorada com um log de aviso e a requisição era processada — **falha
aberta**: qualquer POST escrevia conversas e disparava ações.

**Correção aplicada — agora falha fechada por padrão:**

- `app_secret` **ausente** → **401** ("Missing app secret"), salvo se
  `WEBHOOK_ASSINATURA_OPCIONAL=true` estiver setado no ambiente (saída de emergência para o
  intervalo entre configurar o App Secret e o deploy);
- `app_secret` presente mas **assinatura divergente ou header ausente** → **401**. Antes, o
  header ausente caía num `else` que só logava aviso e **processava o evento** mesmo;
- `timingSafeEqual` é chamado **só depois** de comparar os comprimentos — ele lança exceção
  quando os buffers têm tamanhos diferentes, então uma assinatura truncada derrubava o
  handler com um erro 500 em vez de um 401 limpo;
- **todo** 401 agora grava linha na tabela de log da Meta. Era esse o motivo da "tela de log
  vazia": o 401 era devolvido com `console.error` e **nada** no banco.

**⚠️ Ação manual obrigatória antes do deploy:** gravar o **App Secret da Meta** em
`Admin > Comunicações > Configurações` (campo `whatsapp_config.app_secret`). Sem isso, **toda**
mensagem recebida da Meta passa a ser rejeitada com 401 e as conversas param. Alternativa
temporária: `WEBHOOK_ASSINATURA_OPCIONAL=true` no Easypanel — que é exatamente o estado
inseguro que o item queria fechar, então use só como ponte.

### P0.8. IDOR: qualquer arquivo é servido a qualquer visitante
**Arquivo:** `src/routes/api/public/arquivo.$id.ts:6-35`

`GET` sem sessão e sem checar posse: qualquer UUID de `arquivos_upload` é servido. A tabela
(`src/db/arquivos.server.ts:24`) **não tem coluna de dono** — só `id, mime_type, conteudo,
tamanho, criado_em`. E os arquivos são CNH, selfie, CRLV, comprovante de residência e fotos de
vistoria: **PII de terceiros**, exposta por URL.

**Correção:** exige coluna de dono → **migração** (ver **C8**). A correção mínima sem migração
é URL assinada com expiração.
**Risco:** fechar sem alternativa **quebra a OpenAI** (que busca essa URL pública para analisar
CNH/placa) e o editor de marca d'água (que depende de `Access-Control-Allow-Origin: *`).

### P0.9. Upload público aceita qualquer tipo de arquivo (XSS armazenado)
**Arquivo:** `src/routes/api/public/upload.ts`

Não há allowlist de MIME nem verificação de magic bytes: `mimeType = file.type` é controlado
pelo cliente. Um `.html`/`.svg` com JS é gravado e depois servido com o `Content-Type` do
atacante e `Access-Control-Allow-Origin: *` — **XSS armazenado cross-origin**.

Dois problemas adicionais no mesmo arquivo:
- `await request.formData()` (`:20`) materializa o body inteiro em memória **antes** do check de
  10 MB → um POST gigante é aceito pelo Node e só rejeitado depois. **DoS de memória.**
- O endpoint é **sem autenticação** (ver B12).

**Correção:** allowlist de MIME (`image/jpeg|png|webp|pdf`), `X-Content-Type-Options: nosniff`,
`Content-Disposition: attachment` (ou `Content-Security-Policy: default-src 'none'`) na resposta
de `/arquivo/$id`, e check de `Content-Length` antes do `formData()`.
**Risco: médio** — testar o onboarding: CNH/CRLV em PDF, fotos em HEIC (hoje caem em `bin`).

### P0.10. `resetarSenhaFinalFn` aceita senha de 6 caracteres; OTP sem teto de tentativas
> ✅ **Fechado na parte imediata (2026-10-20):** senha agora exige `min(10)` e o OTP é gerado com
> `crypto.randomInt` (CSPRNG do Node) em vez de `Math.random`. ⏳ **Pendente:** o contador de
> tentativas por OTP — exige migração, continua em **C9**.
**Arquivos:** `src/lib/auth.functions.ts:128`, `src/db/mail.server.ts:14-22,137`

- `z.string().min(6)` → subir para `min(10)`.
- `otp_codes` **não tem coluna de tentativas**. O código tem 6 dígitos, validade de 10 min, e
  **não há bloqueio** → brute force viável. O código é gerado com `Math.random()` (não
  criptográfico) — trocar por `crypto.randomInt`.

**Correção:** `min(10)` + `crypto.randomInt` (imediatos). O contador de tentativas exige
migração (ver **C9**).
**Risco: baixo** no `min(10)` — pode exigir reset de senha de usuário legado.

### P0.11. Rate limiting inexistente em login, reset de senha e OTP
**Arquivo:** `src/lib/auth.functions.ts`

Nenhuma trava de taxa em `loginWithPassword` (`:15`), `solicitarResetSenha` (`:89`) nem
`validarOTPResetFn` (`:116`). Consequências: brute force de senha; **abuso de SMTP** (cada
chamada dispara e-mail → a caixa sai do provedor e é marcada como spammer); enumeração de e-mail.

**Correção:** throttle em memória por IP/e-mail (Map com TTL) — mitigação real e imediata.
**Risco: baixo**, mas **não** aplicar 429 em cima do OTP sem testar o fluxo de primeiro acesso
(pode virar loop de erro para o usuário legítimo).

### P0.12. Debug de produção: 5 `fetch` para `127.0.0.1:7777` com dados do veículo
> ✅ **Fechado (2026-10-20).** Os 5 `fetch` de debug foram removidos de
> `src/lib/admin-veiculo-detalhe.functions.ts`, junto com os 3 `useEffect` de depuração de
> `src/routes/admin/veiculo.$id.tsx`. `grep -rn "127.0.0.1:7777" src/` não retorna nada.
**Arquivo:** `src/lib/admin-veiculo-detalhe.functions.ts:27,31,57,74,86`

Cada request admin dispara um `fetch` a um endpoint local com payload do veículo e stack trace
(`.catch(() => {})` evita crash, mas o dado sai). É lixo de debug ("pre-fix", "hypothesisId").

**Correção:** remover.
**Risco:** nenhum funcional.

---

## A — Correções locais seguras

### A1. Dashboard do comprador sempre mostra "0 lances"
> ✅ **Fechado (2026-10-20)** — `meusLances` reescrito com `JOIN profiles ON p.id = b.comprador_id`
> (a coluna `comprador_email` nunca existiu) e filtro por `lower(p.email) = lower(...)`.
> O `safe()` continua devolvendo `[]` em falha, mas a query agora é válida.
> **Observação:** `dashboardCompradorFn`/`meusLances` não são consumidos por nenhuma rota
> hoje — a correção deixa a API correta, mas a tela do comprador ainda não consome esse
> módulo (o `/admin` usa `admin-dashboard.server.ts`).

**Arquivo:** `src/db/dashboard.server.ts:111-136`

`meusLances` consulta `lances.comprador_email`, coluna que **não existe** — o schema real
(`src/db/leilao.server.ts:34-45`) tem `comprador_id`. A query sempre lança, e o `safe()`
(`src/db/dashboard.server.ts:8-16`) engole o erro devolvendo `[]`.

**Correção aplicada:** `JOIN profiles p ON p.id = b.comprador_id`, com
`max(b.valor) FILTER (WHERE lower(p.email) = lower(${email}))` para o lance do próprio
comprador e `max(b.valor)` para o maior lance do lote.
**Risco:** baixo — a query nunca funcionou; a tela só passa a mostrar dados reais.
**Atenção:** `dashboardCompradorFn` / `meusLances` **não são consumidos por nenhuma rota
hoje** (o `/admin` usa `admin-dashboard.server.ts`, que tem contadores próprios). A API foi
corrigida mesmo assim, mas **falta um consumidor** no painel do comprador.



### A2. Indicador "leilões ativos" sempre 0
> ✅ **Fechado (2026-10-20)** — `leiloesAbertos()` e `indicadoresAdmin()` agora filtram
> `status IN ('ATIVO','PRORROGADO')`. Grep em `src/` confirmou que não sobrou nenhuma
> referência ao status inexistente `'ABERTO'`.

**Arquivo:** `src/db/dashboard.server.ts:41,105`

Conta `leiloes WHERE upper(status)='ABERTO'`, mas os status reais são
`RASCUNHO / AGENDADO / ATIVO / PRORROGADO / ENCERRADO / PAUSADO / CANCELADO`.

**Correção aplicada:** contar `status IN ('ATIVO','PRORROGADO')` — em
`indicadoresAdmin()` **e** em `leiloesAbertos()`, que tinha o mesmo filtro errado.
**Risco:** baixo — só o número passa a ser correto.

### A3. Contrato com data errada por fuso
> ✅ **Fechado (2026-10-20)** — passou a usar `hojeFormatadoEmSaoPaulo()`
> (`src/lib/brasil.ts`), helper novo que fixa `timeZone: "America/Sao_Paulo"`.

**Arquivo:** `src/db/contratos.server.ts:379`

`new Date().toLocaleDateString("pt-BR")` usa o fuso do processo (UTC no deploy), não
`America/Sao_Paulo`. Entre 21h e 24h de Brasília a data sai um dia adiantada.

**Correção:** usar `Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" })`.
**Risco:** baixo — afeta **só contratos novos**; o `conteudo` já persistido fica congelado.

### A4. Datas em UTC em rótulos e nomes
> ✅ **Fechado (2026-10-20)** — `hoje()` em `demo.server.ts` e o nome padrão de campanha em
> `comunicacoes.functions.ts` passaram a usar `hojeEmSaoPaulo()` (`src/lib/brasil.ts`).
> Os três helpers (`FUSO_BR`, `hojeEmSaoPaulo`, `hojeFormatadoEmSaoPaulo`) são o ponto
> único de fuso do projeto.

**Arquivos:** `src/db/demo.server.ts:98`, `src/lib/comunicacoes.functions.ts:208`

`new Date().toISOString().slice(0,10)` é UTC → entre 21h e 24h (BRT) vira o dia seguinte.

**Correção aplicada:** `hojeEmSaoPaulo()` de `src/lib/brasil.ts`. Os helpers novos
(`FUSO_BR`, `hojeEmSaoPaulo()`, `hojeFormatadoEmSaoPaulo()`) ficam juntos no mesmo arquivo
para não repetir a string do fuso em cada módulo.
**Risco:** muito baixo — apenas rótulos de seed/demo e nome de campanha.

### A5. Fotos de entrega gravadas fora de transação
**Arquivo:** `src/db/entregas.server.ts:441-470`

`registrarEntrega` faz um `INSERT` por foto em loop e só **depois** atualiza a entrega. Se
falhar no meio, ficam fotos órfãs e a entrega não registrada.

**Correção:** multi-row `INSERT ... SELECT * FROM unnest(...)` dentro de `d.transaction`.
**Risco:** baixo — SQL equivalente, mais transação.

### A6. Atribuição de tag faz 1 round-trip por contato
**Arquivo:** `src/db/marketing.server.ts:493-499`

**Correção:** `INSERT ... ON CONFLICT DO NOTHING` multi-row.
**Risco:** baixo — mesmo SQL, a idempotência do `ON CONFLICT` é preservada.

### A7. `safe()` do dashboard mascara falha como "zero"
**Arquivo:** `src/db/dashboard.server.ts:8-16`

**Correção:** sinalizar erro no retorno (`erro: true`) em vez de devolver `[]` silencioso.
**Risco:** baixo se a UI ignorar o campo novo; médio se algum card tratar `[]` como estado
válido — aí precisa de ajuste no componente.

### A8. Re-leitura do blob de mídia a cada mensagem do lote
**Arquivo:** `src/db/disparo-motor.server.ts:332-333, 663`

O `bytea` da mídia é relido do banco para **cada** mensagem do lote.

**Correção:** cache por `arquivoId` no escopo do lote (limite de 1 mídia em memória).
**Risco:** baixo.

### A9. `catch` que engole erro de real consequência
- `src/lib/anuncios.functions.ts:13-20` — `getProntosParaAnuncio` devolve `[]` em qualquer erro:
  o admin vê "nenhum veículo pronto" quando é falha de SQL.
- `src/db/comprador.server.ts:436-453` — `criarNotificacaoComprador` engole a falha: o
  comprador não é avisado que o cadastro foi para análise.

**Correção:** relançar ou registrar em log de auditoria consultável.
**Risco:** baixo-médio no primeiro (a UI precisa distinguir vazio de erro); baixo no segundo.

### A10. Validadores de `financeiro.functions.ts` são função identidade
**Arquivo:** `src/lib/financeiro.functions.ts` (`autorizarRepasseFn`, `confirmarConclusaoRepasseFn`)

`(data) => data` — sem Zod, sem `.uuid()`.

**Correção:** `z.object({ repasseId: z.string().uuid(), ... })`.
**Risco:** médio — **antes de aplicar**, confirmar se todo `repasses.id` real é uuid (id externo
ou mock em dev seria rejeitado).

### A11. `sql.raw` com interpolação literal
**Arquivo:** `src/db/demo.server.ts:114`

`ALTER TYPE app_role ADD VALUE IF NOT EXISTS '${papel}'`.

**Correção:** validar `papel` contra a lista de `app_role` antes de interpolar.
**Risco:** baixo — é seed de demo.

### A12. `SESSION_SECRET` com fallback público
**Arquivos:** `src/lib/sessao.server.ts`, `src/db/auth.server.ts:405,424`

`process.env["SESSION_SECRET"] ?? "<segredo-fixo-publicado-no-repo>"` nos dois lados (emitir e verificar).
Um deploy sem a variável usa um segredo **público no repositório** — o token de sessão passa a
ser forjável.

**Correção:** em produção, sem `SESSION_SECRET` → erro no boot em vez de fallback.
**Risco:** baixo **se** a variável já estiver setada no Easypanel (confirmar antes). Se não
estiver, o deploy **quebra** — por isso é B1 na prática: verifique antes de aplicar.

---

## B — Correções que exigem cuidado

### B1. Fechar a autorização das server functions (a maior lacuna do sistema)
**Arquivos:** ~37 arquivos em `src/lib/*.functions.ts` com **zero** referência a sessão:
`admin.functions.ts` (16 fns), `comunicacoes.functions.ts` (36), `entregas.functions.ts` (22),
`marketing.functions.ts` (19), `vistorias.functions.ts` (14), `laudos.functions.ts` (14),
`vistoriador.functions.ts` (13), `pagamentos.functions.ts` (11), `contratos.functions.ts` (11),
`vendedor.functions.ts` (10), `negociacoes.functions.ts` (10), `publicacao.functions.ts` (9),
`cadastro.functions.ts` (9), `relatorios.functions.ts` (6), `financeiro.functions.ts` (7),
`admin-compradores.functions.ts` (7), `demo.functions.ts` (6), `logs.functions.ts` (4),
`dashboard.functions.ts` (4), `analytics.functions.ts` (3), e mais.

Hoje a autorização depende de guards **client-side** que só checam se há sessão
(`src/components/layout/AdminLayout.tsx:317`, `src/routes/vendedor.tsx:32`,
`src/routes/comprador.tsx:30`). A RLS está desligada em `lances` e `leiloes` — a autorização
é 100% na aplicação. **Um `vendedor` autenticado que chamar `listarVendedoresFn` no console
passa.** A única função que checa role no servidor é `src/lib/consulta-logs.functions.ts:15-17`.

`src/routes/vistoriador.tsx` **não tem guard nenhum**.

**Correção:** adicionar `perfilDaSessao()` + checagem de `role` no topo de cada função admin.
**Risco: MÉDIO-ALTO no volume, baixo por função.** O risco real é *quebrar o fluxo*: se uma
tela legitima usa uma função classificada como "admin" mas o operador (`operacao`) precisa
disso, uma checagem estrita `role === 'admin'` corta o acesso. Antes de aplicar:
1. mapear **quem usa hoje cada função** (pelo front e pela operação real);
2. usar matriz de permissão, não `role === 'admin'` — os 4 flags comerciais
   (`pode_ver_valores`, `pode_dar_lances`, `cadastro_completo`, `status_compliance`) e o papel
   `operacao` precisam caber;
3. aplicar **por módulo**, começando pelos que expõem dado sensível (compradores, financeiro,
   compliance, vendas), e testar a tela correspondente a cada lote.

> Esta é a correção de maior valor e a que mais exige plano de teste. Não é "um commit".

#### B1.a. O que **não** pode receber `role === 'admin'`
Nem toda função sem guard é uma função de backoffice. Estas são usadas por **vendedor,
comprador e vistoriador** no fluxo normal — exigir `role === 'admin'` **quebra o app**:

| Arquivo | Guard correto |
|---|---|
| `src/lib/comprador.functions.ts` | posse do recurso (`comprador_id` == dono da sessão) |
| `src/lib/entregas.functions.ts` | posse (o comprador vê a própria entrega, o vendedor valida o código) |
| `src/lib/pagamentos.functions.ts` | posse (o comprador vê o próprio comprovante) |
| `src/lib/negociacoes.functions.ts` | posse (comprador/vendedor da negociação) |
| `src/lib/contratos.functions.ts` | posse (o vendedor assina o próprio contrato) |
| `src/lib/publicacao.functions.ts` | posse / contexto do canal |
| `src/lib/vistorias.functions.ts`, `src/lib/laudos.functions.ts` | papel `vistoriador` + unidade vinculada |
| `src/lib/cadastro.functions.ts` | posse (o cadastro público de vendedor/comprador) |
| `src/lib/leilao.functions.ts` | misto — leitor público (vitrine), comprador e admin; separar |
| `src/lib/consulta-veicular.functions.ts` | fluxo automático do veículo, não só admin |

**Ordem sugerida:** primeiro fechar as **admin puras** (P0.2 — não têm usuário legítimo além
do admin), depois mapear as de posse. Aplicar `role === 'admin'` em bloco é o erro que
transforma uma correção de segurança em uma queda do sistema.

### B2. `confirmarConclusaoRepasse` duplica o razão financeiro
**Arquivo:** `src/db/financeiro.server.ts:305-360`

Tem `FOR UPDATE`, mas **não checa o status** antes de inserir em `financeiro_ledger`
(tabela sem UNIQUE, `src/db/financeiro.server.ts:63-76`). Uma segunda chamada (duplo clique,
retry, webhook) duplica a `SAIDA_REPASSE` e a `RETENCAO_COMISSAO`.

**Correção:** guarda de status idempotente.
**Risco: MÉDIO no financeiro.** Sugestão: retornar `{ ok: true, jaConcluido: true }` em vez de
lançar erro, para não quebrar telas que hoje mostram sucesso. Checar `financeiro_ledger`
**antes** de `repasses`.

### B3. `validarCodigo` — contador de tentativas sem lock
**Arquivo:** `src/db/entregas.server.ts:409-439`

Read-modify-write de `codigo_tentativas` sem transação e sem `FOR UPDATE`: duas validações
simultâneas perdem incrementos, e o bloqueio por tentativas não funciona. O ramo de código
correto faz `codigo = null` sem lock — o código pode ser validado duas vezes.

**Correção:** `d.transaction` + `FOR UPDATE` **antes** de ler, e UPDATE atômico
`codigo_tentativas = codigo_tentativas + 1`.
**Risco: MÉDIO** — mexe no caminho de liberação da entrega. Testar: código errado repetido
(3x), código correto, e o caso de duas validações simultâneas.

### B4. `prepararFinanceiroNegociacao` — 23505 vira erro 500
**Arquivo:** `src/db/financeiro.server.ts:115-192`

O UNIQUE em `repasses.negociacao_id` protege da duplicidade, mas a exceção **23505 é
propagada** em vez de virar `{ ok: true, jaExiste: true }` — o front vê erro 500.

**Correção:** `ON CONFLICT (negociacao_id) DO NOTHING RETURNING` com fallback, ou
`SELECT ... FOR UPDATE` na negociação.
**Risco: baixo-médio.**

### B5. `garantirEntregas()` chamado dentro de uma listagem
**Arquivo:** `src/db/entregas.server.ts:197-199`

Um GET de listagem **escreve** (cria entregas, eventos e notificações) e, fora de transação,
pode deixar metade sem notificação.

**Correção:** mover `garantirEntregas()` para o hook de confirmação de pagamento
(`src/db/pagamentos.server.ts`) e deixar a listagem só ler; `INSERT ... ON CONFLICT DO NOTHING`.
**Risco: MÉDIO** — se hoje a criação da entrega depende **só** dessa chamada, remover quebra o
fluxo de entrega. Este é o ponto mais sensível de todo o grupo B.

### B6. `gerarContrato` — `max(versao)` sem lock
**Arquivo:** `src/db/contratos.server.ts:369`

Duas gerações concorrentes do mesmo vendedor recebem a **mesma** `versao` (não há UNIQUE em
`(vendedor_id, versao)`).

**Correção:** `FOR UPDATE` ou `INSERT ... SELECT COALESCE(max(versao),0)+1`.
**Risco:** baixo na lógica (não muda valores existentes), mas um índice UNIQUE **exige migração**
→ ver C4.

### B7. `salvarEtapaComprador` / `enviarCadastroCompradorParaAnalise` — TOCTOU
**Arquivos:** `src/db/comprador.server.ts:280-298` e `:301-340`

Leem o perfil, validam pendências e só então gravam, sem lock — o status pode divergir do
perfil lido.

**Correção:** `SELECT ... FOR UPDATE` no `profiles` e reavaliar pendências dentro da tx.
**Risco: MÉDIO** — `etapa_cadastro` usa `GREATEST` (monotônico) de propósito
([07-convencoes.md armadilha K](docs/07-convencoes.md)). **Não rebaixe a etapa** sem decisão de
produto: muda a aba do wizard.

### B8. Listas administrativas sem `LIMIT`
**Arquivos:** `src/db/admin.server.ts:191,202`, `src/db/leilao.server.ts:729,740`,
`src/db/financeiro.server.ts:248`, `src/db/entregas.server.ts:199,363,383`,
`src/db/marketing.server.ts:94`, `src/db/comunicacoes.server.ts:582`,
`src/db/conversas.server.ts:262`, `src/db/comprador.server.ts:404`

**Correção:** paginação. O padrão já existe em `src/db/consulta-logs.server.ts:111`
(`LIMIT 50 OFFSET ${pagina*50}`).
**Risco: MÉDIO — silencioso.** Se alguma tela filtra no client sobre a lista inteira, o `LIMIT`
faz o filtro passar a operar só sobre a primeira página, sem erro visível. **A paginação real
tem que vir junto do `LIMIT`.**

### B9. `getConversaCompleta` carrega todas as mensagens
**Arquivo:** `src/db/conversas.server.ts:297-305`

`SELECT ... ORDER BY criado_em ASC` sem limite. Uma conversa de campanha carrega dezenas de
milhares de linhas.

**Correção:** últimas N + "carregar mais".
**Risco: MÉDIO** — a UI hoje espera a conversa inteira; mostrar só as últimas N **muda a UX**.

### B10. `getEntregaComprador` — GET que regenera o código
**Arquivo:** `src/db/entregas.server.ts:336-352`

Ao expirar, o GET regenera o código e devolve o novo. Leitura com efeito colateral.

**Correção:** regenerar só por ação explícita do comprador.
**Risco: MÉDIO** — hoje o comprador depende do GET para conseguir o código; remover quebra a UX.

### B11. `dashboard` — joins na tabela `clientes` (modelo legado)
**Arquivo:** `src/db/dashboard.server.ts:63-65,87-88`

`LEFT JOIN clientes c ON c.id = v.cliente_id` — `clientes` é do modelo antigo (o domínio atual
é `profiles`/`vendedor_id`).

**Correção:** apontar para as colunas atuais.
**Risco: MÉDIO** — muda o card "veículos recentes" da home; testar o card.

### B12. Upload público sem autenticação
**Arquivo:** `src/routes/api/public/upload.ts`

Endpoint sem sessão que grava `bytea` no Postgres, limite 10 MB por arquivo.

> **Correção de uma informação errada:** este endpoint **não** recebe base64 — usa
> `multipart/form-data` (`request.formData()` + `file.arrayBuffer()`). O
> [07-convencoes.md §4-L](docs/07-convencoes.md) está errado nesse ponto e precisa ser corrigido.
> O corpo ainda cresce ~33% por causa do multipart, mas o `MAX_BYTES` de 10 MB **existe** e é
> checado (`:3` e `:29`).

**Correção:** exigir sessão (o cookie httpOnly já viaja) e limitar por usuário.
**Risco: MÉDIO** — **pode quebrar fluxos públicos** que usam esse endpoint (ex.: link de
vistoria, cadastro público, processamento de fotos). Antes de aplicar, mapear quais rotas
públicas chamam `/api/public/upload`.

### B13. Vazamento de mensagem de erro no upload
**Arquivo:** `src/routes/api/public/upload.ts` (`catch (error: any)` → `error.message`)

**Correção:** mensagem genérica; log do real no servidor.
**Risco:** baixo.

### B14. Erro de migração engolido
**Arquivo:** `src/db/index.ts:134` e os `ensure*Schema()` (~25 funções)

Erro em `ensure*Schema()` é engolido: a tabela não é criada e o problema só aparece **depois**,
no uso.

**Correção:** manter o catch (tornar fatal derrubaria o sistema por uma coluna opcional), mas
**registrar em log estruturado** e expor um "diagnóstico de schema" em
**Admin > Configurações**.
**Risco: baixo** se for só log/diagnóstico; **alto** se virar fatal.

---

## C — Exigem migração ou mudança de contrato

### C1. Limite real de upload e corpo base64
**Arquivos:** `src/routes/api/public/upload.ts`, `src/db/arquivos.server.ts`

10 MB de arquivo → corpo multipart ~13 MB. Com o `bytea` no Postgres, o banco carrega o peso
de todas as fotos.

**O que muda:** storage de objetos (S3/Supabase Storage) + URL assinada, ou upload direto
por multipart.
**Contrato quebrado:** a forma de gravar/leitura de `arquivos_upload.conteudo` e a URL pública
`/api/public/arquivo/$id`. O editor de marca d'água (canvas) consome essa URL com
`Access-Control-Allow-Origin: *` — precisa ser reescrito junto.
**Risco:** ALTO — mexe em foto, documento e anúncio. É o item com maior blast radius do projeto.

### C2. Índice UNIQUE em `(vendedor_id, versao)` de contratos
**Arquivo:** `src/db/contratos.server.ts`

Fecharia B6. Exige dedupe prévio (constraint `UNIQUE` falha se já houver duplicatas):
`DO $$ ... $$` de limpeza + `CREATE UNIQUE INDEX CONCURRENTLY`.
**Contrato:** nenhuma mudança de API, mas muda o resultado em caso de duplicata legada.

### C3. Paginização de verdade nas listagens
**Arquivos:** as 10 queries de B8

**Contrato quebrado:** o retorno deixa de ser "lista completa" e vira "página". Toda tela que
consome precisa de `total`, `pagina` e controles de paginação.
**Risco:** MÉDIO-ALTO — 10 telas afetadas de uma vez. Fazer módulo a módulo.

### C4. `perfil` do solicitante no payload das server functions
**Arquivos:** todos os `src/lib/*.functions.ts`

Hoje várias funções aceitam `adminId`/`compradorId` **do corpo da requisição** — confia no
front. A forma correta é o servidor derivar do cookie.

**Contrato quebrado:** o `data` de entrada de todas essas funções. É a base do B1.
**Risco: ALTO** — muda a assinatura de dezenas de funções; precisa de front acompanhando.

### C5. Rate limiting
**Arquivos:** login, OTP, upload, webhooks

Não há rate limiting em lugar nenhum (login por senha, OTP por e-mail, `/api/public/upload`).

**O que muda:** precisa de armazenamento de contadores (tabela nova ou Redis). Decisão de
infraestrutura.
**Contrato:** 429 novo no login/OTP pode quebrar teste automatizado e UX de erro.
**Risco: MÉDIO** na implementação, **baixo** se começar por OTP e upload.

### C6. Headers de segurança e container sem root
**Arquivos:** `src/start.ts` (middleware), `Dockerfile`

Nenhum header de segurança (CSP, `X-Frame-Options`, `HSTS`, `X-Content-Type-Options`) é
emitido — nem em `src/`, nem no `vite.config.ts`, nem no bundle `.output/`. O Dockerfile
**não tem `USER`** — o container roda como root.

**O que muda:** os headers simples são seguros de aplicar e fecham clickjacking no backoffice
e SSL-strip:
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin` e `Strict-Transport-Security` (só em
produção). O ponto único por onde toda resposta SSR passa é o `requestMiddleware` do
`src/start.ts`.

**O CSP é o item perigoso** — pode bloquear o GTM/GA/Meta Pixel, os tiles do Leaflet/OSM, os
scripts inline de hydration do Vite e o worker do PWA do vistoriador
([06-integracoes.md §10](docs/06-integracoes.md)). Comece **sem CSP**, ou em `report-only`.

`USER node` no Dockerfile: o processo só lê `/app/.output`, mas `chown` é obrigatório se
algum fluxo gravar em `/app`.

**Contrato:** muda o comportamento de CSP — testar analytics, PWA e câmera.
**Risco: MÉDIO-ALTO** — o CSP é o item que mais "quebra coisa" se feito às cegas.

### C7. Unificar as duas telas de análise pós-vistoria
**Arquivos:** `src/routes/admin/analise-vistoria.$id.tsx` e
`src/routes/admin/veiculo.$id.pos-vistoria.tsx`

Dois fluxos de status coexistem (`AGUARDANDO_ACEITE_VENDEDOR` vs
`AGUARDANDO_APROVACAO_VENDEDOR`) para a mesma etapa.
**Contrato:** status e transições do veículo. Envolve backfill dos veículos em cada fluxo.
**Risco: ALTO** — é decisão de produto, não só técnica.

### C8. Posse dos arquivos (`arquivos_upload`)
**Arquivos:** `src/db/arquivos.server.ts:24`, `src/routes/api/public/arquivo.$id.ts`

Fecha P0.8. A tabela precisa de `dono_id` / `vinculado_a` / `token_publico`, com backfill dos
registros órfãos, e a URL pública precisa virar URL **assinada com expiração**.

**Contrato quebrado:** a URL `/api/public/arquivo/$id.ext` já está em uso pela **OpenAI** (que
busca a URL para analisar CNH/placa) e em e-mails enviados a vendedores. Assinatura com
expiração quebra essas chamadas se não houver um caminho alternativo.
**Risco: ALTO** — mexe em foto, documento e anúncio.

### C9. Tentativas de OTP
**Arquivo:** `src/db/mail.server.ts:14-22`

Fecha a segunda metade de P0.10: `ALTER TABLE otp_codes ADD COLUMN tentativas int DEFAULT 0`
+ bloqueio após 5 tentativas. Pode ser feito no `ensureMailSchema()` (sem drizzle), mas é
migração de fato.

### C10. Rate limiting distribuído
Se o app rodar com mais de uma réplica, o throttle em memória de P0.11 é insuficiente — precisa
de tabela de contadores com TTL e limpeza periódica, ou Redis. **Decisão de infraestrutura.**

### C11. Permissões por papel (matriz de capabilities)
Hoje o guard proposto é binário (`role === 'admin'`), mas o sistema tem 5 papéis
(`admin | operacao | vistoriador | comprador | vendedor`) e 4 flags comerciais
(`pode_ver_valores`, `pode_dar_lances`, `cadastro_completo`, `status_compliance`).
Uma matriz real exige tabela nova (`permissoes`) ou enum de capabilities, e revisar 200+
server functions.

**Contrato:** é a maior mudança de contrato do projeto. Note que `operacao` **precisa**
continuar funcionando — `role === 'admin'` estrito cortaria o papel.
**Risco: ALTO** — planejar à parte, com a B1 como primeiro passo.

### C12. Ativar RLS em `lances` e `leiloes`
**Arquivo:** `src/db/leilao.server.ts:52,54`

A RLS está **desligada** explicitamente. O [docs/README.md](docs/README.md) justifica isso pela
sessão própria (autorização 100% na aplicação). Reverter isso é **decisão de arquitetura**,
não correção — só faz sentido depois de C11.

### C13. Validação de variáveis de ambiente no boot
**Arquivo:** `src/db/index.ts:7-10`

Falta `DATABASE_URL` → só um `console.warn`, `db = null`, e cada função quebra em runtime com
503 em vez de falhar no boot. `APP_URL` tem 3 fallbacks para `https://www.essejafoi.com.br` —
em staging aponta para produção. Um `assertEnv()` no boot do `src/server.ts` é o certo, mas
**derruba o site** se alguma variável faltar em algum ambiente.

**Risco: MÉDIO** — só ativar depois de conferir todas as variáveis no Easypanel.

### C14. Healthcheck do Docker pode não estar servindo
**Arquivo:** `Dockerfile:36`

O healthcheck faz `fetch('http://localhost:3000/healthz')`. A rota é servida por
`src/server.ts:145` (entry customizado do TanStack Start), **não** pelo Nitro. No bundle de
produção a string `healthz` aparece em `.output/server/_ssr/ssr.mjs` e **não** em
`.output/server/index.mjs` — logo é provável que o `/healthz` não seja servido pelo entry do
Nitro. Se o healthcheck falhar, o Easypanel marca o container como unhealthy e entra em
**restart loop** em produção.

**Correção:** testar `curl localhost:3000/healthz` dentro do container; se não responder, criar
uma rota Nitro real (`src/routes/api/healthz.ts`).
**Risco: baixo**, mas **verificar antes de trocar** — apontar para `/` pode dar 200 numa página
de erro.

---

## Ordem sugerida de ataque

### Fase 0 — agora (segurança, sem esperar)
> ✅ **Itens 1, 2, 3, 4, 5 e 6 concluídos (2026-10-20).**
1. ✅ **P0.1** `gerenciarUsuarioFn` — escala de privilégio. Uma função, fecha o buraco mais grave.
2. ✅ **P0.3** `seedSuperAdmin` — proteger ou remover.
3. ✅ **P0.12** remover os 5 `fetch` de debug.
4. ✅ **P0.5** `.gitignore` + `git rm --cached .env` e `.dbg/admin-vehicle-detail.env`.
5. ✅ **P0.10** `min(10)` na senha + `crypto.randomInt` no OTP (contador de tentativas → C9).
6. ✅ **P0.2** (subset fácil de P0.2) — `limparLogsFn`, `getSystemLogsFn`, `getRelatorios*Fn`,
   `setComissaoPadraoFn`, `demo.functions.ts`, `admin-checklist`, `marketing` — todas são
   **admin puro**, sem usuário legítimo além do admin. Ampliado para 48 fns em 6 arquivos,
   com dois níveis (`adminOuOperacaoDaSessao` para leitura, `adminDaSessao` para escrita).
7. ✅ **P0.4** segredo de sessão e credencial do superadmin — resolvidos **sem** depender de
   variável de ambiente (env → banco → CSPRNG), porque o deploy não tem env vars setadas.
8. ✅ **P0.7** webhook do WhatsApp — falha fechada por padrão, com `WEBHOOK_ASSINATURA_OPCIONAL`
   como única saída de emergência.

> ⚠️ **Ação manual pendente (não bloqueia o deploy, mas precisa ser feita):**
> - **P0.7**: gravar o **App Secret da Meta** em `Admin > Comunicações > Configurações`. Sem
>   isso, toda mensagem recebida da Meta é rejeitada com 401 (e o log da Meta mostra o motivo).
> - **P0.4**: se a conta do superadmin em produção ainda usa a senha antiga (que estava
>   publicada no repo), **trocá-la pelo painel** — a correção não rotaciona senha existente.
> - **P0.5**: rotacionar a `publishable_key` do Supabase, que ficou no histórico do git.

### Fase 1 — correções locais seguras (qualidade, sem risco)
9. ✅ **A1, A2** (dashboard mostra números reais — 30 min, valida a leitura)
10. ✅ **A3, A4** (fuso)
11. **B2** (ledger duplicado — financeiro)
12. **B3** (tentativas do código de entrega)
13. **A5, A6, A8** (higiene de queries)
14. **A9, A13, A11** (erros engolidos, vazamento, `sql.raw`)

### Fase 2 — autorização (o trabalho mais caro)
15. **B1 por módulo**, começando por compradores/financeiro/compliance — com matriz de
    permissão, não `role === 'admin'`. Respeitar **B1.a** (funções de posse).
16. **P0.6** revogar `anon` em `otp_codes`/`profiles` — testar `vendedor.financeiro.tsx` e
    `auth-attacher.ts`.
17. **B4, B6, B7** (races pontuais)

### Fase 3 — robustez e hardening
18. **B8–B11** (com paginação real junto)
19. **P0.9** allowlist de MIME + `nosniff` + `Content-Disposition`
20. **P0.11** throttle em memória no login/reset
21. **C6** headers simples (sem CSP ainda) + `USER` no Docker
22. **C13, C14** validação de env no boot + healthcheck (após conferir as variáveis)

### Fase 4 — mudança de contrato (planejar à parte)
22. **C8, C9, C10** (posse dos arquivos, tentativas de OTP, rate limit distribuído)
23. **C3** paginação real
24. **C1, C7** (storage de objetos, unificar pós-vistoria)
25. **C11, C12** (matriz de capabilities, RLS)

---

**Fila de trabalho interna — corrigir item a item e atualizar a documentação oficial ao final.**
