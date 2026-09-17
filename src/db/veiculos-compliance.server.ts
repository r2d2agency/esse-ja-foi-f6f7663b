import { sql } from "drizzle-orm";

/**
 * Define o que é obrigatório para os dados cadastrais e fotos de um veículo.
 */
export function calcularProgressoVeiculo(v: any) {
  const pendencias: string[] = [];

  // 1. Campos obrigatórios de dados cadastrais
  const camposObrigatorios = [
    { key: "renavam", label: "Renavam" },
    { key: "ano_fabricacao", label: "Ano de Fabricação" },
    { key: "ano_modelo", label: "Ano do Modelo" },
    { key: "km", label: "Quilometragem" },
    { key: "cor", label: "Cor" },
    { key: "combustivel", label: "Combustível" },
    { key: "cambio", label: "Câmbio" },
  ];

  camposObrigatorios.forEach((campo) => {
    if (!v[campo.key]) {
      pendencias.push(`${campo.label} não informado`);
    }
  });

  // 2. Fotos obrigatórias (exemplo: mínimo 4 fotos)
  const fotos = typeof v.fotos === "string" ? JSON.parse(v.fotos) : v.fotos || [];
  const minFotos = 4;
  const fotosFaltantes = Math.max(0, minFotos - fotos.length);

  return {
    dadosCadastrais: {
      isCompleto: pendencias.length === 0,
      pendencias,
    },
    fotos: {
      isCompleto: fotos.length >= minFotos,
      total: fotos.length,
      minimo: minFotos,
      faltantes: fotosFaltantes,
    },
  };
}

/**
 * Valida se um veículo pode ser liberado para vistoria.
 */
export function canReleaseForInspection(v: any) {
  const progresso = calcularProgressoVeiculo(v);
  const details = {
    compliance: v.compliance_status === "APROVADO",
    dados: progresso.dadosCadastrais.isCompleto,
    crlv: v.documento_crlv_status === "APROVADO",
    fotos: progresso.fotos.isCompleto,
    vendedor: !!v.vendedor_nome,
  };
  const blockers: string[] = [];

  if (!details.vendedor) {
    blockers.push("Vincular o vendedor responsável ao veículo.");
  }

  if (!details.compliance) {
    blockers.push("Aprovar o cadastro do vendedor no compliance.");
  }

  if (!details.crlv) {
    blockers.push("Aprovar o CRLV-e do veículo.");
  }

  if (!details.dados) {
    blockers.push(...progresso.dadosCadastrais.pendencias);
  }

  if (!details.fotos) {
    blockers.push(
      `Enviar pelo menos ${progresso.fotos.minimo} fotos obrigatórias (${progresso.fotos.total} enviadas).`,
    );
  }

  // Se não houver vendedor vinculado, não pode liberar
  if (!details.vendedor) {
    return { ready: false, details, blockers };
  }

  const isReady = Object.values(details).every(Boolean);

  return {
    ready: isReady,
    details,
    blockers,
  };
}
