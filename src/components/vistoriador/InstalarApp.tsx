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
    <div className="relative rounded-2xl border border-teal-200 bg-teal-50 p-4">
      <button
        type="button"
        onClick={fechar}
        aria-label="Dispensar convite de instalação"
        className="absolute right-3 top-3 text-teal-700/60 hover:text-teal-900"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-6 text-sm font-black text-teal-900">Instale o app no seu celular</p>
      {prompt ? (
        <>
          <p className="mt-1 text-xs text-teal-800">
            Acesso rápido às vistorias, câmera e GPS direto da tela inicial.
          </p>
          <button
            type="button"
            onClick={instalar}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-900 text-sm font-bold text-white"
          >
            <Download className="h-4 w-4" />
            Instalar agora
          </button>
        </>
      ) : (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-teal-800">
          No iPhone: toque em <Share className="h-3.5 w-3.5" /> Compartilhar e depois em
          <strong>&nbsp;Adicionar à Tela de Início</strong>.
        </p>
      )}
    </div>
  );
}
