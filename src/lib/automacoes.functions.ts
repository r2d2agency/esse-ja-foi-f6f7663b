import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as db from "../db/automacoes.server";

export const listarAutomacoesFn = createServerFn({ method: "GET" })
  .handler(async () => {
    return db.listarAutomacoes();
  });

export const salvarAutomacaoFn = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data, context }) => {
    // `nome` é NOT NULL no banco e o wizard podia chegar aqui sem ele: sem esta
    // checagem o INSERT morria com "Failed query" sem frase que o usuário entenda.
    const nome = typeof data?.nome === 'string' ? data.nome.trim() : '';
    if (!nome) {
      return { ok: false as const, error: 'Informe o nome da automação.' };
    }
    // Sem sessão o contexto não tem userId; aceita o id enviado pelo client
    // (ex.: admin autenticado) antes de gravar null na FK criado_por.
    const ctx = (context || {}) as any;
    const userId =
      ctx.userId ||
      (typeof data.criado_por === 'string' && data.criado_por.trim()
        ? data.criado_por.trim()
        : '00000000-0000-0000-0000-000000000000');
    return db.salvarAutomacao({ ...data, nome }, userId);
  });

export const getExecucoesAutomacaoFn = createServerFn({ method: "GET" })
  .validator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: id }) => {
    return db.getExecucoesAutomacao(id);
  });

