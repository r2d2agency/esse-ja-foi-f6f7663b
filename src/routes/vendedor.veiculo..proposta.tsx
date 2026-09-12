import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalisePosVistoriaFn, responderPropostaVendedorFn } from "@/lib/pos-vistoria.functions";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  ArrowLeft,
  Info,
  TrendingDown,
  Clock
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/vendedor/veiculo/proposta")({
  component: PropostaVendedorPage,
});

function PropostaVendedorPage() {
  const { id } = Route.useParams() as { id: string };
  const navigate = useNavigate();
  const [recusando, setRecusando] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState("");

  const getAnalise = useServerFn(getAnalisePosVistoriaFn);
  const responder = useServerFn(responderPropostaVendedorFn);

  const { data: res, isLoading } = useQuery({
    queryKey: ["vendedor-proposta", id],
    queryFn: () => getAnalise({ data: { veiculoId: id } })
  });

  const mutation = useMutation({
    mutationFn: (data: any) => responder({ data }),
    onSuccess: (_, variables) => {
      toast.success(variables.aceito ? "Proposta aceita com sucesso!" : "Proposta recusada.");
      navigate({ to: "/vendedor" } as any);
    },
    onError: () => toast.error("Erro ao processar resposta.")
  });

  if (isLoading) return <div className="p-8 text-center">Carregando proposta...</div>;
  if (!res?.data || res.data.status_proposta !== 'PENDENTE') {
     return <div className="p-8 text-center space-y-4">
       <p className="text-slate-500 font-bold">Nenhuma proposta pendente para este veículo.</p>
       <Button variant="outline" onClick={() => navigate({ to: "/vendedor" } as any)}>Voltar ao Início</Button>
     </div>;
  }

  const v = res.data;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-black uppercase text-slate-900">Proposta de Compra</h1>
      </div>

      <Card className="border-slate-200 shadow-xl overflow-hidden">
        <div className="bg-slate-950 p-6 text-white text-center">
          <p className="text-[10px] font-black uppercase text-teal-400 tracking-widest mb-1">Valor de Oferta</p>
          <h2 className="text-4xl font-black">{formatCurrency(Number(v.valor_oferta_essejafoi))}</h2>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Clock className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] font-bold text-amber-400 uppercase">Válido por 48h</span>
          </div>
        </div>
        
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Por que este valor?</h3>
            <div className="space-y-3">
              <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                <div className="flex items-start gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-red-700">Depreciações Técnicas</p>
                    <p className="text-[10px] text-red-600 mt-1">
                      Identificamos pontos de atenção na vistoria que exigem manutenção ou ajuste comercial.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!recusando ? (
            <div className="flex flex-col gap-3 pt-4">
              <Button 
                onClick={() => mutation.mutate({ veiculoId: id, aceito: true })}
                disabled={mutation.isPending}
                className="bg-teal-600 hover:bg-teal-700 text-white font-black uppercase h-14"
              >
                Aceitar Proposta e Seguir
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setRecusando(true)}
                disabled={mutation.isPending}
                className="text-slate-400 font-bold uppercase text-xs"
              >
                Não tenho interesse / Recusar
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-500">Por que está recusando?</label>
                <Textarea 
                  placeholder="Conte-nos o motivo..." 
                  value={motivoRecusa}
                  onChange={e => setMotivoRecusa(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setRecusando(false)}
                  className="flex-1 font-bold"
                >
                  Voltar
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => mutation.mutate({ veiculoId: id, aceito: false, motivoRecusa })}
                  disabled={mutation.isPending || !motivoRecusa}
                  className="flex-1 font-bold"
                >
                  Confirmar Recusa
                </Button>
              </div>
            </div>
          )}
          
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex gap-3">
            <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
              Ao aceitar a proposta, seu veículo será preparado para publicação na vitrine de leilão. Este valor é líquido para você, descontadas as taxas administrativas da plataforma.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
