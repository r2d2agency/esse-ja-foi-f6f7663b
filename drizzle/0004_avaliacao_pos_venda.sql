CREATE TABLE IF NOT EXISTS avaliacao_pos_venda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negociacao_id uuid NOT NULL UNIQUE REFERENCES negociacoes(id) ON DELETE CASCADE,
  veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  comprador_id uuid NOT NULL REFERENCES profiles(id),
  modalidade text NOT NULL CHECK (modalidade IN ('INTERNA', 'EXTERNA')),
  status text NOT NULL DEFAULT 'PENDENTE',
  unidade_id uuid REFERENCES unidades_vistoria(id),
  avaliador_id uuid REFERENCES profiles(id),
  arquivo_url text,
  arquivo_nome text,
  observacao text,
  criado_por uuid REFERENCES profiles(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avaliacao_pos_venda_comprador ON avaliacao_pos_venda(comprador_id, status);
CREATE INDEX IF NOT EXISTS idx_avaliacao_pos_venda_veiculo ON avaliacao_pos_venda(veiculo_id);
