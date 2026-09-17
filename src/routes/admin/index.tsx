import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminDashboardDataFn } from "@/lib/admin-dashboard.functions";
import { 
  Users, 
  ShieldCheck, 
  Car, 
  Camera, 
  ChevronRight,
  Clock,
  ArrowRight,
  Calendar
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { listarNegociacoesAdminFn } from "@/lib/negociacoes.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Visão Geral | ESSE JÁ FOI" }
    ],
  }),

  component: AdminDashboard,
});

function AdminDashboard() {
  const loadData = useServerFn(getAdminDashboardDataFn);
  const { data: res, isLoading } = useQuery({ 
    queryKey: ["admin-dashboard"], 
    queryFn: () => loadData() 
  });

  const dashboard = res?.data;

  const stats = [
    { label: "Em compliance", value: dashboard?.stats?.compliance_analise ?? 0, icon: Users, color: "text-violet-600", bg: "bg-violet-50", to: "/admin/vendedores", search: { status: "AGUARDANDO_ANALISE" } },
    { label: "Triagem de veículos", value: dashboard?.stats?.veiculos_analise ?? 0, icon: Car, color: "text-blue-600", bg: "bg-blue-50", to: "/admin/veiculos", search: { status: "AGUARDANDO_ANALISE" } },
    { label: "Prontos para vistoria", value: dashboard?.stats?.prontos_vistoria ?? 0, icon: Camera, color: "text-amber-600", bg: "bg-amber-50", to: "/admin/veiculos", search: { status: "PRONTO_PARA_VISTORIA" } },
    { label: "Vistorias de hoje", value: dashboard?.stats?.vistorias_hoje ?? 0, icon: Calendar, color: "text-teal-600", bg: "bg-teal-50", to: "/admin/vistorias", search: { tab: "agendamentos" } },
    { label: "Aguardando confirmação", value: dashboard?.stats?.aguardando_confirmacao ?? 0, icon: Clock, color: "text-orange-600", bg: "bg-orange-50", to: "/admin/vistorias", search: { tab: "agendamentos", status: "AGUARDANDO_CONFIRMACAO" } },
    { label: "Compradores ativos", value: dashboard?.stats?.clientes ?? 0, icon: ShieldCheck, color: "text-green-600", bg: "bg-green-50", to: "/admin/compradores" },
  ];

  const funnel = [
    { label: "Entrada", value: dashboard?.funnel?.cadastro ?? 0 },
    { label: "Compliance", value: dashboard?.funnel?.compliance ?? 0 },
    { label: "Contrato", value: dashboard?.funnel?.contrato ?? 0 },
    { label: "Triagem", value: dashboard?.funnel?.analise_veiculo ?? 0 },
    { label: "Vistoria", value: dashboard?.funnel?.vistoria ?? 0 },
    { label: "Vitrine", value: dashboard?.funnel?.anuncio ?? 0 },
    { label: "Fechamento", value: dashboard?.funnel?.venda ?? 0 },
  ];

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">

      <div>
        <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Visão geral</h1>
        <p className="text-slate-500 font-medium">Acompanhe o fluxo operacional do cadastro até a comercialização do veículo.</p>
      </div>

      {/* Indicadores Compactos */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            to={(stat as any).to ?? "/admin"}
            search={(stat as any).search}
            className="flex flex-col p-4 bg-white border border-slate-200 rounded-xl hover:border-teal-500 transition-all text-left group"
          >
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3 transition-colors", stat.bg)}>
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </div>
            <p className="text-2xl font-black text-slate-950">{isLoading ? "..." : stat.value}</p>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">{stat.label}</p>
          </Link>
        ))}
      </div>

      <IndicadoresNegociacao />

      <section className="space-y-4">
        <h2 className="text-sm font-black text-slate-950 uppercase tracking-wider">Etapas da operação</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Compliance",
              description: "Validação de vendedor, comprador, documentos e triagem inicial do veículo.",
              links: [
                { label: "Vendedores", to: "/admin/vendedores", search: { status: "AGUARDANDO_ANALISE" } },
                { label: "Veículos", to: "/admin/veiculos", search: { status: "AGUARDANDO_ANALISE" } },
                { label: "Compradores", to: "/admin/compradores" },
              ],
            },
            {
              title: "Vistoria",
              description: "Agendamento, execução física e análise dos laudos de avaliação.",
              links: [
                { label: "Agenda e laudos", to: "/admin/vistorias", search: { tab: "agendamentos" } },
                { label: "Prontos para vistoria", to: "/admin/veiculos", search: { status: "PRONTO_PARA_VISTORIA" } },
              ],
            },
            {
              title: "Comercial",
              description: "Campanhas, lances, negociações, pagamentos e entrega do veículo.",
              links: [
                { label: "Campanhas", to: "/admin/comunicacoes" },
                { label: "Lances", to: "/admin/leiloes" },
                { label: "Negociações", to: "/admin/negociacoes" },
              ],
            },
          ].map((section) => (
            <Card key={section.title} className="border-slate-200 shadow-none">
              <CardContent className="p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-950">{section.title}</h3>
                  <p className="mt-2 text-sm text-slate-500">{section.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {section.links.map((link) => (
                    <Link
                      key={link.label}
                      to={link.to as any}
                      search={link.search as any}
                      className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Funil Operacional */}

      <section className="space-y-4">
        <h2 className="text-sm font-black text-slate-950 uppercase tracking-wider flex items-center gap-2">
          Funil da operação
        </h2>
        <div className="bg-white border border-slate-200 rounded-xl p-6 overflow-x-auto">
          <div className="flex items-center min-w-[800px]">
            {funnel.map((step, idx) => (
              <div key={step.label} className="flex-1 flex items-center">
                <div className="flex flex-col items-center flex-1">
                  <span className="text-xl font-black text-teal-600">{isLoading ? "-" : step.value}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-1 text-center">{step.label}</span>
                </div>
                {idx < funnel.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-slate-300 mx-2 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Atenção e Fila */}
        <div className="space-y-8">
          <section className="space-y-4">
            <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider">Precisa da sua atenção</h3>
            <Card className="border-slate-200 shadow-none overflow-hidden">
              <CardContent className="p-0 divide-y divide-slate-100">
                {[
                  { label: "Cadastros de vendedor em compliance", count: dashboard?.stats?.compliance_analise ?? 0, to: "/admin/vendedores", search: { status: "AGUARDANDO_ANALISE" } },
                  { label: "Veículos aguardando triagem documental", count: dashboard?.stats?.veiculos_analise ?? 0, to: "/admin/veiculos", search: { status: "AGUARDANDO_ANALISE" } },
                  { label: "Contratos pendentes de assinatura", count: dashboard?.stats?.contratos_pendentes ?? 0, to: "/admin/contratos", search: { status: "PENDENTES" } },
                ].map((item, idx) => (
                  <Link
                    key={idx}
                    to={(item as any).to || "/admin"}
                    search={(item as any).search}
                    className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors group"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-700">{item.label}</p>
                      <p className="text-xs text-slate-400 font-medium">{item.count} pendências</p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-teal-600 font-bold text-xs group-hover:bg-teal-50">
                      Ver fila <ChevronRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider">Filas rápidas</h3>
            <Card className="border-slate-200 shadow-none">
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Compliance</p>
                    <p className="text-xl font-black text-slate-950 mt-1">{dashboard?.stats?.compliance_analise ?? 0} cadastros</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Triagem</p>
                    <p className="text-xl font-black text-slate-950 mt-1">{dashboard?.stats?.veiculos_analise ?? 0} veículos</p>
                  </div>
                </div>
                <Button asChild className="w-full bg-slate-950 hover:bg-slate-900 text-white font-bold py-6">
                  <Link to="/admin/vendedores" search={{ status: "AGUARDANDO_ANALISE" }}>Abrir etapa de compliance</Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Atividade Recente */}
        <section className="space-y-4">
          <h3 className="text-sm font-black text-slate-950 uppercase tracking-wider">Atividade recente</h3>
          <Card className="border-slate-200 shadow-none">
            <CardContent className="p-6">
              <div className="space-y-6 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-100">
                {(dashboard?.activity ?? []).map((log: any, idx: number) => (
                  <div key={idx} className="relative pl-8 group">
                    <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 border-white bg-slate-200 group-hover:bg-teal-500 transition-colors z-10" />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-400">{formatDate(log.criado_em)}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">{log.entidade}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-700">{log.acao}</p>
                      <p className="text-xs text-slate-500">{log.detalhe}</p>
                      {log.usuario && (
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                          <Users className="h-3 w-3" />
                          <span>Responsável: {log.usuario}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {(!dashboard?.activity || dashboard.activity.length === 0) && (
                  <p className="text-sm text-slate-400 italic py-4 text-center">Nenhuma atividade recente.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function IndicadoresNegociacao() {
  const { data } = useQuery({
    queryKey: ["admin-indicadores-negociacao"],
    queryFn: async () => (await listarNegociacoesAdminFn({ data: undefined })) as any,
    refetchInterval: 60000,
  });
  const ind = data?.indicadores || {};
  const cards = [
    { label: "Aguardando pagamento", value: ind.aguardando_pagamento ?? 0, cor: "text-amber-600" },
    { label: "Pagamentos vencidos", value: ind.pagamentos_vencidos ?? 0, cor: "text-red-600" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      {cards.map((c) => (
        <Link
          key={c.label}
          to="/admin/negociacoes"
          className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-teal-500"
        >
          <p className={cn("text-2xl font-black", c.cor)}>{c.value}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{c.label}</p>
        </Link>
      ))}
    </div>
  );
}
