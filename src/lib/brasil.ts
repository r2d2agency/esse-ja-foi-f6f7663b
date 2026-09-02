import { normalizePlaca, onlyDigits } from "./validators";

export function maskDocumento(value: string) {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function maskTelefone(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function maskCep(value: string) {
  return onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

/** Data no formato dd/mm/aaaa, enquanto o usuário digita. */
export function maskData(value: string) {
  const d = onlyDigits(value).slice(0, 8);
  return d
    .replace(/(\d{2})(\d)/, "$1/$2")
    .replace(/(\d{2})(\d{1,4})$/, "$1/$2");
}

/** Valor em reais a partir dos dígitos digitados (centavos), ex.: "150000" → "R$ 1.500,00". */
export function maskMoeda(value: string) {
  const n = Number(onlyDigits(value)) / 100;
  return n > 0 ? formatCurrency(n) : "";
}

/** Quilometragem com separador de milhar, mantendo apenas dígitos como valor real. */
export function maskKm(value: string) {
  const d = onlyDigits(value);
  return d ? Number(d).toLocaleString("pt-BR") : "";
}

/** Máscara adaptativa: ABC-1234 (antigo) ou ABC1D23 (Mercosul). */
export function maskPlaca(value: string) {
  const p = normalizePlaca(value).slice(0, 7);
  if (p.length <= 3) return p;
  const quinto = p[4];
  const mercosul = quinto !== undefined && /[A-Z]/.test(quinto);
  if (mercosul) return p;
  return `${p.slice(0, 3)}-${p.slice(3)}`;
}

export type EnderecoCep = {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

/** Consulta ViaCEP (gratuito, sem chave). Retorna null se não encontrado. */
export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const d = onlyDigits(cep);
  if (d.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, string> & { erro?: boolean | string };
    if (json.erro) return null;
    return {
      cep: maskCep(d),
      logradouro: json['logradouro'] ?? "",
      bairro: json['bairro'] ?? "",
      cidade: json['localidade'] ?? "",
      uf: json['uf'] ?? "",
    };
  } catch {
    return null;
  }
}

/** Geocodificação gratuita via Nominatim (OpenStreetMap). */
export async function geocodificar(endereco: string): Promise<{ lat: number; lng: number } | null> {
  const q = endereco.trim();
  if (q.length < 5) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    const first = json[0];
    if (!first) return null;
    return { lat: Number(first.lat), lng: Number(first.lon) };
  } catch {
    return null;
  }
}

export function formatCurrency(value: number | string | null | undefined) {
  const val = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(val);
}
