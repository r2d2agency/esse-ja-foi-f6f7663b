import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDadosParaNovoAnuncio, criarAnuncio } from "@/lib/anuncios.functions";
import { detectarPlacaFotoFn } from "@/lib/fotos-anuncio.functions";
import { AJUSTE_PADRAO, bboxParaAjuste, compositarLogo, type AjusteLogo } from "@/lib/logo-foto";
import { EditorLogoFoto } from "@/components/publicacao/EditorLogoFoto";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, Loader2, Pencil, AlertTriangle, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/anuncios/novo/")({
  component: NovoAnuncioPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      id: (search['id'] as string) || "",
    };
  },
});

type StatusFoto = "processando" | "pronta" | "erro";

type FotoProcessada = {
  id: string;
  original: string;
  url: string;
  ajuste: AjusteLogo;
  status: StatusFoto;
};

/** Processa a foto: detecta a placa via IA e aplica a logo (ou cai na marca d'água padrão). */
async function processarFoto(original: string): Promise<{ url: string; ajuste: AjusteLogo }> {
  let ajuste: AjusteLogo = AJUSTE_PADRAO;
  try {
    const res = await detectarPlacaFotoFn({ data: { imagemUrl: original } });
    if (res.ok && res.bbox) ajuste = bboxParaAjuste(res.bbox);
  } catch {
    // segue com o ajuste padrão — nunca bloqueia o processamento por causa da IA
  }
  const url = await compositarLogo(original, ajuste);
  return { url, ajuste };
}

/** Roda o processamento das fotos com no máximo `concorrencia` chamadas simultâneas. */
async function processarFotosEmLote(
  fotos: FotoProcessada[],
  concorrencia: number,
  aoConcluirUma: (id: string, resultado: { url: string; ajuste: AjusteLogo } | null) => void,
) {
  let indice = 0;
  async function worker() {
    while (indice < fotos.length) {
      const atual = fotos[indice++];
      if (!atual) continue;
      try {
        const resultado = await processarFoto(atual.original);
        aoConcluirUma(atual.id, resultado);
      } catch (err) {
        console.error("[anuncios/novo] falha ao processar foto:", err);
        aoConcluirUma(atual.id, null);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrencia, fotos.length) }, worker));
}

function NovoAnuncioPage() {
  const search = Route.useSearch();
  const id = search['id'];
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dados-novo-anuncio", id],
    queryFn: () => getDadosParaNovoAnuncio({ data: id }),
    enabled: !!id,
  });

  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [fotos, setFotos] = useState<FotoProcessada[]>([]);
  const [editando, setEditando] = useState<FotoProcessada | null>(null);
  const [capaId, setCapaId] = useState<string | null>(null);
  const inicializadoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!data?.fotos || inicializadoRef.current === id) return;
    inicializadoRef.current = id;

    const iniciais: FotoProcessada[] = data.fotos.map((f: any) => ({
      id: String(f.id),
      original: f.url,
      url: f.url,
      ajuste: AJUSTE_PADRAO,
      status: "processando" as const,
    }));
    setFotos(iniciais);
    setCapaId(iniciais[0]?.id ?? null);

    void processarFotosEmLote(iniciais, 2, (fotoId, resultado) => {
      setFotos((atual) =>
        atual.map((f) =>
          f.id === fotoId
            ? resultado
              ? { ...f, url: resultado.url, ajuste: resultado.ajuste, status: "pronta" }
              : { ...f, status: "erro" }
            : f,
        ),
      );
    });
  }, [data, id]);

  const mutation = useMutation({
    mutationFn: criarAnuncio,
    onSuccess: () => {
      toast.success("Anúncio criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["anuncios-admin"] });
      navigate({ to: "/admin/anuncios" });
    }
  });

  if (!id) return <div className="p-10 text-center">ID do veículo não fornecido.</div>;
  if (isLoading) return <div className="p-10 text-center">Carregando dados...</div>;
  if (!data || !data.veiculo) return <div className="p-10 text-center">Veículo não encontrado.</div>;

  const processando = fotos.some((f) => f.status === "processando");
  const prontas = fotos.filter((f) => f.status !== "processando").length;

  const handlePublicar = () => {
    mutation.mutate({
      data: {
        veiculo_id: id,
        titulo: titulo || `${data.veiculo.marca} ${data.veiculo.modelo} ${data.veiculo.ano_modelo}`,
        descricao: descricao || "Veículo vistoriado e disponível.",
        localizacao_publica: `${data.veiculo.vendedor_cidade}/${data.veiculo.vendedor_uf}`,
        fotos: fotos.map((f, i) => ({
          foto_url: f.url,
          foto_original_id: f.id,
          eh_capa: f.id === capaId,
          ordem: i,
          logo_ajuste: f.ajuste,
        })),
        status: "PUBLICADO"
      }
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate({ to: "/admin/anuncios" })}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
      </Button>
      <h1 className="text-2xl font-bold uppercase tracking-tight">Criar Anúncio: {data.veiculo.marca} {data.veiculo.modelo}</h1>

      <Card className="rounded-3xl shadow-sm border-slate-200">
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest">Fotos do anúncio</label>
              {fotos.length > 0 && (
                <span className="text-xs font-semibold text-slate-500">
                  {processando ? `Processando fotos com IA... ${prontas}/${fotos.length}` : "Todas as fotos processadas"}
                </span>
              )}
            </div>

            {fotos.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Nenhuma foto aprovada na análise pós-vistoria para este veículo.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {fotos.map((f) => (
                  <div key={f.id} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    <img src={f.url} alt="Foto do veículo" className="h-full w-full object-cover" />

                    {f.status === "processando" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50">
                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                      </div>
                    )}
                    {f.status === "erro" && (
                      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        <AlertTriangle className="h-3 w-3" /> Falhou
                      </span>
                    )}
                    {f.id === capaId && (
                      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        <Star className="h-3 w-3" /> Capa
                      </span>
                    )}

                    <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-[11px]"
                        disabled={f.status === "processando"}
                        onClick={() => setEditando(f)}
                      >
                        <Pencil className="mr-1 h-3 w-3" /> Ajustar logo
                      </Button>
                      {f.id !== capaId && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => setCapaId(f.id)}
                        >
                          Definir capa
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest">Título do Anúncio</label>
              <input
                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder={`${data.veiculo.marca} ${data.veiculo.modelo} ${data.veiculo.ano_modelo}`}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest">Localização (Pública)</label>
              <input
                className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50"
                value={`${data.veiculo.vendedor_cidade}/${data.veiculo.vendedor_uf}`}
                disabled
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-slate-500 tracking-widest">Descrição do Anúncio</label>
            <textarea
              className="w-full p-3 border border-slate-200 rounded-xl h-40 focus:ring-2 focus:ring-teal-500 outline-none"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Descreva os destaques do veículo para o comprador..."
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
             <Button variant="outline" className="rounded-xl px-6" onClick={() => navigate({ to: "/admin/anuncios" })}>
               Cancelar
             </Button>
             <Button
               onClick={handlePublicar}
               disabled={mutation.isPending || processando}
               className={cn("bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl px-8")}
             >
               {mutation.isPending ? "Publicando..." : processando ? (
                 <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando fotos...</>
               ) : (
                 <><CheckCircle className="mr-2 h-4 w-4" /> Publicar agora</>
               )}
             </Button>
          </div>
        </CardContent>
      </Card>

      {editando && (
        <EditorLogoFoto
          open={!!editando}
          onOpenChange={(open) => !open && setEditando(null)}
          fotoUrl={editando.original}
          ajusteInicial={editando.ajuste}
          onSalvar={(novaUrl, ajuste) => {
            setFotos((atual) =>
              atual.map((f) => (f.id === editando.id ? { ...f, url: novaUrl, ajuste, status: "pronta" } : f)),
            );
          }}
        />
      )}
    </div>
  );
}
