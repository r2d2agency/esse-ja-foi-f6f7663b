import { CheckCircle2 } from "lucide-react";

/**
 * Checklist visual dos opcionais/acessórios marcados no cadastro — usado na
 * vitrine, na sala de leilão, no link exclusivo (WhatsApp) e no admin, para
 * que os itens apareçam como checkmarks em vez de um texto corrido.
 */
export function AcessoriosVeiculo({
  itens,
  titulo = "Opcionais e acessórios",
  className = "",
}: {
  itens: string[];
  titulo?: string;
  className?: string;
}) {
  if (itens.length === 0) return null;

  return (
    <div className={className}>
      <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{titulo}</p>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 md:grid-cols-3">
        {itens.map((item) => (
          <div key={item} className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-700">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" />
            <span className="break-words">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
