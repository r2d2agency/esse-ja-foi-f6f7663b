import { sql } from "drizzle-orm";
import { db } from "./index";
import { prepararFinanceiroNegociacao } from "./financeiro.server";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export const STATUS_ENTREGA = [
  "AGUARDANDO_ORGANIZACAO",
  "AGUARDANDO_AGENDAMENTO",
  "ENTREGA_AGENDADA",
  "REAGENDAMENTO_SOLICITADO",
  "AGUARDANDO_ENTREGA",
  "EM_PROCESSO_DE_ENTREGA",
  "AGUARDANDO_CONFIRMACAO_COMPRADOR",
  "ENTREGA_CONFIRMADA",
  "DIVERGENCIA_NA_ENTREGA",
  "ENTREGA_CANCELADA",
  "NAO_COMPARECIMENTO_VENDEDOR",
  "NAO_COMPARECIMENTO_COMPRADOR",
  "LIBERADO_PARA_REPASSE",
] as const;

export const ROTULO_ENTREGA: Record<string, string> = {
  AGUARDANDO_ORGANIZACAO: "Aguardando organização da entrega",
  AGUARDANDO_AGENDAMENTO: "Aguardando agendamento",
  ENTREGA_AGENDADA: "Entrega agendada",
  REAGENDAMENTO_SOLICITADO: "Reagendamento solicitado",
  AGUARDANDO_ENTREGA: "Aguardando entrega",
  EM_PROCESSO_DE_ENTREGA: "Em processo de entrega",
  AGUARDANDO_CONFIRMACAO_COMPRADOR: "Aguardando confirmação do comprador",
  ENTREGA_CONFIRMADA: "Entrega confirmada",
  DIVERGENCIA_NA_ENTREGA: "Divergência na entrega",
  ENTREGA_CANCELADA: "Entrega cancelada",
  NAO_COMPARECIMENTO_VENDEDOR: "Não comparecimento do vendedor",
  NAO_COMPARECIMENTO_COMPRADOR: "Não comparecimento do comprador",
  LIBERADO_PARA_REPASSE: "Liberado para repasse",
};

export async function ensureEntregasSchema() {
  const d = requireDb();

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS entregas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      negociacao_id uuid UNIQUE NOT NULL REFERENCES negociacoes(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'AGUARDANDO_ORGANIZACAO',
      tipo_local text,
      local_nome text,
      cep text, endereco text, numero text, complemento text,
      bairro text, cidade text, uf text,
      responsavel_recebimento text,
      telefone_contato text,
      orientacao text,
      data_entrega date,
      hora_inicio time,
      hora_fim time,
      responsavel_interno_id uuid REFERENCES profiles(id),
      vendedor_confirmou_em timestamptz,
      comprador_confirmou_em timestamptz,
      iniciada_em timestamptz,
      chegada_em timestamptz,
      codigo text,
      codigo_expira_em timestamptz,
      codigo_validado_em timestamptz,
      codigo_tentativas integer NOT NULL DEFAULT 0,
      codigo_bloqueado boolean NOT NULL DEFAULT false,
      km_entrega integer,
      km_conferencia boolean NOT NULL DEFAULT false,
      checklist jsonb DEFAULT '{}',
      registrada_em timestamptz,
      confirmada_em timestamptz,
      divergencia_motivo text,
      divergencia_descricao text,
      divergencia_em timestamptz,
      repasse_liberado boolean NOT NULL DEFAULT false,
      repasse_bloqueado boolean NOT NULL DEFAULT false,
      aceite_ip text,
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    );
  `);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_entregas_status ON entregas(status, data_entrega);`);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS entregas_fotos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
      categoria text NOT NULL,
      origem text NOT NULL DEFAULT 'VENDEDOR',
      url text NOT NULL,
      criado_em timestamptz DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS entregas_agendamentos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
      data_entrega date,
      hora_inicio time,
      hora_fim time,
      local_resumo text,
      motivo text,
      autor_id uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS entregas_eventos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
      evento text NOT NULL,
      detalhe text,
      publico text NOT NULL DEFAULT 'TODOS',
      autor_id uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now()
    );
  `);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_entregas_eventos ON entregas_eventos(entrega_id, criado_em);`);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS entregas_observacoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entrega_id uuid NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
      texto text NOT NULL,
      autor_id uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now()
    );
  `);

  await d.execute(sql`
    INSERT INTO configuracoes_sistema (chave, valor, descricao)
    VALUES ('entrega_prazo_confirmacao_horas', '24', 'Prazo, em horas, para o comprador confirmar o recebimento.')
    ON CONFLICT (chave) DO NOTHING;
  `);
}

async function evento(exec: any, entregaId: string, texto: string, detalhe?: string | null, autorId?: string | null) {
  await exec.execute(sql`
    INSERT INTO entregas_eventos (entrega_id, evento, detalhe, autor_id)
    VALUES (${entregaId}::uuid, ${texto}, ${detalhe || null}, ${autorId || null}::uuid)
  `);
}

async function notificar(exec: any, negociacaoId: string, publico: string, destinatarioId: string | null, titulo: string, mensagem: string) {
  await exec.execute(sql`
    INSERT INTO negociacoes_notificacoes (negociacao_id, destinatario_id, publico, titulo, mensagem)
    VALUES (${negociacaoId}::uuid, ${destinatarioId}::uuid, ${publico}, ${titulo}, ${mensagem})
  `);
}

/** Cria a entrega assim que o pagamento está confirmado e conciliado. */
export async function garantirEntregas() {
  const d = requireDb();
  const novas = await d.execute(sql`
    INSERT INTO entregas (negociacao_id, status)
    SELECT n.id, 'AGUARDANDO_AGENDAMENTO'
    FROM negociacoes n
    WHERE n.status = 'PAGAMENTO_CONFIRMADO'
      AND EXISTS (SELECT 1 FROM cobrancas c WHERE c.negociacao_id = n.id AND c.status = 'PAGO')
      AND NOT EXISTS (SELECT 1 FROM entregas e WHERE e.negociacao_id = n.id)
    RETURNING id, negociacao_id
  `);
  for (const e of (rowsOf(novas) || [])) {
    await evento(d, e.id, "Entrega liberada para agendamento.", "Pagamento confirmado e conciliado.");
    await notificar(d, e.negociacao_id, "ADMIN", null, "Nova entrega aguardando agendamento", "Organize a entrega do veículo com vendedor e comprador.");
  }
  return { criadas: (rowsOf(novas) || []).length };
}

const SELECT_ENTREGA = sql`
  SELECT e.*, n.codigo as negociacao_codigo, n.valor_venda, n.vendedor_id, n.comprador_id, n.veiculo_id, n.status as negociacao_status,
    a.titulo as veiculo_titulo, a.codigo_publico,
    v.placa, v.km as km_vistoria,
    vend.nome as vendedor_nome, vend.whatsapp as vendedor_whatsapp,
    comp.nome as comprador_nome, comp.whatsapp as comprador_whatsapp, comp.cidade as comprador_cidade, comp.uf as comprador_uf
  FROM entregas e
  JOIN negociacoes n ON n.id = e.negociacao_id
  JOIN anuncios_veiculo a ON a.id = n.anuncio_id
  JOIN veiculos v ON v.id = n.veiculo_id
  LEFT JOIN profiles vend ON vend.id = n.vendedor_id
  LEFT JOIN profiles comp ON comp.id = n.comprador_id
`;

/** Remove o código de entrega de qualquer retorno que não seja do comprador. */
function semCodigo(row: any) {
  if (!row) return row;
  const { codigo, ...resto } = row;
  return { ...resto, codigo_gerado: !!codigo };
}

export async function listarEntregasAdmin() {
  const d = requireDb();
  await garantirEntregas();
  const res = await d.execute(sql`${SELECT_ENTREGA} ORDER BY e.data_entrega NULLS FIRST, e.criado_em DESC`);
  return (rowsOf(res) || []).map(semCodigo);
}

export async function getEntregaAdmin(id: string) {
  const d = requireDb();
  const res = await d.execute(sql`${SELECT_ENTREGA} WHERE e.id = ${id}::uuid`);
  const row = rowsOf(res)?.[0];
  if (!row) return null;
  const [eventos, fotos, agendamentos, observacoes] = await Promise.all([
    d.execute(sql`SELECT evento, detalhe, criado_em FROM entregas_eventos WHERE entrega_id = ${id}::uuid ORDER BY criado_em`),
    d.execute(sql`SELECT categoria, origem, url FROM entregas_fotos WHERE entrega_id = ${id}::uuid ORDER BY criado_em`),
    d.execute(sql`SELECT * FROM entregas_agendamentos WHERE entrega_id = ${id}::uuid ORDER BY criado_em DESC`),
    d.execute(sql`SELECT o.texto, o.criado_em, p.nome as autor FROM entregas_observacoes o LEFT JOIN profiles p ON p.id = o.autor_id WHERE o.entrega_id = ${id}::uuid ORDER BY o.criado_em DESC`),
  ]);
  return {
    ...semCodigo(row),
    eventos: rowsOf(eventos) || [],
    fotos: rowsOf(fotos) || [],
    agendamentos: rowsOf(agendamentos) || [],
    observacoes: rowsOf(observacoes) || [],
  };
}

export async function getIndicadoresEntrega() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'AGUARDANDO_AGENDAMENTO') as aguardando_agendamento,
      COUNT(*) FILTER (WHERE data_entrega = CURRENT_DATE AND status NOT IN ('ENTREGA_CONFIRMADA','LIBERADO_PARA_REPASSE','ENTREGA_CANCELADA')) as hoje,
      COUNT(*) FILTER (WHERE status = 'AGUARDANDO_CONFIRMACAO_COMPRADOR') as aguardando_confirmacao,
      COUNT(*) FILTER (WHERE status = 'DIVERGENCIA_NA_ENTREGA') as divergencias,
      COUNT(*) FILTER (WHERE repasse_liberado) as liberadas_repasse
    FROM entregas
  `);
  return rowsOf(res)?.[0] || {};
}

export async function agendarEntrega(params: {
  entrega_id: string;
  tipo_local: string;
  local_nome?: string | undefined;
  cep?: string | undefined; endereco?: string | undefined; numero?: string | undefined; complemento?: string | undefined;
  bairro?: string | undefined; cidade?: string | undefined; uf?: string | undefined;
  responsavel_recebimento?: string | undefined;
  telefone_contato?: string | undefined;
  orientacao?: string | undefined;
  data_entrega: string;
  hora_inicio: string;
  hora_fim: string;
  admin_id: string;
  motivo?: string | undefined;
}) {
  const d = requireDb();
  const atual = await d.execute(sql`SELECT * FROM entregas WHERE id = ${params.entrega_id}::uuid`);
  const entrega = rowsOf(atual)?.[0];
  if (!entrega) throw new Error("Entrega não encontrada.");
  if (["ENTREGA_CONFIRMADA", "LIBERADO_PARA_REPASSE"].includes(entrega.status)) throw new Error("Esta entrega já foi concluída.");

  const reagendamento = !!entrega.data_entrega;
  // Histórico: o agendamento anterior nunca é apagado.
  if (reagendamento) {
    await d.execute(sql`
      INSERT INTO entregas_agendamentos (entrega_id, data_entrega, hora_inicio, hora_fim, local_resumo, motivo, autor_id)
      VALUES (${entrega.id}::uuid, ${entrega.data_entrega}, ${entrega.hora_inicio}, ${entrega.hora_fim},
              ${[entrega.local_nome, entrega.endereco, entrega.cidade].filter(Boolean).join(" • ")},
              ${params.motivo || "Reagendamento"}, ${params.admin_id}::uuid)
    `);
  }

  await d.execute(sql`
    UPDATE entregas SET
      tipo_local = ${params.tipo_local}, local_nome = ${params.local_nome || null},
      cep = ${params.cep || null}, endereco = ${params.endereco || null}, numero = ${params.numero || null},
      complemento = ${params.complemento || null}, bairro = ${params.bairro || null},
      cidade = ${params.cidade || null}, uf = ${params.uf || null},
      responsavel_recebimento = ${params.responsavel_recebimento || null},
      telefone_contato = ${params.telefone_contato || null},
      orientacao = ${params.orientacao || null},
      data_entrega = ${params.data_entrega}::date, hora_inicio = ${params.hora_inicio}::time, hora_fim = ${params.hora_fim}::time,
      responsavel_interno_id = ${params.admin_id}::uuid,
      vendedor_confirmou_em = NULL, comprador_confirmou_em = NULL,
      status = 'ENTREGA_AGENDADA', atualizado_em = now()
    WHERE id = ${params.entrega_id}::uuid
  `);

  await evento(d, entrega.id, reagendamento ? "Entrega reagendada." : "Entrega agendada.", `${params.data_entrega} • ${params.hora_inicio} às ${params.hora_fim}`, params.admin_id);
  await notificar(d, entrega.negociacao_id, "VENDEDOR", null, "A entrega do seu veículo foi agendada.", "Confirme o horário no seu portal.");
  await notificar(d, entrega.negociacao_id, "COMPRADOR", null, "A entrega do seu veículo foi agendada.", "Confirme o horário no seu portal.");
  return { ok: true };
}

export async function confirmarAgendamento(entregaId: string, papel: "VENDEDOR" | "COMPRADOR", autorId: string) {
  const d = requireDb();
  const campo = papel === "VENDEDOR" ? sql`vendedor_confirmou_em` : sql`comprador_confirmou_em`;
  await d.execute(sql`UPDATE entregas SET ${campo} = now(), atualizado_em = now() WHERE id = ${entregaId}::uuid`);
  const res = await d.execute(sql`SELECT * FROM entregas WHERE id = ${entregaId}::uuid`);
  const e = rowsOf(res)[0];
  await evento(d, entregaId, papel === "VENDEDOR" ? "Vendedor confirmou horário." : "Comprador confirmou horário.", null, autorId);
  if (e.vendedor_confirmou_em && e.comprador_confirmou_em) {
    await d.execute(sql`UPDATE entregas SET status = 'AGUARDANDO_ENTREGA' WHERE id = ${entregaId}::uuid AND status = 'ENTREGA_AGENDADA'`);
  }
  return { ok: true };
}

export async function solicitarReagendamento(entregaId: string, papel: string, motivo: string, autorId: string) {
  const d = requireDb();
  if (!motivo?.trim()) throw new Error("Descreva o motivo da alteração.");
  await d.execute(sql`UPDATE entregas SET status = 'REAGENDAMENTO_SOLICITADO', atualizado_em = now() WHERE id = ${entregaId}::uuid`);
  const res = await d.execute(sql`SELECT negociacao_id FROM entregas WHERE id = ${entregaId}::uuid`);
  await evento(d, entregaId, `Reagendamento solicitado pelo ${papel.toLowerCase()}.`, motivo, autorId);
  await notificar(d, rowsOf(res)[0].negociacao_id, "ADMIN", null, "Reagendamento solicitado", motivo);
  return { ok: true };
}

/** Código de 6 dígitos, aleatório e vinculado somente a esta entrega. */
async function gerarCodigo(d: any, entregaId: string, horasValidade = 24) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const codigo = String(100000 + (buf[0]! % 900000));
  await d.execute(sql`
    UPDATE entregas SET codigo = ${codigo}, codigo_expira_em = now() + (${horasValidade} || ' hours')::interval,
      codigo_tentativas = 0, codigo_bloqueado = false, codigo_validado_em = NULL, atualizado_em = now()
    WHERE id = ${entregaId}::uuid
  `);
  await evento(d, entregaId, "Código de entrega gerado.", "Disponibilizado apenas ao comprador.");
  return codigo;
}

export async function regerarCodigo(entregaId: string, autorId: string) {
  const d = requireDb();
  await gerarCodigo(d, entregaId);
  await evento(d, entregaId, "Novo código de entrega gerado pelo Admin.", null, autorId);
  return { ok: true };
}

/** Somente o comprador da negociação enxerga o código. */
export async function getEntregaComprador(entregaId: string, compradorId: string) {
  const d = requireDb();
  const res = await d.execute(sql`${SELECT_ENTREGA} WHERE e.id = ${entregaId}::uuid`);
  const row = rowsOf(res)?.[0];
  if (!row || row.comprador_id !== compradorId) return null;

  let codigo = row.codigo;
  const podeVerCodigo = ["ENTREGA_AGENDADA", "AGUARDANDO_ENTREGA", "EM_PROCESSO_DE_ENTREGA"].includes(row.status);
  if (podeVerCodigo && (!codigo || (row.codigo_expira_em && new Date(row.codigo_expira_em) < new Date()))) {
    codigo = await gerarCodigo(d, entregaId);
  }

  const [eventos, fotos] = await Promise.all([
    d.execute(sql`SELECT evento, detalhe, criado_em FROM entregas_eventos WHERE entrega_id = ${entregaId}::uuid ORDER BY criado_em`),
    d.execute(sql`SELECT categoria, url FROM entregas_fotos WHERE entrega_id = ${entregaId}::uuid ORDER BY criado_em`),
  ]);

  return {
    ...row,
    codigo: podeVerCodigo ? codigo : null,
    eventos: rowsOf(eventos) || [],
    fotos: rowsOf(fotos) || [],
  };
}

export async function listarEntregasComprador(compradorId: string) {
  const d = requireDb();
  await garantirEntregas();
  const res = await d.execute(sql`${SELECT_ENTREGA} WHERE n.comprador_id = ${compradorId}::uuid ORDER BY e.criado_em DESC`);
  return (rowsOf(res) || []).map(semCodigo);
}

/** O vendedor nunca recebe o código, apenas os dados necessários para a entrega. */
export async function getEntregaVendedor(entregaId: string, vendedorId: string) {
  const d = requireDb();
  const res = await d.execute(sql`${SELECT_ENTREGA} WHERE e.id = ${entregaId}::uuid`);
  const row = rowsOf(res)?.[0];
  if (!row || row.vendedor_id !== vendedorId) return null;
  const [eventos, fotos] = await Promise.all([
    d.execute(sql`SELECT evento, detalhe, criado_em FROM entregas_eventos WHERE entrega_id = ${entregaId}::uuid ORDER BY criado_em`),
    d.execute(sql`SELECT categoria, url FROM entregas_fotos WHERE entrega_id = ${entregaId}::uuid ORDER BY criado_em`),
  ]);
  return { ...semCodigo(row), eventos: rowsOf(eventos) || [], fotos: rowsOf(fotos) || [] };
}

export async function listarEntregasVendedor(vendedorId: string) {
  const d = requireDb();
  await garantirEntregas();
  const res = await d.execute(sql`${SELECT_ENTREGA} WHERE n.vendedor_id = ${vendedorId}::uuid ORDER BY e.criado_em DESC`);
  return (rowsOf(res) || []).map(semCodigo);
}

export async function iniciarEntrega(entregaId: string, vendedorId: string, coords?: { lat?: number | undefined; lng?: number | undefined }) {
  const d = requireDb();
  await d.execute(sql`
    UPDATE entregas SET status = 'EM_PROCESSO_DE_ENTREGA', iniciada_em = COALESCE(iniciada_em, now()), atualizado_em = now()
    WHERE id = ${entregaId}::uuid
  `);
  await evento(d, entregaId, "Vendedor iniciou entrega.", coords?.lat ? `Localização ${coords.lat}, ${coords.lng}` : null, vendedorId);
  return { ok: true };
}

export async function registrarChegada(entregaId: string, vendedorId: string) {
  const d = requireDb();
  await d.execute(sql`UPDATE entregas SET chegada_em = now(), status = 'EM_PROCESSO_DE_ENTREGA', atualizado_em = now() WHERE id = ${entregaId}::uuid`);
  await evento(d, entregaId, "Vendedor chegou ao local.", null, vendedorId);
  const res = await d.execute(sql`SELECT negociacao_id FROM entregas WHERE id = ${entregaId}::uuid`);
  await notificar(d, rowsOf(res)[0].negociacao_id, "COMPRADOR", null, "Use seu código no momento da entrega.", "O vendedor chegou ao local da entrega.");
  return { ok: true };
}

const MAX_TENTATIVAS = 5;

export async function validarCodigo(entregaId: string, vendedorId: string, codigo: string) {
  const d = requireDb();
  const res = await d.execute(sql`SELECT * FROM entregas WHERE id = ${entregaId}::uuid`);
  const e = rowsOf(res)?.[0];
  if (!e) throw new Error("Entrega não encontrada.");
  if (e.codigo_validado_em) return { ok: true, ja_validado: true };
  if (e.codigo_bloqueado) return { ok: false, bloqueado: true };
  if (!e.codigo || (e.codigo_expira_em && new Date(e.codigo_expira_em) < new Date())) {
    return { ok: false, expirado: true };
  }

  const informado = String(codigo || "").replace(/\D/g, "");
  if (informado !== e.codigo) {
    const tentativas = e.codigo_tentativas + 1;
    const bloquear = tentativas >= MAX_TENTATIVAS;
    await d.execute(sql`
      UPDATE entregas SET codigo_tentativas = ${tentativas}, codigo_bloqueado = ${bloquear}, atualizado_em = now()
      WHERE id = ${entregaId}::uuid
    `);
    await evento(d, entregaId, "Tentativa de código inválida.", `Tentativa ${tentativas} de ${MAX_TENTATIVAS}`, vendedorId);
    return { ok: false, bloqueado: bloquear, restantes: Math.max(0, MAX_TENTATIVAS - tentativas) };
  }

  // Código correto: invalidado imediatamente após o uso.
  await d.execute(sql`
    UPDATE entregas SET codigo_validado_em = now(), codigo = NULL, codigo_expira_em = NULL, atualizado_em = now()
    WHERE id = ${entregaId}::uuid
  `);
  await evento(d, entregaId, "Código de entrega validado.", null, vendedorId);
  return { ok: true };
}

export async function registrarEntrega(params: {
  entrega_id: string;
  vendedor_id: string;
  km_entrega: number;
  checklist: Record<string, boolean>;
  fotos: { categoria: string; url: string }[];
}) {
  const d = requireDb();
  const res = await d.execute(sql`${SELECT_ENTREGA} WHERE e.id = ${params.entrega_id}::uuid`);
  const e = rowsOf(res)?.[0];
  if (!e) throw new Error("Entrega não encontrada.");
  if (e.vendedor_id !== params.vendedor_id) throw new Error("Esta entrega não pertence a você.");
  if (!e.codigo_validado_em) throw new Error("Valide o código de entrega com o comprador antes de registrar.");
  if (!params.fotos?.length) throw new Error("Envie as fotos obrigatórias da entrega.");

  const kmVistoria = Number(e.km_vistoria || 0);
  const diferenca = kmVistoria ? params.km_entrega - kmVistoria : 0;
  const precisaConferencia = kmVistoria > 0 && diferenca > Math.max(500, kmVistoria * 0.03);

  for (const f of params.fotos) {
    await d.execute(sql`INSERT INTO entregas_fotos (entrega_id, categoria, origem, url) VALUES (${params.entrega_id}::uuid, ${f.categoria}, 'VENDEDOR', ${f.url})`);
  }

  await d.execute(sql`
    UPDATE entregas SET km_entrega = ${params.km_entrega}, km_conferencia = ${precisaConferencia},
      checklist = ${JSON.stringify(params.checklist)}::jsonb, registrada_em = now(),
      status = 'AGUARDANDO_CONFIRMACAO_COMPRADOR', atualizado_em = now()
    WHERE id = ${params.entrega_id}::uuid
  `);

  await evento(d, params.entrega_id, "Vendedor registrou entrega.", `Quilometragem ${params.km_entrega} km`, params.vendedor_id);
  if (precisaConferencia) await evento(d, params.entrega_id, "Quilometragem necessita conferência.", `Vistoria ${kmVistoria} km • entrega ${params.km_entrega} km`);
  await notificar(d, e.negociacao_id, "COMPRADOR", e.comprador_id, "O vendedor registrou a entrega. Confirme o recebimento.", "Confira o veículo e confirme o recebimento no seu portal.");
  await notificar(d, e.negociacao_id, "VENDEDOR", e.vendedor_id, "Entrega registrada. Aguardando confirmação.", "Assim que o comprador confirmar, avisamos você.");
  return { ok: true, conferencia: precisaConferencia };
}

export async function confirmarRecebimento(entregaId: string, compradorId: string, ip?: string | null) {
  const d = requireDb();
  const res = await d.execute(sql`${SELECT_ENTREGA} WHERE e.id = ${entregaId}::uuid`);
  const e = rowsOf(res)?.[0];
  if (!e || e.comprador_id !== compradorId) throw new Error("Entrega não encontrada.");
  if (e.status !== "AGUARDANDO_CONFIRMACAO_COMPRADOR") throw new Error("Esta entrega ainda não foi registrada pelo vendedor.");

  await d.execute(sql`
    UPDATE entregas SET status = 'LIBERADO_PARA_REPASSE', confirmada_em = now(), repasse_liberado = true,
      repasse_bloqueado = false, aceite_ip = ${ip || null}, atualizado_em = now()
    WHERE id = ${entregaId}::uuid
  `);
  await d.execute(sql`UPDATE veiculos SET status = 'VENDA_CONCLUIDA' WHERE id = ${e.veiculo_id}::uuid`);
  await d.execute(sql`UPDATE anuncios_veiculo SET status = 'VENDIDO' WHERE id = (SELECT anuncio_id FROM negociacoes WHERE id = ${e.negociacao_id}::uuid)`);

  await evento(d, entregaId, "Comprador confirmou recebimento.", null, compradorId);
  await evento(d, entregaId, "Negociação liberada para repasse.");
  await d.execute(sql`INSERT INTO negociacoes_timeline (negociacao_id, evento, detalhe) VALUES (${e.negociacao_id}::uuid, 'Entrega confirmada pelo comprador.', 'Negociação liberada para repasse.')`);
  await notificar(d, e.negociacao_id, "VENDEDOR", e.vendedor_id, "Comprador confirmou o recebimento.", "A negociação agora seguirá para a etapa de repasse.");
  await notificar(d, e.negociacao_id, "COMPRADOR", e.comprador_id, "Entrega concluída.", "Sua compra foi concluída.");
  await notificar(d, e.negociacao_id, "ADMIN", null, "Negociação liberada para repasse", `Entrega confirmada em ${e.negociacao_codigo}.`);
  
  // Módulo Financeiro
  await prepararFinanceiroNegociacao(e.negociacao_id);

  return { ok: true };
}

export async function registrarDivergencia(params: {
  entrega_id: string; comprador_id: string; motivo: string; descricao: string; fotos?: { url: string }[] | undefined;
}) {
  const d = requireDb();
  const res = await d.execute(sql`${SELECT_ENTREGA} WHERE e.id = ${params.entrega_id}::uuid`);
  const e = rowsOf(res)?.[0];
  if (!e || e.comprador_id !== params.comprador_id) throw new Error("Entrega não encontrada.");
  if (!params.descricao?.trim()) throw new Error("Descreva o que aconteceu.");

  for (const f of params.fotos || []) {
    await d.execute(sql`INSERT INTO entregas_fotos (entrega_id, categoria, origem, url) VALUES (${params.entrega_id}::uuid, 'DIVERGENCIA', 'COMPRADOR', ${f.url})`);
  }
  await d.execute(sql`
    UPDATE entregas SET status = 'DIVERGENCIA_NA_ENTREGA', divergencia_motivo = ${params.motivo},
      divergencia_descricao = ${params.descricao}, divergencia_em = now(),
      repasse_bloqueado = true, repasse_liberado = false, atualizado_em = now()
    WHERE id = ${params.entrega_id}::uuid
  `);
  await evento(d, params.entrega_id, "Comprador registrou divergência.", `${params.motivo} — ${params.descricao}`, params.comprador_id);
  await notificar(d, e.negociacao_id, "ADMIN", null, "Comprador registrou divergência", `${e.negociacao_codigo}: ${params.motivo}`);
  return { ok: true };
}

export async function decidirDivergencia(params: { entrega_id: string; decisao: string; observacao: string; admin_id: string }) {
  const d = requireDb();
  if (!params.observacao?.trim()) throw new Error("Registre uma observação interna.");
  const res = await d.execute(sql`${SELECT_ENTREGA} WHERE e.id = ${params.entrega_id}::uuid`);
  const e = rowsOf(res)?.[0];
  if (!e) throw new Error("Entrega não encontrada.");

  await d.execute(sql`INSERT INTO entregas_observacoes (entrega_id, texto, autor_id) VALUES (${params.entrega_id}::uuid, ${params.observacao}, ${params.admin_id}::uuid)`);

  if (params.decisao === "LIBERAR") {
    await d.execute(sql`
      UPDATE entregas SET status = 'LIBERADO_PARA_REPASSE', repasse_liberado = true, repasse_bloqueado = false,
        confirmada_em = COALESCE(confirmada_em, now()), atualizado_em = now()
      WHERE id = ${params.entrega_id}::uuid
    `);
    await d.execute(sql`UPDATE veiculos SET status = 'VENDA_CONCLUIDA' WHERE id = ${e.veiculo_id}::uuid`);
    await evento(d, params.entrega_id, "Divergência resolvida — liberado para repasse.", params.observacao, params.admin_id);
    await notificar(d, e.negociacao_id, "VENDEDOR", e.vendedor_id, "Negociação liberada para repasse.", "A entrega foi validada pela nossa equipe.");
    
    // Módulo Financeiro
    await prepararFinanceiroNegociacao(e.negociacao_id);
  } else if (params.decisao === "MANTER_BLOQUEIO") {
    await d.execute(sql`UPDATE entregas SET repasse_bloqueado = true, repasse_liberado = false, atualizado_em = now() WHERE id = ${params.entrega_id}::uuid`);
    await evento(d, params.entrega_id, "Repasse mantido bloqueado.", params.observacao, params.admin_id);
  } else {
    await evento(d, params.entrega_id, "Encaminhado para tratativa manual.", params.observacao, params.admin_id);
  }
  return { ok: true };
}

export async function registrarNaoComparecimento(params: { entrega_id: string; parte: "VENDEDOR" | "COMPRADOR"; observacao: string; autor_id: string }) {
  const d = requireDb();
  if (!params.observacao?.trim()) throw new Error("Observação obrigatória.");
  const status = params.parte === "VENDEDOR" ? "NAO_COMPARECIMENTO_VENDEDOR" : "NAO_COMPARECIMENTO_COMPRADOR";
  await d.execute(sql`
    UPDATE entregas SET status = ${status}, repasse_liberado = false, repasse_bloqueado = true, atualizado_em = now()
    WHERE id = ${params.entrega_id}::uuid
  `);
  const res = await d.execute(sql`SELECT negociacao_id FROM entregas WHERE id = ${params.entrega_id}::uuid`);
  await evento(d, params.entrega_id, params.parte === "VENDEDOR" ? "Vendedor não compareceu." : "Comprador não compareceu.", params.observacao, params.autor_id);
  await notificar(d, rowsOf(res)[0].negociacao_id, "ADMIN", null, "Não comparecimento", params.observacao);
  return { ok: true };
}

export async function cancelarAgendamento(params: { entrega_id: string; motivo: string; admin_id: string }) {
  const d = requireDb();
  if (!params.motivo?.trim()) throw new Error("Motivo obrigatório.");
  const atual = await d.execute(sql`SELECT * FROM entregas WHERE id = ${params.entrega_id}::uuid`);
  const e = rowsOf(atual)?.[0];
  if (e?.data_entrega) {
    await d.execute(sql`
      INSERT INTO entregas_agendamentos (entrega_id, data_entrega, hora_inicio, hora_fim, local_resumo, motivo, autor_id)
      VALUES (${e.id}::uuid, ${e.data_entrega}, ${e.hora_inicio}, ${e.hora_fim}, ${[e.local_nome, e.endereco].filter(Boolean).join(" • ")}, ${params.motivo}, ${params.admin_id}::uuid)
    `);
  }
  await d.execute(sql`
    UPDATE entregas SET status = 'AGUARDANDO_AGENDAMENTO', data_entrega = NULL, hora_inicio = NULL, hora_fim = NULL,
      vendedor_confirmou_em = NULL, comprador_confirmou_em = NULL, atualizado_em = now()
    WHERE id = ${params.entrega_id}::uuid
  `);
  await evento(d, params.entrega_id, "Agendamento cancelado.", params.motivo, params.admin_id);
  return { ok: true };
}

export async function adicionarObservacao(entregaId: string, texto: string, autorId: string) {
  const d = requireDb();
  if (!texto?.trim()) throw new Error("Texto obrigatório.");
  await requireDb().execute(sql`INSERT INTO entregas_observacoes (entrega_id, texto, autor_id) VALUES (${entregaId}::uuid, ${texto}, ${autorId}::uuid)`);
  return { ok: true };
}

export async function getPrazoConfirmacaoHoras(): Promise<number> {
  const d = requireDb();
  const res = await d.execute(sql`SELECT valor FROM configuracoes_sistema WHERE chave = 'entrega_prazo_confirmacao_horas'`);
  return Number(rowsOf(res)?.[0]?.valor || 24);
}

export async function setPrazoConfirmacaoHoras(horas: number) {
  const d = requireDb();
  await d.execute(sql`
    INSERT INTO configuracoes_sistema (chave, valor, descricao)
    VALUES ('entrega_prazo_confirmacao_horas', ${String(horas)}, 'Prazo, em horas, para o comprador confirmar o recebimento.')
    ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
  `);
  return { ok: true };
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
