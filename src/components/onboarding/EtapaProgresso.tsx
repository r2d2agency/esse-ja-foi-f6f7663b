import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface EtapaProps {
  currentStep: number;
  totalSteps: number;
  etapas: string[];
  titulo?: string;
  subtitulo?: string;
onStepClick?: (step: number) => void;
}

export function EtapaProgresso({
  currentStep,
  totalSteps,
  etapas,
  titulo = "Complete seu cadastro",
  subtitulo = "Precisamos dessas informações para validar sua identidade e dar segurança às negociações.",
  onStepClick,
}: EtapaProps) {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-white">{titulo}</h2>
          <span className="text-xs font-bold text-teal-200 uppercase tracking-wider">
            Etapa {currentStep} de {totalSteps}
          </span>
        </div>
        <p className="text-sm text-teal-100/80">{subtitulo}</p>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-teal-950/50">
        <div 
          className="h-full bg-teal-400 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(45,212,191,0.5)]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Indicadores de etapa (Mobile) */}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
        {etapas.map((label, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          const isClickable = typeof onStepClick === "function";

          return (
            <button
              key={`mobile-${label}`}
              type="button"
              onClick={() => onStepClick?.(stepNum)}
              disabled={!isClickable}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight transition-colors",
                isCurrent
                  ? "border-teal-300 bg-teal-400 text-teal-950"
                  : isCompleted
                    ? "border-teal-700 bg-teal-900 text-teal-200"
                    : "border-teal-900 bg-teal-950/40 text-teal-600",
                isClickable && "cursor-pointer"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Indicadores de etapa (Desktop) */}
      <div
        className="hidden lg:grid gap-2"
        style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}
      >
        {etapas.map((label, idx) => {
          const stepNum = idx + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          const isClickable = typeof onStepClick === "function";

          return (
            <button
              key={label}
              type="button"
              onClick={() => onStepClick?.(stepNum)}
              disabled={!isClickable}
              className={cn(
                "flex flex-col gap-1.5 text-left",
                isClickable && "cursor-pointer"
              )}
            >
              <div className={cn(
                "h-1 rounded-full transition-colors",
                isCompleted || isCurrent ? "bg-teal-400" : "bg-teal-900"
              )} />
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-tight transition-colors",
                isCurrent ? "text-white" : isCompleted ? "text-teal-400" : "text-teal-700",
                isClickable && "hover:text-white"
              )}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
