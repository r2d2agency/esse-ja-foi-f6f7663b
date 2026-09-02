import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVeiculosAdminFn } from "@/lib/admin-veiculos.functions";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronRight, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/veiculos")({
  validateSearch: (search: Record<string, unknown>): { status?: string } => ({
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: AdminVeiculosPage,
});

function AdminVeiculosPage() {
  const search = Route.useSearch();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState(search.status || "TODOS");

  useEffect(() => {
    setStatus(search.status || "TODOS");
  }, [search.status]);
  
  const getVeiculos = useServerFn(getVeiculosAdminFn);
  const { data: res, isLoading } = useQuery({
    queryKey: ["admin-veiculos", { busca, status }],
    queryFn: () => getVeiculos({ data: { busca, status_analise: status === "TODOS" ? undefined : status } })
  });

  const veiculos = res?.data || [];
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
          <Button variant="outline" className="h-11 border-slate-200 text-slate-600 font-bold">
            <Filter className="mr-2 h-4 w-4" /> Filtros Avançados
          </Button>
        </div>
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
                  <tr key={v.id} className="hover:bg-slate-50/80 transition-colors group">
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
                      <Button 
                        asChild
                        variant="ghost" 
                        size="sm" 
                        className="font-black text-[10px] uppercase tracking-wider text-slate-400 hover:text-teal-600 hover:bg-teal-50"
                      >
                        <Link to="/admin/veiculo/$id" params={{ id: v.id }}>
                          Analisar <ChevronRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
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

