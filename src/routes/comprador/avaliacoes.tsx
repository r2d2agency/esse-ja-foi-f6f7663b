import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/onboarding/FileUpload";
import { getSessionToken } from "@/lib/session";
import {
  listarAvaliacoesCompradorFn,
  anexarCautelarCompradorFn,
} from "@/lib/avaliacao-pos-venda.functions";

export const Route = createFileRoute("/comprador/avaliacoes")({ component: AvaliacoesComprador });
function AvaliacoesComprador() {
  const qc = useQueryClient();
  const [arquivos, setArquivos] = useState<Record<string, { url: string; nome: string }>>({});
  const { data, isLoading } = useQuery({
    queryKey: ["comprador-avaliacoes"],
    queryFn: () => listarAvaliacoesCompradorFn({ data: { token: getSessionToken() } }),
  });
  const enviar = useMutation({
    mutationFn: (x: { id: string; url: string; nome: string }) =>
      anexarCautelarCompradorFn({
        data: { token: getSessionToken(), id: x.id, arquivoUrl: x.url, arquivoNome: x.nome },
      }),
    onSuccess: (r: any) => {
      if (r?.ok) {
        toast.success("Cautelar enviada para análise.");
        qc.invalidateQueries({ queryKey: ["comprador-avaliacoes"] });
      } else toast.error(r?.message || "Falha ao enviar.");
    },
  });
  const itens: any[] = (data as any)?.data || [];
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Pós-venda</p>
        <h1 className="mt-1 text-2xl font-black text-slate-950">Avaliação e cautelar</h1>
        <p className="mt-2 text-sm text-slate-500">
          Anexe o PDF solicitado pela equipe para concluir a avaliação do veículo.
        </p>
      </div>
      {isLoading && <Loader2 className="animate-spin" />}
      {!isLoading && !itens.length && (
        <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
          Nenhuma avaliação pendente.
        </p>
      )}
      {itens.map((i) => (
        <div key={i.id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <p className="font-black text-slate-900">
              {i.marca} {i.modelo} {i.placa ? `• ${i.placa}` : ""}
            </p>
            <p className="text-xs font-bold text-slate-500">Status: {i.status}</p>
          </div>
          {i.modalidade === "EXTERNA" && i.status !== "RECEBIDA" && (
            <>
              <FileUpload
                label="Selecionar PDF da cautelar"
                description="Apenas PDF"
                onChange={(url: string | null) =>
                  url && setArquivos((a) => ({ ...a, [i.id]: { url, nome: "cautelar.pdf" } }))
                }
              />
              <Button
                disabled={!arquivos[i.id] || enviar.isPending}
                onClick={() => enviar.mutate({ id: i.id, ...arquivos[i.id] })}
                className="bg-teal-600 font-bold"
              >
                <FileUp className="mr-2 h-4 w-4" />
                Enviar cautelar
              </Button>
            </>
          )}
          {i.arquivo_url && (
            <a
              className="text-sm font-bold text-teal-700"
              href={i.arquivo_url}
              target="_blank"
              rel="noreferrer"
            >
              Ver documento enviado
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
