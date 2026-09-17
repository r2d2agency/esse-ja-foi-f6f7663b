CREATE TABLE IF NOT EXISTS marketing_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  empresa text,
  tipo text NOT NULL DEFAULT 'prospect',
  status text NOT NULL DEFAULT 'ativo',
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  latitude text,
  longitude text,
  geo_status text NOT NULL DEFAULT 'pendente',
  geo_erro text,
  whatsapp_status text NOT NULL DEFAULT 'nao_verificado',
  origem text,
  observacoes text,
  comprador_id uuid REFERENCES profiles(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  cor text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketing_contato_tags (
  contato_id uuid NOT NULL REFERENCES marketing_contatos(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES marketing_tags(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contato_id, tag_id)
);

CREATE INDEX IF NOT EXISTS marketing_contatos_email_idx ON marketing_contatos (lower(email));
CREATE INDEX IF NOT EXISTS marketing_contatos_telefone_idx ON marketing_contatos (telefone);
CREATE INDEX IF NOT EXISTS marketing_contatos_tipo_status_idx ON marketing_contatos (tipo, status);
