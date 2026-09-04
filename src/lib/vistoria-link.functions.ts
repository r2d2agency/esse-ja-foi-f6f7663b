import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function userIdFrom(token?: string | null) {
  if (!token) return null;
  const { verifyToken } = await import("@/db/auth.server");
  return verifyToken(token);
}

const condicaoSchema = z.object({
  funcionamento: z.string().default(""),
  funcionamentoObs: z.string().default(""),
  motor: z.string().default(""),
  motorObs: z.string().default(""),
  cambioProblema: z.string().default(""),
  lataria: z.string().default(""),
  latariaObs: z.string().default(""),
  interior: z.string().default(""),
  pneus: z.string().default(""),
  acidente: z.string().default(""),
  leilao: z.string().default(""),
  sinistro: z.string().default(""),
  debitos: z.string().default(""),
  restricao: z.string().default(""),
  historicoObs: z.string().default(""),
  chaveReserva: z.string().default(""),
  manual: z.string().default(""),
  estepe: z.string().default(""),
  acessoriosSelecionados: z.array(z.string()).default([]),
});

export const gerarLinkVistoriaFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token: z.string().nullable().optional(),
        nome: z.string().min(3),
        whatsapp: z.string().min(8),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const criadoPor = await userIdFrom(data.token ?? null);
      const { gerarLinkVistoria } = await import("@/db/vistoria-link.server");
      return await gerarLinkVistoria({ nome: data.nome, whatsapp: data.whatsapp, criadoPor });
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao gerar o link de cadastro." };
    }
  });

export const getVistoriaPorTokenFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { getVistoriaPorToken } = await import("@/db/vistoria-link.server");
      const res = await getVistoriaPorToken(data.token);
      if (!res) return { ok: false as const, message: "Link inválido ou expirado." };
      return { ok: true as const, data: res };
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao carregar o link." };
    }
  });

export const enviarVistoriaPorTokenFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token: z.string().min(8),
        placa: z.string().min(7),
        marca: z.string().min(2),
        modelo: z.string().min(2),
        versao: z.string().optional().nullable(),
        cor: z.string().optional().nullable(),
        km: z.number().optional(),
        anoFabricacao: z.string().optional(),
        anoModelo: z.string().optional(),
        combustivel: z.string().optional().nullable(),
        cambio: z.string().optional().nullable(),
        cep: z.string().optional(),
        endereco: z.string().optional(),
        cidade: z.string().optional(),
        uf: z.string().optional(),
        documento_crlv_url: z.string().optional().nullable(),
        fotos: z.array(z.string()).optional(),
        condicao: condicaoSchema,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { token, condicao, ...veiculo } = data;
      const { serializarCondicao } = await import("@/lib/veiculo-condicao");
      const { enviarVistoriaPorToken } = await import("@/db/vistoria-link.server");
      const res = await enviarVistoriaPorToken(token, {
        ...veiculo,
        observacoes: serializarCondicao(condicao),
      } as any);
      return res;
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Não foi possível enviar as informações." };
    }
  });

export const revogarVistoriaLinkFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ linkId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    try {
      const { revogarVistoriaLink } = await import("@/db/vistoria-link.server");
      return await revogarVistoriaLink(data.linkId);
    } catch (e: any) {
      return { ok: false as const, message: e?.message || "Erro ao revogar o link." };
    }
  });
