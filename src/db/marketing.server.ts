import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

function rowsOf(res: any): any[] {
  return Array.isArray(res) ? res : Array.isArray(res?.rows) ? res.rows : [];
}

export async function ensureMarketingSchema() {
  const d = requireDb();
  await d.execute(sql`CREATE TABLE IF NOT EXISTS marketing_contatos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, email text,
    telefone text, empresa text, tipo text NOT NULL DEFAULT 'prospect',
    status text NOT NULL DEFAULT 'ativo', cep text, endereco text, numero text,
    complemento text, bairro text, cidade text, uf text, latitude text, longitude text,
    geo_status text NOT NULL DEFAULT 'pendente', geo_erro text,
    whatsapp_status text NOT NULL DEFAULT 'nao_verificado', origem text,
    observacoes text, comprador_id uuid REFERENCES profiles(id),
    criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now()
  )`);
  await d.execute(sql`CREATE TABLE IF NOT EXISTS marketing_tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL UNIQUE,
    cor text, criado_em timestamptz NOT NULL DEFAULT now()
  )`);
  await d.execute(sql`CREATE TABLE IF NOT EXISTS marketing_contato_tags (
    contato_id uuid NOT NULL REFERENCES marketing_contatos(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES marketing_tags(id) ON DELETE CASCADE,
    criado_em timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (contato_id, tag_id)
  )`);
}

export type MarketingFiltro = {
  busca?: string;
  tipo?: string;
  status?: string;
  somenteComCoordenadas?: boolean;
};

export async function listarMarketingContatos(filtro: MarketingFiltro = {}) {
  const d = requireDb();
  await ensureMarketingSchema();
  const busca = filtro.busca?.trim() || null;
  const tipo = filtro.tipo && filtro.tipo !== "todos" ? filtro.tipo : null;
  const status = filtro.status && filtro.status !== "todos" ? filtro.status : null;
  const rows = await d.execute(sql`
    SELECT c.*, COALESCE(json_agg(json_build_object('id', t.id, 'nome', t.nome, 'cor', t.cor))
      FILTER (WHERE t.id IS NOT NULL), '[]') AS tags
    FROM marketing_contatos c
    LEFT JOIN marketing_contato_tags ct ON ct.contato_id = c.id
    LEFT JOIN marketing_tags t ON t.id = ct.tag_id
    WHERE (${busca} IS NULL OR c.nome ILIKE ${"%" + (busca || "") + "%"} OR c.email ILIKE ${"%" + (busca || "") + "%"} OR c.empresa ILIKE ${"%" + (busca || "") + "%"} OR c.telefone ILIKE ${"%" + (busca || "") + "%"})
      AND (${tipo} IS NULL OR c.tipo = ${tipo}) AND (${status} IS NULL OR c.status = ${status})
      AND (${filtro.somenteComCoordenadas !== true} OR (c.latitude IS NOT NULL AND c.longitude IS NOT NULL))
    GROUP BY c.id ORDER BY c.criado_em DESC`);
  return rowsOf(rows);
}

export async function importarMarketingContatos(contatos: Array<Record<string, unknown>>) {
  const d = requireDb();
  await ensureMarketingSchema();
  let inseridos = 0,
    duplicados = 0,
    invalidos = 0;
  for (const item of contatos) {
    const nome = String(item.nome || "").trim();
    const email =
      String(item.email || "")
        .trim()
        .toLowerCase() || null;
    const telefone = String(item.telefone || item.whatsapp || "").trim() || null;
    if (!nome || (!email && !telefone)) {
      invalidos++;
      continue;
    }
    const existente = rowsOf(
      await d.execute(
        sql`SELECT id FROM marketing_contatos WHERE (${email} IS NOT NULL AND lower(email) = ${email}) OR (${telefone} IS NOT NULL AND telefone = ${telefone}) LIMIT 1`,
      ),
    )[0];
    if (existente) {
      duplicados++;
      continue;
    }
    await d.execute(
      sql`INSERT INTO marketing_contatos (nome,email,telefone,empresa,tipo,cep,endereco,numero,bairro,cidade,uf,origem,observacoes) VALUES (${nome},${email},${telefone},${item.empresa ? String(item.empresa) : null},${item.tipo ? String(item.tipo) : "prospect"},${item.cep ? String(item.cep) : null},${item.endereco ? String(item.endereco) : null},${item.numero ? String(item.numero) : null},${item.bairro ? String(item.bairro) : null},${item.cidade ? String(item.cidade) : null},${item.uf ? String(item.uf) : null},${item.origem ? String(item.origem) : "importacao_excel"},${item.observacoes ? String(item.observacoes) : null})`,
    );
    inseridos++;
  }
  return { inseridos, duplicados, invalidos };
}

export async function criarMarketingTag(nome: string, cor?: string) {
  const d = requireDb();
  await ensureMarketingSchema();
  return rowsOf(
    await d.execute(
      sql`INSERT INTO marketing_tags (nome, cor) VALUES (${nome.trim()}, ${cor || null}) ON CONFLICT (nome) DO UPDATE SET cor = COALESCE(EXCLUDED.cor, marketing_tags.cor) RETURNING *`,
    ),
  )[0];
}

export async function atribuirMarketingTag(contatoIds: string[], tagId: string) {
  const d = requireDb();
  await ensureMarketingSchema();
  for (const id of contatoIds)
    await d.execute(
      sql`INSERT INTO marketing_contato_tags (contato_id, tag_id) VALUES (${id}::uuid, ${tagId}::uuid) ON CONFLICT DO NOTHING`,
    );
}

/**
 * Converte um contato de marketing em comprador: cria o perfil via preCadastrarComprador
 * (senha provisória, origem PRE_CADASTRO_ADMIN) e vincula o contato ao novo comprador.
 */
export async function converterContatoEmComprador(contatoId: string, senha: string) {
  const d = requireDb();
  await ensureMarketingSchema();
  const contato = rowsOf(
    await d.execute(sql`SELECT * FROM marketing_contatos WHERE id = ${contatoId}::uuid LIMIT 1`),
  )[0];
  if (!contato) throw new Error("Contato não encontrado.");
  if (contato.comprador_id) throw new Error("Este contato já foi convertido em comprador.");
  if (!contato.email) throw new Error("Contato sem e-mail: informe um e-mail antes de converter.");

  const { preCadastrarComprador } = await import("./comprador.server");
  const r = await preCadastrarComprador({
    nome: contato.empresa || contato.nome,
    email: contato.email,
    senha,
    whatsapp: contato.telefone || undefined,
    endereco: contato.endereco || undefined,
    cidade: contato.cidade || undefined,
    uf: contato.uf || undefined,
  });
  if (!r.ok) throw new Error(r.message || "Falha ao criar o comprador.");

  await d.execute(
    sql`UPDATE marketing_contatos SET comprador_id = ${r.data.id}::uuid, tipo = 'comprador', status = 'convertido', atualizado_em = now() WHERE id = ${contatoId}::uuid`,
  );
  return r.data;
}

/**
 * Geocodifica contatos pendentes usando o Nominatim (OpenStreetMap, sem custo de API).
 * Respeita o limite de 1 req/s do serviço público.
 */
export async function geocodificarContatosPendentes(limite = 20) {
  const d = requireDb();
  await ensureMarketingSchema();
  const pendentes = rowsOf(
    await d.execute(sql`
      SELECT id, cep, endereco, numero, bairro, cidade, uf
      FROM marketing_contatos
      WHERE geo_status IN ('pendente', 'erro') AND endereco IS NOT NULL
      ORDER BY criado_em ASC LIMIT ${limite}
    `),
  );
  let sucesso = 0,
    falha = 0;
  for (const c of pendentes) {
    const query = [c.endereco, c.numero, c.bairro, c.cidade, c.uf, "Brasil"]
      .filter(Boolean)
      .join(", ");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { "User-Agent": "EsseJaFoi/1.0 (marketing)" } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const dados: any[] = await res.json();
      if (dados.length) {
        await d.execute(
          sql`UPDATE marketing_contatos SET latitude = ${dados[0].lat}, longitude = ${dados[0].lon}, geo_status = 'ok', geo_erro = NULL, atualizado_em = now() WHERE id = ${c.id}::uuid`,
        );
        sucesso++;
      } else {
        await d.execute(
          sql`UPDATE marketing_contatos SET geo_status = 'erro', geo_erro = 'Endereço não encontrado', atualizado_em = now() WHERE id = ${c.id}::uuid`,
        );
        falha++;
      }
    } catch (e: any) {
      await d.execute(
        sql`UPDATE marketing_contatos SET geo_status = 'erro', geo_erro = ${String(e.message || e).slice(0, 200)}, atualizado_em = now() WHERE id = ${c.id}::uuid`,
      );
      falha++;
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  return { processados: pendentes.length, sucesso, falha };
}

/** Busca a configuração da Uazapi nas configurações do sistema (token nunca sai do servidor). */
export async function getUazapiConfig() {
  const d = requireDb();
  await ensureMarketingSchema();
  await d.execute(sql`
    INSERT INTO configuracoes_sistema (chave, valor, descricao)
    VALUES ('uazapi_base_url', '', 'URL base da instância Uazapi (ex: https://gleego.uazapi.com)'),
           ('uazapi_token', '', 'Token da instância Uazapi (enviado no header token)')
    ON CONFLICT (chave) DO NOTHING
  `);
  const rows = rowsOf(
    await d.execute(
      sql`SELECT chave, valor FROM configuracoes_sistema WHERE chave IN ('uazapi_base_url','uazapi_token')`,
    ),
  );
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.chave] = r.valor || "";
  return cfg;
}

export async function salvarUazapiConfig(base_url: string, token: string) {
  const d = requireDb();
  await ensureMarketingSchema();
  for (const [chave, valor] of [
    ["uazapi_base_url", base_url.trim().replace(/\/+$/, "")],
    ["uazapi_token", token.trim()],
  ] as const) {
    await d.execute(sql`
      INSERT INTO configuracoes_sistema (chave, valor, atualizado_em)
      VALUES (${chave}, ${valor}, now())
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
    `);
  }
  return { ok: true };
}

function normalizarTelefone(telefone: string): string | null {
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 13) return null;
  // Assume Brasil quando não há DDI (10-11 dígitos)
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

/**
 * Verifica quais contatos possuem WhatsApp ativo via POST /chat/check da Uazapi
 * e grava o resultado em whatsapp_status (verificado | invalido | erro).
 */
export async function verificarWhatsappContatos(limite = 50) {
  const d = requireDb();
  const cfg = await getUazapiConfig();
  if (!cfg.uazapi_base_url || !cfg.uazapi_token) {
    throw new Error("Configure a URL e o token da Uazapi antes de verificar.");
  }
  await ensureMarketingSchema();
  const pendentes = rowsOf(
    await d.execute(sql`
      SELECT id, telefone FROM marketing_contatos
      WHERE telefone IS NOT NULL AND whatsapp_status = 'nao_verificado'
      ORDER BY criado_em ASC LIMIT ${limite}
    `),
  );
  if (!pendentes.length) return { processados: 0, verificados: 0, invalidos: 0, erros: 0 };

  // Prepara pares {id, numero normalizado} — descarta telefones sem formato válido
  const pares: Array<{ id: string; numero: string }> = [];
  for (const c of pendentes) {
    const numero = normalizarTelefone(c.telefone);
    if (numero) pares.push({ id: c.id, numero });
    else
      await d.execute(
        sql`UPDATE marketing_contatos SET whatsapp_status = 'invalido', atualizado_em = now() WHERE id = ${c.id}::uuid`,
      );
  }

  const base = cfg.uazapi_base_url.replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/check`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      token: cfg.uazapi_token,
    },
    body: JSON.stringify({ numbers: pares.map((p) => p.numero) }),
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`Uazapi retornou HTTP ${res.status}: ${texto.slice(0, 200)}`);
  }
  const resultados: Array<{
    query: string;
    isInWhatsapp?: boolean;
    verifiedName?: string;
    error?: string;
  }> = await res.json();

  let verificados = 0,
    invalidos = 0,
    erros = 0;
  for (let i = 0; i < pares.length; i++) {
    const r = resultados[i];
    if (!r) {
      erros++;
      continue;
    }
    // A API responde na ordem enviada; casamos por query (número normalizado)
    const alvo = pares.find((p) => p.numero === r.query) || pares[i];
    const status = r.isInWhatsapp ? "verificado" : "invalido";
    if (r.isInWhatsapp) verificados++;
    else if (r.error) erros++;
    else invalidos++;
    await d.execute(
      sql`UPDATE marketing_contatos SET whatsapp_status = ${status}, atualizado_em = now() WHERE id = ${alvo.id}::uuid`,
    );
  }
  return {
    processados: pares.length + (pendentes.length - pares.length),
    verificados,
    invalidos,
    erros,
  };
}
