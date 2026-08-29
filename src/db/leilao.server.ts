import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function ensureLeilaoSchema() {
  const d = requireDb();

  // Tabela de Leilões
  // Status: RASCUNHO, AGENDADO, ATIVO, PRORROGADO, ENCERRADO, PAUSADO, CANCELADO
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS leiloes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
      inicio_em timestamptz NOT NULL,
      fim_em timestamptz NOT NULL,
      lance_inicial numeric(12,2) NOT NULL,
      incremento_minimo numeric(12,2) NOT NULL DEFAULT 500,
      prorrogacao_ativa boolean DEFAULT true,
      prorrogacao_janela_segundos integer DEFAULT 120, -- 2 minutos
      prorrogacao_tempo_segundos integer DEFAULT 120, -- 2 minutos
      status text NOT NULL DEFAULT 'RASCUNHO',
      motivo_pausa_cancelamento text,
      responsavel_id uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    );
  `);

  // Tabela de Lances
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS lances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      leilao_id uuid NOT NULL REFERENCES leiloes(id) ON DELETE CASCADE,
      comprador_id uuid NOT NULL REFERENCES profiles(id),
      valor numeric(12,2) NOT NULL,
      criado_em timestamptz DEFAULT now(),
      ip_origem text,
      user_agent text
    );
  `);

  // Criar índices para performance em tempo real
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_lances_leilao ON lances(leilao_id, valor DESC);`);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_leiloes_status_datas ON leiloes(status, inicio_em, fim_em);`);
}

export async function configurarLeilao(data: any) {
  const d = requireDb();
  // Se receber anuncio_id, precisamos descobrir o veiculo_id correspondente
  let veiculoId = data.veiculo_id;
  if (!veiculoId && data.anuncio_id) {
    const aRes = await d.execute(sql`SELECT veiculo_id FROM anuncios_veiculo WHERE id = ${data.anuncio_id}::uuid`);
    veiculoId = rowsOf(aRes)[0]?.veiculo_id;
  }

  if (!veiculoId) throw new Error("veiculo_id não fornecido e não pôde ser determinado pelo anuncio_id.");

  const res = await d.execute(sql`
    INSERT INTO leiloes (
      veiculo_id, inicio_em, fim_em, lance_inicial, incremento_minimo, 
      prorrogacao_ativa, prorrogacao_janela_segundos, prorrogacao_tempo_segundos, status
    ) VALUES (
      ${veiculoId}::uuid, ${data.inicio_em}, ${data.fim_em}, 
      ${data.lance_inicial}, ${data.incremento_minimo}, 
      ${data.prorrogacao_ativa}, ${data.prorrogacao_janela_segundos}, ${data.prorrogacao_tempo_segundos},
      'AGENDADO'
    ) RETURNING id
  `);
  return rowsOf(res)[0];
}

export async function registrarLance(leilaoId: string, compradorId: string, valor: number, ip?: string, ua?: string) {
  const d = requireDb();
  
  // Usar transação para garantir atomicidade e evitar lances simultâneos com mesmo valor ou menores
  return await d.transaction(async (tx) => {
    // 1. Validar leilão e buscar estado atual
    const lRes = await tx.execute(sql`
      SELECT * FROM leiloes WHERE id = ${leilaoId}::uuid FOR UPDATE
    `);
    const leilao = rowsOf(lRes)[0];

    if (!leilao) throw new Error("Leilão não encontrado.");
    if (leilao.status !== 'ATIVO' && leilao.status !== 'PRORROGADO') {
      throw new Error("Este leilão não está aceitando lances no momento.");
    }
    
    const agora = new Date();
    if (agora < new Date(leilao.inicio_em) || agora > new Date(leilao.fim_em)) {
      throw new Error("O leilão está fora do horário permitido.");
    }

    // 2. Validar comprador (deve estar aprovado e ativo)
    const cRes = await tx.execute(sql`
      SELECT role, ativo, (config_exibicao->>'compliance_aprovado')::boolean as aprovado
      FROM profiles WHERE id = ${compradorId}::uuid
    `);
    const comprador = rowsOf(cRes)[0];
    
    // Nota: A lógica de 'aprovado' pode variar conforme a implementação prévia de compliance
    // Aqui assumimos que se for role 'comprador' e 'ativo'
    if (!comprador || comprador.role !== 'comprador' || !comprador.ativo) {
      throw new Error("Comprador não autorizado ou bloqueado.");
    }

    // 3. Buscar maior lance atual
    const maxRes = await tx.execute(sql`
      SELECT valor, comprador_id FROM lances WHERE leilao_id = ${leilaoId}::uuid ORDER BY valor DESC LIMIT 1
    `);
    const maiorLanceAnterior = rowsOf(maxRes)[0];
    const valorMaiorLance = maiorLanceAnterior?.valor || leilao.lance_inicial;
    const lanceMinimoNecessario = Number(valorMaiorLance) + Number(leilao.incremento_minimo);

    if (valor < lanceMinimoNecessario) {
      throw new Error(`O próximo lance mínimo é R$ ${lanceMinimoNecessario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    }

    // 4. Registrar lance
    const res = await tx.execute(sql`
      INSERT INTO lances (leilao_id, comprador_id, valor, ip_origem, user_agent)
      VALUES (${leilaoId}::uuid, ${compradorId}::uuid, ${valor}, ${ip || null}, ${ua || null})
      RETURNING id
    `);
    const lanceId = rowsOf(res)?.[0]?.id;

    const { processarEventoSistema } = await import("./automacoes-motor.server");
    if (maiorLanceAnterior) {
      await processarEventoSistema("LANCE_SUPERADO", {
        leilao_id: leilaoId,
        comprador_superado_id: maiorLanceAnterior.comprador_id,
        veiculo: leilao.veiculo,
        lance: { valor_atual: valor },
        referencia_id: lanceId
      });
    }

    // 5. Tratar prorrogação automática (Anti-sniping)
    let novoFim = leilao.fim_em;
    const tempoRestanteSegundos = (new Date(leilao.fim_em).getTime() - agora.getTime()) / 1000;
    
    if (leilao.prorrogacao_ativa && tempoRestanteSegundos <= leilao.prorrogacao_janela_segundos) {
      novoFim = new Date(agora.getTime() + (leilao.prorrogacao_tempo_segundos * 1000));
      await tx.execute(sql`
        UPDATE leiloes SET fim_em = ${novoFim.toISOString()}, status = 'PRORROGADO', atualizado_em = now()
        WHERE id = ${leilaoId}::uuid
      `);
    }

    return { 
      sucesso: true, 
      valor, 
      leilao_id: leilaoId, 
      novo_encerramento: novoFim !== leilao.fim_em ? novoFim : null 
    };
  });
}

export async function getEstadoLeilao(leilaoId: string) {
  const d = requireDb();
  
  const lRes = await d.execute(sql`
    SELECT l.*, a.titulo, a.slug,
      (SELECT json_build_object('valor', val, 'comprador_id', cid, 'data', dta)
       FROM (SELECT valor as val, comprador_id as cid, criado_em as dta FROM lances WHERE leilao_id = l.id ORDER BY valor DESC LIMIT 1) as sub) as ultimo_lance,
      (SELECT count(*)::int FROM lances WHERE leilao_id = l.id) as total_lances,
      (SELECT count(distinct comprador_id)::int FROM lances WHERE leilao_id = l.id) as total_participantes
    FROM leiloes l
    JOIN anuncios_veiculo a ON l.veiculo_id = a.veiculo_id
    WHERE l.id = ${leilaoId}::uuid
  `);
  
  const leilao = rowsOf(lRes)[0];
  if (!leilao) return null;

  const historicoRes = await d.execute(sql`
    SELECT valor, criado_em, comprador_id
    FROM lances
    WHERE leilao_id = ${leilaoId}::uuid
    ORDER BY valor DESC
    LIMIT 20
  `);

  return { 
    ...leilao, 
    historico: rowsOf(historicoRes) || [] 
  };
}

export async function processarCicloLeiloes() {
  const d = requireDb();
  const agora = new Date().toISOString();

  // 1. Agendado -> Ativo
  await d.execute(sql`
    UPDATE leiloes 
    SET status = 'ATIVO', atualizado_em = now()
    WHERE status = 'AGENDADO' AND inicio_em <= ${agora}
  `);

  // 2. Ativo/Prorrogado -> Encerrado
  await d.execute(sql`
    UPDATE leiloes 
    SET status = 'ENCERRADO', atualizado_em = now()
    WHERE status IN ('ATIVO', 'PRORROGADO') AND fim_em <= ${agora}
  `);
}

export async function listarLeiloesAdmin(status?: string) {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT 
      l.*, 
      a.titulo, a.codigo_publico,
      (SELECT valor FROM lances WHERE leilao_id = l.id ORDER BY valor DESC LIMIT 1) as lance_atual,
      (SELECT count(*) FROM lances WHERE leilao_id = l.id) as qtd_lances
    FROM leiloes l
    JOIN anuncios_veiculo a ON l.veiculo_id = a.veiculo_id
    ${status ? sql`WHERE l.status = ${status}` : sql``}
    ORDER BY l.criado_em DESC
  `);
  return rowsOf(res) || res;
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
