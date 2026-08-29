import { useEffect, useMemo, useState } from "react";
import { Trophy, PartyPopper, ChevronRight, X } from "lucide-react";

type Props = {
  titulo: string;
  mensagem?: string | null;
  onVer: () => void;
  onFechar: () => void;
};

/** Banner animado de vitória em leilão, com confetes em CSS puro. */
export function CelebracaoVitoria({ titulo, mensagem, onVer, onFechar }: Props) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisivel(true), 30);
    return () => clearTimeout(t);
  }, []);

  const confetes = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 10) * 0.22,
        dur: 2.6 + ((i % 5) * 0.4),
        cor: ["#fbbf24", "#14b8a6", "#ffffff", "#f472b6", "#38bdf8"][i % 5],
        tam: 6 + (i % 4) * 2,
      })),
    [],
  );

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-amber-600 to-teal-700 p-6 text-white shadow-xl transition-all duration-500 ${
        visivel ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
      }`}
    >
      <style>{`@keyframes ejf-confete{0%{transform:translateY(-20px) rotate(0);opacity:1}100%{transform:translateY(260px) rotate(540deg);opacity:0}}
      @keyframes ejf-pulso{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}`}</style>

      <div className="pointer-events-none absolute inset-0">
        {confetes.map((c, i) => (
          <span
            key={i}
            style={{
              left: `${c.left}%`,
              width: c.tam,
              height: c.tam,
              background: c.cor,
              animation: `ejf-confete ${c.dur}s linear ${c.delay}s infinite`,
            }}
            className="absolute top-0 rounded-[2px]"
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar aviso de vitória"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/15 p-1.5 text-white/80 hover:bg-white/25"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="relative z-10 flex items-start gap-4">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20"
          style={{ animation: "ejf-pulso 1.6s ease-in-out infinite" }}
        >
          <Trophy className="h-7 w-7" />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/80">
            <PartyPopper className="h-3.5 w-3.5" /> Parabéns
          </p>
          <h2 className="mt-1 text-xl font-black uppercase leading-tight">{titulo}</h2>
          {mensagem && <p className="mt-2 text-sm font-medium text-white/90">{mensagem}</p>}
          <button
            type="button"
            onClick={onVer}
            className="mt-4 inline-flex h-11 items-center gap-1 rounded-xl bg-white px-5 text-sm font-black uppercase text-slate-900 transition-transform hover:scale-[1.02]"
          >
            Ver negociação <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
