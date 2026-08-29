import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

async function enviarArquivo(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/public/upload", { method: "POST", body: fd });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.url ?? null;
}

export function UploadFotos({
  fotos,
  onChange,
}: {
  fotos: string[];
  onChange: (fotos: string[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const zonaRef = useRef<HTMLDivElement>(null);

  const enviarLista = useCallback(
    async (lista: File[]) => {
      const imagens = lista.filter((f) => f.type.startsWith("image/"));
      if (imagens.length === 0) return;
      setEnviando(true);
      try {
        const urls: string[] = [];
        for (const file of imagens) {
          const url = await enviarArquivo(file);
          if (url) urls.push(url);
          else toast.error(`Falha ao enviar ${file.name}`);
        }
        if (urls.length > 0) {
          onChange([...fotos, ...urls]);
          toast.success(`${urls.length} foto(s) adicionada(s).`);
        }
      } finally {
        setEnviando(false);
      }
    },
    [fotos, onChange],
  );

  // Colar (Ctrl+V) imagens da área de transferência
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const itens = Array.from(e.clipboardData?.items || []);
      const arquivos = itens
        .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter(Boolean) as File[];
      if (arquivos.length > 0) {
        e.preventDefault();
        void enviarLista(arquivos);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enviarLista]);

  return (
    <div className="space-y-3">
      {fotos.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {fotos.map((url, i) => (
            <div key={`${url.slice(0, 24)}-${i}`} className="relative h-20 w-28 overflow-hidden rounded-xl bg-slate-100">
              <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(fotos.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 rounded-full bg-slate-950/70 p-1 text-white"
                aria-label="Remover foto"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        ref={zonaRef}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void enviarLista(Array.from(e.dataTransfer.files || []));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50 hover:border-teal-400",
        )}
      >
        {enviando ? (
          <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        ) : (
          <ImagePlus className="h-6 w-6 text-teal-600" />
        )}
        <p className="text-sm font-bold text-slate-700">
          {enviando ? "Enviando fotos..." : "Arraste e solte, cole (Ctrl+V) ou clique para enviar"}
        </p>
        <p className="text-xs font-medium text-slate-500">JPG, PNG ou WEBP — várias fotos de uma vez.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void enviarLista(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
