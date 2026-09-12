import { detectarPlacaFotoFn } from "@/lib/fotos-anuncio.functions";

export type VarianteLogo = "normal" | "branco";

export type AjusteLogo = {
  xPct: number; // posição do canto esquerdo da logo, em % da largura da foto (0-1)
  yPct: number; // posição do topo da logo, em % da altura da foto (0-1)
  larguraPct: number; // largura da logo, em % da largura da foto (0-1)
  variante: VarianteLogo;
};

export const AJUSTE_PADRAO: AjusteLogo = {
  xPct: 0.68,
  yPct: 0.8,
  larguraPct: 0.28,
  variante: "normal",
};

const LOGOS: Record<VarianteLogo, string> = {
  normal: "/logo-esse-ja-foi.png",
  branco: "/logo-esse-ja-foi-branco.png",
};

export type BBoxNormalizado = { x: number; y: number; width: number; height: number };

/** Converte a bounding box da placa (0-1, vinda da IA) num ajuste de logo com margem de segurança. */
export function bboxParaAjuste(bbox: BBoxNormalizado, variante: VarianteLogo = "normal"): AjusteLogo {
  const margem = 0.35; // cobre a placa com folga em vez de encostar exatamente na borda detectada
  const largura = Math.min(1, bbox.width * (1 + margem * 2));
  const centroX = bbox.x + bbox.width / 2;
  const centroY = bbox.y + bbox.height / 2;
  const alturaLogoRelativaLargura = 0.42; // proporção aproximada da logo, só para estimar a altura ocupada
  const altura = largura * alturaLogoRelativaLargura;

  return {
    xPct: clamp(centroX - largura / 2, 0, 1 - largura),
    yPct: clamp(centroY - altura / 2, 0, 1 - altura),
    larguraPct: largura,
    variante,
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max <= min ? min : max);
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Não foi possível carregar a imagem: ${src.slice(0, 60)}`));
    img.src = src;
  });
}

/** Desenha a foto original + a logo posicionada conforme o ajuste, e devolve a imagem final como data URL. */
export async function compositarLogo(fotoUrl: string, ajuste: AjusteLogo): Promise<string> {
  const [foto, logo] = await Promise.all([carregarImagem(fotoUrl), carregarImagem(LOGOS[ajuste.variante])]);

  const canvas = document.createElement("canvas");
  canvas.width = foto.naturalWidth || foto.width;
  canvas.height = foto.naturalHeight || foto.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste dispositivo.");

  ctx.drawImage(foto, 0, 0, canvas.width, canvas.height);

  const larguraLogo = ajuste.larguraPct * canvas.width;
  const alturaLogo = larguraLogo * ((logo.naturalHeight || logo.height) / (logo.naturalWidth || logo.width));
  const x = ajuste.xPct * canvas.width;
  const y = ajuste.yPct * canvas.height;
  ctx.drawImage(logo, x, y, larguraLogo, alturaLogo);

  return canvas.toDataURL("image/jpeg", 0.9);
}

/**
 * Detecta a placa via IA, cobre com a logo da Esse Já Foi (ou a marca d'água padrão, se não detectar)
 * e faz o upload do resultado, devolvendo a URL final já persistida.
 */
export async function processarFotoComLogo(fotoUrl: string): Promise<string> {
  let ajuste = AJUSTE_PADRAO;
  try {
    const res = await detectarPlacaFotoFn({ data: { imagemUrl: fotoUrl } });
    if (res.ok && res.bbox) ajuste = bboxParaAjuste(res.bbox);
  } catch {
    // sem IA disponível — segue com a marca d'água padrão
  }

  const dataUrl = await compositarLogo(fotoUrl, ajuste);

  const blob = await fetch(dataUrl).then((r) => r.blob());
  const fd = new FormData();
  fd.append("file", blob, "foto-processada.jpg");
  const resposta = await fetch("/api/public/upload", { method: "POST", body: fd });
  if (!resposta.ok) throw new Error("Falha ao salvar a foto processada.");
  const json = await resposta.json().catch(() => null);
  if (!json?.url) throw new Error("Upload não retornou uma URL válida.");
  return json.url as string;
}
