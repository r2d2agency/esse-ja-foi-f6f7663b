import { useRef, useState } from "react";
import { Camera, Check, Trash2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { compressImage, extensaoPorMime } from "@/components/vistoria/ImageCompressor";
import { toast } from "sonner";

interface FotoSlotProps {
  label: string;
  dica?: string | undefined;
  value?: string | null;
  onChange: (url: string | null) => void;
  /** Observação opcional sobre a foto (ex.: "risco na lataria"). */
  observacao?: string;
  onObservacaoChange?: (valor: string) => void;
  /** Quando informado, mostra um botão para remover o slot inteiro (usado nas fotos extras). */
  onRemoverSlot?: () => void;
}

export function FotoSlot({ label, dica, value, onChange, observacao, onObservacaoChange, onRemoverSlot }: FotoSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [carregando, setCarregando] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setCarregando(true);
    
    try {
      const comprimida = await compressImage(file, 1280, 0.72, 0.78);
      const extensao = extensaoPorMime(comprimida.type || "image/jpeg");
      const nomeArquivo = `${label.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.${extensao}`;
      const formData = new FormData();
      formData.append("file", comprimida, nomeArquivo);

      const response = await fetch("/api/public/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Erro no upload");
      
      const data = await response.json();
      onChange(data.url);
    } catch (error) {
      console.error("Erro ao subir foto:", error);
      toast.error("Não foi possível enviar essa foto. Tente novamente.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setCarregando(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed transition-colors",
          value ? "border-teal-300 bg-teal-50/40" : "border-slate-200 bg-slate-50 hover:border-teal-300",
          carregando && "animate-pulse",
        )}
      >
        {value ? (
          <>
            <img src={value} alt={label} className="h-full w-full object-cover" />
            <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
              <Check className="h-3 w-3" /> Enviada
            </span>
          </>
        ) : (
          <>
            <Camera className="h-6 w-6 text-slate-300" />
            <span className="px-2 text-[11px] font-semibold text-slate-500">Tirar ou enviar foto</span>
          </>
        )}
      </button>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-900">{label}</p>
          {dica && <p className="text-[11px] leading-snug text-slate-400">{dica}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {value && (
            <>
              <button
                type="button"
                aria-label="Trocar foto"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Excluir foto"
                onClick={() => onChange(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {onRemoverSlot && (
            <button
              type="button"
              aria-label="Remover esta foto adicional"
              onClick={onRemoverSlot}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {value && onObservacaoChange && (
        <input
          type="text"
          value={observacao || ""}
          onChange={(e) => onObservacaoChange(e.target.value)}
          placeholder="Observação (opcional). Ex.: risco na lataria"
          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
        />
      )}
    </div>
  );
}
