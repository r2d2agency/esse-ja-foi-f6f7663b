# Documentação: Esse Já Foi

Plataforma de compra e venda de veículos usados: cadastro de vendedores/veículos, vistoria
técnica mobile-first, análise pós-vistoria, motor de depreciação, publicação (vitrine, leilão,
anúncio, WhatsApp), negociação, pagamento e entrega — do lead até a venda concluída.

**Status:** Beta Operacional • **Última revisão:** 2026-09-07

---

## 1. Arquitetura e Stack

- **Framework:** TanStack Start v1 (React 19 + SSR), roteamento por arquivo (`src/routes`)
- **Banco de dados:** PostgreSQL via Drizzle ORM (`src/db`), com `ensure*Schema()` idempotentes
  em cada módulo `*.server.ts` (criam/alteram tabelas na primeira chamada — não há migrations
  clássicas)
- **Autenticação:** Supabase Auth (JWT no header `Authorization: Bearer`), sessão do cliente em
  Zustand persistido (`localStorage`, chave `auth-storage`)
- **Estilização:** Tailwind CSS v4 + shadcn/ui (Radix)
- **IA:** OpenAI (modelos com visão, ex. `gpt-4o`) para validação de documentos e detecção de
  placa nas fotos do veículo
- **Integrações externas:** Company Conferi (consulta veicular), WhatsApp Cloud API / Meta
  (campanhas e link privado), SMTP (e-mail transacional)
- **Deployment:** Docker multi-stage (Easypanel)
- **Localização:** PT-BR, BRL, America/Sao_Paulo

Fotos hoje são armazenadas como `data:` URL (base64) direto nas colunas do banco — não há
storage de objetos (S3/Supabase Storage) configurado ainda (`src/routes/api/public/upload.ts`
documenta isso como simulação).

## 2. Papéis de usuário (RBAC)

| Papel | Como é criado | Acesso |
|---|---|---|
| `admin` | Admin > Usuários Internos | Backoffice completo |
| `operacao` | Admin > Usuários Internos | Acompanha o fluxo administrativo |
| `vistoriador` | Admin > Usuários Internos + vínculo a uma unidade (Vistorias > Cadastros) | App de execução de vistoria (`/vistoriador`) |
| `vendedor` | Fluxo público de cadastro (ou link de pré-cadastro gerado pelo admin) | Painel do vendedor |
| `comprador` | Fluxo público de cadastro (ou pré-cadastro pelo admin) | Painel do comprador, lances |

Criar um usuário com perfil "vistoriador" em Admin > Usuários **não** o vincula sozinho a uma
unidade — esse vínculo é feito depois em **Vistorias > Cadastros**, e só então ele passa a
aparecer nos horários disponíveis da Agenda.

## 3. Funil operacional (visão macro)

```
Vendedor se cadastra ──► Compliance do vendedor (docs + IA) ──► Cadastro do veículo
   ──► Compliance do veículo (CRLV + dados) ──► Liberar para vistoria
   ──► Agendar vistoria (unidade/data/horário) ──► Execução da vistoria (app do vistoriador, laudo)
   ──► Análise pós-vistoria (checklist + fotos + proposta de valor) ──► Vendedor aceita
   ──► Criar Anúncio (fotos processadas com IA: placa coberta pela logo) ──► Canais de Publicação
       (Vitrine / Leilão / Anúncio / WhatsApp) ──► Leilão encerra com lance válido
   ──► Negociação (pagamento do comprador) ──► Entrega (retirada/entrega + código de confirmação)
   ──► Repasse ao vendedor (Pagamentos) ──► Venda concluída
```

Cada etapa tem um "status" que trava a seguinte até ser cumprida — por isso a maior parte do
trabalho do admin é revisar pendências e destravar o próximo passo.

## 4. Módulos administrativos

### 4.1 Compliance

**Vendedores** (`/admin/vendedores`, `/admin/vendedor/:id`) — cadastro e aprovação documental
(CNH frente/verso, CRLV-e, comprovante de endereço, selfie). Todo documento enviado é analisado
automaticamente pela IA (confere o tipo, dá um nível de confiança e o motivo); se
"auto-reprovar" estiver ativo em Configurações, a IA já reprova sozinha quando tem certeza. O
admin assume a análise, aprova/reprova cada documento (reprovar abre uma pendência para o
vendedor) e só pode "Finalizar Análise e Aprovar" quando cadastro e documentos estiverem 100%
completos. `status_compliance`: `NAO_ENVIADO → AGUARDANDO_ANALISE → EM_ANALISE → (PENDENCIA) →
APROVADO / REPROVADO / BLOQUEADO`.

**Veículos** (`/admin/veiculos`, `/admin/veiculo/:id`) — cadastro do veículo, aprovação do
CRLV-e, dados obrigatórios (Renavam, ano, km, cor, combustível, câmbio) e mínimo de 4 fotos. A
consulta veicular (Company Conferi) traz restrições, roubo/furto, débitos e sinistro por
placa/chassi. **Liberar para vistoria** só habilita com vendedor aprovado + CRLV aprovado +
dados completos + fotos mínimas; muda `status_analise` para `PRONTO_PARA_VISTORIA`.

**Compradores** (`/admin/compradores`, `/admin/comprador/:id`) — pré-aprovação documental
(compra é restrita a pessoa jurídica), pré-cadastro direto pelo admin com senha provisória,
"Solicitar Correção" apontando a área (documentação/cadastro/endereço/comprovantes) e gestão de
acesso (reenviar senha, bloquear, excluir).

**Contratos** (`/admin/contratos`, `/admin/contrato/:id`) — geração e envio para assinatura
(e-mail, WhatsApp, portal do vendedor). Enquanto não há assinatura eletrônica integrada, o admin
registra manualmente o retorno (Assinado/Recusado/Expirado).

### 4.2 Vistoria

**Fila e Agenda** (`/admin/vistorias`) — quatro frentes na mesma tela:
- *Aguardando agendamento*: veículos `PRONTO_PARA_VISTORIA` sem data marcada — admin escolhe
  unidade, data e horário livre.
- *Agenda*: vistorias marcadas, com reagendamento.
- *Aguardando análise*: vistorias `CONCLUIDA` esperando a análise pós-vistoria.
- *Cadastros* (Unidades e Equipe): unidades credenciadas (endereço geocodificado, horário de
  atendimento, duração padrão) e vínculo vistoriador ↔ unidade.

**App Vistoriador** (`/vistoriador`) — interface mobile-first: checklist guiado por categoria,
roteiro de fotos obrigatórias (frente, traseira, laterais, interior, painel, hodômetro, motor,
porta-malas, 4 pneus), compressão de imagem no cliente antes do upload, e conclusão do laudo (o
KM do veículo é atualizado com o valor declarado).

**Análise Pós-Vistoria** (`/admin/analise-vistoria/:id`, acessada pela fila "Aguardando
análise") — revisão do checklist e das fotos do laudo; pode **solicitar nova vistoria** (com
motivo) ou montar e enviar a **proposta comercial** ao vendedor (valor de referência, valor
mínimo acordado, comissão, mensagem — calcula o líquido automaticamente).
`status_analise`: `AGUARDANDO_ANALISE_LAUDO → EM_ANALISE_POS_VISTORIA → AGUARDANDO_ACEITE_VENDEDOR
→ PRONTO_PARA_ANUNCIO` (aceite) ou `VALOR_RECUSADO` (recusa).

> **Nota técnica:** existe uma segunda tela de pós-vistoria (`/admin/veiculo/:id/pos-vistoria`,
> calculadora baseada em FIPE − depreciação − margem), acionada quando `status_analise =
> VISTORIADO`, com um fluxo de status próprio (`AGUARDANDO_APROVACAO_VENDEDOR`) que não é o mesmo
> usado pela fila oficial acima. As duas coexistem no código — antes de treinar a equipe, confirme
> com o time técnico qual é o caminho vigente para não orientar o uso de um fluxo legado.

### 4.3 Comercial

**Vitrine / Criar Anúncio** (`/admin/anuncios`, `/admin/anuncios/novo`) — só lista veículos com
`status_analise = PRONTO_PARA_ANUNCIO`. Ao criar o anúncio, todas as fotos aprovadas do laudo
passam por processamento automático: a IA localiza a placa e cobre com a logo da Esse Já Foi (ou
aplica uma marca d'água padrão quando não encontra placa); o admin pode ajustar a posição da
logo manualmente em cada foto antes de publicar. Só a versão processada é salva e usada
publicamente — a foto original com a placa nunca é exposta.

**Canais de Publicação** (dentro da ficha do veículo) — quatro canais independentes (Leilão,
Anúncio, Vitrine, WhatsApp), cada um com título/descrição/fotos próprios (as fotos passam pelo
mesmo processamento de logo). Ativar o canal **Vitrine** é o que publica o veículo na listagem
pública; ativar o **Leilão** cria/agenda o leilão; o **WhatsApp** gera um link privado com token
(o veículo não aparece na vitrine por esse canal).

**Campanhas** (`/admin/comunicacoes`) — disparo em massa via WhatsApp Cloud API (credenciais
próprias dessa tela, não ficam em Configurações): wizard de veículo → público-alvo → template
aprovado pela Meta → variáveis → prévia → teste → agendar/enviar. Também reúne Automações,
Segmentos, Templates e Logs de envio.

**Leilões** (`/admin/leiloes`) — só compradores PJ com compliance aprovado dão lances; lance
precisa superar o atual + incremento mínimo; lance dentro da janela anti-sniping prorroga o
fim automaticamente. Ao encerrar: sem lances → `ENCERRADO_SEM_OFERTAS`; abaixo do mínimo
acordado → `ENCERRADO_SEM_MINIMO`; senão, cria a Negociação com o vencedor automaticamente.

**Negociações** (`/admin/negociacoes`) — acompanhamento do pagamento do comprador vencedor
(Pix pela área do comprador, ou baixa manual pelo admin para pagamento fora da plataforma).
`AGUARDANDO_PAGAMENTO → PAGAMENTO_CONFIRMADO` (ou `PAGAMENTO_NAO_REALIZADO` se vencer o prazo).

**Pagamentos** (`/admin/pagamentos`) — trata do **repasse ao vendedor** (não da cobrança do
comprador). `AGUARDANDO → AUTORIZADO → CONCLUIDO`; só libera depois que a entrega é confirmada.

**Entregas** (`/admin/entregas`) — agendamento de retirada/entrega, código de confirmação de 6
dígitos (visível só ao comprador, validado pelo vendedor no ato), tratamento de não
comparecimento e divergências. Ao confirmar, libera o repasse e marca a venda como concluída.

### 4.4 Administração

**Usuários Internos** (`/admin/usuarios`) — cadastro de admin/operação/vistoriador, ativar ou
desativar acesso (não há exclusão).

**Relatórios** (`/admin/relatorios`) — Visão Geral (funil completo), Vendas (volume, ticket
médio, comissão) e Comissões (a receber/recebido); abas Veículos/Leilões/Financeiro/Operacional
ainda sem conteúdo. **Analytics** (`/admin/analytics`) — dashboard de gráficos (atualiza a cada
60s) dos últimos 12 meses.

**Configurações** (`/admin/configuracoes`) — seções: Servidor de E-mail (SMTP), Inteligência
Artificial (chave/modelo/prompt da OpenAI, usados na validação de documentos **e** na detecção
de placa das fotos), Validação e calibração da IA (teste sem gravar nada), Comissão da
plataforma (percentual padrão), Consulta veicular / Company Conferi (URL, usuário, senha, teste
de conexão em homologação), Termos de adesão (vendedor e comprador, versionados).

**Ambiente Demo** (`/admin/demo`) — cria vendedor/comprador/veículo/vistoriador de teste,
refaz checklist, aprova e libera divulgação, abre leilão de 24h — útil para treinar a equipe sem
usar dados reais.

**Logs** (`/admin/logs`) — auditoria (data, entidade, ação, usuário) com busca e paginação.

**Dashboard** (`/admin`) e **Mapa** (`/admin/mapa`) — pendências por etapa, funil visual e
distribuição geográfica de unidades/vendedores/compradores.

## 5. Motor de Depreciação

Usado na calculadora de oferta (ver nota sobre a segunda tela de pós-vistoria acima):
1. Base: valor FIPE atualizado.
2. Ajuste por KM (bônus/penalidade vs. média de mercado).
3. Checklist: descontos ponderados (Leve 0.6x, Médio 1.0x, Grave 1.8x).
4. Acessórios: valorização percentual por item extra.
5. Margem de segurança operacional (padrão 8%).
6. Indicador visual comparando o interesse do vendedor vs. teto do sistema.

## 6. IA no sistema — onde é usada

Toda chamada usa a mesma chave/modelo configurados em **Admin > Configurações > Inteligência
Artificial**:
- Validação dos documentos do vendedor (tipo confere? confiança? motivo?).
- Detecção da placa nas fotos do veículo, para cobrir com a logo da empresa antes de publicar
  (Criar Anúncio e Canais de Publicação).

Em ambos os casos, se não houver chave configurada ou a IA falhar, o sistema **nunca bloqueia o
fluxo** — apenas segue sem a validação/ajuste automático (a foto cai no padrão de marca d'água;
o documento fica para o admin decidir manualmente).

## 7. Comandos úteis

- `npm run dev` / `bun run dev` — ambiente de desenvolvimento
- `npm run build` / `bun run build` — build de produção
- `npm run lint` — ESLint
- `docker build -t essejafoi .` — imagem para deploy (Easypanel)

## 8. Backlog conhecido

- [ ] Unificar as duas telas de análise pós-vistoria (ver nota na seção 4.2).
- [ ] Storage de objetos real para fotos (hoje em base64 no banco).
- [ ] Gerador de PDF para o laudo técnico final.
- [ ] "Enviar recuperação de senha" em Usuários Internos (hoje só mostra aviso).
- [ ] Abas Veículos/Leilões/Financeiro/Operacional em Relatórios.
