-- Adiciona colunas necessarias para o modulo de compradores na tabela profiles
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "senha_hash" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "cpf" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "cnpj" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "tipo_pessoa" text DEFAULT 'PF';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "razao_social" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "nome_fantasia" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "inscricao_estadual" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "responsavel_nome" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "responsavel_cpf" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "responsavel_whatsapp" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "responsavel_email" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "responsavel_cargo" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "regiao_atuacao" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "origem_cadastro" text DEFAULT 'AUTOCADASTRO';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "etapa_cadastro" integer DEFAULT 1;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "status_compliance" text DEFAULT 'NAO_ENVIADO';
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "compliance_motivo_pendencia" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "pode_ver_valores" boolean NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "pode_dar_lances" boolean NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "documento_cnh_url" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "documento_cnh_verso_url" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "documento_crlv_url" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "documento_selfie_url" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "documento_comprovante_endereco_url" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "documento_comprovante_url" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "documento_contrato_social_url" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "cadastro_completo" boolean NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "cep" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "endereco" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "numero" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "bairro" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "complemento" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "cidade" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "uf" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "protegido" boolean NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "atualizado_em" timestamptz NOT NULL DEFAULT now();

-- Tabelas auxiliares do comprador
CREATE TABLE IF NOT EXISTS "comprador_favoritos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "comprador_id" uuid NOT NULL,
  "anuncio_id" uuid NOT NULL,
  "criado_em" timestamptz DEFAULT now(),
  UNIQUE ("comprador_id", "anuncio_id")
);

CREATE TABLE IF NOT EXISTS "comprador_lembretes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "comprador_id" uuid NOT NULL,
  "anuncio_id" uuid NOT NULL,
  "lembrar_em" timestamptz,
  "enviado" boolean DEFAULT false,
  "criado_em" timestamptz DEFAULT now(),
  UNIQUE ("comprador_id", "anuncio_id")
);

CREATE TABLE IF NOT EXISTS "comprador_notificacoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "comprador_id" uuid NOT NULL,
  "tipo" text NOT NULL,
  "titulo" text NOT NULL,
  "mensagem" text,
  "link" text,
  "lida" boolean DEFAULT false,
  "criado_em" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_notif_comprador" ON "comprador_notificacoes"("comprador_id", "lida", "criado_em" DESC);
