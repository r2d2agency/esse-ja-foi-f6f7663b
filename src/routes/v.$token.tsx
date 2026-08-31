import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Fuel, Settings2, MapPin, Gauge, Lock } from "lucide-react";

import { LogoEsf } from "@/components/shared/LogoEsf";
import { getVeiculoPorTokenFn } from "@/lib/publicacao.functions";

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

function VeiculoPorTokenPage() {
  const { token } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["veiculo-token", token],
    queryFn: () => getVeiculoPorTokenFn({ data: { token } }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
      </div>
    );
  }

  const res: any = data;
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

  const { veiculo, titulo, descricao, fotos } = res.data;

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

        {fotos?.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {fotos.slice(0, 8).map((url: string, i: number) => (
              <img
                key={i}
                src={url}
                alt={`Foto ${i + 1} do veículo ${titulo}`}
                loading="lazy"
                className="h-56 w-full rounded-2xl object-cover"
              />
            ))}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { icon: Gauge, label: "KM", valor: veiculo.km ? Number(veiculo.km).toLocaleString("pt-BR") : "—" },
            { icon: Settings2, label: "Câmbio", valor: veiculo.cambio || "—" },
            { icon: Fuel, label: "Combustível", valor: veiculo.combustivel || "—" },
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
      </main>
    </div>
  );
}
