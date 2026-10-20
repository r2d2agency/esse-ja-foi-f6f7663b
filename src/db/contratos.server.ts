import { sql } from "drizzle-orm";
import { db } from "./index";
import { RegraNegocioError } from "./cadastro.server";
import { hojeFormatadoEmSaoPaulo } from "@/lib/brasil";

function requireDb() {
  if (!db) throw new RegraNegocioError("Banco de dados indisponível.", 503);
  return db;
}

function rows(r: any): any[] {
  return (r?.rows ?? r ?? []) as any[];
}

export const STATUS_CONTRATO = [
  "NAO_GERADO",
  "GERADO",
  "ENVIADO",
  "VISUALIZADO",
  "ASSINADO",
  "RECUSADO",
  "EXPIRADO",
  "CANCELADO",
] as const;

const MODELO_PADRAO_CONTEUDO = `CONTRATO DE INTERMEDIAÇÃO DE VENDA DE VEÍCULO

[ESPAÇO RESERVADO PARA O TEXTO JURÍDICO OFICIAL APROVADO PELA EMPRESA]

CONTRATANTE: {{nome_vendedor}}
CPF: {{cpf_vendedor}}
Endereço: {{endereco_vendedor}}
E-mail: {{email_vendedor}}
Telefone: {{telefone_vendedor}}
Identificador do vendedor: {{identificador_vendedor}}

Data: {{data_contrato}}

______________________________________
{{nome_vendedor}}`;

export async function ensureContratosSchema() {
  const d = requireDb();

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS contrato_modelos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome text NOT NULL,
      versao text NOT NULL DEFAULT '1.0',
      ativo boolean NOT NULL DEFAULT true,
      data_versao timestamptz NOT NULL DEFAULT now(),
      conteudo text NOT NULL DEFAULT '',
      campos_dinamicos jsonb NOT NULL DEFAULT '[]'::jsonb,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE SEQUENCE IF NOT EXISTS contrato_numero_seq START 91;
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS contratos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      identificador text NOT NULL UNIQUE,
      vendedor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      modelo_id uuid REFERENCES contrato_modelos(id),
      modelo_nome text,
      modelo_versao text,
      versao int NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'GERADO',
      conteudo text NOT NULL DEFAULT '',
      responsavel_id uuid REFERENCES profiles(id),
      canais jsonb NOT NULL DEFAULT '[]'::jsonb,
      motivo_cancelamento text,
      observacao_interna text,
      comentario_recusa text,
      provedor_externo text,
      transacao_externa_id text,
      arquivo_original_url text,
      arquivo_assinado_url text,
      evidencias jsonb,
      ip_assinatura text,
      gerado_em timestamptz NOT NULL DEFAULT now(),
      enviado_em timestamptz,
      visualizado_em timestamptz,
      assinado_em timestamptz,
      recusado_em timestamptz,
      expirado_em timestamptz,
      cancelado_em timestamptz,
      atualizado_em timestamptz NOT NULL DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS contrato_eventos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
      vendedor_id uuid,
      autor_id uuid REFERENCES profiles(id),
      autor_nome text,
      tipo text NOT NULL,
      descricao text,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS contrato_notificacoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      contrato_id uuid REFERENCES contratos(id) ON DELETE CASCADE,
      destino text NOT NULL,
      titulo text NOT NULL,
      mensagem text,
      lida boolean NOT NULL DEFAULT false,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);

  const existentes = rows(await d.execute(sql`SELECT count(*)::int as total FROM contrato_modelos`));
  if ((existentes[0]?.total ?? 0) === 0) {
    await d.execute(sql`
      INSERT INTO contrato_modelos (nome, versao, ativo, conteudo, campos_dinamicos)
      VALUES (
        'Contrato de Intermediação de Venda',
        '1.0',
        true,
        ${MODELO_PADRAO_CONTEUDO},
        ${JSON.stringify([
          "{{nome_vendedor}}",
          "{{cpf_vendedor}}",
          "{{endereco_vendedor}}",
          "{{email_vendedor}}",
          "{{telefone_vendedor}}",
          "{{data_contrato}}",
          "{{identificador_vendedor}}",
        ])}::jsonb
      );
    `);
  }
}

async function registrarEvento(
  contratoId: string,
  vendedorId: string | null,
  tipo: string,
  descricao: string,
  autorId?: string | null,
  autorNome?: string | null,
) {
  const d = requireDb();
  await d.execute(sql`
    INSERT INTO contrato_eventos (contrato_id, vendedor_id, autor_id, autor_nome, tipo, descricao)
    VALUES (${contratoId}::uuid, ${vendedorId}::uuid, ${autorId ?? null}::uuid, ${autorNome ?? null}, ${tipo}, ${descricao});
  `);
  // Espelha no histórico geral do vendedor quando disponível
  try {
    await d.execute(sql`
      INSERT INTO compliance_historico (vendedor_id, autor_id, acao, detalhe)
      VALUES (${vendedorId}::uuid, ${autorId ?? null}::uuid, ${"Contrato: " + tipo}, ${descricao});
    `);
  } catch {
    /* histórico geral opcional */
  }
}

async function notificar(contratoId: string, destino: "ADMIN" | "VENDEDOR", titulo: string, mensagem: string) {
  const d = requireDb();
  await d.execute(sql`
    INSERT INTO contrato_notificacoes (contrato_id, destino, titulo, mensagem)
    VALUES (${contratoId}::uuid, ${destino}, ${titulo}, ${mensagem});
  `);
}

export async function listarModelos() {
  const d = requireDb();
  await ensureContratosSchema();
  return rows(await d.execute(sql`SELECT * FROM contrato_modelos ORDER BY ativo DESC, nome ASC, versao DESC`));
}

export async function listarContratos(filtros: {
  status?: string | undefined;
  busca?: string | undefined;
  responsavelId?: string | undefined;
  modeloId?: string | undefined;
  data?: string | undefined;
}) {
  const d = requireDb();
  await ensureContratosSchema();
  const busca = `%${filtros.busca || ""}%`;

  let whereStatus = sql``;
  if (filtros.status === "PENDENTES") {
    whereStatus = sql`AND c.status IN ('GERADO','ENVIADO','VISUALIZADO','EXPIRADO')`;
  } else if (filtros.status && filtros.status !== "TODOS") {
    whereStatus = sql`AND c.status = ${filtros.status}`;
  }
  const whereResp = filtros.responsavelId ? sql`AND c.responsavel_id = ${filtros.responsavelId}::uuid` : sql``;
  const whereModelo = filtros.modeloId ? sql`AND c.modelo_id = ${filtros.modeloId}::uuid` : sql``;
  const whereData = filtros.data ? sql`AND c.gerado_em::date = ${filtros.data}::date` : sql``;

  const gerados = rows(
    await d.execute(sql`
      SELECT c.id, c.identificador, c.status, c.versao, c.modelo_nome, c.modelo_versao,
             c.gerado_em, c.atualizado_em, c.vendedor_id,
             p.nome as vendedor_nome, p.cpf as vendedor_cpf,
             r.nome as responsavel_nome
      FROM contratos c
      JOIN profiles p ON p.id = c.vendedor_id
      LEFT JOIN profiles r ON r.id = c.responsavel_id
      WHERE 1=1
        ${whereStatus} ${whereResp} ${whereModelo} ${whereData}
        AND (p.nome ILIKE ${busca} OR COALESCE(p.cpf,'') ILIKE ${busca} OR c.identificador ILIKE ${busca})
      ORDER BY c.atualizado_em DESC
    `),
  );

  // Vendedores aprovados sem contrato ativo => "Não gerado"
  let naoGerados: any[] = [];
  if (!filtros.status || filtros.status === "TODOS" || filtros.status === "NAO_GERADO") {
    try {
      naoGerados = rows(
        await d.execute(sql`
          FROM profiles p
          LEFT JOIN compliance_analise ca ON ca.vendedor_id = p.id
          WHERE p.role = 'vendedor'::app_role
            AND (COALESCE(ca.status,'') = 'APROVADO' OR p.status_compliance = 'APROVADO')

            AND NOT EXISTS (
              SELECT 1 FROM contratos c
              WHERE c.vendedor_id = p.id AND c.status NOT IN ('CANCELADO','RECUSADO','EXPIRADO')
            )
            AND (p.nome ILIKE ${busca} OR COALESCE(p.cpf,'') ILIKE ${busca})
          ORDER BY p.criado_em DESC
        `),
      );
    } catch {
      naoGerados = [];
    }
  }

  return { gerados, naoGerados };
}

export async function indicadorContratosPendentes() {
  const d = requireDb();
  await ensureContratosSchema();
  const r = rows(
    await d.execute(sql`
      SELECT count(*)::int as total FROM contratos
      WHERE status IN ('GERADO','ENVIADO','VISUALIZADO','EXPIRADO')
    `),
  );
  return r[0]?.total ?? 0;
}

export async function obterContratoVendedor(vendedorId: string) {
  const d = requireDb();
  await ensureContratosSchema();

  const perfil = rows(await d.execute(sql`SELECT * FROM profiles WHERE id = ${vendedorId}::uuid`))[0];
  if (!perfil) throw new RegraNegocioError("Vendedor não encontrado.", 404);

  let complianceStatus = "AGUARDANDO_ANALISE";
  try {
    const c = rows(await d.execute(sql`SELECT status FROM compliance_analise WHERE vendedor_id = ${vendedorId}::uuid`));
    complianceStatus = c[0]?.status ?? "AGUARDANDO_ANALISE";
  } catch {
    /* módulo compliance ausente */
  }

  const contratos = rows(
    await d.execute(sql`
      SELECT c.*, r.nome as responsavel_nome
      FROM contratos c LEFT JOIN profiles r ON r.id = c.responsavel_id
      WHERE c.vendedor_id = ${vendedorId}::uuid
      ORDER BY c.versao DESC, c.gerado_em DESC
    `),
  );
  const atual = contratos.find((c) => !["CANCELADO", "RECUSADO", "EXPIRADO"].includes(c.status)) ?? contratos[0] ?? null;

  return {
    perfil,
    complianceStatus,
    contratoAtual: atual,
    contratos,
    elegivelParaAvancar: complianceStatus === "APROVADO" && atual?.status === "ASSINADO",
  };
}

export async function obterContrato(id: string) {
  const d = requireDb();
  await ensureContratosSchema();
  const contrato = rows(
    await d.execute(sql`
      SELECT c.*, p.nome as vendedor_nome, p.cpf as vendedor_cpf, p.email as vendedor_email,
             p.whatsapp as vendedor_whatsapp, r.nome as responsavel_nome
      FROM contratos c
      JOIN profiles p ON p.id = c.vendedor_id
      LEFT JOIN profiles r ON r.id = c.responsavel_id
      WHERE c.id = ${id}::uuid
    `),
  )[0];
  if (!contrato) throw new RegraNegocioError("Contrato não encontrado.", 404);

  const eventos = rows(
    await d.execute(sql`SELECT * FROM contrato_eventos WHERE contrato_id = ${id}::uuid ORDER BY criado_em ASC`),
  );
  return { contrato, eventos };
}

function enderecoResumido(p: any) {
  const partes = [p.endereco || p.logradouro, p.numero, p.bairro, p.cidade, p.uf || p.estado].filter(Boolean);
  return partes.join(", ");
}

export function validarDadosObrigatorios(p: any) {
  const faltantes: string[] = [];
  if (!p.nome) faltantes.push("Nome completo");
  if (!p.cpf) faltantes.push("CPF");
  if (!p.email) faltantes.push("E-mail");
  if (!p.whatsapp) faltantes.push("Telefone/WhatsApp");
  if (!(p.endereco || p.logradouro)) faltantes.push("Endereço");
  if (!p.numero) faltantes.push("Número do endereço");
  if (!p.cidade) faltantes.push("Cidade");
  if (!(p.uf || p.estado)) faltantes.push("Estado");
  if (!p.cep) faltantes.push("CEP");
  return faltantes;
}

export async function prepararGeracao(vendedorId: string) {
  const d = requireDb();
  await ensureContratosSchema();
  const { perfil, complianceStatus, contratoAtual } = await obterContratoVendedor(vendedorId);
  const modelos = rows(await d.execute(sql`SELECT * FROM contrato_modelos WHERE ativo = true ORDER BY nome`));
  return {
    perfil,
    complianceStatus,
    contratoAtual,
    modelos,
    faltantes: validarDadosObrigatorios(perfil),
    enderecoResumo: enderecoResumido(perfil),
  };
}

export async function gerarContrato(input: {
  vendedorId: string;
  modeloId: string;
  autorId?: string | null;
  autorNome?: string | null;
}) {
  const d = requireDb();
  await ensureContratosSchema();

  const { perfil, complianceStatus, contratoAtual } = await obterContratoVendedor(input.vendedorId);
  if (complianceStatus !== "APROVADO" && perfil.status_compliance !== "APROVADO") {
    throw new RegraNegocioError("O contrato será liberado após a conclusão do compliance.", 400);
  }
  if (contratoAtual && !["CANCELADO", "RECUSADO", "EXPIRADO"].includes(contratoAtual.status)) {
    throw new RegraNegocioError("Já existe um contrato ativo para este vendedor.", 400);
  }
  const faltantes = validarDadosObrigatorios(perfil);
  if (faltantes.length > 0) {
    throw new RegraNegocioError(`Existem informações pendentes antes da geração do contrato: ${faltantes.join(", ")}.`, 400);
  }

  const modelo = rows(await d.execute(sql`SELECT * FROM contrato_modelos WHERE id = ${input.modeloId}::uuid`))[0];
  if (!modelo) throw new RegraNegocioError("Modelo de contrato inválido.", 400);

  const proxVersao = (rows(await d.execute(sql`SELECT COALESCE(max(versao),0)::int as v FROM contratos WHERE vendedor_id = ${input.vendedorId}::uuid`))[0]?.v ?? 0) + 1;
  const seq = rows(await d.execute(sql`SELECT nextval('contrato_numero_seq')::int as n`))[0]?.n ?? 1;
  const identificador = `CTR-${String(seq).padStart(6, "0")}`;

  const conteudo = String(modelo.conteudo || "")
    .replaceAll("{{nome_vendedor}}", perfil.nome ?? "")
    .replaceAll("{{cpf_vendedor}}", perfil.cpf ?? "")
    .replaceAll("{{endereco_vendedor}}", enderecoResumido(perfil))
    .replaceAll("{{email_vendedor}}", perfil.email ?? "")
    .replaceAll("{{telefone_vendedor}}", perfil.whatsapp ?? "")
    .replaceAll("{{data_contrato}}", hojeFormatadoEmSaoPaulo())
    .replaceAll("{{identificador_vendedor}}", perfil.id);

  const criado = rows(
    await d.execute(sql`
      INSERT INTO contratos (identificador, vendedor_id, modelo_id, modelo_nome, modelo_versao, versao, status, conteudo, responsavel_id)
      VALUES (${identificador}, ${input.vendedorId}::uuid, ${modelo.id}::uuid, ${modelo.nome}, ${modelo.versao}, ${proxVersao}, 'GERADO', ${conteudo}, ${input.autorId ?? null}::uuid)
      RETURNING *
    `),
  )[0];

  await registrarEvento(criado.id, input.vendedorId, "GERADO", `Contrato gerado por ${input.autorNome || "administrador"}.`, input.autorId, input.autorNome);
  await notificar(criado.id, "ADMIN", "Contrato aguardando envio", `${identificador} foi gerado e ainda não foi enviado.`);
  return { ok: true as const, contrato: criado };
}

export async function enviarContrato(input: { contratoId: string; canais: string[]; autorId?: string | null; autorNome?: string | null }) {
  const d = requireDb();
  await ensureContratosSchema();
  const { contrato } = await obterContrato(input.contratoId);
  if (!["GERADO", "EXPIRADO"].includes(contrato.status)) {
    throw new RegraNegocioError("Somente contratos gerados ou expirados podem ser enviados.", 400);
  }
  await d.execute(sql`
    UPDATE contratos SET status = 'ENVIADO', enviado_em = now(), atualizado_em = now(),
      canais = ${JSON.stringify(input.canais)}::jsonb,
      responsavel_id = COALESCE(${input.autorId ?? null}::uuid, responsavel_id)
    WHERE id = ${input.contratoId}::uuid
  `);
  await registrarEvento(contrato.id, contrato.vendedor_id, "ENVIADO", `Contrato enviado ao vendedor por ${input.autorNome || "administrador"} via ${input.canais.join(", ") || "portal"}.`, input.autorId, input.autorNome);
  await notificar(contrato.id, "VENDEDOR", "Seu contrato está disponível para assinatura.", `${contrato.identificador} aguarda sua assinatura.`);
  return { ok: true as const };
}

export async function marcarVisualizado(contratoId: string) {
  const d = requireDb();
  await ensureContratosSchema();
  const { contrato } = await obterContrato(contratoId);
  if (contrato.status !== "ENVIADO") return { ok: true as const };
  await d.execute(sql`
    UPDATE contratos SET status = 'VISUALIZADO', visualizado_em = now(), atualizado_em = now()
    WHERE id = ${contratoId}::uuid
  `);
  await registrarEvento(contrato.id, contrato.vendedor_id, "VISUALIZADO", "Contrato visualizado pelo vendedor.");
  return { ok: true as const };
}

/** Webhook/retorno da integração externa de assinatura eletrônica. */
export async function registrarRetornoAssinatura(input: {
  contratoId: string;
  evento: "ENVIADO" | "VISUALIZADO" | "ASSINADO" | "RECUSADO" | "EXPIRADO";
  provedor?: string | null;
  transacaoId?: string | null;
  arquivoAssinadoUrl?: string | null;
  evidencias?: unknown;
  ip?: string | null;
  comentario?: string | null;
}) {
  const d = requireDb();
  await ensureContratosSchema();
  const { contrato } = await obterContrato(input.contratoId);

  const base = sql`provedor_externo = COALESCE(${input.provedor ?? null}, provedor_externo),
    transacao_externa_id = COALESCE(${input.transacaoId ?? null}, transacao_externa_id),
    atualizado_em = now()`;

  if (input.evento === "ASSINADO") {
    await d.execute(sql`
      UPDATE contratos SET status = 'ASSINADO', assinado_em = now(), ${base},
        arquivo_assinado_url = COALESCE(${input.arquivoAssinadoUrl ?? null}, arquivo_assinado_url),
        evidencias = COALESCE(${input.evidencias ? JSON.stringify(input.evidencias) : null}::jsonb, evidencias),
        ip_assinatura = COALESCE(${input.ip ?? null}, ip_assinatura)
      WHERE id = ${contrato.id}::uuid
    `);
    await registrarEvento(contrato.id, contrato.vendedor_id, "ASSINADO", "Contrato assinado pelo vendedor.");
    await notificar(contrato.id, "ADMIN", "Contrato assinado", `${contrato.identificador} foi assinado.`);
    await notificar(contrato.id, "VENDEDOR", "Seu contrato foi assinado com sucesso.", `${contrato.identificador} concluído.`);
  } else if (input.evento === "RECUSADO") {
    await d.execute(sql`
      UPDATE contratos SET status = 'RECUSADO', recusado_em = now(), comentario_recusa = ${input.comentario ?? null}, ${base}
      WHERE id = ${contrato.id}::uuid
    `);
    await registrarEvento(contrato.id, contrato.vendedor_id, "RECUSADO", input.comentario ? `Contrato recusado: ${input.comentario}` : "Contrato recusado pelo vendedor.");
    await notificar(contrato.id, "ADMIN", "Contrato recusado", `${contrato.identificador} foi recusado pelo vendedor.`);
  } else if (input.evento === "EXPIRADO") {
    await d.execute(sql`UPDATE contratos SET status = 'EXPIRADO', expirado_em = now(), ${base} WHERE id = ${contrato.id}::uuid`);
    await registrarEvento(contrato.id, contrato.vendedor_id, "EXPIRADO", "O link de assinatura expirou.");
    await notificar(contrato.id, "ADMIN", "Contrato expirado", `${contrato.identificador} expirou e exige ação.`);
    await notificar(contrato.id, "VENDEDOR", "Seu link de assinatura expirou.", `${contrato.identificador} precisa ser reenviado.`);
  } else if (input.evento === "VISUALIZADO") {
    await marcarVisualizado(contrato.id);
  } else {
    await d.execute(sql`UPDATE contratos SET ${base} WHERE id = ${contrato.id}::uuid`);
  }
  return { ok: true as const };
}

export async function cancelarContrato(input: { contratoId: string; motivo: string; observacao?: string | null; autorId?: string | null; autorNome?: string | null }) {
  const d = requireDb();
  await ensureContratosSchema();
  if (!input.motivo?.trim()) throw new RegraNegocioError("Informe o motivo do cancelamento.", 400);
  const { contrato } = await obterContrato(input.contratoId);
  if (contrato.status === "CANCELADO") throw new RegraNegocioError("Contrato já cancelado.", 400);
  if (contrato.status === "ASSINADO") throw new RegraNegocioError("Contrato assinado não pode ser cancelado.", 400);
  await d.execute(sql`
    UPDATE contratos SET status = 'CANCELADO', cancelado_em = now(), atualizado_em = now(),
      motivo_cancelamento = ${input.motivo}, observacao_interna = ${input.observacao ?? null}
    WHERE id = ${input.contratoId}::uuid
  `);
  await registrarEvento(contrato.id, contrato.vendedor_id, "CANCELADO", `Contrato cancelado por ${input.autorNome || "administrador"}. Motivo: ${input.motivo}`, input.autorId, input.autorNome);
  return { ok: true as const };
}

export async function listarNotificacoesContratos(destino: "ADMIN" | "VENDEDOR") {
  const d = requireDb();
  await ensureContratosSchema();
  return rows(
    await d.execute(sql`
      SELECT n.*, c.identificador FROM contrato_notificacoes n
      LEFT JOIN contratos c ON c.id = n.contrato_id
      WHERE n.destino = ${destino}
      ORDER BY n.criado_em DESC LIMIT 20
    `),
  );
}
