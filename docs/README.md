# Documentação Técnica — Esse Já Foi

Plataforma de compra e venda de veículos usados: do lead de marketing até a venda concluída.

Este é o **ponto de entrada** para um novo programador assumir o sistema. Comece por aqui e depois
vá para o documento específico do módulo que você vai mexer.

| Documento | O que você encontra |
|---|---|
| [01-arquitetura.md](01-arquitetura.md) | Stack, estrutura de pastas, como o dado circula, deploy, variáveis de ambiente |
| [02-modulos.md](02-modulos.md) | Inventário de todos os módulos e telas do sistema |
| [03-funcoes.md](03-funcoes.md) | Referência das ~400 server functions, agrupadas por domínio |
| [04-regras-negocio.md](04-regras-negocio.md) | **As regras que o sistema respeita** — permissões, estados, validações |
| [05-modelo-dados.md](05-modelo-dados.md) | As ~90 tabelas, o que cada uma guarda e como se relacionam |
| [06-integracoes.md](06-integracoes.md) | Meta, Uazapi, Supabase, OpenAI, Conferi, PIX, SMTP, FIPE |
| [07-convencoes.md](07-convencoes.md) | Padrões de código, como adicionar algo novo, armadilhas conhecidas |

**Status:** Beta Operacional • **Última revisão:** 2026-10-20

---

## Em 90 segundos: o que o sistema faz

```
Lead (campanha WhatsApp / anúncio / indicação)
   │
   ├─→ Vendedor se cadastra  ──→ cadastra o veículo
   │        │
   │        └─→ Vistoria técnica (app do vistoriador) ──→ Laudo
   │                 │
   │                 └─→ Análise pós-vistoria ──→ proposta de valor ao vendedor
   │                          │
   │                          └─→ Vendedor aceita → veículo fica PRONTO_PARA_ANUNCIO
   │                                   │
   │                                   └─→ Publicação (vitrine + anúncio + link WhatsApp)
   │                                            │
   │                                            └─→ Sala de lances (ofertas de compradores PJ)
   │                                                     │
   │                                                     └─→ Negociação → Pagamento PIX
   │                                                              │
   │                                                              └─→ Entrega (código de confirmação)
   │                                                                       │
   │                                                                       └─→ Repasse ao vendedor
   │                                                                            └─→ Venda concluída
   │
   └─→ Comprador se cadastra ──→ vê a vitrine ──→ dá lances ──→ negocia
```

---

## Os 5 fatos que você precisa saber antes de mexer em qualquer coisa

1. **O banco não é o `schema/index.ts`.** O schema real é criado por ~25 funções
   `ensure*Schema()` que rodam `CREATE TABLE IF NOT EXISTS` em SQL puro. Se você adicionar uma
   coluna, ela vai num `ensure*Schema()` — não no Drizzle. Detalhes em
   [05-modelo-dados.md](05-modelo-dados.md).

2. **A sessão é própria, não do Supabase.** A identidade do usuário vem de um cookie httpOnly
   (`ejf_sessao`) com token HMAC-SHA256 de 12h, assinado com `SESSION_SECRET`. Por isso a RLS
   (Row Level Security) do Postgres está **desligada** nas tabelas `lances` e `leiloes` — a
   autorização é feita na aplicação. Ver [04-regras-negocio.md](04-regras-negocio.md).

3. **Toda chamada do cliente passa por server function.** Não existe chamada direta do front ao
   banco. O padrão é `src/lib/*.functions.ts` (valida com Zod) → `src/db/*.server.ts` (regra +
   SQL). Nunca escreva SQL em um `.functions.ts`.

4. **A regra comercial está em 4 flags**, não no `role`:
   `pode_ver_valores`, `pode_dar_lances`, `cadastro_completo` e `status_compliance`.
   Um `admin` não ganha acesso comercial; um `comprador` com `APROVADO` ganha.

5. **O motor de disparo de WhatsApp é dripping, não envio em massa.** Lotes de 20, com
   reserva pessimista no banco (`FOR UPDATE SKIP LOCKED`) para não duplicar entre instâncias.
   Mandar tudo de uma vez derruba a qualidade da conta na Meta (erro 131056).

---

## Onde tudo mora

```
src/
├── routes/          # 92 rotas (arquivo = rota). src/routes/admin/* = backoffice
├── components/      # 17 pastas por domínio (admin, vendedor, vistoriador, ...)
├── lib/             # *.functions.ts = camada de API (server functions). *.server.ts = regra/SQL
├── db/              # 60+ arquivos: um por módulo, com o ensure*Schema() dele
├── hooks/           # use-auth (login/logout), use-mobile, use-salvamento
├── integrations/    # Supabase (gerado)
└── routeTree.gen.ts # gerado pelo TanStack Router — não editar
```
