/**
 * Compartilhado entre o cadastro do próprio vendedor (/vendedor/cadastrar) e o
 * pré-cadastro interno feito pelo funcionário (WizardPreCadastro), para que os
 * dois fluxos capturem as mesmas fotos e perguntas de condição do veículo — e
 * gravem `observacoes` num formato que qualquer um dos dois consegue reabrir.
 */

export type TipoVeiculo = "CARRO" | "MOTO";

export type FotoVeiculo = { id: string; label: string; dica?: string };

/** Catálogo de CARRO — IDs são legados, não renomear (fotos salvas referenciam). */
export const FOTOS_VEICULO: FotoVeiculo[] = [
  { id: "frente45", label: "Frente 45°", dica: "Mostre a frente e uma lateral." },
  { id: "traseira45", label: "Traseira 45°", dica: "Mostre a traseira e uma lateral." },
  { id: "lateralEsq", label: "Lateral esquerda", dica: "Carro inteiro no enquadramento." },
  { id: "lateralDir", label: "Lateral direita", dica: "Carro inteiro no enquadramento." },
  { id: "painel", label: "Painel", dica: "Com o painel ligado." },
  { id: "km", label: "Quilometragem", dica: "Odômetro legível." },
  { id: "bancosDianteiros", label: "Bancos dianteiros" },
  { id: "bancosTraseiros", label: "Bancos traseiros" },
  { id: "motor", label: "Motor", dica: "Capô aberto." },
  { id: "portaMalas", label: "Porta-malas" },
];

/** Slots de foto da moto (IDs novos, específicos). */
export const FOTOS_MOTO: FotoVeiculo[] = [
  { id: "frente45", label: "Frente 45°", dica: "Mostre a frente e uma lateral." },
  { id: "traseira45", label: "Traseira 45°", dica: "Mostre a traseira e uma lateral." },
  { id: "lateralEsq", label: "Lateral esquerda", dica: "Moto inteira no enquadramento." },
  { id: "lateralDir", label: "Lateral direita", dica: "Moto inteira no enquadramento." },
  { id: "painel", label: "Painel", dica: "Com o painel ligado." },
  { id: "km", label: "Quilometragem", dica: "Odômetro legível." },
  { id: "motor", label: "Motor", dica: "Carenagem/tampa do motor visível." },
  { id: "pneusRodas", label: "Pneus e rodas", dica: "Banda de rodagem visível." },
  { id: "relacaoTransmissao", label: "Relação / transmissão", dica: "Corrente, coroa e pinhão." },
  { id: "guidaoComandos", label: "Guidão e comandos", dica: "Manetes, espelhos e painel." },
];

/**
 * Catálogo por tipo do veículo. Tipo ausente/inválido vira CARRO — preserva
 * veículos cadastrados antes de existir diferenciação carro/moto.
 */
export function normalizarTipoVeiculo(tipo?: string | null): TipoVeiculo {
  return tipo === "MOTO" ? "MOTO" : "CARRO";
}

export function obterFotosVeiculo(tipo?: string | null): FotoVeiculo[] {
  return normalizarTipoVeiculo(tipo) === "MOTO" ? FOTOS_MOTO : FOTOS_VEICULO;
}

export type CondicaoVeiculo = {
  funcionamento: string;
  funcionamentoObs: string;
  motor: string;
  motorObs: string;
  cambioProblema: string;
  lataria: string;
  latariaObs: string;
  interior: string;
  pneus: string;
  acidente: string;
  leilao: string;
  sinistro: string;
  debitos: string;
  restricao: string;
  historicoObs: string;
  chaveReserva: string;
  manual: string;
  estepe: string;
  acessoriosSelecionados: string[];
  /** Observação opcional por foto (chave = URL da foto). Ex.: "risco na lataria". */
  fotosNotas: Record<string, string>;
};

export const CONDICAO_INICIAL: CondicaoVeiculo = {
  funcionamento: "",
  funcionamentoObs: "",
  motor: "",
  motorObs: "",
  cambioProblema: "",
  lataria: "",
  latariaObs: "",
  interior: "",
  pneus: "",
  acidente: "",
  leilao: "",
  sinistro: "",
  debitos: "",
  restricao: "",
  historicoObs: "",
  chaveReserva: "",
  manual: "",
  estepe: "",
  acessoriosSelecionados: [],
  fotosNotas: {},
};

/**
 * Mesmo formato lido por `desserializarObservacoes` em /vendedor/cadastrar.
 * Além do campo canônico `acessoriosSelecionados`, grava também `acessorios`
 * (Sim/Não) e `acessoriosQuais` (lista em texto) — os nomes que aquele fluxo
 * já sabe ler — para que o vendedor veja a lista preenchida se depois abrir
 * o mesmo veículo em /vendedor/cadastrar.
 */
export function serializarCondicao(condicao: CondicaoVeiculo) {
  const snapshot = {
    ...condicao,
    acessorios: condicao.acessoriosSelecionados.length > 0 ? "Sim" : "Não",
    acessoriosQuais: condicao.acessoriosSelecionados.join(", "),
  };
  return JSON.stringify({ versao: 2, snapshot });
}

/**
 * Lista de acessórios marcados, preferindo o array canônico
 * `acessoriosSelecionados` e caindo para o texto legado `acessoriosQuais`
 * (formato "Item A, Item B") quando o veículo foi cadastrado antes do
 * checklist existir.
 */
export function listarAcessorios(condicao?: Record<string, any> | null): string[] {
  if (!condicao) return [];
  if (Array.isArray(condicao.acessoriosSelecionados) && condicao.acessoriosSelecionados.length > 0) {
    return condicao.acessoriosSelecionados;
  }
  if (typeof condicao.acessoriosQuais === "string" && condicao.acessoriosQuais.trim()) {
    return condicao.acessoriosQuais
      .split(",")
      .map((item: string) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Inverso de `serializarCondicao` — também lê o formato mais antigo (campos
 * soltos em `historico`/`itens`/etc, sem `snapshot`) usado por outras telas
 * que gravam `veiculos.observacoes` nesse formato legado.
 */
export function desserializarCondicao(obsRaw?: string | null): Record<string, any> {
  if (!obsRaw) return {};

  try {
    const parsed = JSON.parse(obsRaw);
    if (!parsed || typeof parsed !== "object") return {};

    const snapshot =
      typeof parsed.snapshot === "object" && parsed.snapshot
        ? (parsed.snapshot as Record<string, any>)
        : (parsed as Record<string, any>);

    const historico = (parsed.historico || {}) as Record<string, any>;
    const itens = (parsed.itens || {}) as Record<string, any>;

    return {
      ...snapshot,
      fotosNotas: snapshot.fotosNotas ?? {},
      acidente: snapshot.acidente ?? historico.acidente ?? "",
      leilao: snapshot.leilao ?? historico.leilao ?? "",
      sinistro: snapshot.sinistro ?? historico.sinistro ?? "",
      debitos: snapshot.debitos ?? historico.debitos ?? "",
      restricao: snapshot.restricao ?? historico.restricao ?? "",
      historicoObs: snapshot.historicoObs ?? historico.obs ?? "",
      chaveReserva: snapshot.chaveReserva ?? itens.chaveReserva ?? "",
      manual: snapshot.manual ?? itens.manual ?? "",
      estepe: snapshot.estepe ?? itens.estepe ?? "",
      acessoriosQuais: snapshot.acessoriosQuais ?? itens.acessorios ?? "",
    };
  } catch {
    return {};
  }
}
