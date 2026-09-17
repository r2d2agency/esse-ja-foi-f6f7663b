import { pgTable, uuid, text, timestamp, boolean, pgEnum } from 'drizzle-orm/pg-core';

export const appRoleEnum = pgEnum('app_role', ['admin', 'operacao', 'vistoriador', 'comprador', 'vendedor']);

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome'),
  telefone: text('telefone'),
  whatsapp: text('whatsapp'),
  email: text('email').unique().notNull(),
  role: appRoleEnum('role').default('vendedor').notNull(),
  senha_hash: text('senha_hash'),
  cpf: text('cpf'),
  cep: text('cep'),
  endereco: text('endereco'),
  cidade: text('cidade'),
  uf: text('uf'),
  ativo: boolean('ativo').default(true).notNull(),
  criado_em: timestamp('criado_em').defaultNow().notNull(),
});

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  whatsapp: text('whatsapp').notNull(),
  cidade: text('cidade'),
  marca: text('marca'),
  modelo: text('modelo'),
  ano: text('ano'),
  mensagem: text('mensagem'),
  origem: text('origem'),
  campanha: text('campanha'),
  status: text('status').default('novo').notNull(),
  responsavel_id: uuid('responsavel_id').references(() => profiles.id),
  tentativas_contato: text('tentativas_contato'),
  convertido_cliente_id: uuid('convertido_cliente_id'),
  criado_em: timestamp('criado_em').defaultNow().notNull(),
});

export const veiculos = pgTable('veiculos', {
  id: uuid('id').primaryKey().defaultRandom(),
  placa: text('placa').unique().notNull(),
  marca: text('marca').notNull(),
  modelo: text('modelo').notNull(),
  ano_fabricacao: text('ano_fabricacao'),
  ano_modelo: text('ano_modelo'),
  status: text('status').default('cadastrado').notNull(),
  criado_em: timestamp('criado_em').defaultNow().notNull(),
});

export const leiloes = pgTable('leiloes', {
  id: uuid('id').primaryKey().defaultRandom(),
  veiculo_id: uuid('veiculo_id').references(() => veiculos.id).notNull(),
  inicio_em: timestamp('inicio_em').notNull(),
  fim_em: timestamp('fim_em').notNull(),
  lance_inicial: text('lance_inicial').notNull(),
  status: text('status').default('agendado').notNull(),
  criado_em: timestamp('criado_em').defaultNow().notNull(),
});

export const lances = pgTable('lances', {
  id: uuid('id').primaryKey().defaultRandom(),
  leilao_id: uuid('leilao_id').references(() => leiloes.id).notNull(),
  comprador_id: uuid('comprador_id').references(() => profiles.id).notNull(),
  valor: text('valor').notNull(),
  criado_em: timestamp('criado_em').defaultNow().notNull(),
});

import { relations } from 'drizzle-orm';

export const veiculosRelations = relations(veiculos, ({ many }) => ({
  leiloes: many(leiloes),
}));

export const leiloesRelations = relations(leiloes, ({ one, many }) => ({
  veiculo: one(veiculos, {
    fields: [leiloes.veiculo_id],
    references: [veiculos.id],
  }),
  lances: many(lances),
}));

export const lancesRelations = relations(lances, ({ one }) => ({
  leilao: one(leiloes, {
    fields: [lances.leilao_id],
    references: [leiloes.id],
  }),
  comprador: one(profiles, {
    fields: [lances.comprador_id],
    references: [profiles.id],
  }),
}));


export const veiculoTimeline = pgTable('veiculo_timeline', {
  id: uuid('id').primaryKey().defaultRandom(),
  veiculo_id: uuid('veiculo_id').references(() => veiculos.id).notNull(),
  tipo: text('tipo').notNull(),
  descricao: text('descricao').notNull(),
  responsavel_id: uuid('responsavel_id').references(() => profiles.id),
  criado_em: timestamp('criado_em').defaultNow().notNull(),
});

export const marketingContatos = pgTable('marketing_contatos', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  email: text('email'),
  telefone: text('telefone'),
  empresa: text('empresa'),
  tipo: text('tipo').default('prospect').notNull(),
  status: text('status').default('ativo').notNull(),
  cep: text('cep'),
  endereco: text('endereco'),
  numero: text('numero'),
  complemento: text('complemento'),
  bairro: text('bairro'),
  cidade: text('cidade'),
  uf: text('uf'),
  latitude: text('latitude'),
  longitude: text('longitude'),
  geo_status: text('geo_status').default('pendente').notNull(),
  geo_erro: text('geo_erro'),
  whatsapp_status: text('whatsapp_status').default('nao_verificado').notNull(),
  origem: text('origem'),
  observacoes: text('observacoes'),
  comprador_id: uuid('comprador_id').references(() => profiles.id),
  criado_em: timestamp('criado_em').defaultNow().notNull(),
  atualizado_em: timestamp('atualizado_em').defaultNow().notNull(),
});

export const marketingTags = pgTable('marketing_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').unique().notNull(),
  cor: text('cor'),
  criado_em: timestamp('criado_em').defaultNow().notNull(),
});

export const marketingContatoTags = pgTable('marketing_contato_tags', {
  contato_id: uuid('contato_id').references(() => marketingContatos.id).notNull(),
  tag_id: uuid('tag_id').references(() => marketingTags.id).notNull(),
  criado_em: timestamp('criado_em').defaultNow().notNull(),
});
