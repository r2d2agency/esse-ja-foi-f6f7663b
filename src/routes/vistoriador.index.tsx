import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2, ClipboardCheck, Loader2, LogOut, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getPainelVistoriadorFn } from "@/lib/vistoriador.functions";
import { useAuthStore } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { GpsStatus } from "@/components/vistoriador/GpsStatus";
import { VistoriaCard } from "@/components/vistoriador/VistoriaCard";
import { InstalarApp } from "@/components/vistoriador/InstalarApp";

export const Route = createFileRoute("/vistoriador/")({
  component: VistoriasHojePage,
  head: () => ({ meta: [
    { title: "Painel do vistoriador | Esse Já Foi" },
    { name: "description", content: "Agenda diária, indicadores e localização operacional do vistoriador." },
    { property: "og:title", content: "Painel do vistoriador | Esse Já Foi" },
    { property: "og:description", content: "Agenda diária, indicadores e localização operacional do vistoriador." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function dataSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function VistoriasHojePage() {
  const { user, logout } = useAuthStore();
  const carregar = useServerFn(getPainelVistoriadorFn);
  const hoje = dataSaoPaulo();
  const consulta = useQuery({
    queryKey: ["painel-vistoriador", user?.id, hoje],
    queryFn: () => carregar({ data: { usuarioId: user?.id || "", inicio: hoje, fim: hoje } }),
    enabled: !!user?.id,
  });
  const resposta = consulta.data;
  const painel = resposta?.ok ? resposta.data : null;
  const vistorias = painel?.vistorias || [];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 lg:ml-64 lg:p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-muted-foreground">Operação de vistoria</p>
          <h1 className="mt-1 text-2xl font-black text-foreground">Olá, {user?.nome?.split(" ")[0] || "vistoriador"}</h1>
          <p className="text-sm text-muted-foreground">Sua agenda de hoje e o andamento do mês.</p>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} aria-label="Sair"><LogOut className="h-5 w-5" /></Button>
      </header>

      <InstalarApp />

      <GpsStatus />

      <section className="grid grid-cols-3 gap-2" aria-label="Resumo operacional">
        <Metrica icone={<CalendarCheck className="h-5 w-5" />} valor={painel?.metricas?.agendadas_hoje || 0} rotulo="Agendadas hoje" />
        <Metrica icone={<CheckCircle2 className="h-5 w-5" />} valor={painel?.metricas?.concluidas_hoje || 0} rotulo="Concluídas hoje" />
        <Metrica icone={<ClipboardCheck className="h-5 w-5" />} valor={painel?.metricas?.realizadas_mes || 0} rotulo="Realizadas no mês" />
      </section>

      {painel?.perfil?.unidade_nome && (
        <section className="border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground">Sua unidade</p>
          <p className="mt-1 font-bold text-foreground">{painel.perfil.unidade_nome}</p>
          <p className="text-sm text-muted-foreground">{[painel.perfil.unidade_endereco, painel.perfil.unidade_cidade, painel.perfil.unidade_estado].filter(Boolean).join(" · ")}</p>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div><p className="text-xs font-bold uppercase text-muted-foreground">Hoje</p><h2 className="text-lg font-black text-foreground">Vistorias programadas</h2></div>
          <Button variant="ghost" size="icon" onClick={() => consulta.refetch()} aria-label="Atualizar agenda"><RefreshCw className="h-4 w-4" /></Button>
        </div>
        {consulta.isLoading ? <Estado texto="Carregando agenda..." carregando /> : resposta?.ok === false ? <Estado texto={resposta.message} /> : vistorias.length === 0 ? <Estado texto="Nenhuma vistoria agendada para hoje." /> : (
          <div className="grid gap-3 xl:grid-cols-2">{vistorias.map((v: any, i: number) => <VistoriaCard key={v.id} vistoria={v} destaque={i === 0} />)}</div>
        )}
      </section>
    </div>
  );
}

function Metrica({ icone, valor, rotulo }: { icone: React.ReactNode; valor: number; rotulo: string }) {
  return <div className="min-w-0 border border-border bg-card p-3"><div className="text-primary">{icone}</div><strong className="mt-2 block text-2xl text-foreground">{valor}</strong><span className="block text-[11px] leading-tight text-muted-foreground">{rotulo}</span></div>;
}

function Estado({ texto, carregando = false }: { texto: string; carregando?: boolean }) {
  return <div className="flex min-h-36 flex-col items-center justify-center border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">{carregando && <Loader2 className="mb-2 h-5 w-5 animate-spin" />}{texto}</div>;
}