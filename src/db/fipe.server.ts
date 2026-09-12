/**
 * Integração com a API pública e gratuita da fipeX (https://www.fipex.com.br) para
 * buscar o valor de tabela FIPE de um veículo a partir de marca/modelo/ano/combustível
 * já cadastrados. Não é afiliada à FIPE oficial — é a melhor opção gratuita e sem
 * autenticação disponível hoje. Versão inicial: busca best-effort por nome, sem cache
 * de marcas/modelos (a API tem limite de 10 req/s, suficiente para uso manual no admin).
 */

const BASE_URL = "https://api.fipex.com.br/v1";

/** Remove acentos (marcas de combinação Unicode U+0300–U+036F) após normalize("NFD"). */
function semAcentos(texto: string) {
  return Array.from(texto)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
}

function normalizar(texto: string) {
  return semAcentos(texto.normalize("NFD")).toLowerCase().trim();
}

async function fipeGet<T>(caminho: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${caminho}`);
  for (const [chave, valor] of Object.entries(params)) {
    if (valor) url.searchParams.set(chave, valor);
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`fipeX respondeu ${res.status} em ${caminho}`);
  }
  return (await res.json()) as T;
}

type Make = { id: string; name: string; slug: string };
type SimplifiedModel = { id: string; name: string; make_id: string; slug: string };
type Fuel = { id: string; acronym: string; name: string };
type ModelYearFuels = { model_year?: number; is_zero_km?: boolean; fuels: Fuel[] };
type ModelDetalhado = {
  id: string;
  name: string;
  slug: string;
  make: Make;
  year_fuels: ModelYearFuels[];
};
type VehicleDetailedPrice = {
  price_cents: number;
  formatted_price: string;
  model_year?: number;
  is_zero_km?: boolean;
  fipe_code: string;
  make: Make;
  model: SimplifiedModel;
  fuel: Fuel;
};

/** Escolhe o melhor candidato por nome: igualdade exata > começa com > contém > primeiro da lista. */
function melhorCandidato<T>(candidatos: T[], alvo: string, nomeDe: (item: T) => string): T | null {
  if (candidatos.length === 0) return null;
  const alvoNorm = normalizar(alvo);
  const exato = candidatos.find((c) => normalizar(nomeDe(c)) === alvoNorm);
  if (exato) return exato;
  const comeca = candidatos.find((c) => normalizar(nomeDe(c)).startsWith(alvoNorm) || alvoNorm.startsWith(normalizar(nomeDe(c))));
  if (comeca) return comeca;
  const contem = candidatos.find((c) => normalizar(nomeDe(c)).includes(alvoNorm) || alvoNorm.includes(normalizar(nomeDe(c))));
  if (contem) return contem;
  return candidatos[0] ?? null;
}

/** Mapeia o texto livre de combustível do nosso cadastro para o nome/acrônimo usado pela FIPE. */
function combustivelCorresponde(nossoCombustivel: string, fuel: Fuel): boolean {
  const nosso = normalizar(nossoCombustivel);
  const nome = normalizar(fuel.name);
  const acronimo = normalizar(fuel.acronym);
  if (nosso.includes("flex") && (nome.includes("flex") || acronimo === "f")) return true;
  if (nosso.includes("gasolina") && (nome.includes("gasolina") || acronimo === "g")) return true;
  if (nosso.includes("diesel") && (nome.includes("diesel") || acronimo === "d")) return true;
  if (nosso.includes("etanol") && (nome.includes("alcool") || nome.includes("etanol") || acronimo === "a" || acronimo === "e")) return true;
  if (nosso.includes("eletric") && (nome.includes("eletric") || acronimo === "e")) return true;
  if (nosso.includes("gnv") && (nome.includes("gas") || acronimo === "gnv")) return true;
  if (nosso.includes("hibrido") && nome.includes("hibrido")) return true;
  return nome === nosso || acronimo === nosso;
}

export type ResultadoBuscaFipe = {
  precoCentavos: number;
  precoFormatado: string;
  marca: string;
  modelo: string;
  ano: number | null;
  combustivel: string;
  fipeCode: string;
};

export async function buscarPrecoFipe(dados: {
  marca: string;
  modelo: string;
  versao?: string | null;
  anoModelo?: string | number | null;
  anoFabricacao?: string | number | null;
  combustivel?: string | null;
}): Promise<ResultadoBuscaFipe> {
  const marcaBusca = dados.marca?.trim();
  const modeloBusca = dados.modelo?.trim();
  if (!marcaBusca || !modeloBusca) {
    throw new Error("Informe marca e modelo do veículo antes de buscar na FIPE.");
  }

  const marcas = await fipeGet<{ data: Make[] }>("/makes", { q: marcaBusca, limit: "10" });
  const marca = melhorCandidato(marcas.data, marcaBusca, (m) => m.name);
  if (!marca) throw new Error(`Marca "${marcaBusca}" não encontrada na tabela FIPE.`);

  const termoModelo = [modeloBusca, dados.versao || ""].join(" ").trim();
  const modelos = await fipeGet<{ data: SimplifiedModel[] }>("/models", {
    q: modeloBusca,
    make_id: marca.id,
    limit: "20",
  });
  const modeloEscolhido = melhorCandidato(modelos.data, termoModelo, (m) => m.name);
  if (!modeloEscolhido) throw new Error(`Modelo "${modeloBusca}" não encontrado na FIPE para a marca ${marca.name}.`);

  const modeloDetalhado = await fipeGet<{ data: ModelDetalhado }>(`/models/${modeloEscolhido.id}`, {});

  const anoAlvo = Number(dados.anoModelo || dados.anoFabricacao || 0);
  let anoEscolhido = modeloDetalhado.data.year_fuels.find((y) => y.model_year === anoAlvo);
  if (!anoEscolhido) {
    // Sem o ano exato, usa o ano disponível mais próximo do informado.
    const comAno = modeloDetalhado.data.year_fuels.filter((y) => typeof y.model_year === "number");
    anoEscolhido = comAno.sort((a, b) => Math.abs((a.model_year ?? 0) - anoAlvo) - Math.abs((b.model_year ?? 0) - anoAlvo))[0];
  }
  if (!anoEscolhido || anoEscolhido.fuels.length === 0) {
    throw new Error(`Nenhum ano/combustível disponível na FIPE para ${marca.name} ${modeloEscolhido.name}.`);
  }

  const fuel =
    (dados.combustivel && anoEscolhido.fuels.find((f) => combustivelCorresponde(dados.combustivel!, f))) ||
    anoEscolhido.fuels[0]!;

  const anoParam = anoEscolhido.is_zero_km ? "zero" : String(anoEscolhido.model_year);
  const preco = await fipeGet<{ data: VehicleDetailedPrice }>("/prices", {
    model_id: modeloEscolhido.id,
    fuel_id: fuel.id,
    year: anoParam,
  });

  return {
    precoCentavos: preco.data.price_cents,
    precoFormatado: preco.data.formatted_price,
    marca: preco.data.make.name,
    modelo: preco.data.model.name,
    ano: preco.data.is_zero_km ? null : preco.data.model_year ?? null,
    combustivel: preco.data.fuel.name,
    fipeCode: preco.data.fipe_code,
  };
}
