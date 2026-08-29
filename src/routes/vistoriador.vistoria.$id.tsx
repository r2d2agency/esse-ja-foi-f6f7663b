import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Car, Clock, MapPin, User, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/hooks/use-auth";
import { getVistoriaDetalheVistoriadorFn } from "@/lib/vistoriador.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/vistoriador/vistoria/$id")({
  component: DetalheVistoriaPage,
});

function DetalheVistoriaPage() {
  const { id } = Route.useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data: res } = useQuery({
    queryKey: ["vistoria-detalhe", id, user?.id],
    queryFn: () => getVistoriaDetalheVistoriadorFn({ data: { vistoriaId: id, usuarioId: user?.id || "" } }),
    initialData: { ok: false, data: null } as any,
  });

  if (!res?.ok || !res.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-bold">Vistoria não encontrada</h1>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/vistoriador">Voltar para início</Link>
        </Button>
      </div>
    );
  }

  const v = res.data;

  return (
    <div className="p-4 lg:ml-64 lg:p-10">
      <header className="mb-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          onClick={() => navigate({ to: "/vistoriador" })}
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-xl font-black text-slate-900">Detalhe da Vistoria</h1>
      </header>

      <div className="space-y-6">
        {/* Card Veículo */}
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
              <Car className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">
                {v.marca} {v.modelo}
              </h2>
              <div className="flex items-center gap-3 text-slate-500 font-bold uppercase tracking-widest">
                <span>{v.placa}</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>{v.ano}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Informações da Operação */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border bg-white p-5">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vendedor</span>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                <User className="h-4 w-4 text-slate-500" />
              </div>
              <div>
                <p className="font-bold text-slate-900">{v.vendedor_nome}</p>
                <p className="text-sm text-slate-500">{v.vendedor_telefone}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</span>
            <div className="mt-2 flex items-center gap-3">
              <Badge
                variant="outline"
                className={
                  v.status === "CONFIRMADA"
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                    : "bg-slate-50 text-slate-600"
                }
              >
                {v.status}
              </Badge>
            </div>
          </div>
        </section>

        {/* Local e Hora */}
        <section className="rounded-2xl border bg-white p-5">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Localização e Horário</span>
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 text-teal-600" />
              <div>
                <p className="font-bold text-slate-900">{v.horario_vistoria.substring(0, 5)}</p>
                <p className="text-sm text-slate-500">Horário agendado</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 text-teal-600" />
              <div>
                <p className="font-bold text-slate-900">{v.unidade_nome}</p>
                <p className="text-sm text-slate-500">{[v.unidade_endereco, v.unidade_cidade, v.unidade_estado].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Ação Principal */}
        <div className="fixed bottom-20 left-4 right-4 lg:relative lg:bottom-0 lg:left-0 lg:right-0">
          {v.laudo_id && v.laudo_status === 'EM_ANDAMENTO' ? (
            <Button
              asChild
              className="h-16 w-full rounded-2xl bg-teal-600 text-lg font-black text-white shadow-lg hover:bg-teal-700"
            >
              <Link to="/vistoriador/execucao/$id" params={{ id }}>
                Continuar vistoria
              </Link>
            </Button>
          ) : v.status === 'CONCLUIDA' ? (
            <Button
              disabled
              className="h-16 w-full rounded-2xl bg-slate-200 text-lg font-black text-slate-400"
            >
              Vistoria concluída
            </Button>
          ) : (
            <Button
              asChild
              className="h-16 w-full rounded-2xl bg-slate-900 text-lg font-black text-white shadow-lg hover:bg-slate-800"
            >
              <Link to="/vistoriador/execucao/$id" params={{ id }}>
                <ShieldCheck className="mr-2 h-6 w-6" />
                Iniciar check-in
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
