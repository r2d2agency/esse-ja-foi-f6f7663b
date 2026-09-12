import { sql } from "drizzle-orm";
import { db } from "./index";

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

const PROMPT_DETECCAO_PLACA = `Você analisa fotos de veículos da plataforma Esse Já Foi para localizar a placa do carro.

Responda SEMPRE em JSON estrito, exatamente neste formato:
{
  "placa_detectada": true ou false,
  "x": número entre 0 e 1 (posição horizontal do canto esquerdo da placa, em fração da largura da imagem),
  "y": número entre 0 e 1 (posição vertical do canto superior da placa, em fração da altura da imagem),
  "width": número entre 0 e 1 (largura da placa, em fração da largura da imagem),
  "height": número entre 0 e 1 (altura da placa, em fração da altura da imagem)
}

Regras:
- Se a placa não aparecer na foto (ex: foto de interior, motor, painel, pneu), responda "placa_detectada": false e x/y/width/height como 0.
- As coordenadas são relativas ao tamanho da imagem (0 = topo/esquerda, 1 = base/direita).
- Responda somente com o JSON, sem texto adicional antes ou depois.`;

async function getConfigOpenAI(): Promise<{ apiKey: string; model: string }> {
  const d = requireDb();
  const { ensureAdminTables } = await import("./admin.server");
  await ensureAdminTables();
  const rows = (await d.execute(sql`
    SELECT chave, valor FROM configuracoes_sistema
    WHERE chave IN ('openai_api_key', 'openai_model');
  `)) as any;
  const lista: { chave: string; valor: string }[] = rows.rows || rows || [];
  const mapa = Object.fromEntries(lista.map((r) => [r.chave, r.valor]));
  return { apiKey: mapa["openai_api_key"] || "", model: mapa["openai_model"] || "gpt-4o" };
}

function extrairJson(texto: string): any {
  try {
    return JSON.parse(texto);
  } catch {
    const match = texto.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Resposta da IA não veio em formato JSON válido.");
  }
}

const PROMPT_LEGENDA_FOTO = `Você escreve legendas curtas para fotos de veículos anunciados na plataforma Esse Já Foi, vistas por compradores.

Regras:
- Uma frase só, no máximo 60 caracteres, em português do Brasil.
- Tom vendedor, direto e verdadeiro — nunca invente um detalhe que não esteja na nota recebida.
- Sem emojis, sem aspas, sem ponto final.
- Se a nota recebida descrever um problema (ex: risco, amassado), mantenha a legenda honesta mas neutra — não esconda nem exagere o defeito.
- Responda SOMENTE com a legenda, sem texto adicional antes ou depois.`;

export type ResultadoLegendaFoto = { ok: true; legenda: string } | { ok: false; motivo: string };

/**
 * Reescreve a nota da foto (do vendedor ou do analista) como uma legenda curta e
 * atrativa para o comprador, usando a mesma chave/modelo configurados em
 * /admin/configuracoes para IA. Nunca lança erro — se faltar chave ou a chamada falhar,
 * o chamador decide o que fazer (ex.: manter a nota original).
 */
export async function gerarLegendaFoto(
  notaBase: string,
  contexto?: { marca?: string | null; modelo?: string | null; anoModelo?: string | number | null },
): Promise<ResultadoLegendaFoto> {
  try {
    const { apiKey, model } = await getConfigOpenAI();
    if (!apiKey) return { ok: false, motivo: "Chave da OpenAI não configurada." };

    const veiculoDesc = [contexto?.marca, contexto?.modelo, contexto?.anoModelo]
      .filter(Boolean)
      .join(" ");
    const entrada = notaBase?.trim()
      ? `Veículo: ${veiculoDesc || "não informado"}\nNota sobre a foto: ${notaBase.trim()}`
      : `Veículo: ${veiculoDesc || "não informado"}\nSem nota específica — crie uma legenda genérica e atrativa para uma foto do veículo.`;

    const resposta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 60,
        messages: [
          { role: "system", content: PROMPT_LEGENDA_FOTO },
          { role: "user", content: entrada },
        ],
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      return { ok: false, motivo: `Falha na chamada à OpenAI (HTTP ${resposta.status}): ${corpo.slice(0, 300)}` };
    }

    const payload: any = await resposta.json();
    const legenda = String(payload?.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
    if (!legenda) return { ok: false, motivo: "OpenAI retornou resposta vazia." };

    return { ok: true, legenda };
  } catch (err: any) {
    console.error("[ia-fotos] Erro ao gerar legenda:", err);
    return { ok: false, motivo: err?.message || "Erro desconhecido ao gerar a legenda." };
  }
}

export type BBoxPlaca = { x: number; y: number; width: number; height: number };
export type ResultadoDeteccaoPlaca =
  | { ok: true; bbox: BBoxPlaca | null }
  | { ok: false; motivo: string };

/**
 * Pede à IA (mesma chave/modelo configurados em /admin/configuracoes para análise de documentos)
 * a localização da placa na foto. Nunca lança erro — se não houver chave, a chamada falhar, ou a
 * IA não encontrar a placa, retorna um resultado que o chamador usa para cair na marca d'água padrão.
 */
export async function detectarPlacaFoto(imagemUrl: string): Promise<ResultadoDeteccaoPlaca> {
  try {
    const { apiKey, model } = await getConfigOpenAI();
    if (!apiKey) return { ok: false, motivo: "Chave da OpenAI não configurada." };

    const resposta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT_DETECCAO_PLACA },
          {
            role: "user",
            content: [
              { type: "text", text: "Localize a placa do veículo nesta foto." },
              { type: "image_url", image_url: { url: imagemUrl } },
            ],
          },
        ],
      }),
    });

    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      return { ok: false, motivo: `Falha na chamada à OpenAI (HTTP ${resposta.status}): ${corpo.slice(0, 300)}` };
    }

    const payload: any = await resposta.json();
    const conteudo = payload?.choices?.[0]?.message?.content;
    if (!conteudo) return { ok: false, motivo: "OpenAI retornou resposta vazia." };

    const dados = extrairJson(conteudo);
    if (dados.placa_detectada !== true) return { ok: true, bbox: null };

    const num = (v: any) => (Number.isFinite(Number(v)) ? Math.min(Math.max(Number(v), 0), 1) : 0);
    const bbox: BBoxPlaca = { x: num(dados.x), y: num(dados.y), width: num(dados.width), height: num(dados.height) };
    if (bbox.width <= 0 || bbox.height <= 0) return { ok: true, bbox: null };

    return { ok: true, bbox };
  } catch (err: any) {
    console.error("[ia-fotos] Erro ao detectar placa:", err);
    return { ok: false, motivo: err?.message || "Erro desconhecido ao detectar a placa." };
  }
}
