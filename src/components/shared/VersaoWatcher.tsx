import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getVersaoAppFn } from "@/lib/versao.functions";
import { useAuth } from "@/hooks/use-auth";

const INTERVALO_MS = 5 * 60 * 1000;
const ATRASO_RECARREGAR_MS = 6000;

/**
 * Verifica periodicamente se o servidor já está numa versão mais nova do que a que esta aba
 * carregou (comparando __APP_BUILD_ID__, embutido no build, com o que a API devolve em runtime)
 * e recarrega sozinho quando muda — evita usuário logado preso numa versão antiga em cache.
 */
export function VersaoWatcher() {
  const { isAuthenticated } = useAuth();
  const avisadoRef = useRef(false);

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

    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoFocar);
    };
  }, [isAuthenticated]);

  return null;
}
