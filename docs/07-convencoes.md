# 07 — Convenções e armadilhas

**Status:** Beta Operacional • **Última revisão:** 2026-10-20

Como o código é escrito neste repositório, como adicionar coisas novas e — o mais importante —
**onde o sistema pode te bite**.

---

## 1. Convenções de código

| Aspecto | Padrão |
|---|---|
| Server function | `src/lib/<modulo>.functions.ts`, `createServerFn({ method: "POST" })` |
| Regra + SQL | `src/db/<modulo>.server.ts` |
| Validação | Zod dentro de `.inputValidator(...)` — sempre |
| Nomes de export | `algoFn` (ação/query) — o `Fn` é o padrão do projeto |
| UI | Tailwind v4 + shadcn/ui em `src/components/ui/` |
| Toast | `sonner` |
| Máscaras | `src/lib/brasil.ts` |
| Query de CEP | `src/lib/viacep.ts` |
| Estado de auth no client | `useAuthStore` (Zustand) em `src/hooks/use-auth.ts` |
| Idioma do código | português (variáveis, mensagens, comentários) |
| Erro de regra | `throw new Error("Mensagem em português.")` — a mensagem é o contrato com o front |

### Idioma

O código inteiro é em português: nomes de função, de variável, de coluna e as mensagens de
erro. **Continue assim.** As mensagens de erro de regra de negócio são lidas pelo usuário final
no toast — não as reescreva em inglês nem as mude sem revisar quem consome.

---

## 2. Como adicionar algo novo

### Uma server function

```ts
// src/lib/meumodulo.functions.ts
export const salvarMeuDadoFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    nome: z.string().min(3),
  }))
  .handler(async ({ data }) => {
    const usuario = await usuarioDaSessao();
    if (!usuario) throw new Error("Não autorizado.");
    return await salvarMeuDadoDb(data, usuario);   // ← src/db/meumodulo.server.ts
  });
```

Regras:
1. **Valide com Zod** — nunca confie no front.
2. **Pegue a sessão** — `usuarioDaSessao()` / `perfilDaSessao()`.
3. **Delegate** ao `.server.ts`. O `.functions.ts` **não** escreve SQL.
4. **Mensagens de erro** em português, explícitas sobre o que falta.

### Uma rota

1. Crie o arquivo em `src/routes/` — **o nome do arquivo é a URL**:
   - `admin/veiculos.tsx` → `/admin/veiculos`
   - `comprador_.cadastro.tsx` → `/comprador/cadastro` (o `_` **quebra** o layout do pai)
   - `vendedor.veiculo.$id.tsx` → `/vendedor/veiculo/$id` (`.` = hierarquia)
2. **Não edite `routeTree.gen.ts`** — é gerado. O build regenera.
3. Se a rota é do backoffice, o layout `/admin` já cuida do guard de sessão.

### Uma coluna

1. Abra o `ensure*Schema()` do módulo dono da tabela.
2. `ALTER TABLE <tabela> ADD COLUMN IF NOT EXISTS <coluna> <tipo>;`
3. Se precisa de backfill, o `UPDATE ... WHERE coluna IS NULL` vem logo depois.
4. **Não** edite `src/db/schema/index.ts` esperando efeito.

### Uma tabela

1. `CREATE TABLE IF NOT EXISTS` no `ensure*Schema()` do módulo.
2. Ídices no mesmo lugar.
3. Se quiser que o drizzle-kit reflita, adicione também no `src/db/schema/index.ts` — mas
   lembre: **não afeta runtime**.

---

## 3. Onde a autorização é (e não é) checada

Esta é a área mais delicate do sistema. Entenda antes de mexer.

### O que é seguro

- O cookie é httpOnly → **não dá para forjar o role no browser**.
- `superadminDaSessao()` é um guard robusto: exige `role='admin'` **e** `ativo` **e**
  `protegido`.
- As 4 ações críticas exigem OTP.
- `consulta-logs.functions.ts` valida `role === 'admin'` no servidor.
- **Desde 2026-10-20** os arquivos de backoffice `admin.functions.ts`, `logs.functions.ts`,
  `relatorios.functions.ts`, `demo.functions.ts`, `admin-checklist.functions.ts` e
  `marketing.functions.ts` exigem guard de servidor em **todas** as server fns. São dois níveis:

```ts
// Leitura de backoffice: admin OU operador (ambos caem em /admin no login).
const { adminOuOperacaoDaSessao } = await import("@/lib/sessao.server");
await adminOuOperacaoDaSessao();

// Escrita / ação destrutiva: só admin ativo.
const { adminDaSessao } = await import("@/lib/sessao.server");
await adminDaSessao();
```

O guard fica **dentro** do `try` do handler: a falha vira `{ ok: false, message }`, que é o
formato que as telas já sabem exibir, em vez de uma exceção crua.

### O que NÃO é seguro

> ⭐ **Ainda há server functions de backoffice sem guard de servidor** — em especial
> `admin-compliance.functions.ts`, `vendedores-compliance.functions.ts`,
> `admin-compradores.functions.ts`, `financeiro.functions.ts`, `pagamentos.functions.ts` e
> `admin-veiculos.functions.ts`. Elas confiam apenas no guard **client-side** do `AdminLayout`.
> As de maior risco: as de **dinheiro** (`autorizarRepasseFn`, `confirmarConclusaoRepasseFn`,
> `salvarDadosBancariosFn`, `confirmarPagamentoManualFn`) e as de **compliance/publicação**
> (`atualizarComplianceFn`, `aprovarParaPublicacaoFn`) — nenhuma delas aceita `adminId` do
> corpo: devem vir da sessão.

Os guards de rota (`AdminLayout.tsx:317`, `vendedor.tsx:32`, `comprador.tsx:30`) verificam
**apenas se há sessão**, não o role. `vistoriador.tsx` **não tem guard nenhum**. As únicas duas
telas que checam role no client são `veiculos.index.tsx` e `veiculos.$slug.tsx`
(`role === 'comprador'`).

**Consequência concreta:** um `vendedor` ou `comprador` autenticado que chame
`listarVendedoresFn` direto no console **vai passar**. O cookie httpOnly impede forjar o role,
mas não impede usar a função errada.

**O que fazer:** ao tocar uma função admin, **adicione** a checagem — usando os helpers de
[src/lib/sessao.server.ts](src/lib/sessao.server.ts) (`adminDaSessao` ou
`adminOuOperacaoDaSessao`), **não** `perfilDaSessao()` com comparação manual de role: o helper
centraliza a regra e já devolve a mensagem certa.

Não é opcional — é o que fecha o buraco.

---

## 4. Armadilhas conhecidas

### A. Migração é lazy e best-effort

- Não há `npm run migrate`. `migrateDb()` roda na **primeira server function** que o toca.
- Erro em `ensure*Schema()` é **engolido** e só loga. A tabela simplesmente não existe e o
  problema aparece depois, no uso.
- **Antes de mexer no schema, rode o app e veja se a tabela foi criada.**
- `SKIP_MIGRATIONS=true` desliga tudo — útil em ambiente controlado, perigoso em produção.

### B. `src/db/schema/index.ts` mente

Declara 8 tabelas e usa defaults divergentes (ex.: `leiloes.status` default `'agendado'`
em minúsculas). **O runtime usa os valores em maiúsculas gravados pelo `ensureLeilaoSchema()`.**
Não tire conclusões de schema a partir desse arquivo.

### C. Não existe `drizzle.config.ts`

Não dá para rodar `drizzle-kit generate`/`migrate` a partir do projeto. As 5 migrações em
`drizzle/` são fixas.

### D. Provedor PIX de homologação (por enquanto, de propósito)

`getProvider()` sempre devolve `interno-homologacao`. **Nunca confirma sozinho.** Todo
pagamento depende de `confirmarPagamentoManualFn` ou do webhook.

**Não é defeito — é escopo futuro.** O provedor real ainda vai ser implementado. A troca é
contida porque tudo passa por `getProvider()`. Se alguém "consertar" isso chamando a
confirmação dentro de `verificarPagamentoFn`, quebra a idempotência — a confirmação é sempre
do webhook ou manual.

### E. `estado_fila` ≠ `status` no WhatsApp

Duas colunas de estado, dois donos:
- `estado_fila` — o **motor** (`PENDENTE | RESERVADA | ENVIADA | FALHOU | IGNORADA`)
- `status` — o **webhook da Meta** (`NA_FILA | ENVIADA | ENTREGUE | LIDA | FALHOU`)

Consultar o estado errado mostra a fila "pronta" quando a mensagem já foi entregue, ou o
contrário.

### F. `verificarPagamentoFn` não confirma

Ela **consulta** o provedor. Confirmar é `confirmarPagamentoManualFn` ou o webhook. Se você
chamar `verificarPagamentoFn` esperando confirmação de pagamento, o fluxo trava.

### G. Fuso horário

O motor de disparo avalia a janela de trabalho em `America/Sao_Paulo` (`FUSO_OPERACAO`). O
container roda em **UTC** — sem essa constante, toda campanha dispara 3h adiantado.

### H. Arquivos no Postgres

`arquivos_upload.conteudo` é `bytea`. Sem S3. Upload máximo **10 MB**. Isso pesa no banco.

### I. IA nunca bloqueia

Falha da OpenAI não interrompe o fluxo. Se você "corrigir" isso, uma indisponibilidade da
OpenAI paralisa vistoria e publicação.

### J. `repasse_liberado` vs `entrega_status`

O repasse depende de `repasse_liberado` **ou** `entrega_status === 'LIBERADO_PARA_REPASSE'`.
**Confirme** que `entregas.server.ts` sempre seta `repasse_liberado` antes de mexer no fluxo
financeiro — é o ponto onde uma entrega mal gravada vira repasse não liberado (ou liberado sem
entrega).

### K. `etapa_cadastro` é monotônica

Usa `GREATEST`. Não dá para "voltar" uma etapa por bug — mas também **não dá para corrigir um
salvamento errado** sem mexer no banco. É intencional (retomar cadastro sem perder progresso).

### L. `elapsed` de upload por multipart

`/api/public/upload` **não** recebe base64 — usa `multipart/form-data`
(`request.formData()` + `file.arrayBuffer()`). O corpo do request cresce ~33% além do arquivo
(multipart overhead), então 10 MB de arquivo viram ~13 MB de corpo. O limite de **10 MB
(`MAX_BYTES`)** existe e é checado — não o remova sem considerar o memory limit do container.

### M. Autorização: a lista de arquivos é maior do que parece

A varredura encontrou **43 arquivos** de server functions sem verificação de role no
servidor — não só `admin*.functions.ts`, `admin-veiculos.functions.ts`,
`relatorios.functions.ts`, `logs.functions.ts` e `marketing.functions.ts`, como sugere o
trecho acima.

Detalhe importante: as **4 ações críticas que exigem OTP** não cobrem o caminho normal de
exclusão — `excluirPerfilFn` (`src/lib/admin.functions.ts:108`) **não tem role nem OTP**.

---

## 5. Verificação antes de commitar

```bash
npm run build                      # precisa terminar com "vite: build ok"
./node_modules/.bin/tsc --noEmit   # baseline: 16 erros pré-existentes
```

> ⚠️ O `tsc --noEmit` **já falha** com 16 erros pré-existentes. **Não use "zero erros" como
> critério de sucesso** — compare com o baseline. Se aparecer erro novo, ele é seu.

Verifique também, antes de dar merge:

- [ ] A função nova valida a sessão?
- [ ] A função nova valida o **role**, se é admin?
- [ ] A entrada é validada com Zod?
- [ ] A regra de negócio está no `.server.ts`, não no `.functions.ts`?
- [ ] A coluna nova entrou no `ensure*Schema()` certo?
- [ ] A mensagem de erro está em português e diz o que fazer?
- [ ] O `routeTree.gen.ts` não foi editado à mão?
- [ ] O build passou?

---

## 6. Glossário

| Termo | Significado |
|---|---|
| **Lance** | Oferta de um comprador por um veículo em lance (não é "leilão" no jargão do usuário) |
| **Vitrine** | A listagem de veículos em lance (exige login de comprador) |
| **Dossiê** | A tela de detalhe de um vendedor/comprador/veículo no backoffice |
| **Pós-vistoria** | A etapa de análise que transforma laudo em proposta de valor |
| **Compliance** | A análise documental do vendedor/comprador |
| **Repasse** | O pagamento ao vendedor depois da venda |
| **Canal** | Um meio de publicação (vitrine, anúncio, WhatsApp) |
| **Segmento** | Um recorte da base de contatos para campanha |
| **Dripping** | Envio em lotes escalonados (motor de disparo) |

---

**Voltar ao [índice](README.md)**
