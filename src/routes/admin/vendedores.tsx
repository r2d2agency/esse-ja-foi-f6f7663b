import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarVendedoresFn } from "@/lib/vendedores-compliance.functions";
import { useEffect, useState } from "react";
import { Search, ChevronRight, UserPlus, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getSessionToken } from "@/lib/session";
import { criarVendedorInternoFn } from "@/lib/pre-cadastro.functions";
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
        <PreCadastroDialog />
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

function PreCadastroDialog() {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string; emailEnviado: boolean } | null>(null);
  const [form, setForm] = useState({
    nome: "",
    email: "",
    cpf: "",
    cnpj: "",
    whatsapp: "",
    cidade: "",
    uf: "",
  });

  async function salvar() {
    if (form.nome.trim().length < 3) return toast.error("Informe o nome completo.");
    if (!form.email.includes("@")) return toast.error("Informe um e-mail válido.");
    setSalvando(true);
    try {
      const res: any = await criarVendedorInternoFn({
        data: { token: getSessionToken(), ...form },
      });
      if (!res?.ok) return toast.error(res?.message || "Não foi possível criar o vendedor.");
      setSenhaGerada({
        email: form.email,
        senha: res.senha,
        emailEnviado: !!res.emailEnviado,
      });
      toast.success("Vendedor criado com senha temporária.");
    } finally {
      setSalvando(false);
    }
  }

  function fechar() {
    setAberto(false);
    setSenhaGerada(null);
    setForm({ nome: "", email: "", cpf: "", cnpj: "", whatsapp: "", cidade: "", uf: "" });
    window.location.reload();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v: boolean) => (v ? setAberto(true) : fechar())}>
      <DialogTrigger asChild>
        <Button className="h-11 bg-teal-600 font-bold hover:bg-teal-700">
          <UserPlus className="mr-2 h-4 w-4" /> Pré-cadastro interno
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-black uppercase tracking-tight">
            Pré-cadastro de vendedor
          </DialogTitle>
        </DialogHeader>

        {senhaGerada ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Conta criada para <strong>{senhaGerada.email}</strong>. O vendedor entra com a senha
              temporária, troca a senha e assina o termo no primeiro acesso — sem passar por
              aprovação de compliance.
            </p>
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-3">
              <code className="flex-1 font-black tracking-widest text-slate-900">
                {senhaGerada.senha}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(senhaGerada.senha);
                  toast.success("Senha copiada.");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs font-semibold text-slate-500">
              {senhaGerada.emailEnviado
                ? "E-mail com a senha enviado ao vendedor."
                : "Não foi possível enviar o e-mail — repasse a senha manualmente."}
            </p>
            <Button onClick={fechar} className="w-full bg-teal-600 font-bold hover:bg-teal-700">
              Concluir
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {[
              { k: "nome", label: "Nome completo / Razão social" },
              { k: "email", label: "E-mail" },
              { k: "cpf", label: "CPF" },
              { k: "cnpj", label: "CNPJ (opcional)" },
              { k: "whatsapp", label: "WhatsApp" },
            ].map((c) => (
              <div key={c.k} className="space-y-1">
                <Label className="text-xs font-bold text-slate-600">{c.label}</Label>
                <Input
                  className="h-11"
                  value={(form as any)[c.k]}
                  onChange={(e) => setForm({ ...form, [c.k]: e.target.value })}
                />
              </div>
            ))}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs font-bold text-slate-600">Cidade</Label>
                <Input
                  className="h-11"
                  value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-600">UF</Label>
                <Input
                  className="h-11 uppercase"
                  maxLength={2}
                  value={form.uf}
                  onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <Button
              onClick={salvar}
              disabled={salvando}
              className="h-12 w-full bg-teal-600 font-bold hover:bg-teal-700"
            >
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar e gerar senha
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
