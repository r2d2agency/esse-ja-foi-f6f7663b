import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function ensureAnalisePosVistoriaSchema() {
  const d = requireDb();

  // Tabela de Propostas
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS propostas_veiculo (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      versao integer NOT NULL DEFAULT 1,
      valor_referencia numeric(12,2),
      valor_minimo_acordado numeric(12,2) NOT NULL,
      comissao_tipo text NOT NULL DEFAULT 'PERCENTUAL', -- PERCENTUAL, FIXO
      comissao_valor numeric(12,2) NOT NULL,
      valor_liquido_vendedor numeric(12,2) NOT NULL,
      valor_minimo_interno numeric(12,2),
      observacao_interna text,
      mensagem_vendedor text,
      status text NOT NULL DEFAULT 'AGUARDANDO_ACEITE', -- AGUARDANDO_ACEITE, ACEITA, RECUSADA, EXPIRADA
      motivo_recusa text,
      detalhes_recusa text,
      enviado_por uuid REFERENCES profiles(id),
      enviado_em timestamptz DEFAULT now(),
      respondido_em timestamptz,
      ip_vendedor text,
      criado_em timestamptz DEFAULT now(),
      UNIQUE(veiculo_id, versao)
    );
  `);

  // Histórico de Fotos para Anúncio (seleção do admin)
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS veiculos_fotos_selecao (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      foto_laudo_id uuid REFERENCES laudo_fotos(id),
      foto_url text NOT NULL,
      eh_principal boolean DEFAULT false,
      usar_anuncio boolean DEFAULT true,
      ordem integer DEFAULT 0,
      criado_em timestamptz DEFAULT now()
    );
  `);
  
  // Pendências de Vistoria
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS vistorias_pendencias (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vistoria_id uuid NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
      tipo text NOT NULL, -- FOTO_FALTANTE, FOTO_INADEQUADA, ITEM_NAO_PREENCHIDO, DIVERGENCIA, OUTRO
      descricao text NOT NULL,
      status text NOT NULL DEFAULT 'PENDENTE', -- PENDENTE, RESOLVIDO
      criado_por uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now(),
      resolvido_em timestamptz
    );
  `);

  // Reconciliação de esquemas legados
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS valor_referencia numeric(12,2)`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS valor_minimo_interno numeric(12,2)`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS observacao_interna text`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS mensagem_vendedor text`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS motivo_recusa text`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS detalhes_recusa text`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS respondido_em timestamptz`);
  await d.execute(sql`ALTER TABLE propostas_veiculo ADD COLUMN IF NOT EXISTS ip_vendedor text`);
}


export async function listarVistoriasConcluidasFila() {
  const d = requireDb();
  await ensureAnalisePosVistoriaSchema();
  const res = await d.execute(sql`
    SELECT 
      v.id as vistoria_id,
      v.data_vistoria,
      v.horario_vistoria,
      v.status as vistoria_status,
      vei.id as veiculo_id,
      vei.placa,
      vei.marca,
      vei.modelo,
      vei.status_analise,
      prof.nome as vendedor_nome,
      pvist.nome as vistoriador_nome,
      uv.nome as unidade_nome,
      l.concluido_em,
      vei.responsavel_analise_id,
      resp.nome as responsavel_nome
    FROM vistorias v
    JOIN veiculos vei ON v.veiculo_id = vei.id
    JOIN profiles prof ON v.vendedor_id = prof.id
    JOIN unidades_vistoria uv ON v.unidade_id = uv.id
    LEFT JOIN vistoriadores vist ON v.vistoriador_id = vist.id
    LEFT JOIN profiles pvist ON vist.usuario_id = pvist.id
    LEFT JOIN laudos l ON l.vistoria_id = v.id
    LEFT JOIN profiles resp ON resp.id = vei.responsavel_analise_id
    WHERE vei.status_analise IN ('AGUARDANDO_ANALISE_LAUDO', 'EM_ANALISE_POS_VISTORIA', 'PENDENCIA_VISTORIA')
    ORDER BY l.concluido_em ASC NULLS LAST
  `);
  return rowsOf(res) || res;
}

export async function getDetalheAnaliseVistoria(veiculoId: string) {
  const d = requireDb();
  await ensureAnalisePosVistoriaSchema();
  const { ensureVistoriaSchema } = await import("./vistorias.server");
  await ensureVistoriaSchema();
  
  const vRes = await d.execute(sql`
    SELECT 
      v.*, 
      p.nome as vendedor_nome, p.cidade as vendedor_cidade, p.uf as vendedor_uf,
      resp.nome as responsavel_nome
    FROM veiculos v
    JOIN profiles p ON v.vendedor_id = p.id
    LEFT JOIN profiles resp ON resp.id = v.responsavel_analise_id
    WHERE v.id = ${veiculoId}::uuid
    LIMIT 1
  `);
  const veiculo = rowsOf(vRes)[0];

  const vistRes = await d.execute(sql`
    SELECT 
      vis.*, 
      uv.nome as unidade_nome,
      pvist.nome as vistoriador_nome,
      l.id as laudo_id,
      l.quilometragem_atual,
      l.observacao_geral,
      l.concluido_em
    FROM vistorias vis
    JOIN unidades_vistoria uv ON vis.unidade_id = uv.id
    LEFT JOIN vistoriadores vistor ON vis.vistoriador_id = vistor.id
    LEFT JOIN profiles pvist ON vistor.usuario_id = pvist.id
    LEFT JOIN laudos l ON l.vistoria_id = vis.id
    WHERE vis.veiculo_id = ${veiculoId}::uuid AND vis.status = 'CONCLUIDA'
    ORDER BY vis.criado_em DESC
    LIMIT 1
  `);
  const vistoria = rowsOf(vistRes)[0];

  let checklist = [];
  let fotos = [];
  if (vistoria?.laudo_id) {
    try {
      const checkRes = await d.execute(sql`
        SELECT
          r.id::text AS id,
          c.nome AS etapa,
          i.titulo AS item_chave,
          i.tipo_item,
          r.resposta_conformidade,
          r.resposta_texto,
          r.resposta_numero,
          r.resposta_opcoes,
          CASE
            WHEN r.resposta_conformidade IS NOT NULL THEN r.resposta_conformidade
            WHEN r.resposta_texto IS NOT NULL OR r.resposta_numero IS NOT NULL OR r.resposta_opcoes IS NOT NULL THEN 'RESPONDIDO'
            ELSE 'SEM_RESPOSTA'
          END AS status,
          r.observacao,
          r.foto_url,
          r.gps_lat,
          r.gps_lng,
          r.gps_precisao,
          r.registrado_em_dispositivo,
          r.respondido_em
        FROM laudo_vistoria_respostas r
        LEFT JOIN vistorias_checklist_categorias c ON c.id = r.categoria_id
        LEFT JOIN vistorias_checklist_itens i ON i.id = r.item_id
        WHERE r.laudo_id = ${vistoria.laudo_id}::uuid
        ORDER BY c.ordem, i.ordem, r.respondido_em
      `);
      checklist = rowsOf(checkRes);
      if (checklist.length === 0) {
        const legadoRes = await d.execute(sql`
          SELECT *, NULL::text AS tipo_item, NULL::text AS resposta_conformidade,
                 NULL::text AS resposta_texto, NULL::numeric AS resposta_numero,
                 NULL::jsonb AS resposta_opcoes, NULL::double precision AS gps_lat,
                 NULL::double precision AS gps_lng, NULL::double precision AS gps_precisao,
                 NULL::timestamptz AS registrado_em_dispositivo,
                 atualizado_em AS respondido_em
          FROM laudo_checklist
          WHERE laudo_id = ${vistoria.laudo_id}::uuid
          ORDER BY criado_em
        `);
        checklist = rowsOf(legadoRes);
      }
    } catch { checklist = []; }

    try {
      const fotoRes = await d.execute(sql`SELECT * FROM laudo_fotos WHERE laudo_id = ${vistoria.laudo_id}::uuid`);
      fotos = rowsOf(fotoRes);
      const fotosChecklist = checklist
        .filter((item: any) => item.foto_url)
        .map((item: any) => ({
          id: `checklist-${item.id}`,
          url: item.foto_url,
          tipo_foto: `${item.etapa || "Checklist"} — ${item.item_chave || "Item"}`,
          criado_em: item.respondido_em,
          origem: "checklist",
        }));
      const urls = new Set(fotos.map((foto: any) => foto.url));
      fotos = [...fotos, ...fotosChecklist.filter((foto: any) => !urls.has(foto.url))];
    } catch { fotos = []; }
  }

  const propRes = await d.execute(sql`
    SELECT * FROM propostas_veiculo 
    WHERE veiculo_id = ${veiculoId}::uuid 
    ORDER BY versao DESC
  `);
  const propostas = rowsOf(propRes) || [];

  return { veiculo, vistoria, checklist, fotos, propostas };
}

export async function enviarPropostaVendedor(data: any) {
  const d = requireDb();
  await ensureAnalisePosVistoriaSchema();

  const num = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const txt = (v: any): string | null => {
    const s = v === undefined || v === null ? "" : String(v).trim();
    return s ? s : null;
  };

  const valorMinimo = num(data.valor_minimo_acordado) ?? 0;
  const comissaoValor = num(data.comissao_valor) ?? 0;
  const liquido = num(data.valor_liquido_vendedor) ?? Math.max(valorMinimo - comissaoValor, 0);

  const vRes = await d.execute(sql`SELECT COALESCE(MAX(versao), 0) + 1 as prox FROM propostas_veiculo WHERE veiculo_id = ${data.veiculo_id}::uuid`);
  const versao = Number(rowsOf(vRes)[0]?.prox ?? 1);

  await d.execute(sql`
    INSERT INTO propostas_veiculo (
      veiculo_id, versao, valor_referencia, valor_minimo_acordado, 
      comissao_tipo, comissao_valor, valor_liquido_vendedor, 
      valor_minimo_interno, observacao_interna, mensagem_vendedor, enviado_por
    ) VALUES (
      ${data.veiculo_id}::uuid, ${versao}, ${num(data.valor_referencia)}, ${valorMinimo},
      ${txt(data.comissao_tipo) ?? "PERCENTUAL"}, ${comissaoValor}, ${liquido},
      ${num(data.valor_minimo_interno)}, ${txt(data.observacao_interna)}, ${txt(data.mensagem_vendedor)}, ${txt(data.usuario_id)}::uuid
    )
  `);


  await d.execute(sql`
    UPDATE veiculos SET 
      status_analise = 'AGUARDANDO_ACEITE_VENDEDOR',
      atualizado_em = now()
    WHERE id = ${data.veiculo_id}::uuid
  `);

  // Notificação por e-mail ao vendedor (não bloqueia o envio da proposta)
  try {
    const destRes = await d.execute(sql`
      SELECT p.email, p.nome, v.marca, v.modelo, v.placa
      FROM veiculos v
      JOIN profiles p ON p.id = v.perfil_id
      WHERE v.id = ${data.veiculo_id}::uuid
      LIMIT 1
    `);
    const dest = rowsOf(destRes)[0];
    if (dest?.email) {
      const { enviarEmailSimples } = await import("./mail.server");
      const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const primeiroNome = String(dest.nome || "").split(" ")[0] || "vendedor";
      await enviarEmailSimples(
        String(dest.email),
        `Você recebeu uma proposta para o ${dest.marca} ${dest.modelo}`,
        `
        <div style="font-family:Arial,sans-serif;color:#0f172a">
          <h2 style="margin:0 0 8px">Olá, ${primeiroNome}!</h2>
          <p style="margin:0 0 16px;color:#475569">
            Concluímos a análise pós-vistoria do seu <b>${dest.marca} ${dest.modelo}</b> (${dest.placa})
            e enviamos uma proposta para você avaliar.
          </p>
          <table style="border-collapse:collapse;margin-bottom:16px">
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Valor mínimo de venda</td><td style="padding:4px 0"><b>${brl(valorMinimo)}</b></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Comissão</td><td style="padding:4px 0">${brl(comissaoValor)}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#64748b">Líquido estimado</td><td style="padding:4px 0"><b>${brl(liquido)}</b></td></tr>
          </table>
          <p style="margin:0 0 16px;color:#475569">
            Acesse seu painel para aceitar ou recusar a proposta. A proposta também aparece na tela inicial do seu app.
          </p>
          <p style="margin:0;color:#94a3b8;font-size:12px">Esse Já Foi</p>
        </div>`
      );
    }
  } catch (err) {
    console.error("[analise-pos-vistoria] Falha ao enviar e-mail de proposta:", err);
  }

  return { ok: true, versao };
}

export async function listarPropostasPendentesVendedor(perfilId: string) {
  const d = requireDb();
  await ensureAnalisePosVistoriaSchema();
  const res = await d.execute(sql`
    SELECT DISTINCT ON (p.veiculo_id)
      p.id, p.veiculo_id, p.versao, p.valor_minimo_acordado, p.comissao_valor,
      p.valor_liquido_vendedor, p.mensagem_vendedor, p.enviado_em,
      v.marca, v.modelo, v.placa
    FROM propostas_veiculo p
    JOIN veiculos v ON v.id = p.veiculo_id
    WHERE (v.perfil_id = ${perfilId}::uuid OR v.vendedor_id = ${perfilId}::uuid)
      AND UPPER(COALESCE(p.status, '')) IN ('AGUARDANDO_ACEITE', 'ENVIADA', 'PENDENTE')
    ORDER BY p.veiculo_id, p.versao DESC
  `);
  return rowsOf(res);
}

export async function solicitarNovaVistoria(data: { veiculoId: string; vistoriaId: string; motivo: string; usuarioId: string }) {
  const d = requireDb();
  const { ensureVistoriaSchema } = await import("./vistorias.server");
  await ensureVistoriaSchema();

  await d.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE veiculos
      SET status = 'PRONTO_PARA_VISTORIA',
          status_analise = 'PRONTO_PARA_VISTORIA',
          atualizado_em = now()
      WHERE id = ${data.veiculoId}::uuid
    `);
    await tx.execute(sql`
      INSERT INTO vistorias_historico (vistoria_id, acao, detalhe, usuario_id)
      VALUES (${data.vistoriaId}::uuid, 'NOVA_VISTORIA_SOLICITADA', ${data.motivo}, ${data.usuarioId}::uuid)
    `);
  });

  return { ok: true as const };
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}

export async function getPropostaVeiculoVendedor(veiculoId: string, perfilId: string) {
  const d = requireDb();
  await ensureAnalisePosVistoriaSchema();

  const vRes = await d.execute(sql`
    SELECT id::text AS id, marca, modelo, placa, status_analise,
           perfil_id::text AS perfil_id, vendedor_id::text AS vendedor_id
    FROM veiculos
    WHERE id = ${veiculoId}::uuid
    LIMIT 1
  `);
  const veiculo = rowsOf(vRes)[0] ?? null;

  if (!veiculo) return { veiculo: null, proposta: null, message: "Veículo não encontrado." };

  const dono = [veiculo.perfil_id, veiculo.vendedor_id].filter(Boolean).map(String);
  if (dono.length > 0 && !dono.includes(String(perfilId))) {
    return { veiculo: null, proposta: null, message: "Este veículo não pertence à sua conta." };
  }

  const pRes = await d.execute(sql`
    SELECT id::text AS id, veiculo_id::text AS veiculo_id, versao, status,
           valor_minimo_acordado, mensagem_vendedor, enviado_em
    FROM propostas_veiculo
    WHERE veiculo_id = ${veiculoId}::uuid
    ORDER BY COALESCE(versao, 0) DESC, enviado_em DESC NULLS LAST
    LIMIT 1
  `);
  const proposta = rowsOf(pRes)[0] ?? null;

  return {
    veiculo,
    proposta,
    message: proposta ? undefined : "Nenhuma proposta foi enviada para este veículo ainda.",
  };
}


export async function responderPropostaVendedor(data: {
  veiculoId: string;
  propostaId: string;
  perfilId: string;
  aceite: boolean;
  motivoRecusa?: string;
  detalhesRecusa?: string;
  ip?: string;
}) {
  const d = requireDb();
  await ensureAnalisePosVistoriaSchema();

  return d.transaction(async (tx) => {
    const propostaRes = await tx.execute(sql`
      SELECT p.id::text AS id, p.status, p.veiculo_id::text AS veiculo_id
      FROM propostas_veiculo p
      JOIN veiculos v ON v.id = p.veiculo_id
      WHERE p.id = ${data.propostaId}::uuid
        AND p.veiculo_id = ${data.veiculoId}::uuid
        AND (v.perfil_id IS NULL OR v.perfil_id = ${data.perfilId}::uuid)
        AND (v.vendedor_id IS NULL OR v.vendedor_id = ${data.perfilId}::uuid)
      FOR UPDATE
    `);
    const proposta = rowsOf(propostaRes)[0];

    if (!proposta) {
      return { ok: false as const, message: "Proposta não encontrada para este vendedor." };
    }

    const statusAtual = String(proposta.status || "").trim().toUpperCase();
    if (statusAtual === "ACEITA") {
      return { ok: true as const, alreadyAnswered: true as const };
    }
    if (["RECUSADA", "EXPIRADA", "CANCELADA"].includes(statusAtual)) {
      return { ok: false as const, message: "Esta proposta já foi encerrada e não pode mais ser aceita." };
    }

    const novoStatus = data.aceite ? "ACEITA" : "RECUSADA";
    const statusVeiculo = data.aceite ? "PRONTO_PARA_ANUNCIO" : "VALOR_RECUSADO";

    await tx.execute(sql`
      UPDATE propostas_veiculo
      SET status = ${novoStatus},
          respondido_em = now(),
          motivo_recusa = ${data.motivoRecusa?.trim() || null},
          detalhes_recusa = ${data.detalhesRecusa?.trim() || null},
          ip_vendedor = ${data.ip?.trim() || null}
      WHERE id = ${data.propostaId}::uuid
    `);

    await tx.execute(sql`
      UPDATE veiculos
      SET status_analise = ${statusVeiculo},
          atualizado_em = now()
      WHERE id = ${data.veiculoId}::uuid
    `);

    return { ok: true as const, alreadyAnswered: false as const };
  });
}
