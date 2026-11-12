import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ACOES = ["PROMOVER_SUPERADMIN", "EXCLUIR_VEICULO_FORCADO", "EXCLUIR_PERFIL_FORCADO", "MARCAR_PERFIL_APAGADO", "MARCAR_VEICULO_APAGADO", "RESTAURAR_PERFIL_APAGADO", "RESTAURAR_VEICULO_APAGADO"] as const;
type AcaoCritica = (typeof ACOES)[number];

const LABEL_ACOES: Record<AcaoCritica, string> = {
  PROMOVER_SUPERADMIN: "Promover um usuário a superadmin",
  EXCLUIR_VEICULO_FORCADO: "Excluir veículo com vínculos no sistema",
  EXCLUIR_PERFIL_FORCADO: "Excluir vendedor/comprador com vínculos no sistema",
  MARCAR_PERFIL_APAGADO: "Mover vendedor/comprador para a lixeira (ocultar)",
  MARCAR_VEICULO_APAGADO: "Mover carro para a lixeira (ocultar de todos, exceto superadmin)",
  RESTAURAR_PERFIL_APAGADO: "Restaurar vendedor/comprador da lixeira",
  RESTAURAR_VEICULO_APAGADO: "Restaurar carro da lixeira",
};

/** Envia o código de confirmação (por e-mail, a todos os superadmins) para uma ação crítica. */
export const solicitarCodigoSuperadminFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        acao: z.enum(ACOES),
        alvoDescricao: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { superadminDaSessao } = await import("@/lib/sessao.server");
      const solicitante = await superadminDaSessao();

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
        acao: z.enum(ACOES),
        alvoId: z.string().uuid(),
        codigo: z.string().min(4),
        confirmacao: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { superadminDaSessao } = await import("@/lib/sessao.server");
      const solicitante = await superadminDaSessao();

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
      } else if (data.acao === "MARCAR_PERFIL_APAGADO" || data.acao === "RESTAURAR_PERFIL_APAGADO") {
        const { marcarPerfilApagado } = await import("@/db/lixeira.server");
        await marcarPerfilApagado(data.alvoId, data.acao === "MARCAR_PERFIL_APAGADO", solicitante.id);
      } else if (data.acao === "MARCAR_VEICULO_APAGADO" || data.acao === "RESTAURAR_VEICULO_APAGADO") {
        const { marcarVeiculoApagado } = await import("@/db/lixeira.server");
        await marcarVeiculoApagado(data.alvoId, data.acao === "MARCAR_VEICULO_APAGADO", solicitante.id);
      } else if (data.acao === "RESET_BASE_OPERACIONAL") {
        const { resetBaseOperacional } = await import("@/db/purge-operacional.server");
        await resetBaseOperacional(data.confirmacao || "");
      }

      return { ok: true as const };
    } catch (e: any) {
      return { ok: false as const, message: e.message };
    }
  });
