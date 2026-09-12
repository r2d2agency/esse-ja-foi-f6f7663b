import { useEffect, useRef } from "react";
import { registrarErroClienteFn } from "@/lib/logs.functions";
import { useAuth } from "@/hooks/use-auth";

const LIMITE_POR_SESSAO = 20;

/**
 * Captura erros de JS e promises rejeitadas não tratadas no navegador de qualquer usuário
 * logado e manda para o log do admin (/admin/logs, entidade ERRO_CLIENTE) — sem isso, um erro
 * que só acontece pra um usuário específico nunca chega ao conhecimento de quem dá suporte.
 */
export function ErrorLogCapture() {
  const { user, isAuthenticated } = useAuth();
  const enviadosRef = useRef(0);
  const vistosRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isAuthenticated) return;

    function enviar(mensagem: string, stack?: string) {
      if (enviadosRef.current >= LIMITE_POR_SESSAO) return;
      const chave = `${mensagem}::${stack?.slice(0, 200) || ""}`;
      if (vistosRef.current.has(chave)) return;
      vistosRef.current.add(chave);
      enviadosRef.current += 1;
      registrarErroClienteFn({
        data: {
          mensagem,
          stack,
          url: window.location.href,
          userAgent: navigator.userAgent,
          usuario: user ? `${user.nome} (${user.email})` : undefined,
        },
      }).catch(() => {});
    }

    function aoErro(event: ErrorEvent) {
      enviar(event.message || "Erro desconhecido", event.error?.stack);
    }

    function aoRejeitar(event: PromiseRejectionEvent) {
      const razao = event.reason;
      const mensagem = razao?.message || String(razao ?? "Promise rejeitada sem motivo");
      enviar(mensagem, razao?.stack);
    }

    window.addEventListener("error", aoErro);
    window.addEventListener("unhandledrejection", aoRejeitar);
    return () => {
      window.removeEventListener("error", aoErro);
      window.removeEventListener("unhandledrejection", aoRejeitar);
    };
  }, [isAuthenticated, user]);

  return null;
}
