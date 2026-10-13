import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";

/**
 * Sessão por cookie — a identidade do usuário vem EXCLUSIVAMENTE daqui.
 *
 * Antes o token vivia em `localStorage` e era passado como parâmetro `token`
 * em toda chamada do cliente. Quando o storage estava vazio, expirado ou
 * dessincronizado, o servidor recebia `token: null` e respondia
 * "Não autorizado" — o que deixou `/admin/conversas` impossibilitada de
 * enviar mensagem e template sem nenhuma pista do motivo. Com o cookie
 * httpOnly o cliente não precisa saber do token, então não existe estado
 * dessincronizado: a sessão é lida a cada requisição.
 *
 * O token continua sendo o mesmo HMAC-SHA256 de `issueToken` (12h) — só o
 * transporte mudou, de localStorage para cookie.
 */

export const COOKIE_SESSAO = "ejf_sessao";

/** Mesma validade do token emitido em `issueToken` (12h), para os dois expirarem juntos. */
const MAX_AGE_S = 60 * 60 * 12;

const OPCOES_COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  // `secure` só em produção: em HTTP local (como na máquina de desenvolvimento)
  // o cookie seria descartado pelo navegador e o login nunca completaria.
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_S,
};

/** Grava o cookie de sessão. Chamado em cada login/cadastro que emite token. */
export function definirSessao(token: string) {
  setCookie(COOKIE_SESSAO, token, OPCOES_COOKIE);
}

/** Apaga o cookie de sessão. Chamado pelo logout. */
export function encerrarSessao() {
  deleteCookie(COOKIE_SESSAO, { path: "/" });
}

/**
 * userId do dono do cookie, ou null se não houver cookie, se ele for inválido
 * ou se estiver expirado. Substitui as cópias locais de `userIdFrom`/
 * `userFromToken` espalhadas pelas *.functions.ts.
 */
export async function usuarioDaSessao(): Promise<string | null> {
  const { verifyToken } = await import("@/db/auth.server");
  return verifyToken(getCookie(COOKIE_SESSAO));
}

/**
 * Perfil completo do dono do cookie, ou null. É o que a tela precisa para
 * montar o usuário logado (`getSessaoAtualFn`).
 */
export async function perfilDaSessao() {
  const { getUsuarioPorToken } = await import("@/db/auth.server");
  return getUsuarioPorToken(getCookie(COOKIE_SESSAO));
}

/**
 * Só passa se o cookie pertencer a um superadmin ativo e protegido.
 * Substitui `requireSuperAdmin(token)` nas ações críticas.
 */
export async function superadminDaSessao() {
  const user = await perfilDaSessao();
  if (!user || !user.ativo || user.role !== "admin" || !user.protegido) {
    throw new Error("Apenas um superadmin pode realizar esta ação.");
  }
  return user as {
    id: string;
    nome: string;
    email: string;
    role: string;
    ativo: boolean;
    protegido: boolean;
  };
}
