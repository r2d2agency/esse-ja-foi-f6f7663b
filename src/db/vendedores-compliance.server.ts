import { sql } from "drizzle-orm";
import { db } from "./index";
import { RegraNegocioError } from "./cadastro.server";

function requireDb() {
  if (!db) throw new RegraNegocioError("Banco de dados indisponível.", 503);
  return db;
}

export async function ensureVendedoresSchema() {
  const d = requireDb();
  
  // Garantir colunas documento status no profile e novos campos compliance
  await d.execute(sql`
    ALTER TABLE profiles 
    ADD COLUMN IF NOT EXISTS cnpj text,
    ADD COLUMN IF NOT EXISTS tipo_pessoa text DEFAULT 'PF',
    ADD COLUMN IF NOT EXISTS documento_cnh_status text DEFAULT 'PENDENTE',
    ADD COLUMN IF NOT EXISTS documento_cnh_verso_status text DEFAULT 'PENDENTE',
    ADD COLUMN IF NOT EXISTS documento_crlv_status text DEFAULT 'PENDENTE',
    ADD COLUMN IF NOT EXISTS documento_comprovante_endereco_status text DEFAULT 'PENDENTE',
    ADD COLUMN IF NOT EXISTS documento_selfie_status text DEFAULT 'PENDENTE',
    ADD COLUMN IF NOT EXISTS compliance_motivo_pendencia text,
    ADD COLUMN IF NOT EXISTS compliance_data_analise timestamptz,
    ADD COLUMN IF NOT EXISTS verificado boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS compliance_responsavel_id uuid,
    ADD COLUMN IF NOT EXISTS status_compliance text DEFAULT 'PENDENTE',
    ADD COLUMN IF NOT EXISTS ia_analise_documentos jsonb DEFAULT '{}'::jsonb;
  `);


  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_analise (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendedor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'AGUARDANDO_ANALISE',
      responsavel_id uuid REFERENCES profiles(id),
      observacoes_internas text,
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      UNIQUE(vendedor_id)
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_historico (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendedor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      autor_id uuid REFERENCES profiles(id),
      acao text NOT NULL,
      detalhe text,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS compliance_pendencias (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vendedor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      documento_tipo text NOT NULL,
      motivo text NOT NULL,
      mensagem text,
      status text NOT NULL DEFAULT 'PENDENTE',
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
}

/** 
 * Centraliza o cálculo de progresso do vendedor.
 * Define o que é obrigatório para cada etapa.
 */
export function calcularProgressoVendedor(p: any) {
  const etapas = {
    conta: "CONCLUIDO",
    dados_pessoais: "PENDENTE",
    endereco: "PENDENTE",
    documentos: "PENDENTE",
    validacao: "PENDENTE"
  };

  // 1. Dados Pessoais: Nome, CPF, Data Nascimento
  if (p.nome && p.cpf && p.data_nascimento) {
    etapas.dados_pessoais = "CONCLUIDO";
  }

  // 2. Endereço: CEP, Logradouro, Número, Bairro, Cidade, UF e Comprovante
  if (p.cep && p.endereco && p.numero && p.bairro && p.cidade && p.uf && 
     (p.documento_comprovante_endereco_url || p.doc_comprovante || p.comprovante_endereco_url)) {
    etapas.endereco = "CONCLUIDO";
  }

  // 3. Documentos: CNH Frente, Verso, CRLV
  if ((p.documento_cnh_url || p.doc_cnh_frente || p.cnh_url) && 
      (p.documento_cnh_verso_url || p.doc_cnh_verso || p.cnh_verso_url) && 
      (p.documento_crlv_url || p.doc_crlv || p.crlv_url)) {
    etapas.documentos = "CONCLUIDO";
  }

  // 4. Validação: Selfie
  if (p.documento_selfie_url || p.doc_selfie || p.selfie_url) {
    etapas.validacao = "CONCLUIDO";
  }

  const concluidas = Object.values(etapas).filter(v => v === "CONCLUIDO").length;
  const total = Object.keys(etapas).length;
  const progresso = Math.round((concluidas / total) * 100);

  // Consideramos 100% apenas se todas as etapas individuais estiverem CONCLUIDO
  const isRealmenteCompleto = progresso === 100;

  return {
    progresso,
    etapas,
    isCompleto: isRealmenteCompleto
  };
}

export const COMPLIANCE_STATUS_LABELS: Record<string, string> = {
  'NAO_ENVIADO': 'Não Enviado',
  'AGUARDANDO_ANALISE': 'Aguardando análise',
  'EM_ANALISE': 'Em análise',
  'PENDENCIA': 'Pendência',
  'APROVADO': 'Aprovado',
  'REPROVADO': 'Reprovado',
  'BLOQUEADO': 'Bloqueado'
};

export async function listarVendedores(filtros: { status?: string | undefined, busca?: string | undefined }) {
  const d = requireDb();
  await ensureVendedoresSchema();
  
  const busca = `%${filtros.busca || ""}%`;
  const whereStatus = filtros.status ? sql`AND p.status_compliance = ${filtros.status}` : sql``;
  
  const rows = (await d.execute(sql`
    SELECT 
      p.id, p.nome, p.cpf, p.email, p.whatsapp, p.criado_em,
      p.status_compliance as compliance_status,
      p.cadastro_completo,
      (SELECT count(*)::int FROM veiculos v WHERE v.perfil_id = p.id) as total_veiculos,
      res.nome as responsavel_nome
    FROM profiles p
    LEFT JOIN profiles res ON res.id = p.compliance_responsavel_id
    WHERE p.role = 'vendedor'::app_role
      ${whereStatus}
      AND (p.nome ILIKE ${busca} OR p.cpf ILIKE ${busca} OR p.email ILIKE ${busca})
    ORDER BY p.criado_em DESC;
  `)) as any;

  return (rows.rows || rows).map((r: any) => ({
    ...r,
    compliance_status_label: COMPLIANCE_STATUS_LABELS[r.compliance_status] || r.compliance_status
  }));
}

export async function obterDetalheVendedor(id: string) {
  const d = requireDb();
  await ensureVendedoresSchema();

  const perfil = (await d.execute(sql`
    SELECT * FROM profiles WHERE id = ${id}::uuid AND role = 'vendedor'::app_role
  `)) as any;
  
  if (!perfil.rows?.[0] && !perfil[0]) throw new RegraNegocioError("Vendedor não encontrado.", 404);
  const p = perfil.rows?.[0] || perfil[0];

  const historico = (await d.execute(sql`
    SELECT h.*, p.nome as autor_nome
    FROM compliance_historico h
    LEFT JOIN profiles p ON p.id = h.autor_id
    WHERE h.vendedor_id = ${id}::uuid
    ORDER BY h.criado_em DESC
  `)) as any;

  const veiculos = (await d.execute(sql`
    SELECT id, placa, marca, modelo, COALESCE(status_analise, status) as status, criado_em
    FROM veiculos WHERE perfil_id = ${id}::uuid
  `)) as any;

  const pendencias = (await d.execute(sql`
    SELECT id, documento_tipo, motivo, mensagem, status, criado_em
    FROM compliance_pendencias
    WHERE vendedor_id = ${id}::uuid
      AND status IN ('PENDENTE', 'REPROVADO')
    ORDER BY criado_em DESC
  `)) as any;

  const progresso = calcularProgressoVendedor(p);

  return {
    perfil: {
      ...p,
      compliance_status_label: COMPLIANCE_STATUS_LABELS[p.status_compliance] || p.status_compliance
    },
    progresso,
    pendencias: pendencias.rows || pendencias,
    historico: historico.rows || historico,
    veiculos: veiculos.rows || veiculos
  };
}

const DOCUMENT_STATUS_COLUMNS: Record<string, string[]> = {
  cnh: ['documento_cnh_status', 'documento_cnh_verso_status'],
  cnh_frente: ['documento_cnh_status'],
  cnh_verso: ['documento_cnh_verso_status'],
  crlv: ['documento_crlv_status'],
  comprovante_endereco: ['documento_comprovante_endereco_status'],
  selfie: ['documento_selfie_status'],
};

export async function registrarAcaoCompliance(vendedorId: string, autorId: string | null, acao: string, detalhe?: string) {
  const d = requireDb();
  await d.execute(sql`
    INSERT INTO compliance_historico (vendedor_id, autor_id, acao, detalhe)
    VALUES (${vendedorId}::uuid, ${autorId ? sql`${autorId}::uuid` : sql`NULL`}, ${acao}, ${detalhe || null});
  `);
}

export async function assumirAnalise(vendedorId: string, responsavelId: string) {
  const d = requireDb();
  await ensureVendedoresSchema();
  
  await d.execute(sql`
    UPDATE profiles SET 
      compliance_responsavel_id = ${responsavelId}::uuid,
      status_compliance = 'EM_ANALISE',
      atualizado_em = now()
    WHERE id = ${vendedorId}::uuid;
  `);
  
  await registrarAcaoCompliance(vendedorId, responsavelId, "ASSUMIU_ANALISE", "Administrador assumiu a análise de compliance.");
  return { ok: true };
}

export async function atualizarStatusDocumento(
  vendedorId: string,
  documentoTipo: string,
  status: string,
  autorId: string | null,
  motivo?: string,
  observacao?: string,
) {
  const d = requireDb();
  const tipo = documentoTipo.toLowerCase();
  const columns = DOCUMENT_STATUS_COLUMNS[tipo];
  if (!columns?.length) {
    throw new RegraNegocioError("Tipo de documento inválido.", 400);
  }

  const setClauses = columns.map((coluna) => sql`${sql.raw(coluna)} = ${status}`);
  setClauses.push(sql`atualizado_em = now()`);
  if (status === 'REPROVADO' || status === 'PENDENCIA' || status === 'NOVO_ENVIO_SOLICITADO') {
    setClauses.push(sql`status_compliance = 'PENDENCIA'`);
    setClauses.push(sql`cadastro_completo = false`);
    setClauses.push(sql`compliance_motivo_pendencia = ${motivo || observacao || `Pendência no documento ${documentoTipo.toUpperCase()}`}`);
  }
  await d.execute(sql`
    UPDATE profiles
    SET ${sql.join(setClauses, sql`, `)}
    WHERE id = ${vendedorId}::uuid
  `);

  if (status === 'REPROVADO' || status === 'PENDENCIA' || status === 'NOVO_ENVIO_SOLICITADO') {
    await d.execute(sql`
      INSERT INTO compliance_pendencias (vendedor_id, documento_tipo, motivo, mensagem, status)
      VALUES (
        ${vendedorId}::uuid,
        ${tipo},
        ${motivo || 'Motivo não informado'},
        ${observacao || null},
        'PENDENTE'
      );
    `);
  } else if (status === 'APROVADO' || status === 'AGUARDANDO_ANALISE') {
    await d.execute(sql`
      UPDATE compliance_pendencias
      SET status = 'RESOLVIDA'
      WHERE vendedor_id = ${vendedorId}::uuid
        AND documento_tipo = ${tipo}
        AND status IN ('PENDENTE', 'REPROVADO');
    `);
  }
  
  const detalhe = [
    `Status do documento ${documentoTipo.toUpperCase()} alterado para ${status}.`,
    motivo ? `Motivo: ${motivo}.` : null,
    observacao ? `Observação: ${observacao}.` : null,
  ].filter(Boolean).join(' ');
  await registrarAcaoCompliance(vendedorId, autorId, `DOC_${status}`, detalhe);
  return { ok: true };
}

export type ResultadoAnaliseIA = {
  tipoDetectado: string;
  confere: boolean;
  confianca: "alta" | "media" | "baixa";
  motivo: string;
};

/**
 * Persiste o veredito da IA sobre um documento e, quando configurado para
 * reprovar automaticamente e a IA tiver certeza, já abre a pendência —
 * sem exigir a ação manual do admin.
 */
export async function salvarAnaliseIA(
  vendedorId: string,
  documentoTipo: string,
  resultado: ResultadoAnaliseIA,
  autoReprovar: boolean,
) {
  const d = requireDb();
  const tipo = documentoTipo.toLowerCase();
  if (!DOCUMENT_STATUS_COLUMNS[tipo]) {
    throw new RegraNegocioError("Tipo de documento inválido.", 400);
  }

  await d.execute(sql`
    UPDATE profiles
    SET ia_analise_documentos = jsonb_set(
      COALESCE(ia_analise_documentos, '{}'::jsonb),
      ${sql.raw(`'{${tipo}}'`)},
      ${JSON.stringify({ ...resultado, analisadoEm: new Date().toISOString() })}::jsonb,
      true
    )
    WHERE id = ${vendedorId}::uuid;
  `);

  if (!resultado.confere) {
    if (autoReprovar && resultado.confianca !== "baixa") {
      await atualizarStatusDocumento(
        vendedorId,
        tipo,
        "REPROVADO",
        null,
        resultado.motivo,
        `Reprovado automaticamente pela IA (confiança ${resultado.confianca}). Documento detectado: ${resultado.tipoDetectado}.`,
      );
      return;
    }
    await registrarAcaoCompliance(
      vendedorId,
      null,
      "IA_SINALIZOU_DIVERGENCIA",
      `A IA identificou possível divergência no documento ${tipo.toUpperCase()} (confiança ${resultado.confianca}): ${resultado.motivo}`,
    );
    return;
  }

  await registrarAcaoCompliance(
    vendedorId,
    null,
    "IA_ANALISOU_DOCUMENTO",
    `IA validou o documento ${tipo.toUpperCase()} (confiança ${resultado.confianca}): ${resultado.motivo}`,
  );
}

export async function aprovarVendedorCompliance(vendedorId: string, autorId: string) {
  const d = requireDb();
  const rows = (await d.execute(sql`
    SELECT * FROM profiles WHERE id = ${vendedorId}::uuid LIMIT 1
  `)) as any;
  const perfil = rows.rows?.[0] || rows[0];
  if (!perfil) throw new RegraNegocioError("Vendedor não encontrado.", 404);

  const progresso = calcularProgressoVendedor(perfil);
  const documentosAprovados = [
    perfil.documento_cnh_status,
    perfil.documento_cnh_verso_status,
    perfil.documento_crlv_status,
    perfil.documento_comprovante_endereco_status,
    perfil.documento_selfie_status,
  ].every((status) => status === 'APROVADO');

  if (!progresso.isCompleto || !documentosAprovados) {
    throw new RegraNegocioError("Só é possível aprovar o vendedor com onboarding completo e todos os documentos aprovados.", 400);
  }

  await d.execute(sql`
    UPDATE profiles SET 
      status_compliance = 'APROVADO',
      verificado = true,
      compliance_data_analise = now(),
      atualizado_em = now()
    WHERE id = ${vendedorId}::uuid;
  `);
  await registrarAcaoCompliance(vendedorId, autorId, "COMPLIANCE_APROVADO", "Vendedor aprovado em compliance.");
  return { ok: true };
}

export async function solicitarPendenciaCompliance(vendedorId: string, autorId: string, motivo: string) {
  const d = requireDb();
  await d.execute(sql`
    UPDATE profiles SET 
      status_compliance = 'PENDENCIA',
      compliance_motivo_pendencia = ${motivo},
      atualizado_em = now()
    WHERE id = ${vendedorId}::uuid;
  `);
  await registrarAcaoCompliance(vendedorId, autorId, "COMPLIANCE_PENDENCIA", `Pendência solicitada: ${motivo}`);
  return { ok: true };
}

