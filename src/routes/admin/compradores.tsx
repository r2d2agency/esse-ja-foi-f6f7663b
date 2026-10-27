import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarCompradoresFn, preCadastrarCompradorFn } from "@/lib/admin-compradores.functions";
import {
  getUazapiConfigFn,
  incluirCompradorNoGrupoFn,
  listarGruposUazapiFn,
  verificarParticipanteNoGrupoFn,
} from "@/lib/marketing.functions";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import {
  Search,
  ChevronRight,
  ShoppingBag,
  UserPlus,
  Building2,
  User as UserIcon,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Link2,
  Users,
  UserCheck,
  UserMinus,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { cn, formatDate, formatCPF } from "@/lib/utils";
import { maskDocumento, maskTelefone } from "@/lib/brasil";

export const Route = createFileRoute("/admin/compradores")({
  component: CompradoresPage,
});

const STATUS_CONFIG: Record<string, { label: string, color: string, bg: string, icon: any }> = {
  'PENDENTE': { label: 'Pendente', color: 'text-amber-600', bg: 'bg-amber-500', icon: Clock },
  'EM_ANALISE': { label: 'Em Análise', color: 'text-blue-600', bg: 'bg-blue-500', icon: Search },
  'PENDENCIA': { label: 'Pendência', color: 'text-red-600', bg: 'bg-red-500', icon: AlertTriangle },
  'APROVADO': { label: 'Aprovado', color: 'text-teal-600', bg: 'bg-teal-500', icon: CheckCircle2 },
  'BLOQUEADO': { label: 'Bloqueado', color: 'text-slate-600', bg: 'bg-slate-500', icon: AlertTriangle },
};

function CompradoresPage() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string | undefined>(undefined);
  const [tipo, setTipo] = useState<"CADASTRADOS" | "WHATSAPP">("CADASTRADOS");

  const loadCompradores = useServerFn(listarCompradoresFn);
  const { data: res, isLoading } = useQuery({
    queryKey: ["admin-compradores", busca, filtroStatus, tipo],
    queryFn: () => loadCompradores({ data: { busca, status: filtroStatus, tipo } })
  });

  const compradores = res?.data || [];
  const [preOpen, setPreOpen] = useState(false);
  const [pre, setPre] = useState({
    nome: "", email: "", senha: "", whatsapp: "", cnpj: "", regiao: "", endereco: "", cidade: "", uf: "",
  });
  const [salvandoPre, setSalvandoPre] = useState(false);

  // Verificação de presença no grupo WhatsApp (Uazapi).
  const obterConfigUazapi = useServerFn(getUazapiConfigFn);
  const listarGrupos = useServerFn(listarGruposUazapiFn);
  const verificarNoGrupo = useServerFn(verificarParticipanteNoGrupoFn);
  const incluirNoGrupo = useServerFn(incluirCompradorNoGrupoFn);
  const [gruposDisponiveis, setGruposDisponiveis] = useState<any[]>([]);
  const [gruposPermitidos, setGruposPermitidos] = useState<string[]>([]);
  const [grupoEscolhido, setGrupoEscolhido] = useState<string>("");
  const [gruposCarregando, setGruposCarregando] = useState(false);
  const [verificandoId, setVerificandoId] = useState<string | null>(null);
  const [incluindoId, setIncluindoId] = useState<string | null>(null);
  /** Resultado por comprador: noGrupo true/false ou mensagem de erro. */
  const [statusGrupo, setStatusGrupo] = useState<Record<string, { noGrupo?: boolean; erro?: string; numero?: string }>>({});

  const gruposVisiveis =
    gruposPermitidos.length > 0
      ? gruposDisponiveis.filter((g: any) => gruposPermitidos.includes(g.id))
      : gruposDisponiveis;

  async function carregarGruposUazapi() {
    setGruposCarregando(true);
    try {
      const cfg: any = await obterConfigUazapi();
      if (cfg?.ok && cfg?.data) {
        const permitidos = Array.isArray(cfg.data.uazapi_grupos_permitidos)
          ? cfg.data.uazapi_grupos_permitidos
          : [];
        setGruposPermitidos(permitidos);
        if (permitidos.length === 1) setGrupoEscolhido((atual) => atual || permitidos[0]);
      }
      const r: any = await listarGrupos();
      if (!r?.ok) {
        toast.error(r?.message || "Falha ao listar grupos.");
        return;
      }
      const lista = Array.isArray(r?.data) ? r.data : [];
      setGruposDisponiveis(lista);
      if (!grupoEscolhido && lista.length === 1) setGrupoEscolhido(lista[0].id);
    } catch {
      toast.error("Não foi possível carregar os grupos da instância.");
    } finally {
      setGruposCarregando(false);
    }
  }

  function numeroDoComprador(c: any): string {
    return String(c?.whatsapp || c?.responsavel_whatsapp || "").trim();
  }

  async function verificarComprador(c: any) {
    const numero = numeroDoComprador(c);
    if (!numero) {
      setStatusGrupo((s) => ({ ...s, [c.id]: { erro: "Sem WhatsApp cadastrado." } }));
      return;
    }
    if (!grupoEscolhido) {
      toast.error("Escolha o grupo do WhatsApp acima antes de verificar.");
      return;
    }
    setVerificandoId(c.id);
    try {
      const r: any = await verificarNoGrupo({ data: { groupjid: grupoEscolhido, numero } });
      if (!r?.ok) {
        setStatusGrupo((s) => ({ ...s, [c.id]: { erro: r?.message || "Falha ao verificar." } }));
        return;
      }
      if (!r.data?.whatsappAtivo) {
        setStatusGrupo((s) => ({
          ...s,
          [c.id]: { noGrupo: false, erro: `Não está no WhatsApp (${r.data?.numero || numero}) — peça para corrigir o número.`, numero: r.data?.numero },
        }));
        return;
      }
      setStatusGrupo((s) => ({ ...s, [c.id]: { noGrupo: !!r.data?.noGrupo, numero: r.data?.numero } }));
    } finally {
      setVerificandoId(null);
    }
  }

  async function incluirComprador(c: any) {
    const numero = numeroDoComprador(c);
    if (!numero) {
      toast.error("Comprador sem WhatsApp cadastrado.");
      return;
    }
    if (!grupoEscolhido) {
      toast.error("Escolha o grupo do WhatsApp acima antes de incluir.");
      return;
    }
    setIncluindoId(c.id);
    try {
      const r: any = await incluirNoGrupo({ data: { groupjid: grupoEscolhido, numero } });
      if (!r?.ok) {
        toast.error(r?.message || "Falha ao incluir no grupo.");
        setStatusGrupo((s) => ({ ...s, [c.id]: { erro: r?.message || "Falha ao incluir no grupo." } }));
        return;
      }
      toast.success(r.data?.mensagem || (r.data?.precisaConvite
        ? "Adição direta bloqueada — envie o convite individual."
        : "Comprador incluído no grupo."));
      setStatusGrupo((s) => ({ ...s, [c.id]: { noGrupo: !r.data?.precisaConvite, numero: r.data?.numero } }));
    } finally {
      setIncluindoId(null);
    }
  }

  async function salvarPreCadastro() {
    if (!pre.nome || !pre.email || pre.senha.length < 6) {
      toast.error("Preencha nome, e-mail e uma senha com ao menos 6 caracteres.");
      return;
    }
    setSalvandoPre(true);
    try {
      const r: any = await preCadastrarCompradorFn({ data: pre });
      if (!r?.ok) {
        toast.error(r?.message || "Erro ao pré-cadastrar.");
        return;
      }
      toast.success("Comprador pré-cadastrado. Ele já pode ver os veículos.");
      setPreOpen(false);
      setPre({ nome: "", email: "", senha: "", whatsapp: "", cnpj: "", regiao: "", endereco: "", cidade: "", uf: "" });
    } finally {
      setSalvandoPre(false);
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Compradores</h1>
          <p className="text-slate-500 font-medium">Gestão de interessados, investidores e lojistas.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold"
            onClick={async () => {
              const url = `${window.location.origin}/comprador/pre-cadastro`;
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Link de pré-cadastro copiado.");
              } catch {
                toast.error("Não foi possível copiar. O link é: " + url);
              }
            }}
          >
            <Link2 className="mr-2 h-4 w-4" /> Link pré-cadastro (copiar)
          </Button>

          <Dialog open={preOpen} onOpenChange={setPreOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 rounded-xl bg-teal-600 font-bold hover:bg-teal-700">
                <UserPlus className="mr-2 h-4 w-4" /> Pré-cadastrar comprador
              </Button>
            </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-lg font-black uppercase">Pré-cadastro de comprador</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <Input placeholder="Nome / Razão social" value={pre.nome} onChange={(e) => setPre({ ...pre, nome: e.target.value })} className="h-12" />
              <Input placeholder="E-mail de acesso" type="email" value={pre.email} onChange={(e) => setPre({ ...pre, email: e.target.value })} className="h-12" />
              <Input placeholder="Senha provisória" value={pre.senha} onChange={(e) => setPre({ ...pre, senha: e.target.value })} className="h-12" />
              <Input placeholder="WhatsApp" value={pre.whatsapp} onChange={(e) => setPre({ ...pre, whatsapp: maskTelefone(e.target.value) })} className="h-12" />
              <Input placeholder="CNPJ (lojista)" value={pre.cnpj} onChange={(e) => setPre({ ...pre, cnpj: maskDocumento(e.target.value) })} className="h-12" />
              <Input placeholder="Região de atuação" value={pre.regiao} onChange={(e) => setPre({ ...pre, regiao: e.target.value })} className="h-12" />
              <Input placeholder="Endereço da loja" value={pre.endereco} onChange={(e) => setPre({ ...pre, endereco: e.target.value })} className="h-12" />
              <div className="grid grid-cols-[2fr_1fr] gap-3">
                <Input placeholder="Cidade" value={pre.cidade} onChange={(e) => setPre({ ...pre, cidade: e.target.value })} className="h-12" />
                <Input placeholder="UF" value={pre.uf} onChange={(e) => setPre({ ...pre, uf: e.target.value.toUpperCase().slice(0, 2) })} className="h-12" />
              </div>
              <p className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">
                O comprador poderá ver os veículos imediatamente, mas só dará lances após completar o cadastro da empresa e do responsável.
              </p>
              <Button onClick={salvarPreCadastro} disabled={salvandoPre} className="h-12 w-full rounded-xl bg-teal-600 font-bold hover:bg-teal-700">
                Criar acesso
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por nome, CPF, CNPJ ou e-mail" 
              className="pl-10 h-11 bg-white border-slate-200"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
            {[
              { label: 'Todos', value: undefined },
              { label: 'Pendentes', value: 'PENDENTE' },
              { label: 'Aprovados', value: 'APROVADO' },
              { label: 'Pendência', value: 'PENDENCIA' },
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

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-1">
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Grupo do WhatsApp (Uazapi)
            </p>
            <Select value={grupoEscolhido} onValueChange={setGrupoEscolhido}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Escolha o grupo para verificar/incluir" />
              </SelectTrigger>
              <SelectContent>
                {gruposVisiveis.map((g: any) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.nome} ({g.participantes ?? "?"} participantes)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-400">
              {gruposPermitidos.length > 0
                ? `Só aparecem os ${gruposPermitidos.length} grupo(s) permitido(s) em Marketing > Configurar.`
                : "Sem filtro: mostrando todos os grupos da instância."}
            </p>
          </div>
          <Button
            variant="outline"
            className="h-11 rounded-xl font-bold"
            onClick={carregarGruposUazapi}
            disabled={gruposCarregando}
          >
            {gruposCarregando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Users className="mr-2 h-4 w-4" />
            )}
            Carregar grupos
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow className="hover:bg-transparent border-slate-200">
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4">Comprador</TableHead>
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4">Documento</TableHead>
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4">Localização</TableHead>
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4">Compliance</TableHead>
              <TableHead className="text-[11px] font-black text-slate-400 uppercase tracking-wider py-4">Grupo WhatsApp</TableHead>
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
            ) : res && (res as any).ok === false ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-red-500 font-medium">
                  Erro ao carregar compradores: {(res as any).message || "tente novamente."}
                </TableCell>
              </TableRow>
            ) : compradores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-400 font-medium italic">
                  Nenhum comprador encontrado.
                </TableCell>
              </TableRow>
            ) : (
              compradores.map((c: any) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-slate-50 transition-colors border-slate-100"
                  onClick={() => navigate({ to: "/admin/comprador/$id", params: { id: c.id } as any })}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-400">
                        {c.tipo_pessoa === 'PJ' ? <Building2 className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">{c.nome}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                          {c.tipo_pessoa === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'} • {c.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium text-slate-500">
                      {c.tipo_pessoa === 'PJ' ? c.cnpj : c.cpf}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium text-slate-700">{c.cidade || '-'}/{c.uf || '-'}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        c.status_compliance ? STATUS_CONFIG[c.status_compliance]?.bg : 'bg-amber-500'
                      )} />
                      <span className={cn(
                        "text-xs font-bold",
                        c.status_compliance ? STATUS_CONFIG[c.status_compliance]?.color : 'text-amber-600'
                      )}>
                        {c.status_compliance ? STATUS_CONFIG[c.status_compliance]?.label : 'Pendente'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const st = statusGrupo[c.id];
                        const numero = numeroDoComprador(c);
                        if (st?.erro) {
                          return <span className="max-w-[220px] text-[11px] font-medium text-red-600">{st.erro}</span>;
                        }
                        if (st?.noGrupo === true) {
                          return (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-700">
                              <UserCheck className="h-4 w-4" /> Já está no grupo
                            </span>
                          );
                        }
                        if (st?.noGrupo === false && st && !st.erro) {
                          return (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                              <UserMinus className="h-4 w-4" /> Fora do grupo
                            </span>
                          );
                        }
                        return numero ? (
                          <span className="text-[11px] text-slate-400">Não verificado</span>
                        ) : (
                          <span className="text-[11px] font-medium text-red-600">Sem WhatsApp</span>
                        );
                      })()}
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px] font-bold"
                          disabled={verificandoId === c.id || !grupoEscolhido}
                          onClick={() => verificarComprador(c)}
                        >
                          {verificandoId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verificar"}
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-[11px] font-bold bg-teal-600 hover:bg-teal-700"
                          disabled={incluindoId === c.id || !grupoEscolhido || statusGrupo[c.id]?.noGrupo === true}
                          onClick={() => incluirComprador(c)}
                        >
                          {incluindoId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Incluir"}
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-slate-700">{formatDate(c.atualizado_em)}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{c.responsavel || 'Sistema'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
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
