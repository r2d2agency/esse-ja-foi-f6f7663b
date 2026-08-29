import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2, ChevronRight, ClipboardCheck, Loader2, LogOut, RefreshCw } from "lucide-react";
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

function dataPorExtenso() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(new Date());
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
  const primeiraPendente = vistorias.find((v: any) => v.status !== "CONCLUIDA" && v.status !== "CANCELADA");

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-8 lg:ml-64 lg:p-8">
      {/* Cabeçalho em destaque */}
      <header className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-foreground/10" />
        <div className="pointer-events-none absolute -bottom-14 right-16 h-32 w-32 rounded-full bg-primary-foreground/5" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold capitalize text-primary-foreground/70">{dataPorExtenso()}</p>
            <h1 className="mt-1 text-2xl font-black">Olá, {user?.nome?.split(" ")[0] || "vistoriador"}</h1>
            <p className="mt-1 text-sm text-primary-foreground/80">
              {primeiraPendente
                ? `Próximo atendimento às ${String(primeiraPendente.horario_vistoria).slice(0, 5)} — ${primeiraPendente.marca} ${primeiraPendente.modelo}`
                : "Sua agenda de hoje e o andamento do mês."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            aria-label="Sair"
            className="rounded-full text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2" aria-label="Resumo operacional">
          <Metrica icone={<CalendarCheck className="h-4 w-4" />} valor={painel?.metricas?.agendadas_hoje || 0} rotulo="Hoje" />
          <Metrica icone={<CheckCircle2 className="h-4 w-4" />} valor={painel?.metricas?.concluidas_hoje || 0} rotulo="Concluídas" />
          <Metrica icone={<ClipboardCheck className="h-4 w-4" />} valor={painel?.metricas?.realizadas_mes || 0} rotulo="No mês" />
        </div>
      </header>

      <InstalarApp />
      <GpsStatus />

      {painel?.perfil?.unidade_nome && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Sua unidade</p>
          <p className="mt-1 font-bold text-foreground">{painel.perfil.unidade_nome}</p>
          <p className="text-sm text-muted-foreground">
            {[painel.perfil.unidade_endereco, painel.perfil.unidade_cidade, painel.perfil.unidade_estado].filter(Boolean).join(" · ")}
          </p>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Hoje</p>
            <h2 className="text-lg font-black text-foreground">Vistorias programadas</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => consulta.refetch()} aria-label="Atualizar agenda" className="rounded-full">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button asChild variant="ghost" className="rounded-full text-sm font-bold text-primary">
              <Link to="/vistoriador/agenda">Agenda <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
        {consulta.isLoading ? (
          <Estado texto="Carregando agenda..." carregando />
        ) : resposta?.ok === false ? (
          <Estado texto={resposta.message} />
        ) : vistorias.length === 0 ? (
          <Estado texto="Nenhuma vistoria agendada para hoje. Aproveite para revisar sua agenda da semana." />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {vistorias.map((v: any) => (
              <VistoriaCard key={v.id} vistoria={v} destaque={primeiraPendente?.id === v.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metrica({ icone, valor, rotulo }: { icone: React.ReactNode; valor: number; rotulo: string }) {
  return (
    <div className="rounded-2xl bg-primary-foreground/10 p-3 backdrop-blur">
      <div className="text-primary-foreground/80">{icone}</div>
      <strong className="mt-1.5 block text-2xl font-black leading-none">{valor}</strong>
      <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-primary-foreground/70">{rotulo}</span>
    </div>
  );
}

function Estado({ texto, carregando = false }: { texto: string; carregando?: boolean }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
      {carregando && <Loader2 className="mb-2 h-5 w-5 animate-spin" />}
      {texto}
    </div>
  );
}
