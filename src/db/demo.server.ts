import { sql } from "drizzle-orm";
import { db } from "./index";
import { hashPassword } from "./auth.server";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

/** IDs fixos para o ambiente de demonstração (idempotente). */
export const DEMO = {
  vendedorId: "11111111-1111-4111-8111-111111111111",
  compradorId: "22222222-2222-4222-8222-222222222222",
  vistoriadorUserId: "33333333-3333-4333-8333-333333333333",
  vistoriadorId: "44444444-4444-4444-8444-444444444444",
  unidadeId: "55555555-5555-4555-8555-555555555555",
  veiculoId: "66666666-6666-4666-8666-666666666666",
  senha: "demo1234",
  emailVendedor: "vendedor.demo@essejafoi.com.br",
  emailComprador: "comprador.demo@essejafoi.com.br",
  emailVistoriador: "vistoriador.demo@essejafoi.com.br",
  placa: "DEM0A11",
};

async function colunasDe(tabela: string): Promise<Map<string, string>> {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tabela}
  `);
  return new Map(rowsOf(res).map((r: any) => [String(r.column_name), String(r.data_type)]));
}

/** UPSERT tolerante: usa apenas colunas que existem de fato na tabela. */
async function upsert(tabela: string, id: string, valores: Record<string, any>) {
  const d = requireDb();
  const existentes = await colunasDe(tabela);
  const colunas: string[] = ["id"];
  const parts: any[] = [sql`${id}::uuid`];
  for (const [col, val] of Object.entries(valores)) {
    const tipo = existentes.get(col);
    if (!tipo) continue;
    colunas.push(col);
    if (typeof val === "string" && (tipo === "jsonb" || tipo === "json")) {
      parts.push(sql`${val}::jsonb`);
    } else if (typeof val === "string" && (tipo === "integer" || tipo === "numeric")) {
      parts.push(sql`${val}::numeric`);
    } else {
      parts.push(sql`${val}`);
    }
  }
  const sets = colunas
    .filter((c) => c !== "id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");
  await d.execute(sql`
    INSERT INTO ${sql.raw(tabela)} (${sql.raw(colunas.join(", "))})
    VALUES (${sql.join(parts, sql`, `)})
    ON CONFLICT (id) DO UPDATE SET ${sql.raw(sets || "id = EXCLUDED.id")}
  `);
}


async function ensureSchemas() {
  const { ensurePerfilSchema } = await import("./perfil.server");
  const { ensureCadastroSchema } = await import("./cadastro.server");
  const { ensureVeiculosAdminSchema } = await import("./admin-veiculos.server");
  const { ensureVistoriaSchema } = await import("./vistorias.server");
  const { ensurePublicacaoSchema } = await import("./publicacao.server");
  const { ensureLeilaoSchema } = await import("./leilao.server");
  const { ensureCompradorSchema } = await import("./comprador.server");

  for (const fn of [
    ensurePerfilSchema,
    ensureCadastroSchema,
    ensureVeiculosAdminSchema,
    ensureCompradorSchema,
    ensureVistoriaSchema,
    ensurePublicacaoSchema,
    ensureLeilaoSchema,
  ]) {
    try {
      await (fn as any)();
    } catch (e: any) {
      console.error("[demo] ensure schema:", e?.message || e);
    }
  }
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cria (ou atualiza) o ambiente de demonstração completo:
 * vendedor aprovado, comprador habilitado, unidade + vistoriador,
 * veículo aprovado e liberado para vistoria, com vistoria confirmada.
 */
export async function semearAmbienteDemo() {
  const d = requireDb();
  await ensureSchemas();
  const senhaHash = await hashPassword(DEMO.senha);

  // Garante os valores de papel usados abaixo.
  for (const papel of ["vendedor", "comprador", "vistoriador"]) {
    await d
      .execute(sql.raw(`ALTER TYPE app_role ADD VALUE IF NOT EXISTS '${papel}'`))
      .catch(() => {});
  }

  // 1. Vendedor demo (compliance aprovado)
  await upsert("profiles", DEMO.vendedorId, {
    nome: "Vendedor Demonstração",
    email: DEMO.emailVendedor,
    senha_hash: senhaHash,
    role: sql`'vendedor'::app_role` as any,
    whatsapp: "11999990001",
    cpf: "12345678909",
    cep: "01310100",
    endereco: "Av. Paulista, 1000",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP",
    ativo: true,
    status_compliance: "APROVADO",
    cadastro_completo: true,
    documento_cnh_url: "https://placehold.co/600x400?text=CNH",
    documento_selfie_url: "https://placehold.co/600x400?text=Selfie",
    documento_comprovante_url: "https://placehold.co/600x400?text=Comprovante",
  });


  // 2. Comprador demo (pode ver valores e dar lances)
  await upsert("profiles", DEMO.compradorId, {
    nome: "Comprador Demonstração",
    email: DEMO.emailComprador,
    senha_hash: senhaHash,
    role: sql`'comprador'::app_role` as any,
    whatsapp: "11999990002",
    tipo_pessoa: "PJ",
    cnpj: "12345678000199",
    razao_social: "Loja Demo Veículos LTDA",
    responsavel_nome: "Responsável Demo",
    responsavel_cpf: "98765432100",
    cidade: "São Paulo",
    uf: "SP",
    ativo: true,
    status_compliance: "APROVADO",
    pode_ver_valores: true,
    pode_dar_lances: true,
    cadastro_completo: true,
  });

  // 3. Vistoriador demo
  await upsert("profiles", DEMO.vistoriadorUserId, {
    nome: "Vistoriador Demonstração",
    email: DEMO.emailVistoriador,
    senha_hash: senhaHash,
    role: sql`'vistoriador'::app_role` as any,
    whatsapp: "11999990003",
    cidade: "São Paulo",
    uf: "SP",
    ativo: true,
  });

  // 4. Unidade de vistoria
  await upsert("unidades_vistoria", DEMO.unidadeId, {
    nome: "Unidade Demo - Paulista",
    cep: "01310100",
    endereco: "Av. Paulista, 1000",
    cidade: "São Paulo",
    estado: "SP",
    telefone: "1140000000",
    responsavel: "Equipe Demo",
    duracao_padrao_minutos: 60,
    intervalo_entre_vistorias_minutos: 30,
    ativo: true,
  });

  await d.execute(sql`
    INSERT INTO vistoriadores (id, usuario_id, unidade_id, status, dias_trabalho)
    VALUES (${DEMO.vistoriadorId}::uuid, ${DEMO.vistoriadorUserId}::uuid, ${DEMO.unidadeId}::uuid, 'ATIVO', ARRAY[1,2,3,4,5,6,0])
    ON CONFLICT (usuario_id) DO UPDATE SET unidade_id = EXCLUDED.unidade_id, status = 'ATIVO'
  `);

  // 5. Veículo demo já aprovado na análise cadastral
  await upsert("veiculos", DEMO.veiculoId, {
    placa: DEMO.placa,
    marca: "CHEVROLET",
    modelo: "ONIX",
    versao: "1.0 LT",
    ano_fabricacao: "2021",
    ano_modelo: "2022",
    cor: "Prata",
    km: 42000,
    combustivel: "Flex",
    cambio: "Manual",
    renavam: "12345678901",
    valor_fipe: "62000",
    valor_interesse_cliente: "58000",
    cep: "01310100",
    endereco: "Av. Paulista, 1000",
    cidade: "São Paulo",
    uf: "SP",
    perfil_id: DEMO.vendedorId,
    vendedor_id: DEMO.vendedorId,
    documento_crlv_url: "https://placehold.co/600x400?text=CRLV",
    fotos: JSON.stringify([
      "https://placehold.co/800x600?text=Frente",
      "https://placehold.co/800x600?text=Lateral",
      "https://placehold.co/800x600?text=Interior",
    ]),
    status: "PRONTO_PARA_VISTORIA",
    status_analise: "PRONTO_PARA_VISTORIA",
  });

  // 6. Vistoria confirmada para hoje
  await criarOuReaproveitarVistoriaDemo();

  return {
    ok: true as const,
    credenciais: {
      vendedor: { email: DEMO.emailVendedor, senha: DEMO.senha },
      comprador: { email: DEMO.emailComprador, senha: DEMO.senha },
      vistoriador: { email: DEMO.emailVistoriador, senha: DEMO.senha },
    },
    veiculo_id: DEMO.veiculoId,
    placa: DEMO.placa,
  };
}

async function criarOuReaproveitarVistoriaDemo() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT id::text as id FROM vistorias
    WHERE veiculo_id = ${DEMO.veiculoId}::uuid
    ORDER BY criado_em DESC LIMIT 1
  `);
  const existente = rowsOf(res)[0]?.id;

  if (existente) {
    await d.execute(sql`
      UPDATE vistorias
      SET status = 'CONFIRMADA', data_vistoria = ${hoje()}, horario_vistoria = '09:00',
          vistoriador_id = ${DEMO.vistoriadorId}::uuid, atualizado_em = now()
      WHERE id = ${existente}::uuid
    `);
    return existente as string;
  }

  const nova = await d.execute(sql`
    INSERT INTO vistorias (veiculo_id, vendedor_id, unidade_id, vistoriador_id, data_vistoria, horario_vistoria, status, criado_por)
    VALUES (${DEMO.veiculoId}::uuid, ${DEMO.vendedorId}::uuid, ${DEMO.unidadeId}::uuid, ${DEMO.vistoriadorId}::uuid,
            ${hoje()}, '09:00', 'CONFIRMADA', ${DEMO.vendedorId}::uuid)
    RETURNING id::text as id
  `);
  return rowsOf(nova)[0]?.id as string;
}

/** Apaga o laudo/checklist do veículo demo e devolve a vistoria para execução. */
export async function resetarChecklistDemo() {
  const d = requireDb();
  await ensureSchemas();

  await d.execute(sql`
    DELETE FROM laudos WHERE veiculo_id = ${DEMO.veiculoId}::uuid
  `);
  await d.execute(sql`
    UPDATE veiculos SET status = 'PRONTO_PARA_VISTORIA', status_analise = 'PRONTO_PARA_VISTORIA', atualizado_em = now()
    WHERE id = ${DEMO.veiculoId}::uuid
  `);
  const vistoriaId = await criarOuReaproveitarVistoriaDemo();
  return { ok: true as const, vistoria_id: vistoriaId };
}

/** Aprova a análise pós-vistoria do veículo demo e libera os 3 canais de divulgação. */
export async function aprovarChecklistDemo(valor?: number) {
  const d = requireDb();
  await ensureSchemas();

  await d.execute(sql`
    UPDATE veiculos
    SET status = 'PRONTO_PARA_ANUNCIO',
        status_analise = 'PRONTO_PARA_ANUNCIO',
        valor_fipe = COALESCE(valor_fipe, 62000),
        atualizado_em = now()
    WHERE id = ${DEMO.veiculoId}::uuid
  `);

  const titulo = "Chevrolet Onix 1.0 LT 2022 - Demonstração";
  const descricao =
    "Veículo de demonstração aprovado na vistoria. Use esta ficha para validar leilão, anúncio e vitrine.";

  for (const canal of ["LEILAO", "ANUNCIO", "VITRINE"]) {
    await d.execute(sql`
      INSERT INTO publicacao_canais (veiculo_id, canal, ativo, titulo, descricao, fotos)
      VALUES (${DEMO.veiculoId}::uuid, ${canal}, false, ${titulo}, ${descricao}, '[]'::jsonb)
      ON CONFLICT (veiculo_id, canal) DO NOTHING
    `);
  }

  if (valor && valor > 0) {
    await d.execute(sql`
      UPDATE veiculos SET valor_fipe = ${String(valor)} WHERE id = ${DEMO.veiculoId}::uuid
    `);
  }

  return { ok: true as const };
}

/** Cria/reinicia um leilão ativo de 24h para o veículo demo. */
export async function criarLeilaoDemo(horas = 24) {
  const d = requireDb();
  await ensureSchemas();
  await aprovarChecklistDemo();

  await d.execute(sql`
    UPDATE leiloes SET status = 'CANCELADO', atualizado_em = now()
    WHERE veiculo_id = ${DEMO.veiculoId}::uuid AND status IN ('RASCUNHO','AGENDADO','ATIVO','PRORROGADO','PAUSADO')
  `);

  const res = await d.execute(sql`
    INSERT INTO leiloes (
      veiculo_id, inicio_em, fim_em, lance_inicial, incremento_minimo,
      prorrogacao_ativa, prorrogacao_janela_segundos, prorrogacao_tempo_segundos, status
    ) VALUES (
      ${DEMO.veiculoId}::uuid, now(), now() + (${String(horas)} || ' hours')::interval,
      45000, 500, true, 120, 120, 'ATIVO'
    ) RETURNING id::text as id
  `);

  await d.execute(sql`
    UPDATE veiculos SET status_analise = 'EM_LEILAO', status = 'EM_LEILAO', atualizado_em = now()
    WHERE id = ${DEMO.veiculoId}::uuid
  `);

  await d.execute(sql`
    UPDATE publicacao_canais SET ativo = true, atualizado_em = now()
    WHERE veiculo_id = ${DEMO.veiculoId}::uuid AND canal = 'LEILAO'
  `);

  return { ok: true as const, leilao_id: rowsOf(res)[0]?.id };
}

/** Estado atual do ambiente demo (para a tela do admin). */
export async function statusAmbienteDemo() {
  const d = requireDb();
  await ensureSchemas();

  const vRes = await d.execute(sql`
    SELECT id::text as id, placa, marca, modelo, status, status_analise
    FROM veiculos WHERE id = ${DEMO.veiculoId}::uuid
  `);
  const veiculo = rowsOf(vRes)[0] || null;

  const visRes = await d.execute(sql`
    SELECT id::text as id, status, data_vistoria, horario_vistoria
    FROM vistorias WHERE veiculo_id = ${DEMO.veiculoId}::uuid
    ORDER BY criado_em DESC LIMIT 1
  `);

  const laudoRes = await d.execute(sql`
    SELECT l.id::text as id, l.status,
      (SELECT count(*)::int FROM laudo_checklist lc WHERE lc.laudo_id = l.id) as itens
    FROM laudos l WHERE l.veiculo_id = ${DEMO.veiculoId}::uuid
    ORDER BY l.criado_em DESC LIMIT 1
  `);

  const leilaoRes = await d.execute(sql`
    SELECT id::text as id, status, fim_em, lance_inicial,
      (SELECT count(*)::int FROM lances WHERE lances.leilao_id = leiloes.id) as lances
    FROM leiloes WHERE veiculo_id = ${DEMO.veiculoId}::uuid
    ORDER BY criado_em DESC LIMIT 1
  `);

  const canaisRes = await d.execute(sql`
    SELECT canal, ativo FROM publicacao_canais WHERE veiculo_id = ${DEMO.veiculoId}::uuid
  `);

  return {
    ok: true as const,
    existe: !!veiculo,
    veiculo,
    vistoria: rowsOf(visRes)[0] || null,
    laudo: rowsOf(laudoRes)[0] || null,
    leilao: rowsOf(leilaoRes)[0] || null,
    canais: rowsOf(canaisRes),
    credenciais: {
      vendedor: DEMO.emailVendedor,
      comprador: DEMO.emailComprador,
      vistoriador: DEMO.emailVistoriador,
      senha: DEMO.senha,
    },
  };
}
