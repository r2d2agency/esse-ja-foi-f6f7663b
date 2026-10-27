import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Público-alvo das campanhas de WhatsApp.
 *
 * A fila antiga só olhava `profiles` com role='comprador'. O público real do
 * marketing é maior: prospects importados em `marketing_contatos`, que ainda
 * não têm conta e precisam receber convite para se cadastrarem. Este módulo
 * junta os dois sem duplicar quem já virou comprador.
 */

export type OrigemPublico = "COMPRADORES" | "IMPORTADOS" | "AMBOS";

export type CriterioPublico = {
  origem?: OrigemPublico | null;
  tipo?: string | null;
  uf?: string | null;
  cidade?: string | null;
  statusCompliance?: string | null;
  segmentoId?: string | null;
  loteId?: string | null;
  busca?: string | null;
  /**
   * Ids de `marketing_tags`. Vazio/null = sem filtro de tag. Com pelo menos
   * um id, a fila é montada só dos contatos marcados com aquela tag, e o
   * restante dos filtros (origem/UF/tipo) é ignorado — a tag já é a seleção.
   */
  tagIds?: string[] | null;
  /**
   * Ids explícitos de `marketing_contatos`. Quando presentes, a fila é
   * montada só desses contatos (a tag/filtros são ignorados). É o que a
   * tela usa quando o admin seleciona contatos individualmente.
   */
  contatoIds?: string[] | null;
  /**
   * Quando true, tira do público quem já recebeu alguma campanha
   * (telefone presente em `whatsapp_mensagens` com estado_fila ENVIADA).
   * É o "enviar só para quem nunca recebeu" do wizard.
   */
  apenasNaoEnviados?: boolean | null;
};

export type Destinatario = {
  telefone: string;
  nome: string | null;
  email: string | null;
  origem: "COMPRADOR" | "PROSPECT";
  comprador_id: string | null;
  contato_marketing_id: string | null;
  cidade: string | null;
  uf: string | null;
};

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

/** Só dígitos; a Meta rejeita número com máscara. */
export function soDigitos(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const d = String(telefone).replace(/\D/g, "");
  // 10-13 dígitos: DDD + número, com código do país opcional.
  if (d.length < 10 || d.length > 13) return null;
  return d;
}

/** 10 ou 11 dígitos (sem o 55) viram o formato internacional que a Meta exige. */
export function normalizarParaMeta(telefone: string): string {
  const d = String(telefone).replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

/**
 * O wizard envia "TODOS" (tipo) e "" (uf) como "sem filtro", e os filtros
 * não usados chegam como a string "null" (o driver serializa null assim).
 * O SQL compara esses valores literalmente — `tipo_pessoa = 'TODOS'` e
 * `uf = ''` não correspondem a nenhuma linha, então a UI sempre via 0
 * compradores. Aqui normalizamos: vazio, "TODOS" ou "null" viram null de
 * verdade, que é o "sem filtro" que a query entende.
 */
function limparFiltro(valor: string | null | undefined): string | null {
  const v = String(valor ?? "").trim();
  if (!v || v.toUpperCase() === "NULL" || v.toUpperCase() === "TODOS") return null;
  return v;
}

function filtroCompradores(c: CriterioPublico) {
  const tipo = limparFiltro(c.tipo);
  const uf = limparFiltro(c.uf);
  const cidade = limparFiltro(c.cidade);
  const busca = limparFiltro(c.busca);
  const statusCompliance = limparFiltro(c.statusCompliance);

  // O cadastro grava o telefone em `profiles.whatsapp` (ver
  // comprador.server.ts), então `telefone` pode ser NULL para compradores
  // válidos. Sem o COALESCE eles eram excluídos e a contagem dava 0.
  return sql`
    SELECT
      p.id AS comprador_id,
      NULL::uuid AS contato_marketing_id,
      p.nome,
      coalesce(nullif(btrim(p.telefone), ''), nullif(btrim(p.whatsapp), '')) AS telefone,
      p.email,
      p.cidade, p.uf
    FROM profiles p
    WHERE p.role = 'comprador'
      AND p.ativo IS NOT FALSE
      AND coalesce(nullif(btrim(p.telefone), ''), nullif(btrim(p.whatsapp), '')) IS NOT NULL
      AND (${statusCompliance}::text IS NULL OR p.status_compliance = ${statusCompliance})
      AND (${tipo}::text IS NULL OR p.tipo_pessoa = ${tipo})
      AND (${uf}::text IS NULL OR upper(coalesce(p.uf, '')) = upper(${uf}))
      AND (${cidade}::text IS NULL OR lower(coalesce(p.cidade, '')) = lower(${cidade}))
      ${
        busca
          ? sql`AND p.nome ILIKE ${"%" + busca + "%"}`
          : sql``
      }
  `;
}

function filtroProspects(c: CriterioPublico) {
  const uf = limparFiltro(c.uf);
  const cidade = limparFiltro(c.cidade);
  const busca = limparFiltro(c.busca);

  // Tag marcada na tela: em vez de "todos os prospects", a fila é só quem
  // recebeu aquela etiqueta no Marketing. A tag já é a seleção, então origem,
  // tipo e UF ficam de fora — misturá-los esvaziava a fila sem aviso.
  const tagIds = (Array.isArray(c.tagIds) ? c.tagIds : []).filter((t) => !!t);
  const comTag = tagIds.length > 0;
  const contatoIds = (Array.isArray(c.contatoIds) ? c.contatoIds : []).filter((t) => !!t);
  const comContato = contatoIds.length > 0;

  // `comprador_id IS NULL` é o que impede mandar convite para quem já se
  // cadastrou: quem já é comprador chega pela outra UNION.
  // Quando uma tag está selecionada, a tag é a seleção — então inclui também
  // contatos que já têm `comprador_id` (convertidos), pois a tag pode ter sido
  // aplicada antes da conversão. Sem isso a fila nascia vazia.
  return sql`
    SELECT
      NULL::uuid AS comprador_id,
      m.id AS contato_marketing_id,
      coalesce(nullif(m.empresa, ''), m.nome) AS nome,
      m.telefone, m.email,
      m.cidade, m.uf
    FROM marketing_contatos m
    WHERE (${comTag || comContato} OR m.comprador_id IS NULL)
      AND m.status NOT IN ('descartado', 'convertido')
      AND btrim(coalesce(m.telefone, '')) <> ''
      ${
        comContato
          ? sql`AND m.id IN (${sql.join(
              contatoIds.map((t) => sql`${t}::uuid`),
              ", ",
            )})`
          : comTag
            ? sql`AND m.id IN (
        SELECT ct.contato_id FROM marketing_contato_tags ct
        WHERE ct.tag_id IN (${sql.join(
          tagIds.map((t) => sql`${t}::uuid`),
          ", ",
        )})
      )`
            : sql``
      }
      AND (
        ${comTag}
        OR (${c.loteId ?? null}::uuid IS NULL OR m.origem = ${c.loteId ?? null})
      )
      AND (
        ${comTag}
        OR (${uf}::text IS NULL OR upper(coalesce(m.uf, '')) = upper(${uf}))
      )
      AND (
        ${comTag}
        OR (${cidade}::text IS NULL OR lower(coalesce(m.cidade, '')) = lower(${cidade}))
      )
      AND (
        ${comTag}
        OR (${busca}::text IS NULL
          OR coalesce(nullif(m.empresa, ''), m.nome) ILIKE ${busca ? "%" + busca + "%" : null})
      )
  `;
}

/**
 * Lista unificada de destinatários, sem repetir ninguém: um contato de
 * marketing já convertido aparece como comprador, nunca nas duas linhas.
 */
export async function resolverPublico(criterio: CriterioPublico = {}): Promise<Destinatario[]> {
  const d = requireDb();
  const origem: OrigemPublico = criterio.origem ?? "AMBOS";

  // Com tag marcada, a tag define o público: buscar compradores junto traria
  // gente de fora da etiqueta e a contagem da tela não bateria com a fila.
  const comTag = Array.isArray(criterio.tagIds) && criterio.tagIds.length > 0;
  // Contatos selecionados explicitamente: define o público sozinho.
  const comContato = Array.isArray(criterio.contatoIds) && criterio.contatoIds.length > 0;

  // "Só quem nunca recebeu": quem já saiu como ENVIADA em qualquer campanha
  // anterior sai do público — e também da contagem, para a estimativa da tela
  // bater com a fila que o motor monta.
  const enviados = criterio.apenasNaoEnviados ? await telefonesJaEnviados() : null;

  const partes: any[] = [];
  // Com contatos selecionados explicitamente, não busca compradores nem
  // prospects por origem — só os prospects marcados.
  if (!comContato && !comTag && (origem === "COMPRADORES" || origem === "AMBOS"))
    partes.push(filtroCompradores(criterio));
  if (comContato || origem === "IMPORTADOS" || origem === "AMBOS" || comTag)
    partes.push(filtroProspects(criterio));
  if (!partes.length) return [];

  // UNION ALL como texto puro: o `sql.join` com um separador string tratava o
  // separador como parâmetro ($11) no meio da query e o Postgres rejeitava com
  // "Failed query". `sql.raw` mantém o texto literal sem abrir injeção — as
  // duas partes são montadas aqui dentro, nunca vêm do usuário.
  const consulta =
    partes.length === 1
      ? partes[0]
      : sql`SELECT * FROM (${sql.join(partes, sql.raw(" UNION ALL "))}) uniao`;

  const res = await d.execute(consulta);
  const linhas: any[] = rowsOf(res);

  // Dedup por telefone normalizado: o mesmo número pode estar no profiles e no
  // marketing_contatos, e mandar duas vezes para a mesma pessoa é o pior
  // resultado possível num disparo.
  const vistos = new Map<string, Destinatario>();
  for (const l of linhas) {
    const tel = soDigitos(l.telefone);
    if (!tel) continue;
    const chave = normalizarParaMeta(tel);
    // Com "só novos", quem já recebeu antes nem entra no mapa.
    if (enviados?.has(chave)) continue;
    const existente = vistos.get(chave);
    // Comprador tem precedência: já tem conta e histórico no sistema.
    if (existente) {
      if (existente.origem === "COMPRADOR" && l.comprador_id) continue;
      if (l.comprador_id) vistos.set(chave, { ...l, origem: "COMPRADOR", telefone: chave });
      continue;
    }
    vistos.set(chave, {
      telefone: chave,
      nome: l.nome ?? null,
      email: l.email ?? null,
      origem: l.comprador_id ? "COMPRADOR" : "PROSPECT",
      comprador_id: l.comprador_id ?? null,
      contato_marketing_id: l.contato_marketing_id ?? null,
      cidade: l.cidade ?? null,
      uf: l.uf ?? null,
    });
  }
  return [...vistos.values()];
}

/** Só a contagem, para a tela mostrar "N elegíveis" sem trazer a lista inteira. */
export async function contarPublico(criterio: CriterioPublico = {}): Promise<number> {
  return (await resolverPublico(criterio)).length;
}

/**
 * Telefones que já receberam alguma campanha (estado_fila ENVIADA), já
 * normalizados para o formato da Meta. O dedup da fila é por campanha, então
 * sem isso a tela não tinha como dizer "este contato já recebeu antes".
 */
export async function telefonesJaEnviados(): Promise<Set<string>> {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT DISTINCT telefone FROM whatsapp_mensagens
    WHERE estado_fila = 'ENVIADA' AND telefone IS NOT NULL
  `);
  const set = new Set<string>();
  for (const l of rowsOf(res)) {
    const tel = soDigitos(l.telefone);
    if (tel) set.add(normalizarParaMeta(tel));
  }
  return set;
}

/**
 * Base da aba de Contatos: compradores e prospects na mesma lista, com o que a
 * tela precisa mostrar e o motivo quando não é elegível.
 */
export async function listarContatos(
  filtros: {
    busca?: string | null;
    apenasElegiveis?: boolean;
    origem?: OrigemPublico | null;
    tagIds?: string[] | null;
  } = {},
) {
  const d = requireDb();
  const busca = (filtros.busca ?? "").trim();
  const termo = busca ? `%${busca}%` : null;
  const somenteProspects = filtros.origem === "IMPORTADOS";
  const somenteCompradores = filtros.origem === "COMPRADORES";

  const res = await d.execute(sql`
    SELECT
      'COMPRADOR' AS origem,
      p.id,
      p.nome, p.telefone, p.email,
      p.status_compliance, p.whatsapp_status, p.pode_receber_comunicacoes,
      p.tipo_pessoa, p.uf, p.cidade,
      p.interesses_veiculos
    FROM profiles p
    WHERE p.role = 'comprador'
      AND p.ativo IS NOT FALSE
      AND NOT ${somenteProspects}
      ${
        termo
          ? sql`AND (
            p.nome ILIKE ${termo} OR coalesce(p.telefone, '') ILIKE ${termo}
            OR coalesce(p.email, '') ILIKE ${termo} OR coalesce(p.cidade, '') ILIKE ${termo}
          )`
          : sql``
      }
      ${
        filtros.apenasElegiveis
          ? sql`AND p.pode_receber_comunicacoes = true AND p.whatsapp_status = 'ATIVO'
              AND btrim(coalesce(p.telefone, '')) <> ''`
          : sql``
      }

    UNION ALL

    SELECT
      'PROSPECT' AS origem,
      m.id,
      coalesce(nullif(m.empresa, ''), m.nome) AS nome,
      m.telefone, m.email,
      NULL::text AS status_compliance,
      -- Prospect usa minúsculas (nao_verificado/invalido, ver marketing.server.ts);
      -- o maiúsculo aqui é só para a tela comparar com a mesma regra do comprador.
      upper(coalesce(m.whatsapp_status, 'nao_verificado')) AS whatsapp_status,
      true AS pode_receber_comunicacoes,
      NULL::text AS tipo_pessoa,
      m.uf, m.cidade,
      NULL::jsonb AS interesses_veiculos
    FROM marketing_contatos m
    WHERE m.comprador_id IS NULL
      AND m.status NOT IN ('descartado', 'convertido')
      AND NOT ${somenteCompradores}
      ${
        Array.isArray(filtros.tagIds) && filtros.tagIds.length > 0
          ? sql`AND m.id IN (
              SELECT ct.contato_id FROM marketing_contato_tags ct
              WHERE ct.tag_id IN (${sql.join(
                filtros.tagIds.map((t) => sql`${t}::uuid`),
                ", ",
              )})
            )`
          : sql``
      }
      ${
        termo
          ? sql`AND (
            coalesce(nullif(m.empresa, ''), m.nome) ILIKE ${termo}
            OR coalesce(m.telefone, '') ILIKE ${termo}
            OR coalesce(m.email, '') ILIKE ${termo}
            OR coalesce(m.cidade, '') ILIKE ${termo}
          )`
          : sql``
      }
      ${filtros.apenasElegiveis ? sql`AND btrim(coalesce(m.telefone, '')) <> ''` : sql``}

    ORDER BY origem, nome
    LIMIT 300
  `);

  return rowsOf(res).map((c: any) => {
    const temTelefone = !!c.telefone && String(c.telefone).trim() !== "";
    // Prospect de lista de marketing é elegível por ter número: o status dele
    // nasce 'nao_verificado', e exigir ATIVO como no comprador deixaria
    // nenhum contato importado entrar na fila. O que exclui é o inválido
    // confirmado — 131047, que o webhook grava ao receber o erro da Meta.
    const statusOk =
      c.origem === "PROSPECT"
        ? c.whatsapp_status !== "INVALIDO"
        : c.whatsapp_status === "ATIVO" && c.pode_receber_comunicacoes === true;

    return {
      ...c,
      elegivel: temTelefone && statusOk,
      // A tela mostra o porquê da inelegibilidade, não só um "não".
      motivo_inelegivel: !temTelefone
        ? "Sem telefone"
        : c.origem === "COMPRADOR" && c.status_compliance !== "APROVADO"
          ? `Compliance ${c.status_compliance || "pendente"}`
          : c.origem === "COMPRADOR" && c.whatsapp_status !== "ATIVO"
            ? `WhatsApp ${c.whatsapp_status}`
            : c.whatsapp_status === "INVALIDO"
              ? "Número inexistente"
              : null,
    };
  });
}

/** Segmentos salvos, com a contagem real de destinatários hoje. */
export async function listarSegmentosComTotal() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT s.*, (
      SELECT count(*) FROM whatsapp_segmentos_contatos sc WHERE sc.segmento_id = s.id
    ) AS total_membros
    FROM whatsapp_segmentos s
    ORDER BY s.criado_em DESC
  `);
  return rowsOf(res);
}

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
