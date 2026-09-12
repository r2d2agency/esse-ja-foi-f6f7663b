import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVeiculosAdminFn } from "@/lib/admin-veiculos.functions";
import { removerVeiculoFn } from "@/lib/cadastro.functions";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronRight, Filter, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/veiculos")({
  validateSearch: (search: Record<string, unknown>): { status?: string } => ({
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: AdminVeiculosPage,
});

function AdminVeiculosPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState(search.status || "TODOS");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const FILTROS_INICIAIS = { marca: "", anoMin: "", anoMax: "", kmMax: "", blindado: "TODOS", dataInicio: "", dataFim: "" };
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);

  useEffect(() => {
    setStatus(search.status || "TODOS");
  }, [search.status]);

  const filtrosAtivos = Object.values(filtros).filter((valor) => valor && valor !== "TODOS").length;

  const getVeiculos = useServerFn(getVeiculosAdminFn);
  const removerVeiculo = useServerFn(removerVeiculoFn);
  const { data: res, isLoading, refetch } = useQuery({
    queryKey: ["admin-veiculos", { busca, status, filtros }],
    queryFn: () => getVeiculos({
      data: {
        busca,
        status_analise: status === "TODOS" ? undefined : status,
        marca: filtros.marca || undefined,
        ano_min: filtros.anoMin ? Number(filtros.anoMin) : undefined,
        ano_max: filtros.anoMax ? Number(filtros.anoMax) : undefined,
        km_max: filtros.kmMax ? Number(filtros.kmMax) : undefined,
        blindado: filtros.blindado === "TODOS" ? undefined : (filtros.blindado as "SIM" | "NAO"),
        data_inicio: filtros.dataInicio ? new Date(filtros.dataInicio).toISOString() : undefined,
        data_fim: filtros.dataFim ? new Date(`${filtros.dataFim}T23:59:59`).toISOString() : undefined,
      },
    })
  });

  const veiculos = res?.data || [];

  async function handleExcluir(id: string, rotulo: string) {
    if (!window.confirm(`Excluir "${rotulo}" permanentemente? Essa ação não pode ser desfeita.`)) return;
    const toastId = toast.loading("Excluindo veículo...");
    try {
      const resp = await removerVeiculo({ data: { id } });
      if (resp.ok) {
        toast.success("Veículo excluído.", { id: toastId });
        refetch();
      } else {
        toast.error(resp.message || "Não foi possível excluir o veículo.", { id: toastId });
      }
    } catch {
      toast.error("Erro técnico ao excluir o veículo.", { id: toastId });
    }
  }
  const complianceLabel = (status?: string) => {
    if (!status) return "Sem compliance";
    return status.replaceAll("_", " ");
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-4 md:p-8 space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Análise de Veículos</h1>
            <p className="text-sm text-slate-500 font-medium">Gerenciamento e aprovação inicial de novos veículos cadastrados.</p>
          </div>
          <div className="flex gap-2 bg-slate-100 p-1 rounded-lg overflow-x-auto">
            {[
              { id: "TODOS", label: "Todos" },
              { id: "AGUARDANDO_ANALISE", label: "Aguardando" },
              { id: "EM_ANALISE", label: "Em análise" },
              { id: "PRONTO_PARA_VISTORIA", label: "Prontos" }
            ].map((s) => (
              <button
                key={s.id}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-black uppercase transition-all whitespace-nowrap shrink-0",
                  status === s.id ? "bg-white text-teal-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
                onClick={() => setStatus(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por placa, marca, modelo ou vendedor..."
              className="pl-10 h-11 bg-slate-50 border-slate-200 focus:bg-white transition-all font-medium"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className={cn("h-11 border-slate-200 font-bold", filtrosAbertos ? "bg-teal-50 text-teal-700 border-teal-200" : "text-slate-600")}
            onClick={() => setFiltrosAbertos((v) => !v)}
          >
            <Filter className="mr-2 h-4 w-4" /> Filtros Avançados
            {filtrosAtivos > 0 && (
              <span className="ml-2 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] text-white">{filtrosAtivos}</span>
            )}
          </Button>
        </div>

        {filtrosAbertos && (
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Marca</label>
              <Input
                className="h-10 bg-white"
                placeholder="Ex.: Honda"
                value={filtros.marca}
                onChange={(e) => setFiltros((f) => ({ ...f, marca: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Ano de</label>
              <Input
                className="h-10 bg-white"
                inputMode="numeric"
                placeholder="2015"
                value={filtros.anoMin}
                onChange={(e) => setFiltros((f) => ({ ...f, anoMin: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Ano até</label>
              <Input
                className="h-10 bg-white"
                inputMode="numeric"
                placeholder="2024"
                value={filtros.anoMax}
                onChange={(e) => setFiltros((f) => ({ ...f, anoMax: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">KM até</label>
              <Input
                className="h-10 bg-white"
                inputMode="numeric"
                placeholder="100000"
                value={filtros.kmMax}
                onChange={(e) => setFiltros((f) => ({ ...f, kmMax: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Blindado</label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={filtros.blindado}
                onChange={(e) => setFiltros((f) => ({ ...f, blindado: e.target.value }))}
              >
                <option value="TODOS">Todos</option>
                <option value="SIM">Somente blindados</option>
                <option value="NAO">Somente não blindados</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="ghost"
                className="h-10 w-full text-slate-500 font-bold"
                onClick={() => setFiltros(FILTROS_INICIAIS)}
                disabled={filtrosAtivos === 0}
              >
                <X className="mr-2 h-4 w-4" /> Limpar filtros
              </Button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Cadastrado de</label>
              <Input
                type="date"
                className="h-10 bg-white"
                value={filtros.dataInicio}
                onChange={(e) => setFiltros((f) => ({ ...f, dataInicio: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400">Cadastrado até</label>
              <Input
                type="date"
                className="h-10 bg-white"
                value={filtros.dataFim}
                onChange={(e) => setFiltros((f) => ({ ...f, dataFim: e.target.value }))}
              />
            </div>
          </div>
        )}
      </div>

      <div className="p-4 md:p-8 flex-1 overflow-auto">
        <Card className="border-slate-200 shadow-none overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Veículo</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Dados Técnicos</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Vendedor</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Status Análise</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Última Ação</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 animate-pulse font-bold">Carregando veículos...</td></tr>
              ) : veiculos.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold">Nenhum veículo encontrado para os filtros selecionados.</td></tr>
              ) : (
                veiculos.map((v: any) => (
                  <tr
                    key={v.id}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => navigate({ to: "/admin/veiculo/$id", params: { id: v.id } })}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-black text-slate-950 uppercase group-hover:text-teal-600 transition-colors">{v.marca} {v.modelo}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">ID: VEI-{v.id.substring(0,6).toUpperCase()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px] py-0 h-5 border-slate-200">{v.placa}</Badge>
                          <span className="text-xs font-bold text-slate-600">{v.ano_modelo || 'N/A'}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{v.cor || 'Cor N/I'} • {v.km ? `${v.km.toLocaleString()} km` : 'KM N/I'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 border border-slate-200">
                          {v.vendedor_nome?.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">{v.vendedor_nome}</span>
                          <span className={cn(
                            "text-[9px] font-black uppercase",
                            v.compliance_status === 'APROVADO' ? "text-green-600" : "text-amber-600"
                          )}>
                            {complianceLabel(v.compliance_status)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={cn(
                        "uppercase font-black text-[9px] px-2 py-0.5 h-5",
                        v.status_analise === 'PRONTO_PARA_VISTORIA' ? "bg-green-100 text-green-700 border-green-200 hover:bg-green-100" :
                        v.status_analise === 'AGUARDANDO_ANALISE' ? "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100" :
                        "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100"
                      )}>
                        {v.status_analise.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{format(new Date(v.atualizado_em), "dd MMM, HH:mm", { locale: ptBR })}</span>
                        {v.responsavel_nome && (
                          <span className="text-[9px] font-black text-slate-400 uppercase">Por: {v.responsavel_nome}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-300 hover:bg-red-50 hover:text-red-600"
                          title="Excluir veículo"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExcluir(v.id, `${v.marca} ${v.modelo} — ${v.placa}`);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-teal-600 transition-colors" />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

