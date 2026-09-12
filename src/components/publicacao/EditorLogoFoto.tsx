import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Scan, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AJUSTE_PADRAO, bboxParaAjuste, compositarLogo, type AjusteLogo } from "@/lib/logo-foto";
import { detectarPlacaFotoFn } from "@/lib/fotos-anuncio.functions";
import { cn } from "@/lib/utils";

const LOGOS = {
  normal: "/logo-esse-ja-foi.png",
  branco: "/logo-esse-ja-foi-branco.png",
} as const;

const LARGURA_MINIMA = 0.08;
const LARGURA_MAXIMA = 0.6;

export function EditorLogoFoto({
  open,
  onOpenChange,
  fotoUrl,
  ajusteInicial,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fotoUrl: string;
  ajusteInicial?: AjusteLogo | null;
  onSalvar: (novaUrl: string, ajuste: AjusteLogo) => void;
}) {
  const [ajuste, setAjuste] = useState<AjusteLogo>(ajusteInicial || AJUSTE_PADRAO);
  const [detectando, setDetectando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aspecto, setAspecto] = useState<number | null>(null);
  const [tamanho, setTamanho] = useState<{ largura: number; altura: number } | null>(null);
  const palcoRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const arrasteRef = useRef<{ tipo: "mover" | "redimensionar"; offsetX: number; offsetY: number } | null>(null);

  // Calcula o tamanho do palco em pixels, sempre cabendo na tela — sem isso, uma foto
  // em retrato (ou muito larga) ficava maior que a viewport e escondia os botões do rodapé.
  function recalcularTamanho(proporcao: number) {
    const larguraDisponivel = containerRef.current?.clientWidth || 640;
    const alturaMaxima = Math.max(240, Math.round(window.innerHeight * 0.5));
    let largura = larguraDisponivel;
    let altura = largura / proporcao;
    if (altura > alturaMaxima) {
      altura = alturaMaxima;
      largura = altura * proporcao;
    }
    setTamanho({ largura: Math.round(largura), altura: Math.round(altura) });
  }

  useEffect(() => {
    if (!aspecto) return;
    recalcularTamanho(aspecto);
    function aoRedimensionar() {
      recalcularTamanho(aspecto);
    }
    window.addEventListener("resize", aoRedimensionar);
    return () => window.removeEventListener("resize", aoRedimensionar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspecto]);

  // Reabre com o ajuste correto sempre que a foto/ajuste inicial mudarem.
  const chaveAtual = `${fotoUrl}|${ajusteInicial?.xPct}|${ajusteInicial?.yPct}|${ajusteInicial?.larguraPct}`;
  const [chaveAplicada, setChaveAplicada] = useState(chaveAtual);
  if (chaveAtual !== chaveAplicada) {
    setChaveAplicada(chaveAtual);
    setAjuste(ajusteInicial || AJUSTE_PADRAO);
  }

  function posicaoRelativa(clientX: number, clientY: number) {
    const palco = palcoRef.current;
    if (!palco) return { x: 0, y: 0 };
    const rect = palco.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }

  function iniciarMover(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const pos = posicaoRelativa(e.clientX, e.clientY);
    arrasteRef.current = { tipo: "mover", offsetX: pos.x - ajuste.xPct, offsetY: pos.y - ajuste.yPct };
  }

  function iniciarRedimensionar(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    arrasteRef.current = { tipo: "redimensionar", offsetX: 0, offsetY: 0 };
  }

  function aoMoverPonteiro(e: React.PointerEvent) {
    const arraste = arrasteRef.current;
    if (!arraste) return;
    const pos = posicaoRelativa(e.clientX, e.clientY);

    if (arraste.tipo === "mover") {
      setAjuste((atual) => ({
        ...atual,
        xPct: clamp(pos.x - arraste.offsetX, 0, 1 - atual.larguraPct),
        yPct: clamp(pos.y - arraste.offsetY, 0, 1 - atual.larguraPct * 0.42),
      }));
    } else {
      setAjuste((atual) => {
        const novaLargura = clamp(pos.x - atual.xPct, LARGURA_MINIMA, LARGURA_MAXIMA);
        return { ...atual, larguraPct: novaLargura };
      });
    }
  }

  function pararArraste() {
    arrasteRef.current = null;
  }

  async function detectarPlaca() {
    setDetectando(true);
    try {
      const res = await detectarPlacaFotoFn({ data: { imagemUrl: fotoUrl } });
      if (!res.ok) {
        toast.error(res.motivo || "Não foi possível detectar a placa.");
        return;
      }
      if (!res.bbox) {
        toast.info("Nenhuma placa encontrada nessa foto. Posicione a logo manualmente.");
        return;
      }
      setAjuste((atual) => bboxParaAjuste(res.bbox!, atual.variante));
      toast.success("Placa localizada — ajuste fino se precisar.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao detectar a placa.");
    } finally {
      setDetectando(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      const url = await compositarLogo(fotoUrl, ajuste);
      onSalvar(url, ajuste);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar a foto processada.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Posicionar logo na foto</DialogTitle>
        </DialogHeader>

        <div ref={containerRef} className="flex justify-center">
          <div
            ref={palcoRef}
            className="relative touch-none select-none overflow-hidden rounded-xl bg-slate-900"
            style={
              tamanho
                ? { width: tamanho.largura, height: tamanho.altura }
                : { width: "100%", maxHeight: "50vh", aspectRatio: "4 / 3" }
            }
            onPointerMove={aoMoverPonteiro}
            onPointerUp={pararArraste}
            onPointerCancel={pararArraste}
          >
            <img
              src={fotoUrl}
              alt="Foto do veículo"
              className="h-full w-full object-contain"
              draggable={false}
              onLoad={(e) => setAspecto(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
            />
            <div
              onPointerDown={iniciarMover}
              className="absolute cursor-move touch-none"
              style={{
                left: `${ajuste.xPct * 100}%`,
                top: `${ajuste.yPct * 100}%`,
                width: `${ajuste.larguraPct * 100}%`,
              }}
            >
              <img
                src={LOGOS[ajuste.variante]}
                alt="Logo Esse Já Foi"
                className="pointer-events-none w-full drop-shadow-lg"
                draggable={false}
              />
              <div
                onPointerDown={iniciarRedimensionar}
                className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-teal-600 shadow"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(["normal", "branco"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAjuste((atual) => ({ ...atual, variante: v }))}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-bold transition-colors",
                  ajuste.variante === v ? "bg-white text-teal-700 shadow" : "text-slate-500",
                )}
              >
                Logo {v === "normal" ? "colorida" : "branca"}
              </button>
            ))}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={detectarPlaca} disabled={detectando}>
            {detectando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
            Detectar placa (IA)
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} disabled={salvando} className="bg-teal-600 hover:bg-teal-700">
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), Math.max(max, min));
}
