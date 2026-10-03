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

function filtroCompradores(c: CriterioPublico) {
  return sql`
    SELECT
      p.id AS comprador_id,
      NULL::uuid AS contato_marketing_id,
      p.nome, p.telefone, p.email,
      p.cidade, p.uf
    FROM profiles p
    WHERE p.role = 'comprador'
      AND p.ativo IS NOT FALSE
      AND btrim(coalesce(p.telefone, '')) <> ''
      AND (${c.statusCompliance ?? null}::text IS NULL OR p.status_compliance = ${c.statusCompliance ?? null})
      AND (${c.tipo ?? null}::text IS NULL OR p.tipo_pessoa = ${c.tipo ?? null})
      AND (${c.uf ?? null}::text IS NULL OR upper(coalesce(p.uf, '')) = upper(${c.uf ?? null}))
      AND (${c.cidade ?? null}::text IS NULL OR lower(coalesce(p.cidade, '')) = lower(${c.cidade ?? null}))
      AND (${c.busca ?? null}::text IS NULL OR p.nome ILIKE ${"%" + (c.busca ?? "") + "%"})
  `;
}

function filtroProspects(c: CriterioPublico) {
  // `comprador_id IS NULL` é o que impede mandar convite para quem já se
  // cadastrou: quem já é comprador chega pela outra UNION.
  return sql`
    SELECT
      NULL::uuid AS comprador_id,
      m.id AS contato_marketing_id,
      coalesce(nullif(m.empresa, ''), m.nome) AS nome,
      m.telefone, m.email,
      m.cidade, m.uf
    FROM marketing_contatos m
    WHERE m.comprador_id IS NULL
      AND m.status NOT IN ('descartado', 'convertido')
      AND btrim(coalesce(m.telefone, '')) <> ''
      AND (${c.loteId ?? null}::uuid IS NULL OR m.origem = ${c.loteId ?? null})
      AND (${c.uf ?? null}::text IS NULL OR upper(coalesce(m.uf, '')) = upper(${c.uf ?? null}))
      AND (${c.cidade ?? null}::text IS NULL OR lower(coalesce(m.cidade, '')) = lower(${c.cidade ?? null}))
      AND (${c.busca ?? null}::text IS NULL
        OR coalesce(nullif(m.empresa, ''), m.nome) ILIKE ${"%" + (c.busca ?? "") + "%"})
  `;
}

/**
 * Lista unificada de destinatários, sem repetir ninguém: um contato de
 * marketing já convertido aparece como comprador, nunca nas duas linhas.
 */
export async function resolverPublico(criterio: CriterioPublico = {}): Promise<Destinatario[]> {
  const d = requireDb();
  const origem: OrigemPublico = criterio.origem ?? "AMBOS";

  const partes: any[] = [];
  if (origem === "COMPRADORES" || origem === "AMBOS") partes.push(filtroCompradores(criterio));
  if (origem === "IMPORTADOS" || origem === "AMBOS") partes.push(filtroProspects(criterio));
  if (!partes.length) return [];

  // As duas partes têm as mesmas colunas; a dedup real é por telefone, feita
  // abaixo em JS, porque comprador e prospect têm ids diferentes.
  const consulta =
    partes.length === 1 ? partes[0] : sql`SELECT * FROM (${sql.join(partes, " UNION ALL ")}) uniao`;

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
 * Base da aba de Contatos: compradores e prospects na mesma lista, com o que a
 * tela precisa mostrar e o motivo quando não é elegível.
 */
export async function listarContatos(
  filtros: {
    busca?: string | null;
    apenasElegiveis?: boolean;
    origem?: OrigemPublico | null;
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
