import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Fuel, Settings2, MapPin, Gauge, Lock, Palette, X, ChevronLeft, ChevronRight, Maximize2, ClipboardCheck } from "lucide-react";

import { LogoEsf } from "@/components/shared/LogoEsf";
import { getVeiculoPorTokenFn } from "@/lib/publicacao.functions";
import { desserializarCondicao, listarAcessorios } from "@/lib/veiculo-condicao";
import { AcessoriosVeiculo } from "@/components/veiculo/AcessoriosVeiculo";

export const Route = createFileRoute("/v/$token")({
  head: () => ({
    meta: [
      { title: "Veículo compartilhado — ESSE JÁ FOI" },
      {
        name: "description",
        content:
          "Ficha privada de um veículo enviado por link exclusivo pela equipe ESSE JÁ FOI.",
      },
      { property: "og:title", content: "Veículo compartilhado — ESSE JÁ FOI" },
      {
        property: "og:description",
        content: "Fotos e ficha técnica do veículo enviado por link exclusivo.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VeiculoPorTokenPage,
});

const ITENS_VISTORIA: { chave: string; label: string }[] = [
  { chave: "funcionamento", label: "Funcionamento" },
  { chave: "motor", label: "Motor" },
  { chave: "cambioProblema", label: "Câmbio" },
  { chave: "lataria", label: "Lataria" },
  { chave: "interior", label: "Interior" },
  { chave: "pneus", label: "Pneus" },
  { chave: "acidente", label: "Já sofreu acidente" },
  { chave: "sinistro", label: "Sinistro" },
  { chave: "restricao", label: "Restrição p/ transferência" },
  { chave: "chaveReserva", label: "Chave reserva" },
  { chave: "manual", label: "Manual" },
  { chave: "estepe", label: "Estepe" },
];

const OBS_VISTORIA: { chave: string; label: string }[] = [
  { chave: "funcionamentoObs", label: "Funcionamento" },
  { chave: "motorObs", label: "Motor" },
  { chave: "latariaObs", label: "Lataria" },
  { chave: "historicoObs", label: "Histórico" },
];

function VeiculoPorTokenPage() {
  const { token } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["veiculo-token", token],
    queryFn: () => getVeiculoPorTokenFn({ data: { token } }),
  });

  const [fotoAtiva, setFotoAtiva] = useState(0);
  const [lightboxAberto, setLightboxAberto] = useState(false);

  const res: any = data;
  const fotos: string[] = res?.ok ? res.data.fotos || [] : [];

  useEffect(() => {
    if (!lightboxAberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxAberto(false);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [lightboxAberto]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
      </div>
    );
  }

  if (!res?.ok) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <Lock className="h-8 w-8 text-slate-400" />
        <h1 className="text-xl font-black text-slate-900">Link indisponível</h1>
        <p className="max-w-sm text-sm text-slate-500">
          {res?.message || "Este link privado foi revogado ou não existe mais."}
        </p>
      </div>
    );
  }

  const { veiculo, titulo, descricao } = res.data;
  const condicao = desserializarCondicao(veiculo.observacoes);
  const itensCondicao = ITENS_VISTORIA.filter((i) => condicao?.[i.chave]);
  const observacoesCondicao = OBS_VISTORIA.filter((o) => condicao?.[o.chave]);
  const acessoriosCondicao = listarAcessorios(condicao);

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <LogoEsf height={26} />
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-teal-700">
          <Lock className="h-3 w-3" /> Link exclusivo
        </span>
        <h1 className="mt-3 text-3xl font-black leading-tight text-slate-950">{titulo}</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          {veiculo.ano_fabricacao}/{veiculo.ano_modelo}
          {veiculo.versao ? ` • ${veiculo.versao}` : ""}
        </p>

        {fotos.length > 0 && (
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => setLightboxAberto(true)}
              className="group relative block aspect-video w-full cursor-zoom-in overflow-hidden rounded-2xl bg-slate-100"
              aria-label="Ampliar foto"
            >
              <img
                src={fotos[fotoAtiva]}
                alt={`Foto principal do veículo ${titulo}`}
                className="h-full w-full object-contain"
              />
              <span className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-slate-950/60 px-3 py-1.5 text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Maximize2 className="h-3.5 w-3.5" /> Ampliar
              </span>
            </button>
            {fotos.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {fotos.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFotoAtiva(i)}
                    className={`h-18 w-24 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-100 transition-all ${
                      fotoAtiva === i ? "border-teal-500 ring-2 ring-teal-50" : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={url} alt={`Miniatura ${i + 1}`} className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-5">
          {[
            { icon: Gauge, label: "KM", valor: veiculo.km ? Number(veiculo.km).toLocaleString("pt-BR") : "—" },
            { icon: Settings2, label: "Câmbio", valor: veiculo.cambio || "—" },
            { icon: Fuel, label: "Combustível", valor: veiculo.combustivel || "—" },
            { icon: Palette, label: "Cor", valor: veiculo.cor || "—" },
            {
              icon: MapPin,
              label: "Local",
              valor: veiculo.cidade ? `${veiculo.cidade}${veiculo.uf ? `/${veiculo.uf}` : ""}` : "—",
            },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <item.icon className="h-4 w-4 text-teal-700" />
              <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                {item.label}
              </p>
              <p className="text-sm font-bold text-slate-900">{item.valor}</p>
            </div>
          ))}
        </div>

        {descricao && (
          <div className="mt-6 whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-700">
            {descricao}
          </div>
        )}

        {(itensCondicao.length > 0 || acessoriosCondicao.length > 0) && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-slate-900">
              <ClipboardCheck className="h-4 w-4 text-teal-600" /> Condição do veículo
            </h2>
            {itensCondicao.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-y-4 gap-x-6 sm:grid-cols-3">
                {itensCondicao.map((i) => (
                  <div key={i.chave}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{i.label}</p>
                    <p className="text-sm font-bold text-slate-800">{condicao[i.chave]}</p>
                  </div>
                ))}
              </div>
            )}
            {acessoriosCondicao.length > 0 && (
              <AcessoriosVeiculo itens={acessoriosCondicao} className="mt-6 border-t border-slate-100 pt-6" />
            )}
            {observacoesCondicao.length > 0 && (
              <div className="mt-6 space-y-4 border-t border-slate-100 pt-6">
                {observacoesCondicao.map((o) => (
                  <div key={o.chave}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{o.label}</p>
                    <p className="mt-1 text-sm text-slate-700">{condicao[o.chave]}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {lightboxAberto && fotos.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
          onClick={() => setLightboxAberto(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxAberto(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>

          {fotos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFotoAtiva((p) => (p - 1 + fotos.length) % fotos.length);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
                aria-label="Foto anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFotoAtiva((p) => (p + 1) % fotos.length);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
                aria-label="Próxima foto"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <img
            src={fotos[fotoAtiva]}
            alt={`Foto do veículo ${titulo}`}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
