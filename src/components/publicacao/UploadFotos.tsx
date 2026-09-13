import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ImagePlus, Loader2, MessageSquareText, Sparkles, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AJUSTE_PADRAO, bboxParaAjuste, compositarLogo } from "@/lib/logo-foto";
import { detectarPlacaFotoFn, gerarLegendaFotoFn, salvarLegendaFotoFn } from "@/lib/fotos-anuncio.functions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

async function enviarArquivo(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/public/upload", { method: "POST", body: fd });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.url ?? null;
}

/** Detecta a placa via IA e cobre com a logo da Esse Já Foi; sem placa detectada, aplica a marca d'água padrão. */
export async function processarComLogo(url: string): Promise<string> {
  let ajuste = AJUSTE_PADRAO;
  try {
    const res = await detectarPlacaFotoFn({ data: { imagemUrl: url } });
    if (res.ok && res.bbox) ajuste = bboxParaAjuste(res.bbox);
  } catch {
    // sem IA disponível — segue com a marca d'água padrão
  }
  try {
    return await compositarLogo(url, ajuste);
  } catch (err) {
    console.error("[UploadFotos] falha ao aplicar a logo, mantendo a foto original:", err);
    return url;
  }
}

export function UploadFotos({
  fotos,
  onChange,
  fotosVendedor = [],
  fotosVendedorJaProcessadas = false,
  veiculoId,
  legendas = {},
  onChangeLegendas,
  notasVendedor = {},
  veiculoContexto,
}: {
  fotos: string[];
  onChange: (fotos: string[]) => void;
  /** Fotos que o vendedor já enviou no cadastro do veículo, oferecidas aqui para reaproveitar. */
  fotosVendedor?: string[];
  /** Se true, `fotosVendedor` já tem a logo/marca d'água aplicada — não reprocessa ao usar. */
  fotosVendedorJaProcessadas?: boolean;
  /** Id do veículo — necessário para editar a legenda de cada foto (mostrada ao comprador). */
  veiculoId?: string;
  /** Legendas atuais por URL de foto (compartilhadas entre os canais do mesmo veículo). */
  legendas?: Record<string, string>;
  onChangeLegendas?: (legendas: Record<string, string>) => void;
  /** Nota original do vendedor/analista por URL de foto — ponto de partida da legenda. */
  notasVendedor?: Record<string, string>;
  /** Dados do veículo usados pela IA para sugerir a legenda. */
  veiculoContexto?: { marca?: string; modelo?: string; anoModelo?: string | number };
}) {
  const [dragging, setDragging] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [aplicandoSelecionadas, setAplicandoSelecionadas] = useState(false);
  const [editandoLegendaUrl, setEditandoLegendaUrl] = useState<string | null>(null);
  const [rascunhoLegenda, setRascunhoLegenda] = useState("");
  const [gerandoLegendaIA, setGerandoLegendaIA] = useState(false);
  const [salvandoLegenda, setSalvandoLegenda] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const zonaRef = useRef<HTMLDivElement>(null);

  function abrirEdicaoLegenda(url: string) {
    setEditandoLegendaUrl(url);
    setRascunhoLegenda(legendas[url] || notasVendedor[url] || "");
  }

  async function gerarLegendaComIA() {
    setGerandoLegendaIA(true);
    try {
      const res: any = await gerarLegendaFotoFn({
        data: {
          notaBase: rascunhoLegenda,
          marca: veiculoContexto?.marca,
          modelo: veiculoContexto?.modelo,
          anoModelo: veiculoContexto?.anoModelo,
        },
      });
      if (!res?.ok) {
        toast.error(res?.motivo || "Não foi possível gerar a legenda com IA.");
        return;
      }
      setRascunhoLegenda(res.legenda);
    } finally {
      setGerandoLegendaIA(false);
    }
  }

  async function salvarLegendaAtual() {
    if (!editandoLegendaUrl || !veiculoId) return;
    setSalvandoLegenda(true);
    try {
      const texto = rascunhoLegenda.trim();
      const res: any = await salvarLegendaFotoFn({
        data: { veiculoId, fotoUrl: editandoLegendaUrl, legenda: texto },
      });
      if (!res?.ok) {
        toast.error(res?.message || "Não foi possível salvar a legenda.");
        return;
      }
      onChangeLegendas?.({ ...legendas, [editandoLegendaUrl]: texto });
      toast.success("Legenda salva.");
      setEditandoLegendaUrl(null);
    } finally {
      setSalvandoLegenda(false);
    }
  }

  const disponiveisVendedor = useMemo(
    () => fotosVendedor.filter((url) => !fotos.includes(url)),
    [fotosVendedor, fotos],
  );

  function alternarSelecao(url: string) {
    setSelecionadas((prev) => (prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]));
  }

  async function usarSelecionadas() {
    if (selecionadas.length === 0) return;
    setAplicandoSelecionadas(true);
    try {
      const urls = fotosVendedorJaProcessadas
        ? selecionadas
        : await Promise.all(selecionadas.map((url) => processarComLogo(url)));
      onChange([...fotos, ...urls]);
      setSelecionadas([]);
      toast.success(
        fotosVendedorJaProcessadas
          ? `${urls.length} foto(s) do vendedor adicionada(s).`
          : `${urls.length} foto(s) do vendedor adicionada(s) com a logo aplicada.`,
      );
    } finally {
      setAplicandoSelecionadas(false);
    }
  }

  const enviarLista = useCallback(
    async (lista: File[]) => {
      const imagens = lista.filter((f) => f.type.startsWith("image/"));
      if (imagens.length === 0) return;
      setEnviando(true);
      try {
        const urls: string[] = [];
        for (const file of imagens) {
          const url = await enviarArquivo(file);
          if (url) urls.push(await processarComLogo(url));
          else toast.error(`Falha ao enviar ${file.name}`);
        }
        if (urls.length > 0) {
          onChange([...fotos, ...urls]);
          toast.success(`${urls.length} foto(s) adicionada(s) com a logo aplicada.`);
        }
      } finally {
        setEnviando(false);
      }
    },
    [fotos, onChange],
  );

  // Colar (Ctrl+V) imagens da área de transferência
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const itens = Array.from(e.clipboardData?.items || []);
      const arquivos = itens
        .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter(Boolean) as File[];
      if (arquivos.length > 0) {
        e.preventDefault();
        void enviarLista(arquivos);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enviarLista]);

  return (
    <div className="space-y-3">
      {fotos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {fotos.map((url, i) => (
            <div key={`${url.slice(0, 24)}-${i}`} className="relative h-20 w-28 overflow-hidden rounded-xl bg-slate-100">
              <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(fotos.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 rounded-full bg-slate-950/70 p-1 text-white"
                aria-label="Remover foto"
              >
                <X className="h-3 w-3" />
              </button>
              {veiculoId && (
                <button
                  type="button"
                  onClick={() => abrirEdicaoLegenda(url)}
                  className={cn(
                    "absolute bottom-1 left-1 flex items-center gap-1 rounded-full px-1.5 py-1 text-white transition-colors",
                    legendas[url]
                      ? "bg-teal-600 hover:bg-teal-700"
                      : notasVendedor[url]
                        ? "bg-amber-500 hover:bg-amber-600"
                        : "bg-slate-950/70 hover:bg-slate-950/90",
                  )}
                  title={
                    legendas[url]
                      ? "Editar legenda para o comprador"
                      : notasVendedor[url]
                        ? "Há uma nota do envio — clique para transformar em legenda"
                        : "Adicionar legenda para o comprador"
                  }
                >
                  <MessageSquareText className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editandoLegendaUrl && (
        <div className="space-y-2 rounded-2xl border border-teal-200 bg-teal-50/60 p-3">
          <div className="flex gap-3">
            <img
              src={editandoLegendaUrl}
              alt="Foto selecionada"
              className="h-16 w-20 shrink-0 rounded-lg object-cover"
            />
            <div className="flex-1 space-y-2">
              <p className="text-xs font-bold text-slate-600">
                Legenda curta para o comprador (aparece como um "i" sobre a foto)
              </p>
              <Textarea
                rows={2}
                maxLength={140}
                autoFocus
                placeholder="Ex.: risco leve no para-choque traseiro"
                value={rascunhoLegenda}
                onChange={(e) => setRascunhoLegenda(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={gerandoLegendaIA}
              onClick={gerarLegendaComIA}
            >
              {gerandoLegendaIA ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Gerar com IA
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-teal-600 hover:bg-teal-700"
              disabled={salvandoLegenda}
              onClick={salvarLegendaAtual}
            >
              {salvandoLegenda && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar legenda
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditandoLegendaUrl(null)}
              disabled={salvandoLegenda}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {disponiveisVendedor.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
            <UserRound className="h-3.5 w-3.5" />
            {fotosVendedorJaProcessadas ? "Fotos do vendedor já processadas (logo aplicada)" : "Fotos enviadas pelo vendedor"}
          </p>
          <div className="flex flex-wrap gap-3">
            {disponiveisVendedor.map((url, i) => {
              const marcada = selecionadas.includes(url);
              return (
                <button
                  key={`${url.slice(0, 24)}-${i}`}
                  type="button"
                  onClick={() => alternarSelecao(url)}
                  className={cn(
                    "relative h-20 w-28 overflow-hidden rounded-xl border-2 bg-slate-100 transition-colors",
                    marcada ? "border-teal-500" : "border-transparent hover:border-teal-300",
                  )}
                  aria-pressed={marcada}
                >
                  <img src={url} alt="Foto enviada pelo vendedor" className="h-full w-full object-cover" />
                  {marcada && (
                    <span className="absolute right-1 top-1 rounded-full bg-teal-600 p-1 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={selecionadas.length === 0 || aplicandoSelecionadas}
            onClick={usarSelecionadas}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aplicandoSelecionadas && <Loader2 className="h-4 w-4 animate-spin" />}
            Usar {selecionadas.length > 0 ? selecionadas.length : ""} foto(s) selecionada(s)
          </button>
        </div>
      )}

      <div
        ref={zonaRef}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void enviarLista(Array.from(e.dataTransfer.files || []));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50 hover:border-teal-400",
        )}
      >
        {enviando ? (
          <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        ) : (
          <ImagePlus className="h-6 w-6 text-teal-600" />
        )}
        <p className="text-sm font-bold text-slate-700">
          {enviando ? "Enviando fotos..." : "Arraste e solte, cole (Ctrl+V) ou clique para enviar"}
        </p>
        <p className="text-xs font-medium text-slate-500">JPG, PNG ou WEBP — várias fotos de uma vez.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void enviarLista(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
