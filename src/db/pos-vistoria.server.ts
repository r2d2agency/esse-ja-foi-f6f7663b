import { sql } from "drizzle-orm";
import { db } from "./index";

export async function ensurePosVistoriaSchema() {
  if (!db) return;
  
  // 1. Novos campos na tabela de veículos
  await db.execute(sql`
    ALTER TABLE veiculos 
    ADD COLUMN IF NOT EXISTS valor_fipe_atual numeric(12,2),
    ADD COLUMN IF NOT EXISTS valor_oferta_essejafoi numeric(12,2),
    ADD COLUMN IF NOT EXISTS margem_seguranca_percentual numeric(5,2) DEFAULT 15.00,
    ADD COLUMN IF NOT EXISTS data_proposta timestamptz,
    ADD COLUMN IF NOT EXISTS data_validade_proposta timestamptz,
    ADD COLUMN IF NOT EXISTS status_proposta text DEFAULT 'PENDENTE',
    ADD COLUMN IF NOT EXISTS motivo_recusa_proposta text;
  `);

  // 2. Tabela de depreciação detalhada
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS veiculos_depreciacao_detalhe (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      item_checklist text NOT NULL,
      valor_depreciacao numeric(12,2) NOT NULL,
      descricao text,
      criado_em timestamptz DEFAULT now()
    );
  `);
}

export async function getLaudoCompleto(veiculoId: string) {
  if (!db) return null;
  const res = await db.execute(sql`
    SELECT l.*, v.marca, v.modelo, v.placa, v.valor_interesse_cliente, v.valor_fipe_atual, v.margem_seguranca_percentual
    FROM laudos l
    JOIN veiculos v ON v.id = l.veiculo_id
    WHERE l.veiculo_id = ${veiculoId}::uuid
    ORDER BY l.criado_em DESC
    LIMIT 1
  `);
  return rowsOf(res)?.[0] || res[0];
}

export async function salvarProposta(data: {
  veiculoId: string;
  valorFipe: number;
  valorOferta: number;
  margem: number;
  depreciacoes: { item: string; valor: number; descricao?: string }[];
  responsavelId: string;
}) {
  if (!db) return { ok: false };
  
  return await db.transaction(async (tx) => {
    // 1. Limpar depreciações anteriores
    await tx.execute(sql`DELETE FROM veiculos_depreciacao_detalhe WHERE veiculo_id = ${data.veiculoId}::uuid`);
    
    // 2. Inserir novas depreciações
    for (const d of data.depreciacoes) {
      await tx.execute(sql`
        INSERT INTO veiculos_depreciacao_detalhe (veiculo_id, item_checklist, valor_depreciacao, descricao)
        VALUES (${data.veiculoId}::uuid, ${d.item}, ${d.valor}, ${d.descricao || null})
      `);
    }
    
    // 3. Atualizar veículo
    const validade = new Date();
    validade.setHours(validade.getHours() + 48); // 48h de validade
    
    await tx.execute(sql`
      UPDATE veiculos SET 
        valor_fipe_atual = ${data.valorFipe},
        valor_oferta_essejafoi = ${data.valorOferta},
        margem_seguranca_percentual = ${data.margem},
        data_proposta = now(),
        data_validade_proposta = ${validade.toISOString()},
        status_proposta = 'PENDENTE',
        status_analise = 'AGUARDANDO_APROVACAO_VENDEDOR',
        atualizado_em = now()
      WHERE id = ${data.veiculoId}::uuid
    `);
    
    // 4. Log
    await tx.execute(sql`
      INSERT INTO logs (entidade, entidade_id, acao, detalhe, usuario)
      VALUES ('veiculo', ${data.veiculoId}::uuid, 'PROPOSTA_GERADA', ${`Proposta de R$ ${data.valorOferta.toLocaleString('pt-BR')} gerada.`}, ${data.responsavelId}::uuid)
    `);
    
    return { ok: true };
  });
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
