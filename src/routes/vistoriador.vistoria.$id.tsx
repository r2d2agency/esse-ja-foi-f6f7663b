import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Car, Clock, Loader2, MapPin, Phone, User, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/hooks/use-auth";
import { getVistoriaDetalheVistoriadorFn } from "@/lib/vistoriador.functions";
import { Button } from "@/components/ui/button";
import { rotulosStatusVistoria } from "@/components/vistoriador/VistoriaCard";
import { GpsStatus } from "@/components/vistoriador/GpsStatus";

export const Route = createFileRoute("/vistoriador/vistoria/$id")({
  component: DetalheVistoriaPage,
});

const estiloStatus: Record<string, string> = {
  CONFIRMADA: "bg-emerald-100 text-emerald-800",
  EM_ANDAMENTO: "bg-blue-100 text-blue-800",
  CONCLUIDA: "bg-emerald-600 text-white",
  AGUARDANDO_CONFIRMACAO: "bg-amber-100 text-amber-900",
};

function DetalheVistoriaPage() {
  const { id } = Route.useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data: res, isLoading } = useQuery({
    queryKey: ["vistoria-detalhe", id, user?.id],
    queryFn: () => getVistoriaDetalheVistoriadorFn({ data: { vistoriaId: id, usuarioId: user?.id || "" } }),
    initialData: { ok: false, data: null } as any,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center lg:ml-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!res?.ok || !res.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center lg:ml-64">
        <h1 className="text-xl font-bold text-foreground">Vistoria não encontrada</h1>
        <Button asChild className="mt-4 rounded-xl" variant="outline">
          <Link to="/vistoriador">Voltar para início</Link>
        </Button>
      </div>
    );
  }

  const v = res.data;

  return (
    <div className="p-4 lg:ml-64 lg:p-10">
      <header className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate({ to: "/vistoriador" })} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-black text-foreground">Detalhe da vistoria</h1>
      </header>

      <div className="space-y-4 pb-32 lg:pb-0">
        {/* Card do veículo */}
        <section className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-lg">
          <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-primary-foreground/10" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary-foreground/15">
              <Car className="h-8 w-8" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-black">{v.marca} {v.modelo}</h2>
              <p className="text-sm font-bold uppercase tracking-widest text-primary-foreground/70">
                {v.placa} · {v.ano}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Vendedor</span>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-bold text-foreground">{v.vendedor_nome}</p>
                {v.vendedor_telefone && (
                  <a href={`tel:${v.vendedor_telefone}`} className="flex items-center gap-1 text-sm font-semibold text-primary">
                    <Phone className="h-3.5 w-3.5" /> {v.vendedor_telefone}
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</span>
            <div className="mt-3">
              <span className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide ${estiloStatus[v.status] || "bg-muted text-muted-foreground"}`}>
                {rotulosStatusVistoria[v.status] || v.status}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Localização e horário</span>
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-foreground">{String(v.horario_vistoria).substring(0, 5)}</p>
                <p className="text-sm text-muted-foreground">Horário agendado</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-foreground">{v.unidade_nome}</p>
                <p className="text-sm text-muted-foreground">{[v.unidade_endereco, v.unidade_cidade, v.unidade_estado].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          </div>
        </section>

        <GpsStatus />

        {/* Ação principal fixa no mobile */}
        <div className="fixed inset-x-4 bottom-24 z-40 lg:static lg:bottom-auto">
          {v.laudo_id && v.laudo_status === "EM_ANDAMENTO" ? (
            <Button asChild className="h-14 w-full rounded-2xl text-base font-black shadow-lg">
              <Link to="/vistoriador/execucao/$id" params={{ id }}>Continuar vistoria</Link>
            </Button>
          ) : v.status === "CONCLUIDA" ? (
            <Button disabled className="h-14 w-full rounded-2xl text-base font-black">Vistoria concluída</Button>
          ) : (
            <Button asChild className="h-14 w-full rounded-2xl bg-accent text-base font-black text-accent-foreground shadow-lg hover:bg-accent/90">
              <Link to="/vistoriador/execucao/$id" params={{ id }}>
                <ShieldCheck className="mr-2 h-5 w-5" /> Iniciar check-in
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
