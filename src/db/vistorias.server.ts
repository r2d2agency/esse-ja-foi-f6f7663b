import { sql } from "drizzle-orm";
import { db } from "./index";

export type Row = Record<string, any>;
export type HorarioPeriodo = {
  inicio: string;
  fim: string;
};

// ============================================================================
// SEED PADRÃO — TYPESCRIPT (NAO ALTERAR AQUI A EDICAO DO ADMIN; e pra editar no painel)
// 8 categorias + 62 itens. Garantia de NUNCA comecar do zero.
// Chaves unicas usadas no upsert:
// - Categoria: nome UNIQUE
// - Item: (categoria_id, titulo) UNIQUE
// ============================================================================
type SeedItem = {
  titulo: string;
  descricao_ajuda?: string | null;
  tipo_item: "CONFORMIDADE" | "TEXTO_LIVRE" | "NUMERO" | "CHECKBOX_MULTIPLO" | "SELECT_UNICO";
  opcoes?: any[] | null;
  obrigatorio?: boolean;
  foto_obrigatoria?: boolean;
  permite_observacao?: boolean;
  ordem?: number;
};
type SeedCategoria = {
  nome: string;
  descricao: string;
  ordem: number;
  itens: SeedItem[];
};

const CHECKBOX_OPCOES_EQUIPAMENTOS = [
  { valor: "AIRBAG_DUPLOS", label: "Airbag duplo" },
  { valor: "ABS", label: "Freios ABS" },
  { valor: "AR_QUENTE", label: "Ar quente" },
  { valor: "AR_CONDICIONADO", label: "Ar condicionado" },
  { valor: "DIRECAO_HIDRAULICA", label: "Direção hidráulica" },
  { valor: "DIRECAO_ELETRICA", label: "Direção elétrica" },
  { valor: "TRAVA_ELETRICA", label: "Travas elétricas" },
  { valor: "VIDROS_ELETRICOS", label: "Vidros elétricos" },
  { valor: "MULTIMIDIA", label: "Multimídia / rádio" },
  { valor: "CAMERA_RE", label: "Câmera de ré" },
  { valor: "SENSOR_RE", label: "Sensor de ré" },
  { valor: "RODAS_LIGA", label: "Rodas liga-leve" },
  { valor: "TETO_SOLAR", label: "Teto solar" },
  { valor: "BANCOS_COURO", label: "Bancos de couro" },
];

const SEED_CATEGORIAS_PADRAO: SeedCategoria[] = [
  // 1) Identificação
  {
    nome: "Identificação",
    descricao: "Dados de identificação do veículo (KM, chassi, placa)",
    ordem: 1,
    itens: [
      { titulo: "Quilometragem", descricao_ajuda: "Registre a quilometragem atual exibida no painel", tipo_item: "NUMERO", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 1 },
      { titulo: "Foto do Painel (KM)", descricao_ajuda: "Foto nítida do painel mostrando o KM", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: false, ordem: 2 },
      { titulo: "Número do Chassi", descricao_ajuda: "Localize e digite o número do chassi", tipo_item: "TEXTO_LIVRE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 3 },
      { titulo: "Foto Chassi", descricao_ajuda: "Foto nítida do número gravado no chassi", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: false, ordem: 4 },
      { titulo: "Placa", descricao_ajuda: "Verifique se a placa confere e está em bom estado", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 5 },
    ],
  },
  // 2) Estrutura
  {
    nome: "Estrutura",
    descricao: "Estrutura, lataria, colunas, assoalho",
    ordem: 2,
    itens: [
      { titulo: "Coluna A", descricao_ajuda: "Verificar amassados, pintura, solda aparente", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 1 },
      { titulo: "Coluna B", descricao_ajuda: "Verificar amassados, pintura, solda aparente", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 2 },
      { titulo: "Coluna C", descricao_ajuda: "Verificar amassados, pintura, solda aparente", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 3 },
      { titulo: "Assoalho", descricao_ajuda: "Integridade do assoalho, caixa de roda", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 4 },
      { titulo: "Longarinas", descricao_ajuda: "Estrutura principal (longarinas dianteiras e traseiras)", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 5 },
      { titulo: "Teto", descricao_ajuda: "Amassados, pintura, vazamento", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 6 },
    ],
  },
  // 3) Exterior
  {
    nome: "Exterior",
    descricao: "Lataria, pintura, vidros, para-choques, retrovisores",
    ordem: 3,
    itens: [
      { titulo: "Capô", descricao_ajuda: "Riscos, amassados, pintura", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 1 },
      { titulo: "Porta Dianteira Esq.", descricao_ajuda: "Verificar estado geral, maçaneta, vidro", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 2 },
      { titulo: "Porta Dianteira Dir.", descricao_ajuda: "Verificar estado geral, maçaneta, vidro", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 3 },
      { titulo: "Porta Traseira Esq.", descricao_ajuda: "Verificar estado geral, maçaneta, vidro", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 4 },
      { titulo: "Porta Traseira Dir.", descricao_ajuda: "Verificar estado geral, maçaneta, vidro", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 5 },
      { titulo: "Mala/Tampa Traseira", descricao_ajuda: "Vedações, amassados, fecho", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 6 },
      { titulo: "Para-choque Dianteiro", descricao_ajuda: "Amassados, arranhões, grade", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 7 },
      { titulo: "Para-choque Traseiro", descricao_ajuda: "Amassados, arranhões, luzes ré", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 8 },
      { titulo: "Vidros e Lanternas", descricao_ajuda: "Rachaduras, trincos, embaçados", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 9 },
    ],
  },
  // 4) Interior
  {
    nome: "Interior",
    descricao: "Bancos, forração, painel, tetos, carpete",
    ordem: 4,
    itens: [
      { titulo: "Banco Motorista", descricao_ajuda: "Desgaste, rasgos, sujeira", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 1 },
      { titulo: "Banco Passageiro", descricao_ajuda: "Desgaste, rasgos, sujeira", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 2 },
      { titulo: "Bancos Traseiros", descricao_ajuda: "Estado geral, encostos, cintos", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 3 },
      { titulo: "Painel", descricao_ajuda: "Riscos, rachaduras, itens do painel", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 4 },
      { titulo: "Forração/Teto", descricao_ajuda: "Manchas, rasgos, soltos", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 5 },
      { titulo: "Carpete/Forro de porta", descricao_ajuda: "Desgaste, umidade, odores", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 6 },
      { titulo: "Odor geral", descricao_ajuda: "Cheiro de cigarro, mofo, combustível", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 7 },
    ],
  },
  // 5) Mecânica Básica
  {
    nome: "Mecânica Básica",
    descricao: "Motor, bateria, fluidos, funcionamento",
    ordem: 5,
    itens: [
      { titulo: "Partida do Motor", descricao_ajuda: "Barulhos estranhos, dificuldade no arranque", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 1 },
      { titulo: "Ruídos do Motor", descricao_ajuda: "Batidas de biela, tucho, sopros", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 2 },
      { titulo: "Fumaça no Escapamento", descricao_ajuda: "Cor anormal (azul, branca, preta)", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 3 },
      { titulo: "Nível de Óleo", descricao_ajuda: "Verificar vareta de óleo do motor", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 4 },
      { titulo: "Água do Radiador", descricao_ajuda: "Nível e integridade do reservatório", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 5 },
      { titulo: "Bateria", descricao_ajuda: "Estado geral, corrosão nos bornes", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 6 },
      { titulo: "Freios", descricao_ajuda: "Teste em baixa velocidade, ruídos", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 7 },
      { titulo: "Direção e Suspensão", descricao_ajuda: "Trepidação, folgas, ruídos", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 8 },
      { titulo: "Ar Condicionado", descricao_ajuda: "Refrigeração, ruídos no compressor", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 9 },
      { titulo: "Itens Elétricos (Luzes, Vidros, Travas)", descricao_ajuda: "Farol, seta, alerta, travas elétricas, vidros", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 10 },
    ],
  },
  // 6) Pneus e Rodas
  {
    nome: "Pneus e Rodas",
    descricao: "Sulcos, desgaste, balanceamento, rodas",
    ordem: 6,
    itens: [
      { titulo: "Pneu Dianteiro Esq.", descricao_ajuda: "Profundidade do sulco, bolhas, cortes", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 1 },
      { titulo: "Pneu Dianteiro Dir.", descricao_ajuda: "Profundidade do sulco, bolhas, cortes", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 2 },
      { titulo: "Pneu Traseiro Esq.", descricao_ajuda: "Profundidade do sulco, bolhas, cortes", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 3 },
      { titulo: "Pneu Traseiro Dir.", descricao_ajuda: "Profundidade do sulco, bolhas, cortes", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 4 },
      { titulo: "Estepe", descricao_ajuda: "Existência e estado geral (calibragem)", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 5 },
      { titulo: "Rodas / Liga-leve", descricao_ajuda: "Amassados, arranhões, parafusos", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 6 },
    ],
  },
  // 7) Equipamentos
  {
    nome: "Equipamentos",
    descricao: "Acessórios, multimídia, segurança, extras",
    ordem: 7,
    itens: [
      { titulo: "Quais equipamentos estão presentes?", descricao_ajuda: "Marcar todos que existem no veículo", tipo_item: "CHECKBOX_MULTIPLO", opcoes: CHECKBOX_OPCOES_EQUIPAMENTOS, obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 1 },
      { titulo: "Chave Reserva", descricao_ajuda: "Possui segunda cópia da chave?", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 2 },
      { titulo: "Manual do Proprietário", descricao_ajuda: "Documentação do veículo", tipo_item: "CONFORMIDADE", obrigatorio: false, foto_obrigatoria: false, permite_observacao: true, ordem: 3 },
      { titulo: "Extintor", descricao_ajuda: "Prazo de validade e lacre", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 4 },
      { titulo: "Triângulo + Macaco", descricao_ajuda: "Itens de segurança obrigatórios", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 5 },
    ],
  },
  // 8) Documentos
  {
    nome: "Documentos",
    descricao: "CRLV, documentos, multas, sinistro",
    ordem: 8,
    itens: [
      { titulo: "CRLV (Certificado Registro)", descricao_ajuda: "Documento do veículo válido", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 1 },
      { titulo: "Documento Pessoal Vendedor", descricao_ajuda: "RG/CNH válido do vendedor", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: true, permite_observacao: true, ordem: 2 },
      { titulo: "Multas Pendentes", descricao_ajuda: "Verificar se existem multas pendentes no sistema", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 3 },
      { titulo: "Restrições / Gravames", descricao_ajuda: "Financiamento, alienação, leilão anterior", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 4 },
      { titulo: "Sinistro / Roubo", descricao_ajuda: "Veículo já foi sinistrado ou recuperado?", tipo_item: "CONFORMIDADE", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: 5 },
    ],
  },
];

function requireDb() {
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

// O driver postgres-js devolve as linhas como array (sem .rows).
// Este helper normaliza os dois formatos possíveis.
function rowsOf(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.rows)) return res.rows;
  return [];
}


function toMinutes(value: string) {
  const [hora, minuto] = String(value || "00:00").split(":").map(Number);
  return (hora || 0) * 60 + (minuto || 0);
}

function minutesToTime(value: number) {
  const hora = Math.floor(value / 60);
  const minuto = value % 60;
  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

const TIMEZONE_SP = "America/Sao_Paulo";

function dataFormatadaSP(offsetDias: number = 0): string {
  const agora = new Date();
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: TIMEZONE_SP }));
  if (offsetDias !== 0) sp.setDate(sp.getDate() + offsetDias);
  const ano = sp.getFullYear();
  const mes = String(sp.getMonth() + 1).padStart(2, "0");
  const dia = String(sp.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}
function minutosAgoraSP(): number {
  const agora = new Date();
  const partes = agora.toLocaleString("en-US", {
    timeZone: TIMEZONE_SP,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const match = partes.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    const fallback = new Date();
    return fallback.getHours() * 60 + fallback.getMinutes();
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
function ehHojeSP(dataIso: string): boolean {
  return dataIso === dataFormatadaSP(0);
}
function dataEstaNoPassado(dataIso: string): boolean {
  const hojeSP = dataFormatadaSP(0);
  return dataIso < hojeSP;
}

function normalizarUuid(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0]?.toLowerCase() || null;
}

async function encontrarUnidadeRobusta(args: {
  unidadeId?: unknown;
  nomeUnidade?: string | null;
  cidadeUnidade?: string | null;
  campos?: string;
}): Promise<any> {
  const d = requireDb();
  const rawId = String(args.unidadeId ?? "").trim();
  const uuidMatch = rawId.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  const unidadeIdLower = (uuidMatch?.[0] ?? rawId).toLowerCase();
  const nomeFiltro = String(args.nomeUnidade ?? "").trim();
  const cidadeFiltro = String(args.cidadeUnidade ?? "").trim();
  const campos = args.campos || `
    id::text as id,
    ativo,
    duracao_padrao_minutos,
    intervalo_entre_vistorias_minutos,
    horario_atendimento,
    nome,
    cidade
  `;

  if (!rawId && !nomeFiltro) return null;

  const todasCandidatas: any[] = [];

  if (unidadeIdLower) {
    try {
      const porUuid = await d.execute(sql`
        SELECT ${sql.raw(campos)}, 0 as prioridade_busca
        FROM unidades_vistoria
        WHERE id::text ILIKE ${unidadeIdLower}
           OR id::text ILIKE (${unidadeIdLower} || '%')
        LIMIT 3
      `);
      for (const u of (rowsOf(porUuid) || [])) todasCandidatas.push(u);
    } catch { /* ignora */ }

    if (todasCandidatas.length === 0 && unidadeIdLower.replace(/-/g, "").length >= 32) {
      try {
        const porCast = await d.execute(sql`
          SELECT ${sql.raw(campos)}, 0 as prioridade_busca
          FROM unidades_vistoria
          WHERE id = (${unidadeIdLower}::uuid)
          LIMIT 3
        `);
        for (const u of (rowsOf(porCast) || [])) {
          if (!todasCandidatas.some((x) => String(x.id).toLowerCase() === String(u.id).toLowerCase())) {
            todasCandidatas.push(u);
          }
        }
      } catch { /* ignora */ }
    }
  }

  if (nomeFiltro) {
    try {
      const porNome = await d.execute(sql`
        SELECT ${sql.raw(campos)}, 1 as prioridade_busca
        FROM unidades_vistoria
        WHERE (
          lower(nome) ILIKE lower(('%' || ${nomeFiltro} || '%'))
          OR lower(nome) = lower(${nomeFiltro})
        )
        ${
          cidadeFiltro
            ? sql`AND (lower(cidade) ILIKE lower(('%' || ${cidadeFiltro} || '%')) OR lower(cidade) = lower(${cidadeFiltro}))`
            : sql``
        }
        ORDER BY ativo DESC, length(nome) ASC
        LIMIT 5
      `);
      for (const u of (rowsOf(porNome) || [])) {
        if (!todasCandidatas.some((x) => String(x.id).toLowerCase() === String(u.id).toLowerCase())) {
          todasCandidatas.push(u);
        }
      }
    } catch { /* ignora */ }
  }

  if (todasCandidatas.length === 0) {
    try {
      const todas = await listarUnidadesDisponiveis();
      const lista: any[] = Array.isArray(todas) ? (todas as any[]) : (((todas as any)?.rows) as any[]) || [];
      for (const u of lista) {
        const idStr = String((u as any).id || "").toLowerCase();
        const nomeStr = String((u as any).nome || "").toLowerCase();
        const cidStr = String((u as any).cidade || "").toLowerCase();
        const bateId = unidadeIdLower && (
          idStr === unidadeIdLower ||
          idStr.replace(/-/g, "") === unidadeIdLower.replace(/-/g, "") ||
          idStr.startsWith(unidadeIdLower)
        );
        const bateNome = nomeFiltro && (
          nomeStr === nomeFiltro.toLowerCase() ||
          (cidadeFiltro && nomeStr.includes(nomeFiltro.toLowerCase()) &&
            cidStr.includes(cidadeFiltro.toLowerCase())) ||
          (!cidadeFiltro && nomeStr.includes(nomeFiltro.toLowerCase()))
        );
        if (bateId || bateNome) {
          todasCandidatas.push({ ...u, prioridade_busca: bateId ? 0 : 1 });
          if (todasCandidatas.length >= 3) break;
        }
      }
    } catch { /* ignora */ }
  }

  if (todasCandidatas.length === 0) return null;
  return todasCandidatas.sort((a, b) => Number(a.prioridade_busca ?? 9) - Number(b.prioridade_busca ?? 9))[0];
}

function normalizarHorarioAtendimento(value: any): Record<string, HorarioPeriodo[]> {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce<Record<string, HorarioPeriodo[]>>((acc, [dia, faixa]) => {
    if (Array.isArray(faixa)) {
      const periodos = faixa
        .filter((item) => item && typeof item === "object")
        .map((item: any) => ({
          inicio: typeof item.inicio === "string" ? item.inicio : "",
          fim: typeof item.fim === "string" ? item.fim : "",
        }))
        .filter((item) => item.inicio && item.fim);
      if (periodos.length > 0) acc[dia] = periodos;
      return acc;
    }

    if (!faixa || typeof faixa !== "object") return acc;
    const inicio = typeof (faixa as any).inicio === "string" ? (faixa as any).inicio : "";
    const fim = typeof (faixa as any).fim === "string" ? (faixa as any).fim : "";
    if (!inicio || !fim) return acc;
    acc[dia] = [{ inicio, fim }];
    return acc;
  }, {});
}

export async function ensureVistoriaSchema() {
  const d = requireDb();

  // 1. Unidades de Vistoria
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS unidades_vistoria (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome text NOT NULL,
      cnpj text,
      cep text,
      endereco text NOT NULL,
      cidade text NOT NULL,
      estado text NOT NULL,
      latitude numeric(10,7),
      longitude numeric(10,7),
      telefone text,
      whatsapp text,
      email text,
      responsavel text,
      horario_atendimento jsonb, -- { seg_sex: "08:00-18:00", sab: "08:00-12:00" }
      duracao_padrao_minutos integer DEFAULT 60,
      intervalo_entre_vistorias_minutos integer DEFAULT 30,
      raio_atendimento_km integer,
      cidades_atendidas text[],
      ativo boolean DEFAULT true,
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    );
  `);

  await d.execute(sql`
    ALTER TABLE unidades_vistoria
    ADD COLUMN IF NOT EXISTS latitude numeric(10,7)
  `);

  await d.execute(sql`
    ALTER TABLE unidades_vistoria
    ADD COLUMN IF NOT EXISTS longitude numeric(10,7)
  `);

  await d.execute(sql`
    ALTER TABLE unidades_vistoria
    ADD COLUMN IF NOT EXISTS intervalo_entre_vistorias_minutos integer DEFAULT 30
  `);

  // 2. Vistoriadores (vinculados a perfis/usuários com role vistoriador)
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS vistoriadores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id uuid NOT NULL REFERENCES profiles(id),
      unidade_id uuid REFERENCES unidades_vistoria(id),
      dias_trabalho integer[], -- [1,2,3,4,5] (segunda a sexta)
      horarios_disponiveis jsonb, -- { "1": ["08:00", "09:00", ...], ... }
      status text NOT NULL DEFAULT 'ATIVO', -- ATIVO, INATIVO, BLOQUEADO
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now(),
      UNIQUE(usuario_id)
    );
  `);

  // 3. Agendamentos
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS vistorias (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      veiculo_id uuid NOT NULL REFERENCES veiculos(id),
      vendedor_id uuid NOT NULL REFERENCES profiles(id),
      unidade_id uuid NOT NULL REFERENCES unidades_vistoria(id),
      vistoriador_id uuid REFERENCES vistoriadores(id),
      data_vistoria date NOT NULL,
      horario_vistoria time NOT NULL,
      status text NOT NULL DEFAULT 'AGUARDANDO_CONFIRMACAO', 
      -- AGUARDANDO_CONFIRMACAO, CONFIRMADA, REAGENDAMENTO_SOLICITADO, CANCELADA, NAO_COMPARECEU_VENDEDOR, NAO_COMPARECEU_VISTORIADOR, EM_ANDAMENTO, CONCLUIDA
      motivo_cancelamento text,
      mensagem_vendedor text,
      confirmada_em timestamptz,
      criado_por uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    );
  `);

  // 4. Histórico/Timeline da Vistoria
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS vistorias_historico (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vistoria_id uuid NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
      acao text NOT NULL,
      detalhe text,
      usuario_id uuid REFERENCES profiles(id),
      criado_em timestamptz DEFAULT now()
    );
  `);

  // 5. Bloqueios de Agenda
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS vistorias_bloqueios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unidade_id uuid REFERENCES unidades_vistoria(id),
      vistoriador_id uuid REFERENCES vistoriadores(id),
      data_inicio timestamptz NOT NULL,
      data_fim timestamptz NOT NULL,
      motivo text,
      criado_em timestamptz DEFAULT now()
    );
  `);

  // 6. Laudos
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS laudos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      vistoria_id uuid NOT NULL REFERENCES vistorias(id) ON DELETE CASCADE,
      veiculo_id uuid NOT NULL REFERENCES veiculos(id),
      vistoriador_id uuid NOT NULL REFERENCES vistoriadores(id),
      status text NOT NULL DEFAULT 'EM_ANDAMENTO', -- EM_ANDAMENTO, CONCLUIDO
      quilometragem_atual integer,
      localizacao_checkin jsonb, -- { lat, lng, timestamp }
      placa_confirmada text,
      observacao_geral text,
      declaracao_vistoriador boolean DEFAULT false,
      concluido_em timestamptz,
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now(),
      UNIQUE(vistoria_id)
    );
  `);

  // 7. Laudo Checklist
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS laudo_checklist (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      laudo_id uuid NOT NULL REFERENCES laudos(id) ON DELETE CASCADE,
      etapa text NOT NULL, 
      item_chave text NOT NULL,
      status text NOT NULL, 
      observacao text,
      foto_url text,
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now(),
      UNIQUE(laudo_id, item_chave)
    );
  `);

  // 8. Laudo Fotos
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS laudo_fotos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      laudo_id uuid NOT NULL REFERENCES laudos(id) ON DELETE CASCADE,
      tipo_foto text NOT NULL, 
      url text NOT NULL,
      metadata jsonb,
      criado_em timestamptz DEFAULT now()
    );
  `);
  // A tabela também é usada pelo módulo de laudos. Bancos antigos podem ter
  // apenas `chave/item_id`; reconciliamos as duas estruturas sem perder dados.
  await d.execute(sql`ALTER TABLE laudo_fotos ADD COLUMN IF NOT EXISTS item_id uuid`);
  await d.execute(sql`ALTER TABLE laudo_fotos ADD COLUMN IF NOT EXISTS chave text`);
  await d.execute(sql`ALTER TABLE laudo_fotos ADD COLUMN IF NOT EXISTS tipo_foto text`);
  await d.execute(sql`ALTER TABLE laudo_fotos ADD COLUMN IF NOT EXISTS url text`);
  await d.execute(sql`ALTER TABLE laudo_fotos ADD COLUMN IF NOT EXISTS legenda text`);
  await d.execute(sql`ALTER TABLE laudo_fotos ADD COLUMN IF NOT EXISTS metadata jsonb`);

  // Reconciliação: caso a tabela laudos já exista criada por outro módulo
  // (com agendamento_id e sem vistoria_id/concluido_em), garante as colunas
  // usadas pelo painel do vistoriador.
  await d.execute(sql`ALTER TABLE laudos ADD COLUMN IF NOT EXISTS vistoria_id uuid`);
  await d.execute(sql`ALTER TABLE laudos ADD COLUMN IF NOT EXISTS concluido_em timestamptz`);
  await d.execute(sql`ALTER TABLE laudos ADD COLUMN IF NOT EXISTS localizacao_checkin jsonb`);
  await d.execute(sql`ALTER TABLE laudos ADD COLUMN IF NOT EXISTS declaracao_vistoriador boolean DEFAULT false`);

  await ensureChecklistSchema();
}

// Server Functions para Admin e App Vistoriador

export async function listarVistoriasAdmin(filtros: any = {}) {
  const d = requireDb();
  await ensureVistoriaSchema();
  
  let query = sql`
    SELECT v.id::text as id,
           v.data_vistoria,
           v.horario_vistoria,
           v.status,
           v.veiculo_id::text as veiculo_id,
           v.vendedor_id::text as vendedor_id,
           v.unidade_id::text as unidade_id,
           v.vistoriador_id::text as vistoriador_id,
           v.criado_em,
           v.atualizado_em,
           vei.placa, vei.marca, vei.modelo,
           prof.nome as vendedor_nome, prof.whatsapp as vendedor_whatsapp,
           uv.nome as unidade_nome,
           pvist.nome as vistoriador_nome
    FROM vistorias v
    JOIN veiculos vei ON v.veiculo_id = vei.id
    JOIN profiles prof ON v.vendedor_id = prof.id
    JOIN unidades_vistoria uv ON v.unidade_id = uv.id
    LEFT JOIN vistoriadores vist ON v.vistoriador_id = vist.id
    LEFT JOIN profiles pvist ON vist.usuario_id = pvist.id
    WHERE 1=1
  `;
  
  if (filtros.status) {
    query = sql`${query} AND v.status = ${filtros.status}`;
  }
  
  query = sql`${query} ORDER BY v.data_vistoria DESC, v.horario_vistoria DESC`;
  
  const res = await d.execute(query);
  return rowsOf(res) || res;
}

export async function getVeiculosAguardandoVistoria() {
  const d = requireDb();
  const res = await d.execute(sql`
    SELECT v.*, p.nome as vendedor_nome, p.cidade as vendedor_cidade, p.uf as vendedor_uf
    FROM veiculos v
    JOIN profiles p ON v.vendedor_id = p.id
    WHERE v.status_analise = 'PRONTO_PARA_VISTORIA'
      AND NOT EXISTS (
        SELECT 1 FROM vistorias vis 
        WHERE vis.veiculo_id = v.id 
          AND vis.status NOT IN ('CANCELADA')
      )
    ORDER BY v.atualizado_em DESC
  `);
  return rowsOf(res) || res;
}

export async function criarAgendamento(data: any) {
  const d = requireDb();
  await ensureVistoriaSchema();

  const vistoriadorId = normalizarUuid(data.vistoriador_id);
  const veiculoId = normalizarUuid(data.veiculo_id);
  const vendedorId = normalizarUuid(data.vendedor_id);
  const usuarioId = normalizarUuid(data.usuario_id);

  if (!veiculoId) throw new Error("Veículo inválido para criar o agendamento.");
  if (!vendedorId) throw new Error("Vendedor inválido para criar o agendamento.");
  if (!usuarioId) throw new Error("Usuário inválido para criar o agendamento.");

  const unidade = await encontrarUnidadeRobusta({
    unidadeId: data.unidade_id,
    nomeUnidade: data.unidade_nome || null,
    cidadeUnidade: data.unidade_cidade || null,
    campos: `
      id::text as id,
      ativo,
      duracao_padrao_minutos,
      intervalo_entre_vistorias_minutos
    `,
  });
  if (!unidade) {
    const snippet = String(data.unidade_id || "").slice(0, 10);
    throw new Error(
      `Unidade de vistoria não encontrada (${snippet || "sem id"}). Selecione a unidade novamente na lista.`
    );
  }
  if (!unidade.ativo) {
    throw new Error("A unidade selecionada está inativa. Escolha outra unidade para agendar.");
  }
  const unidadeIdTxt = normalizarUuid(unidade.id);
  if (!unidadeIdTxt) throw new Error("O id da unidade encontrada não é um UUID válido.");

  if (dataEstaNoPassado(data.data_vistoria)) {
    throw new Error("Não é possível agendar em datas passadas. Escolha uma data futura.");
  }
  if (ehHojeSP(data.data_vistoria)) {
    const mins = toMinutes(data.horario_vistoria);
    if (mins <= minutosAgoraSP()) {
      throw new Error("O horário selecionado já passou. Escolha outro horário ou data futura.");
    }
  }

  const slots = await listarSlotsDisponiveisUnidade(unidadeIdTxt, data.data_vistoria, vistoriadorId || null);
  const slotDisponivel = slots.slots.some((slot) => slot.value === data.horario_vistoria);
  if (!slotDisponivel) {
    throw new Error("Esse slot não está mais disponível para agendamento. Recarregue e escolha outro horário.");
  }

  let vistoriadorAlocado: string | null = vistoriadorId || null;
  if (!vistoriadorAlocado) {
    const duracaoPadrao = Number(unidade.duracao_padrao_minutos || 60);
    const janela = Number(unidade.intervalo_entre_vistorias_minutos || 30);
    const slotInicioMin = toMinutes(data.horario_vistoria);
    const slotFimMin = slotInicioMin + duracaoPadrao;
    const slotInicioComJanela = slotInicioMin + janela;
    const vistoriadoresAtivos = await d.execute(sql`
      SELECT v.id::text as id
      FROM vistoriadores v
      WHERE v.unidade_id::text = ${unidadeIdTxt} AND v.status = 'ATIVO'
    `);
    const idsRaw = rowsOf(vistoriadoresAtivos) || [];
    const ids: string[] = [];
    for (const v of idsRaw) {
      const vid = normalizarUuid(v?.id);
      if (vid) ids.push(vid);
    }
    for (const vid of ids) {
      const conflitosRes = await d.execute(sql`
        SELECT 1 as existe
        FROM vistorias
        WHERE vistoriador_id::text = ${vid}
          AND data_vistoria = ${data.data_vistoria}
          AND status NOT IN ('CANCELADA', 'REPROVADA', 'CONCLUIDA_COM_RESTRICOES', 'CONCLUIDA', 'REJEITADA')
          AND (
            (
              (EXTRACT(EPOCH FROM horario_vistoria)::int / 60) + (${duracaoPadrao} - ${janela}) > ${slotInicioComJanela}
              AND (EXTRACT(EPOCH FROM horario_vistoria)::int / 60) < ${slotFimMin}
            )
          )
        LIMIT 1
      `);
      const linhas = (conflitosRes as any)?.rows ?? (Array.isArray(conflitosRes) ? conflitosRes : []);
      if (!linhas?.length) {
        vistoriadorAlocado = vid;
        break;
      }
    }
  }

  const vistoriadorUuidSql = vistoriadorAlocado
    ? sql`${vistoriadorAlocado}::uuid`
    : sql`NULL`;

  const res = await d.execute(sql`
    INSERT INTO vistorias (
      veiculo_id, vendedor_id, unidade_id, vistoriador_id,
      data_vistoria, horario_vistoria, status, criado_por
    ) VALUES (
      ${veiculoId}::uuid, ${vendedorId}::uuid,
      ${unidadeIdTxt}::uuid, ${vistoriadorUuidSql},
      ${data.data_vistoria}, ${data.horario_vistoria},
      'AGUARDANDO_CONFIRMACAO', ${usuarioId}::uuid
    ) RETURNING id
  `);

  const linhasRes = (res as any)?.rows ?? (Array.isArray(res) ? res : []);
  if (!linhasRes || linhasRes.length === 0) {
    throw new Error("O banco não retornou o id da vistoria criada. Tente novamente.");
  }
  const primeiraLinha = linhasRes[0];
  if (!primeiraLinha) {
    throw new Error("O banco retornou um registro de vistoria inválido. Tente novamente.");
  }
  const vistoriaIdRaw = primeiraLinha.id;
  if (!vistoriaIdRaw) {
    throw new Error("O banco não retornou o id da vistoria criada. Tente novamente.");
  }
  const vistoriaId = normalizarUuid(vistoriaIdRaw) || String(vistoriaIdRaw);

  try {
    await d.execute(sql`
      UPDATE veiculos
      SET status = 'VISTORIA_AGENDADA', atualizado_em = now()
      WHERE id = ${veiculoId}::uuid
    `);
  } catch (e) { /* ignore: já temos a vistoria criada */ }

  const detalhe = `Vistoria agendada para ${data.data_vistoria} às ${data.horario_vistoria}` +
    (vistoriadorAlocado ? ` (vistoriador alocado automaticamente)` : " (aguardando alocação de vistoriador)");
  try {
    await d.execute(sql`
      INSERT INTO vistorias_historico (vistoria_id, acao, detalhe, usuario_id)
      VALUES (${vistoriaId}::uuid, 'Agendamento criado', ${detalhe}, ${usuarioId}::uuid)
    `);
  } catch (e) { /* ignore: a vistoria já existe */ }

  return { ok: true, id: vistoriaId };
}

export async function listarUnidadesDisponiveis(cidade?: string) {
  const d = requireDb();
  await ensureVistoriaSchema();

  const cidadeRefinada = (cidade || "").trim();
  const priorizaCidade = !!cidadeRefinada;

  const baseFields = sql`
    id::text as id,
    nome,
    cnpj,
    cep,
    endereco,
    cidade,
    estado,
    latitude,
    longitude,
    telefone,
    whatsapp,
    email,
    responsavel,
    horario_atendimento,
    duracao_padrao_minutos,
    intervalo_entre_vistorias_minutos,
    raio_atendimento_km,
    cidades_atendidas,
    ativo,
    criado_em,
    atualizado_em
  `;

  let finalQuery;
  if (priorizaCidade) {
    finalQuery = sql`
      WITH base AS (
        SELECT ${baseFields},
          CASE
            WHEN lower(cidade) = lower(${cidadeRefinada}) THEN 0
            WHEN ${cidadeRefinada} = ANY(cidades_atendidas) THEN 1
            ELSE 2
          END as ordem_prioridade
        FROM unidades_vistoria
        WHERE ativo = true
      )
      SELECT * FROM base ORDER BY ordem_prioridade ASC, lower(nome) ASC
    `;
  } else {
    finalQuery = sql`
      SELECT ${baseFields}
      FROM unidades_vistoria
      WHERE ativo = true
      ORDER BY lower(nome) ASC
    `;
  }

  const res = await d.execute(finalQuery);
  return rowsOf(res) || res;
}

export async function listarVistoriadoresUnidade(unidadeId: string) {
  const d = requireDb();
  await ensureVistoriaSchema();
  const unidadeIdNormalizado = normalizarUuid(unidadeId);

  if (!unidadeIdNormalizado) {
    return [];
  }
  
  const res = await d.execute(sql`
    SELECT
      v.id::text as id,
      v.usuario_id::text as usuario_id,
      v.unidade_id::text as unidade_id,
      v.dias_trabalho,
      v.horarios_disponiveis,
      v.status,
      v.criado_em,
      v.atualizado_em,
      p.nome,
      p.email,
      p.whatsapp
    FROM vistoriadores v
    JOIN profiles p ON v.usuario_id = p.id
    WHERE v.unidade_id = ${unidadeIdNormalizado}::uuid AND v.status = 'ATIVO'
  `);
  return rowsOf(res) || res;
}

export async function listarUnidadesVistoriaCadastro() {
  const d = requireDb();
  await ensureVistoriaSchema();

  const res = await d.execute(sql`
    SELECT
      uv.id::text as id,
      uv.nome,
      uv.cnpj,
      uv.cep,
      uv.endereco,
      uv.cidade,
      uv.estado,
      uv.latitude,
      uv.longitude,
      uv.telefone,
      uv.whatsapp,
      uv.email,
      uv.responsavel,
      uv.horario_atendimento,
      uv.duracao_padrao_minutos,
      uv.intervalo_entre_vistorias_minutos,
      uv.raio_atendimento_km,
      uv.cidades_atendidas,
      uv.ativo,
      uv.criado_em,
      uv.atualizado_em,
      COUNT(v.id)::int as total_vistoriadores
    FROM unidades_vistoria uv
    LEFT JOIN vistoriadores v ON v.unidade_id = uv.id AND v.status = 'ATIVO'
    GROUP BY uv.id
    ORDER BY uv.ativo DESC, uv.nome ASC
  `);

  return rowsOf(res) || res;
}

export async function salvarUnidadeVistoria(data: {
  id?: string;
  nome: string;
  cnpj?: string | null;
  cep?: string | null;
  endereco: string;
  cidade: string;
  estado: string;
  latitude?: number | null;
  longitude?: number | null;
  horario_atendimento?: Record<string, HorarioPeriodo[]> | null;
  duracao_padrao_minutos?: number | null;
  intervalo_entre_vistorias_minutos?: number | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  responsavel?: string | null;
  ativo?: boolean;
}) {
  const d = requireDb();
  await ensureVistoriaSchema();

  if (data.id) {
    const res = await d.execute(sql`
      UPDATE unidades_vistoria
      SET
        nome = ${data.nome},
        cnpj = ${data.cnpj || null},
        cep = ${data.cep || null},
        endereco = ${data.endereco},
        cidade = ${data.cidade},
        estado = ${data.estado},
        latitude = ${data.latitude ?? null},
        longitude = ${data.longitude ?? null},
        horario_atendimento = ${JSON.stringify(data.horario_atendimento || {})}::jsonb,
        duracao_padrao_minutos = ${data.duracao_padrao_minutos ?? 60},
        intervalo_entre_vistorias_minutos = ${data.intervalo_entre_vistorias_minutos ?? 30},
        telefone = ${data.telefone || null},
        whatsapp = ${data.whatsapp || null},
        email = ${data.email || null},
        responsavel = ${data.responsavel || null},
        ativo = ${data.ativo ?? true},
        atualizado_em = now()
      WHERE id = ${data.id}::uuid
      RETURNING id
    `);

    return rowsOf(res)?.[0] || null;
  }

  const res = await d.execute(sql`
    INSERT INTO unidades_vistoria (
      nome, cnpj, cep, endereco, cidade, estado, latitude, longitude,
      horario_atendimento, duracao_padrao_minutos, intervalo_entre_vistorias_minutos,
      telefone, whatsapp, email, responsavel, ativo
    ) VALUES (
      ${data.nome},
      ${data.cnpj || null},
      ${data.cep || null},
      ${data.endereco},
      ${data.cidade},
      ${data.estado},
      ${data.latitude ?? null},
      ${data.longitude ?? null},
      ${JSON.stringify(data.horario_atendimento || {})}::jsonb,
      ${data.duracao_padrao_minutos ?? 60},
      ${data.intervalo_entre_vistorias_minutos ?? 30},
      ${data.telefone || null},
      ${data.whatsapp || null},
      ${data.email || null},
      ${data.responsavel || null},
      ${data.ativo ?? true}
    )
    RETURNING id
  `);

  return rowsOf(res)?.[0] || null;
}

export async function listarSlotsDisponiveisUnidade(
  unidadeId: string,
  data: string,
  vistoriadorId?: string | null,
  contexto?: { nomeUnidade?: string | null; cidadeUnidade?: string | null }
) {
  const d = requireDb();
  await ensureVistoriaSchema();

  const rawId = String(unidadeId ?? "").trim();
  const uuidMatch = rawId.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  const unidadeIdLower = (uuidMatch?.[0] ?? rawId).toLowerCase();
  const nomeUnidadeFiltro = String(contexto?.nomeUnidade ?? "").trim();
  const cidadeUnidadeFiltro = String(contexto?.cidadeUnidade ?? "").trim();
  const vistoriadorIdNormalizado = normalizarUuid(vistoriadorId);

  if (!rawId && !nomeUnidadeFiltro) {
    return { ok: false as const, message: "Selecione uma unidade de vistoria válida.", slots: [] as any[] };
  }

  let unidade: any = null;

  const buscaCriterios: string[] = [];
  if (unidadeIdLower) buscaCriterios.push(`id=«${unidadeIdLower.slice(0, 8)}…${unidadeIdLower.slice(-4)}»`);
  if (nomeUnidadeFiltro) buscaCriterios.push(`nome=«${nomeUnidadeFiltro}»`);
  if (cidadeUnidadeFiltro) buscaCriterios.push(`cidade=«${cidadeUnidadeFiltro}»`);

  try {
    // ESTRATÉGIA 1 — Query SQL com ILIKE (case insensitive) e múltiplas formas de match.
    // Montamos fragmentos de SQL sem aninhar interpoladores de template quebrados no Drizzle.
    // Para evitar conflito, faremos 2 buscas separadas e unimos: uma por UUID, outra por nome.
    const todasCandidatas: any[] = [];

    if (unidadeIdLower) {
      const porUuid = await d.execute(sql`
        SELECT
          id::text as id,
          horario_atendimento,
          duracao_padrao_minutos,
          intervalo_entre_vistorias_minutos,
          ativo,
          nome,
          cidade,
          0 as prioridade_busca
        FROM unidades_vistoria
        WHERE id::text ILIKE ${unidadeIdLower}
           OR id::text ILIKE (${unidadeIdLower} || '%')
        LIMIT 3
      `);
      for (const u of (rowsOf(porUuid) || [])) todasCandidatas.push(u);

      if (todasCandidatas.length === 0 && unidadeIdLower.replace(/-/g, "").length >= 32) {
        try {
          const porCast = await d.execute(sql`
            SELECT
              id::text as id,
              horario_atendimento,
              duracao_padrao_minutos,
              intervalo_entre_vistorias_minutos,
              ativo,
              nome,
              cidade,
              0 as prioridade_busca
            FROM unidades_vistoria
            WHERE id = (${unidadeIdLower}::uuid)
            LIMIT 3
          `);
          for (const u of (rowsOf(porCast) || [])) {
            if (!todasCandidatas.some((x) => String(x.id).toLowerCase() === String(u.id).toLowerCase())) {
              todasCandidatas.push(u);
            }
          }
        } catch { /* UUID inválido no cast: ignora */ }
      }
    }

    if (nomeUnidadeFiltro) {
      const porNome = await d.execute(sql`
        SELECT
          id::text as id,
          horario_atendimento,
          duracao_padrao_minutos,
          intervalo_entre_vistorias_minutos,
          ativo,
          nome,
          cidade,
          1 as prioridade_busca
        FROM unidades_vistoria
        WHERE (
          lower(nome) ILIKE lower(('%' || ${nomeUnidadeFiltro} || '%'))
          OR lower(nome) = lower(${nomeUnidadeFiltro})
        )
        ${
          cidadeUnidadeFiltro
            ? sql`AND (lower(cidade) ILIKE lower(('%' || ${cidadeUnidadeFiltro} || '%')) OR lower(cidade) = lower(${cidadeUnidadeFiltro}))`
            : sql``
        }
        ORDER BY ativo DESC, length(nome) ASC
        LIMIT 5
      `);
      for (const u of (rowsOf(porNome) || [])) {
        if (!todasCandidatas.some((x) => String(x.id).toLowerCase() === String(u.id).toLowerCase())) {
          todasCandidatas.push(u);
        }
      }
    }

    // ESTRATÉGIA 2 — Fallback definitivo: carrega TODAS as unidades ativas e faz
    // match no JavaScript. Garante que qualquer inconsistência de tipo/texto
    // no UUID do Postgres não impede de encontrar a unidade.
    if (todasCandidatas.length === 0) {
      const todas = await listarUnidadesDisponiveis();
      const lista: any[] = Array.isArray(todas) ? (todas as any[]) : (((todas as any)?.rows) as any[]) || [];
      for (const u of lista) {
        const idStr = String((u as any).id || "").toLowerCase();
        const nomeStr = String((u as any).nome || "").toLowerCase();
        const cidStr = String((u as any).cidade || "").toLowerCase();
        const bateId = unidadeIdLower && (
          idStr === unidadeIdLower ||
          idStr.replace(/-/g, "") === unidadeIdLower.replace(/-/g, "") ||
          idStr.startsWith(unidadeIdLower)
        );
        const bateNome = nomeUnidadeFiltro && (
          nomeStr === nomeUnidadeFiltro.toLowerCase() ||
          (cidadeUnidadeFiltro && nomeStr.includes(nomeUnidadeFiltro.toLowerCase()) &&
            cidStr.includes(cidadeUnidadeFiltro.toLowerCase())) ||
          (!cidadeUnidadeFiltro && nomeStr.includes(nomeUnidadeFiltro.toLowerCase()))
        );
        if (bateId || bateNome) {
          todasCandidatas.push({ ...u, prioridade_busca: bateId ? 0 : 1 });
          if (todasCandidatas.length >= 3) break;
        }
      }
    }

    if (todasCandidatas.length === 0) {
      return {
        ok: false as const,
        message: `Unidade de vistoria não encontrada. Critérios usados: ${buscaCriterios.join(" • ") || "(nenhum)"}. Tente reabrir o modal e selecionar a unidade novamente.`,
        slots: [] as any[],
      };
    }

    unidade = todasCandidatas.sort((a, b) => Number(a.prioridade_busca ?? 9) - Number(b.prioridade_busca ?? 9))[0];
  } catch (err: any) {
    return {
      ok: false as const,
      message: `Erro ao buscar unidade: ${err.message} (critérios: ${buscaCriterios.join(" • ") || "(nenhum)"})`,
      slots: [] as any[],
    };
  }

  if (!unidade) {
    return {
      ok: false as const,
      message: `Unidade de vistoria não carregou (critérios: ${buscaCriterios.join(" • ") || "(nenhum)"}).`,
      slots: [] as any[],
    };
  }
  if (!unidade.ativo) {
    return {
      ok: false as const,
      message: "Esta unidade está inativa no cadastro. Edite para mudar o status para ATIVA.",
      slots: [] as any[]
    };
  }

  const horarioAtendimento = normalizarHorarioAtendimento(unidade.horario_atendimento);
  if (dataEstaNoPassado(data)) {
    return {
      ok: false as const,
      message: "Não é possível agendar em datas passadas. Escolha uma data futura.",
      slots: [] as any[],
    };
  }
  const dataBase = new Date(`${data}T12:00:00`);
  if (Number.isNaN(dataBase.getTime())) {
    return { ok: false as const, message: "Data inválida para geração dos slots.", slots: [] as any[] };
  }

  const diaSemana = String(dataBase.getDay());
  const periodosDia = horarioAtendimento[diaSemana] || [];
  if (periodosDia.length === 0) {
    return { ok: true as const, message: "A unidade não atende nesse dia.", slots: [] as any[], configuracao: unidade };
  }

  const duracao = Math.max(Number(unidade.duracao_padrao_minutos || 60), 1);
  const intervalo = Math.max(Number(unidade.intervalo_entre_vistorias_minutos || 0), 0);
  const passo = Math.max(duracao + intervalo, 1);

  const unidadeIdTxt = String(unidade.id || "").toLowerCase();
  const unidadeIdEncontrado = (unidadeIdTxt.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/) || [])[0] || unidadeIdTxt;

  const agendamentosRes = await d.execute(sql`
    SELECT horario_vistoria, vistoriador_id
    FROM vistorias
    WHERE unidade_id::text = ${unidadeIdEncontrado}
      AND data_vistoria = ${data}
      AND status NOT IN ('CANCELADA')
  `);
  const agendamentos = rowsOf(agendamentosRes) || [];

  let agendamentosVistoriador: any[] = [];
  if (vistoriadorIdNormalizado) {
    const agendamentosVistoriadorRes = await d.execute(sql`
      SELECT horario_vistoria
      FROM vistorias
      WHERE vistoriador_id::text = ${vistoriadorIdNormalizado}
        AND data_vistoria = ${data}
        AND status NOT IN ('CANCELADA')
    `);
    agendamentosVistoriador = rowsOf(agendamentosVistoriadorRes) || [];
  }

  const agoraMinutosSP = ehHojeSP(data) ? minutosAgoraSP() : -1;
  const slots = [] as Array<{ value: string; fim: string; label: string }>;
  for (const periodo of periodosDia) {
    if (!periodo || typeof periodo !== "object") continue;
    const inicioDia = toMinutes(periodo.inicio);
    const fimDia = toMinutes(periodo.fim);
    if (fimDia <= inicioDia || fimDia - inicioDia < duracao) continue;

    for (let inicio = inicioDia; inicio + duracao <= fimDia; inicio += passo) {
      if (agoraMinutosSP >= 0 && inicio <= agoraMinutosSP) continue;
      const fim = inicio + duracao;
      const conflitoUnidade = agendamentos.some((agendamento: any) => {
        const inicioAgendado = toMinutes(String(agendamento?.horario_vistoria || "").slice(0, 5));
        const fimAgendado = inicioAgendado + duracao;
        return inicio < fimAgendado && fim > inicioAgendado;
      });
      const conflitoVistoriador = agendamentosVistoriador.some((agendamento: any) => {
        const inicioAgendado = toMinutes(String(agendamento?.horario_vistoria || "").slice(0, 5));
        const fimAgendado = inicioAgendado + duracao;
        return inicio < fimAgendado && fim > inicioAgendado;
      });
      if (conflitoUnidade || conflitoVistoriador) continue;

      const inicioLabel = minutesToTime(inicio);
      const fimLabel = minutesToTime(fim);
      slots.push({
        value: inicioLabel,
        fim: fimLabel,
        label: `${inicioLabel} - ${fimLabel}`,
      });
    }
  }

  if (slots.length === 0) {
    return {
      ok: true as const,
      message: "Os períodos configurados desse dia não geraram slots livres.",
      slots,
      configuracao: {
        duracao_padrao_minutos: duracao,
        intervalo_entre_vistorias_minutos: intervalo,
        periodos: periodosDia,
      },
    };
  }

  return {
    ok: true as const,
    slots,
    configuracao: {
      duracao_padrao_minutos: duracao,
      intervalo_entre_vistorias_minutos: intervalo,
      periodos: periodosDia,
    },
  };
}

export async function listarVistoriadoresCadastro() {
  const d = requireDb();
  await ensureVistoriaSchema();

  const res = await d.execute(sql`
    SELECT
      p.id::text as usuario_id,
      p.nome,
      p.email,
      p.whatsapp,
      p.ativo as usuario_ativo,
      v.id::text as id,
      v.unidade_id::text as unidade_id,
      v.status,
      uv.nome as unidade_nome
    FROM profiles p
    LEFT JOIN vistoriadores v ON v.usuario_id = p.id
    LEFT JOIN unidades_vistoria uv ON uv.id = v.unidade_id
    WHERE p.role = 'vistoriador'::app_role
    ORDER BY p.nome ASC
  `);

  return rowsOf(res) || res;
}

export async function salvarVistoriadorCadastro(data: {
  usuario_id: string;
  unidade_id: string;
  status?: string;
}) {
  const d = requireDb();
  await ensureVistoriaSchema();

  const res = await d.execute(sql`
    INSERT INTO vistoriadores (usuario_id, unidade_id, status)
    VALUES (
      ${data.usuario_id}::uuid,
      ${data.unidade_id}::uuid,
      ${data.status || "ATIVO"}
    )
    ON CONFLICT (usuario_id) DO UPDATE SET
      unidade_id = EXCLUDED.unidade_id,
      status = EXCLUDED.status,
      atualizado_em = now()
    RETURNING id
  `);

  return rowsOf(res)?.[0] || null;
}

export async function getVistoriaVendedor(vendedorId: string) {
  const d = requireDb();
  await ensureVistoriaSchema();
  
  const res = await d.execute(sql`
    SELECT v.id::text as id,
           v.data_vistoria,
           v.horario_vistoria,
           v.status,
           v.veiculo_id::text as veiculo_id,
           v.vendedor_id::text as vendedor_id,
           v.unidade_id::text as unidade_id,
           v.criado_em,
           v.atualizado_em,
           vei.placa, vei.marca, vei.modelo,
           uv.nome as unidade_nome, uv.endereco as unidade_endereco, uv.cidade as unidade_cidade, uv.estado as unidade_estado,
           uv.whatsapp as unidade_whatsapp
    FROM vistorias v
    JOIN veiculos vei ON v.veiculo_id = vei.id
    JOIN unidades_vistoria uv ON v.unidade_id = uv.id
    WHERE v.vendedor_id = ${vendedorId}::uuid
      AND v.status NOT IN ('CANCELADA', 'CONCLUIDA')
    ORDER BY v.criado_em DESC
    LIMIT 1
  `);
  
  return rowsOf(res)[0] || null;
}

export async function confirmarVistoriaVendedor(vistoriaId: string, vendedorId: string) {
  const d = requireDb();
  
  await d.execute(sql`
    UPDATE vistorias 
    SET status = 'CONFIRMADA', confirmada_em = now(), atualizado_em = now()
    WHERE id = ${vistoriaId}::uuid AND vendedor_id = ${vendedorId}::uuid
  `);
  
  await d.execute(sql`
    INSERT INTO vistorias_historico (vistoria_id, acao, detalhe, usuario_id)
    VALUES (${vistoriaId}, 'Presença confirmada', 'Vendedor confirmou presença no agendamento.', ${vendedorId}::uuid)
  `);
  
  return { ok: true };
}

export async function remarcarAgendamentoVistoria(args: {
  vistoriaId: string;
  novaUnidadeId: unknown;
  novaData: string;
  novoHorario: string;
  usuarioId?: string | null;
  vendedorId?: string | null;
  permissaoAdmin?: boolean;
  unidade_nome?: string | null;
  unidade_cidade?: string | null;
}) {
  const d = requireDb();
  await ensureVistoriaSchema();

  const vistoriaIdRaw = String(args.vistoriaId ?? "").trim();
  const usuarioIdNormalizado = normalizarUuid(args.usuarioId);
  const vendedorIdNormalizado = normalizarUuid(args.vendedorId);

  if (!args.permissaoAdmin && !vendedorIdNormalizado) {
    throw new Error("Você não tem permissão para remarcar esse agendamento.");
  }
  if (!vistoriaIdRaw) {
    throw new Error("Agendamento inválido para remarcar (id vazio).");
  }

  let vistoria: any = undefined;
  const vistoriaIdLower = vistoriaIdRaw.toLowerCase();
  const apenasUuid = vistoriaIdLower.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);

  // TENTATIVA 1: igualdade exata (id::text) cast direto no template sql
  try {
    const buscaExata = vistoriaIdLower;
    // Usar parâmetro simples sem função SQL em volta (evita bugs de parametrização)
    const resText = await d.execute(sql`
      SELECT
        id::text as id,
        data_vistoria,
        horario_vistoria,
        status,
        veiculo_id::text as veiculo_id,
        vendedor_id::text as vendedor_id,
        unidade_id::text as unidade_id
      FROM vistorias
      WHERE id::text = ${buscaExata}
      LIMIT 1
    `);
    vistoria = rowsOf(resText)?.[0];
  } catch { /* ignore */ }

  // TENTATIVA 2: cast uuid
  if (!vistoria && apenasUuid?.[0]) {
    try {
      const resCast = await d.execute(sql`
        SELECT
          id::text as id,
          data_vistoria,
          horario_vistoria,
          status,
          veiculo_id::text as veiculo_id,
          vendedor_id::text as vendedor_id,
          unidade_id::text as unidade_id
        FROM vistorias
        WHERE id = ${apenasUuid[0]}::uuid
        LIMIT 1
      `);
      vistoria = rowsOf(resCast)?.[0];
    } catch { /* ignore */ }
  }

  // TENTATIVA 3: ILIKE substring
  if (!vistoria) {
    try {
      const parte = apenasUuid?.[0] || vistoriaIdLower.replace(/[^0-9a-f-]/gi, "").slice(0, 36);
      if (parte && parte.length >= 10) {
        const buscaLike = `%${parte}%`;
        const resLike = await d.execute(sql`
          SELECT
            id::text as id,
            data_vistoria,
            horario_vistoria,
            status,
            veiculo_id::text as veiculo_id,
            vendedor_id::text as vendedor_id,
            unidade_id::text as unidade_id
          FROM vistorias
          WHERE id::text ILIKE ${buscaLike}
          ORDER BY criado_em DESC
          LIMIT 50
        `);
        const linhas = rowsOf(resLike) || [];
        if (linhas.length === 1) {
          vistoria = linhas[0];
        } else if (linhas.length > 1) {
          vistoria = linhas.find((l: any) => String(l.id).toLowerCase() === vistoriaIdLower) || linhas[0];
        }
      }
    } catch { /* ignore */ }
  }

  // TENTATIVA 4 (DEFINITIVA): Listar as ultimas 500 vistorias e filtrar em MEMORIA JS
  if (!vistoria) {
    try {
      const todas = await d.execute(sql`
        SELECT
          id::text as id,
          data_vistoria,
          horario_vistoria,
          status,
          veiculo_id::text as veiculo_id,
          vendedor_id::text as vendedor_id,
          unidade_id::text as unidade_id
        FROM vistorias
        ORDER BY criado_em DESC
        LIMIT 500
      `);
      const arr = rowsOf(todas) || [];
      vistoria = arr.find((v: any) => {
        const idV = String(v.id || "").toLowerCase();
        if (idV === vistoriaIdLower) return true;
        if (apenasUuid?.[0] && idV.endsWith(apenasUuid[0].slice(-12))) return idV.includes(apenasUuid[0].slice(0, 8));
        return false;
      }) || arr.find((v: any) => {
        const idV = String(v.id || "").toLowerCase();
        const target = apenasUuid?.[0] || vistoriaIdLower;
        return idV.replace(/-/g, "") === target.replace(/-/g, "");
      });
    } catch { /* ignore */ }
  }

  // TENTATIVA 5 (MASTER FALLBACK): usa listarVistoriasAdmin() que é a query
  // que realmente funciona na prática (aparece na tabela do admin). Se ela retorna
  // array, a gente filtra por ID em JS. Por construção: se a vistoria aparece na
  // tabela admin, listarVistoriasAdmin retorna ela.
  if (!vistoria) {
    try {
      const todasAdmin = await listarVistoriasAdmin({});
      if (Array.isArray(todasAdmin)) {
        vistoria = todasAdmin.find((v: any) => {
          const idV = normalizarUuid(v.id) || String(v.id || "").toLowerCase();
          return idV === (apenasUuid?.[0] || vistoriaIdLower);
        }) || null;
      }
    } catch { /* ignore */ }
  }

  if (!vistoria) {
    const detalhe = [
      `raw="${vistoriaIdRaw}"`,
      `lower="${vistoriaIdLower}"`,
      `apenasUuid_match=${apenasUuid ? "SIM (" + apenasUuid[0] + ")" : "NAO"}`,
      `total_vistorias_limit_500=verificou_em_memo`,
      `tambem_usou_listarVistoriasAdmin_fallback=SIM`,
    ].join(" | ");
    throw new Error(
      `Agendamento de vistoria não encontrado (${detalhe}). Verifique se a vistoria existe na tabela do banco.`
    );
  }
  const vistoriaIdFinalTxt = normalizarUuid(vistoria.id);
  if (!vistoriaIdFinalTxt) throw new Error("Id da vistoria inválido na remarcação.");

  if (!args.permissaoAdmin && String(vistoria.vendedor_id || "").toLowerCase() !== String(vendedorIdNormalizado || "").toLowerCase()) {
    throw new Error("Você só pode remarcar suas próprias vistorias.");
  }

  if (["CANCELADA", "CONCLUIDA", "REPROVADA", "CONCLUIDA_COM_RESTRICOES", "REJEITADA", "EM_VISTORIA"].includes(String(vistoria.status || ""))) {
    throw new Error(`Não é possível remarcar uma vistoria com status "${vistoria.status}".`);
  }

  const dataAtualStr = String(vistoria.data_vistoria || "").slice(0, 10);
  const horarioAtualStr = String(vistoria.horario_vistoria || "").slice(0, 5);
  const minsAtual = toMinutes(horarioAtualStr);
  const agoraSPData = dataFormatadaSP(0);
  const agoraSPMin = minutosAgoraSP();
  if (!args.permissaoAdmin) {
    const antecedenciaMinimaMinutos = 60;
    if (dataAtualStr === agoraSPData) {
      if (minsAtual - agoraSPMin < antecedenciaMinimaMinutos) {
        throw new Error(
          `Só é permitido remarcar com no mínimo ${antecedenciaMinimaMinutos / 60} hora de antecedência. O horário está muito próximo.`
        );
      }
    } else if (dataAtualStr < agoraSPData) {
      throw new Error("O horário atual da vistoria já passou. Contate o suporte.");
    }
  }

  if (dataEstaNoPassado(args.novaData)) {
    throw new Error("A nova data selecionada está no passado.");
  }
  if (ehHojeSP(args.novaData)) {
    const mins = toMinutes(args.novoHorario);
    if (mins <= agoraSPMin) {
      throw new Error("O novo horário selecionado já passou. Escolha outro.");
    }
  }

  const unidade = await encontrarUnidadeRobusta({
    unidadeId: args.novaUnidadeId,
    nomeUnidade: args.unidade_nome || null,
    cidadeUnidade: args.unidade_cidade || null,
  });
  if (!unidade) throw new Error("Unidade de vistoria não encontrada para remarcar.");
  if (!unidade.ativo) throw new Error("A nova unidade selecionada está inativa.");
  const novaUnidadeIdTxt = normalizarUuid(unidade.id);
  if (!novaUnidadeIdTxt) throw new Error("A nova unidade encontrada não tem id válido.");

  const slots = await listarSlotsDisponiveisUnidade(novaUnidadeIdTxt, args.novaData, null);
  const disponivel = slots.slots.some((s: any) => s.value === String(args.novoHorario).slice(0, 5));
  if (!disponivel) {
    throw new Error("O horário selecionado já não está mais disponível para essa unidade. Escolha outro.");
  }

  await d.execute(sql`
    UPDATE vistorias SET
      unidade_id = ${novaUnidadeIdTxt}::uuid,
      data_vistoria = ${args.novaData},
      horario_vistoria = ${args.novoHorario},
      atualizado_em = now(),
      status = CASE WHEN status = 'CONFIRMADA' THEN 'AGUARDANDO_CONFIRMACAO' ELSE status END
    WHERE id = ${vistoriaIdFinalTxt}::uuid
  `);

  const detalhe = `Agendamento remarcado: ${dataAtualStr} às ${horarioAtualStr} → ${args.novaData} às ${args.novoHorario}` +
    (unidade?.nome ? ` (unidade: ${unidade.nome})` : "");

  try {
    await d.execute(sql`
      INSERT INTO vistorias_historico (vistoria_id, acao, detalhe, usuario_id)
      VALUES (
        ${vistoriaIdFinalTxt}::uuid,
        'Agendamento remarcado',
        ${detalhe},
        ${
          args.permissaoAdmin
            ? sql`${usuarioIdNormalizado}::uuid`
            : sql`${vendedorIdNormalizado}::uuid`
        }
      )
    `);
  } catch { /* ignore histórico */ }

  return { ok: true as const, id: vistoriaIdFinalTxt, novo_status: "AGUARDANDO_CONFIRMACAO" };
}

// App Vistoriador

export async function listarVistoriasHojeVistoriador(usuarioId: string) {
  const d = requireDb();
  await ensureVistoriaSchema();
  
  const res = await d.execute(sql`
    SELECT v.*, 
           vei.placa, vei.marca, vei.modelo, vei.ano_modelo AS ano,
           prof.nome as vendedor_nome,
           uv.nome as unidade_nome, uv.endereco as unidade_endereco,
           uv.cidade as unidade_cidade, uv.estado as unidade_estado
    FROM vistorias v
    JOIN veiculos vei ON v.veiculo_id = vei.id
    JOIN profiles prof ON v.vendedor_id = prof.id
    JOIN unidades_vistoria uv ON v.unidade_id = uv.id
    JOIN vistoriadores vist ON v.vistoriador_id = vist.id
    WHERE vist.usuario_id = ${usuarioId}::uuid
      AND v.data_vistoria = CURRENT_DATE
      AND v.status NOT IN ('CANCELADA')
    ORDER BY v.horario_vistoria ASC
  `);
  
  return rowsOf(res) || res;
}

export async function obterPainelVistoriador(usuarioId: string, filtros: {
  inicio?: string | null;
  fim?: string | null;
  status?: string | null;
  busca?: string | null;
} = {}) {
  const d = requireDb();
  await ensureVistoriaSchema();
  const id = normalizarUuid(usuarioId);
  if (!id) throw new Error("Usuário inválido.");

  const perfilRes = await d.execute(sql`
    SELECT p.id::text AS usuario_id, p.nome, p.email, p.whatsapp, p.telefone,
           vist.id::text AS vistoriador_id, vist.status AS vistoriador_status,
           uv.id::text AS unidade_id, uv.nome AS unidade_nome, uv.endereco AS unidade_endereco,
           uv.cep AS unidade_cep, uv.cidade AS unidade_cidade, uv.estado AS unidade_estado,
           uv.latitude, uv.longitude, uv.telefone AS unidade_telefone
    FROM profiles p
    LEFT JOIN vistoriadores vist ON vist.usuario_id = p.id
    LEFT JOIN unidades_vistoria uv ON uv.id = vist.unidade_id
    WHERE p.id = ${id}::uuid AND p.role::text = 'vistoriador'
    LIMIT 1
  `);
  const perfil = rowsOf(perfilRes)?.[0] || null;
  if (!perfil) throw new Error("Perfil de vistoriador não encontrado.");

  const metricasRes = await d.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE v.data_vistoria = (now() AT TIME ZONE 'America/Sao_Paulo')::date
        AND v.status NOT IN ('CANCELADA', 'CONCLUIDA'))::int AS agendadas_hoje,
      COUNT(*) FILTER (WHERE v.data_vistoria = (now() AT TIME ZONE 'America/Sao_Paulo')::date
        AND v.status = 'CONCLUIDA')::int AS concluidas_hoje,
      COUNT(*) FILTER (WHERE v.status = 'CONCLUIDA'
        AND v.data_vistoria >= date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date
        AND v.data_vistoria < (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 month')::date)::int AS realizadas_mes
    FROM vistorias v
    JOIN vistoriadores vist ON vist.id = v.vistoriador_id
    WHERE vist.usuario_id = ${id}::uuid
  `);

  let filtroSql = sql``;
  if (filtros.inicio) filtroSql = sql`${filtroSql} AND v.data_vistoria >= ${filtros.inicio}::date`;
  if (filtros.fim) filtroSql = sql`${filtroSql} AND v.data_vistoria <= ${filtros.fim}::date`;
  if (filtros.status && filtros.status !== "TODOS") filtroSql = sql`${filtroSql} AND v.status = ${filtros.status}`;
  if (filtros.busca?.trim()) {
    const busca = `%${filtros.busca.trim()}%`;
    filtroSql = sql`${filtroSql} AND (vei.placa ILIKE ${busca} OR vei.marca ILIKE ${busca} OR vei.modelo ILIKE ${busca})`;
  }

  const listaRes = await d.execute(sql`
    SELECT v.id::text AS id, v.data_vistoria, v.horario_vistoria, v.status,
           vei.placa, vei.marca, vei.modelo, vei.ano_modelo AS ano,
           p.nome AS vendedor_nome,
           uv.nome AS unidade_nome, uv.endereco AS unidade_endereco,
           uv.cidade AS unidade_cidade, uv.estado AS unidade_estado,
           l.id::text AS laudo_id, l.concluido_em
    FROM vistorias v
    JOIN vistoriadores vist ON vist.id = v.vistoriador_id
    JOIN veiculos vei ON vei.id = v.veiculo_id
    JOIN profiles p ON p.id = v.vendedor_id
    JOIN unidades_vistoria uv ON uv.id = v.unidade_id
    LEFT JOIN laudos l ON l.vistoria_id = v.id
    WHERE vist.usuario_id = ${id}::uuid ${filtroSql}
    ORDER BY v.data_vistoria DESC, v.horario_vistoria DESC
    LIMIT 250
  `);

  return {
    perfil,
    metricas: rowsOf(metricasRes)?.[0] || { agendadas_hoje: 0, concluidas_hoje: 0, realizadas_mes: 0 },
    vistorias: rowsOf(listaRes) || [],
  };
}

export async function alterarSenhaVistoriador(usuarioId: string, senhaAtual: string, novaSenha: string) {
  const d = requireDb();
  const id = normalizarUuid(usuarioId);
  if (!id) throw new Error("Usuário inválido.");
  const rows = await d.execute(sql`SELECT senha_hash FROM profiles WHERE id = ${id}::uuid AND role::text = 'vistoriador' LIMIT 1`);
  const perfil = rowsOf(rows)?.[0];
  if (!perfil?.senha_hash) return { ok: false as const, message: "Perfil sem senha cadastrada." };
  const { verifyPassword, hashPassword } = await import("./auth.server");
  if (!(await verifyPassword(senhaAtual, perfil.senha_hash))) {
    return { ok: false as const, message: "Senha atual incorreta." };
  }
  const hash = await hashPassword(novaSenha);
  await d.execute(sql`UPDATE profiles SET senha_hash = ${hash}, atualizado_em = now() WHERE id = ${id}::uuid`);
  return { ok: true as const };
}

export async function getVistoriaDetalheVistoriador(vistoriaId: string, usuarioId: string) {
  const d = requireDb();
  
  const res = await d.execute(sql`
    SELECT v.*, 
           vei.placa, vei.marca, vei.modelo, vei.ano_modelo AS ano, vei.km as km_base,
           prof.nome as vendedor_nome, prof.telefone as vendedor_telefone,
           uv.nome as unidade_nome, uv.endereco as unidade_endereco,
           uv.cidade as unidade_cidade, uv.estado as unidade_estado,
           l.id as laudo_id, l.status as laudo_status
    FROM vistorias v
    JOIN veiculos vei ON v.veiculo_id = vei.id
    JOIN profiles prof ON v.vendedor_id = prof.id
    JOIN unidades_vistoria uv ON v.unidade_id = uv.id
    JOIN vistoriadores vist ON v.vistoriador_id = vist.id
    LEFT JOIN laudos l ON l.vistoria_id = v.id
    WHERE v.id = ${vistoriaId}::uuid
      AND vist.usuario_id = ${usuarioId}::uuid
    LIMIT 1
  `);
  
  return rowsOf(res)[0] || null;
}

export async function iniciarCheckin(data: { vistoriaId: string; usuarioId: string; placa: string; localizacao: any }) {
  const d = requireDb();
  await ensureVistoriaSchema();

  const vistRes = await d.execute(sql`SELECT id FROM vistoriadores WHERE usuario_id = ${data.usuarioId}::uuid LIMIT 1`);
  const vistoriador = rowsOf(vistRes)[0];
  if (!vistoriador) throw new Error("Vistoriador não encontrado.");

  const vRes = await d.execute(sql`
    SELECT v.id, v.veiculo_id, vei.placa 
    FROM vistorias v 
    JOIN veiculos vei ON v.veiculo_id = vei.id
    WHERE v.id = ${data.vistoriaId}::uuid 
  `);
  const vistoria = rowsOf(vRes)[0];
  if (!vistoria) throw new Error("Vistoria não encontrada.");
  if (vistoria.placa.toUpperCase() !== data.placa.toUpperCase()) throw new Error("Essa placa não corresponde ao veículo agendado.");

  const res = await d.execute(sql`
    INSERT INTO laudos (vistoria_id, veiculo_id, vistoriador_id, placa_confirmada, localizacao_checkin, status)
    VALUES (${data.vistoriaId}::uuid, ${vistoria.veiculo_id}::uuid, ${vistoriador.id}::uuid, ${data.placa}, ${JSON.stringify(data.localizacao)}, 'EM_ANDAMENTO')
    ON CONFLICT (vistoria_id) DO UPDATE SET atualizado_em = now()
    RETURNING id
  `);

  const laudoId = rowsOf(res)[0].id;

  await d.execute(sql`UPDATE vistorias SET status = 'EM_ANDAMENTO', atualizado_em = now() WHERE id = ${data.vistoriaId}::uuid`);

  return { ok: true, laudoId };
}

export async function salvarItemChecklist(data: { laudoId: string; etapa: string; item_chave: string; status: string; observacao?: string | null; foto_url?: string | null }) {
  const d = requireDb();
  await ensureVistoriaSchema();

  await d.execute(sql`
    INSERT INTO laudo_checklist (laudo_id, etapa, item_chave, status, observacao, foto_url, atualizado_em)
    VALUES (${data.laudoId}::uuid, ${data.etapa}, ${data.item_chave}, ${data.status}, ${data.observacao}, ${data.foto_url}, now())
    ON CONFLICT (laudo_id, item_chave) DO UPDATE SET 
      status = EXCLUDED.status, 
      observacao = EXCLUDED.observacao, 
      foto_url = EXCLUDED.foto_url,
      atualizado_em = now()
  `);

  return { ok: true };
}

export async function salvarFotoLaudo(data: { laudoId: string; tipo_foto: string; url: string; metadata?: any }) {
  const d = requireDb();
  await ensureVistoriaSchema();
  const metadataJson = JSON.stringify(data.metadata ?? {});
  const chave = `vistoria/${data.laudoId}/${data.tipo_foto}`;

  await d.execute(sql`
    INSERT INTO laudo_fotos (laudo_id, chave, tipo_foto, url, metadata)
    VALUES (${data.laudoId}::uuid, ${chave}, ${data.tipo_foto}, ${data.url}, ${metadataJson}::jsonb)
  `);

  return { ok: true };
}

export async function concluirVistoriaApp(data: { laudoId: string; quilometragem: number; observacao_geral: string; declaracao: boolean }) {
  const d = requireDb();
  
  const lRes = await d.execute(sql`SELECT vistoria_id, veiculo_id FROM laudos WHERE id = ${data.laudoId}::uuid`);
  const laudo = rowsOf(lRes)[0];
  if (!laudo) throw new Error("Laudo não encontrado.");

  await d.execute(sql`
    UPDATE laudos SET 
      status = 'CONCLUIDO', 
      quilometragem_atual = ${data.quilometragem},
      observacao_geral = ${data.observacao_geral},
      declaracao_vistoriador = ${data.declaracao},
      concluido_em = now(),
      atualizado_em = now()
    WHERE id = ${data.laudoId}::uuid
  `);

  await d.execute(sql`UPDATE vistorias SET status = 'CONCLUIDA', atualizado_em = now() WHERE id = ${laudo.vistoria_id}::uuid`);
  
  await d.execute(sql`
    UPDATE veiculos SET 
      status = 'VISTORIA_CONCLUIDA', 
      status_analise = 'AGUARDANDO_ANALISE_LAUDO',
      km = ${data.quilometragem},
      atualizado_em = now() 
    WHERE id = ${laudo.veiculo_id}::uuid
  `);

  return { ok: true };
}

// ============================================================================
// CHECKLIST DINAMICO (Configuracao)
// ============================================================================

// Extrai a mensagem real do driver (drizzle esconde o motivo em `cause`)
export function detalharErroDb(e: any): string {
  const causa = e?.cause || e;
  const partes = [causa?.message, causa?.detail, causa?.hint].filter(Boolean);
  const msg = partes.join(" — ");
  return msg || e?.message || "Erro desconhecido no banco de dados.";
}

export async function ensureChecklistSchema() {
  const d = requireDb();
  await d.execute(sql`CREATE TABLE IF NOT EXISTS "vistorias_checklist_categorias" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "nome" text NOT NULL,
      "descricao" text,
      "ordem" integer NOT NULL DEFAULT 0,
      "ativo" boolean NOT NULL DEFAULT true,
      "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
      "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
    )`);
  await d.execute(sql`CREATE TABLE IF NOT EXISTS "vistorias_checklist_itens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "categoria_id" uuid NOT NULL REFERENCES vistorias_checklist_categorias(id) ON DELETE CASCADE,
      "titulo" text NOT NULL,
      "descricao_ajuda" text,
      "tipo_item" text NOT NULL DEFAULT 'CONFORMIDADE',
      "opcoes" jsonb,
      "obrigatorio" boolean NOT NULL DEFAULT true,
      "foto_obrigatoria" boolean NOT NULL DEFAULT false,
      "permite_observacao" boolean NOT NULL DEFAULT true,
      "ordem" integer NOT NULL DEFAULT 0,
      "ativo" boolean NOT NULL DEFAULT true,
      "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
      "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
    )`);
  await d.execute(sql`CREATE TABLE IF NOT EXISTS "laudo_vistoria_respostas" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "laudo_id" uuid NOT NULL,
      "vistoria_id" uuid NOT NULL,
      "categoria_id" uuid NOT NULL,
      "item_id" uuid NOT NULL,
      "resposta_conformidade" text,
      "resposta_texto" text,
      "resposta_numero" numeric(14,2),
      "resposta_opcoes" jsonb,
      "observacao" text,
      "foto_url" text,
      "respondido_em" timestamp with time zone DEFAULT now() NOT NULL,
      "respondido_por" uuid
    )`);

  // ------------------------------------------------------------------
  // HARDENING: bancos antigos podem ter as tabelas com colunas faltando
  // (CREATE TABLE IF NOT EXISTS nao corrige). Garantimos coluna a coluna.
  // ------------------------------------------------------------------
  const alters: string[] = [
    `ALTER TABLE vistorias_checklist_categorias ADD COLUMN IF NOT EXISTS descricao text`,
    `ALTER TABLE vistorias_checklist_categorias ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0`,
    `ALTER TABLE vistorias_checklist_categorias ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true`,
    `ALTER TABLE vistorias_checklist_categorias ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone NOT NULL DEFAULT now()`,
    `ALTER TABLE vistorias_checklist_categorias ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone NOT NULL DEFAULT now()`,
    `ALTER TABLE vistorias_checklist_itens ADD COLUMN IF NOT EXISTS descricao_ajuda text`,
    `ALTER TABLE vistorias_checklist_itens ADD COLUMN IF NOT EXISTS tipo_item text NOT NULL DEFAULT 'CONFORMIDADE'`,
    `ALTER TABLE vistorias_checklist_itens ADD COLUMN IF NOT EXISTS opcoes jsonb`,
    `ALTER TABLE vistorias_checklist_itens ADD COLUMN IF NOT EXISTS obrigatorio boolean NOT NULL DEFAULT true`,
    `ALTER TABLE vistorias_checklist_itens ADD COLUMN IF NOT EXISTS foto_obrigatoria boolean NOT NULL DEFAULT false`,
    `ALTER TABLE vistorias_checklist_itens ADD COLUMN IF NOT EXISTS permite_observacao boolean NOT NULL DEFAULT true`,
    `ALTER TABLE vistorias_checklist_itens ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0`,
    `ALTER TABLE vistorias_checklist_itens ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true`,
    `ALTER TABLE vistorias_checklist_itens ADD COLUMN IF NOT EXISTS criado_em timestamp with time zone NOT NULL DEFAULT now()`,
    `ALTER TABLE vistorias_checklist_itens ADD COLUMN IF NOT EXISTS atualizado_em timestamp with time zone NOT NULL DEFAULT now()`,
    // Auditoria: GPS + data/hora do preenchimento de cada item
    `ALTER TABLE laudo_vistoria_respostas ADD COLUMN IF NOT EXISTS observacao text`,
    `ALTER TABLE laudo_vistoria_respostas ADD COLUMN IF NOT EXISTS foto_url text`,
    `ALTER TABLE laudo_vistoria_respostas ADD COLUMN IF NOT EXISTS respondido_por uuid`,
    `ALTER TABLE laudo_vistoria_respostas ADD COLUMN IF NOT EXISTS respondido_em timestamp with time zone NOT NULL DEFAULT now()`,
    `ALTER TABLE laudo_vistoria_respostas ADD COLUMN IF NOT EXISTS gps_lat double precision`,
    `ALTER TABLE laudo_vistoria_respostas ADD COLUMN IF NOT EXISTS gps_lng double precision`,
    `ALTER TABLE laudo_vistoria_respostas ADD COLUMN IF NOT EXISTS gps_precisao double precision`,
    `ALTER TABLE laudo_vistoria_respostas ADD COLUMN IF NOT EXISTS registrado_em_dispositivo timestamp with time zone`,
  ];
  for (const stmt of alters) {
    try {
      await d.execute(sql.raw(stmt));
    } catch (e) {
      console.warn("[checklist-schema]", stmt, detalharErroDb(e));
    }
  }

  await d.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_laudo_respostas_unq_laudo_item ON laudo_vistoria_respostas(laudo_id, item_id)`);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_vistorias_checklist_categorias_ordem ON vistorias_checklist_categorias(ordem)`);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS idx_vistorias_checklist_itens_categoria_ordem ON vistorias_checklist_itens(categoria_id, ordem)`);
}


// Busca a categoria por nome ignorando maiúsculas, espaços e acentuação; cria só se realmente não existir.
// Tolera índices únicos existentes no banco (nunca estoura "duplicate key").
async function obterOuCriarCategoriaChecklist(
  d: any,
  cat: { nome: string; descricao?: string | null; ordem?: number | null },
): Promise<string | undefined> {
  const nome = (cat.nome || "").trim();
  if (!nome) return undefined;

  const buscar = async () => {
    const r = await d.execute(sql`
      SELECT id::text AS id FROM vistorias_checklist_categorias
      WHERE lower(btrim(nome)) = lower(btrim(${nome}))
         OR lower(btrim(nome)) = lower(btrim(normalize(${nome}, NFC)))
         OR lower(btrim(normalize(nome, NFC))) = lower(btrim(normalize(${nome}, NFC)))
      ORDER BY criado_em
      LIMIT 1
    `);
    return rowsOf(r)?.[0]?.id as string | undefined;
  };

  let id: string | undefined;
  try {
    id = await buscar();
  } catch {
    // bancos sem normalize(): compara apenas por lower/btrim
    const r = await d.execute(sql`
      SELECT id::text AS id FROM vistorias_checklist_categorias
      WHERE lower(btrim(nome)) = lower(btrim(${nome})) ORDER BY criado_em LIMIT 1
    `);
    id = rowsOf(r)?.[0]?.id as string | undefined;
  }

  if (id) {
    await d.execute(sql`
      UPDATE vistorias_checklist_categorias
      SET ativo = true, atualizado_em = now()
      WHERE id = ${id}::uuid
    `);
    return id;
  }

  try {
    const inserida = await d.execute(sql`
      INSERT INTO vistorias_checklist_categorias (nome, descricao, ordem)
      VALUES (${nome}, ${cat.descricao || null}, ${typeof cat.ordem === "number" ? cat.ordem : 0})
      RETURNING id::text AS id
    `);
    const novoId = rowsOf(inserida)?.[0]?.id as string | undefined;
    if (novoId) return novoId;
  } catch (e: any) {
    const msg = String(e?.cause?.message || e?.message || "");
    // Índice único no banco: a categoria já existe, então apenas reaproveita
    if (!/duplicate key|unique constraint/i.test(msg)) throw e;
  }

  const existente = await d.execute(sql`
    SELECT id::text AS id FROM vistorias_checklist_categorias
    WHERE nome = ${nome} OR lower(btrim(nome)) = lower(btrim(${nome}))
    ORDER BY criado_em LIMIT 1
  `);
  const idFinal = rowsOf(existente)?.[0]?.id as string | undefined;
  if (idFinal) {
    await d.execute(sql`UPDATE vistorias_checklist_categorias SET ativo = true, atualizado_em = now() WHERE id = ${idFinal}::uuid`);
  }
  return idFinal;
}

export async function listarChecklistConfig() {

  const d = requireDb();
  await ensureChecklistSchema();

  // ================================================================
  // SEED INTELIGENTE TYPESCRIPT: NUNCA COMEÇA DO ZERO.
  // (sem DO $$ PL/pgSQL — evita conflito de delimitadores $$ com sql template)
  // Cria/faz upsert APENAS das 8 CATEGORIAS PADRÃO (baseado em NOME ÚNICO).
  // - Se admin EXCLUIU categoria CUSTOM ("Suspensão"): NAO recria.
  // - Se admin EXCLUIU ACIDENTAL categoria PADRAO ("Pneus e Rodas"): RECRIA.
  // - Itens PADRAO: INSERT ON CONFLICT (categoria_id, titulo) DO NOTHING →
  //   NAO SOBRESCREVE edicoes do admin (ex: desativar foto obrigatoria em Coluna A)
  // ================================================================
  try {
    for (const catPadrao of SEED_CATEGORIAS_PADRAO) {
      // 1) Categoria padrão: obtém existente (mesmo com acentuação/espaços diferentes) ou cria
      const categoriaId = await obterOuCriarCategoriaChecklist(d, {
        nome: catPadrao.nome,
        descricao: catPadrao.descricao,
        ordem: catPadrao.ordem,
      });
      if (!categoriaId) continue;


      // 2) Itera itens padroes → INSERT individual (nao lote) + ON CONFLICT DO NOTHING → preserva edicao admin
      for (const itemPadrao of catPadrao.itens) {
        const opcoesJson = itemPadrao.opcoes && Array.isArray(itemPadrao.opcoes) && itemPadrao.opcoes.length > 0
          ? JSON.stringify(itemPadrao.opcoes)
          : null;
        const obrig = itemPadrao.obrigatorio === false ? false : true;
        const foto  = itemPadrao.foto_obrigatoria === true ? true : false;
        const obs   = itemPadrao.permite_observacao === false ? false : true;
        const ord   = typeof itemPadrao.ordem === "number" && itemPadrao.ordem > 0 ? itemPadrao.ordem : 0;

        const itemExistente = await d.execute(sql`
          SELECT id FROM vistorias_checklist_itens
          WHERE categoria_id = ${categoriaId}::uuid AND lower(titulo) = lower(${itemPadrao.titulo})
          LIMIT 1
        `);
        if (!rowsOf(itemExistente)?.[0]) {
          await d.execute(sql`
            INSERT INTO vistorias_checklist_itens (
              categoria_id, titulo, descricao_ajuda, tipo_item, opcoes,
              obrigatorio, foto_obrigatoria, permite_observacao, ordem
            ) VALUES (
              ${categoriaId}::uuid,
              ${itemPadrao.titulo},
              ${itemPadrao.descricao_ajuda || null},
              ${itemPadrao.tipo_item},
              ${opcoesJson}::jsonb,
              ${obrig},
              ${foto},
              ${obs},
              ${ord}
            )
          `);
        }
      } // fim itens
    } // fim categorias
  } catch (e) {
    console.warn("[seed-checklist] Falha parcial durante seed inteligente:", detalharErroDb(e));
  }

  const categorias = await d.execute(sql`
    SELECT
      c.id::text as id,
      c.nome,
      c.descricao,
      c.ordem,
      c.ativo,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', i.id::text,
          'categoria_id', i.categoria_id::text,
          'titulo', i.titulo,
          'descricao_ajuda', i.descricao_ajuda,
          'tipo_item', i.tipo_item,
          'opcoes', i.opcoes,
          'obrigatorio', i.obrigatorio,
          'foto_obrigatoria', i.foto_obrigatoria,
          'permite_observacao', i.permite_observacao,
          'ordem', i.ordem,
          'ativo', i.ativo
        ) ORDER BY i.ordem, i.criado_em)
        FROM vistorias_checklist_itens i
        WHERE i.categoria_id = c.id AND i.ativo = true
      ), '[]'::json) AS itens
    FROM vistorias_checklist_categorias c
    WHERE c.ativo = true
    ORDER BY c.ordem, c.criado_em
  `);

  return rowsOf(categorias) || [];
}

// Admin: criar categoria
export async function adminCriarCategoriaChecklist(data: { nome: string; descricao?: string; ordem?: number }) {
  const d = requireDb();
  await ensureChecklistSchema();
  const ordemVal = data.ordem && data.ordem > 0 ? data.ordem : 0;
  const existente = await d.execute(sql`SELECT id::text AS id FROM vistorias_checklist_categorias WHERE lower(nome) = lower(${data.nome.trim()}) LIMIT 1`);
  if (rowsOf(existente)?.[0]) throw new Error("Já existe uma categoria com esse nome.");
  let r: any;
  try {
    r = await d.execute(sql`
      INSERT INTO vistorias_checklist_categorias (nome, descricao, ordem)
      VALUES (${data.nome.trim()}, ${data.descricao || null}, ${ordemVal})
      RETURNING id::text as id
    `);
  } catch (e: any) {
    const msg = String(e?.cause?.message || e?.message || "");
    if (/duplicate key|unique constraint/i.test(msg)) {
      throw new Error(`Já existe uma categoria chamada "${data.nome.trim()}".`);
    }
    throw new Error(`Não foi possível gravar a categoria: ${detalharErroDb(e)}`);
  }

  const id = rowsOf(r)?.[0]?.id;
  if (!id) throw new Error("A categoria não foi gravada no banco de dados.");
  return { ok: true, id };
}


// Admin: atualizar categoria
export async function adminAtualizarCategoriaChecklist(data: { id: string; nome?: string; descricao?: string; ordem?: number; ativo?: boolean }) {
  const d = requireDb();
  await ensureChecklistSchema();
  const idNorm = normalizarUuid(data.id);
  if (!idNorm) throw new Error("Id categoria inválido.");
  await d.execute(sql`
    UPDATE vistorias_checklist_categorias SET
      nome = COALESCE(${data.nome || null}, nome),
      descricao = COALESCE(${data.descricao ?? null}, descricao),
      ordem = COALESCE(${data.ordem ?? null}, ordem),
      ativo = COALESCE(${data.ativo ?? null}, ativo),
      atualizado_em = now()
    WHERE id = ${idNorm}::uuid
  `);
  return { ok: true };
}

// Admin: excluir categoria
export async function adminExcluirCategoriaChecklist(idCategoria: string) {
  const d = requireDb();
  await ensureChecklistSchema();
  const idNorm = normalizarUuid(idCategoria);
  if (!idNorm) throw new Error("Id categoria inválido.");
  await d.execute(sql`DELETE FROM vistorias_checklist_categorias WHERE id = ${idNorm}::uuid`);
  return { ok: true };
}

// Admin: criar item
export async function adminCriarItemChecklist(data: {
  categoria_id: string;
  titulo: string;
  descricao_ajuda?: string;
  tipo_item?: string;
  opcoes?: any;
  obrigatorio?: boolean;
  foto_obrigatoria?: boolean;
  permite_observacao?: boolean;
  ordem?: number;
}) {
  const d = requireDb();
  await ensureChecklistSchema();
  const catId = normalizarUuid(data.categoria_id);
  if (!catId) throw new Error("Categoria inválida.");

  const tipo = data.tipo_item || "CONFORMIDADE";
  const opcoesJson = data.opcoes ? JSON.stringify(data.opcoes) : null;
  const ordemVal = data.ordem && data.ordem > 0 ? data.ordem : 0;

  const r = await d.execute(sql`
    INSERT INTO vistorias_checklist_itens (
      categoria_id, titulo, descricao_ajuda, tipo_item, opcoes,
      obrigatorio, foto_obrigatoria, permite_observacao, ordem
    ) VALUES (
      ${catId}::uuid,
      ${data.titulo},
      ${data.descricao_ajuda || null},
      ${tipo},
      ${opcoesJson}::jsonb,
      ${data.obrigatorio === false ? false : true},
      ${data.foto_obrigatoria === true ? true : false},
      ${data.permite_observacao === false ? false : true},
      ${ordemVal}
    ) RETURNING id::text as id
  `);
  return { ok: true, id: rowsOf(r)?.[0]?.id };
}

// Admin: atualizar item
export async function adminAtualizarItemChecklist(data: {
  id: string;
  categoria_id?: string;
  titulo?: string;
  descricao_ajuda?: string;
  tipo_item?: string;
  opcoes?: any;
  obrigatorio?: boolean;
  foto_obrigatoria?: boolean;
  permite_observacao?: boolean;
  ordem?: number;
  ativo?: boolean;
}) {
  const d = requireDb();
  await ensureChecklistSchema();
  const idNorm = normalizarUuid(data.id);
  if (!idNorm) throw new Error("Item inválido.");
  const catIdNorm = data.categoria_id ? normalizarUuid(data.categoria_id) : null;
  const opcoesJson = data.opcoes ? JSON.stringify(data.opcoes) : null;

  await d.execute(sql`
    UPDATE vistorias_checklist_itens SET
      categoria_id = COALESCE(${catIdNorm}::uuid, categoria_id),
      titulo = COALESCE(${data.titulo || null}, titulo),
      descricao_ajuda = COALESCE(${data.descricao_ajuda ?? null}, descricao_ajuda),
      tipo_item = COALESCE(${data.tipo_item || null}, tipo_item),
      opcoes = COALESCE(${opcoesJson}::jsonb, opcoes),
      obrigatorio = COALESCE(${data.obrigatorio ?? null}, obrigatorio),
      foto_obrigatoria = COALESCE(${data.foto_obrigatoria ?? null}, foto_obrigatoria),
      permite_observacao = COALESCE(${data.permite_observacao ?? null}, permite_observacao),
      ordem = COALESCE(${data.ordem ?? null}, ordem),
      ativo = COALESCE(${data.ativo ?? null}, ativo),
      atualizado_em = now()
    WHERE id = ${idNorm}::uuid
  `);
  return { ok: true };
}

// Admin: excluir item
export async function adminExcluirItemChecklist(idItem: string) {
  const d = requireDb();
  await ensureChecklistSchema();
  const idNorm = normalizarUuid(idItem);
  if (!idNorm) throw new Error("Item inválido.");
  await d.execute(sql`DELETE FROM vistorias_checklist_itens WHERE id = ${idNorm}::uuid`);
  return { ok: true };
}

// =============================================================
// Respostas do Checklist dinâmico (salvar / listar por laudo)
// =============================================================
export async function salvarRespostaChecklistDinamico(data: {
  laudoId: string;
  vistoriaId: string;
  item_id: string;
  categoria_id: string;
  resposta_conformidade?: string | null;
  resposta_texto?: string | null;
  resposta_numero?: number | null;
  resposta_opcoes?: any;
  observacao?: string | null;
  foto_url?: string | null;
  respondido_por?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  gps_precisao?: number | null;
  registrado_em_dispositivo?: string | null;
}) {
  const d = requireDb();
  await ensureChecklistSchema();

  const laudoIdNorm = normalizarUuid(data.laudoId);
  if (!laudoIdNorm) throw new Error("Laudo inválido.");
  const vistoriaIdNorm = normalizarUuid(data.vistoriaId);
  if (!vistoriaIdNorm) throw new Error("Vistoria inválida.");
  const itemIdNorm = normalizarUuid(data.item_id);
  if (!itemIdNorm) throw new Error("Item inválido.");
  const catIdNorm = normalizarUuid(data.categoria_id);
  if (!catIdNorm) throw new Error("Categoria inválida.");

  const userIdNorm = data.respondido_por ? normalizarUuid(data.respondido_por) : null;
  const opcoesJson = data.resposta_opcoes ? JSON.stringify(data.resposta_opcoes) : null;

  try {
    await d.execute(sql`
      INSERT INTO laudo_vistoria_respostas (
        laudo_id, vistoria_id, categoria_id, item_id,
        resposta_conformidade, resposta_texto, resposta_numero, resposta_opcoes,
        observacao, foto_url, respondido_por,
        gps_lat, gps_lng, gps_precisao, registrado_em_dispositivo
      ) VALUES (
        ${laudoIdNorm}::uuid,
        ${vistoriaIdNorm}::uuid,
        ${catIdNorm}::uuid,
        ${itemIdNorm}::uuid,
        ${data.resposta_conformidade || null},
        ${data.resposta_texto || null},
        ${data.resposta_numero ?? null},
        ${opcoesJson}::jsonb,
        ${data.observacao || null},
        ${data.foto_url || null},
        ${userIdNorm}::uuid,
        ${data.gps_lat ?? null},
        ${data.gps_lng ?? null},
        ${data.gps_precisao ?? null},
        ${data.registrado_em_dispositivo || null}
      )
      ON CONFLICT (laudo_id, item_id) DO UPDATE SET
        resposta_conformidade = EXCLUDED.resposta_conformidade,
        resposta_texto = EXCLUDED.resposta_texto,
        resposta_numero = EXCLUDED.resposta_numero,
        resposta_opcoes = EXCLUDED.resposta_opcoes,
        observacao = EXCLUDED.observacao,
        foto_url = EXCLUDED.foto_url,
        gps_lat = COALESCE(EXCLUDED.gps_lat, laudo_vistoria_respostas.gps_lat),
        gps_lng = COALESCE(EXCLUDED.gps_lng, laudo_vistoria_respostas.gps_lng),
        gps_precisao = COALESCE(EXCLUDED.gps_precisao, laudo_vistoria_respostas.gps_precisao),
        registrado_em_dispositivo = COALESCE(EXCLUDED.registrado_em_dispositivo, laudo_vistoria_respostas.registrado_em_dispositivo),
        respondido_em = now(),
        respondido_por = EXCLUDED.respondido_por
    `);
  } catch (e) {
    throw new Error(`Não foi possível salvar a resposta: ${detalharErroDb(e)}`);
  }

  return { ok: true };
}


export async function listarRespostasChecklistPorLaudo(laudoId: string) {
  const d = requireDb();
  await ensureChecklistSchema();
  const idNorm = normalizarUuid(laudoId);
  if (!idNorm) return [];

  const r = await d.execute(sql`
    SELECT
      id::text as id,
      laudo_id::text as laudo_id,
      vistoria_id::text as vistoria_id,
      categoria_id::text as categoria_id,
      item_id::text as item_id,
      resposta_conformidade,
      resposta_texto,
      resposta_numero,
      resposta_opcoes,
      observacao,
      foto_url,
      gps_lat,
      gps_lng,
      gps_precisao,
      registrado_em_dispositivo,
      respondido_em

    FROM laudo_vistoria_respostas
    WHERE laudo_id = ${idNorm}::uuid
    ORDER BY respondido_em
  `);
  return rowsOf(r) || [];
}

// ============================================================================
// TEMPLATES DE CHECKLIST (modelos prontos para copiar e depois editar)
// ============================================================================
export type TemplateChecklist = {
  id: string;
  nome: string;
  descricao: string;
  categorias: SeedCategoria[];
};

function categoriasPadraoPorNome(nomes: string[]): SeedCategoria[] {
  return nomes
    .map((n) => SEED_CATEGORIAS_PADRAO.find((c) => c.nome.toLowerCase() === n.toLowerCase()))
    .filter(Boolean) as SeedCategoria[];
}

const TEMPLATES_CHECKLIST: TemplateChecklist[] = [
  {
    id: "completa",
    nome: "Vistoria Completa (Padrão EJF)",
    descricao: "Modelo completo de vistoria veicular: identificação, estrutura, exterior, interior, mecânica, pneus, equipamentos e documentos.",
    categorias: SEED_CATEGORIAS_PADRAO,
  },
  {
    id: "rapida",
    nome: "Vistoria Rápida (Triagem)",
    descricao: "Modelo enxuto para triagem inicial: identificação, exterior e documentos.",
    categorias: categoriasPadraoPorNome(["Identificação", "Exterior", "Documentos"]),
  },
  {
    id: "mecanica",
    nome: "Vistoria Mecânica e Estrutural",
    descricao: "Foco técnico em estrutura, mecânica básica e pneus/rodas.",
    categorias: categoriasPadraoPorNome(["Identificação", "Estrutura", "Mecânica Básica", "Pneus e Rodas"]),
  },
  {
    id: "cabine",
    nome: "Vistoria de Cabine e Equipamentos",
    descricao: "Avaliação de interior, equipamentos e acessórios do veículo.",
    categorias: categoriasPadraoPorNome(["Identificação", "Interior", "Equipamentos"]),
  },
];

export function listarTemplatesChecklist() {
  return TEMPLATES_CHECKLIST.map((t) => ({
    id: t.id,
    nome: t.nome,
    descricao: t.descricao,
    total_categorias: t.categorias.length,
    total_itens: t.categorias.reduce((acc, c) => acc + c.itens.length, 0),
    categorias: t.categorias.map((c) => ({ nome: c.nome, total_itens: c.itens.length })),
  }));
}

export async function aplicarTemplateChecklist(templateId: string) {
  const d = requireDb();
  await ensureChecklistSchema();

  const template = TEMPLATES_CHECKLIST.find((t) => t.id === templateId);
  if (!template) throw new Error("Modelo de checklist não encontrado.");

  let categoriasCriadas = 0;
  let itensCriados = 0;

  try {
    const maiorOrdem = await d.execute(sql`SELECT COALESCE(MAX(ordem), 0) AS ordem FROM vistorias_checklist_categorias`);
    let ordemBase = Number(rowsOf(maiorOrdem)?.[0]?.ordem || 0);

    for (const cat of template.categorias) {
      const antes = await d.execute(sql`SELECT count(*)::int AS total FROM vistorias_checklist_categorias`);
      const totalAntes = Number(rowsOf(antes)?.[0]?.total || 0);

      ordemBase += 10;
      const categoriaId = await obterOuCriarCategoriaChecklist(d, {
        nome: cat.nome,
        descricao: cat.descricao,
        ordem: ordemBase,
      });
      if (!categoriaId) continue;

      const depois = await d.execute(sql`SELECT count(*)::int AS total FROM vistorias_checklist_categorias`);
      if (Number(rowsOf(depois)?.[0]?.total || 0) > totalAntes) categoriasCriadas += 1;


      for (const item of cat.itens) {
        const jaExiste = await d.execute(sql`
          SELECT id::text AS id FROM vistorias_checklist_itens
          WHERE categoria_id = ${categoriaId}::uuid AND lower(titulo) = lower(${item.titulo}) LIMIT 1
        `);
        const itemExistenteId = rowsOf(jaExiste)?.[0]?.id as string | undefined;
        if (itemExistenteId) {
          await d.execute(sql`
            UPDATE vistorias_checklist_itens
            SET ativo = true, atualizado_em = now()
            WHERE id = ${itemExistenteId}::uuid
          `);
          continue;
        }

        const opcoesJson = item.opcoes && Array.isArray(item.opcoes) && item.opcoes.length > 0
          ? JSON.stringify(item.opcoes)
          : null;

        try {
          await d.execute(sql`
            INSERT INTO vistorias_checklist_itens (
              categoria_id, titulo, descricao_ajuda, tipo_item, opcoes,
              obrigatorio, foto_obrigatoria, permite_observacao, ordem
            ) VALUES (
              ${categoriaId}::uuid,
              ${item.titulo},
              ${item.descricao_ajuda || null},
              ${item.tipo_item},
              ${opcoesJson}::jsonb,
              ${item.obrigatorio === false ? false : true},
              ${item.foto_obrigatoria === true ? true : false},
              ${item.permite_observacao === false ? false : true},
              ${typeof item.ordem === "number" ? item.ordem : 0}
            )
          `);
          itensCriados += 1;
        } catch (e: any) {
          const msg = String(e?.cause?.message || e?.message || "");
          if (!/duplicate key|unique constraint/i.test(msg)) throw e;
        }

      }
    }
  } catch (e) {
    throw new Error(`Não foi possível aplicar o modelo: ${detalharErroDb(e)}`);
  }

  // Devolve a configuração recém-lida do banco para a interface não depender
  // de uma segunda requisição (que pode ser atendida por cache intermediário).
  const categorias = await listarChecklistConfig();
  return { ok: true as const, categoriasCriadas, itensCriados, categorias };
}
