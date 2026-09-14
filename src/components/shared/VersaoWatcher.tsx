import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getVersaoAppFn } from "@/lib/versao.functions";
import { useAuth } from "@/hooks/use-auth";

const INTERVALO_MS = 5 * 60 * 1000;
const ATRASO_RECARREGAR_MS = 6000;
const CHAVE_ULTIMO_RELOAD_FORCADO = "_ejf_reload_chunk_ts";
const COOLDOWN_RELOAD_FORCADO_MS = 30 * 1000;

function podeForcarReload() {
  try {
    const ultimo = Number(sessionStorage.getItem(CHAVE_ULTIMO_RELOAD_FORCADO) || 0);
    if (Date.now() - ultimo < COOLDOWN_RELOAD_FORCADO_MS) return false; // evita loop se o reload não resolver
    sessionStorage.setItem(CHAVE_ULTIMO_RELOAD_FORCADO, String(Date.now()));
    return true;
  } catch {
    return true; // sessionStorage indisponível (aba privada etc.) — recarrega mesmo assim
  }
}

/**
 * Verifica periodicamente se o servidor já está numa versão mais nova do que a que esta aba
 * carregou (comparando __APP_BUILD_ID__, embutido no build, com o que a API devolve em runtime)
 * e recarrega sozinho quando muda — evita usuário logado preso numa versão antiga em cache.
 */
export function VersaoWatcher() {
  const { isAuthenticated } = useAuth();
  const avisadoRef = useRef(false);

  // Reage na hora, sem esperar o próximo ciclo de verificação: se o navegador tenta buscar um
  // chunk JS que o deploy anterior gerou (nome com hash) e o servidor já não tem mais esse
  // arquivo (deploy novo trocou os hashes), a navegação por rota quebra com "Failed to fetch
  // dynamically imported module". O Vite dispara `vite:preloadError` exatamente nesse caso —
  // aqui, em vez de deixar a tela travada, recarrega direto. Roda pra qualquer visitante
  // (não só logado), porque o erro trava a navegação de qualquer um.
  useEffect(() => {
    function aoFalharChunk(evento: Event) {
      evento.preventDefault?.();
      if (!podeForcarReload()) return;
      window.location.reload();
    }
    window.addEventListener("vite:preloadError", aoFalharChunk);
    return () => window.removeEventListener("vite:preloadError", aoFalharChunk);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function verificar() {
      if (avisadoRef.current) return;
      try {
        const res: any = await getVersaoAppFn();
        if (res?.versao && res.versao !== __APP_BUILD_ID__) {
          avisadoRef.current = true;
          toast.info("Nova atualização disponível. Recarregando em instantes...", {
            duration: ATRASO_RECARREGAR_MS,
          });
          setTimeout(() => window.location.reload(), ATRASO_RECARREGAR_MS);
        }
      } catch {
        // Falha de rede/servidor não deve incomodar o usuário — tenta de novo no próximo ciclo.
      }
    }

    verificar();
    const intervalo = setInterval(verificar, INTERVALO_MS);
    function aoFocar() {
      if (document.visibilityState === "visible") verificar();
    }
    document.addEventListener("visibilitychange", aoFocar);

    // Uma chamada de função do servidor (POST) devolvendo 404 é outro sintoma clássico de aba
    // presa numa versão antiga: o bundle antigo chama um endpoint interno que o deploy novo já
    // não expõe mais desse jeito. Ao contrário do `vite:preloadError` (chunk JS faltando), esse
    // caso não dispara evento nenhum — só dá pra perceber olhando a resposta do fetch. Em vez de
    // recarregar direto (um 404 isolado pode ser legítimo, ex.: recurso realmente inexistente),
    // só verifica a versão de imediato; só recarrega se a versão realmente mudou.
    const fetchOriginal = window.fetch;
    window.fetch = async (...args) => {
      const resposta = await fetchOriginal(...args);
      try {
        const [entrada, init] = args;
        const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada?.url;
        const metodo = (init?.method || (entrada instanceof Request ? entrada.method : "GET") || "GET").toUpperCase();
        if (resposta.status === 404 && metodo === "POST" && url && new URL(url, window.location.origin).origin === window.location.origin) {
          void verificar();
        }
      } catch {
        // nunca deixa esse diagnóstico quebrar a chamada original
      }
      return resposta;
    };

    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoFocar);
      window.fetch = fetchOriginal;
    };
  }, [isAuthenticated]);

  return null;
}
