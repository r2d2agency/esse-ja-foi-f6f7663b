
export const ESTADOS_CIVIS = [
  "Solteiro(a)",
  "Casado(a)",
  "União estável",
  "Divorciado(a)",
  "Viúvo(a)",
  "Outro"
];

export const PROFISSOES = [
  "Empresário(a)",
  "Autônomo(a)",
  "Comerciante",
  "Vendedor(a)",
  "Funcionário(a) público",
  "Funcionário(a) privado",
  "Profissional liberal",
  "Aposentado(a)",
  "Estudante",
  "Outro"
];

export const MARCAS_POPULARES = [
  "Chevrolet", "Fiat", "Volkswagen", "Ford", "Toyota", "Honda", "Hyundai", "Jeep", "Renault", "Nissan"
];

export const TODAS_MARCAS = [
  ...MARCAS_POPULARES,
  "Peugeot", "Citroën", "Mitsubishi", "Kia", "BMW", "Mercedes-Benz", "Audi", "Volvo", "Caoa Chery", "BYD", "GWM", "RAM", "Land Rover", "Porsche", "Suzuki", "Subaru", "Outra marca"
];

export const MODELOS_POR_MARCA: Record<string, string[]> = {
  "Honda": ["City", "Civic", "HR-V", "WR-V", "ZR-V", "CR-V", "Accord", "Outro"],
  "Toyota": ["Corolla", "Hilux", "SW4", "Yaris", "Rav4", "Outro"],
  "Volkswagen": ["Gol", "Polo", "Virtus", "T-Cross", "Nivus", "Taos", "Amarok", "Jetta", "Outro"],
  "Fiat": ["Strada", "Mobi", "Argo", "Cronos", "Pulse", "Fastback", "Toro", "Fiorino", "Outro"],
  "Chevrolet": ["Onix", "Onix Plus", "Tracker", "Montana", "S10", "Spin", "Cruze", "Equinox", "Outro"],
  "Hyundai": ["HB20", "HB20S", "Creta", "Tucson", "I30", "Outro"],
  "Jeep": ["Renegade", "Compass", "Commander", "Outro"],
  "Renault": ["Kwid", "Sandero", "Logan", "Duster", "Oroch", "Outro"],
  // Adicionar mais conforme necessário
};

export const CORES = ["Branco", "Preto", "Prata", "Cinza", "Vermelho", "Azul", "Verde", "Marrom", "Bege", "Amarelo", "Laranja", "Outra"];

export const COMBUSTIVEIS = ["Flex", "Gasolina", "Etanol", "Diesel", "Híbrido", "Híbrido plug-in", "Elétrico", "GNV", "Outro", "Não sei informar"];

export const CAMBIOS = ["Manual", "Automático", "CVT", "Automatizado", "Outro", "Não sei informar"];

export const PORTAS = ["2", "3", "4", "5", "Não sei informar"];

export const RELACOES_PROPRIETARIO = ["Cônjuge", "Familiar", "Sócio", "Empresa", "Procurador", "Outro"];

export const BANCOS_COMUNS = ["Banco do Brasil", "Itaú", "Bradesco", "Santander", "Caixa Econômica", "BV Financeira", "Safra", "Pan", "Nubank", "Outro"];

export const CATEGORIAS_VEICULOS = [
  "Hatch", "Sedan", "SUV", "Picape", "Utilitário", "Premium", "Esportivo", "Antigo", "Outros"
];

export const ACESSORIOS_VEICULO = [
  "Ar condicionado",
  "Ar quente",
  "Direção hidráulica",
  "Direção elétrica",
  "Vidro elétrico",
  "Trava elétrica",
  "Limpador traseiro",
  "Desembaçador traseiro",
  "Airbag",
  "Freios ABS",
  "Som/multimídia",
  "Central com Android Auto/CarPlay",
  "Sensor de ré",
  "Câmera de ré",
  "Piloto automático",
  "Teto solar",
  "Bancos de couro",
  "Rodas de liga leve",
];

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];
