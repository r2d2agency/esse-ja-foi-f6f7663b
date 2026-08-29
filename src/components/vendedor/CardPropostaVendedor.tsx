import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarPropostasPendentesVendedorFn } from "@/lib/analise-pos-vistoria.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { formatCurrency } from "@/lib/utils";

export function CardPropostaVendedor({ vendedorId }: { vendedorId: string }) {
  const navigate = useNavigate();
  const listar = useServerFn(listarPropostasPendentesVendedorFn);

  const { data: res } = useQuery({
    queryKey: ["propostas-pendentes-vendedor", vendedorId],
    queryFn: () => listar({ data: { perfilId: vendedorId } }),
    enabled: !!vendedorId,
    refetchInterval: 60_000,
  });

  const propostas: any[] = (res as any)?.data || [];
  if (propostas.length === 0) return null;

  return (
    <div className="space-y-4">
      {propostas.map((p: any) => (
        <Card key={p.id} className="border-teal-200 bg-teal-50/40 shadow-sm overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-[10px] font-black uppercase text-teal-700 tracking-widest flex items-center gap-2">
              <Bell className="h-3 w-3 animate-bounce" /> Proposta recebida
            </CardTitle>
            <Badge className="bg-teal-600 text-[10px] uppercase font-bold text-white">{p.placa}</Badge>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {p.marca} {p.modelo}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Analisamos a vistoria e enviamos as condições para venda do seu veículo.
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase text-slate-400">Líquido estimado</p>
                <p className="text-lg font-black text-slate-900">
                  {formatCurrency(Number(p.valor_liquido_vendedor || 0))}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-white/70 p-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Valor mínimo</p>
                <p className="text-sm font-bold text-slate-700">
                  {formatCurrency(Number(p.valor_minimo_acordado || 0))}
                </p>
              </div>
              <div className="border-l border-slate-200 pl-3">
                <p className="text-[10px] font-bold uppercase text-slate-400">Comissão</p>
                <p className="text-sm font-bold text-slate-700">
                  {formatCurrency(Number(p.comissao_valor || 0))}
                </p>
              </div>
            </div>

            <Button
              onClick={() =>
                navigate({ to: "/vendedor/veiculo/$id/proposta", params: { id: p.veiculo_id } })
              }
              className="mt-4 h-11 w-full rounded-xl bg-teal-600 font-bold text-white hover:bg-teal-700"
            >
              Ver detalhes e decidir <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
