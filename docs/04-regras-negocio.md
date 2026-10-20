# 04 — Regras de negócio

**Status:** Beta Operacional • **Última revisão:** 2026-10-20

Este é o documento que descreve **o que o sistema respeita**. Se você vai mexer em regra,
comece por aqui.

---

## 1. Permissões: 4 flags, não o `role`

O `role` (`admin | operacao | vistoriador | comprador | vendedor`) diz **qual painel** a pessoa
usa. O que a pessoa **pode fazer comercialmente** é controlado por 4 colunas em `profiles`:

| Flag | Tipo | Significado |
|---|---|---|
| `pode_ver_valores` | boolean | Enxerga lance inicial / lance atual / incremento |
| `pode_dar_lances` | boolean | Pode registrar lance |
| `cadastro_completo` | boolean | Passou por todas as etapas do wizard |
| `status_compliance` | text | Estado da análise de compliance |

### O portão (`getAcessoComercial`, `src/db/vitrine.server.ts`)

```ts
const aprovado = p.status_compliance === 'APROVADO';

pode_ver_valores = aprovado || p.pode_ver_valores;
pode_dar_lances  = aprovado && p.cadastro_completo && p.tipo_pessoa === 'PJ';
```

Três consequências que precisam estar claras:

1. **Pessoa Física nunca dá lances.** Só PJ. A regra está no tipo de pessoa, não no role.
2. **Quem nasce pelo pré-cadastro público vê valores mas não oferta** — `pode_ver_valores=true`,
   `pode_dar_lances=false`.
3. **O `admin` não tem acesso comercial.** As flags são independentes do role.

> O `admin` pode ver tudo pelas telas administrativas (que usam queries do backoffice, não a
> vitrine). O mascaramento da vitrine vale para quem compra/vende.

### Onde a regra é aplicada

O mascaramento acontece **no servidor**, em `listarAnunciosVitrine` / `getAnuncioPublico`. O
front recebe `valores_ocultos: true` e os campos de valor vêm `null`. Não confie no front para
esconder valor.

---

## 2. Estados de compliance

`status_compliance` ∈ `PENDENTE | NAO_ENVIADO | AGUARDANDO_ANALISE | EM_ANALISE | PENDENCIA | APROVADO | REPROVADO`

### Comprador

```
NAO_ENVIADO ──envia cadastro──→ AGUARDANDO_ANALISE ──admin assume──→ EM_ANALISE
                                                                         │
                        ┌────────────────────────────────────────────┼──────────────┐
                        ↓                        ↓                      ↓              ↓
                   APROVADO                PENDENCIA               REPROVADO    (reenvio)
                        │                        │                      │
              pode_dar_lances=true      cadastro_completo=false  cadastro_completo=false
                                        + motivo                + motivo
```

**Regra dura:** ao cair em `REPROVADO`, `PENDENCIA` ou `NOVO_ENVIO_SOLICITADO`, o sistema
**força** `status_compliance='PENDENCIA'` e `cadastro_completo=false`. Não é o admin que tem
que lembrar de limpar a flag — o código faz.

### Vendedor

Para `APROVADO`, são exigidas **duas** coisas:

- onboarding completo, **e**
- **5 documentos** com status `APROVADO`.

Qualquer um dos dois pendente → o vendedor não chega a `APROVADO`.

---

## 3. Progresso e etapas do cadastro do comprador

`calcularProgressoComprador` (`src/db/comprador.server.ts`) avalia **9 requisitos**. O
progresso é percentual.

- **100%** só quando **zero** pendências.
- Com qualquer pendência, o resultado é **limitado a 99%** — o sistema nunca mostra "completo"
  enquanto falta documento.

`etapa_cadastro` **só avança**: é gravado com `GREATEST(etapa_atual, etapa_nova)`. Salvar uma
etapa anterior não faz o comprador voltar — ele consegue retomar de onde parou, mas nunca
regredir por descuido.

**Ao enviar o cadastro para análise:**
- `cadastro_completo = true`
- `status_compliance = 'AGUARDANDO_ANALISE'`
- `etapa_cadastro = 99`
- exige progresso **completo** e **termo aceito** (`termo_comprador_ativo`)

---

## 4. Ciclo de vida do veículo

Existem **duas** chains de status, e elas não são a mesma coisa.

### `veiculos.status_analise` — o pipeline operacional

```
AGUARDANDO_ANALISE
  → EM_ANALISE
  → PRONTO_PARA_VISTORIA
  → AGUARDANDO_ANALISE_LAUDO
  → AGUARDANDO_ANALISE_POS_VISTORIA
  → EM_ANALISE_POS_VISTORIA
  → PENDENCIA_VISTORIA
  → AGUARDANDO_ACEITE_VENDEDOR
  → AGUARDANDO_APROVACAO_VENDEDOR
  → PRONTO_PARA_ANUNCIO
  → ANUNCIADO
  → EM_LEILAO
```

### `veiculos.status` — o status comercial

```
CADASTRADO → EM_VISTORIA → EM_AVALIACAO → AGUARDANDO_PAGAMENTO
  → (desvios) PAGAMENTO_NAO_REALIZADO | ENCERRADO_SEM_OFERTAS | ENCERRADO_SEM_MINIMO
  → AGUARDANDO_ENTREGA → VENDA_CONCLUIDA
```

> Um veículo pode estar `status_analise='EM_LEILAO'` e `status='AGUARDANDO_PAGAMENTO'` ao
> mesmo tempo: o primeiro diz onde ele está no funil, o segundo diz o que está acontecendo
> com a venda.

### Publicação

Só entra em canal se `status_analise ∈ STATUS_APTOS`:

```ts
export const STATUS_APTOS = ["PRONTO_PARA_ANUNCIO", "ANUNCIADO", "EM_LEILAO"];
```

---

## 5. Ciclo de vida dos lances

`leiloes.status` ∈ `RASCUNHO | AGENDADO | ATIVO | PRORROGADO | ENCERRADO | PAUSADO | CANCELADO`

### Transições permitidas

| Transição | Quem dispara |
|---|---|
| `AGENDADO → ATIVO` | `processarCicloLeiloes` (chamado ao ler o estado do leilão) |
| `ATIVO \| PRORROGADO → ENCERRADO` | `processarCicloLeiloes` |
| `ATIVO → PRORROGADO` | prorrogação (janela padrão **120 s**, tempo padrão **120 s**) |
| `RASCUNHO \| AGENDADO \| PAUSADO → CANCELADO` | `cancelarLeilaoVeiculo` |
| `ENCERRADO` → qualquer coisa | **bloqueado** — `cancelarLeilaoAdmin` recusa |

`servarLeilaoVeiculo` (edição) só é permitido em
`{RASCUNHO, AGENDADO, ATIVO, PRORROGADO, PAUSADO}`.

### Regras do lance (`registrarLance`, `src/db/leilao.server.ts`)

O lance é a operação mais sensível do sistema. Ela valida, nesta ordem:

1. **O credor pode dar lances?** `pode_dar_lances` verdadeiro (aprovado + cadastro completo + PJ).
2. **O leilão está ATIVO (ou PRORROGADO)?**
3. **O veículo está `EM_LEILAO`?**
4. **O valor é maior que o lance atual** (+ incremento mínimo).
5. **O valor não é menor que o lance inicial.**
6. **O comprador não é o próprio vendedor / não é o dono do veículo.**
7. **O lance não é duplicado** do mesmo comprador no mesmo valor.

Cada violação tem uma mensagem específica — **não troque as mensagens de erro**, elas são o
contrato com o front.

---

## 6. Motor de disparo de WhatsApp

### A máquina de estados da fila

`whatsapp_mensagens.estado_fila`:

```
PENDENTE ──reserva──→ RESERVADA ──envio ok──→ ENVIADA
   ↑                      │
   │                  falha│
   │                      ↓
   └──超时 volta ────  FALHOU  (retry até 5x, backoff 1/2/4/8/16 min)
                          │
                          └──canal incompatível──→ IGNORADA
```

**Constantes** (`src/db/disparo-motor.server.ts`):

| Constante | Valor | Por quê |
|---|---|---|
| `LOTE` | 20 | Tamanho do lote por rodada |
| `RESERVACA_PENDENTE_MIN` | 10 | Reserva antiga volta para `PENDENTE` |
| `MAX_TENTATIVAS` | 5 | Tentativas antes de desistir |
| `FUSO_OPERACAO` | `America/Sao_Paulo` | Janela de trabalho (o server roda em UTC!) |

**Concorrência:** a reserva usa `FOR UPDATE SKIP LOCKED` — duas instâncias do servidor nunca
enviam a mesma mensagem. É o que permite escalar horizontalmente sem duplicar envio.

> ⚠️ **Não confunda `estado_fila` com `status`.**
> `estado_fila` ∈ `PENDENTE | RESERVADA | ENVIADA | FALHOU | IGNORADA` — é o **nosso** motor.
> `status` ∈ `NA_FILA | ENVIADA | ENTREGUE | LIDA | FALHOU` — é o que o **webhook da Meta**
> escreve. Uma mensagem pode estar `estado_fila='ENVIADA'` e `status='NA_FILA'`.

### Canais

| `canal_envio` | Template | Grupos | Observação |
|---|---|---|---|
| `META` | Obrigatório, precisa estar **aprovado** na Meta | ❌ | Texto livre é rejeitado |
| `UAZAPI` | Não | ✅ (`@g.us`) | Único que aceita `grupos_alvo` |

Enviar texto livre no canal `META` **falha**. Se a campanha usa `META`, o `template_id` é
obrigatório e o template tem que estar aprovado.

---

## 7. Cobrança e pagamento (PIX)

`pagamentos.status` ∈ `AGUARDANDO | PROCESSANDO | PAGO | FALHOU | DUPLICADO | DIVERGENCIA | EXPIRADO | CANCELADO`

- **Idempotência por `id_externo`**: a mesma cobrança externa nunca é processada duas vezes.
- **`verificarPagamentoFn` NUNCA confirma.** Ela apenas **consulta** o provedor e devolve o
  que ele respondeu. A confirmação vem do webhook ou de `confirmarPagamentoManualFn`.
- Vencida: `gerarNovaCobrancaFn` ou `prorrogarPrazoPagamentoFn` reabrem a cobrança.
- `expirarCobrancasFn` marca `EXPIRADO` nas vencidas.

> ⚠️ O único provedor de PIX registrado hoje é `interno-homologacao`
> (`src/db/provedores/pix.server.ts`). `getProvider()` **sempre** devolve esse. Para
> produção é preciso plugar o provedor real e configurar a confirmação manual.

---

## 8. Negociação e repasse

### Negociação

```
AGUARDANDO_PAGAMENTO → PAGAMENTO_EM_PROCESSAMENTO → PAGAMENTO_CONFIRMADO
  → LIBERADO_PARA_REPASSE → CONCLUIDA
```
Desvios: `PAGAMENTO_NAO_REALIZADO`, `CANCELADA`.

### Repasse

`AGUARDANDO → AUTORIZADO → CONCLUIDO`, com `FALHOU` como falha reautorizável.

- **Um repasse por negociação** (unicidade).
- Autorizar e confirmar usam `SELECT ... FOR UPDATE` — **lock pessimista** para não pagar duas
  vezes.
- Auditoria em `financeiro_auditoria`, lançamento em `movimentos_financeiros`.

---

## 9. Contrato de consignação

```
GERADO → ENVIADO → VISUALIZADO → ASSINADO
                                  ├→ RECUSADO
                                  ├→ EXPIRADO
                                  └→ CANCELADO
```

**Regra de elegibilidade:**

```ts
elegivelParaAvancar = complianceStatus === 'APROVADO' && contrato.status === 'ASSINADO';
```

Sem compliance aprovado do vendedor, o contrato não avança.

### Termos e aceite eletrônico

O aceite é gravado com `conteudo_hash`, `versao`, `ip`, `user_agent` e `assinatura`
(MP 2.200-2/2001, art. 10 §2º). Tipos: `VENDEDOR` e `COMPRADOR`. O hash garante que o texto
aceito é exatamente o vigente.

---

## 10. Entrega

Fluxo com **código de confirmação**:

```
agendar → confirmar agendamento → iniciar entrega → registrar chegada
  → validar código → registrar entrega → confirmar recebimento
```

Desvios tratados explicitamente: **divergência** (com decisão do admin) e **não comparecimento**.

---

## 11. Depreciação

Pipeline: **base FIPE** → ajuste por **KM** → desconto pelo **grau do checklist**
(Leve `0.6x` / Médio `1.0x` / Grave `1.8x`) → **valorização por acessórios** → **margem de
segurança** (8% padrão) → comparação com o **interesse declarado pelo vendedor**.

O seller pode sobrescrever o ajuste (`sobrescreverAjusteFn`), mas o valor original fica
registrado.

---

## 12. Publicação

Canais: `ANUNCIO`, `VITRINE`, `WHATSAPP`. Um veículo pode estar em vários ao mesmo tempo.

O canal WhatsApp gera um **token público** (`/c/$token`) para enviar o veículo por link.
`revogarTokenCanal` desativa o link.

---

## 13. IA

Verificação de documentos por visão e leitura de placa em foto.

> **A IA nunca bloqueia o fluxo.** Se não houver chave configurada, ou a chamada falhar, o
> sistema **segue sem a validação** e apenas registra o motivo. O compliance continua
> precisando de decisão humana.

---

## 14. Erros da Meta — classificação

| Tipo | Códigos | Tratamento |
|---|---|---|
| **Transiente** | 5xx, 429, `131056` (rate limit) | Retry com backoff; a mensagem volta para `PENDENTE` |
| **Permanente** | `131047`, `132000`, `131026` | Marca `FALHOU` de vez |

Erros específicos já tratados:

| Erro | Causa | Correção |
|---|---|---|
| `132012` | "Parameter format does not match format in the created template" | A ordem dos componentes não bate com o template aprovado. Ordem esperada: **HEADER → BODY → FOOTER → BUTTONS** |
| `132018` | Botão com `parameters` vazio | Remova o `parameters` do botão |
| `131056` | Rate limit | Envio em massa. Use o motor de dripping (lote 20) |

**Template aprovado é imutável na Meta.** Para mudar o texto, cria-se outro template.

**`image.id` e `document.id` precisam ser inteiros.** O endpoint `/media` devolve um handle
alfanumérico; é preciso converter para o id numérico.

---

## 15. Ações sensíveis (superadmin)

Apenas 4 ações exigem o código OTP do superadmin:

- `PROMOVER_SUPERADMIN`
- `EXCLUIR_VEICULO_FORCADO`
- `EXCLUIR_PERFIL_FORCADO`
- `RESET_BASE_OPERACIONAL`

O guard é `superadminDaSessao()` = `role='admin'` **e** ativo **e** protegido.

---

## 16. Checklist resumido para um novo dev

- [ ] Leitura de valor só se `pode_ver_valores`.
- [ ] Lance só se `pode_dar_lances` (aprovado + cadastro completo + **PJ**).
- [ ] `status_compliance` controls o acesso comercial — não o `role`.
- [ ] `etapa_cadastro` nunca regride.
- [ ] Progresso 100% exige **zero** pendências.
- [ ] Reprovar/pender força `cadastro_completo=false`.
- [ ] Leilão encerrado é final.
- [ ] `estado_fila` ≠ `status` no WhatsApp.
- [ ] `verificarPagamentoFn` não confirma.
- [ ] Repasse: um por negociação, com lock pessimista.
- [ ] IA falha → segue o fluxo.
- [ ] Canal `META` exige template aprovado e não aceita grupo.

---

**Próximo:** [05-modelo-dados.md](05-modelo-dados.md)
