import { createFileRoute } from "@tanstack/react-router";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRelatoriosGeraisFn, getRelatoriosVendasFn, getRelatorioComissoesFn } from "@/lib/relatorios.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  BarChart3, 
  TrendingUp, 
  Car, 
  Gavel, 
  DollarSign, 
  Settings2,
  Calendar,
  Download
} from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/admin/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const [periodo, setPeriodo] = useState("30d");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");

  useEffect(() => {
    const agora = new Date();
    let inicio = new Date();

    if (periodo === "hoje") {
      inicio.setHours(0, 0, 0, 0);
    } else if (periodo === "7d") {
      inicio.setDate(agora.getDate() - 7);
    } else if (periodo === "30d") {
      inicio.setDate(agora.getDate() - 30);
    } else if (periodo === "mes") {
      inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
    } else if (periodo === "ano") {
      inicio = new Date(agora.getFullYear(), 0, 1);
    }

    if (periodo !== "custom") {
      setDataInicio(inicio.toISOString().split("T")[0] || "");
      setDataFim(agora.toISOString().split("T")[0] || "");
    }
  }, [periodo]);

  const getGerais = useServerFn(getRelatoriosGeraisFn);

  const { data: gerais, isLoading: loadingGerais } = useQuery({
    queryKey: ["relatorios-gerais", { dataInicio, dataFim }],
    queryFn: () => getGerais({ data: { dataInicio, dataFim } }),
    enabled: !!dataInicio && !!dataFim
  });

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-950 uppercase tracking-tight">Relatórios</h1>
          <p className="text-slate-500 font-medium">Acompanhe os principais indicadores da operação do Esse Já Foi.</p>
        </div>

        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
          <Calendar className="h-4 w-4 text-slate-400 ml-2" />
          <select 
            className="bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
          >
            <option value="hoje">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="mes">Este mês</option>
            <option value="ano">Este ano</option>
            <option value="custom">Personalizado</option>
          </select>
          {periodo === "custom" && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-100">
              <Input type="date" className="h-8 text-xs" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              <Input type="date" className="h-8 text-xs" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              <Button size="sm" className="h-8 px-3 text-xs bg-teal-600">Aplicar</Button>
            </div>
          )}
          <Button variant="ghost" size="sm" className="ml-2 text-slate-400 hover:text-teal-600">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="geral" className="w-full">
        <TabsList className="bg-slate-100 p-1 flex-wrap h-auto mb-6">
          <TabsTrigger value="geral" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="vendas" className="gap-2">
            <TrendingUp className="h-4 w-4" /> Vendas
          </TabsTrigger>
          <TabsTrigger value="comissoes" className="gap-2">
            <DollarSign className="h-4 w-4" /> Comissões
          </TabsTrigger>
          <TabsTrigger value="veiculos" className="gap-2">
            <Car className="h-4 w-4" /> Veículos
          </TabsTrigger>
          <TabsTrigger value="leiloes" className="gap-2">
            <Gavel className="h-4 w-4" /> Leilões
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="gap-2">
            <DollarSign className="h-4 w-4" /> Financeiro
          </TabsTrigger>
          <TabsTrigger value="operacional" className="gap-2">
            <Settings2 className="h-4 w-4" /> Operacional
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Veículos Cadastrados" value={gerais?.data?.overview?.veiculos_cadastrados} loading={loadingGerais} />
            <StatCard label="Veículos Aprovados" value={gerais?.data?.overview?.veiculos_aprovados} loading={loadingGerais} />
            <StatCard label="Vendas Concluídas" value={gerais?.data?.overview?.vendas_concluidas} loading={loadingGerais} />
            <StatCard label="Volume Vendido" value={gerais?.data?.overview?.volume_vendido} isCurrency loading={loadingGerais} />
          </div>

          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Funil da Operação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col space-y-4">
                <FunnelStep label="Cadastrados" value={gerais?.data?.funnel?.cadastrados} total={gerais?.data?.funnel?.cadastrados} />
                <FunnelStep label="Em Análise" value={gerais?.data?.funnel?.em_analise} total={gerais?.data?.funnel?.cadastrados} />
                <FunnelStep label="Aprovados Vistoria" value={gerais?.data?.funnel?.aprovados_vistoria} total={gerais?.data?.funnel?.cadastrados} />
                <FunnelStep label="Vistoriados" value={gerais?.data?.funnel?.vistoriados} total={gerais?.data?.funnel?.cadastrados} />
                <FunnelStep label="Prontos Anúncio" value={gerais?.data?.funnel?.prontos_anuncio} total={gerais?.data?.funnel?.cadastrados} />
                <FunnelStep label="Publicados" value={gerais?.data?.funnel?.publicados} total={gerais?.data?.funnel?.cadastrados} />
                <FunnelStep label="Com Vencedor" value={gerais?.data?.funnel?.com_vencedor} total={gerais?.data?.funnel?.cadastrados} />
                <FunnelStep label="Concluídos" value={gerais?.data?.funnel?.concluidos} total={gerais?.data?.funnel?.cadastrados} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendas" className="space-y-8">
          <SalesTab dataInicio={dataInicio} dataFim={dataFim} />
        </TabsContent>

        <TabsContent value="comissoes" className="space-y-8">
          <ComissoesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SalesTab({ dataInicio, dataFim }: { dataInicio: string, dataFim: string }) {
  const getVendas = useServerFn(getRelatoriosVendasFn);

  const { data, isLoading } = useQuery({
    queryKey: ["relatorios-vendas", { dataInicio, dataFim }],
    queryFn: () => getVendas({ data: { dataInicio, dataFim } }),
    enabled: !!dataInicio && !!dataFim
  });

  const stats = data?.data?.stats || {};
  const lista = data?.data?.lista || [];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Vendas Concluídas" value={stats.total_vendas} loading={isLoading} />
        <StatCard label="Valor Total Vendido" value={stats.volume_total} isCurrency loading={isLoading} />
        <StatCard label="Ticket Médio" value={stats.ticket_medio} isCurrency loading={isLoading} />
        <StatCard label="Comissão Total" value={stats.comissao_total} isCurrency loading={isLoading} />
      </div>

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Últimas Negociações Concluídas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Data</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead className="text-right">Valor Venda</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center p-8 text-slate-400">Carregando...</TableCell></TableRow>
              ) : lista.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center p-8 text-slate-400">Nenhuma venda no período.</TableCell></TableRow>
              ) : lista.map((item: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{formatDate(item.criado_em)}</TableCell>
                  <TableCell className="font-mono text-xs">{item.codigo}</TableCell>
                  <TableCell className="font-bold text-xs">{item.veiculo}</TableCell>
                  <TableCell className="text-xs">{item.vendedor_nome}</TableCell>
                  <TableCell className="text-xs">{item.comprador_nome}</TableCell>
                  <TableCell className="text-right font-bold text-xs">{formatCurrency(Number(item.valor_venda))}</TableCell>
                  <TableCell className="text-right font-bold text-xs text-teal-600">{formatCurrency(Number(item.valor_comissao))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, isCurrency, loading }: any) {
  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="p-6">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-slate-950 mt-1">
          {loading ? "..." : (isCurrency ? formatCurrency(Number(value || 0)) : value || 0)}
        </p>
      </CardContent>
    </Card>
  );
}

function FunnelStep({ label, value, total }: any) {
  const percent = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-900">{value} ({percent.toFixed(1)}%)</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ComissoesTab() {
  const carregar = useServerFn(getRelatorioComissoesFn);

  const { data, isLoading } = useQuery({
    queryKey: ["relatorio-comissoes"],
    queryFn: () => carregar(),
  });

  const resumo = data?.ok ? data.data?.resumo : undefined;
  const lista: any[] = (data?.ok ? data.data?.lista : []) || [];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="A receber neste mês" value={resumo?.comissao_a_receber_mes} isCurrency loading={isLoading} />
        <StatCard label="Recebido neste mês" value={resumo?.comissao_recebida_mes} isCurrency loading={isLoading} />
        <StatCard label="Total a receber" value={resumo?.comissao_a_receber} isCurrency loading={isLoading} />
        <StatCard label="Total recebido" value={resumo?.comissao_recebida_total} isCurrency loading={isLoading} />
      </div>

      <Card className="border-slate-200 shadow-none">
        <CardContent className="p-4">
          <p className="text-xs text-slate-500">
            O percentual padrão de comissão é configurado em <strong>Admin &rarr; Configurações &rarr; Comissão da plataforma</strong> e pode ser ajustado caso a caso no fechamento comercial de cada veículo.
            Comissão prevista em propostas ativas: <strong>{formatCurrency(Number(resumo?.comissao_prevista || 0))}</strong> em {resumo?.qtd_veiculos || 0} veículo(s).
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">Comissões por venda</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Data</TableHead>
                <TableHead>Negociação</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Regra</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Venda</TableHead>
                <TableHead className="text-right">Comissão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center p-8 text-slate-400">Carregando...</TableCell></TableRow>
              ) : lista.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center p-8 text-slate-400">Nenhuma comissão registrada ainda.</TableCell></TableRow>
              ) : lista.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{formatDate(item.concluido_em || item.criado_em)}</TableCell>
                  <TableCell className="font-mono text-xs">{item.negociacao_codigo}</TableCell>
                  <TableCell className="font-bold text-xs">{item.veiculo || "—"}</TableCell>
                  <TableCell className="text-xs">{item.vendedor_nome || "—"}</TableCell>
                  <TableCell className="text-xs">{item.comissao_regra || "—"}</TableCell>
                  <TableCell>
                    <span className={cn(
                      "text-[10px] font-black uppercase px-2 py-1 rounded-full",
                      item.status === "CONCLUIDO" ? "bg-teal-50 text-teal-700" : "bg-amber-50 text-amber-700"
                    )}>
                      {item.status === "CONCLUIDO" ? "Recebida" : "A receber"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-bold text-xs">{formatCurrency(Number(item.valor_venda))}</TableCell>
                  <TableCell className="text-right font-bold text-xs text-teal-600">{formatCurrency(Number(item.valor_comissao))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
