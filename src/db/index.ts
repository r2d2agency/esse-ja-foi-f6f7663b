import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';

// Note: DATABASE_URL must be available as a server-side environment variable.
const connectionString = process.env['DATABASE_URL'];

if (!connectionString) {
  console.warn('⚠️ DATABASE_URL não definida.');
}

const getClient = () => {
  const conn = process.env['DATABASE_URL'];
  if (!conn) return null;
  return postgres(conn, { 
    max: 10,
    ssl: conn.includes('sslmode=disable') ? false : 'require',
    connect_timeout: 30,
  });
};

export const client = getClient();
export const db = client ? drizzle(client, { schema }) : null;

export const migrateDb = async () => {
  if (!db) {
    console.error('❌ Migração impossível: DATABASE_URL ausente.');
    return;
  }
  
  if (process.env['SKIP_MIGRATIONS'] === 'true') return;
  
  // console.log('🚀 Iniciando migrações...');
  try {
    const migrationsPath = path.join(process.cwd(), 'drizzle');
    await migrate(db, { migrationsFolder: migrationsPath });
    // console.log('✅ Migrações concluídas.');

    // Trava global: impede que duas instâncias/requisições criem as mesmas
    // tabelas ao mesmo tempo (causa de "duplicate key ... pg_type_typname_nsp_index").
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`SELECT pg_advisory_lock(918273645)`);
    try {
      const { ensureAuthSchema, ensureSuperAdmin } = await import('./auth.server');
      await ensureAuthSchema();

      const { ensurePerfilSchema } = await import('./perfil.server');
      await ensurePerfilSchema();

      const { ensureCadastroSchema } = await import('./cadastro.server');
      await ensureCadastroSchema();

      const { ensureVendedoresSchema } = await import('./vendedores-compliance.server');
      await ensureVendedoresSchema();

      const { ensureVeiculosAdminSchema } = await import('./admin-veiculos.server');
      await ensureVeiculosAdminSchema();

      const { ensureContratosSchema } = await import('./contratos.server');
      await ensureContratosSchema();

      const { ensureVistoriaSchema } = await import('./vistorias.server');
      await ensureVistoriaSchema();

      const { ensureLaudoSchema, seedConfiguracoes } = await import('./laudos.server');
      await ensureLaudoSchema();
      await seedConfiguracoes();

      const { ensureDepreciacaoSchema } = await import('./depreciacao.server');
      await ensureDepreciacaoSchema();

      const { ensureAnalisePosVistoriaSchema } = await import('./analise-pos-vistoria.server');
      await ensureAnalisePosVistoriaSchema();

      const { ensureAnunciosSchema } = await import('./anuncios.server');
      await ensureAnunciosSchema();

      const { ensureLeilaoSchema } = await import('./leilao.server');
      await ensureLeilaoSchema();

      const { ensureCompradorSchema } = await import('./comprador.server');
      await ensureCompradorSchema();

      const { ensureNegociacoesSchema } = await import('./negociacoes.server');
      await ensureNegociacoesSchema();

      const { ensurePagamentosSchema } = await import('./pagamentos.server');
      await ensurePagamentosSchema();

      const { ensureEntregasSchema } = await import('./entregas.server');
      await ensureEntregasSchema();

      const { ensureFinanceiroSchema } = await import('./financeiro.server');
      await ensureFinanceiroSchema();

      const { ensureTimelineSchema } = await import('./timeline.server');
      await ensureTimelineSchema();

      const { ensureComunicacoesSchema } = await import('./comunicacoes.server');
      await ensureComunicacoesSchema();

      const { ensureAutomacoesSchema } = await import('./automacoes.server');
      const { ensureConversasSchema } = await import('./conversas.server');
      const { ensureRelatoriosSchema } = await import('./relatorios.server');
      const { ensureMailSchema } = await import('./mail.server');
      await ensureConversasSchema();
      await ensureAutomacoesSchema();
      await ensureRelatoriosSchema();
      await ensureMailSchema();

      // Diagnóstico do WhatsApp: roda no boot e grava o resultado como linha de
      // log. A conversa estava quebrada sem deixar rastro (o webhook só logava
      // depois da assinatura), então o estado da configuração precisa aparecer na
      // tela sem ninguém precisar rodar SELECT. Nunca pode derrubar o boot.
      try {
        const { gerarDiagnosticoWhatsApp } = await import('./diagnostico-whatsapp.server');
        const diag = await gerarDiagnosticoWhatsApp();
        if (diag.status !== 'OK') {
          console.warn(`[Diagnóstico WhatsApp] ${diag.problemas.length} problema(s) encontrado(s).`);
          for (const p of diag.problemas) console.warn(`  - ${p}`);
        }
      } catch (erro: any) {
        console.error('[Diagnóstico WhatsApp] Falha ao rodar:', erro?.message || erro);
      }

      await ensureSuperAdmin();
    } finally {
      await db.execute(sql`SELECT pg_advisory_unlock(918273645)`);
    }

  } catch (error) {
    console.error('❌ Falha na migração:', error);
  }
};

// Log de inicialização para debug no Easypanel
// console.log('🌐 Servidor iniciando...');
// console.log('📍 NODE_ENV:', process.env['NODE_ENV']);
// console.log('📍 PORT:', process.env['PORT']);
// console.log('📍 DATABASE_URL presente:', !!connectionString);
if (connectionString) {
  const masked = connectionString.replace(/:([^:@]+)@/, ':****@');
  // console.log('📍 DATABASE_URL (masked):', masked);
}



