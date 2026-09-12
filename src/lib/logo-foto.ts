export type VarianteLogo = "normal" | "branco";

export type AjusteLogo = {
  xPct: number; // posição do canto esquerdo da área, em % da largura da foto (0-1)
  yPct: number; // posição do topo da área, em % da altura da foto (0-1)
  larguraPct: number; // largura da área, em % da largura da foto (0-1)
  // Altura da área, em % da altura da foto (0-1). A área é sempre coberta por um
  // retângulo branco sólido (garante que a placa fica 100% tampada, já que a logo
  // sozinha pode ter um formato bem diferente do formato da placa), com a logo
  // centralizada dentro. Opcional só para ler ajustes antigos salvos antes dessa
  // mudança — novos ajustes sempre definem.
  alturaPct?: number;
  variante: VarianteLogo;
};

export const AJUSTE_PADRAO: AjusteLogo = {
  xPct: 0.68,
  yPct: 0.8,
  larguraPct: 0.22,
  alturaPct: 0.07,
  variante: "normal",
};

/** Preenche alturaPct quando ausente (ajuste salvo antes dessa área ter altura própria). */
export function comAltura(ajuste: AjusteLogo): Required<Pick<AjusteLogo, "alturaPct">> & AjusteLogo {
  if (ajuste.alturaPct != null) return ajuste as any;
  return { ...ajuste, alturaPct: ajuste.larguraPct * 0.42 };
}

const LOGOS: Record<VarianteLogo, string> = {
  normal: "/logo-esse-ja-foi.png",
  branco: "/logo-esse-ja-foi-branco.png",
};

export type BBoxNormalizado = { x: number; y: number; width: number; height: number };

/** Converte a bounding box da placa (0-1, vinda da IA) numa área de cobertura com margem de segurança. */
export function bboxParaAjuste(bbox: BBoxNormalizado, variante: VarianteLogo = "normal"): AjusteLogo {
  const margem = 0.35; // cobre a placa com folga em vez de encostar exatamente na borda detectada
  const largura = Math.min(1, bbox.width * (1 + margem * 2));
  const altura = Math.min(1, bbox.height * (1 + margem * 2));
  const centroX = bbox.x + bbox.width / 2;
  const centroY = bbox.y + bbox.height / 2;

  return {
    xPct: clamp(centroX - largura / 2, 0, 1 - largura),
    yPct: clamp(centroY - altura / 2, 0, 1 - altura),
    larguraPct: largura,
    alturaPct: altura,
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

/**
 * Desenha a foto original + um retângulo branco sólido cobrindo a área marcada (garante
 * que a placa fica 100% tampada) com a logo centralizada dentro, e devolve o resultado
 * como data URL.
 */
export async function compositarLogo(fotoUrl: string, ajusteBruto: AjusteLogo): Promise<string> {
  const ajuste = comAltura(ajusteBruto);
  const [foto, logo] = await Promise.all([carregarImagem(fotoUrl), carregarImagem(LOGOS[ajuste.variante])]);

  const canvas = document.createElement("canvas");
  canvas.width = foto.naturalWidth || foto.width;
  canvas.height = foto.naturalHeight || foto.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste dispositivo.");

  ctx.drawImage(foto, 0, 0, canvas.width, canvas.height);

  const x = ajuste.xPct * canvas.width;
  const y = ajuste.yPct * canvas.height;
  const larguraArea = ajuste.larguraPct * canvas.width;
  const alturaArea = ajuste.alturaPct * canvas.height;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, larguraArea, alturaArea);

  // A logo ocupa ~88% da área marcada, preservando o próprio aspecto (sem distorcer),
  // deixando uma margem branca visível nas bordas.
  const margem = 0.88;
  const proporcaoLogo = (logo.naturalWidth || logo.width) / (logo.naturalHeight || logo.height);
  let larguraLogo = larguraArea * margem;
  let alturaLogo = larguraLogo / proporcaoLogo;
  if (alturaLogo > alturaArea * margem) {
    alturaLogo = alturaArea * margem;
    larguraLogo = alturaLogo * proporcaoLogo;
  }
  const xLogo = x + (larguraArea - larguraLogo) / 2;
  const yLogo = y + (alturaArea - alturaLogo) / 2;
  ctx.drawImage(logo, xLogo, yLogo, larguraLogo, alturaLogo);

  return canvas.toDataURL("image/jpeg", 0.9);
}
