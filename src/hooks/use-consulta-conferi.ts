import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { obterConsultaRegistradaFn } from "@/lib/consulta-veicular.functions";
import { getSessionToken } from "@/lib/session";

/** Atualiza a tela a partir do banco; somente o webhook resgata dados na Company. */
export function useConsultaConferi(resultado: any, atualizar: (resultado: any) => void) {
  const id = resultado?.id;
  const ativo = Boolean(
    id && resultado?.status === "PROCESSANDO" && !resultado?.acompanhamentoInterrompido,
  );
  const { data, error } = useQuery({
    queryKey: ["consulta-conferi", id],
    enabled: ativo,
    queryFn: () => obterConsultaRegistradaFn({ data: { id, token: getSessionToken() || "" } }),
    refetchInterval: ativo ? 6000 : false,
    retry: 2,
  });
  useEffect(() => {
    if (!id) return;
    if (error) {
      atualizar({
        ...resultado,
        acompanhamentoInterrompido: true,
        message:
          "Não foi possível acompanhar o resultado. Repita o teste para retomar a consulta registrada.",
      });
      return;
    }
    if (!data) return;
    if ("id" in data && data.id === id) atualizar(data);
    else if (!data.ok)
      atualizar({ ...resultado, acompanhamentoInterrompido: true, message: data.message });
    // O resultado anterior só fornece contexto para a falha de leitura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, error, id, atualizar]);
}
