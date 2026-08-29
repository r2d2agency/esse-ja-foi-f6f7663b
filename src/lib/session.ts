/** Recupera o token de sessão persistido pelo store de autenticação. */
export function getSessionToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem("auth-storage");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.accessToken) return parsed.state.accessToken as string;
    }
  } catch {
    /* ignora */
  }
  return localStorage.getItem("accessToken") || "";
}
