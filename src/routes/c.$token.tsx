import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, CheckCircle2 } from "lucide-react";
import { LogoEsf } from "@/components/shared/LogoEsf";
import { Button } from "@/components/ui/button";
import { FormularioVeiculoCondicao } from "@/components/veiculo/FormularioVeiculoCondicao";
import { getVistoriaPorTokenFn, enviarVistoriaPorTokenFn } from "@/lib/vistoria-link.functions";
import { FOTOS_VEICULO, CONDICAO_INICIAL, type CondicaoVeiculo } from "@/lib/veiculo-condicao";

export const Route = createFileRoute("/c/$token")({
  head: () => ({
    meta: [
      { title: "Cadastro simplificado — ESSE JÁ FOI" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VistoriaPorTokenPage,
});

const VEICULO_INICIAL: Record<string, string> = {
  placa: "",
  marca: "",
  modelo: "",
  versao: "",
  anoFabricacao: "",
  anoModelo: "",
  cor: "",
  km: "",
  cambio: "",
  combustivel: "",
  valorInteresse: "",
  cep: "",
  endereco: "",
  cidade: "",
  uf: "",
};

function VistoriaPorTokenPage() {
  const { token } = Route.useParams();
  const [veiculo, setVeiculo] = useState(VEICULO_INICIAL);
  const [condicao, setCondicao] = useState<CondicaoVeiculo>(CONDICAO_INICIAL);
  const [crlv, setCrlv] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Record<string, string | null>>(
    Object.fromEntries(FOTOS_VEICULO.map((f) => [f.id, null])),
  );
  const [fotosAnteriores, setFotosAnteriores] = useState<string[]>([]);
  const [enviado, setEnviado] = useState(false);
  const [preenchidoAntes, setPreenchidoAntes] = useState(false);

  const setCondicaoCampo = (patch: Partial<CondicaoVeiculo>) =>
    setCondicao((c) => ({ ...c, ...patch }));

  const { data, isLoading } = useQuery({
    queryKey: ["vistoria-token", token],
    queryFn: () => getVistoriaPorTokenFn({ data: { token } }),
  });

  const res: any = data;

  useEffect(() => {
    if (!res?.ok) return;
    const { veiculo: v, condicao: c, fotos: fotosSalvas, jaPreenchido } = res.data;
    setPreenchidoAntes(!!jaPreenchido);
    if (c && Object.keys(c).length > 0) setCondicao((atual) => ({ ...atual, ...c }));
    if (Array.isArray(fotosSalvas)) setFotosAnteriores(fotosSalvas);
    if (v) {
      setVeiculo({
        placa: v.placa || "",
        marca: v.marca || "",
        modelo: v.modelo || "",
        versao: v.versao || "",
        anoFabricacao: v.ano_fabricacao ? String(v.ano_fabricacao) : "",
        anoModelo: v.ano_modelo ? String(v.ano_modelo) : "",
        cor: v.cor || "",
        km: v.km ? String(v.km) : "",
        cambio: v.cambio || "",
        combustivel: v.combustivel || "",
        valorInteresse: v.valor_interesse_cliente
          ? Number(v.valor_interesse_cliente).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
          : "",
        cep: v.cep || "",
        endereco: v.endereco || "",
        cidade: v.cidade || "",
        uf: v.uf || "",
      });
      if (v.documento_crlv_url) setCrlv(v.documento_crlv_url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res?.ok]);

  const enviar = useMutation({
    mutationFn: () =>
      enviarVistoriaPorTokenFn({
        data: {
          token,
          placa: veiculo.placa.toUpperCase().replace(/\W/g, ""),
          marca: veiculo.marca,
          modelo: veiculo.modelo,
          versao: veiculo.versao || undefined,
          anoFabricacao: veiculo.anoFabricacao || undefined,
          anoModelo: veiculo.anoModelo || undefined,
          cor: veiculo.cor || undefined,
          km: veiculo.km ? Number(veiculo.km.replace(/\D/g, "")) : undefined,
          cambio: veiculo.cambio || undefined,
          combustivel: veiculo.combustivel || undefined,
          cep: veiculo.cep || undefined,
          endereco: veiculo.endereco || undefined,
          cidade: veiculo.cidade || undefined,
          uf: veiculo.uf || undefined,
          documento_crlv_url: crlv || undefined,
          fotos: Object.values(fotos).filter(Boolean) as string[],
          condicao,
        },
      }),
    onSuccess: (r: any) => {
      if (!r?.ok) {
        toast.error(r?.message || "Não foi possível enviar as informações.");
        return;
      }
      setEnviado(true);
    },
    onError: (e: any) => toast.error(e?.message || "Erro técnico ao enviar."),
  });

  function handleEnviar() {
    if (veiculo.placa.replace(/\W/g, "").length < 7) { toast.error("Informe a placa."); return; }
    if (veiculo.marca.trim().length < 2 || veiculo.modelo.trim().length < 2) {
      toast.error("Informe marca e modelo.");
      return;
    }
    enviar.mutate();
  }

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
          {res?.message || "Este link foi revogado ou não existe mais."}
        </p>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-teal-600" />
        <h1 className="text-xl font-black text-slate-900">Recebemos as informações!</h1>
        <p className="max-w-sm text-sm text-slate-500">
          A equipe Esse Já Foi vai dar continuidade à análise do seu veículo.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-5 py-4">
        <LogoEsf height={28} />
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-950">
          Cadastro simplificado
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Olá, <strong>{res.data.vendedorNome}</strong>! Preencha os dados do veículo e a condição
          dele abaixo — assim já adiantamos a análise do seu anúncio.
        </p>
        {preenchidoAntes && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
            Você já enviou este formulário antes — pode atualizar as informações se precisar.
          </p>
        )}

        {fotosAnteriores.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Fotos já enviadas anteriormente
            </p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
              {fotosAnteriores.map((url, i) => (
                <img key={i} src={url} className="h-16 w-16 shrink-0 rounded-lg object-cover" alt={`Foto ${i + 1}`} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 space-y-4">
          <FormularioVeiculoCondicao
            veiculo={veiculo}
            setVeiculo={setVeiculo}
            condicao={condicao}
            setCondicaoCampo={setCondicaoCampo}
            crlv={crlv}
            setCrlv={setCrlv}
            fotos={fotos}
            setFotos={setFotos}
          />

          <Button
            className="h-12 w-full bg-teal-600 font-bold hover:bg-teal-700"
            onClick={handleEnviar}
            disabled={enviar.isPending}
          >
            {enviar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enviar cadastro
          </Button>
        </div>
      </main>
    </div>
  );
}
