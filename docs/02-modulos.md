# 02 — Módulos e telas

**Status:** Beta Operacional • **Última revisão:** 2026-10-20

Inventário de tudo que o sistema faz, agrupado por módulo. Cada módulo aponta para o arquivo de
regra (`src/db/*.server.ts`) e para as server functions (`src/lib/*.functions.ts`).

---

## A. Público (sem login)

| Tela | Rota | O que faz |
|---|---|---|
| Landing | `/` | Página institucional, entrada de dados de leads |
| Link privado | `/c/$token` | Veículo por token (sem passar pela vitrine) |
| Link de vistoria | `/v/$token` | Vistoria por link — o vendedor agenda por aqui |
| Login | `/login` | Entrada por e-mail/senha |
| Primeiro acesso | `/primeiro-acesso` | Troca da senha provisória + aceite de termo |
| Recuperação de senha | `/esqueci-minha-senha`, `/redefinir-senha` | OTP por e-mail |
| Cadastro do vendedor | `/vendedor/cadastrar`, `/vendedor/onboarding` | Wizard + OTP |
| Pré-cadastro do comprador | `/comprador/pre-cadastro` | **Página única** para campanha: empresa, CNPJ, endereço, responsável, senha, aceite do termo |
| Cadastro do comprador | `/comprador/cadastro` | Wizard de 5 etapas com upload de documentos |
| Privacidade / Cookies | `/politica-de-privacidade`, `/politica-de-cookies` | Páginas legais (LGPD) |

**`/comprador/pre-cadastro`** é o link de campanha: o comprador entra **vê os veículos com
valores** mas **não dá lances** até completar o cadastro no wizard. Isso é controlado pelas
flags `pode_ver_valores` / `pode_dar_lances` — nada de código especial.

---

## B. Vitrine — exige login de comprador

⚠️ **A vitrine NÃO é pública.** As duas rotas abaixo verificam, no client, que há sessão **e**
que `role === 'comprador'`; caso contrário redirecionam para `/login`.

| Tela | Rota | O que faz |
|---|---|---|
| Vitrine | `/veiculos` | Lista de veículos publicados. Valores visíveis ou mascarados conforme o acesso comercial |
| Detalhe do veículo | `/veiculos/$slug` | Fotos, especificações, botão de lance |

Guardas: `src/routes/veiculos.index.tsx:52-55` e `src/routes/veiculos.$slug.tsx:46-50`.

---

## C. Painel do comprador (`/comprador`)

| Tela | O que faz |
|---|---|
| `index.tsx` | Resumo: lances, favoritos,-interestes |
| `interesses.tsx` | Filtros de interesse (marca, faixa de preço) |
| `documentos.tsx` | Envia documentos de compliance |
| `negociacoes.tsx` | Negociações em andamento |
| `pagamento.$id.tsx` | Pagar via PIX (QR + copia-e-cola) |
| `entrega.$id.tsx` | Acompanhar e confirmar entrega |
| `avaliacoes.tsx` | Avaliação pós-venda |
| `perfil.tsx` | Dados da empresa |

Funções: `src/lib/comprador.functions.ts` + `comprador-pre-cadastro.functions.ts` + `vitrine.functions.ts`.

---

## D. Painel do vendedor (`/vendedor`)

| Tela | O que faz |
|---|---|
| `index.tsx` | Dashboard: veículos, status, pendências |
| `boas-vindas.tsx` / `onboarding.tsx` | Onboarding progressivo (etapa atual calculada) |
| `cadastrar.tsx` | Cadastro do vendedor (dados + OTP) |
| `documentos.tsx` | Upload dos documentos de compliance |
| `veiculos.tsx` | Lista de veículos do vendedor |
| `veiculo..tsx` | Cadastro/edição de um veículo |
| `veiculo..proposta.tsx` / `veiculo.$id.proposta.tsx` | Receber/aceitar proposta pós-vistoria |
| `contrato.tsx` | Contrato de consignação (gerar, assinar) |
| `financeiro.tsx` | Repasse: dados bancários, histórico |
| `entrega.$id.tsx` | Acompanhar entrega do veículo |
| `perfil.tsx` | Dados cadastrais |

Funções: `src/lib/vendedor.functions.ts`, `pre-cadastro.functions.ts`, `contratos.functions.ts`.

---

## E. App do vistoriador (`/vistoriador`)

| Tela | O que faz |
|---|---|
| `index.tsx` | Painel do dia |
| `agenda.tsx` | Horários disponíveis |
| `execucao.$id.tsx` | Execução da vistoria: checklist, fotos, assinaturas |
| `vistoria.$id.tsx` | Detalhe da vistoria |
| `historico.tsx` | Histórico |
| `perfil.tsx` | Troca de senha |

**Checklist dinâmico:** as categorias e itens vêm de `vistorias_checklist_categorias` /
`vistorias_checklist_itens` e são configuráveis pelo admin (**Admin > Checklist**), com template
aplicável a um lote de vistorias. As respostas de cada vistoria ficam em
`laudo_vistoria_respostas`.

Funções: `src/lib/vistoriador.functions.ts`, `vistorias.functions.ts`, `laudos.functions.ts`.

---

## F. Backoffice (`/admin`) — 36 telas

### Operação

| Tela | O que faz |
|---|---|
| `index.tsx` | Dashboard: pendências por etapa |
| `veiculos.tsx` / `veiculo.$id.tsx` | Fila e dossiê do veículo |
| `veiculo.$id.pos-vistoria.tsx` | Análise pós-vistoria |
| `analise-vistoria.$id.tsx` | Análise de vistoria |
| `vendedores.tsx` / `vendedor.$id.tsx` | Fila e dossiê do vendedor |
| `compradores.tsx` / `comprador.$id.tsx` | Fila e dossiê do comprador |
| `vistorias.tsx` | Agendamentos, unidades, vistoriadores |
| `anuncios.tsx` / `anuncios.nuevo..tsx` | Publicação e criação de anúncio |
| `leiloes.index.tsx` / `leiloes.$id.tsx` | Gestão de lances |
| `negociacoes.tsx` / `negociacao.$id.tsx` | Negociações |
| `pagamentos.tsx` / `pagamento.$id.tsx` | Cobranças PIX |
| `contratos.tsx` / `contrato.$id.tsx` | Contratos de consignação |
| `entregas.tsx` | Entregas |
| `relatorios.tsx` | Relatórios (vendas, comissões) |
| `analytics.tsx` | Métricas |
| `mapa.tsx` | Distribuição geográfica |

### Comunicação e marketing

| Tela | O que faz |
|---|---|
| `comunicacoes.tsx` | **Centro de campanhas WhatsApp**: templates, segmentos, públicos, criar campanha, disparar agora, agendar, logs, diagnóstico |
| `marketing.tsx` | Base de contatos, importação, tags, grupos Uazapi, conversão em comprador |
| `conversas.tsx` / `conversas.logs.tsx` | Atendimento (fila de conversas, respostas prontas) |

### Plataforma

| Tela | O que faz |
|---|---|
| `usuarios.tsx` | Usuários internos (admin/operacao/vistoriador) |
| `configuracoes.tsx` | Chaves de integração, comissões, depreciação, notificações |
| `logs.tsx` / `logs-consultas.tsx` | Auditoria e eventos de consulta veicular |
| `changelog.tsx` | Registro de mudanças exibido no app |
| `ajuda.tsx` | Central de ajuda |
| `demo.tsx` | Modo demonstração — popula dados fictícios para treinar a equipe |

---

## G. Módulos de backend (sem tela própria, mas com regra)

### H1. Motor de disparo WhatsApp — `src/db/disparo-motor.server.ts`

O coração do envio em campanha. Ciclo de uma mensagem:

```
whatsapp_mensagens.estado_fila:
  PENDENTE → RESERVADA → ENVIADA
                        ↘ FALHOU (retry até 5x, backoff 1/2/4/8/16min)
                        ↘ IGNORADA (canal incompatível, ex.: grupo em canal META)
```

**Regras:**
- `LOTE = 20` mensagens por rodada.
- Reserva com `FOR UPDATE SKIP LOCKED` — duas instâncias do servidor nunca enviam a mesma
  mensagem.
- `RESERVACA_PENDENTE_MIN = 10` — mensagem reservada há mais de 10 min volta para `PENDENTE`
  (o processo morreu no meio).
- `MAX_TENTATIVAS = 5`.
- Janela de trabalho avaliada em `America/Sao_Paulo` (`FUSO_OPERACAO`), **não** no fuso do
  servidor (que em deploy é UTC e adiantaria 3h).
- Intervalo entre lotes configurável por campanha.
- Log por lote: ação `LOTE_ENVIADO` com `{lote, enviados, falhas, erros}`.

**Dois canais:**

| `canal_envio` | O que é | Template | Grupo |
|---|---|---|---|
| `META` | Meta WhatsApp Cloud API (oficial) | Obrigatório, precisa estar **aprovado** na Meta | ❌ não |
| `UAZAPI` | Instância Uazapi | Não (texto livre) | ✅ só este aceita `grupos_alvo` (`@g.us`) |

> ⚠️ `whatsapp_mensagens.status` (NA_FILA/ENVIADA/ENTREGUE/LIDA/FALHOU) é o status do
> **webhook** da Meta. `estado_fila` é o status do **nosso motor**. Não confunda.

### H2. Publicação e canais — `src/db/publicacao.server.ts`

Canais: `ANUNCIO`, `VITRINE`, `WHATSAPP`. Cada veículo pode estar ativo em vários canais ao
mesmo tempo. O canal WhatsApp gera um **token público** (`/c/$token`) para mandar o veículo por
link. `revogarTokenCanal` desativa o link.

Só é publicado se `veiculos.status_analise ∈ STATUS_APTOS`:
`['PRONTO_PARA_ANUNCIO', 'ANUNCIADO', 'EM_LEILAO']`.

### H3. Motor de depreciação — `src/db/depreciacao.server.ts`

Base FIPE → ajuste por KM → descontos do checklist (Leve 0.6x / Médio 1.0x / Grave 1.8x) →
valorização por acessórios → margem de segurança (8% padrão) → comparação com o interesse do
vendedor.

### H4. Contratos de consignação — `src/db/contratos.server.ts`

`GERADO → ENVIADO → VISUALIZADO → ASSINADO` (ou `RECUSADO` / `EXPIRADO` / `CANCELADO`).
Só avança para assinado se o compliance do vendedor estiver `APROVADO`.

### H5. Entrega — `src/db/entregas.server.ts`

Fluxo com **código de confirmação**: o comprador recebe um código, o entregador digita, e só aí
o veículo é liberado. Divergências e não comparecimento são tratados explicitamente.

### H6. Financeiro / repasse — `src/db/financeiro.server.ts`

`AGUARDANDO → AUTORIZADO → CONCLUIDO` (falha: `FALHOU`, reautorizável). Um repasse por
negociação. Auditoria em `financeiro_auditoria` e lançamento em `movimentos_financeiros`.

### H7. Motor de automações — `src/db/automacoes-motor.server.ts`

Regras automáticas disparadas por evento (ex.: virar `PRONTO_PARA_ANUNCIO` → notificar). A base
está em `whatsapp_automacoes` + `whatsapp_automacoes_execucoes`.

### H8. IA — `src/db/ia-documentos.server.ts`, `src/db/ia-fotos.server.ts`

Verificação de documentos por visão e leitura de placa em foto. **Nunca bloqueia o fluxo**: se
não houver chave ou a IA falhar, o sistema segue sem a validação. Ver
[06-integracoes.md](06-integracoes.md).

### H9. Consulta veicular — `src/db/consulta-veicular.server.ts`

Company Conferi: perícia e desvalorização FIPE. Webhook autenticado por token próprio.

### H10. Prazos / rotinas — `src/db/purge-operacional.server.ts`, `src/db/tempo.ts`

Limpeza de registros antigos e expiries (cobranças vencidas, leases de vistoria).

---

**Próximo:** [03-funcoes.md](03-funcoes.md)
