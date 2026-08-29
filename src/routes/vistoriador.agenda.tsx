import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { getPainelVistoriadorFn } from "@/lib/vistoriador.functions";
import { useAuthStore } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VistoriaCard } from "@/components/vistoriador/VistoriaCard";

export const Route = createFileRoute("/vistoriador/agenda")({
  validateSearch: (search: Record<string, unknown>): { inicio?: string; fim?: string; status?: string } => ({
    inicio: typeof search.inicio === "string" ? search.inicio : undefined,
    fim: typeof search.fim === "string" ? search.fim : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
  }),
  component: AgendaPage,
  head: () => ({ meta: [
    { title: "Minha agenda | Esse Já Foi" },
    { name: "description", content: "Agenda de veículos atribuídos ao vistoriador." },
    { property: "og:title", content: "Minha agenda | Esse Já Foi" },
    { property: "og:description", content: "Agenda de veículos atribuídos ao vistoriador." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function AgendaPage() {
  const { user } = useAuthStore();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const carregar = useServerFn(getPainelVistoriadorFn);
  const consulta = useQuery({
    queryKey: ["agenda-vistoriador", user?.id, search],
    queryFn: () => carregar({ data: { usuarioId: user?.id || "", ...search } }),
    enabled: !!user?.id,
  });
  const resposta = consulta.data;
  const lista = resposta?.ok ? resposta.data.vistorias : [];
  const alterar = (chave: "inicio" | "fim" | "status", valor: string) => navigate({ search: (anterior) => ({ ...anterior, [chave]: valor || undefined }) });

  return <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 lg:ml-64 lg:p-8">
    <header><p className="text-xs font-bold uppercase text-muted-foreground">Planejamento</p><h1 className="text-2xl font-black text-foreground">Minha agenda</h1><p className="text-sm text-muted-foreground">Todos os veículos atribuídos à sua fila.</p></header>
    <section className="grid gap-3 border border-border bg-card p-4 sm:grid-cols-3">
      <label className="text-xs font-bold text-muted-foreground">De<Input type="date" value={search.inicio || ""} onChange={(e) => alterar("inicio", e.target.value)} className="mt-1 h-11" /></label>
      <label className="text-xs font-bold text-muted-foreground">Até<Input type="date" value={search.fim || ""} onChange={(e) => alterar("fim", e.target.value)} className="mt-1 h-11" /></label>
      <label className="text-xs font-bold text-muted-foreground">Status<Select value={search.status || "TODOS"} onValueChange={(v) => alterar("status", v)}><SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="TODOS">Todos</SelectItem><SelectItem value="CONFIRMADA">Confirmadas</SelectItem><SelectItem value="AGUARDANDO_CONFIRMACAO">Aguardando confirmação</SelectItem><SelectItem value="EM_ANDAMENTO">Em andamento</SelectItem><SelectItem value="CONCLUIDA">Concluídas</SelectItem><SelectItem value="CANCELADA">Canceladas</SelectItem></SelectContent></Select></label>
    </section>
    <div className="flex items-center justify-between"><p className="text-sm font-semibold text-muted-foreground">{lista.length} vistoria(s)</p><Button variant="ghost" size="icon" onClick={() => consulta.refetch()} aria-label="Atualizar"><RefreshCw className="h-4 w-4" /></Button></div>
    {consulta.isLoading ? <Vazio icone={<Loader2 className="h-6 w-6 animate-spin" />} texto="Carregando agenda..." /> : resposta?.ok === false ? <Vazio texto={resposta.message} /> : lista.length === 0 ? <Vazio icone={<CalendarDays className="h-7 w-7" />} texto="Nenhuma vistoria encontrada nesses filtros." /> : <div className="grid gap-3 xl:grid-cols-2">{lista.map((v: any) => <VistoriaCard key={v.id} vistoria={v} />)}</div>}
  </div>;
}

function Vazio({ texto, icone }: { texto: string; icone?: React.ReactNode }) { return <div className="flex min-h-48 flex-col items-center justify-center gap-2 border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">{icone}{texto}</div>; }