# 01 — Arquitetura

**Status:** Beta Operacional • **Última revisão:** 2026-10-20

---

## 1. Stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Framework | **TanStack Start v1** (React 19 + SSR) | Roteamento por arquivo em `src/routes/` |
| Router | TanStack Router | `routeTree.gen.ts` é **gerado** — nunca edite à mão |
| Data fetching | TanStack React Query | |
| Banco | **PostgreSQL** + Drizzle ORM (`postgres-js`) | Schema real criado por `ensure*Schema()` (ver §5) |
| Validação | Zod | Dentro dos server functions |
| Estilo | Tailwind CSS v4 + shadcn/ui (Radix) | |
| IA | OpenAI (visão) | Validação de documentos e leitura de placa em foto |
| Auth | **Sistema próprio** (HMAC + cookie httpOnly) | ⚠️ Não é Supabase Auth — ver §4 |
| Deploy | Docker multi-stage → Easypanel | Node 22, porta 3000 |

---

## 2. Estrutura de pastas

```
src/
├── routes/                    # 92 arquivos de rota
│   ├── __root.tsx             # shell da aplicação (layout, toasts, providers)
│   ├── index.tsx              # landing page pública
│   ├── admin.tsx              # LAYOUT do backoffice (menu lateral)
│   ├── admin/                 # 36 telas administrativas
│   ├── api/public/            # webhooks + upload (upload.ts, arquivo.$id.ts)
│   ├── comprador/             # 8 telas do painel do comprador
│   ├── vendedor.*             # 12 telas do painel do vendedor
│   ├── vistoriador.*          # 7 telas do app de vistoria
│   ├── c.$token.tsx           # link privado de veículo por token
│   ├── v.$token.tsx           # link de vistoria por token
│   └── veiculos.*             # vitrine (exige login de comprador)
│
├── components/                # 17 pastas: admin, comprador, contratos, entrega,
│                              # layout, negociacao, onboarding, publicacao, shared,
│                              # ui, veiculo, vendedor, vistoria, vistoriador
│
├── lib/                       # CAMADA DE API + UTILITÁRIOS
│   ├── *.functions.ts         # ~400 server functions (createServerFn) — a API do front
│   ├── sessao.server.ts       # cookie de sessão (identidade do usuário)
│   ├── brasil.ts, viacep.ts, tempo.ts, validators.ts, utils.ts
│   └── superadmin.functions.ts, automacoes.functions.ts, ...
│
├── db/                        # 60+ arquivos — UM POR MÓDULO
│   ├── index.ts               # conexão + migrateDb() + ensureSuperAdmin()
│   ├── schema/index.ts        # ⚠️ NÃO é a fonte de verdade do schema
│   ├── leilao.server.ts       # regra + SQL do módulo leilão
│   ├── disparo-motor.server.ts# motor de dripping do WhatsApp
│   └── ...
│
├── hooks/                     # use-auth, use-mobile, use-online, use-salvamento
├── integrations/supabase/     # cliente Supabase (arquivos gerados)
├── routeTree.gen.ts           # ⚠️ GERADO — não editar
├── router.tsx, server.ts, start.ts
└── styles.css
```

### A regra de três camadas

Toda escrita no banco segue este caminho. **Nunca pule uma camada.**

```
Componente React
      │  chama (via useServerFn ou import direto)
      ▼
src/lib/xxx.functions.ts      ← valida com Zod, valida sessão/permissão, delega
      ▼
src/db/xxx.server.ts          ← regra de negócio + SQL (drizzle sql`` ou drizzle-orm)
      ▼
PostgreSQL
```

- O `.functions.ts` **não** escreve SQL. Se precisar, ele chama o `.server.ts`.
- O `.server.ts` **não** valida `role` de usuário (ele não sabe quem está chamando) — a
  autorização fica na camada de cima. Exceções: `superadminDaSessao()`.

---

## 3. Como uma requisição sai do browser

1. O componente chama uma server function importada de `src/lib/*.functions.ts`.
2. A função roda **no servidor** (Nitro). Ela:
   - valida a entrada com o schema Zod (em `.inputValidator(...)`);
   - lê a sessão pelo cookie `ejf_sessao` (`usuarioDaSessao()` / `perfilDaSessao()`);
   - delega ao `src/db/*.server.ts`.
3. O `.server.ts` executa o SQL e devolve o dado.
4. A função retorna o resultado tipado ao componente.

Não existe chamada direta do browser ao banco, nem token em `localStorage`.

---

## 4. Autenticação e sessão

### O modelo

O app **não usa Supabase Auth**. O login valida e-mail + senha contra `profiles`, gera um token
HMAC-SHA256 de 12h e grava o cookie httpOnly `ejf_sessao`.

```
src/lib/sessao.server.ts
├── COOKIE_SESSAO = "ejf_sessao"   (httpOnly, sameSite=lax, secure em produção, 12h)
├── definirSessao(token)            # grava o cookie (login/cadastro)
├── encerrarSessao()                # apaga (logout)
├── usuarioDaSessao()               # → userId | null
├── perfilDaSessao()                # → perfil completo | null
└── superadminDaSessao()            # → exige role='admin' + ativo + protegido
```

O token é gerado em `src/db/auth.server.ts` (`issueToken` / `verifyToken`) e assinado com
`SESSION_SECRET`.

### Por que isso importa

- **RLS desligada** nas tabelas `lances` e `leiloes` — o `ensureLeilaoSchema()` faz
  `DROP POLICY` e `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`. A autorização é **100% na
  aplicação**. Se você adicionar uma tabela sensível, replicate esse cuidado.
- O cookie é httpOnly → o JS do browser não enxerga o token. Não existe estado dessincronizado
  entre client e server (bug antigo que travava o admin de conversas).
- `src/integrations/supabase/*` existe como cliente gerado, mas o app o usa só como
  storage/admin auxiliar (laudos, financeiro). Não é o login.

### Papéis (RBAC)

`profiles.role` ∈ `admin | operacao | vistoriador | comprador | vendedor`.

| Papel | Onde opera |
|---|---|
| `admin` | Backoffice completo |
| `operacao` | Acompanha o fluxo administrativo |
| `vistoriador` | App de execução de vistoria (`/vistoriador`) |
| `vendedor` | Painel do vendedor |
| `comprador` | Painel do comprador + vitrine + lances |

⚠️ **Risco conhecido:** a checagem de `role` não é sistemática nas server functions. Várias
funções admin chamam o SQL direto sem validar `role === 'admin'`. O único guard robusto é
`superadminDaSessao()`. **Se você for mexer em função admin, adicione a checagem.**

### Guardas de rota são client-side — e checam sessão, não role

Os guards de layout (`AdminLayout.tsx:317`, `vendedor.tsx:32`, `comprador.tsx:30`) verificam
**apenas se há sessão**. `vistoriador.tsx` **não tem guard nenhum**. As únicas duas telas que
checam `role` no client são `veiculos.index.tsx` e `veiculos.$slug.tsx` (`role === 'comprador'`).

Como o cookie é httpOnly, não dá para forjar o role no browser — mas **dá para chamar a server
function errada**. A validação real de autorização precisa estar no servidor. Detalhes e a
correção sugerida em [07-convencoes.md §3](07-convencoes.md).

---

## 5. Banco de dados: onde o schema realmente mora

Este é o ponto que mais surpreende quem chega hoje.

### Duas mecanismos coexistem

| Onde | O que é | Quando roda |
|---|---|---|
| `src/db/schema/index.ts` | Schema Drizzle declarativo — **8 tabelas apenas** | Só pelo drizzle-kit (não é usado em runtime) |
| `src/db/*.server.ts` → `ensure*Schema()` | ~25 funções com SQL `CREATE TABLE IF NOT EXISTS` | Na primeira chamada do módulo |
| `drizzle/*.sql` | 5 migrações formais (`0000`…`0004`) | Em `migrateDb()` — **lazy**, na 1ª server function |

> A pasta `supabase/migrations/` (10 arquivos SQL) é **vestigial** — o app em runtime não
> depende dela.

### `migrateDb()` (src/db/index.ts)

```
migrateDb()
├── sem DATABASE_URL → log e retorna
├── se SKIP_MIGRATIONS === 'true' → retorna (não migra)
├── aplica drizzle/0000..0004
├── pg_advisory_lock(918273645)     ← serializa instâncias concorrentes
├── chama ~25 ensure*Schema() em ordem
├── ensureSuperAdmin()              ← garante o admin inicial
└── (libera o lock)
```

O `pg_advisory_lock` existe porque o deploy pode subir 2+ containers ao mesmo tempo; sem ele,
ambos tentariam criar a mesma tabela.

⚠️ **A migração roda de forma lazy, não no boot.** Não existe script `npm run migrate` e
`src/server.ts` não importa `migrateDb`. Ela é chamada na **primeira server function** que a
toca (`getActiveAuctions`, `admin-compradores`, `comprador`). Na prática, a primeira requisição
paga o custo de criação do schema — e é por isso que o primeiro acesso a um módulo novo pode
ser lento.

⚠️ **A migração é best-effort.** Erro dentro do bloco de `ensure*` é engolido e só loga
"❌ Falha na migração". A tabela correspondente simplesmente não é criada, e o erro só aparece
depois, no uso.

⚠️ **Não existe `drizzle.config.ts`** no repositório — as 5 migrações em `drizzle/` foram
geradas uma vez e não dá para rodar `drizzle-kit` a partir do projeto.

### `ensure*Schema()` — a parte que importa no dia a dia

Cada módulo garante seu próprio schema na primeira chamada. O padrão é:

```ts
export async function ensureLeilaoSchema() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS leiloes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ...
      status text DEFAULT 'RASCUNHO'
    )`);
  // colunas novas entram como ALTER TABLE ... ADD COLUMN IF NOT EXISTS
  await db.execute(sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS xyz text`);
}
```

**Como adicionar uma coluna nova:**

1. Abra o `ensure*Schema()` do módulo dono da tabela.
2. `ALTER TABLE <tabela> ADD COLUMN IF NOT EXISTS <coluna> <tipo>`.
3. Se a coluna tiver backfill, inclua um `UPDATE ... WHERE coluna IS NULL`.
4. **Não** edite `src/db/schema/index.ts` esperando efeito — ele não é o fonte de verdade.
5. Se a coluna precisar de valor padrão, use `DEFAULT` no ALTER — o Postgres preenche as linhas
   existentes.

### Convenções de tipo

| Conceito | Como é guardado |
|---|---|
| Moeda | `numeric` (sempre ler como string no drizzle e converter) |
| Data/hora | `timestamptz` |
| Booleano | `boolean` (nunca `smallint`) |
| Enum | `text` + constraint `CHECK` ou lista validada em TS (padrão do projeto) |
| Estado de fila | `text` default `'PENDENTE'` |
| JSON | `jsonb` |
| Imagem | `text` com `data:` URL base64 (não há storage de objetos) |

---

## 6. Front-end

- **Mobile-first.** O app do vistoriador é pensado para celular, em campo.
- **Tailwind v4** com tokens em `src/styles.css`. Componentes em `src/components/ui/` são
  shadcn/ui.
- **Formulários**: validação client-side antes de chamar a server function (evita round-trip
  desnecessário) e a validação real no Zod do servidor.
- **Toasts**: `sonner`.
- **Máscaras**: helpers em `src/lib/brasil.ts` (`maskCep`, `maskDocumento`, `maskCelular`).
- **Query de CEP**: `src/lib/viacep.ts` (`buscarCep`) — preenche endereço automaticamente.

### `useServerFn`

Usado em apenas 6 componentes, para casos em que a chamada precisa acontecer em evento
(não no render): contratos do vendedor, proposta de veículo, vistoria do vendedor e
remarcação. No resto, chamam a server function direto.

---

## 7. Deploy

### Dockerfile (multi-stage)

```dockerfile
# build
FROM node:22-slim
RUN bun install --frozen-lockfile
ENV NITRO_PRESET=node-server
RUN bun run build
RUN test -f .output/server/index.mjs     ← falha o build se o server não saiu

# runtime
FROM node:22-slim
COPY --from=build /app/.output ./.output
COPY --from=build /app/drizzle ./drizzle
ENV HOST=0.0.0.0 PORT=3000
HEALTHCHECK GET /healthz
CMD ["node", ".output/server/index.mjs"]
```

### Contrato do container

| Item | Valor |
|---|---|
| Porta | `3000` (mapeada pela plataforma) |
| Healthcheck | `GET /healthz` |
| Preset Nitro | `node-server` — **obrigatório**, senão sai como Worker e o container não abre porta |
| Build ID | `__APP_BUILD_ID__` (gerado por build) → o front detecta deploy novo e recarrega |
| Migração | **Lazy** — roda na 1ª server function, com advisory lock |
| Pastas no runtime | `.output/` **e** `drizzle/` (o migrador lê `path.join(process.cwd(), 'drizzle')`) |

### Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | ✅ | Conexão Postgres |
| `SESSION_SECRET` | ✅ | Assina o token de sessão |
| `APP_URL` / `VITE_APP_URL` | ✅ | URL pública (links, webhooks) |
| `NODE_ENV` | ✅ | `production` liga o `secure` do cookie |
| `SKIP_MIGRATIONS` | ❌ | `true` desliga a migração por completo |
| `PIX_CHAVE` | ❌ | Chave PIX do repasse |
| `PIX_WEBHOOK_SECRET` | ❌ | Valida o webhook de pagamento |
| `PORT` / `HOST` | ❌ | Default 3000 / 0.0.0.0 |

**Chaves de integração (Meta, Uazapi, OpenAI, SMTP, Conferi) NÃO ficam em variável de ambiente** —
elas são gravadas no banco, na tabela `configuracoes_sistema`, e editadas pelo admin em
**Admin > Configurações**. Isso evita redeploy para trocar chave. (Ver [06-integracoes.md](06-integracoes.md).)

---

## 8. Comandos

```bash
npm run dev       # desenvolvimento
npm run build     # build de produção
npm run preview   # roda o build
npm run lint      # ESLint
npm run format    # Prettier

# Typecheck (baseline: 16 erros pré-existentes)
./node_modules/.bin/tsc --noEmit
```

> ⚠️ O `tsc --noEmit` já falha com 16 erros pré-existentes no baseline. Não use "zero erros"
> como critério de sucesso — compare com o baseline.

---

**Próximo:** [02-modulos.md](02-modulos.md)
