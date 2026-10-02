import { useEffect, useState } from "react";
import { Download, X, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const CHAVE_DISPENSADO = "ejf_instalar_app_dispensado";
const CHAVE_INSTALADO = "ejf_instalar_app_instalado";
/** Depois de dispensar, o convite volta a aparecer após este intervalo. */
const DIAS_PARA_REMOSTRAR = 30;

function lerDispensado(): number {
  if (typeof window === "undefined") return Date.now();
  const bruto = window.localStorage.getItem(CHAVE_DISPENSADO);
  if (!bruto) return 0;
  const quando = Number(bruto);
  // Valor antigo era "1"; trata como dispensado agora, mas sem data de referência.
  return Number.isFinite(quando) && quando > 1 ? quando : Date.now();
}

function estaInstalado() {
  if (typeof window === "undefined") return true;
  if (window.localStorage.getItem(CHAVE_INSTALADO) === "1") return true;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function ehIos() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPadOS 13+ se apresenta como Mac com tela de toque.
  const iPadOs =
    /Macintosh/.test(ua) && "ontouchend" in document && (navigator.maxTouchPoints || 0) > 1;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream ? true : iPadOs;
}

/**
 * Convite para instalar o PWA.
 *
 * `compacto` serve para um banner embutido nas telas (vistoriador, comprador);
 * o padrão é um aviso flutuante, exibido uma vez por sessão, para quem usa
 * qualquer outra parte do site.
 */
export function InstalarApp({ compacto = false }: { compacto?: boolean }) {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    if (estaInstalado()) return;

    const quando = lerDispensado();
    const dispensadoRecentemente =
      quando > 0 && Date.now() - quando < DIAS_PARA_REMOSTRAR * 24 * 60 * 60 * 1000;

    if (dispensadoRecentemente) {
      setDispensado(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
      if (!compacto) setVisivel(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // No iOS o evento não existe; o aviso flutuante sempre orienta o caminho manual.
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (ehIos()) {
      timer = setTimeout(() => setVisivel(true), 4000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      if (timer) clearTimeout(timer);
    };
  }, [compacto]);

  const fechar = () => {
    window.localStorage.setItem(CHAVE_DISPENSADO, String(Date.now()));
    setDispensado(true);
    setVisivel(false);
  };

  const instalar = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const escolha = await prompt.userChoice.catch(() => null);
    if (escolha?.outcome === "accepted") {
      window.localStorage.setItem(CHAVE_INSTALADO, "1");
      toast.success("App instalado!");
    }
    fechar();
  };

  const conteudo = (
    <>
      <p className="pr-6 text-sm font-black text-foreground">Instale o app no seu celular</p>
      {prompt ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Acesso mais rápido, com atalho na tela inicial — funciona até offline.
          </p>
          <button
            type="button"
            onClick={instalar}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground"
          >
            <Download className="h-4 w-4" />
            Instalar agora
          </button>
        </>
      ) : (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          No iPhone: toque em <Share className="h-3.5 w-3.5" /> Compartilhar e depois em
          <strong>Adicionar à Tela de Início</strong>.
        </p>
      )}
    </>
  );

  const cabecalho = (
    <button
      type="button"
      onClick={() => fechar()}
      aria-label="Dispensar convite de instalação"
      className="absolute right-3 top-3 text-accent-foreground/60 hover:text-accent-foreground"
    >
      <X className="h-4 w-4" />
    </button>
  );

  if (compacto) {
    if (dispensado || (!prompt && !ehIos())) return null;
    return (
      <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-accent/10 p-4">
        {cabecalho}
        {conteudo}
      </div>
    );
  }

  if (!visivel || dispensado) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm">
      <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-accent/10 bg-background p-4 shadow-lg">
        {cabecalho}
        <Smartphone className="mb-2 h-5 w-5 text-accent-foreground" />
        {conteudo}
      </div>
    </div>
  );
}