import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useMemo, useState } from "react";
import { getPontosMapaFn } from "@/lib/analytics.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PontoMapaUI } from "@/components/shared/MapaPontos";

const MapaPontos = lazy(() => import("@/components/shared/MapaPontos"));

export const Route = createFileRoute("/admin/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa da operação | ESSE JÁ FOI" },
      { name: "description", content: "Distribuição geográfica de compradores, vendedores e unidades de vistoria." },
      { property: "og:title", content: "Mapa da operação | ESSE JÁ FOI" },
      { property: "og:description", content: "Compradores, vendedores e unidades de vistoria no mapa do Brasil." },
    ],
  }),
  component: MapaOperacao,
});

/** Centroide aproximado por UF, usado quando o cadastro não possui coordenadas. */
const UF_CENTRO: Record<string, [number, number]> = {
  AC: [-9.02, -70.81], AL: [-9.57, -36.78], AP: [1.41, -51.77], AM: [-3.42, -65.86],
  BA: [-12.58, -41.7], CE: [-5.2, -39.53], DF: [-15.78, -47.93], ES: [-19.19, -40.34],
  GO: [-15.93, -50.14], MA: [-5.42, -45.44], MT: [-12.64, -55.42], MS: [-20.51, -54.54],
  MG: [-18.51, -44.55], PA: [-3.79, -52.48], PB: [-7.28, -36.72], PR: [-24.89, -51.55],
  PE: [-8.38, -37.86], PI: [-7.72, -42.73], RJ: [-22.25, -42.66], RN: [-5.81, -36.59],
  RS: [-30.17, -53.5], RO: [-10.83, -63.34], RR: [1.99, -61.33], SC: [-27.45, -50.95],
  SP: [-22.19, -48.79], SE: [-10.57, -37.45], TO: [-10.17, -48.29],
};

function hash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return h;
}

function comCoordenadas(p: PontoMapaUI): PontoMapaUI {
  if (p.latitude != null && p.longitude != null) return p;
  const uf = (p.uf ?? "").toUpperCase().trim();
  const centro = UF_CENTRO[uf];
  if (!centro) return p;
  const h = hash(p.id);
  const jitterLat = ((h % 100) / 100 - 0.5) * 0.9;
  const jitterLng = (((h / 100) % 100) / 100 - 0.5) * 0.9;
  return { ...p, latitude: centro[0] + jitterLat, longitude: centro[1] + jitterLng };
}

const FILTROS = [
  { key: "unidade", label: "Unidades de vistoria", cor: "bg-teal-700" },
  { key: "vendedor", label: "Vendedores", cor: "bg-amber-500" },
  { key: "comprador", label: "Compradores", cor: "bg-sky-500" },
] as const;

function MapaOperacao() {
  const carregar = useServerFn(getPontosMapaFn);
  const { data: res, isLoading } = useQuery({ queryKey: ["admin-mapa"], queryFn: () => carregar() });
  const [ativos, setAtivos] = useState<string[]>(["unidade", "vendedor", "comprador"]);

  const pontos = useMemo(() => {
    const base = (res?.ok ? res.data : []) as PontoMapaUI[];
    return base.map(comCoordenadas).filter((p) => ativos.includes(p.tipo) && p.latitude != null);
  }, [res, ativos]);

  const contagem = useMemo(() => {
    const base = (res?.ok ? res.data : []) as PontoMapaUI[];
    return {
      unidade: base.filter((p) => p.tipo === "unidade").length,
      vendedor: base.filter((p) => p.tipo === "vendedor").length,
      comprador: base.filter((p) => p.tipo === "comprador").length,
    } as Record<string, number>;
  }, [res]);

  const semLocal = useMemo(() => {
    const base = (res?.ok ? res.data : []) as PontoMapaUI[];
    return base.map(comCoordenadas).filter((p) => p.latitude == null).length;
  }, [res]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Mapa da operação</h1>
        <p className="text-slate-500 font-medium">
          Onde estão compradores, vendedores e as unidades de vistoria credenciadas.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const on = ativos.includes(f.key);
          return (
            <Button
              key={f.key}
              variant="outline"
              onClick={() => setAtivos((prev) => (on ? prev.filter((x) => x !== f.key) : [...prev, f.key]))}
              className={cn(
                "gap-2 font-bold text-xs uppercase tracking-wide",
                on ? "border-slate-900 bg-white text-slate-900" : "border-slate-200 bg-slate-50 text-slate-400"
              )}
            >
              <span className={cn("h-3 w-3 rounded-full", f.cor, !on && "opacity-30")} />
              {f.label}
              <span className="text-slate-400">{contagem[f.key] ?? 0}</span>
            </Button>
          );
        })}
      </div>

      <Card className="border-slate-200 shadow-none">
        <CardContent className="p-4">
          {isLoading ? (
            <div className="h-[620px] flex items-center justify-center text-slate-400 font-medium">
              Carregando mapa...
            </div>
          ) : res && !res.ok ? (
            <div className="h-[620px] flex items-center justify-center text-red-500 font-medium">
              {res.message}
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="h-[620px] flex items-center justify-center text-slate-400">Abrindo mapa...</div>
              }
            >
              <MapaPontos pontos={pontos} />
            </Suspense>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400">
        Cadastros sem coordenada exata são posicionados pelo centro do estado.
        {semLocal > 0 && ` ${semLocal} cadastro(s) sem cidade/UF não aparecem no mapa.`}
      </p>
    </div>
  );
}
