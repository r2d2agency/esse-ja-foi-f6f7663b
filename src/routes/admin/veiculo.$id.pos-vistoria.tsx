import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalisePosVistoriaFn, salvarPropostaValorFn } from "@/lib/pos-vistoria.functions";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Calculator, 
  ArrowLeft, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingDown,
  DollarSign,
  Plus,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

export const Route = createFileRoute("/admin/veiculo/$id/pos-vistoria")({
  component: AnalisePosVistoriaPage,
});

function AnalisePosVistoriaPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const getAnalise = useServerFn(getAnalisePosVistoriaFn);
  const salvar = useServerFn(salvarPropostaValorFn);

  const { data: res, isLoading } = useQuery({
    queryKey: ["analise-pos-vistoria", id],
    queryFn: () => getAnalise({ data: { veiculoId: id } })
  });

  const [valorFipe, setValorFipe] = useState(0);
  const [margem, setMargem] = useState(15);
  const [depreciacoes, setDepreciacoes] = useState<{ item: string; valor: number; descricao: string }[]>([]);
  
  useEffect(() => {
    if (res?.data) {
      setValorFipe(Number(res.data.valor_fipe_atual) || 0);
      setMargem(Number(res.data.margem_seguranca_percentual) || 15);
    }
  }, [res]);

  const totalDepreciacao = depreciacoes.reduce((acc, curr) => acc + curr.valor, 0);
  const valorOferta = valorFipe > 0 ? (valorFipe - totalDepreciacao) * (1 - margem / 100) : 0;

  const mutation = useMutation({
    mutationFn: (data: any) => salvar({ data }),
    onSuccess: () => {
      toast.success("Proposta enviada ao vendedor com sucesso!");
      navigate({ to: "/admin/veiculo/$id", params: { id } } as any);
    },
    onError: () => toast.error("Erro ao salvar proposta.")
  });

  const addDepreciacao = () => {
    setDepreciacoes([...depreciacoes, { item: "", valor: 0, descricao: "" }]);
  };

  const removeDepreciacao = (index: number) => {
    setDepreciacoes(depreciacoes.filter((_, i) => i !== index));
  };

  if (isLoading) return <div className="p-8">Carregando análise...</div>;
  if (!res?.data) return <div className="p-8 text-red-500">Laudo não encontrado. Realize a vistoria primeiro.</div>;

  const v = res.data;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-black uppercase text-slate-950">Análise Pós-Vistoria</h1>
        </div>
        <Badge className="bg-teal-600 uppercase font-bold">{v.placa}</Badge>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="border-slate-200 shadow-none">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-sm font-black uppercase text-slate-500 flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Calculadora de Oferta
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Valor FIPE Atual (R$)</Label>
                  <Input 
                    type="number" 
                    value={valorFipe} 
                    onChange={e => setValorFipe(Number(e.target.value))}
                    className="font-bold text-lg"
                  />
                  <p className="text-[10px] text-slate-400">Interesse do Cliente: {formatCurrency(Number(v.valor_interesse_cliente))}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Margem Comercial (%)</Label>
                  <Input 
                    type="number" 
                    value={margem} 
                    onChange={e => setMargem(Number(e.target.value))}
                    className="font-bold text-lg"
                  />
                  <p className="text-[10px] text-slate-400">Padrão da plataforma: 15%</p>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-slate-950 flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" /> Depreciações Técnicas
                  </h3>
                  <Button variant="outline" size="sm" onClick={addDepreciacao} className="h-7 text-[10px] font-bold uppercase">
                    <Plus className="h-3 w-3 mr-1" /> Adicionar Item
                  </Button>
                </div>

                {depreciacoes.length === 0 ? (
                  <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-xl text-slate-400 text-xs italic">
                    Nenhuma depreciação adicionada.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {depreciacoes.map((dep, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row gap-3 sm:items-start p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex-1 space-y-2">
                          <Input 
                            placeholder="Item (Ex: Pneus, Funilaria)" 
                            value={dep.item}
                            onChange={e => {
                              const newDeps = [...depreciacoes];
                              const targetDep = newDeps[idx];
                              if (targetDep) {
                                targetDep.item = e.target.value;
                                setDepreciacoes(newDeps);
                              }
                            }}
                            className="h-8 text-xs font-bold"
                          />
                          <Textarea 
                            placeholder="Justificativa..." 
                            value={dep.descricao}
                            onChange={e => {
                              const newDeps = [...depreciacoes];
                              const targetDep = newDeps[idx];
                              if (targetDep) {
                                targetDep.descricao = e.target.value;
                                setDepreciacoes(newDeps);
                              }
                            }}
                            className="h-16 text-xs resize-none"
                          />
                        </div>
                        <div className="w-full sm:w-32 flex items-center gap-2 sm:block sm:space-y-2 sm:text-right">
                          <Input
                            type="number"
                            placeholder="Valor R$"
                            value={dep.valor}
                            onChange={e => {
                              const newDeps = [...depreciacoes];
                              const targetDep = newDeps[idx];
                              if (targetDep) {
                                targetDep.valor = Number(e.target.value);
                                setDepreciacoes(newDeps);
                              }
                            }}
                            className="h-8 min-w-0 flex-1 sm:w-full text-xs font-bold text-right"
                          />
                          <Button variant="ghost" size="icon" onClick={() => removeDepreciacao(idx)} className="h-8 w-8 shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-slate-950 text-white border-none shadow-xl static md:sticky md:top-6">
            <CardHeader>
              <CardTitle className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Resumo da Proposta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase text-slate-500">Valor FIPE</p>
                <p className="text-xl font-bold">{formatCurrency(valorFipe)}</p>
              </div>
              
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase text-slate-500">(-) Depreciações</p>
                <p className="text-xl font-bold text-red-400">{formatCurrency(totalDepreciacao)}</p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase text-slate-500">(-) Margem ({margem}%)</p>
                <p className="text-xl font-bold text-red-400">{formatCurrency((valorFipe - totalDepreciacao) * (margem / 100))}</p>
              </div>

              <div className="pt-6 border-t border-white/10 space-y-2">
                <p className="text-[10px] font-black uppercase text-teal-400 tracking-widest">Oferta Esse Já Foi</p>
                <p className="text-3xl font-black text-teal-400">{formatCurrency(valorOferta)}</p>
              </div>

              <Button 
                onClick={() => mutation.mutate({
                  veiculoId: id,
                  valorFipe,
                  valorOferta,
                  margem,
                  depreciacoes,
                  responsavelId: user?.id
                })}
                disabled={mutation.isPending || valorOferta <= 0}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white font-black uppercase h-12 mt-4"
              >
                {mutation.isPending ? "Enviando..." : "Enviar Proposta ao Vendedor"}
              </Button>
              <p className="text-[9px] text-center text-slate-500 font-medium">
                O vendedor receberá uma notificação via WhatsApp e E-mail para aceite em até 48h.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
