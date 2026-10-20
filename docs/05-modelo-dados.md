# 05 — Modelo de dados

**Status:** Beta Operacional • **Última revisão:** 2026-10-20

PostgreSQL. Aproximadamente **90 tabelas**. Este documento diz o que cada uma guarda e como
elas se relacionam.

---

## 0. Leia isto antes de tudo

> **O schema declarativo em `src/db/schema/index.ts` define só 8 tabelas e NÃO é a fonte de
> verdade.** O banco real é criado por ~25 funções `ensure*Schema()` que rodam
> `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` em SQL puro.
>
> Para adicionar coluna: edite o `ensure*Schema()` do módulo dono da tabela, **não** o
> `src/db/schema/index.ts`.

Detalhamento em [01-arquitetura.md §5](01-arquitetura.md).

### Como a migração realmente roda

```
migrateDb()  ← src/db/index.ts
  1. sem DATABASE_URL → log e sai
  2. SKIP_MIGRATIONS === 'true' → sai (kill-switch)
  3. drizzle migrate (5 arquivos em drizzle/)
  4. pg_advisory_lock(918273645)   ← serializa réplicas
  5. chama ~25 ensure*Schema() em ordem
  6. ensureSuperAdmin()
```

⚠️ **A migração é lazy, não de boot.** `migrateDb()` é chamado na **primeira server function**
que o toca (`getActiveAuctions`, `admin-compradores`, `comprador`). Não há script `npm run
migrate` e `src/server.ts` não importa `migrateDb`. Na prática: a primeira requisição paga o
custo de criação do schema. O `pg_advisory_lock` evita que duas réplicas criem a mesma tabela
ao mesmo tempo.

⚠️ **Não existe `drizzle.config.ts` no repositório.** As 5 migrações em `drizzle/` foram geradas
uma vez; você não consegue rodar `drizzle-kit generate` a partir do projeto como está.

⚠️ **A migração é best-effort.** Erro no bloco de `ensure*` é engolido e apenas loga
"❌ Falha na migração". Se um `ensure*` falhar, a tabela correspondente simplesmente não
existe — e o erro aparece depois, na hora do uso.

### Ordem dos `ensure*Schema()` em `src/db/index.ts`

```
ensureAuthSchema → ensurePerfilSchema → ensureCadastroSchema → ensureVendedoresSchema
→ ensureVeiculosAdminSchema → ensureContratosSchema → ensureVistoriaSchema
→ ensureLaudoSchema + seedConfiguracoes → ensureDepreciacaoSchema
→ ensureAnalisePosVistoriaSchema → ensureAnunciosSchema → ensureLeilaoSchema
→ ensureCompradorSchema → ensureNegociacoesSchema → ensurePagamentosSchema
→ ensureEntregasSchema → ensureFinanceiroSchema → ensureTimelineSchema
→ ensureComunicacoesSchema → ensureAutomacoesSchema → ensureConversasSchema
→ ensureRelatoriosSchema → ensureMailSchema → (diagnóstico WhatsApp, tolerante a falha)
→ ensureSuperAdmin()
```

Além disso, cada `ensure*Schema()` é chamado **sob demanda** pela própria função de negócio que
usa a tabela (ex.: `ensureArquivosSchema` dentro de `salvarArquivo`). É um padrão de
*self-healing schema*.

---

## 1. Núcleo: pessoas e veículos

### `profiles` — a base de todos os usuários

Um único table para os 5 papéis. Colunas-chave:

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `email` | text unique not null | minúsculo, sempre |
| `senha_hash` | text | hash de `src/db/auth.server.ts` |
| `role` | `app_role` | `admin \| operacao \| vistoriador \| comprador \| vendedor` |
| `ativo` | boolean | `false` bloqueia o login |
| `protegido` | boolean | marca o superadmin |
| `senha_temporaria` | boolean | força `/primeiro-acesso` |
| `tipo_pessoa` | text | `PF \| PJ` |
| `cpf`, `cnpj` | text | |
| `whatsapp`, `telefone` | text | |
| `cep`, `endereco`, `numero`, `bairro`, `complemento`, `cidade`, `uf` | text | |
| `documento_cnh_url`, `documento_cnh_verso_url`, `documento_crlv_url`, `documento_selfie_url`, `documento_comprovante_endereco_url` | text | |
| `responsavel_nome` | text | |
| `cadastro_completo` | boolean | ⭐ flag comercial |
| `status_compliance` | text | ⭐ estado da análise |
| `compliance_motivo_pendencia` | text | |
| `pode_ver_valores` | boolean | ⭐ flag comercial |
| `pode_dar_lances` | boolean | ⭐ flag comercial |
| `origem_cadastro` | text | `AUTOCADASTRO` etc. |
| `termo_aceito_em` | timestamptz | |
| `etapa_cadastro` | integer | monotonamente crescente |
| `criado_em`, `atualizado_em` | timestamptz | |

### `veiculos`

| Coluna | Nota |
|---|---|
| `id` | uuid PK |
| `placa` | **unique** |
| `vendedor_id` | FK → `profiles` |
| `perfil_id` | FK → `profiles` (legado) |
| `responsavel_analise_id` | FK → `profiles` (quem pegou a análise) |
| `marca`, `modelo`, `ano_fabricacao`, `ano_modelo`, `km`, `cor`, `combustivel`, `cambio` | |
| `status` | status comercial (ver [04 §4](04-regras-negocio.md)) |
| `status_analise` | pipeline operacional |
| `fotos` | text |
| `fotos_processadas`, `fotos_camadas`, `fotos_legendas` | jsonb |
| `documento_crlv_url` | |
| `blindado`, `tipo_veiculo` | |
| `criado_em`, `atualizado_em` | |

### `veiculo_timeline`

Timeline de eventos do veículo (`veiculo_id`, `acao`, `detalhe`, `usuario_id`).

### `leads`

Leads de marketing (schema declarativo).

### `clientes`

Clientes do balcão legado, com `documento` unique.

---

## 2. Lances e lances

### `leiloes`

| Coluna | Nota |
|---|---|
| `id` | uuid PK |
| `veiculo_id` | FK → `veiculos` |
| `inicio_em`, `fim_em` | |
| `lance_inicial` | text (numeric no uso real) |
| `status` | `RASCUNHO \| AGENDADO \| ATIVO \| PRORROGADO \| ENCERRADO \| PAUSADO \| CANCELADO` |
| `incremento_minimo` | |
| `criado_em` | |

> ⚠️ O `src/db/schema/index.ts` declara `status` com default `'agendado'`/`'aberto'` em
> minúsculas. O que vale em runtime são os valores **em maiúsculas** gravados pelo
> `ensureLeilaoSchema()` e pelo código. Não confie no schema declarativo aqui.

### `lances`

`id`, `leilao_id` (FK), `comprador_id` (FK), `valor`, `criado_em`.

### `leiloes_resultado`

Resultado do fechamento: `leilao_id` (unique, FK), `resultado`, `maior_lance`,
`valor_minimo_acordado`, `vencedor_id`, `ranking` (jsonb), `fechado_em`.

---

## 3. Publicação e anúncios

### `anuncios_veiculo`, `anuncios_fotos`, `anuncios_apontamentos`

Canais de publicação: vitrine, leilão, anúncio, WhatsApp.

### `publicacao_canais`

Canal por veículo: `veiculo_id`, `canal` (`ANUNCIO | VITRINE | WHATSAPP`), `token_publico`
(para `/c/$token`), `ativo`.

---

## 4. Vistorias e laudos

| Tabela | O que guarda |
|---|---|
| `unidades_vistoria` | Unidades de vistoria (locais) |
| `vistoriadores` | Vínculo vistoriador ↔ unidade (feito **manualmente** em Admin > Vistorias > Cadastros) |
| `vistorias` | Agendamento: `veiculo_id`, `vendedor_id`, `unidade_id`, `vistoriador_id`, `data_vistoria`, `horario_vistoria`, `status`, `confirmada_em` |
| `vistorias_historico` | Timeline: `vistoria_id`, `acao`, `detalhe`, `usuario_id` |
| `vistorias_bloqueios` | Bloqueio de agenda: `unidade_id`, `vistoriador_id`, `data_inicio`, `data_fim`, `motivo` |
| `vistorias_pendencias` | Pendências |
| `vistorias_checklist_categorias` | **Checklist dinâmico** — categorias |
| `vistorias_checklist_itens` | **Checklist dinâmico** — itens, linked a categorias |
| `laudos` | `vistoria_id` (unique), `veiculo_id`, `vistoriador_id`, `status`, `quilometragem_atual`, `localizacao_checkin` (jsonb), `placa_confirmada`, `observacao_geral`, `declaracao_vistoriador`, `concluido_em` |
| `laudo_checklist` | Itens marcados |
| `laudo_respostas` | Respostas |
| `laudo_vistoria_respostas` | Respostas do checklist dinâmico |
| `laudo_fotos` | Fotos do laudo |
| `laudo_acessorios` | Acessórios (alimentam a depreciação) |
| `vistoria_links` | Tokens dos links `/c/$token` e `/v/$token` |
| `veiculo_laudos_externos` | Laudos de terceiros |

### `vistorias.status`

```
AGUARDANDO_CONFIRMACAO → CONFIRMADA → EM_ANDAMENTO → CONCLUIDA
                ↘ REAGENDAMENTO_SOLICITADO
                ↘ CANCELADA
                ↘ NAO_COMPARECEU_*
```

---

## 5. Pós-vistoria

- `propostas_veiculo` — proposta de valor ao vendedor após a vistoria.
- `analise_pos_vistoria` / tabelas de checklist da análise.

---

## 6. Contratos e termos

### `contrato_modelos`

`nome`, `versao`, `ativo`, `data_versao`, `conteudo` (texto), `campos_dinamicos` (jsonb).

### `contratos`

| Coluna | Nota |
|---|---|
| `identificador` | unique, via sequência `contrato_numero_seq` (começa em 91) |
| `vendedor_id`, `modelo_id`, `responsavel_id` | FKs |
| `modelo_nome`, `modelo_versao`, `versao` | snapshot do modelo no momento do uso |
| `status` | `GERADO \| ENVIADO \| VISUALIZADO \| ASSINADO \| RECUSADO \| EXPIRADO \| CANCELADO` |
| `conteudo` | texto assinado |
| `canais` | jsonb — por onde foi enviado |
| `provedor_externo`, `transacao_externa_id` | assinatura via provedor externo |
| `arquivo_original_url`, `arquivo_assinado_url` | |
| `evidencias` | jsonb |
| `ip_assinatura` | |
| `gerado_em`, `enviado_em`, `visualizado_em`, `assinado_em`, `recusado_em`, `expirado_em` | |

`contrato_eventos`, `contrato_notificacoes` — trilha e notificações.

### `termos_versoes`

`versao`, `titulo`, `tipo` (`VENDEDOR | COMPRADOR`), `conteudo`. O texto padrão vive em
código: `TERMO_PADRAO_VENDEDOR` / `TERMO_PADRAO_COMPRADOR` (`src/db/termos.server.ts`).

### `termos_aceites`

Aceite com `perfil_id`, `tipo`, `versao`, `conteudo_hash`, `assinatura`, `aceito_em`, `ip`,
`user_agent`.

---

## 7. Negociação, cobrança e entrega

### `negociacoes`

`codigo` (unique), `veiculo_id`, `anuncio_id`, `leilao_id`, `lance_id`, `vendedor_id`,
`comprador_id`, `valor_venda`, `valor_comissao`, `valor_previsto_vendedor`,
`prazo_pagamento_em`, `status`, `motivo_cancelamento`, `mensagem_comprador`,
`mensagem_vendedor`, `cancelado_por`.

`negociacoes_timeline`, `negociacoes_notificacoes`.

### `cobrancas`, `cobrancas_eventos`, `pagamentos_logs`

Cobrança PIX: `id_externo` (idempotência), `status`, `valor`, `prazo`, QR copia-e-cola.

### `entregas`, `entregas_agendamentos`, `entregas_eventos`, `entregas_fotos`, `entregas_observacoes`

Entrega com código de confirmação. Papel `VENDEDOR`/`COMPRADOR` confirma o horário.

---

## 8. Financeiro

| Tabela | O que guarda |
|---|---|
| `vendedor_dados_bancarios` | `vendedor_id` (unique), `tipo_chave` (CPF/CNPJ/EMAIL/TELEFONE/ALEATORIA), `chave_pix`, `titular_nome`, `titular_documento`, `verificado` |
| `repasses` | `negociacao_id` (**unique**), `vendedor_id`, `valor_venda`, `valor_comissao`, `valor_liquido`, `comissao_tipo` (PERCENTUAL/FIXO), `comissao_regra`, `status`, `dados_bancarios_json`, `id_externo_transacao`, `comprovante_url`, `autorizado_por`, `autorizado_em`, `processado_em`, `concluido_em`, `motivo_falha` |
| `financeiro_ledger` | **Razão imutável**: `negociacao_id`, `tipo` (ENTRADA_COMPRADOR/RETENCAO_COMISSAO/SAIDA_REPASSE), `direcao` (ENTRADA/SAIDA), `valor`, `status`, `referencia_externa` |
| `financeiro_auditoria` | `acao`, `valor_anterior`, `valor_novo`, `autor_id` |
| `financeiro_configuracoes` | chave/valor (comissão padrão) |

> A auditoria é **append-only**. Não altere linha de `financeiro_ledger` — insira.
> `financeiro_ledger` é a fonte da verdade do caixa; `repasses` é o estado do repasse.

---

## 9. Depreciação

- `depreciacao_regras` — regras por faixa (KM, tipo, ano).
- `depreciacao_calculos` — cada cálculo feito.
- `veiculos_depreciacao_detalhe` — o detalhe por veículo (base FIPE, ajuste, acessórios).

---

## 10. Comunicação e WhatsApp

### `whatsapp_config`

Credenciais da Meta (uma linha de config).

### `whatsapp_templates`

`nome_interno`, `meta_name` (unique), `categoria`, `idioma`, `conteudo` (jsonb), `status`
(`PENDENTE | APROVADO | ...`), `tipo_midia`, `meta_id`, `midia_id`, `midia_arquivo_id`.

### `whatsapp_campanhas`

`nome`, `veiculo_id` (FK), `template_id` (FK), `status`
(`RASCUNHO | AGENDADA | PROCESSANDO | CONCLUIDA | CANCELADA`), `agendado_para`, `canal_envio`,
`grupos_alvo` (jsonb), contadores `total_destinatarios / enviados / entregues / lidos / falhas /
cliques`, `criado_por` (FK).

### `whatsapp_mensagens` — a fila do motor

`campanha_id`, `comprador_id`, `telefone`, **`estado_fila`** (motor), **`status`** (webhook),
`meta_message_id` (unique), `tentativas`, `erro`, `reservada_em`, `enviada_em`.

> ⭐ **Duas colunas de estado que não podem ser confundidas.** Veja
> [04 §6](04-regras-negocio.md).

### `whatsapp_conversas`, `whatsapp_segmentos` (+ `_contatos`), `whatsapp_respostas_prontas`, `whatsapp_automacoes` (+ `_execucoes`), `whatsapp_logs`, `whatsapp_webhook_logs`, `whatsapp_contato_lotes`

---

## 11. Marketing

- `marketing_contatos` — nome, e-mail, telefone, empresa, tipo, status, endereço completo,
  lat/long, `geo_status`, `whatsapp_status`, `origem`, `observacoes`, `comprador_id` (FK).
- `marketing_tags`
- `marketing_contato_tags`

---

## 12. Comprador — dados de apoio

`comprador_favoritos`, `comprador_lembretes`, `comprador_notificacoes`,
`avaliacao_pos_venda` (+ anexos cautelares).

---

## 13. Compliance

`compliance_analise`, `compliance_historico`, `compliance_pendencias`.

## 14. Consulta veicular

`veiculo_consultas`, `consulta_eventos`, `consulta_provedores`.

## 15. Plataforma

`configuracoes`, `configuracoes_sistema`, `configuracoes_negociacao`, `logs`,
`notificacoes_destinatarios`, `changelog_itens`, `otp_codes`, `ia_modelos_openai`,
`public.documentos`, `arquivos_upload`.

### `configuracoes_sistema` — onde vivem as chaves de integração

| Chave | Para quê |
|---|---|
| `openai_api_key`, `openai_model` | IA de documentos/fotos |
| `uazapi_base_url`, `uazapi_token` | Uazapi |
| (credenciais Meta) | `whatsapp_config` |
| (token Conferi) | `consulta_provedores` |

> ⭐ **As chaves de integração NÃO ficam em variável de ambiente.** Editadas em
> **Admin > Configurações**. Isso troca a chave sem redeploy.

### `arquivos_upload`

`id` (uuid), `mime_type`, **`conteudo` bytea**, `tamanho`, `criado_em`.

> O binário fica **dentro do Postgres** (bytea). Não há S3 nem Supabase Storage no fluxo
> atual. Servido por `GET /api/public/arquivo/$id` (cache imutável, CORS liberado).
> Tamanho máximo de upload: **10 MB**. Isso dimensiona o banco — vale saber antes de
>Litrar.

---

## 16. Diagrama de relacionamentos (simplificado)

```
profiles ──< veiculos ──< leiloes ──< lances
    │            │           │
    │            │           └──< leiloes_resultado ──> winner
    │            │
    │            ├──< vistorias ──< laudos ──< laudo_fotos
    │            ├──< anuncios_veiculo ──< anuncios_fotos
    │            ├──< publicacao_canais
    │            ├──< propostas_veiculo
    │            └──< veiculo_timeline
    │
    ├──< negociacoes ──< cobrancas ──< cobrancas_eventos
    │        │
    │        ├──< repasses ──< financeiro_ledger
    │        └──< entregas ──< entregas_eventos
    │
    ├──< contratos ──< contrato_eventos
    ├──< termos_aceites
    ├──< whatsapp_mensagens ──> whatsapp_campanhas ──> whatsapp_templates
    ├──< marketing_contatos ──< marketing_contato_tags >── marketing_tags
    └──< compliance_analise / compliance_historico / compliance_pendencias
```

---

## 17. Onde criar o que (guia rápido)

| Preciso de… | Vai para |
|---|---|
| Nova coluna | `ensure*Schema()` do módulo dono da tabela |
| Nova tabela | `ensure*Schema()` do módulo + `CREATE TABLE IF NOT EXISTS` |
| Nova tabela também no Drizzle | `src/db/schema/index.ts` (só se quiser que o drizzle-kit reflita — **não afeta runtime**) |
| Índice | No mesmo `ensure*Schema()` |

---

**Próximo:** [06-integracoes.md](06-integracoes.md)
