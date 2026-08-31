import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarVendedoresFn } from "@/lib/vendedores-compliance.functions";
import { useEffect, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import { WizardPreCadastro } from "@/components/vendedor/WizardPreCadastro";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { cn, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/admin/vendedores")({
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: VendedoresPage,
});

const STATUS_CONFIG: Record<string, { label: string, color: string, bg: string }> = {
  'AGUARDANDO_ANALISE': { label: 'Aguardando Análise', color: 'text-amber-600', bg: 'bg-amber-500' },
  'EM_ANALISE': { label: 'Em análise', color: 'text-blue-600', bg: 'bg-blue-500' },
  'PENDENCIA': { label: 'Pendência', color: 'text-red-600', bg: 'bg-red-500' },
  'APROVADO': { label: 'Aprovado', color: 'text-teal-600', bg: 'bg-teal-500' },
  'REPROVADO': { label: 'Reprovado', color: 'text-slate-600', bg: 'bg-slate-500' },
  'NAO_ENVIADO': { label: 'Não Enviado', color: 'text-slate-400', bg: 'bg-slate-400' },
  'BLOQUEADO': { label: 'Bloqueado', color: 'text-red-700', bg: 'bg-red-700' },
};

function VendedoresPage() {
  const search = Route.useSearch();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string | undefined>(search.status);

  useEffect(() => {
    setFiltroStatus(search.status);
  }, [search.status]);
  
  const loadVendedores = useServerFn(listarVendedoresFn);
  const { data: res, isLoading } = useQuery({
    queryKey: ["admin-vendedores", busca, filtroStatus],
    queryFn: () => loadVendedores({ data: { busca, status: filtroStatus } })
  });

  const vendedores = res?.data || [];

  const maskCPF = (cpf: string) => {
    if (!cpf) return "***.***.***-**";
    return `***.***.***-${cpf.slice(-2)}`;
  };

  const maskPhone = (phone: string) => {
    if (!phone) return "(**) *****-****";
    return `(${phone.slice(0, 2)}) *****-${phone.slice(-4)}`;
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Vendedores</h1>
          <p className="text-slate-500 font-medium">Gestão de cadastro e compliance da rede Esse Já Foi.</p>
        </div>
        <WizardPreCadastro />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por nome, CPF, telefone ou e-mail" 
              className="pl-10 h-11 bg-white border-slate-200"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            {[
              { label: 'Todos', value: undefined },
              { label: 'Aguardando análise', value: 'AGUARDANDO_ANALISE' },
              { label: 'Em análise', value: 'EM_ANALISE' },
              { label: 'Pendência', value: 'PENDENCIA' },
              { label: 'Aprovados', value: 'APROVADO' },
              { label: 'Reprovados', value: 'REPROVADO' },
            ].map((f) => (
              <Button
                key={f.label}
                variant={filtroStatus === f.value ? "default" : "outline"}
                size="sm"
                className={cn(
                  "whitespace-nowrap font-bold text-xs",
                  filtroStatus === f.value ? "bg-teal-500 hover:bg-teal-600 text-slate-950 border-teal-500" : "text-slate-500 border-slate-200"
                )}
                onClick={() => setFiltroStatus(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow className="hover:bg-transparent border-slate-200">
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4">Vendedor</TableHead>
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4">CPF</TableHead>
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4">Contato</TableHead>
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4">Compliance</TableHead>
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4 text-center">Veículos</TableHead>
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4">Atualização</TableHead>
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="animate-pulse">
                  <TableCell colSpan={7} className="h-16 bg-slate-50/50" />
                </TableRow>
              ))
            ) : vendedores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-400 font-medium italic">
                  Nenhum vendedor encontrado com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : (
              vendedores.map((v: any) => (
                <TableRow key={v.id} className="hover:bg-slate-50 transition-colors border-slate-100">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900">{v.nome}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">VEN-{v.id.split('-')[0].toUpperCase()}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium text-slate-500">{maskCPF(v.cpf)}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-slate-900">{maskPhone(v.whatsapp)}</span>
                      <span className="text-[10px] text-slate-400">{v.email || 'Sem e-mail'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        v.compliance_status ? STATUS_CONFIG[v.compliance_status]?.bg : 'bg-amber-500'
                      )} />
                      <span className={cn(
                        "text-xs font-bold",
                        v.compliance_status ? STATUS_CONFIG[v.compliance_status]?.color : 'text-amber-600'
                      )}>
                        {v.compliance_status ? STATUS_CONFIG[v.compliance_status]?.label : 'Aguardando Análise'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-black text-slate-950 text-sm">
                    {v.total_veiculos}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-slate-700">{formatDate(v.criado_em)}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{v.responsavel_nome || 'Não atribuído'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to="/admin/vendedor/$id" params={{ id: v.id }}>
                      <Button variant="ghost" size="sm" className="text-teal-600 font-bold text-xs group">
                        Ver cadastro <ChevronRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
