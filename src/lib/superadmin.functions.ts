import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ACOES = ["PROMOVER_SUPERADMIN", "EXCLUIR_VEICULO_FORCADO", "EXCLUIR_PERFIL_FORCADO"] as const;
type AcaoCritica = (typeof ACOES)[number];

const LABEL_ACOES: Record<AcaoCritica, string> = {
  PROMOVER_SUPERADMIN: "Promover um usuário a superadmin",
  EXCLUIR_VEICULO_FORCADO: "Excluir veículo com vínculos no sistema",
  EXCLUIR_PERFIL_FORCADO: "Excluir vendedor/comprador com vínculos no sistema",
};

/** Envia o código de confirmação (por e-mail, a todos os superadmins) para uma ação crítica. */
export const solicitarCodigoSuperadminFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token: z.string(),
        acao: z.enum(ACOES),
        alvoDescricao: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { requireSuperAdmin } = await import("@/db/auth.server");
      const solicitante = await requireSuperAdmin(data.token);

      const { enviarCodigoAcaoCriticaSuperadmins } = await import("@/db/mail.server");
      const descricao = `${LABEL_ACOES[data.acao]}${data.alvoDescricao ? ` — ${data.alvoDescricao}` : ""} (solicitado por ${solicitante.nome})`;
      const enviados = await enviarCodigoAcaoCriticaSuperadmins(descricao, solicitante.email);
      return { ok: true as const, enviados };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });

/** Valida o código e executa a ação crítica correspondente. */
export const confirmarAcaoSuperadminFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        token: z.string(),
        acao: z.enum(ACOES),
        alvoId: z.string().uuid(),
        codigo: z.string().min(4),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { requireSuperAdmin } = await import("@/db/auth.server");
      const solicitante = await requireSuperAdmin(data.token);

      const { validarOTP } = await import("@/db/mail.server");
      const valido = await validarOTP(solicitante.email, data.codigo, "ACAO_CRITICA");
      if (!valido) return { ok: false as const, message: "Código inválido ou expirado." };

      if (data.acao === "PROMOVER_SUPERADMIN") {
        const { promoverSuperadmin } = await import("@/db/auth.server");
        await promoverSuperadmin(data.alvoId);
      } else if (data.acao === "EXCLUIR_VEICULO_FORCADO") {
        const { excluirVeiculoForcado } = await import("@/db/exclusao-forcada.server");
        await excluirVeiculoForcado(data.alvoId);
      } else if (data.acao === "EXCLUIR_PERFIL_FORCADO") {
        const { excluirPerfilForcado } = await import("@/db/exclusao-forcada.server");
        await excluirPerfilForcado(data.alvoId);
      }

      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
