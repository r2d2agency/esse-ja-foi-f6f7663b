import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listarNegociacoesAdminFn, salvarPrazoPagamentoFn } from "@/lib/negociacoes.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Handshake, AlertTriangle, Clock, Eye } from "lucide-react";
import { toast } from "sonner";
import { PrazoPagamento, STATUS_LABEL, STATUS_CLASSE, brl } from "@/components/negociacao/prazo-pagamento";

export const Route = createFileRoute("/admin/negociacoes")({
  head: () => ({
    meta: [
      { title: "Negociações | Esse Já Foi" },
      { name: "description", content: "Acompanhe negociações criadas após o fechamento dos lances e o prazo de pagamento dos compradores vencedores." },
    ],
  }),
  component: AdminNegociacoesPage,
});

function AdminNegociacoesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-negociacoes"],
    queryFn: async () => (await listarNegociacoesAdminFn({ data: undefined })) as any,
    refetchInterval: 30000,
  });

  const salvarPrazo = useMutation({
    mutationFn: (horas: number) => salvarPrazoPagamentoFn({ data: horas }),
    onSuccess: () => {
      toast.success("Prazo de pagamento atualizado.");
      queryClient.invalidateQueries({ queryKey: ["admin-negociacoes"] });
    },
    onError: (e: any) => toast.error(e?.message || "Não foi possível salvar o prazo."),
  });

  if (isLoading) return <div className="p-8 text-slate-500">Carregando negociações...</div>;

  const lista: any[] = data?.lista || [];
  const indicadores = data?.indicadores || {};
  const semVenda: any[] = data?.semVenda || [];
  const agora = data?.servidor_agora;

  const filtrar = (status?: string) => (status ? lista.filter((n) => n.status === status) : lista);

  const Tabela = ({ linhas }: { linhas: any[] }) => (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Código</TableHead>
            <TableHead>Veículo</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Comprador</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Prazo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-12 text-center text-sm font-medium italic text-slate-400">
                Nenhuma negociação nesta condição.
              </TableCell>
            </TableRow>
          ) : (
            linhas.map((n) => (
              <TableRow key={n.id}>
                <TableCell className="font-mono text-xs font-bold">{n.codigo}</TableCell>
                <TableCell className="font-bold text-slate-800">{n.titulo}</TableCell>
                <TableCell className="text-sm text-slate-600">{n.vendedor_nome}</TableCell>
                <TableCell className="text-sm text-slate-600">{n.comprador_nome}</TableCell>
                <TableCell className="font-mono font-bold text-teal-700">{brl(n.valor_venda)}</TableCell>
                <TableCell className="text-xs">{format(new Date(n.criado_em), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                <TableCell className="text-xs">
                  {n.status === "AGUARDANDO_PAGAMENTO" ? (
                    <PrazoPagamento compacto prazo={n.prazo_pagamento_em} servidorAgora={agora} />
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_CLASSE[n.status]}>{STATUS_LABEL[n.status]}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" className="gap-2" onClick={() => navigate({ to: "/admin/negociacao/$id", params: { id: n.id } })}>
                    <Eye className="h-4 w-4" /> Ver negociação
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">Negociações</h1>
        <p className="text-slate-500">Fechamento dos lances, vencedores confirmados e prazos de pagamento.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-slate-500">Aguardando pagamento</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black text-amber-600">{indicadores.aguardando_pagamento || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-slate-500">Pagamentos vencidos</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black text-red-600">{indicadores.pagamentos_vencidos || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-slate-500">Prazo para pagamento do vencedor</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Select defaultValue={String(data?.prazoHoras || 24)} onValueChange={(v) => salvarPrazo.mutate(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2, 6, 12, 24].map((h) => (
                  <SelectItem key={h} value={String(h)}>{h} horas</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Clock className="h-4 w-4 text-slate-400" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="todas">
        <TabsList className="bg-slate-100 p-1">
          <TabsTrigger value="todas">Todas</TabsTrigger>
          <TabsTrigger value="aguardando">Aguardando pagamento</TabsTrigger>
          <TabsTrigger value="vencidos">Pagamentos vencidos</TabsTrigger>
          <TabsTrigger value="sem-venda">Encerrados sem venda</TabsTrigger>
        </TabsList>

        <TabsContent value="todas" className="mt-6"><Tabela linhas={filtrar()} /></TabsContent>
        <TabsContent value="aguardando" className="mt-6"><Tabela linhas={filtrar("AGUARDANDO_PAGAMENTO")} /></TabsContent>
        <TabsContent value="vencidos" className="mt-6"><Tabela linhas={filtrar("PAGAMENTO_NAO_REALIZADO")} /></TabsContent>

        <TabsContent value="sem-venda" className="mt-6">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Veículo</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Maior oferta recebida</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Encerrado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {semVenda.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-sm font-medium italic text-slate-400">
                      Nenhum lance encerrado sem venda.
                    </TableCell>
                  </TableRow>
                ) : (
                  semVenda.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-bold text-slate-800">{r.titulo}</TableCell>
                      <TableCell className="font-mono text-xs">{r.codigo_publico}</TableCell>
                      <TableCell className="font-mono font-bold text-slate-700">
                        {r.maior_lance ? brl(r.maior_lance) : "Sem ofertas"}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-slate-200 text-slate-700">
                          {r.resultado === "ENCERRADO_SEM_OFERTAS" ? "Encerrado sem ofertas" : "Encerrado sem atingir o mínimo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{format(new Date(r.fechado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <div className="flex flex-wrap gap-3 border-t border-slate-100 bg-slate-50 p-4">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <AlertTriangle className="h-3.5 w-3.5" /> Ações futuras
              </span>
              <Badge variant="outline">Consultar vendedor</Badge>
              <Badge variant="outline">Preparar nova rodada</Badge>
              <Badge variant="outline">Encerrar sem venda</Badge>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
