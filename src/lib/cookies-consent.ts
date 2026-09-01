export const VERSAO_POLITICA_COOKIES = '1.0';
export const VERSAO_CONSENTIMENTO = 1;
export const CHAVE_CONSENTIMENTO = 'ejf_consentimento_cookies';

export type CategoriaCookie = 'necessary' | 'functionality' | 'analytics' | 'marketing';

export const CATEGORIAS: {
  id: CategoriaCookie;
  titulo: string;
  descricao: string;
  obrigatoria?: boolean;
}[] = [
  {
    id: 'necessary',
    titulo: 'Necessários',
    descricao:
      'Essenciais para autenticação, segurança, envio de formulários e funcionamento básico do Esse Já Foi. Não dependem de consentimento.',
    obrigatoria: true,
  },
  {
    id: 'functionality',
    titulo: 'Funcionalidade',
    descricao:
      'Guardam preferências como dados preenchidos em rascunhos, filtros da vitrine e ajustes de exibição.',
  },
  {
    id: 'analytics',
    titulo: 'Analytics',
    descricao:
      'Ajudam a entender como o site é utilizado, de forma agregada, para melhorar a experiência.',
  },
  {
    id: 'marketing',
    titulo: 'Marketing',
    descricao:
      'Permitem medir campanhas e exibir comunicações mais relevantes fora da plataforma.',
  },
];

export type PreferenciasCookies = Record<CategoriaCookie, boolean>;

export type RegistroConsentimento = {
  categorias: PreferenciasCookies;
  registradoEm: string;
  versaoPolitica: string;
  versaoConsentimento: number;
};

export const PREFERENCIAS_PADRAO: PreferenciasCookies = {
  necessary: true,
  functionality: false,
  analytics: false,
  marketing: false,
};

export const TODAS_ACEITAS: PreferenciasCookies = {
  necessary: true,
  functionality: true,
  analytics: true,
  marketing: true,
};

export function lerConsentimento(): RegistroConsentimento | null {
  if (typeof window === 'undefined') return null;
  try {
    const bruto = window.localStorage.getItem(CHAVE_CONSENTIMENTO);
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as RegistroConsentimento;
    if (!dados?.categorias) return null;
    if (dados.versaoPolitica !== VERSAO_POLITICA_COOKIES) return null;
    if (dados.versaoConsentimento !== VERSAO_CONSENTIMENTO) return null;
    return {
      ...dados,
      categorias: { ...PREFERENCIAS_PADRAO, ...dados.categorias, necessary: true },
    };
  } catch {
    return null;
  }
}

export function salvarConsentimento(categorias: PreferenciasCookies): RegistroConsentimento {
  const registro: RegistroConsentimento = {
    categorias: { ...categorias, necessary: true },
    registradoEm: new Date().toISOString(),
    versaoPolitica: VERSAO_POLITICA_COOKIES,
    versaoConsentimento: VERSAO_CONSENTIMENTO,
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify(registro));
    window.dispatchEvent(new CustomEvent('ejf:consentimento', { detail: registro }));
  }
  aplicarConsentimento(registro.categorias);
  return registro;
}

/**
 * Auditoria dos scripts carregados na landing page (setembro/2026):
 * - Google Fonts (fonts.googleapis.com) -> necessário (apresentação, sem cookies de rastreio)
 * - Service worker /sw.js e manifest -> necessário
 * - Sem Google Analytics, sem Meta Pixel, sem tags de terceiros.
 * Quando uma ferramenta for adicionada, registre-a aqui com sua categoria.
 */
type ScriptCategorizado = {
  id: string;
  categoria: Exclude<CategoriaCookie, 'necessary'>;
  carregar: () => void;
  remover?: () => void;
};

const SCRIPTS: ScriptCategorizado[] = [];

const carregados = new Set<string>();

export function aplicarConsentimento(categorias: PreferenciasCookies) {
  if (typeof window === 'undefined') return;
  for (const script of SCRIPTS) {
    const permitido = categorias[script.categoria] === true;
    if (permitido && !carregados.has(script.id)) {
      script.carregar();
      carregados.add(script.id);
    }
    if (!permitido && carregados.has(script.id)) {
      script.remover?.();
      carregados.delete(script.id);
      // revogação: recarrega para descartar scripts já injetados sem API de remoção
      if (!script.remover) window.location.reload();
    }
  }
}

export function abrirConfiguracoesCookies() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('ejf:abrir-cookies'));
}
