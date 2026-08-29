import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDetalheAnaliseVistoriaFn, enviarPropostaVendedorFn } from "@/lib/analise-pos-vistoria.functions";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Gavel,
  MapPin,
  MessageSquare,
  User,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/analise-vistoria/$id")({
  component: DetalheAnaliseVistoriaPage,
});

function formatCurrency(value?: number | string | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return format(new Date(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function DetalheAnaliseVistoriaPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("resumo");
  const [comissaoPercent, setComissaoPercent] = useState(5);
  const [valorMinimo, setValorMinimo] = useState(0);
  const [valorReferencia, setValorReferencia] = useState(0);
  const [mensagemVendedor, setMensagemVendedor] = useState("");
  const [observacaoInterna, setObservacaoInterna] = useState("");

  const getDetalhe = useServerFn(getDetalheAnaliseVistoriaFn);
  const enviarProposta = useServerFn(enviarPropostaVendedorFn);

  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ["admin-analise-vistoria", id],
    queryFn: () => getDetalhe({ data: { veiculoId: id } }),
  });

  const data = res?.data;
  const veiculo = data?.veiculo;
  const vistoria = data?.vistoria;
  const checklist = data?.checklist || [];
  const fotos = data?.fotos || [];
  const propostas = data?.propostas || [];
  const propostaAtual = propostas[0];

  useEffect(() => {
    if (!veiculo) return;
    setValorReferencia(Number(propostaAtual?.valor_referencia ?? veiculo.valor_interesse_cliente ?? 0));
    setValorMinimo(Number(propostaAtual?.valor_minimo_acordado ?? 0));
    setMensagemVendedor(String(propostaAtual?.mensagem_vendedor ?? ""));
    setObservacaoInterna(String(propostaAtual?.observacao_interna ?? ""));
    if (propostaAtual?.valor_minimo_acordado && propostaAtual?.comissao_valor) {
      const minimo = Number(propostaAtual.valor_minimo_acordado);
      const comissao = Number(propostaAtual.comissao_valor);
      if (minimo > 0) {
        setComissaoPercent(Number(((comissao / minimo) * 100).toFixed(2)));
      }
    }
  }, [veiculo, propostaAtual]);

  const liquidEstimado = useMemo(() => {
    const comissao = (valorMinimo * comissaoPercent) / 100;
    return Math.max(valorMinimo - comissao, 0);
  }, [valorMinimo, comissaoPercent]);

  const checklistResumo = useMemo(() => ({
    total: checklist.length,
    conforme: checklist.filter((item: any) => item.status === "CONFORME").length,
    observacao: checklist.filter((item: any) => item.status === "COM_OBSERVACAO").length,
    naoConforme: checklist.filter((item: any) => item.status === "NAO_CONFORME").length,
  }), [checklist]);

  const statusConfig: Record<string, string> = {
    AGUARDANDO_ANALISE_LAUDO: "bg-amber-50 text-amber-700",
    EM_ANALISE_POS_VISTORIA: "bg-blue-50 text-blue-700",
    PENDENCIA_VISTORIA: "bg-red-50 text-red-700",
    AGUARDANDO_ACEITE_VENDEDOR: "bg-orange-50 text-orange-700",
    PRONTO_PARA_ANUNCIO: "bg-green-50 text-green-700",
    VALOR_RECUSADO: "bg-red-50 text-red-700",
  };

  const handleEnviar = async () => {
    if (!user?.id) {
      toast.error("Usuário não identificado.");
      return;
    }
    if (!valorMinimo) {
      toast.error("Informe o valor mínimo acordado.");
      return;
    }

    const toastId = toast.loading("Enviando proposta ao vendedor...");
    try {
      const response = await enviarProposta({
        data: {
          veiculo_id: id,
          valor_referencia: valorReferencia || 0,
          valor_minimo_acordado: valorMinimo,
          comissao_tipo: "PERCENTUAL",
          comissao_valor: Number(((valorMinimo * comissaoPercent) / 100).toFixed(2)),
          valor_liquido_vendedor: Number(liquidEstimado.toFixed(2)),
          observacao_interna: observacaoInterna || undefined,
          mensagem_vendedor: mensagemVendedor || undefined,
          usuario_id: user.id,
        },
      });

      if (!response.ok) {
        toast.error((response as any).message || "Não foi possível enviar a proposta.", { id: toastId });
        return;
      }

      toast.success("Proposta enviada ao vendedor.", { id: toastId });
      await refetch();
      setActiveTab("historico");
    } catch {
      toast.error("Erro técnico ao enviar proposta.", { id: toastId });
    }
  };

  if (isLoading) return <div className="p-8">Carregando análise...</div>;
  if (!res?.ok || !data || !veiculo) return <div className="p-8 text-red-500">Erro: {res?.message || "Veículo não encontrado"}</div>;

  const statusClass = statusConfig[veiculo.status_analise] || "bg-slate-100 text-slate-700";

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 p-6 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/admin/vistorias", search: { tab: "aguardando_analise" } } as any)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-black text-slate-950 uppercase">{veiculo.marca} {veiculo.modelo}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="font-mono text-[10px]">{veiculo.placa}</Badge>
              <Badge className={cn("text-[10px] font-black uppercase hover:bg-inherit", statusClass)}>
                {String(veiculo.status_analise || "SEM_STATUS").replaceAll("_", " ")}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" className="font-bold" onClick={() => setActiveTab("checklist")}>
            <ClipboardList className="mr-2 h-4 w-4" /> Revisar checklist
          </Button>

          {veiculo.status_analise === "PRONTO_PARA_ANUNCIO" ? (
            <Button className="bg-teal-600 hover:bg-teal-700 text-white font-bold" onClick={() => navigate({ to: "/admin/anuncios" })}>
              <Gavel className="mr-2 h-4 w-4" /> Ir para anúncios
            </Button>
          ) : (
            <Button onClick={() => setActiveTab("valores")} className="bg-slate-950 hover:bg-slate-900 text-white font-bold">
              <CheckCircle2 className="mr-2 h-4 w-4" /> Fechar análise comercial
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
        <div className="bg-white border-b border-slate-200 px-6 overflow-x-auto">
          <TabsList className="bg-transparent border-none h-12 gap-6 p-0">
            {[
              ["resumo", "Resumo"],
              ["checklist", "Checklist"],
              ["fotos", "Fotos"],
              ["valores", "Valores"],
              ["historico", "Histórico"],
            ].map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="bg-transparent border-none p-0 h-full data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-teal-600 data-[state=active]:border-b-2 data-[state=active]:border-teal-600 rounded-none font-bold text-xs uppercase tracking-wider text-slate-400"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1 p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            <TabsContent value="resumo" className="mt-0 space-y-6">
              <div className="grid gap-6 md:grid-cols-4">
                <MetricCard label="Itens verificados" value={String(checklistResumo.total)} />
                <MetricCard label="Conformes" value={String(checklistResumo.conforme)} valueClassName="text-green-600" />
                <MetricCard label="Com observação" value={String(checklistResumo.observacao)} valueClassName="text-amber-600" />
                <MetricCard label="Não conformes" value={String(checklistResumo.naoConforme)} valueClassName="text-red-600" />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-slate-200 shadow-none">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-xs font-black uppercase text-slate-400 flex items-center gap-2">
                      <FileText className="h-3 w-3" /> Dados da vistoria
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4 text-sm">
                    <InfoRow icon={Calendar} label="Data da vistoria" value={vistoria?.data_vistoria ? format(new Date(vistoria.data_vistoria), "dd/MM/yyyy") : "-"} />
                    <InfoRow icon={Clock3} label="Horário" value={vistoria?.horario_vistoria ? String(vistoria.horario_vistoria).slice(0, 5) : "-"} />
                    <InfoRow icon={MapPin} label="Unidade" value={vistoria?.unidade_nome || "-"} />
                    <InfoRow icon={User} label="Vistoriador" value={vistoria?.vistoriador_nome || "Não definido"} />
                    <InfoRow icon={CheckCircle2} label="Conclusão do laudo" value={formatDateTime(vistoria?.concluido_em)} />
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-none">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-xs font-black uppercase text-slate-400 flex items-center gap-2">
                      <MessageSquare className="h-3 w-3" /> Parecer do vistoriador
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <p className="text-sm text-slate-700 italic">
                      {vistoria?.observacao_geral ? `"${vistoria.observacao_geral}"` : "Nenhuma observação geral registrada."}
                    </p>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-black uppercase text-slate-400">Próxima etapa operacional</p>
                      <p className="mt-2 text-sm font-bold text-slate-900">
                        {veiculo.status_analise === "PRONTO_PARA_ANUNCIO"
                          ? "Veículo pronto para entrar na vitrine/comercial."
                          : veiculo.status_analise === "AGUARDANDO_ACEITE_VENDEDOR"
                            ? "Aguardando aceite do vendedor sobre a proposta comercial."
                            : "Fechar a proposta comercial e enviar para o vendedor."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-slate-200 shadow-none">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-xs font-black uppercase text-slate-400">Veículo</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 grid grid-cols-2 gap-4 text-sm">
                    <Field label="Placa" value={veiculo.placa} />
                    <Field label="Ano/Modelo" value={`${veiculo.ano_fabricacao || "-"} / ${veiculo.ano_modelo || "-"}`} />
                    <Field label="KM" value={veiculo.km ? `${Number(veiculo.km).toLocaleString("pt-BR")} km` : "-"} />
                    <Field label="Cor" value={veiculo.cor || "-"} />
                    <Field label="Vendedor" value={veiculo.vendedor_nome || "-"} />
                    <Field label="Cidade/UF" value={`${veiculo.vendedor_cidade || "-"} / ${veiculo.vendedor_uf || "-"}`} />
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-none">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-xs font-black uppercase text-slate-400">Proposta atual</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4 text-sm">
                    {propostaAtual ? (
                      <>
                        <Field label="Valor de referência" value={formatCurrency(propostaAtual.valor_referencia)} />
                        <Field label="Valor mínimo acordado" value={formatCurrency(propostaAtual.valor_minimo_acordado)} />
                        <Field label="Líquido vendedor" value={formatCurrency(propostaAtual.valor_liquido_vendedor)} />
                        <Field label="Status" value={String(propostaAtual.status || "-").replaceAll("_", " ")} />
                        <Field label="Enviada em" value={formatDateTime(propostaAtual.enviado_em)} />
                      </>
                    ) : (
                      <p className="text-slate-500">Nenhuma proposta enviada ainda.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="checklist" className="mt-0">
              <Card className="border-slate-200 shadow-none overflow-hidden">
                <CardContent className="p-0">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Etapa / Item</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {checklist.length > 0 ? checklist.map((item: any) => (
                        <tr key={item.id} className={cn("hover:bg-slate-50/50", item.status !== "CONFORME" && "bg-amber-50/20")}>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-[10px] text-slate-400 font-black uppercase">{item.etapa}</span>
                              <span className="text-sm font-bold text-slate-900">{String(item.item_chave).replaceAll("_", " ")}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">{renderChecklistStatus(item.status)}</td>
                           <td className="px-6 py-4 text-sm text-slate-500">
                             <div className="space-y-2">
                               <p>{formatarRespostaChecklist(item)}</p>
                               {item.observacao && <p className="text-xs italic">Observação: {item.observacao}</p>}
                               {item.foto_url && <img src={item.foto_url} alt={`Foto de ${item.item_chave}`} className="h-20 w-28 rounded-md border border-slate-200 object-cover" />}
                             </div>
                           </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                            Nenhum item de checklist encontrado para este laudo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fotos" className="mt-0">
              <div className="grid gap-4 md:grid-cols-3">
                {fotos.length > 0 ? fotos.map((foto: any) => (
                  <Card key={foto.id} className="border-slate-200 shadow-none overflow-hidden">
                    <div className="aspect-[4/3] bg-slate-100">
                      <img src={foto.url} alt={foto.tipo_foto || "Foto do laudo"} className="w-full h-full object-cover" />
                    </div>
                    <CardContent className="p-4 space-y-2">
                      <p className="text-xs font-black uppercase text-slate-500">{foto.tipo_foto || "Foto"}</p>
                      <p className="text-xs text-slate-500">Criada em {formatDateTime(foto.criado_em)}</p>
                    </CardContent>
                  </Card>
                )) : (
                  <Card className="md:col-span-3 border-slate-200 shadow-none">
                    <CardContent className="py-12 text-center text-slate-400">
                      Nenhuma foto disponível para este laudo.
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="valores" className="mt-0">
              <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
                <Card className="border-slate-200 shadow-none">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-sm font-black uppercase text-slate-950">Fechamento comercial</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Valor de referência</Label>
                        <Input type="number" value={valorReferencia} onChange={(e) => setValorReferencia(Number(e.target.value))} />
                        <p className="text-[10px] text-slate-400">Interesse inicial do vendedor: {formatCurrency(veiculo.valor_interesse_cliente)}</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Valor mínimo acordado</Label>
                        <Input type="number" value={valorMinimo} onChange={(e) => setValorMinimo(Number(e.target.value))} />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Comissão da plataforma (%)</Label>
                        <Input type="number" value={comissaoPercent} onChange={(e) => setComissaoPercent(Number(e.target.value))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Mensagem para o vendedor</Label>
                        <Textarea
                          placeholder="Explique as condições da proposta de forma clara."
                          value={mensagemVendedor}
                          onChange={(e) => setMensagemVendedor(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Observação interna</Label>
                      <Textarea
                        placeholder="Registre argumentos comerciais, cenário do veículo ou qualquer observação interna."
                        value={observacaoInterna}
                        onChange={(e) => setObservacaoInterna(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button onClick={handleEnviar} className="bg-slate-950 hover:bg-slate-900 text-white font-bold">
                        {propostaAtual ? "Enviar nova versão da proposta" : "Enviar proposta ao vendedor"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-none">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-xs font-black uppercase text-slate-400">Resumo financeiro</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <Field label="Valor de referência" value={formatCurrency(valorReferencia)} />
                    <Field label="Valor mínimo acordado" value={formatCurrency(valorMinimo)} />
                    <Field label="Comissão estimada" value={formatCurrency((valorMinimo * comissaoPercent) / 100)} />
                    <div className="rounded-xl bg-teal-50 border border-teal-100 p-4">
                      <p className="text-[10px] font-black uppercase text-teal-600">Líquido vendedor</p>
                      <p className="mt-2 text-2xl font-black text-teal-700">{formatCurrency(liquidEstimado)}</p>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Ao enviar a proposta, o veículo vai para o status de aguardo de aceite do vendedor. Quando ele aceitar, entra em <strong>pronto para anúncio</strong>.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="historico" className="mt-0">
              <Card className="border-slate-200 shadow-none">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-black uppercase text-slate-950">Linha do tempo comercial</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <TimelineItem
                    title="Laudo concluído"
                    subtitle={vistoria?.vistoriador_nome ? `Vistoriador: ${vistoria.vistoriador_nome}` : "Laudo finalizado"}
                    time={formatDateTime(vistoria?.concluido_em)}
                  />

                  {propostas.length > 0 ? propostas.map((proposta: any) => (
                    <TimelineItem
                      key={proposta.id}
                      title={`Proposta v${proposta.versao}`}
                      subtitle={`${formatCurrency(proposta.valor_minimo_acordado)} • ${String(proposta.status).replaceAll("_", " ")}`}
                      time={formatDateTime(proposta.enviado_em)}
                    />
                  )) : (
                    <p className="text-sm text-slate-500">Nenhuma proposta foi enviada ainda.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function MetricCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="p-5">
        <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
        <p className={cn("mt-2 text-2xl font-black text-slate-950", valueClassName)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-slate-400 mt-0.5" />
      <div>
        <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
        <p className="text-sm font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function TimelineItem({ title, subtitle, time }: { title: string; subtitle: string; time: string }) {
  return (
    <div className="relative pl-6 before:absolute before:left-0 before:top-2 before:h-2 before:w-2 before:rounded-full before:bg-teal-500">
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="text-sm text-slate-500">{subtitle}</p>
      <p className="text-[10px] font-black uppercase text-slate-400 mt-1">{time}</p>
    </div>
  );
}

function renderChecklistStatus(status: string) {
  switch (status) {
    case "CONFORME":
      return <Badge className="bg-green-50 text-green-700 hover:bg-green-50 text-[10px] font-bold">Conforme</Badge>;
    case "COM_OBSERVACAO":
      return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 text-[10px] font-bold">Com observação</Badge>;
    case "NAO_CONFORME":
      return <Badge className="bg-red-50 text-red-700 hover:bg-red-50 text-[10px] font-bold">Não conforme</Badge>;
    case "RESPONDIDO":
      return <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 text-[10px] font-bold">Respondido</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] font-bold">{status || "N/A"}</Badge>;
  }
}

function formatarRespostaChecklist(item: any) {
  if (item.resposta_texto) return item.resposta_texto;
  if (item.resposta_numero !== null && item.resposta_numero !== undefined) return String(item.resposta_numero);
  if (Array.isArray(item.resposta_opcoes)) return item.resposta_opcoes.join(", ");
  if (item.resposta_opcoes) return String(item.resposta_opcoes);
  return item.observacao || "Sem observação";
}
