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
      valido boolean NOT NULL DEFAULT true,
      criado_em timestamptz DEFAULT now(),
      ip_origem text,
      user_agent text
    );
  `);

  // Este projeto usa sessão própria e valida o comprador no servidor antes do
  // INSERT. Bancos importados podem conservar policies baseadas em auth.uid(),
  // que sempre é NULL na conexão PostgreSQL da aplicação e bloqueia os lances.
  await d.execute(sql`DROP POLICY IF EXISTS "Compradores insert lance if approved" ON public.lances`);
  await d.execute(sql`DROP POLICY IF EXISTS "Compradores view their own lances" ON public.lances`);
  await d.execute(sql`ALTER TABLE public.lances DISABLE ROW LEVEL SECURITY`);
  await d.execute(sql`DROP POLICY IF EXISTS "Admins manage leiloes" ON public.leiloes`);
  await d.execute(sql`ALTER TABLE public.leiloes DISABLE ROW LEVEL SECURITY`);

  // Reconciliação defensiva: tabelas legadas podem não ter todas as colunas
  const alters = [
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS atualizado_em timestamptz DEFAULT now()`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now()`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS motivo_pausa_cancelamento text`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS prorrogacao_ativa boolean DEFAULT true`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS prorrogacao_janela_segundos integer DEFAULT 120`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS prorrogacao_tempo_segundos integer DEFAULT 120`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS responsavel_id uuid`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS lance_inicial numeric(12,2)`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS incremento_minimo numeric(12,2) DEFAULT 500`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS inicio_em timestamptz`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS fim_em timestamptz`,
    sql`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS status text DEFAULT 'RASCUNHO'`,
    sql`ALTER TABLE lances ADD COLUMN IF NOT EXISTS leilao_id uuid`,
    sql`ALTER TABLE lances ADD COLUMN IF NOT EXISTS comprador_id uuid`,
    sql`ALTER TABLE lances ADD COLUMN IF NOT EXISTS valor numeric(12,2)`,
    sql`ALTER TABLE lances ADD COLUMN IF NOT EXISTS valido boolean NOT NULL DEFAULT true`,
    sql`ALTER TABLE lances ADD COLUMN IF NOT EXISTS ip_origem text`,
    sql`ALTER TABLE lances ADD COLUMN IF NOT EXISTS user_agent text`,
    sql`ALTER TABLE lances ADD COLUMN IF NOT EXISTS criado_em timestamptz DEFAULT now()`,
  ];
  for (const stmt of alters) {
    try {
      await d.execute(stmt);
    } catch {
      /* coluna/tabela indisponível — segue */
    }
  }

  // O histórico precisa aceitar vários lances do mesmo comprador no mesmo
  // leilão. Algumas bases antigas criaram UNIQUE(leilao_id, comprador_id),
  // o que faz o segundo lance falhar mesmo com todos os campos corretos.
  await d.execute(sql`
    DO $$
    DECLARE constraint_name text;
    BEGIN
      FOR constraint_name IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'lances'
          AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) ILIKE '%leilao_id%'
          AND pg_get_constraintdef(c.oid) ILIKE '%comprador_id%'
      LOOP
        EXECUTE format('ALTER TABLE public.lances DROP CONSTRAINT %I', constraint_name);
      END LOOP;
    END $$;
  `);

  // Criar índices para performance em tempo real
  try {
    await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_lances_leilao ON lances(leilao_id, valor DESC);`);
    await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_leiloes_status_datas ON leiloes(status, inicio_em, fim_em);`);
  } catch {
    /* índices são otimização, não bloqueiam */
  }
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

/** Leilão vigente (ou último) de um veículo. */
export async function getLeilaoPorVeiculo(veiculoId: string) {
  const d = requireDb();
  await ensureLeilaoSchema();
  await processarCicloLeiloes();
  const res = await d.execute(sql`
    SELECT l.*,
      (SELECT valor FROM lances WHERE leilao_id = l.id ORDER BY valor DESC LIMIT 1) as lance_atual,
      (SELECT count(*)::int FROM lances WHERE leilao_id = l.id) as qtd_lances
    FROM leiloes l
    WHERE l.veiculo_id = ${veiculoId}::uuid
    ORDER BY (l.status IN ('AGENDADO','ATIVO','PRORROGADO')) DESC, l.criado_em DESC
    LIMIT 1
  `);
  return rowsOf(res)[0] || null;
}

/** Cria ou atualiza o leilão do veículo com os parâmetros definidos pelo admin. */
export async function salvarLeilaoVeiculo(data: {
  veiculo_id: string;
  inicio_em: string;
  fim_em: string;
  lance_inicial: number;
  incremento_minimo: number;
  prorrogacao_ativa?: boolean;
  prorrogacao_janela_segundos?: number;
  prorrogacao_tempo_segundos?: number;
}) {
  const d = requireDb();
  await ensureLeilaoSchema();

  const inicio = new Date(data.inicio_em);
  const fim = new Date(data.fim_em);
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
    throw new Error("Informe a data/hora de início e de encerramento.");
  }
  if (fim <= inicio) throw new Error("O encerramento precisa ser depois do início.");
  if (!(data.lance_inicial > 0)) throw new Error("Informe o valor do lance inicial.");
  if (!(data.incremento_minimo > 0)) throw new Error("Informe o incremento mínimo.");

  const atual = await getLeilaoPorVeiculo(data.veiculo_id);
  const editavel = atual && ["RASCUNHO", "AGENDADO", "ATIVO", "PRORROGADO", "PAUSADO"].includes(atual.status);

  const status = inicio <= new Date() ? "ATIVO" : "AGENDADO";
  const prorrogacaoAtiva = data.prorrogacao_ativa ?? true;
  const janela = data.prorrogacao_janela_segundos ?? 120;
  const tempo = data.prorrogacao_tempo_segundos ?? 120;

  if (editavel) {
    if (Number(atual.qtd_lances || 0) > 0 && Number(data.lance_inicial) !== Number(atual.lance_inicial)) {
      throw new Error("Este leilão já recebeu lances: o lance inicial não pode ser alterado.");
    }
    await d.execute(sql`
      UPDATE leiloes SET
        inicio_em = ${inicio.toISOString()},
        fim_em = ${fim.toISOString()},
        lance_inicial = ${data.lance_inicial},
        incremento_minimo = ${data.incremento_minimo},
        prorrogacao_ativa = ${prorrogacaoAtiva},
        prorrogacao_janela_segundos = ${janela},
        prorrogacao_tempo_segundos = ${tempo},
        status = CASE WHEN status IN ('ATIVO','PRORROGADO') THEN status ELSE ${status} END,
        atualizado_em = now()
      WHERE id = ${atual.id}::uuid
    `);
    return { id: atual.id };
  }

  const res = await d.execute(sql`
    INSERT INTO leiloes (
      veiculo_id, inicio_em, fim_em, lance_inicial, incremento_minimo,
      prorrogacao_ativa, prorrogacao_janela_segundos, prorrogacao_tempo_segundos, status
    ) VALUES (
      ${data.veiculo_id}::uuid, ${inicio.toISOString()}, ${fim.toISOString()},
      ${data.lance_inicial}, ${data.incremento_minimo},
      ${prorrogacaoAtiva}, ${janela}, ${tempo}, ${status}
    ) RETURNING id
  `);
  return rowsOf(res)[0];
}

/** Cancela o leilão vigente do veículo (usado ao desativar o canal de leilão). */
export async function cancelarLeilaoVeiculo(veiculoId: string, motivo = "Canal de leilão desativado") {
  const d = requireDb();
  await ensureLeilaoSchema();
  await d.execute(sql`
    UPDATE leiloes SET status = 'CANCELADO', motivo_pausa_cancelamento = ${motivo}, atualizado_em = now()
    WHERE veiculo_id = ${veiculoId}::uuid AND status IN ('RASCUNHO','AGENDADO','PAUSADO')
  `);
}

export async function registrarLance(leilaoId: string, compradorId: string, valor: number, ip?: string, ua?: string) {
  const d = requireDb();
  await ensureLeilaoSchema();

  const valorNum = Number(valor);
  if (!Number.isFinite(valorNum) || valorNum <= 0) {
    throw new Error("Informe um valor de lance válido maior que zero.");
  }

  // Usar transação para garantir atomicidade e evitar lances simultâneos com mesmo valor ou menores
  return await d.transaction(async (tx) => {
    // 1. Validar leilão e buscar estado atual
    const lRes = await tx.execute(sql`
      SELECT l.*,
        (
          SELECT json_build_object(
            'valor', NULLIF(to_jsonb(lc)->>'valor', '')::numeric,
            'comprador_id', NULLIF(to_jsonb(lc)->>'comprador_id', '')
          )
          FROM lances lc
          WHERE NULLIF(to_jsonb(lc)->>'leilao_id', '')::uuid = l.id
          ORDER BY NULLIF(to_jsonb(lc)->>'valor', '')::numeric DESC NULLS LAST
          LIMIT 1
        ) AS maior_lance
      FROM leiloes l
      WHERE l.id = ${leilaoId}::uuid
      FOR UPDATE OF l
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

    // 2. Validar comprador: precisa estar ativo, com cadastro completo e compliance APROVADO
    const cRes = await tx.execute(sql`
      SELECT
        p.role,
        p.ativo,
        COALESCE((to_jsonb(p)->>'cadastro_completo')::boolean, false) AS cadastro_completo,
        COALESCE(to_jsonb(p)->>'status_compliance', 'NAO_ENVIADO') AS status_compliance
      FROM profiles p WHERE p.id = ${compradorId}::uuid
    `);
    const comprador = rowsOf(cRes)[0];

    if (!comprador || comprador.role !== 'comprador' || !comprador.ativo) {
      throw new Error("Comprador não autorizado ou bloqueado.");
    }
    if (!comprador.cadastro_completo) {
      throw new Error("Complete seu cadastro para participar dos leilões.");
    }
    if (comprador.status_compliance !== 'APROVADO') {
      throw new Error("Seu cadastro ainda está em análise. Você será avisado quando for aprovado.");
    }

    // 3. O maior lance é lido junto ao bloqueio do leilão. Além de reduzir uma
    // consulta, isso mantém compatibilidade com instalações que vieram de schemas antigos.
    const maiorLanceAnterior = leilao.maior_lance && typeof leilao.maior_lance === "object"
      ? leilao.maior_lance
      : null;
    const valorMaiorLance = maiorLanceAnterior?.valor || leilao.lance_inicial;
    const lanceMinimoNecessario = Number(valorMaiorLance) + Number(leilao.incremento_minimo);

    if (valorNum < lanceMinimoNecessario) {
      throw new Error(`O próximo lance mínimo é R$ ${lanceMinimoNecessario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
    }

    // O lance deve respeitar o incremento definido pelo admin (múltiplos sobre o lance atual)
    const incremento = Number(leilao.incremento_minimo);
    if (incremento > 0) {
      const diferenca = valorNum - Number(valorMaiorLance);
      const multiplo = diferenca / incremento;
      if (Math.abs(multiplo - Math.round(multiplo)) > 1e-9) {
        throw new Error(`O lance deve ser um múltiplo de R$ ${incremento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} sobre o lance atual.`);
      }
    }

    // 4. Registrar lance
    // `valido` existe como NOT NULL em bancos legados. Ele também é mantido
    // no schema novo para que o mesmo INSERT funcione em todas as instalações.
    // Campos opcionais de rastreio (`ip`/`sessao` ou `ip_origem`/`user_agent`)
    // ficam fora daqui porque seus nomes variam entre versões.
    // O UUID é criado na aplicação para não depender da extensão/função
    // gen_random_uuid() estar liberada ao usuário do PostgreSQL em produção.
    const novoLanceId = crypto.randomUUID();
    let res;
    try {
      res = await tx.execute(sql`
        INSERT INTO lances (id, leilao_id, comprador_id, valor, valido, criado_em)
        VALUES (${novoLanceId}::uuid, ${leilaoId}::uuid, ${compradorId}::uuid, ${valorNum}, true, CURRENT_TIMESTAMP)
        RETURNING id
      `);
    } catch (error: any) {
      // O Drizzle encapsula o PostgresError em `cause`; ler somente o erro
      // externo escondia justamente o código e a constraint que falharam.
      const dbError = error?.cause ?? error;
      const codigo = typeof dbError?.code === "string" ? dbError.code : "";
      const detalhe = typeof dbError?.detail === "string" ? dbError.detail : "";
      const restricao = typeof dbError?.constraint_name === "string"
        ? dbError.constraint_name
        : typeof dbError?.constraint === "string"
          ? dbError.constraint
          : "";

      console.error("[leilao] INSERT de lance rejeitado", {
        codigo,
        restricao,
        detalhe,
        leilaoId,
        compradorId,
      });

      if (codigo === "42501") {
        throw new Error("O banco bloqueou a gravação do lance por permissão. Reinicie o backend para aplicar a reconciliação do módulo de leilão.");
      }
      if (codigo === "23503") {
        throw new Error("O leilão ou o cadastro do comprador não existe mais. Atualize a página e entre novamente.");
      }
      if (codigo === "23502") {
        throw new Error(`O banco exige um campo legado para registrar o lance${detalhe ? `: ${detalhe}` : "."}`);
      }
      if (codigo === "23514") {
        throw new Error(`O lance não atende a uma regra do banco${restricao ? ` (${restricao})` : ""}.`);
      }
      if (codigo === "23505") {
        throw new Error(`A estrutura antiga do banco impediu mais de um lance do comprador${restricao ? ` (${restricao})` : ""}. Reinicie o backend para aplicar a correção.`);
      }
      throw new Error(
        `Não foi possível registrar o lance${codigo ? ` (banco ${codigo})` : ""}${restricao ? ` — ${restricao}` : ""}${detalhe ? `: ${detalhe}` : "."}`,
      );
    }
    const lanceId = rowsOf(res)?.[0]?.id;

    const { processarEventoSistema } = await import("./automacoes-motor.server");
    if (maiorLanceAnterior && maiorLanceAnterior.comprador_id !== compradorId) {
      const { criarNotificacaoComprador } = await import("./comprador.server");
      await criarNotificacaoComprador(
        maiorLanceAnterior.comprador_id,
        "LANCE_SUPERADO",
        "Seu lance foi superado",
        `Novo lance de R$ ${Number(valor).toLocaleString("pt-BR")}. Faça uma nova oferta para voltar à liderança.`,
        `/veiculos`,
      );

      // E-mail de lance superado (nunca bloqueia o registro do lance)
      try {
        const supRes = await tx.execute(sql`
          SELECT email, nome FROM profiles WHERE id = ${maiorLanceAnterior.comprador_id}::uuid
        `);
        const superado = rowsOf(supRes)[0];
        if (superado?.email) {
          const { enviarEmailSimples } = await import("./mail.server");
          const valorFmt = `R$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          await enviarEmailSimples(
            superado.email,
            "Seu lance foi superado — Esse Já Foi",
            `<div style="font-family:Inter,Arial,sans-serif;color:#0f172a">
               <h2 style="margin:0 0 8px">Seu lance foi superado</h2>
               <p style="margin:0 0 12px">Olá ${superado.nome || "comprador"}, um novo lance de <strong>${valorFmt}</strong> foi registrado no leilão que você acompanha.</p>
               <p style="margin:0 0 16px">Faça uma nova oferta para voltar à liderança antes do encerramento.</p>
               <a href="https://desenvolvimento-r2d2-essejafoi-front.ckilhl.easypanel.host/veiculos"
                  style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">Ver leilão</a>
             </div>`,
          );
        }
      } catch (e) {
        console.error("[leilao] falha ao enviar e-mail de lance superado", e);
      }
    }

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
  await ensureLeilaoSchema();

  try {
    const { ensureAnunciosSchema } = await import("./anuncios.server");
    await ensureAnunciosSchema();
  } catch (e) {
    console.error("[leilao] anuncios schema", e);
  }

  // A tabela anuncios_veiculo pode não existir no banco do cliente:
  // detecta e monta a query com ou sem o JOIN.
  const temAnuncios = await tabelaExiste(d, "anuncios_veiculo");

  // Subconsultas correlacionadas escalares — um subselect em FROM não pode
  // referenciar l.id sem LATERAL, o que quebrava o detalhe do leilão.
  const lRes = temAnuncios
    ? await d.execute(sql`
    SELECT l.*,
      COALESCE(a.titulo, concat_ws(' ', v.marca, v.modelo, v.ano_modelo)) as titulo,
      a.slug,
      (SELECT json_build_object('valor', lc.valor, 'comprador_id', lc.comprador_id, 'data', lc.criado_em)
         FROM lances lc WHERE lc.leilao_id = l.id ORDER BY lc.valor DESC LIMIT 1) as ultimo_lance,
      (SELECT count(*)::int FROM lances lc WHERE lc.leilao_id = l.id) as total_lances,
      (SELECT count(distinct lc.comprador_id)::int FROM lances lc WHERE lc.leilao_id = l.id) as total_participantes
    FROM leiloes l
    LEFT JOIN veiculos v ON v.id = l.veiculo_id
    LEFT JOIN anuncios_veiculo a ON a.veiculo_id = l.veiculo_id
    WHERE l.id = ${leilaoId}::uuid
  `)
    : await d.execute(sql`
    SELECT l.*,
      concat_ws(' ', v.marca, v.modelo, v.ano_modelo) as titulo,
      NULL::text as slug,
      (SELECT json_build_object('valor', lc.valor, 'comprador_id', lc.comprador_id, 'data', lc.criado_em)
         FROM lances lc WHERE lc.leilao_id = l.id ORDER BY lc.valor DESC LIMIT 1) as ultimo_lance,
      (SELECT count(*)::int FROM lances lc WHERE lc.leilao_id = l.id) as total_lances,
      (SELECT count(distinct lc.comprador_id)::int FROM lances lc WHERE lc.leilao_id = l.id) as total_participantes
    FROM leiloes l
    LEFT JOIN veiculos v ON v.id = l.veiculo_id
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
  await ensureLeilaoSchema();
  try {
    const { ensureAnunciosSchema } = await import("./anuncios.server");
    await ensureAnunciosSchema();
  } catch (e) {
    console.error("[leilao] anuncios schema", e);
  }
  await processarCicloLeiloes();
  const temAnuncios = await tabelaExiste(d, "anuncios_veiculo");
  const res = temAnuncios
    ? await d.execute(sql`
    SELECT
      l.*,
      COALESCE(a.titulo, concat_ws(' ', v.marca, v.modelo, v.ano_modelo)) as titulo,
      COALESCE(a.codigo_publico, v.placa) as codigo_publico,
      (SELECT valor FROM lances WHERE leilao_id = l.id ORDER BY valor DESC LIMIT 1) as lance_atual,
      (SELECT count(*) FROM lances WHERE leilao_id = l.id) as qtd_lances
    FROM leiloes l
    JOIN veiculos v ON v.id = l.veiculo_id
    LEFT JOIN anuncios_veiculo a ON a.veiculo_id = l.veiculo_id
    ${status ? sql`WHERE l.status = ${status}` : sql``}
    ORDER BY l.criado_em DESC
  `)
    : await d.execute(sql`
    SELECT
      l.*,
      concat_ws(' ', v.marca, v.modelo, v.ano_modelo) as titulo,
      v.placa as codigo_publico,
      (SELECT valor FROM lances WHERE leilao_id = l.id ORDER BY valor DESC LIMIT 1) as lance_atual,
      (SELECT count(*) FROM lances WHERE leilao_id = l.id) as qtd_lances
    FROM leiloes l
    JOIN veiculos v ON v.id = l.veiculo_id
    ${status ? sql`WHERE l.status = ${status}` : sql``}
    ORDER BY l.criado_em DESC
  `);
  return rowsOf(res) || res;
}

async function tabelaExiste(d: any, nome: string): Promise<boolean> {
  try {
    const res = await d.execute(sql`SELECT to_regclass(${"public." + nome}) as t`);
    return !!rowsOf(res)[0]?.t;
  } catch {
    return false;
  }
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
