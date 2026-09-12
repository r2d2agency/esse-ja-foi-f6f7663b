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

/* ------------------------------------------------------------------------ *
 * Editor com múltiplas camadas: uma foto pode precisar de uma marca d'água
 * (logo solta, sem fundo, em qualquer lugar) E de uma ou mais áreas cobrindo
 * placas (retângulo branco + logo, podendo girar para acompanhar o ângulo
 * do carro em fotos 3/4). As duas coisas coexistem na mesma foto.
 * ------------------------------------------------------------------------ */

export type CamadaMarcaDagua = {
  id: string;
  tipo: "marca_dagua";
  xPct: number;
  yPct: number;
  larguraPct: number; // altura segue o próprio aspecto da logo
  variante: VarianteLogo;
};

export type CamadaPlaca = {
  id: string;
  tipo: "placa";
  xPct: number;
  yPct: number;
  larguraPct: number;
  alturaPct: number;
  rotacaoGraus: number; // gira em torno do centro da área, para acompanhar o ângulo da placa
};

export type Camada = CamadaMarcaDagua | CamadaPlaca;

function idAleatorio() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `camada-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function novaCamadaMarcaDagua(): CamadaMarcaDagua {
  return { id: idAleatorio(), tipo: "marca_dagua", xPct: 0.68, yPct: 0.8, larguraPct: 0.28, variante: "normal" };
}

export function novaCamadaPlaca(): CamadaPlaca {
  return { id: idAleatorio(), tipo: "placa", xPct: 0.36, yPct: 0.74, larguraPct: 0.22, alturaPct: 0.07, rotacaoGraus: 0 };
}

/** Mesma lógica de `bboxParaAjuste`, mas devolvendo uma camada de placa (sem rotação). */
export function bboxParaCamadaPlaca(bbox: BBoxNormalizado): CamadaPlaca {
  const ajuste = bboxParaAjuste(bbox);
  return {
    id: idAleatorio(),
    tipo: "placa",
    xPct: ajuste.xPct,
    yPct: ajuste.yPct,
    larguraPct: ajuste.larguraPct,
    alturaPct: ajuste.alturaPct ?? ajuste.larguraPct * 0.42,
    rotacaoGraus: 0,
  };
}

/** Desenha a foto original + todas as camadas (marca d'água e/ou placas), na ordem dada. */
export async function compositarCamadas(fotoUrl: string, camadas: Camada[]): Promise<string> {
  const variantesUsadas = Array.from(
    new Set<VarianteLogo>(camadas.map((c) => (c.tipo === "marca_dagua" ? c.variante : "normal"))),
  );
  if (variantesUsadas.length === 0) variantesUsadas.push("normal");

  const [foto, ...logosCarregados] = await Promise.all([
    carregarImagem(fotoUrl),
    ...variantesUsadas.map((v) => carregarImagem(LOGOS[v])),
  ]);
  const logos = {} as Record<VarianteLogo, HTMLImageElement>;
  variantesUsadas.forEach((v, i) => {
    logos[v] = logosCarregados[i]!;
  });

  const canvas = document.createElement("canvas");
  canvas.width = foto.naturalWidth || foto.width;
  canvas.height = foto.naturalHeight || foto.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponível neste dispositivo.");

  ctx.drawImage(foto, 0, 0, canvas.width, canvas.height);

  for (const camada of camadas) {
    const x = camada.xPct * canvas.width;
    const y = camada.yPct * canvas.height;
    const largura = camada.larguraPct * canvas.width;

    if (camada.tipo === "marca_dagua") {
      const logo = logos[camada.variante] ?? logos.normal;
      const proporcao = (logo.naturalWidth || logo.width) / (logo.naturalHeight || logo.height);
      const altura = largura / proporcao;
      ctx.drawImage(logo, x, y, largura, altura);
      continue;
    }

    // Camada "placa": retângulo branco sólido + logo colorida centralizada, podendo girar.
    const altura = camada.alturaPct * canvas.height;
    const cx = x + largura / 2;
    const cy = y + altura / 2;
    const anguloRad = (camada.rotacaoGraus * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(anguloRad);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-largura / 2, -altura / 2, largura, altura);

    const logo = logos.normal;
    const margem = 0.88;
    const proporcaoLogo = (logo.naturalWidth || logo.width) / (logo.naturalHeight || logo.height);
    let larguraLogo = largura * margem;
    let alturaLogo = larguraLogo / proporcaoLogo;
    if (alturaLogo > altura * margem) {
      alturaLogo = altura * margem;
      larguraLogo = alturaLogo * proporcaoLogo;
    }
    ctx.drawImage(logo, -larguraLogo / 2, -alturaLogo / 2, larguraLogo, alturaLogo);
    ctx.restore();
  }

  return canvas.toDataURL("image/jpeg", 0.9);
}
