import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, PenSquare, Plus, RotateCw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  compositarCamadas,
  novaCamadaMarcaDagua,
  novaCamadaPlaca,
  type Camada,
  type CamadaPlaca,
  type VarianteLogo,
} from "@/lib/logo-foto";
import { cn } from "@/lib/utils";

const LOGOS: Record<VarianteLogo, string> = {
  normal: "/logo-esse-ja-foi.png",
  branco: "/logo-esse-ja-foi-branco.png",
};

const TAMANHO_MINIMO = 0.04;
const TAMANHO_MAXIMO = 0.9;

type Arraste =
  | { tipo: "mover"; camadaId: string; offsetX: number; offsetY: number }
  | { tipo: "redimensionar"; camadaId: string }
  | { tipo: "rotacionar"; camadaId: string; centroX: number; centroY: number; anguloInicial: number; rotacaoInicial: number }
  | { tipo: "desenhar"; camadaId: string; x0: number; y0: number };

function camadasIniciaisPadrao(camadas?: Camada[] | null): Camada[] {
  return camadas && camadas.length > 0 ? camadas : [novaCamadaMarcaDagua()];
}

export function EditorLogoFoto({
  open,
  onOpenChange,
  fotoUrl,
  camadasIniciais,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fotoUrl: string;
  camadasIniciais?: Camada[] | null;
  onSalvar: (novaUrl: string, camadas: Camada[]) => void;
}) {
  const [camadas, setCamadas] = useState<Camada[]>(() => camadasIniciaisPadrao(camadasIniciais));
  const [selecionadaId, setSelecionadaId] = useState<string | null>(() => camadas[0]?.id ?? null);
  const [desenhandoPlaca, setDesenhandoPlaca] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aspecto, setAspecto] = useState<number | null>(null);
  const [tamanho, setTamanho] = useState<{ largura: number; altura: number } | null>(null);
  const palcoRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const arrasteRef = useRef<Arraste | null>(null);

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

  // Reabre do zero sempre que a foto muda.
  const [fotoAplicada, setFotoAplicada] = useState(fotoUrl);
  if (fotoUrl !== fotoAplicada) {
    setFotoAplicada(fotoUrl);
    const iniciais = camadasIniciaisPadrao(camadasIniciais);
    setCamadas(iniciais);
    setSelecionadaId(iniciais[0]?.id ?? null);
    setDesenhandoPlaca(false);
  }

  function atualizarCamada(id: string, atualizar: (c: Camada) => Camada) {
    setCamadas((atual) => atual.map((c) => (c.id === id ? atualizar(c) : c)));
  }

  function removerCamada(id: string) {
    setCamadas((atual) => atual.filter((c) => c.id !== id));
    setSelecionadaId((atual) => (atual === id ? null : atual));
  }

  function posicaoRelativa(clientX: number, clientY: number) {
    const palco = palcoRef.current;
    if (!palco) return { x: 0, y: 0 };
    const rect = palco.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  }

  function posicaoPixel(clientX: number, clientY: number) {
    const palco = palcoRef.current;
    if (!palco) return { x: 0, y: 0 };
    const rect = palco.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function iniciarMover(camada: Camada, e: React.PointerEvent) {
    if (desenhandoPlaca) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelecionadaId(camada.id);
    const pos = posicaoRelativa(e.clientX, e.clientY);
    arrasteRef.current = { tipo: "mover", camadaId: camada.id, offsetX: pos.x - camada.xPct, offsetY: pos.y - camada.yPct };
  }

  function iniciarRedimensionar(camada: Camada, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelecionadaId(camada.id);
    arrasteRef.current = { tipo: "redimensionar", camadaId: camada.id };
  }

  function iniciarRotacionar(camada: CamadaPlaca, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelecionadaId(camada.id);
    const palco = palcoRef.current;
    const rect = palco?.getBoundingClientRect();
    const larguraPx = rect?.width ?? 1;
    const alturaPx = rect?.height ?? 1;
    const centroX = (camada.xPct + camada.larguraPct / 2) * larguraPx;
    const centroY = (camada.yPct + camada.alturaPct / 2) * alturaPx;
    const pos = posicaoPixel(e.clientX, e.clientY);
    const anguloInicial = Math.atan2(pos.y - centroY, pos.x - centroX) * (180 / Math.PI);
    arrasteRef.current = {
      tipo: "rotacionar",
      camadaId: camada.id,
      centroX,
      centroY,
      anguloInicial,
      rotacaoInicial: camada.rotacaoGraus,
    };
  }

  function iniciarDesenhoPlaca(e: React.PointerEvent) {
    if (!desenhandoPlaca) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const pos = posicaoRelativa(e.clientX, e.clientY);
    const camada = novaCamadaPlaca();
    camada.xPct = pos.x;
    camada.yPct = pos.y;
    camada.larguraPct = 0;
    camada.alturaPct = 0;
    setCamadas((atual) => [...atual, camada]);
    setSelecionadaId(camada.id);
    arrasteRef.current = { tipo: "desenhar", camadaId: camada.id, x0: pos.x, y0: pos.y };
  }

  function aoMoverPonteiro(e: React.PointerEvent) {
    const arraste = arrasteRef.current;
    if (!arraste) return;

    if (arraste.tipo === "rotacionar") {
      const pos = posicaoPixel(e.clientX, e.clientY);
      const anguloAtual = Math.atan2(pos.y - arraste.centroY, pos.x - arraste.centroX) * (180 / Math.PI);
      const delta = anguloAtual - arraste.anguloInicial;
      atualizarCamada(arraste.camadaId, (c) =>
        c.tipo === "placa" ? { ...c, rotacaoGraus: arraste.rotacaoInicial + delta } : c,
      );
      return;
    }

    const pos = posicaoRelativa(e.clientX, e.clientY);

    if (arraste.tipo === "mover") {
      atualizarCamada(arraste.camadaId, (c) => ({
        ...c,
        xPct: clamp(pos.x - arraste.offsetX, 0, 1 - c.larguraPct),
        yPct: clamp(pos.y - arraste.offsetY, 0, 1 - (c.tipo === "placa" ? c.alturaPct : 0)),
      }));
    } else if (arraste.tipo === "redimensionar") {
      atualizarCamada(arraste.camadaId, (c) => {
        const larguraNova = clamp(pos.x - c.xPct, TAMANHO_MINIMO, TAMANHO_MAXIMO);
        if (c.tipo === "marca_dagua") return { ...c, larguraPct: larguraNova };
        return { ...c, larguraPct: larguraNova, alturaPct: clamp(pos.y - c.yPct, TAMANHO_MINIMO, TAMANHO_MAXIMO) };
      });
    } else {
      atualizarCamada(arraste.camadaId, (c) =>
        c.tipo === "placa"
          ? {
              ...c,
              xPct: Math.min(arraste.x0, pos.x),
              yPct: Math.min(arraste.y0, pos.y),
              larguraPct: Math.abs(pos.x - arraste.x0),
              alturaPct: Math.abs(pos.y - arraste.y0),
            }
          : c,
      );
    }
  }

  function pararArraste() {
    if (arrasteRef.current?.tipo === "desenhar") {
      const { camadaId } = arrasteRef.current;
      setDesenhandoPlaca(false);
      setCamadas((atual) => {
        const c = atual.find((x) => x.id === camadaId);
        if (c && c.tipo === "placa" && (c.larguraPct < TAMANHO_MINIMO || c.alturaPct < TAMANHO_MINIMO)) {
          // Área minúscula (clique sem arrastar de fato) — descarta.
          return atual.filter((x) => x.id !== camadaId);
        }
        return atual;
      });
    }
    arrasteRef.current = null;
  }

  async function salvar() {
    setSalvando(true);
    try {
      const url = await compositarCamadas(fotoUrl, camadas);
      onSalvar(url, camadas);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar a foto processada.");
    } finally {
      setSalvando(false);
    }
  }

  const selecionada = camadas.find((c) => c.id === selecionadaId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Marca d'água e área da placa</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-slate-500">
          {desenhandoPlaca
            ? "Clique e arraste sobre a placa para desenhar a área que será tampada."
            : "Toque numa camada para selecioná-la — arraste para mover, a alça no canto redimensiona."}
        </p>

        <div ref={containerRef} className="flex justify-center">
          <div
            ref={palcoRef}
            className={cn(
              "relative touch-none select-none overflow-hidden rounded-xl bg-slate-900",
              desenhandoPlaca && "cursor-crosshair",
            )}
            style={
              tamanho
                ? { width: tamanho.largura, height: tamanho.altura }
                : { width: "100%", maxHeight: "50vh", aspectRatio: "4 / 3" }
            }
            onPointerDown={iniciarDesenhoPlaca}
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

            {camadas.map((camada) => {
              const ativa = selecionadaId === camada.id;

              if (camada.tipo === "marca_dagua") {
                return (
                  <div
                    key={camada.id}
                    onPointerDown={(e) => iniciarMover(camada, e)}
                    className={cn(
                      "absolute touch-none",
                      !desenhandoPlaca && "cursor-move",
                      ativa && "outline outline-2 outline-teal-400",
                    )}
                    style={{
                      left: `${camada.xPct * 100}%`,
                      top: `${camada.yPct * 100}%`,
                      width: `${camada.larguraPct * 100}%`,
                    }}
                  >
                    <img
                      src={LOGOS[camada.variante]}
                      alt="Logo Esse Já Foi"
                      className="pointer-events-none w-full drop-shadow-lg"
                      draggable={false}
                    />
                    {ativa && !desenhandoPlaca && (
                      <>
                        <div
                          onPointerDown={(e) => iniciarRedimensionar(camada, e)}
                          className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-teal-600 shadow"
                        />
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            removerCamada(camada.id);
                          }}
                          className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-rose-600 text-white shadow"
                          aria-label="Remover marca d'água"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={camada.id}
                  onPointerDown={(e) => iniciarMover(camada, e)}
                  className={cn(
                    "absolute flex touch-none items-center justify-center bg-white/90",
                    !desenhandoPlaca && "cursor-move",
                    ativa && "outline outline-2 outline-teal-400",
                  )}
                  style={{
                    left: `${camada.xPct * 100}%`,
                    top: `${camada.yPct * 100}%`,
                    width: `${camada.larguraPct * 100}%`,
                    height: `${camada.alturaPct * 100}%`,
                    transform: `rotate(${camada.rotacaoGraus}deg)`,
                  }}
                >
                  <img
                    src={LOGOS.normal}
                    alt="Logo Esse Já Foi"
                    className="pointer-events-none max-h-[88%] max-w-[88%] object-contain"
                    draggable={false}
                  />
                  {ativa && !desenhandoPlaca && (
                    <>
                      <div
                        onPointerDown={(e) => iniciarRedimensionar(camada, e)}
                        className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-teal-600 shadow"
                      />
                      <div
                        onPointerDown={(e) => iniciarRotacionar(camada, e)}
                        className="absolute -top-7 left-1/2 flex h-5 w-5 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white bg-amber-500 text-white shadow"
                        aria-label="Girar área da placa"
                      >
                        <RotateCw className="h-3 w-3" />
                      </div>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          removerCamada(camada.id);
                        }}
                        className="absolute -top-2 -left-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-rose-600 text-white shadow"
                        aria-label="Remover área da placa"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const nova = novaCamadaMarcaDagua();
            setCamadas((atual) => [...atual, nova]);
            setSelecionadaId(nova.id);
            setDesenhandoPlaca(false);
          }}>
            <Plus className="h-4 w-4" /> Marca d'água
          </Button>
          <Button
            type="button"
            variant={desenhandoPlaca ? "default" : "outline"}
            size="sm"
            className={desenhandoPlaca ? "bg-teal-600 hover:bg-teal-700" : undefined}
            onClick={() => setDesenhandoPlaca((v) => !v)}
          >
            <PenSquare className="h-4 w-4" />
            {desenhandoPlaca ? "Desenhando..." : "Desenhar área da placa"}
          </Button>
        </div>

        {selecionada?.tipo === "marca_dagua" && (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="text-xs font-bold text-slate-600">Cor da marca d'água selecionada:</span>
            <div className="flex gap-1 rounded-lg bg-white p-1 shadow-sm">
              {(["normal", "branco"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => atualizarCamada(selecionada.id, (c) => (c.tipo === "marca_dagua" ? { ...c, variante: v } : c))}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-bold transition-colors",
                    selecionada.variante === v ? "bg-teal-600 text-white" : "text-slate-500",
                  )}
                >
                  {v === "normal" ? "Colorida" : "Branca"}
                </button>
              ))}
            </div>
          </div>
        )}

        {selecionada?.tipo === "placa" && (
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="text-xs font-bold text-slate-600">Rotação da área selecionada:</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={Math.round(selecionada.rotacaoGraus)}
              onChange={(e) =>
                atualizarCamada(selecionada.id, (c) =>
                  c.tipo === "placa" ? { ...c, rotacaoGraus: Number(e.target.value) } : c,
                )
              }
              className="flex-1"
            />
            <span className="w-10 text-right text-xs font-bold text-slate-600">{Math.round(selecionada.rotacaoGraus)}°</span>
          </div>
        )}

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
