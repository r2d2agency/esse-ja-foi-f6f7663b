/**
 * Leitura de listas de contatos (Excel e CSV) e mapeamento de colunas.
 *
 * Existe porque a lista de lojistas vem de planilhas de terceiros — cada uma
 * com os cabeçalhos que quiser ("Nome da Loja", "Fone", "Cidade", ...). Sem
 * um mapeamento feito pelo usuário, os campos caíam errados ou vazios e a
 * importação parecia que não gravava nada.
 */

export type LinhaPlanilha = Record<string, unknown>;

const CAMPOS = [
  "nome",
  "email",
  "telefone",
  "empresa",
  "cep",
  "endereco",
  "numero",
  "bairro",
  "cidade",
  "uf",
  "observacoes",
] as const;

export type Campo = (typeof CAMPOS)[number];

/** Lista mesmo, em forma de array, para iterar no JSX. */
export const CAMPOS_LISTA = [...CAMPOS];

/** Rótulo amigável de cada campo, usado nos selects do diálogo. */
export const LABEL_CAMPO: Record<Campo, string> = {
  nome: "Nome do contato",
  email: "E-mail",
  telefone: "Telefone / WhatsApp",
  empresa: "Empresa / Loja",
  cep: "CEP",
  endereco: "Endereço",
  numero: "Número",
  bairro: "Bairro",
  cidade: "Cidade",
  uf: "Estado (UF)",
  observacoes: "Observações",
};

/** Campos sem os qualquer linha não pode virar contato. */
export const CAMPOS_OBRIGATORIOS: Campo[] = ["nome"];

/** Cabeçalhos que não devem virar coluna selecionável (metadado interno). */
const COLUNAS_DESCARTADAS = new Set(["lote_id", "ignore", "origem"]);

function normalizarChave(c: string): string {
  return c
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Associações aceitas quando o cabeçalho não bate exatamente com o nome do
 * campo. "cep" e "endereço" são os que mais variam.
 */
const ALIASES: Record<Campo, string[]> = {
  nome: ["nome", "name", "contato", "nome_contato", "razao_social", "razaosocial"],
  email: ["email", "e_mail", "mail", "correio_eletronico"],
  telefone: [
    "telefone",
    "fone",
    "whatsapp",
    "whats",
    "celular",
    "phone",
    "tel",
    "contato_telefone",
    "telefone_whatsapp",
  ],
  empresa: ["empresa", "loja", "negocio", "company", "fantasia", "nome_fantasia"],
  cep: ["cep", "postal", "cep_importacao"],
  endereco: ["endereco", "address", "logradouro", "rua"],
  numero: ["numero", "num", "n", "number"],
  bairro: ["bairro", "district"],
  cidade: ["cidade", "city", "municipio"],
  uf: ["uf", "estado", "state", "sigla", "province"],
  observacoes: ["observacoes", "obs", "observacao", "notas", "anotacoes"],
};

export function colunasDaLinha(linha: LinhaPlanilha): string[] {
  return Object.keys(linha)
    .map((c) => c.trim())
    .filter((c) => c && !COLUNAS_DESCARTADAS.has(normalizarChave(c)));
}

/**
 * Tenta adivinhar o mapeamento a partir dos cabeçalhos da primeira linha.
 *
 * É só um ponto de partida: o usuário revisa e corrige cada campo no diálogo.
 * Se os cabeçalhos forem inesperados, nada é importado errado em silêncio.
 */
export function sugerirMapeamento(linha: LinhaPlanilha): Record<string, string> {
  const colunas = colunasDaLinha(linha);
  const porChave = new Map(colunas.map((c) => [normalizarChave(c), c]));
  const out: Record<string, string> = {};
  for (const campo of CAMPOS) {
    const achado = porChave.get(campo) ?? ALIASES[campo].map((a) => porChave.get(a)).find(Boolean);
    if (achado) out[campo] = achado;
  }
  return out;
}

/**
 * Converte uma linha da planilha no registro que o servidor grava.
 * Campos não mapeados saem como null, nunca como string vazia.
 */
export function mapearLinha(
  linha: LinhaPlanilha,
  mapeamento: Record<string, string>,
): Record<string, unknown> {
  const texto = (campo: Campo) => {
    const col = mapeamento[campo];
    if (!col) return "";
    const v = linha[col];
    return v == null ? "" : String(v).trim();
  };
  const vazio = (campo: Campo) => !texto(campo);
  return {
    nome: texto("nome") || (vazio("empresa") ? "" : texto("empresa")),
    email: vazio("email") ? null : texto("email").toLowerCase(),
    telefone: texto("telefone") || null,
    empresa: vazio("empresa") ? null : texto("empresa"),
    cep: vazio("cep") ? null : texto("cep"),
    endereco: vazio("endereco") ? null : texto("endereco"),
    numero: vazio("numero") ? null : texto("numero"),
    bairro: vazio("bairro") ? null : texto("bairro"),
    cidade: vazio("cidade") ? null : texto("cidade"),
    uf: vazio("uf") ? null : texto("uf").toUpperCase(),
    observacoes: vazio("observacoes") ? null : texto("observacoes"),
  };
}

/** Detecta o separador mais provável de um CSV (, ; ou tab). */
function separadorDoCsv(texto: string): string {
  const primeira = (texto.split(/\r?\n/).find((l) => l.trim()) ?? "").replace(/"[^"]*"/g, "");
  const candidatos = [",", ";", "\t", "|"];
  let melhor = ",";
  let melhorQtd = 0;
  for (const c of candidatos) {
    const qtd = primeira.split(c).length - 1;
    if (qtd > melhorQtd) {
      melhor = c;
      melhorQtd = qtd;
    }
  }
  return melhor;
}

/**
 * Parser de CSV sem dependência: aspas duplas, quebra de linha dentro de
 * campo entre aspas e BOM são tratados. Precisa ser próprio porque o CSV do
 * Excel vem com ";" e o do Google Sheets com ",", e o mesmo diálogo recebe os
 * dois.
 */
export function lerCsv(textoBruto: string): LinhaPlanilha[] {
  const texto = textoBruto.replace(/^﻿/, "");
  if (!texto.trim()) return [];
  const sep = separadorDoCsv(texto);

  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let entreAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (entreAspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        campo += ch;
      }
      continue;
    }
    if (ch === '"') {
      entreAspas = true;
    } else if (ch === sep) {
      linha.push(campo);
      campo = "";
    } else if (ch === "\r") {
      // ignora; o \n abaixo fecha a linha
    } else if (ch === "\n") {
      linha.push(campo);
      campo = "";
      if (linha.some((c) => c.trim())) linhas.push(linha);
      linha = [];
    } else {
      campo += ch;
    }
  }
  if (campo.trim() || linha.length) {
    linha.push(campo);
    if (linha.some((c) => c.trim())) linhas.push(linha);
  }
  if (!linhas.length) return [];

  // Repete o último cabeçalho quando uma linha tem mais campos que o cabeçalho
  // (acontece quando uma vírgula solta escapou do parser).
  const cab = linhas[0].map((c) => c.trim());
  return linhas.slice(1).map((l) => {
    const obj: LinhaPlanilha = {};
    for (let i = 0; i < cab.length; i++) {
      obj[cab[i]] = l[i] ?? "";
    }
    return obj;
  });
}

/**
 * Lê .xlsx/.xls na própria aba 0.
 *
 * A coluna vazia no meio de uma linha vira "" (defval) para o mapeamento não
 * pular campos por causa de célula em branco no cabeçalho.
 */
export async function lerPlanilhaExcel(buf: ArrayBuffer): Promise<LinhaPlanilha[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "array", codepage: 65001 });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<LinhaPlanilha>(sheet, { defval: "" });
}
