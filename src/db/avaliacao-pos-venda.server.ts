import { sql } from "drizzle-orm";
import { db } from "./index";
import { criarNotificacaoComprador } from "./comprador.server";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}
const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : r?.rows || []);

export async function ensureAvaliacaoPosVendaSchema() {
  const d = requireDb();
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS avaliacao_pos_venda (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), negociacao_id uuid NOT NULL UNIQUE REFERENCES negociacoes(id) ON DELETE CASCADE,
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE, comprador_id uuid NOT NULL REFERENCES profiles(id),
      modalidade text NOT NULL CHECK (modalidade IN ('INTERNA','EXTERNA')), status text NOT NULL DEFAULT 'PENDENTE',
      unidade_id uuid REFERENCES unidades_vistoria(id), avaliador_id uuid REFERENCES profiles(id), arquivo_url text, arquivo_nome text,
      observacao text, criado_por uuid REFERENCES profiles(id), criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now()
    )
  `);
  await d.execute(
    sql`CREATE INDEX IF NOT EXISTS idx_avaliacao_pos_venda_comprador ON avaliacao_pos_venda(comprador_id, status)`,
  );
}

export async function listarAvaliacoesPosVendaAdmin(veiculoId?: string) {
  const d = requireDb();
  await ensureAvaliacaoPosVendaSchema();
  const r = await d.execute(sql`
    SELECT a.*, n.codigo AS negociacao_codigo, v.placa, p.nome AS comprador_nome, u.nome AS unidade_nome
    FROM avaliacao_pos_venda a JOIN negociacoes n ON n.id=a.negociacao_id JOIN veiculos v ON v.id=a.veiculo_id
    LEFT JOIN profiles p ON p.id=a.comprador_id LEFT JOIN unidades_vistoria u ON u.id=a.unidade_id
    WHERE (${veiculoId || null}::uuid IS NULL OR a.veiculo_id=${veiculoId || null}::uuid) ORDER BY a.criado_em DESC
  `);
  return rowsOf(r);
}

export async function criarAvaliacaoPosVenda(data: {
  negociacaoId: string;
  modalidade: string;
  criadoPor?: string | null;
}) {
  const d = requireDb();
  await ensureAvaliacaoPosVendaSchema();
  const n = rowsOf(
    await d.execute(
      sql`SELECT id, veiculo_id, comprador_id, codigo FROM negociacoes WHERE id=${data.negociacaoId}::uuid LIMIT 1`,
    ),
  )[0];
  if (!n) throw new Error("Negociação não encontrada.");
  if (!["INTERNA", "EXTERNA"].includes(data.modalidade)) throw new Error("Modalidade inválida.");
  const status = data.modalidade === "EXTERNA" ? "AGUARDANDO_PDF_EXTERNO" : "PENDENTE";
  const r = await d.execute(sql`
    INSERT INTO avaliacao_pos_venda (negociacao_id,veiculo_id,comprador_id,modalidade,status,criado_por)
    VALUES (${n.id}::uuid,${n.veiculo_id}::uuid,${n.comprador_id}::uuid,${data.modalidade},${status},${data.criadoPor || null}::uuid)
    ON CONFLICT (negociacao_id) DO UPDATE SET modalidade=EXCLUDED.modalidade,status=EXCLUDED.status,atualizado_em=now()
    RETURNING *
  `);
  if (data.modalidade === "EXTERNA")
    await criarNotificacaoComprador(
      String(n.comprador_id),
      "AVALIACAO_POS_VENDA",
      "Cautelar necessária",
      "Anexe o PDF da cautelar realizada para concluir a avaliação do veículo.",
      "/comprador/avaliacoes",
    );
  return rowsOf(r)[0];
}

export async function listarAvaliacoesDoComprador(compradorId: string) {
  const d = requireDb();
  await ensureAvaliacaoPosVendaSchema();
  return rowsOf(
    await d.execute(
      sql`SELECT a.*, n.codigo AS negociacao_codigo, v.placa, v.marca, v.modelo FROM avaliacao_pos_venda a JOIN negociacoes n ON n.id=a.negociacao_id JOIN veiculos v ON v.id=a.veiculo_id WHERE a.comprador_id=${compradorId}::uuid ORDER BY a.criado_em DESC`,
    ),
  );
}

export async function anexarCautelarComprador(
  id: string,
  compradorId: string,
  arquivoUrl: string,
  arquivoNome?: string,
) {
  const d = requireDb();
  await ensureAvaliacaoPosVendaSchema();
  const r = await d.execute(
    sql`UPDATE avaliacao_pos_venda SET arquivo_url=${arquivoUrl},arquivo_nome=${arquivoNome || null},status='RECEBIDA',atualizado_em=now() WHERE id=${id}::uuid AND comprador_id=${compradorId}::uuid AND modalidade='EXTERNA' RETURNING *`,
  );
  const item = rowsOf(r)[0];
  if (!item) throw new Error("Solicitação não encontrada ou sem permissão.");
  return item;
}
