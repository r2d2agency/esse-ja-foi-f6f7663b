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
  /** 'verificado' | 'invalido' | 'nao_verificado' | 'erro' */
  whatsappStatus?: string;
  /**
   * Ids de etiqueta para filtrar (OR): o contato precisa ter pelo menos uma
   * delas. Campanhas usam a mesma lógica pelo lado da campanha.
   */
  tagIds?: string[];
}

export async function listarMarketingContatos(filtro: MarketingFiltro = {}) {
  const d = requireDb();
  await ensureMarketingSchema();
  const busca = filtro.busca?.trim() || null;
  const tipo = filtro.tipo && filtro.tipo !== "todos" ? filtro.tipo : null;
  const status = filtro.status && filtro.status !== "todos" ? filtro.status : null;
  const whatsappStatus =
    filtro.whatsappStatus && filtro.whatsappStatus !== "todos" ? filtro.whatsappStatus : null;
  // tagIds vazio ou ausente = sem filtro por tag.
  const tagIds = Array.isArray(filtro.tagIds) ? filtro.tagIds.filter(Boolean) : [];
  const comFiltroTag = tagIds.length > 0;
  // A cláusula de tag só entra montada quando existe tag. Enviar um array
  // vazio para o Postgres (`ANY($1::uuid[])` com `{}`) faz o driver não
  // conseguir inferir o tipo do parâmetro e a consulta inteira é rejeitada —
  // a tela ficava vazia sem mostrar o erro. A mesma lista de contatos volta
  // quando o filtro de tag é removido, o que confirma que os dados estão lá.
  const clausulaTag = comFiltroTag
    ? sql`AND EXISTS (
        SELECT 1 FROM marketing_contato_tags ft
        WHERE ft.contato_id = c.id
          AND ft.tag_id IN (${sql.join(
            tagIds.map((t) => sql`${t}::uuid`),
            sql.raw(", "),
          )})
      )`
    : sql``;
  // O termo só existe quando há busca. Sem isso virava a string "%null%" e a
  // query não achava ninguém — a lista aparecia vazia mesmo com a base cheia.
  const termo = busca ? `%${busca}%` : null;
  // Os casts ::text são obrigatórios: sem eles o Postgres não consegue inferir
  // o tipo de um parâmetro que só aparece em `IS NULL` e a consulta falha. Como
  // o erro sobe para o catch da server fn, a tela mostrava lista vazia em vez
  // do erro.
  const rows = await d.execute(sql`
    SELECT c.*, COALESCE(json_agg(json_build_object('id', t.id, 'nome', t.nome, 'cor', t.cor))
      FILTER (WHERE t.id IS NOT NULL), '[]') AS tags
    FROM marketing_contatos c
    LEFT JOIN marketing_contato_tags ct ON ct.contato_id = c.id
    LEFT JOIN marketing_tags t ON t.id = ct.tag_id
    WHERE (${termo}::text IS NULL OR c.nome ILIKE ${termo} OR c.email ILIKE ${termo} OR c.empresa ILIKE ${termo} OR c.telefone ILIKE ${termo})
      AND (${tipo}::text IS NULL OR c.tipo = ${tipo}) AND (${status}::text IS NULL OR c.status = ${status})
      AND (${whatsappStatus}::text IS NULL OR c.whatsapp_status = ${whatsappStatus})
      AND (${filtro.somenteComCoordenadas !== true} OR (c.latitude IS NOT NULL AND c.longitude IS NOT NULL))
      ${clausulaTag}
    GROUP BY c.id ORDER BY c.criado_em DESC`);
  return rowsOf(rows);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Limpa um número de telefone. Retorna null quando não dá para aproveitar.
 *
 * A importação recebe os formatos mais variados — "(17) 99130-8048",
 * "+55 17 991308048", "17991308048" — e a Meta só aceita dígitos com DDD e código
 * de país. Guardar o valor cru é o que faz o disparo falhar mais tarde, sem
 * ninguém saber por quê, então a normalização acontece aqui, na entrada.
 */
export function normalizarTelefoneImportacao(valor: unknown): string | null {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return null;
  const d = bruto.replace(/\D/g, "");
  // 10-13 dígitos cobrem DDD+número com ou sem o 55; menos que isso não é
  // nenhum formato brasileiro válido e o INSERT só criaria lixo na base.
  if (d.length < 10 || d.length > 13) return null;
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

export type ItemImportacao = {
  nome: string;
  email: string | null;
  telefone: string | null;
  empresa: string | null;
  tipo: string;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  origem: string;
  observacoes: string | null;
};

export type ResultadoImportacao = {
  inseridos: number;
  duplicados: number;
  /** Linhas que já existiam e foram sobrescritas (só com atualizarExistentes). */
  atualizados: number;
  invalidos: number;
  erros: string[];
  /**
   * Ids recém-gravados, para a UI mostrar o que importou sem depender da query
   * cache invalidar. Vem vazio quando nada é inserido ou o banco não devolve
   * RETURNING.
   */
  inseridosIds?: string[];
};

/**
 * Confere duplicidade dentro do próprio arquivo e contra o banco.
 *
 * Faz as duas coisas porque uma lista de lojistas quase sempre vem com a
 * mesma empresa repetida em linhas diferentes; gravar tudo e só depois
 * descobrir que metade era duplicada deixa a base inutilizável.
 *
 * A checagem no banco lê os candidatos e compara em JavaScript. A versão
 * anterior montava um WHERE com OR que repetia o mesmo parâmetro
 * (`($1 IS NOT NULL AND lower(email) = $2) OR ($3 IS NOT NULL AND telefone = $4)`),
 * e o driver postgres-js falhava ao vincular esses parâmetros, derrubando a
 * importação inteira — a pessoa clicava em "Importar" e nada entrava, sem
 * nenhuma dica do motivo. Duas cláusulas separadas evitam essa classe de
 * problema de vez: o OR deixa de existir e os valores são comparados aqui.
 */
async function idDuplicado(
  d: NonNullable<typeof db>,
  email: string | null,
  telefone: string | null,
  vistos: Map<string, boolean>,
): Promise<string | null> {
  if (email && vistos.has(email)) return email;
  if (telefone && vistos.has(telefone)) return telefone;
  if (!email && !telefone) return null;

  const clausulas = [
    email ? sql`lower(c.email) = ${email}` : null,
    telefone ? sql`c.telefone = ${telefone}` : null,
  ].filter((c): c is ReturnType<typeof sql> => c !== null);
  // Se não há nada a comparar o loop principal já tratou a linha como inválida.
  if (!clausulas.length) return null;

  for (const clausula of clausulas) {
    const linha = rowsOf(
      await d.execute(
        sql`SELECT c.email, c.telefone FROM marketing_contatos c WHERE ${clausula} LIMIT 1`,
      ),
    )[0];
    if (!linha) continue;
    if (email && String(linha.email ?? "").toLowerCase() === email) return email;
    if (telefone && String(linha.telefone ?? "") === telefone) return "telefone já cadastrado";
  }
  return null;
}

export async function importarMarketingContatos(
  contatos: Array<Record<string, unknown>>,
  tipoPadrao = "prospect",
  /** Quando true, linha que já existe é atualizada em vez de descartada. */
  atualizarExistentes = false,
): Promise<ResultadoImportacao> {
  const d = requireDb();
  await ensureMarketingSchema();
  const vistos = new Map<string, boolean>();
  const erros: string[] = [];
  let inseridos = 0,
    duplicados = 0,
    invalidos = 0,
    atualizados = 0;
  const inseridosIds: string[] = [];

  for (let i = 0; i < contatos.length; i++) {
    const item = contatos[i];
    // Nome é o mínimo para um contato ser identificável na lista.
    const nome = String(item.nome ?? "").trim();
    const email =
      String(item.email ?? "")
        .trim()
        .toLowerCase() || null;
    const telefone = normalizarTelefoneImportacao(item.telefone ?? item.whatsapp);

    if (!nome || (!email && !telefone)) {
      invalidos++;
      erros.push(
        `Linha ${i + 1}: sem nome e sem e-mail/telefone — preencha pelo menos um contato.`,
      );
      continue;
    }
    if (email && !EMAIL_RE.test(email)) {
      invalidos++;
      erros.push(`Linha ${i + 1}: e-mail inválido ("${email}").`);
      continue;
    }
    if (String(item.telefone ?? item.whatsapp ?? "").trim() && !telefone) {
      invalidos++;
      erros.push(
        `Linha ${i + 1}: telefone inválido ("${String(item.telefone ?? item.whatsapp)}") — use DDD + número.`,
      );
      continue;
    }

    // O registro é montado antes da checagem de duplicidade porque o caminho
    // "atualizar existente" precisa dele: sem isso a linha nova tentava usar
    // uma const declarada mais abaixo (erro de inicialização em tempo de
    // execução) e a reimportação nunca sobrescrevia nada.
    const registro: ItemImportacao = {
      nome,
      email,
      telefone,
      empresa: String(item.empresa ?? "").trim() || null,
      // O diálogo pergunta se a lista é de lojistas, prospects ou compradores;
      // sem isso toda lista importada virava "prospect" e o disparo não achava
      // ninguém.
      tipo: String(item.tipo ?? "").trim() || tipoPadrao,
      cep: String(item.cep ?? "").trim() || null,
      endereco: String(item.endereco ?? "").trim() || null,
      numero: String(item.numero ?? "").trim() || null,
      bairro: String(item.bairro ?? "").trim() || null,
      cidade: String(item.cidade ?? "").trim() || null,
      uf:
        String(item.uf ?? "")
          .trim()
          .toUpperCase() || null,
      origem: String(item.origem ?? "").trim() || "importacao_planilha",
      observacoes: String(item.observacoes ?? "").trim() || null,
    };

    let motivo: string | null = null;
    try {
      motivo = await idDuplicado(d, email, telefone, vistos);
    } catch (e: any) {
      // Falhar em descobrir duplicata é aceitável; travar a importação inteira
      // por causa da checagem não é. O INSERT ainda protege a base.
      console.warn(`[marketing] duplicidade não verificada na linha ${i + 1}:`, e?.message ?? e);
    }
    if (motivo) {
      const existenteId = atualizarExistentes
        ? await idContatoPorEmailOuTelefone(email, telefone)
        : null;
      if (existenteId) {
        // Reimportar atualiza (tipo incluído), então a lista não fica velha
        // depois de importar a segunda vez com outro tipo.
        await reimportarMarketingContato(existenteId, registro);
        atualizados++;
        inseridosIds.push(existenteId);
        if (email) vistos.set(email, true);
        if (telefone) vistos.set(telefone, true);
        continue;
      }
      duplicados++;
      erros.push(`Linha ${i + 1}: ignorada, ${motivo}.`);
      continue;
    }

    const r = await d.execute(
      sql`INSERT INTO marketing_contatos (nome,email,telefone,empresa,tipo,cep,endereco,numero,bairro,cidade,uf,origem,observacoes)
          VALUES (${registro.nome},${registro.email},${registro.telefone},${registro.empresa},${registro.tipo},${registro.cep},${registro.endereco},${registro.numero},${registro.bairro},${registro.cidade},${registro.uf},${registro.origem},${registro.observacoes})
          RETURNING id`,
    );
    const linha = rowsOf(r)[0];
    if (linha) {
      if (email) vistos.set(email, true);
      if (telefone) vistos.set(telefone, true);
      inseridos++;
      // Guarda o id para a UI mostrar o que entrou, sem depender da query
      // cache invalidar (a invalidação por prefixo não estava surtindo).
      if (linha.id) inseridosIds.push(String(linha.id));
    }
  }
  return { inseridos, duplicados, invalidos, atualizados, erros, inseridosIds };
}

/**
 * Atualiza os campos editáveis de um contato.
 *
 * Existe porque a lista de lojistas muda de natureza: o mesmo contato hoje é
 * prospect e amanhã é lojista ou comprador. Sem editar, a única forma de
 * "promover" alguém era importar outra planilha — e a importação tratava a
 * linha como duplicada e a descartava.
 */
export async function atualizarMarketingContato(id: string, dados: Partial<ItemImportacao>) {
  const d = requireDb();
  await ensureMarketingSchema();
  const atual = rowsOf(
    await d.execute(sql`SELECT * FROM marketing_contatos WHERE id = ${id}::uuid LIMIT 1`),
  )[0];
  if (!atual) throw new Error("Contato não encontrado.");

  // Só grava o que veio preenchido: editar um campo não apaga os outros.
  const pegou = (campo: keyof ItemImportacao, coluna: string) => {
    const v = dados[campo];
    return v === undefined ? sql.raw(coluna) : sql`${typeof v === "string" ? v.trim() : v}`;
  };

  const email = dados.email === undefined ? atual.email : dados.email;
  const telefone = dados.telefone === undefined ? atual.telefone : (dados.telefone ?? null);

  // Duplicidade só é problema quando muda para um valor que outro contato já usa.
  const conflito = rowsOf(
    await d.execute(sql`
      SELECT id FROM marketing_contatos
      WHERE id <> ${id}::uuid
        AND (
          (${email}::text IS NOT NULL AND lower(email) = ${email})
          OR (${telefone}::text IS NOT NULL AND telefone = ${telefone})
        )
      LIMIT 1
    `),
  )[0];
  if (conflito) throw new Error("Já existe outro contato com este e-mail ou telefone.");

  const linhas = await d.execute(sql`
    UPDATE marketing_contatos SET
      nome = ${pegou("nome", "nome")},
      email = ${email},
      telefone = ${telefone},
      empresa = ${pegou("empresa", "empresa")},
      tipo = ${pegou("tipo", "tipo")},
      cep = ${pegou("cep", "cep")},
      endereco = ${pegou("endereco", "endereco")},
      numero = ${pegou("numero", "numero")},
      bairro = ${pegou("bairro", "bairro")},
      cidade = ${pegou("cidade", "cidade")},
      uf = ${pegou("uf", "uf")},
      observacoes = ${pegou("observacoes", "observacoes")},
      atualizado_em = now()
    WHERE id = ${id}::uuid
    RETURNING *
  `);
  const salvo = rowsOf(linhas)[0];
  if (!salvo) throw new Error("Contato não encontrado.");
  return salvo;
}

/** Remove um contato e seus vínculos de tag. */
export async function excluirMarketingContato(id: string) {
  const d = requireDb();
  await ensureMarketingSchema();
  await d.execute(sql`DELETE FROM marketing_contato_tags WHERE contato_id = ${id}::uuid`);
  const r = await d.execute(
    sql`DELETE FROM marketing_contatos WHERE id = ${id}::uuid RETURNING id`,
  );
  if (!rowsOf(r)[0]) throw new Error("Contato não encontrado.");
  return { ok: true as const };
}

/**
 * Remove em lote os contatos que a verificação marcou como "não é WhatsApp".
 * Os registros com erro de verificação ('erro') ficam de fora: nesses o Uazapi
 * não respondeu, então apagá-los jogaria fora contato possivelmente válido.
 */
export async function removerContatosSemWhatsapp() {
  const d = requireDb();
  await ensureMarketingSchema();
  // Primeiro os vínculos (etiquetas), depois os contatos: a ordem importa
  // porque marketing_contato_tags aponta para o contato.
  await d.execute(sql`
    DELETE FROM marketing_contato_tags
    WHERE contato_id IN (SELECT id FROM marketing_contatos WHERE whatsapp_status = 'invalido')
  `);
  const r = await d.execute(
    sql`DELETE FROM marketing_contatos WHERE whatsapp_status = 'invalido' RETURNING id`,
  );
  return { removidos: rowsOf(r).length };
}

/**
 * Id do contato que já ocupa este e-mail/telefone.
 *
 * Separado de `idDuplicado` porque aqui o chamador quer atualizar, não
 * descartar: precisa saber *qual* registro sobrescrever.
 */
async function idContatoPorEmailOuTelefone(
  email: string | null,
  telefone: string | null,
): Promise<string | null> {
  const d = requireDb();
  const clausulas = [
    email ? sql`lower(c.email) = ${email}` : null,
    telefone ? sql`c.telefone = ${telefone}` : null,
  ].filter((c): c is ReturnType<typeof sql> => c !== null);
  if (!clausulas.length) return null;
  for (const clausula of clausulas) {
    const linha = rowsOf(
      await d.execute(sql`SELECT c.id FROM marketing_contatos c WHERE ${clausula} LIMIT 1`),
    )[0];
    if (linha?.id) return String(linha.id);
  }
  return null;
}

/**
 * Reimporta uma linha que já existe como atualização em vez de descartá-la.
 *
 * Usado pela importação: quando o e-mail/telefone bate, os dados da planilha
 * sobrescrevem o contato (e o tipo vira o escolhido no diálogo), então Importar
 * duas vezes a mesma lista não deixa a base velha para trás.
 */
export async function reimportarMarketingContato(
  id: string,
  registro: ItemImportacao,
): Promise<void> {
  const d = requireDb();
  await d.execute(sql`
    UPDATE marketing_contatos SET
      nome = ${registro.nome},
      email = ${registro.email},
      telefone = ${registro.telefone},
      empresa = ${registro.empresa},
      tipo = ${registro.tipo},
      cep = ${registro.cep},
      endereco = ${registro.endereco},
      numero = ${registro.numero},
      bairro = ${registro.bairro},
      cidade = ${registro.cidade},
      uf = ${registro.uf},
      origem = ${registro.origem},
      observacoes = ${registro.observacoes},
      atualizado_em = now()
    WHERE id = ${id}::uuid
  `);
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

/**
 * Etiquetas com quantas pessoas estão em cada uma.
 *
 * A campanha precisa escolher "só quem tem esta etiqueta", e sem a contagem a
 * tela mostrava a tag sem dizer se ela tem 0 ou 200 contatos.
 */
export async function listarMarketingTags() {
  const d = requireDb();
  await ensureMarketingSchema();
  return rowsOf(
    await d.execute(sql`
      SELECT t.*, (
        SELECT count(*) FROM marketing_contato_tags ct WHERE ct.tag_id = t.id
      ) AS total
      FROM marketing_tags t
      ORDER BY t.nome
    `),
  );
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
 * Tira uma etiqueta de um contato. O diálogo de edição precisa das duas mãos:
 * `atribuirMarketingTag` só entra em massa, e sem esta função não havia como
 * remover uma etiqueta já existente na tela de detalhe.
 */
export async function removerMarketingTag(contatoId: string, tagId: string) {
  const d = requireDb();
  await ensureMarketingSchema();
  await d.execute(
    sql`DELETE FROM marketing_contato_tags WHERE contato_id = ${contatoId}::uuid AND tag_id = ${tagId}::uuid`,
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
           ('uazapi_token', '', 'Token da instância Uazapi (enviado no header token)'),
           ('uazapi_grupos_permitidos', '[]', 'Lista de JIDs @g.us permitidos para aparecer em automações e campanhas')
    ON CONFLICT (chave) DO NOTHING
  `);
  const rows = rowsOf(
    await d.execute(
      sql`SELECT chave, valor FROM configuracoes_sistema WHERE chave IN ('uazapi_base_url','uazapi_token','uazapi_grupos_permitidos')`,
    ),
  );
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.chave] = r.valor || "";
  return cfg;
}

/** Salva quais grupos da Uazapi podem ser usados em automações e campanhas. */
export async function salvarUazapiGruposPermitidos(grupos: string[]) {
  const d = requireDb();
  await ensureMarketingSchema();
  const lista = Array.isArray(grupos) ? grupos.filter((g) => typeof g === "string" && g.includes("@g.us")) : [];
  await d.execute(sql`
    INSERT INTO configuracoes_sistema (chave, valor, atualizado_em)
    VALUES ('uazapi_grupos_permitidos', ${JSON.stringify(lista)}::jsonb, now())
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
  `);
  return { ok: true, grupos: lista };
}

export async function salvarUazapiConfig(base_url: string, token: string) {
  const d = requireDb();
  await ensureMarketingSchema();
  // Não grava config que não conecta: o token da instância é validado contra
  // ela antes do INSERT, senão o 401 só apareceria na hora de verificar.
  const teste = await validarConexaoUazapi(base_url, token);
  if (!teste.ok) throw new Error(teste.erro);
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

/**
 * Testa URL + token contra a instância de verdade antes de gravar.
 *
 * O 401 da Uazapi aparecia só no meio da verificação de números, quando
 * dezenas de contatos já estavam em fila — e a mensagem crua não dizia que o
 * problema era o token. Aqui ele é pego na hora de salvar, com o motivo claro.
 * `GET /instance/status` é barato e responde com o estado da conexão.
 */
export async function validarConexaoUazapi(base_url: string, token: string) {
  const base = (base_url || "").trim().replace(/\/+$/, "");
  const tok = (token || "").trim();

  if (!base) return { ok: false as const, erro: "Informe a URL da instância." };
  if (!/^https?:\/\//i.test(base))
    return { ok: false as const, erro: "A URL precisa começar com http:// ou https://." };
  if (!tok) return { ok: false as const, erro: "Informe o token da instância." };

  const ctrl = new AbortController();
  const esgotou = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${base}/instance/status`, {
      method: "GET",
      headers: { Accept: "application/json", token: tok },
      signal: ctrl.signal,
    });

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false as const,
        erro:
          "Token recusado pela instância (HTTP 401/403). " +
          "Confirme se o token é o desta instância — na Uazapi cada número conectado tem o seu.",
      };
    }
    if (res.status === 404) {
      return {
        ok: false as const,
        erro:
          "A URL respondeu, mas não achou a instância (HTTP 404). " +
          "Confira a URL: ela aponta para a instância correta (ex: https://gleego.uazapi.com)?",
      };
    }
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      return { ok: false as const, erro: `Uazapi retornou HTTP ${res.status}: ${texto.slice(0, 200)}` };
    }

    const dados: any = await res.json().catch(() => ({}));
    // A Uazapi varia o nome do campo entre versões; aceita os mais comuns.
    const status = String(
      dados?.status?.status ?? dados?.status ?? dados?.instance?.status ?? "",
    ).toLowerCase();
    const conectado = status === "" ? true : status === "connected";
    return {
      ok: true as const,
      conectado,
      instancia: dados?.instance?.name ?? dados?.name ?? null,
      telefone: dados?.instance?.owner ?? dados?.owner ?? null,
      status,
    };
  } catch (e: any) {
    if (e?.name === "AbortError")
      return { ok: false as const, erro: "A instância não respondeu em 15s. Confira a URL." };
    return { ok: false as const, erro: `Não foi possível falar com a instância: ${e?.message || e}` };
  } finally {
    clearTimeout(esgotou);
  }
}

function normalizarTelefone(telefone: string): string | null {
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 13) return null;
  // Assume Brasil quando não há DDI (10-11 dígitos)
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

/**
 * O id do grupo é o JID "120363...@g.us", mas a Uazapi muda o nome do campo
 * entre versões (id, jid, remoteJid, groupJid, group_id...). Procuramos em
 * todos e devolvemos o primeiro que traga @g.us — sem isso uma versão nova
 * entregava a lista com id vazio, o filtro jogava tudo fora e a tela ficava
 * sem nenhum grupo para selecionar.
 */
function normalizarIdGrupo(g: any): string {
  const candidatos = [
    g?.id,
    g?.jid,
    g?.remoteJid,
    g?.remote_jid,
    g?.groupJid,
    g?.group_jid,
    g?.group_id,
    g?.groupId,
    g?.group?.jid,
    g?.group?.id,
  ];
  for (const c of candidatos) {
    const s = String(c ?? "").trim();
    if (s.includes("@g.us")) return s;
  }
  return "";
}

/**
 * Lista os grupos que a instância Uazapi participa.
 *
 * Caminho oficial (docs Uazapi): POST /group/list com
 * {"limit","offset","noParticipants"}, lista em `groups`, paginado.
 * Versões antigas ainda aceitam GET em /group/all e /chats — ficam de reserva.
 * O formato do id ("120363...@g.us") é o que o envio espera em POST /send/text.
 */
export async function listarGruposUazapi() {
  const cfg = await getUazapiConfig();
  const base = (cfg.uazapi_base_url || "").trim().replace(/\/+$/, "");
  const token = (cfg.uazapi_token || "").trim();
  if (!base || !token)
    throw new Error("Configure a URL e o token da instância Uazapi antes de listar grupos.");

  // 8s por tentativa: em sequência, várias rotas deixavam o botão em
  // "Carregando..." por quase um minuto antes de qualquer resposta.
  const TIMEOUT_MS = 8000;
  let ultimoMotivo = "";

  const lerResposta = async (res: Response, rota: string) => {
    if (res.status === 401 || res.status === 403)
      throw new Error(
        "Token recusado pela instância (HTTP 401/403). Confira em Marketing > Configurar.",
      );
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      return { erro: `Uazapi retornou HTTP ${res.status} em ${rota}: ${texto.slice(0, 200)}` };
    }
    const dados: any = await res.json().catch(() => null);
    if (!dados) return { erro: `${rota} respondeu sem JSON utilizável.` };
    // A lista pode vir direto, em {groups: []}, {data: []} ou {response: []}.
    // Algumas versões devolvem a lista em `chats` com os grupos como chaves do
    // objeto ({ "120363...@g.us": {...} }), não como array — o Array.isArray
    // deixava esses grupos invisíveis. Por isso as chaves também entram na lista.
    const bruta: any[] = Array.isArray(dados)
      ? dados
      : Array.isArray(dados?.groups)
        ? dados.groups
        : Array.isArray(dados?.data)
          ? dados.data
          : Array.isArray(dados?.response)
            ? dados.response
            : [];
    const deChats = Object.entries(dados?.chats ?? {})
      .filter(([k]) => k.includes("@g.us"))
      .map(([k, v]: [string, any]) => ({ ...(v ?? {}), id: k, jid: k, remoteJid: k }));
    const grupos = [...bruta, ...deChats]
      .map((g: any) => ({
        id: normalizarIdGrupo(g),
        nome: String(
          g?.name ?? g?.subject ?? g?.groupName ?? g?.groupMetadata?.subject ?? "Grupo sem nome",
        ),
        participantes: Number(
          g?.participants_count ??
            g?.size ??
            g?.participants?.length ??
            g?.groupMetadata?.size ??
            0,
        ),
      }))
      .filter((g) => g.id.includes("@g.us"));
    return { grupos };
  };

  // 1) Rota oficial: POST paginado. O offset é obrigatório — a lista vem em
  //    páginas e sem ele ficava preso na primeira (ou vinha vazia).
  const PAGINA = 100;
  const achados: { id: string; nome: string; participantes: number }[] = [];
  for (let offset = 0, paginas = 0; paginas < 20; offset += PAGINA, paginas++) {
    const ctrl = new AbortController();
    const esgotou = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/group/list`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", token },
        body: JSON.stringify({ limit: PAGINA, offset, noParticipants: true }),
        signal: ctrl.signal,
      });
      if (res.status === 404) {
        ultimoMotivo = "/group/list não existe nesta versão (HTTP 404).";
        break; // versão antiga: cai para as rotas GET de reserva
      }
      const r = await lerResposta(res, "/group/list");
      if (r.erro) {
        ultimoMotivo = r.erro;
        break;
      }
      achados.push(...r.grupos!);
      // Página veio menor que o pedido: acabou a lista.
      if (r.grupos!.length < PAGINA) break;
    } catch (e: any) {
      if (e?.name === "AbortError") {
        ultimoMotivo = `A instância não respondeu em ${TIMEOUT_MS / 1000}s em /group/list.`;
        break;
      }
      throw e;
    } finally {
      clearTimeout(esgotou);
    }
  }
  if (achados.length) return achados;

  // 2) Reserva: a Uazapi muda a rota de listagem entre versões. POST /group/list
  //    é a atual; tentamos variações comuns antes de falhar.
  for (const rota of [
    "/chats",
    "/list-chats",
    "/groups/list",
    "/group/fetch",
    "/groups",
    "/group/all",
    "/chat/all",
    "/chats/groups",
  ]) {
    const ctrl = new AbortController();
    const esgotou = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${rota}`, {
        method: "GET",
        headers: { Accept: "application/json", token },
        signal: ctrl.signal,
      });
      if (res.status === 404) {
        ultimoMotivo = `${rota} não existe nesta versão (HTTP 404).`;
        continue;
      }
      if (res.status === 405) {
        ultimoMotivo = `${rota} não aceita GET (HTTP 405).`;
        continue;
      }
      const r = await lerResposta(res, rota);
      if (r.erro) {
        ultimoMotivo = r.erro;
        continue;
      }
      if (r.grupos!.length) return r.grupos;
      ultimoMotivo = `${rota} respondeu, mas sem nenhum grupo (@g.us) na lista.`;
    } catch (e: any) {
      if (e?.name === "AbortError") {
        ultimoMotivo = `A instância não respondeu em ${TIMEOUT_MS / 1000}s em ${rota}.`;
        continue;
      }
      throw e;
    } finally {
      clearTimeout(esgotou);
    }
  }

  // 3) Algumas versões exigem POST nas rotas de listagem de grupos/chats
  //    (/chats já foi retirado daqui; /list-chats varia entre versões, evitar POST aqui)
  for (const rota of ["/group/list", "/group/all", "/groups/list"]) {
    const ctrl = new AbortController();
    const esgotou = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${rota}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", token },
        body: JSON.stringify({}),
        signal: ctrl.signal,
      });
      if (res.status === 404) {
        ultimoMotivo = `${rota} (POST) não existe nesta versão (HTTP 404).`;
        continue;
      }
      if (res.status === 405) {
        ultimoMotivo = `${rota} (POST) não aceita POST (HTTP 405).`;
        continue;
      }
      const r = await lerResposta(res, `${rota} (POST)`);
      if (r.erro) {
        ultimoMotivo = r.erro;
        continue;
      }
      if (r.grupos!.length) return r.grupos;
      ultimoMotivo = `${rota} (POST) respondeu, mas sem nenhum grupo (@g.us) na lista.`;
    } catch (e: any) {
      if (e?.name === "AbortError") {
        ultimoMotivo = `A instância não respondeu em ${TIMEOUT_MS / 1000}s em ${rota} (POST).`;
        continue;
      }
      throw e;
    } finally {
      clearTimeout(esgotou);
    }
  }
  throw new Error(
    `Nenhum grupo encontrado: ${ultimoMotivo || "nenhuma rota respondeu"} ` +
      "Confira se a instância está conectada e se este número participa de algum grupo.",
  );
}

/**
 * Envia texto livre pela instância Uazapi — o caminho que aceita grupos
 * ("120363...@g.us") e que não depende de template aprovado pela Meta.
 * A Meta não aceita template para grupo; por isso a campanha que mira grupo
 * precisa sair por aqui, e não pelo serviço da Meta.
 */
export async function enviarTextoUazapi(alvo: string, texto: string) {
  const cfg = await getUazapiConfig();
  const base = (cfg.uazapi_base_url || "").trim().replace(/\/+$/, "");
  const token = (cfg.uazapi_token || "").trim();
  if (!base || !token) throw new Error("Instância Uazapi não configurada.");

  const ctrl = new AbortController();
  const esgotou = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${base}/send/text`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token,
      },
      body: JSON.stringify({
        number: alvo,
        text: texto,
        // A Uazapi exige desfazer a marcação de "vizualizado" em alguns planos;
        // sem ler o texto cru de novo, manter o default é suficiente.
      }),
      signal: ctrl.signal,
    });
    const dados: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detalhe = dados?.message || (await res.text().catch(() => ""));
      const err = new Error(
        res.status === 401 || res.status === 403
          ? "Token recusado pela instância (HTTP 401). Confira em Marketing > Configurar."
          : `Uazapi retornou HTTP ${res.status}: ${String(detalhe).slice(0, 200)}`,
      ) as any;
      err.permanente = res.status === 400 || res.status === 404;
      throw err;
    }
    const msgId = dados?.id ?? dados?.messageId ?? dados?.key?.id ?? null;
    return { ok: true as const, id: msgId ? String(msgId) : null };
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("A instância não respondeu em 30s (timeout).");
    throw e;
  } finally {
    clearTimeout(esgotou);
  }
}

/**
 * Envia imagem (ou documento) via POST /send/media da Uazapi com legenda opcional.
 * `file` pode ser URL pública ou base64 — o motor de grupos passa a foto de capa
 * (Storage público) e o texto montado como legenda.
 */
export async function enviarMidiaUazapi(alvo: string, file: string, texto?: string) {
  const cfg = await getUazapiConfig();
  const base = (cfg.uazapi_base_url || "").trim().replace(/\/+$/, "");
  const token = (cfg.uazapi_token || "").trim();
  if (!base || !token) throw new Error("Instância Uazapi não configurada.");
  if (!file) throw new Error("Informe a imagem (URL ou base64) a enviar.");

  const ctrl = new AbortController();
  const esgotou = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`${base}/send/media`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        token,
      },
      body: JSON.stringify({
        number: alvo,
        type: "image",
        file,
        text: texto || "",
        docName: "",
      }),
      signal: ctrl.signal,
    });
    const dados: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detalhe = dados?.message || (await res.text().catch(() => ""));
      const err = new Error(
        res.status === 401 || res.status === 403
          ? "Token recusado pela instância (HTTP 401). Confira em Marketing > Configurar."
          : `Uazapi retornou HTTP ${res.status}: ${String(detalhe).slice(0, 200)}`,
      ) as any;
      err.permanente = res.status === 400 || res.status === 404;
      throw err;
    }
    const msgId = dados?.id ?? dados?.messageId ?? dados?.key?.id ?? null;
    return { ok: true as const, id: msgId ? String(msgId) : null };
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("A instância não respondeu em 30s (timeout).");
    throw e;
  } finally {
    clearTimeout(esgotou);
  }
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
    // O 401 aqui quase sempre é token de outra instância (ou token global da
    // Uazapi, que não vale como credencial da instância). A mensagem precisa
    // dizer isso — "Invalid token" crua não indica onde arrumar.
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Token recusado pela instância da Uazapi (HTTP 401). Use o token desta instância, " +
          "não o token global — confira em Configurar > Verificação de WhatsApp.",
      );
    }
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
