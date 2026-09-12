import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  calcPercentualSobreFipe,
  isValidDocumento,
  isValidPlaca,
  normalizePlaca,
  onlyDigits,
  podeTransicionar,
  tipoPessoa,
} from "@/lib/validators";

export type Row = Record<string, string | number | boolean | Date | null>;

export class RegraNegocioError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function requireDb() {
  if (!db) throw new RegraNegocioError("Banco de dados indisponível. Verifique a DATABASE_URL.", 503);
  return db;
}

let prepared = false;

/** Cria/ajusta as tabelas de clientes, veículos, logs e configurações. Idempotente. */
export async function ensureCadastroSchema(silent = true) {
  if (prepared) return;
  const d = requireDb();
  // Silenciando logs de inicialização de schema por padrão
  if (!silent && process.env['NODE_ENV'] === 'development') console.log("[cadastro.server] Garantindo schema cadastro...");


  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS clientes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome text NOT NULL,
      documento text NOT NULL,
      tipo_pessoa text NOT NULL DEFAULT 'PF',
      email text,
      telefone text,
      whatsapp text,
      cidade text,
      uf text,
      cep text,
      endereco text,
      observacoes text,
      ativo boolean NOT NULL DEFAULT true,
      criado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_em timestamptz NOT NULL DEFAULT now()
    );
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated';
        EXECUTE 'GRANT ALL ON public.clientes TO service_role';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao conceder grants em clientes: %', SQLERRM;
      END $$;
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clientes' AND column_name = 'documento') THEN
          ALTER TABLE clientes ADD COLUMN documento text NOT NULL;
        END IF;
      END $$;
    `);
  
  await d.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tipo_pessoa') THEN
        ALTER TABLE profiles ADD COLUMN tipo_pessoa text;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'status_compliance') THEN
        ALTER TABLE profiles ADD COLUMN status_compliance text DEFAULT 'PENDENTE';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'pode_ver_valores') THEN
        ALTER TABLE profiles ADD COLUMN pode_ver_valores boolean DEFAULT false;
      END IF;
    END $$;
  `);
  await d.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS clientes_documento_uidx ON clientes (documento);`);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS veiculos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      placa text NOT NULL,
      marca text NOT NULL,
      modelo text NOT NULL,
      status text NOT NULL DEFAULT 'CADASTRADO',
      perfil_id uuid,
      vendedor_id uuid,
      cliente_id uuid,
      ano_fabricacao text,
      ano_modelo text,
      versao text,
      cor text,
      km integer,
      combustivel text,
      cambio text,
      valor_fipe numeric(12,2),
      valor_interesse_cliente numeric(12,2),
      tipo_expectativa text,
      percentual_sobre_fipe numeric(8,2),
      alerta_expectativa boolean NOT NULL DEFAULT false,
      ciente_expectativa boolean NOT NULL DEFAULT false,
      cep text,
      endereco text,
      cidade text,
      uf text,
      latitude numeric(10,7),
      longitude numeric(10,7),
      observacoes text,
      fotos jsonb,
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      criado_em timestamptz NOT NULL DEFAULT now(),
      status_analise text DEFAULT 'AGUARDANDO_ANALISE',
      documento_crlv_url text,
      blindado boolean NOT NULL DEFAULT false,
      fotos_processadas jsonb
    );
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.veiculos TO authenticated';
        EXECUTE 'GRANT ALL ON public.veiculos TO service_role';
        EXECUTE 'GRANT SELECT ON public.veiculos TO anon';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao conceder grants em veiculos: %', SQLERRM;
      END $$;
    `);
    
    await d.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'veiculos' AND column_name = 'vendedor_id') THEN
          ALTER TABLE veiculos ADD COLUMN vendedor_id uuid;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'veiculos' AND column_name = 'perfil_id') THEN
          ALTER TABLE veiculos ADD COLUMN perfil_id uuid;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'veiculos' AND column_name = 'status_analise') THEN
          ALTER TABLE veiculos ADD COLUMN status_analise text DEFAULT 'AGUARDANDO_ANALISE';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'veiculos' AND column_name = 'documento_crlv_url') THEN
          ALTER TABLE veiculos ADD COLUMN documento_crlv_url text;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'veiculos' AND column_name = 'blindado') THEN
          ALTER TABLE veiculos ADD COLUMN blindado boolean NOT NULL DEFAULT false;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'veiculos' AND column_name = 'fotos_processadas') THEN
          ALTER TABLE veiculos ADD COLUMN fotos_processadas jsonb;
        END IF;
      END $$;
    `);


  // Compatibilidade: várias consultas usam veiculos.vendedor_id (equivalente a perfil_id)
  await d.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'veiculos' AND column_name = 'vendedor_id') THEN
        ALTER TABLE veiculos ADD COLUMN vendedor_id uuid;
      END IF;
    END $$;
  `);
  await d.execute(sql`UPDATE veiculos SET vendedor_id = perfil_id WHERE vendedor_id IS NULL AND perfil_id IS NOT NULL;`);
  await d.execute(sql`UPDATE veiculos SET perfil_id = vendedor_id WHERE perfil_id IS NULL AND vendedor_id IS NOT NULL;`);
  
  await d.execute(sql`ALTER TABLE veiculos ALTER COLUMN status SET DEFAULT 'CADASTRADO';`);
  await d.execute(sql`UPDATE veiculos SET placa = upper(placa) WHERE placa <> upper(placa);`);
  await d.execute(sql`UPDATE veiculos SET status = upper(status) WHERE status <> upper(status);`);
  await d.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS veiculos_placa_uidx ON veiculos (placa);`);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entidade text NOT NULL,
      entidade_id uuid,
      acao text NOT NULL,
      de text,
      para text,
      detalhe text,
      usuario text,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'logs' AND indexname = 'logs_entidade_idx') THEN
        CREATE INDEX logs_entidade_idx ON logs (entidade, entidade_id);
      END IF;
    END $$;
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave text PRIMARY KEY,
      valor text NOT NULL,
      descricao text
    );
  `);
  await d.execute(sql`
    INSERT INTO configuracoes (chave, valor, descricao)
    VALUES ('percentual_alerta_expectativa', '15', 'Percentual acima da FIPE que dispara alerta de expectativa')
    ON CONFLICT (chave) DO NOTHING;
  `);

  prepared = true;
}

async function registrarLog(entrada: {
  entidade: string;
  entidadeId: string;
  acao: string;
  de?: string | null;
  para?: string | null;
  detalhe?: string | null;
  usuario?: string | null;
}) {
  const d = requireDb();
  await d.execute(sql`
    INSERT INTO logs (entidade, entidade_id, acao, de, para, detalhe, usuario)
    VALUES (${entrada.entidade}, ${entrada.entidadeId}, ${entrada.acao}, ${entrada.de ?? null},
            ${entrada.para ?? null}, ${entrada.detalhe ?? null}, ${entrada.usuario ?? null});
  `);
}

async function getPercentualAlerta() {
  const d = requireDb();
  const rows = (await d.execute(
    sql`SELECT valor FROM configuracoes WHERE chave = 'percentual_alerta_expectativa' LIMIT 1;`,
  )) as unknown as Array<{ valor: string }>;
  const valor = Number(rows?.[0]?.valor ?? 15);
  return Number.isFinite(valor) ? valor : 15;
}

/* ------------------------------- CLIENTES -------------------------------- */

export type ClienteInput = {
  id?: string;
  nome: string;
  documento: string;
  email?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
};

export async function listarClientes(busca?: string) {
  await ensureCadastroSchema();
  const d = requireDb();
  const termo = (busca ?? "").trim();
  const digitos = onlyDigits(termo);
  const like = `%${termo.toLowerCase()}%`;
  const likeDigits = digitos ? `%${digitos}%` : "%__nunca__%";
  const rows = (await d.execute(sql`
    SELECT * FROM clientes
    WHERE ${termo === ""}
       OR lower(nome) LIKE ${like}
       OR documento LIKE ${likeDigits}
       OR coalesce(regexp_replace(telefone, '\\D', '', 'g'), '') LIKE ${likeDigits}
       OR coalesce(regexp_replace(whatsapp, '\\D', '', 'g'), '') LIKE ${likeDigits}
    ORDER BY criado_em DESC
    LIMIT 200;
  `)) as unknown as Array<Row>;
  return rows;
}

export async function salvarCliente(input: ClienteInput) {
  await ensureCadastroSchema();
  const d = requireDb();

  const nome = (input.nome ?? "").trim();
  if (nome.length < 3) throw new RegraNegocioError("Informe o nome completo do cliente.", 422);

  const documento = onlyDigits(input.documento);
  if (!isValidDocumento(documento)) throw new RegraNegocioError("CPF ou CNPJ inválido (dígito verificador).", 422);

  const dup = (await d.execute(sql`
    SELECT id FROM clientes WHERE documento = ${documento} AND id <> ${input.id ?? "00000000-0000-0000-0000-000000000000"} LIMIT 1;
  `)) as unknown as Array<{ id: string }>;
  if (dup.length > 0) throw new RegraNegocioError("Já existe um cliente cadastrado com este documento.", 409);

  const tipo = tipoPessoa(documento);

  if (input.id) {
    await d.execute(sql`
      UPDATE clientes SET nome = ${nome}, documento = ${documento}, tipo_pessoa = ${tipo},
        email = ${input.email ?? null}, telefone = ${input.telefone ?? null}, whatsapp = ${input.whatsapp ?? null},
        cidade = ${input.cidade ?? null}, uf = ${input.uf ?? null}, cep = ${input.cep ?? null},
        endereco = ${input.endereco ?? null}, observacoes = ${input.observacoes ?? null}, atualizado_em = now()
      WHERE id = ${input.id};
    `);
    await registrarLog({ entidade: "cliente", entidadeId: input.id, acao: "ATUALIZADO" });
    return { id: input.id };
  }

  const rows = (await d.execute(sql`
    INSERT INTO clientes (nome, documento, tipo_pessoa, email, telefone, whatsapp, cidade, uf, cep, endereco, observacoes)
    VALUES (${nome}, ${documento}, ${tipo}, ${input.email ?? null}, ${input.telefone ?? null}, ${input.whatsapp ?? null},
            ${input.cidade ?? null}, ${input.uf ?? null}, ${input.cep ?? null}, ${input.endereco ?? null}, ${input.observacoes ?? null})
    RETURNING id;
  `)) as unknown as Array<{ id: string }>;
  const id = rows[0]?.id as string;
  await registrarLog({ entidade: "cliente", entidadeId: id, acao: "CRIADO" });
  return { id };
}

export async function removerCliente(id: string) {
  await ensureCadastroSchema();
  const d = requireDb();
  const vinculos = (await d.execute(
    sql`SELECT id FROM veiculos WHERE cliente_id = ${id} LIMIT 1;`,
  )) as unknown as Array<{ id: string }>;
  if (vinculos.length > 0) throw new RegraNegocioError("Cliente possui veículos vinculados e não pode ser excluído.", 409);
  await d.execute(sql`DELETE FROM clientes WHERE id = ${id};`);
  await registrarLog({ entidade: "cliente", entidadeId: id, acao: "EXCLUIDO" });
  return { ok: true };
}

/* ------------------------------- VEÍCULOS -------------------------------- */

export type VeiculoInput = {
  id?: string;
  placa: string;
  marca: string;
  modelo: string;
  versao?: string | null;
  cor?: string | null;
  km?: number | null;
  anoFabricacao?: string | null;
  anoModelo?: string | null;
  combustivel?: string | null;
  cambio?: string | null;
  clienteId?: string | null;
  valorFipe?: number | null;
  valorInteresseCliente?: number | null;
  tipoExpectativa?: string | null;
  cienteExpectativa?: boolean;
  cep?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  observacoes?: string | null;
  perfilId?: string | null;
  fotos?: string[] | null;
  status?: string | null;
  documento_crlv_url?: string | null;
  blindado?: boolean | null;
};

export async function listarVeiculos(filtros: {
  status?: string | null | undefined;
  cidade?: string | null | undefined;
  clienteId?: string | null | undefined;
  busca?: string | null | undefined;
} = {}) {
  await ensureCadastroSchema();
  const d = requireDb();
  const status = (filtros.status ?? "").toUpperCase();
  const cidade = (filtros.cidade ?? "").toLowerCase();
  const cliente = filtros.clienteId ?? "";
  const busca = (filtros.busca ?? "").trim().toLowerCase();
  const like = `%${busca}%`;
  const likePlaca = `%${normalizePlaca(busca)}%`;
  const rows = (await d.execute(sql`
    SELECT v.*, c.nome AS cliente_nome
    FROM veiculos v
    LEFT JOIN clientes c ON c.id = v.cliente_id
    WHERE (${status === ""} OR upper(v.status) = ${status})
      AND (${cidade === ""} OR lower(coalesce(v.cidade, '')) LIKE ${`%${cidade}%`})
      AND (${cliente === ""} OR v.cliente_id::text = ${cliente})
      AND (${busca === ""} OR v.placa LIKE ${likePlaca} OR lower(v.modelo) LIKE ${like} OR lower(v.marca) LIKE ${like})
    ORDER BY v.criado_em DESC
    LIMIT 200;
  `)) as unknown as Array<Row>;
  return rows;
}

export async function salvarVeiculo(input: VeiculoInput) {
  await ensureCadastroSchema();
  const d = requireDb();

  const placa = normalizePlaca(input.placa);
  if (!isValidPlaca(placa)) {
    throw new RegraNegocioError("Placa inválida. Use o formato antigo (ABC1234) ou Mercosul (ABC1D23).", 422);
  }
  if (!input.marca?.trim() || !input.modelo?.trim()) {
    throw new RegraNegocioError("Marca e modelo são obrigatórios.", 422);
  }

  const dup = (await d.execute(sql`
    SELECT id FROM veiculos WHERE placa = ${placa} AND id <> ${input.id ?? "00000000-0000-0000-0000-000000000000"} LIMIT 1;
  `)) as unknown as Array<{ id: string }>;
  if (dup.length > 0) throw new RegraNegocioError("Já existe um veículo cadastrado com esta placa.", 409);

  const limite = await getPercentualAlerta();
  const fipe = Number(input.valorFipe ?? 0);
  const interesse = Number(input.valorInteresseCliente ?? 0);
  const percentual = fipe > 0 && interesse > 0 ? calcPercentualSobreFipe(fipe, interesse) : null;
  const alerta = percentual !== null && percentual >= limite;

  const base = {
    placa,
    marca: input.marca.trim(),
    modelo: input.modelo.trim(),
    versao: input.versao ?? null,
    cor: input.cor ?? null,
    km: input.km ?? null,
    anoFabricacao: input.anoFabricacao ?? null,
    anoModelo: input.anoModelo ?? null,
    combustivel: input.combustivel ?? null,
    cambio: input.cambio ?? null,
    clienteId: input.clienteId || null,
    fipe: fipe > 0 ? fipe : null,
    interesse: interesse > 0 ? interesse : null,
    tipoExpectativa: input.tipoExpectativa ?? null,
    percentual,
    alerta,
    ciente: Boolean(input.cienteExpectativa),
    cep: input.cep ?? null,
    endereco: input.endereco ?? null,
    cidade: input.cidade ?? null,
    uf: input.uf ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    observacoes: input.observacoes ?? null,
    perfilId: input.perfilId ?? null,
    fotos: input.fotos && input.fotos.length > 0 ? (typeof input.fotos === 'string' ? input.fotos : JSON.stringify(input.fotos)) : null,
    status: (input.status ?? "CADASTRADO").toUpperCase(),
    documento_crlv_url: input.documento_crlv_url || null,
    blindado: Boolean(input.blindado),
  };

  if (input.id) {
    const setClauses: any[] = [
      sql`placa = ${base.placa}`,
      sql`marca = ${base.marca}`,
      sql`modelo = ${base.modelo}`,
      sql`atualizado_em = now()`,
    ];

    if (input.versao !== undefined) setClauses.push(sql`versao = ${base.versao}`);
    if (input.cor !== undefined) setClauses.push(sql`cor = ${base.cor}`);
    if (input.km !== undefined) setClauses.push(sql`km = ${base.km}`);
    if (input.anoFabricacao !== undefined) setClauses.push(sql`ano_fabricacao = ${base.anoFabricacao}`);
    if (input.anoModelo !== undefined) setClauses.push(sql`ano_modelo = ${base.anoModelo}`);
    if (input.combustivel !== undefined) setClauses.push(sql`combustivel = ${base.combustivel}`);
    if (input.cambio !== undefined) setClauses.push(sql`cambio = ${base.cambio}`);
    if (input.clienteId !== undefined) setClauses.push(sql`cliente_id = ${base.clienteId}`);
    if (input.valorFipe !== undefined) setClauses.push(sql`valor_fipe = ${base.fipe}`);
    if (input.valorInteresseCliente !== undefined) setClauses.push(sql`valor_interesse_cliente = ${base.interesse}`);
    if (input.tipoExpectativa !== undefined) setClauses.push(sql`tipo_expectativa = ${base.tipoExpectativa}`);
    if (input.valorFipe !== undefined || input.valorInteresseCliente !== undefined) {
      setClauses.push(sql`percentual_sobre_fipe = ${base.percentual}`);
      setClauses.push(sql`alerta_expectativa = ${base.alerta}`);
    }
    if (input.cienteExpectativa !== undefined) setClauses.push(sql`ciente_expectativa = ${base.ciente}`);
    if (input.cep !== undefined) setClauses.push(sql`cep = ${base.cep}`);
    if (input.endereco !== undefined) setClauses.push(sql`endereco = ${base.endereco}`);
    if (input.cidade !== undefined) setClauses.push(sql`cidade = ${base.cidade}`);
    if (input.uf !== undefined) setClauses.push(sql`uf = ${base.uf}`);
    if (input.latitude !== undefined) setClauses.push(sql`latitude = ${base.latitude}`);
    if (input.longitude !== undefined) setClauses.push(sql`longitude = ${base.longitude}`);
    if (input.observacoes !== undefined) setClauses.push(sql`observacoes = ${base.observacoes}`);
    if (input.perfilId !== undefined) {
      setClauses.push(sql`perfil_id = ${base.perfilId}::uuid`);
      setClauses.push(sql`vendedor_id = ${base.perfilId}::uuid`);
    }
    // Nunca apaga fotos já salvas quando o chamador manda uma lista vazia (rascunho
    // parcial, autosave com estado desatualizado etc.) — só grava quando há fotos de fato.
    if (input.fotos !== undefined && base.fotos !== null) setClauses.push(sql`fotos = ${base.fotos}::jsonb`);
    if (input.status !== undefined) setClauses.push(sql`status = ${base.status}`);
    if (input.documento_crlv_url !== undefined) setClauses.push(sql`documento_crlv_url = ${base.documento_crlv_url}`);
    if (input.blindado !== undefined) setClauses.push(sql`blindado = ${base.blindado}`);

    let statusAnterior: string | null = null;
    if (input.status !== undefined) {
      const anteriorRows = (await d.execute(
        sql`SELECT status FROM veiculos WHERE id = ${input.id} LIMIT 1;`,
      )) as unknown as Array<{ status: string }>;
      statusAnterior = anteriorRows[0]?.status ?? null;
    }

    await d.execute(sql`
      UPDATE veiculos SET ${sql.join(setClauses, sql`, `)}
      WHERE id = ${input.id};
    `);
    await registrarLog({ entidade: "veiculo", entidadeId: input.id, acao: "ATUALIZADO", detalhe: `Placa ${placa}` });

    if (base.status === "AGUARDANDO_APROVACAO" && statusAnterior !== "AGUARDANDO_APROVACAO") {
      const { notificarAdminsCarroParaAnalise } = await import("./notificacoes-admin.server");
      void notificarAdminsCarroParaAnalise({ id: input.id, placa: base.placa, marca: base.marca, modelo: base.modelo });
    }

    return { id: input.id, percentualSobreFipe: percentual, alertaExpectativa: alerta, percentualAlerta: limite };
  }

  const rows = (await d.execute(sql`
    INSERT INTO veiculos (placa, marca, modelo, versao, cor, km, ano_fabricacao, ano_modelo, combustivel, cambio,
      cliente_id, valor_fipe, valor_interesse_cliente, tipo_expectativa, percentual_sobre_fipe, alerta_expectativa,
      ciente_expectativa, cep, endereco, cidade, uf, latitude, longitude, observacoes, perfil_id, vendedor_id, fotos, status, status_analise, documento_crlv_url, blindado)
    VALUES (${base.placa}, ${base.marca}, ${base.modelo}, ${base.versao}, ${base.cor}, ${base.km},
      ${base.anoFabricacao}, ${base.anoModelo}, ${base.combustivel}, ${base.cambio}, ${base.clienteId},
      ${base.fipe}, ${base.interesse}, ${base.tipoExpectativa}, ${base.percentual}, ${base.alerta},
      ${base.ciente}, ${base.cep}, ${base.endereco}, ${base.cidade}, ${base.uf}, ${base.latitude},
      ${base.longitude}, ${base.observacoes}, ${base.perfilId}::uuid, ${base.perfilId}::uuid, ${base.fotos}::jsonb, ${base.status}, 'AGUARDANDO_ANALISE', ${input.documento_crlv_url || null}, ${base.blindado})
    ON CONFLICT (placa) DO UPDATE SET
      marca = EXCLUDED.marca, modelo = EXCLUDED.modelo, versao = EXCLUDED.versao, cor = EXCLUDED.cor,
      km = EXCLUDED.km, ano_fabricacao = EXCLUDED.ano_fabricacao, ano_modelo = EXCLUDED.ano_modelo,
      combustivel = EXCLUDED.combustivel, cambio = EXCLUDED.cambio, valor_fipe = EXCLUDED.valor_fipe,
      valor_interesse_cliente = EXCLUDED.valor_interesse_cliente, tipo_expectativa = EXCLUDED.tipo_expectativa,
      percentual_sobre_fipe = EXCLUDED.percentual_sobre_fipe, alerta_expectativa = EXCLUDED.alerta_expectativa,
      ciente_expectativa = EXCLUDED.ciente_expectativa, cep = EXCLUDED.cep, endereco = EXCLUDED.endereco,
      cidade = EXCLUDED.cidade, uf = EXCLUDED.uf, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
      observacoes = EXCLUDED.observacoes,
      fotos = CASE WHEN EXCLUDED.fotos IS NOT NULL THEN EXCLUDED.fotos ELSE veiculos.fotos END,
      status = EXCLUDED.status,
      documento_crlv_url = EXCLUDED.documento_crlv_url, blindado = EXCLUDED.blindado, atualizado_em = now()
    RETURNING id;
  `)) as unknown as Array<{ id: string }>;
  const id = rows[0]?.id as string;
  await registrarLog({ entidade: "veiculo", entidadeId: id, acao: "CRIADO", para: base.status, detalhe: `Placa ${placa}` });

  if (base.status === "AGUARDANDO_APROVACAO") {
    const { notificarAdminsCarroParaAnalise } = await import("./notificacoes-admin.server");
    void notificarAdminsCarroParaAnalise({ id, placa: base.placa, marca: base.marca, modelo: base.modelo });
  }

  return { id, percentualSobreFipe: percentual, alertaExpectativa: alerta, percentualAlerta: limite };
}

export async function alterarStatusVeiculo(id: string, novoStatus: string, usuario?: string) {
  await ensureCadastroSchema();
  const d = requireDb();
  
  if (novoStatus === 'APROVAR') {
    await d.execute(sql`UPDATE veiculos SET status = 'CADASTRADO', atualizado_em = now() WHERE id = ${id};`);
    await registrarLog({ entidade: "veiculo", entidadeId: id, acao: "STATUS", para: "CADASTRADO", detalhe: "Veículo aprovado pela operação", usuario: usuario ?? null });
    return { id, status: 'CADASTRADO' };
  }

  const rows = (await d.execute(sql`
    SELECT status, valor_fipe, valor_interesse_cliente, tipo_expectativa, alerta_expectativa, ciente_expectativa
    FROM veiculos WHERE id = ${id} LIMIT 1;
  `)) as unknown as Array<Row>;
  const atual = rows[0];
  if (!atual) throw new RegraNegocioError("Veículo não encontrado.", 404);

  const de = String(atual['status'] ?? "CADASTRADO").toUpperCase();
  const para = (novoStatus || "").toUpperCase();
  if (!podeTransicionar(de, para)) {
    throw new RegraNegocioError(`Transição inválida: ${de} → ${para}.`, 422);
  }

  if (para === "AGENDADO") {
    const temExpectativa =
      atual['valor_fipe'] != null && atual['valor_interesse_cliente'] != null && !!atual['tipo_expectativa'];
    if (!temExpectativa) {
      throw new RegraNegocioError(
        "Preencha valor FIPE, valor de interesse do cliente e tipo de expectativa antes de agendar.",
        422,
      );
    }
    if (atual['alerta_expectativa'] === true && atual['ciente_expectativa'] !== true) {
      throw new RegraNegocioError(
        "Expectativa acima do limite configurado. É necessário registrar a ciência do cliente antes de agendar.",
        422,
      );
    }
  }

  await d.execute(sql`UPDATE veiculos SET status = ${para}, atualizado_em = now() WHERE id = ${id};`);
  await registrarLog({ entidade: "veiculo", entidadeId: id, acao: "STATUS", de, para, usuario: usuario ?? null });
  return { id, status: para };
}

export async function timelineVeiculo(id: string) {
  await ensureCadastroSchema();
  const d = requireDb();
  const rows = (await d.execute(sql`
    SELECT acao, de, para, detalhe, usuario, criado_em
    FROM logs WHERE entidade = 'veiculo' AND entidade_id = ${id}
    ORDER BY criado_em DESC LIMIT 200;
  `)) as unknown as Array<Row>;
  return rows;
}

export async function removerVeiculo(id: string) {
  await ensureCadastroSchema();
  const d = requireDb();
  await d.execute(sql`DELETE FROM veiculos WHERE id = ${id};`);
  await registrarLog({ entidade: "veiculo", entidadeId: id, acao: "EXCLUIDO" });
  return { ok: true };
}
