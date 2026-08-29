import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, Loader2, Search } from "lucide-react";
import { getPainelVistoriadorFn } from "@/lib/vistoriador.functions";
import { useAuthStore } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { VistoriaCard } from "@/components/vistoriador/VistoriaCard";

export const Route = createFileRoute("/vistoriador/historico")({
  validateSearch: (search: Record<string, unknown>): { inicio?: string; fim?: string; busca?: string } => ({
    inicio: typeof search.inicio === "string" ? search.inicio : undefined,
    fim: typeof search.fim === "string" ? search.fim : undefined,
    busca: typeof search.busca === "string" ? search.busca : undefined,
  }),
  component: HistoricoPage,
  head: () => ({ meta: [
    { title: "Histórico de vistorias | Esse Já Foi" },
    { name: "description", content: "Histórico filtrável das vistorias concluídas." },
    { property: "og:title", content: "Histórico de vistorias | Esse Já Foi" },
    { property: "og:description", content: "Histórico filtrável das vistorias concluídas." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function HistoricoPage() {
  const { user } = useAuthStore();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const carregar = useServerFn(getPainelVistoriadorFn);
  const consulta = useQuery({ queryKey: ["historico-vistoriador", user?.id, search], queryFn: () => carregar({ data: { usuarioId: user?.id || "", status: "CONCLUIDA", ...search } }), enabled: !!user?.id });
  const resposta = consulta.data;
  const lista = resposta?.ok ? resposta.data.vistorias : [];
  const alterar = (chave: "inicio" | "fim" | "busca", valor: string) => navigate({ search: (anterior) => ({ ...anterior, [chave]: valor || undefined }), replace: true });
  return <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 lg:ml-64 lg:p-8">
    <header><p className="text-xs font-bold uppercase text-muted-foreground">Resultados</p><h1 className="text-2xl font-black text-foreground">Histórico de vistorias</h1><p className="text-sm text-muted-foreground">Consulte os trabalhos já concluídos.</p></header>
    <section className="grid gap-3 border border-border bg-card p-4 sm:grid-cols-[1fr_170px_170px]">
      <label className="text-xs font-bold text-muted-foreground">Veículo<div className="relative mt-1"><Search className="absolute left-3 top-3.5 h-4 w-4" /><Input value={search.busca || ""} onChange={(e) => alterar("busca", e.target.value)} placeholder="Placa, marca ou modelo" className="h-11 pl-9" /></div></label>
      <label className="text-xs font-bold text-muted-foreground">De<Input type="date" value={search.inicio || ""} onChange={(e) => alterar("inicio", e.target.value)} className="mt-1 h-11" /></label>
      <label className="text-xs font-bold text-muted-foreground">Até<Input type="date" value={search.fim || ""} onChange={(e) => alterar("fim", e.target.value)} className="mt-1 h-11" /></label>
    </section>
    <p className="text-sm font-semibold text-muted-foreground">{lista.length} vistoria(s) concluída(s)</p>
    {consulta.isLoading ? <Vazio icone={<Loader2 className="h-6 w-6 animate-spin" />} texto="Carregando histórico..." /> : resposta?.ok === false ? <Vazio texto={resposta.message} /> : lista.length === 0 ? <Vazio icone={<ClipboardCheck className="h-7 w-7" />} texto="Nenhuma vistoria concluída encontrada." /> : <div className="grid gap-3 xl:grid-cols-2">{lista.map((v: any) => <VistoriaCard key={v.id} vistoria={v} />)}</div>}
  </div>;
}
function Vazio({ texto, icone }: { texto: string; icone?: React.ReactNode }) { return <div className="flex min-h-48 flex-col items-center justify-center gap-2 border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">{icone}{texto}</div>; }