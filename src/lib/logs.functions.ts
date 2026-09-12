import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "../db/index";
import { sql } from "drizzle-orm";

export const getSystemLogsFn = createServerFn({ method: "GET" })
  .validator(z.object({
    limit: z.number().optional().default(100),
    offset: z.number().optional().default(0),
    busca: z.string().optional()
  }))
  .handler(async ({ data }) => {
    if (!db) return { ok: false as const, message: "Banco de dados indisponível." };
    
    try {
      const termo = data.busca ? `%${data.busca.toLowerCase()}%` : null;
      
      const query = termo 
        ? sql`
            SELECT * FROM logs 
            WHERE lower(entidade) LIKE ${termo} 
               OR lower(acao) LIKE ${termo} 
               OR lower(coalesce(detalhe, '')) LIKE ${termo}
               OR lower(coalesce(usuario, '')) LIKE ${termo}
            ORDER BY criado_em DESC 
            LIMIT ${data.limit} OFFSET ${data.offset}
          `
        : sql`
            SELECT * FROM logs 
            ORDER BY criado_em DESC 
            LIMIT ${data.limit} OFFSET ${data.offset}
          `;

      const rows = await db.execute(query);
      
      const countQuery = termo
        ? sql`SELECT count(*) FROM logs WHERE lower(entidade) LIKE ${termo} OR lower(acao) LIKE ${termo} OR lower(coalesce(detalhe, '')) LIKE ${termo} OR lower(coalesce(usuario, '')) LIKE ${termo}`
        : sql`SELECT count(*) FROM logs`;
        
      const countRes = await db.execute(countQuery);
      const total = Number((countRes as any).rows?.[0]?.count || (countRes as any)[0]?.count || 0);

      return { 
        ok: true as const, 
        data: (rows as any).rows || rows,
        total
      };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

/** Registra um erro de JS capturado no navegador de qualquer usuário logado (ver ErrorLogCapture). */
export const registrarErroClienteFn = createServerFn({ method: "POST" })
  .validator(z.object({
    mensagem: z.string(),
    stack: z.string().optional(),
    url: z.string().optional(),
    userAgent: z.string().optional(),
    usuario: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    if (!db) return { ok: false as const, message: "Banco de dados indisponível." };
    try {
      const detalhe = JSON.stringify({
        mensagem: data.mensagem.slice(0, 2000),
        stack: data.stack?.slice(0, 4000),
        url: data.url,
        userAgent: data.userAgent,
      });
      await db.execute(sql`
        INSERT INTO logs (entidade, acao, detalhe, usuario)
        VALUES ('ERRO_CLIENTE', 'ERRO_JS', ${detalhe}, ${data.usuario || "Anônimo"})
      `);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

export const limparLogsFn = createServerFn({ method: "POST" })
  .handler(async () => {
    if (!db) return { ok: false as const, message: "Banco de dados indisponível." };
    try {
      await db.execute(sql`DELETE FROM logs`);
      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
