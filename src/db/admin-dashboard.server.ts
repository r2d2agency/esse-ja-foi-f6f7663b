import { sql } from "drizzle-orm";
import { db } from "./index";

export async function getDashboardStats() {
  if (!db) return null;
  const { ensureVeiculosAdminSchema } = await import("./admin-veiculos.server");
  const { ensureVendedoresSchema } = await import("./vendedores-compliance.server");
  await ensureVeiculosAdminSchema();
  await ensureVendedoresSchema();
  
  const stats = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM veiculos) as veiculos,
      (SELECT count(*) FROM profiles WHERE role = 'comprador') as clientes,
      (SELECT count(*) FROM profiles WHERE role = 'vendedor') as novos_vendedores,
      (SELECT count(*) FROM profiles WHERE role = 'vendedor' AND status_compliance = 'AGUARDANDO_ANALISE') as compliance_analise,
      (SELECT count(*) FROM veiculos WHERE status_analise = 'AGUARDANDO_ANALISE') as veiculos_analise,
      (SELECT count(*) FROM veiculos WHERE status_analise = 'PRONTO_PARA_VISTORIA') as prontos_vistoria,
      (SELECT count(*) FROM veiculos WHERE status IN ('VENDIDO', 'VENDIDO_PAGO')) as vendidos,
      (
        CASE
          WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vistorias')
          THEN (SELECT count(*) FROM vistorias WHERE DATE(data_vistoria) = CURRENT_DATE)
          ELSE 0
        END
      ) as vistorias_hoje,
      (
        CASE
          WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vistorias')
          THEN (SELECT count(*) FROM vistorias WHERE status = 'AGUARDANDO_CONFIRMACAO')
          ELSE 0
        END
      ) as aguardando_confirmacao,
      0 as pendencias,
      0 as contratos_pendentes
  `);

  let contratosPendentes = 0;
  try {
    const c = await db.execute(sql`
      SELECT count(*)::int as total FROM contratos
      WHERE status IN ('GERADO','ENVIADO','VISUALIZADO','EXPIRADO')
    `);
    contratosPendentes = Number((rowsOf(c)?.[0] || (c as any)[0])?.total ?? 0);
  } catch {
    contratosPendentes = 0;
  }
  
  const funnel = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM veiculos WHERE status_analise = 'AGUARDANDO_ANALISE') as cadastro,
      (SELECT count(*) FROM profiles WHERE role = 'vendedor' AND status_compliance IN ('AGUARDANDO_ANALISE', 'EM_ANALISE', 'PENDENCIA')) as compliance,
      0 as contrato,
      (SELECT count(*) FROM veiculos WHERE status_analise = 'EM_ANALISE') as analise_veiculo,
      (
        CASE
          WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vistorias')
          THEN (SELECT count(*) FROM vistorias WHERE status IN ('AGENDADA', 'CONFIRMADA', 'EM_ANDAMENTO'))
          ELSE 0
        END
      ) as vistoria,
      (SELECT count(*) FROM veiculos WHERE status = 'ANUNCIADO') as anuncio,
      (SELECT count(*) FROM veiculos WHERE status IN ('VENDIDO', 'VENDIDO_PAGO')) as venda
  `);

  const activity = await db.execute(sql`
    SELECT entidade, acao, detalhe, usuario, criado_em
    FROM logs
    ORDER BY criado_em DESC
    LIMIT 10
  `);

  return {
    stats: { ...(rowsOf(stats)?.[0] || (stats as any)[0]), contratos_pendentes: contratosPendentes },
    funnel: rowsOf(funnel)?.[0] || (funnel as any)[0],
    activity: rowsOf(activity) || activity
  };
}

// O driver postgres-js devolve as linhas como array (sem .rows).
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}
