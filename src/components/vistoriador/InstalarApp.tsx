import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const CHAVE_DISPENSADO = "ejf_instalar_app_dispensado";

export function InstalarApp() {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [iosVisivel, setIosVisivel] = useState(false);
  const [dispensado, setDispensado] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const jaDispensou = window.localStorage.getItem(CHAVE_DISPENSADO) === "1";
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setDispensado(jaDispensou || standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const ua = window.navigator.userAgent;
    const ehIos = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    if (ehIos && !standalone) setIosVisivel(true);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (dispensado || (!prompt && !iosVisivel)) return null;

  const fechar = () => {
    window.localStorage.setItem(CHAVE_DISPENSADO, "1");
    setDispensado(true);
  };

  const instalar = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    fechar();
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-accent/10 p-4">
      <button
        type="button"
        onClick={fechar}
        aria-label="Dispensar convite de instalação"
        className="absolute right-3 top-3 text-accent-foreground/60 hover:text-accent-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-6 text-sm font-black text-foreground">Instale o app no seu celular</p>
      {prompt ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Acesso rápido às vistorias, câmera e GPS direto da tela inicial — funciona até offline.
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
    </div>
  );
}
