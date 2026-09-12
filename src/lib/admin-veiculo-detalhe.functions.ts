import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function normalizarUuid(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0]?.toLowerCase() || null;
}

export const getVeiculoDetalheAdminFn = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    const { sql } = await import("drizzle-orm");
    const { ensureVeiculosAdminSchema } = await import("@/db/admin-veiculos.server");
    const { ensurePerfilSchema } = await import("@/db/perfil.server");
    
    if (!db) throw new Error("Banco de dados indisponível");

    // Garantir que a tabela tenha todas as colunas necessárias (perfil_id, status_analise, etc)
    await ensureVeiculosAdminSchema();
    await ensurePerfilSchema();

    const veiculoId = normalizarUuid(data.id);
    // #region debug-point A:route-id
    fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "admin-vehicle-detail", runId: "pre-fix", hypothesisId: "A", location: "src/lib/admin-veiculo-detalhe.functions.ts:getVeiculoDetalheAdminFn:start", msg: "[DEBUG] admin vehicle detail request received", data: { rawId: data.id, normalizedId: veiculoId }, ts: Date.now() }) }).catch(() => {});
    // #endregion
    if (!veiculoId) {
      // #region debug-point A:invalid-id
      fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "admin-vehicle-detail", runId: "pre-fix", hypothesisId: "A", location: "src/lib/admin-veiculo-detalhe.functions.ts:getVeiculoDetalheAdminFn:invalid-id", msg: "[DEBUG] vehicle detail received invalid id", data: { rawId: data.id }, ts: Date.now() }) }).catch(() => {});
      // #endregion
      return { ok: false as const, message: "ID do veículo inválido." };
    }

    try {
      let rows = await db.execute(sql`
        SELECT
          v.*,
          p.nome as vendedor_nome, p.email as vendedor_email, p.whatsapp as vendedor_whatsapp,
          p.cpf as vendedor_cpf,
          p.cadastro_completo as vendedor_cadastro_completo,
          p.verificado,
          p.status_compliance as compliance_status,
          p.documento_crlv_status as vendedor_documento_crlv_status,
          (SELECT status FROM contratos WHERE vendedor_id = v.perfil_id OR vendedor_id = v.vendedor_id ORDER BY atualizado_em DESC NULLS LAST, gerado_em DESC NULLS LAST LIMIT 1) as contrato_status,
          resp.nome as responsavel_nome
        FROM veiculos v
        LEFT JOIN profiles p ON p.id = v.perfil_id OR p.id = v.vendedor_id
        LEFT JOIN profiles resp ON resp.id = v.responsavel_analise_id
        WHERE lower(v.id::text) = ${veiculoId}
        LIMIT 1
      `);

      let veiculo = (rows as any).rows?.[0] || (rows as any)[0];
      // #region debug-point B:detail-query
      fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "admin-vehicle-detail", runId: "pre-fix", hypothesisId: "B", location: "src/lib/admin-veiculo-detalhe.functions.ts:getVeiculoDetalheAdminFn:detail-query", msg: "[DEBUG] vehicle detail primary query finished", data: { veiculoId, found: !!veiculo, rowCount: Array.isArray((rows as any).rows) ? (rows as any).rows.length : Array.isArray(rows as any) ? (rows as any).length : null }, ts: Date.now() }) }).catch(() => {});
      // #endregion

      if (!veiculo) {
        return { ok: false as const, message: `Veículo não encontrado (ID: ${veiculoId}).` };
      }

      const logsRows = await db.execute(sql`
        SELECT * FROM logs
        WHERE entidade = 'veiculo' AND entidade_id = ${veiculoId}::uuid
        ORDER BY criado_em DESC
      `);

      const { calcularProgressoVeiculo, canReleaseForInspection } = await import("@/db/veiculos-compliance.server");
      const progresso = calcularProgressoVeiculo(veiculo);
      const validacao = canReleaseForInspection(veiculo);
      // #region debug-point C:post-processing
      fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "admin-vehicle-detail", runId: "pre-fix", hypothesisId: "C", location: "src/lib/admin-veiculo-detalhe.functions.ts:getVeiculoDetalheAdminFn:post-processing", msg: "[DEBUG] vehicle detail post-processing completed", data: { veiculoId, logsCount: Array.isArray((logsRows as any).rows) ? (logsRows as any).rows.length : Array.isArray(logsRows as any) ? (logsRows as any).length : null, readyForInspection: !!validacao?.ready }, ts: Date.now() }) }).catch(() => {});
      // #endregion

      return {
        ok: true as const,
        data: veiculo,
        progresso,
        validacao,
        historico: (logsRows as any).rows || logsRows
      };
    } catch (error: any) {
      // #region debug-point D:server-error
      fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "admin-vehicle-detail", runId: "pre-fix", hypothesisId: "D", location: "src/lib/admin-veiculo-detalhe.functions.ts:getVeiculoDetalheAdminFn:catch", msg: "[DEBUG] vehicle detail server function threw", data: { veiculoId, errorMessage: error?.message ?? null, errorName: error?.name ?? null, errorStack: error?.stack ?? null }, ts: Date.now() }) }).catch(() => {});
      // #endregion
      throw error;
    }
  });

export const assumirAnaliseVeiculoFn = createServerFn({ method: "POST" })
  .validator(z.object({
    veiculoId: z.string().uuid(),
    responsavelId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    const { sql } = await import("drizzle-orm");
    if (!db) throw new Error("Banco de dados indisponível");

    await db.execute(sql`
      UPDATE veiculos 
      SET 
        responsavel_analise_id = ${data.responsavelId}::uuid,
        status_analise = 'EM_ANALISE',
        atualizado_em = now()
      WHERE id = ${data.veiculoId}::uuid
    `);

    await db.execute(sql`
      INSERT INTO logs (entidade, entidade_id, acao, detalhe, usuario)
      VALUES ('veiculo', ${data.veiculoId}::uuid, 'ASSUMIR_ANALISE', 'Análise assumida pelo administrador', ${data.responsavelId}::uuid)
    `);

    return { ok: true as const };
  });

export const atualizarStatusAnaliseFn = createServerFn({ method: "POST" })
  .validator(z.object({
    veiculoId: z.string().uuid(),
    status: z.string(),
    observacaoInterna: z.string().optional(),
    mensagemVendedor: z.string().optional(),
    responsavelId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    const { sql } = await import("drizzle-orm");
    if (!db) throw new Error("Banco de dados indisponível");

    // Validação extra: Se estiver tentando liberar para vistoria, verificar CRLV
    if (data.status === 'PRONTO_PARA_VISTORIA') {
      const vQuery = await db.execute(sql`
        SELECT v.*, p.status_compliance as compliance_status,
               (SELECT status FROM contratos WHERE vendedor_id = v.perfil_id OR vendedor_id = v.vendedor_id ORDER BY atualizado_em DESC NULLS LAST, gerado_em DESC NULLS LAST LIMIT 1) as contrato_status,
               p.verificado,
               p.documento_crlv_status
        FROM veiculos v 
        JOIN profiles p ON p.id = v.perfil_id OR p.id = v.vendedor_id
        WHERE v.id = ${data.veiculoId}::uuid
      `);
      const v = (vQuery as any).rows?.[0] || (vQuery as any)[0];
      
      const { canReleaseForInspection } = await import("@/db/veiculos-compliance.server");
      const check = canReleaseForInspection(v);
      
      if (!check.ready) {
        return { ok: false as const, message: "Existem pendências impeditivas para a vistoria." };
      }
    }

    await db.execute(sql`
      UPDATE veiculos 
      SET 
        status_analise = ${data.status},
        observacoes = COALESCE(${data.observacaoInterna ?? null}, observacoes),
        atualizado_em = now()
      WHERE id = ${data.veiculoId}::uuid
    `);

    await db.execute(sql`
      INSERT INTO logs (entidade, entidade_id, acao, detalhe, usuario)
      VALUES ('veiculo', ${data.veiculoId}::uuid, 'ALTERACAO_STATUS_ANALISE', ${data.status}, ${data.responsavelId}::uuid)
    `);

    return { ok: true as const };
  });

export const atualizarStatusDocumentoVeiculoFn = createServerFn({ method: "POST" })
  .validator(z.object({
    veiculoId: z.string().uuid(),
    perfilId: z.string().uuid(),
    documentoTipo: z.string(), // e.g., 'CRLV'
    status: z.string(),
    motivo: z.string().optional(),
    observacao: z.string().optional(),
    responsavelId: z.string().uuid(),
  }))
  .handler(async ({ data }) => {
    const { db } = await import("@/db/index");
    const { sql } = await import("drizzle-orm");
    if (!db) throw new Error("Banco de dados indisponível");

    const colStatus = `documento_${data.documentoTipo.toLowerCase()}_status`;
    
    // 1. Atualizar status do documento no perfil
    await db.execute(sql.raw(`
      UPDATE profiles 
      SET ${colStatus} = '${data.status}', 
          atualizado_em = now() 
      WHERE id = '${data.perfilId}'
    `));

    // 2. Se for pendência, registrar na tabela de pendências
    if (data.status === 'NOVO_ENVIO_SOLICITADO' || data.status === 'PENDENCIA') {
      await db.execute(sql`
        INSERT INTO compliance_pendencias (vendedor_id, documento_tipo, motivo, mensagem, status)
        VALUES (${data.perfilId}::uuid, ${data.documentoTipo}, ${data.motivo || 'N/A'}, ${data.observacao || null}, 'PENDENTE')
      `);
      
      // Também marcar status_compliance como PENDENCIA se não estiver já
      await db.execute(sql`
        UPDATE profiles SET status_compliance = 'PENDENCIA' WHERE id = ${data.perfilId}::uuid
      `);
    }

    // 3. Registrar no histórico de compliance
    const detalheAcao = data.motivo ? `Motivo: ${data.motivo}. ${data.observacao || ''}` : `Status alterado para ${data.status}`;
    await db.execute(sql`
      INSERT INTO compliance_historico (vendedor_id, autor_id, acao, detalhe)
      VALUES (${data.perfilId}::uuid, ${data.responsavelId}::uuid, ${`DOC_${data.documentoTipo.toUpperCase()}_${data.status}`}, ${detalheAcao})
    `);

    // 4. Registrar log do veículo
    await db.execute(sql`
      INSERT INTO logs (entidade, entidade_id, acao, detalhe, usuario)
      VALUES ('veiculo', ${data.veiculoId}::uuid, 'DOC_STATUS_CHANGE', ${`${data.documentoTipo}: ${data.status}`}, ${data.responsavelId}::uuid)
    `);

    return { ok: true as const };
  });

