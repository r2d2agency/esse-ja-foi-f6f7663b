/**
 * Compartilhado entre o cadastro do próprio vendedor (/vendedor/cadastrar) e o
 * pré-cadastro interno feito pelo funcionário (WizardPreCadastro), para que os
 * dois fluxos capturem as mesmas fotos e perguntas de condição do veículo — e
 * gravem `observacoes` num formato que qualquer um dos dois consegue reabrir.
 */

export const FOTOS_VEICULO: { id: string; label: string; dica?: string }[] = [
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
  restricao: string;
  historicoObs: string;
  chaveReserva: string;
  manual: string;
  estepe: string;
  acessorios: string;
  acessoriosQuais: string;
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
  restricao: "",
  historicoObs: "",
  chaveReserva: "",
  manual: "",
  estepe: "",
  acessorios: "",
  acessoriosQuais: "",
};

/** Mesmo formato lido por `desserializarObservacoes` em /vendedor/cadastrar. */
export function serializarCondicao(condicao: CondicaoVeiculo) {
  return JSON.stringify({ versao: 2, snapshot: condicao });
}
