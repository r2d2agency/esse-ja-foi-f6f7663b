import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Search,
  ShieldCheck,
  Heart,
  Bell,
  Gavel,
  Clock,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSessionToken } from "@/lib/session";
import {
  getPerfilCompradorFn,
  listarFavoritosFn,
  listarLembretesFn,
  listarNotificacoesFn,
  marcarNotificacoesLidasFn,
} from "@/lib/comprador.functions";

export const Route = createFileRoute("/comprador/")({
  head: () => ({
    meta: [
      { title: "Painel do comprador — ESSE JÁ FOI" },
      {
        name: "description",
        content:
          "Acompanhe favoritos, lembretes de leilão e avisos de lance superado no seu painel de comprador.",
      },
      { property: "og:title", content: "Painel do comprador — ESSE JÁ FOI" },
      {
        property: "og:description",
        content: "Seu centro de controle de leilões de veículos na plataforma Esse Já Foi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompradorDashboard,
});

const STATUS_LABEL: Record<string, { txt: string; cls: string }> = {
  APROVADO: { txt: "Aprovado", cls: "bg-teal-500" },
  AGUARDANDO_ANALISE: { txt: "Em análise", cls: "bg-blue-500" },
  PENDENCIA: { txt: "Pendência", cls: "bg-amber-500" },
  REPROVADO: { txt: "Reprovado", cls: "bg-red-500" },
  NAO_ENVIADO: { txt: "Não enviado", cls: "bg-slate-400" },
};

function CompradorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = () => getSessionToken();

  const { data: perfilData, isLoading } = useQuery({
    queryKey: ["comprador-perfil"],
    queryFn: () => getPerfilCompradorFn({ data: { token: token() } }),
  });
  const { data: favoritos } = useQuery({
    queryKey: ["comprador-favoritos"],
    queryFn: () => listarFavoritosFn({ data: { token: token() } }),
  });
  const { data: lembretes } = useQuery({
    queryKey: ["comprador-lembretes"],
    queryFn: () => listarLembretesFn({ data: { token: token() } }),
  });
  const { data: notificacoes } = useQuery({
    queryKey: ["comprador-notificacoes"],
    queryFn: () => listarNotificacoesFn({ data: { token: token() } }),
    refetchInterval: 30000,
  });

  const marcarLidas = useMutation({
    mutationFn: () => marcarNotificacoesLidasFn({ data: { token: token() } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comprador-notificacoes"] }),
  });

  const perfil: any = (perfilData as any)?.perfil || {};
  const progresso: any = (perfilData as any)?.progresso || { percentual: 0, pendencias: [] };
  const status = perfil.status_compliance || "NAO_ENVIADO";
  const badge = STATUS_LABEL[status] || STATUS_LABEL["NAO_ENVIADO"]!;
  const aprovado = status === "APROVADO";

  const favs: any[] = ((favoritos as any)?.data as any[]) || [];
  const lembs: any[] = ((lembretes as any)?.data as any[]) || [];
  const notifs: any[] = ((notificacoes as any)?.data as any[]) || [];
  const naoLidas = notifs.filter((n) => !n.lida).length;

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-950">
          Olá, {user?.nome?.split(" ")[0] || "comprador"}
        </h1>
        <p className="font-medium text-slate-500">Seu centro de leilões do Esse Já Foi.</p>
      </div>

      {/* Status de habilitação */}
      <div
        className={cn(
          "rounded-3xl p-6 text-white",
          aprovado ? "bg-teal-700" : "bg-slate-950",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-black uppercase tracking-widest">Compliance</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-black", badge.cls)}>
                {badge.txt}
              </span>
            </div>
            <p className="mt-3 max-w-md text-sm text-white/80">
              {aprovado
                ? "Você está habilitado para ver valores e dar lances nos leilões."
                : "Complete seu cadastro para liberar valores e participação nos lances."}
            </p>
          </div>
          <span className="text-3xl font-black">{progresso.percentual}%</span>
        </div>
        {!aprovado && (
          <Button
            className="mt-5 h-12 rounded-xl bg-white font-bold text-slate-950 hover:bg-slate-100"
            onClick={() => navigate({ to: "/comprador/documentos" })}
          >
            Completar cadastro <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Ações rápidas */}
      <div className="grid gap-4 sm:grid-cols-3">
        <QuickCard
          icon={Search}
          titulo="Vitrine"
          valor="Ver veículos"
          onClick={() => navigate({ to: "/veiculos" })}
        />
        <QuickCard
          icon={Heart}
          titulo="Favoritos"
          valor={`${favs.length}`}
          onClick={() => navigate({ to: "/comprador/interesses" })}
        />
        <QuickCard
          icon={Clock}
          titulo="Lembretes"
          valor={`${lembs.length}`}
          onClick={() => navigate({ to: "/comprador/interesses" })}
        />
      </div>

      {/* Veículos disponíveis */}
      <section className="rounded-3xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Gavel className="h-4 w-4 text-amber-500" />
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
              Veículos disponíveis
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar marca ou modelo"
              className="h-10 w-48 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-900 placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setSoLeilao((s) => !s)}
              className={cn(
                "h-10 rounded-xl border px-3 text-xs font-black uppercase transition-colors",
                soLeilao
                  ? "border-amber-300 bg-amber-50 text-amber-700"
                  : "border-slate-200 text-slate-500 hover:border-teal-300",
              )}
            >
              Só leilão
            </button>
            <Button
              variant="ghost"
              className="h-10 rounded-xl text-xs font-black uppercase text-teal-700"
              onClick={() => navigate({ to: "/veiculos" })}
            >
              Ver todos
            </Button>
          </div>
        </header>
        <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {vitrineFiltrada.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm font-medium text-slate-400">
              Nenhum veículo disponível com esses filtros.
            </p>
          )}
          {vitrineFiltrada.slice(0, 6).map((v: any) => {
            const emLeilao = !!v.leilao_id;
            const partida = Number(v.lance_inicial || 0);
            const atual = Number(v.lance_atual || 0) || partida;
            return (
              <button
                key={v.id}
                onClick={() => navigate({ to: "/veiculos/$slug", params: { slug: v.slug } })}
                className="overflow-hidden rounded-2xl border border-slate-200 text-left transition-colors hover:border-teal-300"
              >
                <div className="aspect-[4/3] bg-slate-100">
                  {v.foto_capa ? (
                    <img src={v.foto_capa} alt={v.modelo} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-300">Sem foto</div>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{v.marca}</p>
                  <p className="text-sm font-black uppercase text-slate-900">{v.modelo}</p>
                  {v.valores_ocultos ? (
                    <p className="mt-3 text-xs font-bold text-slate-500">Preço restrito</p>
                  ) : emLeilao ? (
                    <div className="mt-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Partida {brl(partida)}
                      </p>
                      <p className="text-2xl font-black leading-tight text-teal-700 tabular-nums">{brl(atual)}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xl font-black text-slate-900">{brl(v.valor_comercial)}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>


      {/* Notificações */}
      <section className="rounded-3xl border border-slate-200 bg-white">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-teal-600" />
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
              Notificações
            </h2>
            {naoLidas > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">
                {naoLidas}
              </span>
            )}
          </div>
          {naoLidas > 0 && (
            <button
              onClick={() => marcarLidas.mutate()}
              className="text-xs font-bold text-teal-700 hover:underline"
            >
              Marcar como lidas
            </button>
          )}
        </header>
        <div className="divide-y divide-slate-100">
          {notifs.length === 0 && (
            <p className="px-6 py-8 text-center text-sm font-medium text-slate-400">
              Nenhuma notificação por enquanto.
            </p>
          )}
          {notifs.slice(0, 8).map((n) => (
            <div key={n.id} className={cn("px-6 py-4", !n.lida && "bg-amber-50/60")}>
              <div className="flex items-center gap-2">
                {n.tipo === "LANCE_SUPERADO" ? (
                  <Gavel className="h-4 w-4 text-amber-600" />
                ) : (
                  <Bell className="h-4 w-4 text-slate-400" />
                )}
                <p className="text-sm font-black text-slate-900">{n.titulo}</p>
              </div>
              <p className="mt-1 text-sm text-slate-600">{n.mensagem}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Favoritos */}
      <section className="rounded-3xl border border-slate-200 bg-white">
        <header className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
          <Heart className="h-4 w-4 text-teal-600" />
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Meus favoritos
          </h2>
        </header>
        <div className="divide-y divide-slate-100">
          {favs.length === 0 && (
            <p className="px-6 py-8 text-center text-sm font-medium text-slate-400">
              Você ainda não favoritou nenhum veículo.
            </p>
          )}
          {favs.map((f) => (
            <button
              key={f.id || f.anuncio_id}
              onClick={() => f.slug && navigate({ to: "/veiculos/$slug", params: { slug: f.slug } })}
              className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-slate-50"
            >
              <span className="text-sm font-bold text-slate-900">
                {f.titulo || `${f.marca ?? ""} ${f.modelo ?? ""}`}
              </span>
              <ChevronRight className="h-4 w-4 text-slate-300" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function QuickCard({
  icon: Icon,
  titulo,
  valor,
  onClick,
}: {
  icon: any;
  titulo: string;
  valor: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-3xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-teal-300"
    >
      <Icon className="h-5 w-5 text-teal-600" />
      <p className="mt-3 text-[11px] font-black uppercase tracking-widest text-slate-400">
        {titulo}
      </p>
      <p className="text-lg font-black text-slate-950">{valor}</p>
    </button>
  );
}
