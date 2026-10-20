# 06 — Integrações

**Status:** Beta Operacional • **Última revisão:** 2026-10-20

Com quem o sistema conversa e onde cada chave mora.

---

## 0. Onde ficam as chaves

> ⭐ **Regra geral: as chaves de integração NÃO ficam em variável de ambiente.** Elas são
> gravadas no **banco**, e editadas pelo admin em **Admin > Configurações**
> (tabela `configuracoes_sistema`). Isso permite trocar a chave sem redeploy.

Exceções que ficam em env: `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `PIX_CHAVE`,
`PIX_WEBHOOK_SECRET`, `SKIP_MIGRATIONS`.

| Integração | Onde a credencial mora | Variável de ambiente |
|---|---|---|
| Meta WhatsApp | `whatsapp_config` (tabela) | — |
| Uazapi | `configuracoes_sistema` (`uazapi_base_url`, `uazapi_token`) | — |
| OpenAI | `configuracoes_sistema` (`openai_api_key`, `openai_model`) | — |
| Supabase | env | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` |
| Conferi | `consulta_provedores` (tabela) | — |
| PIX (repasse) | env | `PIX_CHAVE` |
| PIX (webhook) | env | `PIX_WEBHOOK_SECRET` |
| SMTP | `configuracoes_sistema` | — |

---

## 1. Meta WhatsApp Cloud API — canal `META`

O canal **oficial**. Graph API **v20.0**.

### O que exige

- **Template aprovado.** No canal `META` não se envia texto livre — é obrigatório um template
  cujo `status` na Meta seja `APROVADO`.
- **Sem grupos.** `grupos_alvo` (`@g.us`) só funciona no canal `UAZAPI`. Enviar para grupo no
  `META` gera `IGNORADA` na fila.
- **Aprovação leva tempo.** O fluxo é: admin cria o template → `criarTemplateMetaFn` envia
  para a Meta → a Meta revisa → o webhook devolve o status.

### Componentes do template

A ordem importa. A Meta espera:

```
HEADER → BODY → FOOTER → BUTTONS
```

Se a ordem não bater com o template aprovado, o erro é **132012**
("Parameter format does not match format in the created template").

### Mídia

- `image.id` e `document.id` precisam ser **inteiros**.
- O endpoint `/media` da Meta devolve um handle **alfanumérico** (`1234...abcd`). Converter
  para o id numérico antes de montar o payload.
- `uploadMidiaTemplateFn` faz o upload e guarda `midia_id` / `midia_arquivo_id` em
  `whatsapp_templates`.

### Erros e o que fazer

| Erro | Tipo | Ação |
|---|---|---|
| `131056` | Rate limit | **Transiente.** Mandou em massa. Use o motor de dripping (lote 20). |
| `132012` | Formato de parâmetro | **Permanente.** Ordem dos componentes errada. |
| `132018` | Botão com `parameters` vazio | **Permanente.** Remova o `parameters`. |
| `131047` | — | **Permanente.** |
| `132000` | — | **Permanente.** |
| `131026` | — | **Permanente.** |
| 5xx / 429 | Transiente | Retry com backoff; a mensagem volta para `PENDENTE`. |

> **Template aprovado é imutável na Meta.** Para mudar o texto, crie outro template.

### Webhook

`POST /api/public/webhooks/whatsapp` — recebe status de entrega, respostas e mensagens
entrantes. Cada evento é registrado em `whatsapp_webhook_logs`.

**O webhook escreve em `whatsapp_mensagens.status`** (`NA_FILA | ENVIADA | ENTREGUE | LIDA |
FALHOU`), **não** em `estado_fila`. São coisas diferentes.

### Envio

Toda mensagem de campanha entra na fila (`whatsapp_mensagens.estado_fila='PENDENT'`) e é
processada pelo motor de dripping. **Não existe envio direto da tela de campanha.**

---

## 2. Uazapi — canal `UAZAPI`

Instância de WhatsApp não-oficial, self-hosted.

- **Texto livre** — não exige template.
- **Aceita grupos** — é o **único** canal que aceita `grupos_alvo` (`@g.us`).
- Config em `configuracoes_sistema`: `uazapi_base_url`, `uazapi_token`.
- Funções: `getUazapiConfigFn`, `salvarUazapiConfigFn`, `testarUazapiFn`,
  `listarGruposUazapiFn`, `verificarWhatsappContatosFn`.

> ⚠️ Uazapi é API não-oficial. Ela pode quebrar sem aviso e não tem a mesma estabilidade de
> SLA da Meta. O sistema trata a queda como falha transitória e retenta.

---

## 3. Motor de disparo (interno)

`src/db/disparo-motor.server.ts`. Detalhes em [04 §6](04-regras-negocio.md).

| Constante | Valor |
|---|---|
| `LOTE` | 20 |
| `RESERVACA_PENDENTE_MIN` | 10 |
| `MAX_TENTATIVAS` | 5 |
| `FUSO_OPERACAO` | `America/Sao_Paulo` |

Reserva com `FOR UPDATE SKIP LOCKED` → seguro com múltiplas réplicas.

---

## 4. Supabase

### O que é usado

O app **não usa Supabase Auth**. A sessão é própria (cookie httpOnly HMAC). O cliente
Supabase (`src/integrations/supabase/client.ts`) é usado como **auxiliar** para storage de
laudos e dados financeiros.

### Chaves opacas (Supabase novo)

As chaves novas `sb_publishable_` / `sb_secret_` **não são JWT**. O `client.ts` detecta o
prefixo e **remove** o header `Authorization: Bearer` antes de enviar, mantendo só `apikey`.

> Se você trocar para a chave nova e começar a receber 401, é esse detalhe. Não "conserte"
> adicionando o Bearer de volta.

### RLS desligada

`ensureLeilaoSchema()` faz `DROP POLICY` + `DISABLE ROW LEVEL SECURITY` em `lances` e
`leiloes`. **A autorização é 100% na aplicação.** Se criar tabela nova sensível, replique o
cuidado.

### `supabase/migrations/`

10 arquivos SQL datados (2026-08-11 → 2026-08-14). **Trilha vestigial** — o app em runtime
não depende dela.

---

## 5. OpenAI — IA

### Usos

| Uso | Onde |
|---|---|
| Verificação de documentos por visão | `src/db/ia-documentos.server.ts` |
| Leitura de placa em foto | `src/db/ia-fotos.server.ts` |
| Geração de legenda de foto | `detectarPlacaFotoFn` / `gerarLegendaFotoFn` |

### Configuração

`configuracoes_sistema`: `openai_api_key`, `openai_model`. `ia_modelos_openai` guarda o
catálogo de modelos.

### Regra crítica

> ⭐ **A IA nunca bloqueia o fluxo.** Sem chave, ou com a chamada falhando, o sistema **segue
> sem a validação** e registra o motivo. O compliance continua exigindo decisão humana.

Isso é proposital: uma indisponibilidade da OpenAI não pode paralisar a operação de vistoria
ou de publicação.

---

## 6. Company Conferi — consulta veicular

- **Perícia veicular** e **desvalorização FIPE**.
- Credencial em `consulta_provedores` (tabela).
- Webhook: `POST /api/public/webhooks/conferi` — autenticado por token próprio.
- Funções: `consultarAgregadosPorPlacaFn`, `consultarLaudoVeiculoFn`,
  `consultarDesvalorizacaoFipeFn`, `listarConsultasVeiculoFn`, `obterRelatorioConsultasFn`,
  `listarEventosConsultaFn`, `testarConexaoConsultaFn`, `testarDesvalorizacaoFipeFn`.

> A tela `/admin/logs-consultas` é restrita a `role === 'admin'` **no servidor**
> (`src/lib/consulta-logs.functions.ts:15-17`) — uma das poucas funções que checam role.

---

## 7. PIX (pagamento e repasse)

### Cobrança ao comprador

- `src/db/provedores/pix.server.ts` — camada de provedor com `getProvider()`.
- ⚠️ **Hoje só existe `interno-homologacao`.** `getProvider()` **sempre** devolve esse
  provedor. Ele **nunca confirma sozinho**.
- `verificarPagamentoFn` só **consulta** o provedor. A confirmação vem do webhook
  (`POST /api/public/webhooks/pagamentos`, valida `x-pix-signature` / `PIX_WEBHOOK_SECRET`) ou
  de `confirmarPagamentoManualFn`.
- Idempotência por `id_externo`.

### Repasse ao vendedor

- Chave PIX em `PIX_CHAVE` (env) ou nos dados bancários do vendedor
  (`vendedor_dados_bancarios.chave_pix`).
- Repasse é autorizado e confirmado **manualmente** pelo admin, com lock pessimista
  (`SELECT ... FOR UPDATE`).

> Para produção é obrigatório plugar o provedor PIX real e configurar o caminho de
> confirmação. Do jeito que está, todo pagamento depende de confirmação manual.

---

## 8. SMTP (e-mail)

- Usado para: recuperação de senha (OTP), primeiro acesso, notificação de aceite, avisos
  administrativos.
- Config em `configuracoes_sistema`.
- OTP em `otp_codes`.

---

## 9. FIPE e ViaCEP

### FIPE

Base do motor de depreciação (`src/db/depreciacao.server.ts`). Entrada:

```
FIPE → ajuste por KM → desconto por grau do checklist (0.6x / 1.0x / 1.8x)
     → valorização por acessórios → margem de segurança (8%) → interesse do vendedor
```

Ajuste manual do vendedor é guardado (`sobrescreverAjusteFn`) sem perder o valor original.

### ViaCEP

`src/lib/viacep.ts` → `buscarCep`. Usado no cadastro de comprador e vendedor para
auto-preencher o endereço. Máscaras em `src/lib/brasil.ts` (`maskCep`, `maskDocumento`,
`maskCelular`).

---

## 10. Analytics e tracking

`__root.tsx` carrega tags de **GTM**, **GA** e **Meta Pixel**. Configuradas por env/
build. O Meta Pixel é o que alimenta a público-alvo das campanhas de WhatsApp.

---

## 11. PWA (vistoriador)

O app do vistoriador é uma **PWA offline-first** (`src/routes/vistoriador.tsx`):
service worker registrado no `__root.tsx`, popup de instalação (`InstalarApp`), e o layout
**não** tem guarda de sessão (a guarda é client-side nas telas).

---

## 12. Resumo: quem llama quem

```
Meta WhatsApp ──┐
Uazapi ─────────┼──> src/db/comunicacoes.server.ts ──> whatsapp_mensagens
                │         │                              (fila)
                │         └──> src/db/disparo-motor.server.ts ──> API Meta/Uazapi
                │
OpenAI ─────────┴──> ia-documentos / ia-fotos ──> logs (nunca bloqueia)

Conferi ──────> consulta-veicular.server.ts <── webhook /api/public/webhooks/conferi

PIX provedor ──> pagamentos.server.ts <── webhook /api/public/webhooks/pagamentos

FIPE ─────────> depreciacao.server.ts ──> depreciacao_calculos

ViaCEP ───────> src/lib/viacep.ts (client-side)
```

---

**Próximo:** [07-convencoes.md](07-convencoes.md)
