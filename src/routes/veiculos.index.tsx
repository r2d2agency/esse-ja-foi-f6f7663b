import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getVitrine } from "@/lib/vitrine.functions";
import { alternarFavoritoFn } from "@/lib/comprador.functions";
import { getSessionToken } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  MapPin,
  Gauge,
  ShieldCheck,
  Lock,
  Menu,
  X,
  Heart,
  Gavel,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LogoEsf } from "@/components/shared/LogoEsf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/veiculos/")({
  head: () => ({
    meta: [
      { title: "Veículos em leilão — ESSE JÁ FOI" },
      {
        name: "description",
        content:
          "Vitrine de veículos vistoriados com filtros por marca, ano, quilometragem e leilões abertos.",
      },
      { property: "og:title", content: "Veículos em leilão — ESSE JÁ FOI" },
      {
        property: "og:description",
        content: "Encontre veículos vistoriados e participe dos leilões da plataforma Esse Já Foi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VitrinePublica,
});

const brl = (v: any) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function VitrinePublica() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [marca, setMarca] = useState("");
  const [anoMin, setAnoMin] = useState("");
  const [kmMax, setKmMax] = useState("");
  const [somenteLeilao, setSomenteLeilao] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const qc = useQueryClient();

  const { data: veiculos, isLoading, isError, error } = useQuery({
    queryKey: ["vitrine-veiculos"],
    queryFn: () => getVitrine({ data: { token: getSessionToken() } }),
  });

  const favoritar = useMutation({
    mutationFn: (anuncioId: string) =>
      alternarFavoritoFn({ data: { token: getSessionToken(), anuncioId } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["vitrine-veiculos"] });
      qc.invalidateQueries({ queryKey: ["comprador-favoritos"] });
      toast.success(res?.favorito ? "Adicionado aos favoritos." : "Removido dos favoritos.");
    },
    onError: () => toast.error("Faça login para favoritar veículos."),
  });

  const lista: any[] = (veiculos as any[]) || [];
  const marcas = useMemo(
    () => Array.from(new Set(lista.map((v) => v.marca).filter(Boolean))).sort(),
    [lista],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.filter((v) => {
      if (termo) {
        const alvo = `${v.marca ?? ""} ${v.modelo ?? ""} ${v.titulo ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      if (marca && v.marca !== marca) return false;
      if (anoMin && Number(v.ano_modelo || 0) < Number(anoMin)) return false;
      if (kmMax && Number(v.km || 0) > Number(kmMax)) return false;
      if (somenteLeilao && !v.leilao_id) return false;
      return true;
    });
  }, [lista, busca, marca, anoMin, kmMax, somenteLeilao]);

  const limparFiltros = () => {
    setBusca("");
    setMarca("");
    setAnoMin("");
    setKmMax("");
    setSomenteLeilao(false);
  };

  const Filtros = (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-widest text-slate-500">
          Marca
        </label>
        <select
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900"
        >
          <option value="">Todas as marcas</option>
          {marcas.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-widest text-slate-500">
          Ano a partir de
        </label>
        <Input
          inputMode="numeric"
          placeholder="Ex.: 2018"
          value={anoMin}
          onChange={(e) => setAnoMin(e.target.value.replace(/\D/g, ""))}
          className="h-11 rounded-xl"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-widest text-slate-500">
          KM até
        </label>
        <Input
          inputMode="numeric"
          placeholder="Ex.: 80000"
          value={kmMax}
          onChange={(e) => setKmMax(e.target.value.replace(/\D/g, ""))}
          className="h-11 rounded-xl"
        />
      </div>
      <button
        type="button"
        onClick={() => setSomenteLeilao((s) => !s)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold transition-colors",
          somenteLeilao
            ? "border-amber-300 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-white text-slate-600 hover:border-teal-300",
        )}
      >
        <span className="flex items-center gap-2">
          <Gavel className="h-4 w-4" /> Somente em leilão
        </span>
        <span className="text-[10px] font-black uppercase">{somenteLeilao ? "ON" : "OFF"}</span>
      </button>
      <Button
        type="button"
        variant="ghost"
        onClick={limparFiltros}
        className="h-10 w-full rounded-xl text-xs font-bold text-slate-500 hover:text-slate-900"
      >
        Limpar filtros
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <LogoEsf height={32} />

          <nav className="hidden items-center gap-8 md:flex">
            <Link to="/veiculos" className="text-sm font-semibold text-teal-700">Veículos</Link>
            <Link to="/" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Como funciona</Link>
            <Link to="/vender" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Quero vender</Link>
            <div className="h-4 w-px bg-slate-200"></div>
            <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Entrar</Link>
            <Link to="/vender">
              <Button className="rounded-full bg-slate-950 px-6 text-white hover:bg-teal-700">Vender meu carro</Button>
            </Link>
          </nav>

          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {menuOpen && (
          <div className="flex flex-col gap-1 border-t border-slate-100 px-6 py-3 md:hidden">
            <Link to="/" className="py-2 text-sm font-medium text-slate-600">Como funciona</Link>
            <Link to="/vender" className="py-2 text-sm font-medium text-slate-600">Quero vender</Link>
            <Link to="/login" className="py-2 text-sm font-medium text-slate-600">Entrar</Link>
          </div>
        )}
      </header>

      {/* HERO / BUSCA */}
      <section className="bg-slate-950 px-6 py-14 text-center text-white">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-4 text-4xl font-black tracking-tight md:text-5xl">Encontre sua próxima oportunidade.</h1>
          <p className="mb-8 text-lg text-slate-400">Veículos vistoriados e disponíveis para compradores cadastrados.</p>

          <div className="relative mx-auto max-w-xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Busque por marca, modelo ou veículo"
              className="h-14 rounded-full border-white/20 bg-white/10 pl-12 pr-4 text-lg text-white placeholder:text-slate-500 focus-visible:ring-teal-500"
            />
          </div>
        </div>
      </section>

      {/* FILTROS E GRID */}
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-col gap-8 md:flex-row">
          <aside className="w-full shrink-0 md:w-64">
            <div className="rounded-3xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-black uppercase tracking-tight text-slate-900">
                  <SlidersHorizontal className="h-4 w-4 text-teal-600" /> Filtros
                </h3>
                <button
                  className="text-xs font-bold text-teal-700 md:hidden"
                  onClick={() => setFiltrosAbertos((f) => !f)}
                >
                  {filtrosAbertos ? "Fechar" : "Abrir"}
                </button>
              </div>
              <div className={cn(filtrosAbertos ? "block" : "hidden", "md:block")}>{Filtros}</div>
            </div>
          </aside>

          {/* Grid de Veículos */}
          <div className="flex-1">
            <p className="mb-4 text-sm font-bold text-slate-500">
              {filtrados.length} veículo{filtrados.length === 1 ? "" : "s"} encontrado
              {filtrados.length === 1 ? "" : "s"}
            </p>
            {isLoading ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-96 animate-pulse rounded-2xl bg-slate-200"></div>
                ))}
              </div>
            ) : isError ? (
              <div className="rounded-3xl border border-red-200 bg-white p-12 text-center shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900">Não foi possível carregar a vitrine.</h2>
                <p className="mt-2 break-words text-slate-500">{(error as any)?.message || "Tente novamente em instantes."}</p>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="rounded-3xl bg-white p-12 text-center shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900">
                  {lista.length === 0 ? "Novas oportunidades estão chegando." : "Nenhum veículo com esses filtros."}
                </h2>
                <p className="mt-2 text-slate-500">
                  {lista.length === 0
                    ? "No momento não há veículos disponíveis. Volte em breve para conferir novas ofertas."
                    : "Ajuste os filtros para ver mais veículos."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filtrados.map((v: any) => {
                  const emLeilao = !!v.leilao_id;
                  const partida = Number(v.lance_inicial || 0);
                  const atual = Number(v.lance_atual || 0) || partida;
                  return (
                    <div
                      key={v.id}
                      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:border-teal-200 hover:shadow-xl"
                    >
                      <Link to="/veiculos/$slug" params={{ slug: v.slug }} className="block">
                        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                          {v.foto_capa ? (
                            <img
                              src={v.foto_capa}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              alt={`${v.marca ?? ""} ${v.modelo ?? ""}`}
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-300">Sem foto</div>
                          )}
                          <div className="absolute left-3 top-3 flex gap-2">
                            <span className="flex items-center gap-1 rounded bg-teal-600 px-2 py-1 text-[10px] font-black text-white">
                              <ShieldCheck className="h-3 w-3" /> VISTORIADO
                            </span>
                            {emLeilao && (
                              <span className="flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-[10px] font-black text-white">
                                <Gavel className="h-3 w-3" /> LEILÃO
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>

                      <div className="p-5">
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{v.marca}</div>
                        <h3 className="mb-2 text-lg font-black uppercase leading-tight text-slate-900">{v.modelo}</h3>

                        <div className="mb-4 flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> {Number(v.km || 0).toLocaleString("pt-BR")} km</span>
                          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {v.localizacao_publica || "—"}</span>
                        </div>

                        {v.valores_ocultos ? (
                          <div className="flex items-center gap-1 border-t border-slate-100 pt-4 font-bold text-slate-900">
                            <Lock className="h-3.5 w-3.5 text-teal-600" />
                            <span className="text-sm">Preço restrito</span>
                          </div>
                        ) : emLeilao ? (
                          <div className="space-y-3 border-t border-slate-100 pt-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor de partida</div>
                                <div className="text-base font-black text-slate-700">{brl(partida)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lance atual</div>
                                <div className="text-2xl font-black leading-tight text-teal-700">{brl(atual)}</div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="border-t border-slate-100 pt-4">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Valor</div>
                            <div className="text-2xl font-black text-slate-900">{brl(v.valor_comercial)}</div>
                          </div>
                        )}

                        <div className="mt-4 flex items-center gap-2">
                          <Link to="/veiculos/$slug" params={{ slug: v.slug }} className="flex-1">
                            <Button
                              className={cn(
                                "h-11 w-full rounded-xl text-xs font-black uppercase",
                                emLeilao
                                  ? "bg-amber-500 text-white hover:bg-amber-600"
                                  : "bg-slate-950 text-white hover:bg-teal-700",
                              )}
                            >
                              {emLeilao ? (
                                <>
                                  <Gavel className="mr-1.5 h-4 w-4" /> Dar lance
                                </>
                              ) : (
                                "Ver detalhes"
                              )}
                            </Button>
                          </Link>
                          <button
                            type="button"
                            aria-label="Favoritar"
                            onClick={() => favoritar.mutate(String(v.id))}
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors",
                              v.favorito
                                ? "border-teal-200 bg-teal-50 text-teal-600"
                                : "border-slate-200 text-slate-400 hover:border-teal-300 hover:text-teal-600",
                            )}
                          >
                            <Heart className={cn("h-5 w-5", v.favorito && "fill-teal-500 text-teal-500")} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
