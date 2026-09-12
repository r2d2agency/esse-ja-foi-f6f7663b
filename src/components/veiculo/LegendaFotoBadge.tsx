import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Ícone "i" sobre uma foto do veículo que, ao ser clicado, mostra a legenda daquela foto para o comprador. */
export function LegendaFotoBadge({ legenda, className }: { legenda?: string | null; className?: string }) {
  if (!legenda) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Sobre esta foto"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/60 text-white backdrop-blur-sm transition-colors hover:bg-slate-950/80",
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-3 text-sm font-medium text-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        {legenda}
      </PopoverContent>
    </Popover>
  );
}
