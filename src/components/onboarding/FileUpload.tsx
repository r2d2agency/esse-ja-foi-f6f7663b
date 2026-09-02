import { useState, useRef } from "react";
import { Upload, Camera, FileText, CheckCircle2, Eye, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { compressImage, extensaoPorMime } from "@/components/vistoria/ImageCompressor";

export type UploadStatus = "vazio" | "enviado" | "analise" | "aprovado" | "reenviar" | "recusado";

interface FileUploadProps {
  label: string;
  description?: string;
  value?: string | null;
  status?: UploadStatus;
  onChange: (url: string | null) => void;
  onCameraClick?: () => void;
  className?: string;
  disabled?: boolean;
}

const STATUS_CONFIG: Record<UploadStatus, { label: string; className: string; icon: any }> = {
  vazio: { label: "Toque para enviar", className: "border-slate-200 bg-slate-50 text-slate-400 hover:border-teal-300", icon: Upload },
  enviado: { label: "Enviado", className: "border-teal-200 bg-teal-50 text-teal-600", icon: CheckCircle2 },
  analise: { label: "Em análise", className: "border-sky-200 bg-sky-50 text-sky-600", icon: RefreshCw },
  aprovado: { label: "Aprovado", className: "border-emerald-200 bg-emerald-50 text-emerald-600", icon: CheckCircle2 },
  reenviar: { label: "Reenviar", className: "border-amber-200 bg-amber-50 text-amber-600", icon: RefreshCw },
  recusado: { label: "Recusado", className: "border-rose-200 bg-rose-50 text-rose-600", icon: X },
};

export function FileUpload({ label, description, value, status = "vazio", onChange, onCameraClick, className, disabled }: FileUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveStatus = value ? (status === "vazio" ? "enviado" : status) : "vazio";
  const config = STATUS_CONFIG[effectiveStatus];
  const Icon = config.icon;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      let arquivoParaEnviar: File | Blob = file;
      let nomeArquivo = file.name;

      // Fotos tiradas direto da câmera do celular costumam vir em altíssima resolução
      // (vários MB) e sem compressão isso estoura o limite de payload do upload,
      // fazendo o envio falhar silenciosamente. PDFs seguem sem alteração.
      if (file.type.startsWith("image/")) {
        const comprimida = await compressImage(file);
        const extensao = extensaoPorMime(comprimida.type || "image/jpeg");
        nomeArquivo = `${nomeArquivo.replace(/\.[^.]+$/, "")}.${extensao}`;
        arquivoParaEnviar = comprimida;
      }

      const formData = new FormData();
      formData.append("file", arquivoParaEnviar, nomeArquivo);

      const response = await fetch("/api/public/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Erro no upload");

      const data = await response.json();
      onChange(data.url);
    } catch (error) {
      console.error("Erro ao subir arquivo:", error);
      toast.error("Não foi possível enviar esse arquivo. Tente novamente.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-slate-900">{label}</label>
        {value && (
          <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", config.className)}>
            {config.label}
          </div>
        )}
      </div>
      
      {description && <p className="text-xs text-slate-500">{description}</p>}

      <div 
        className={cn(
          "relative min-h-[140px] flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-all p-4 text-center",
          config.className,
          isUploading && "animate-pulse cursor-wait",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {value ? (
          <div className="w-full flex flex-col items-center gap-4">
             <div className="relative group overflow-hidden rounded-xl border border-slate-200 aspect-video w-48 bg-white flex items-center justify-center">
                <img src={value} alt={label} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                   <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => window.open(value, '_blank')}>
                      <Eye className="h-4 w-4" />
                   </Button>
                </div>
             </div>
             
             {!disabled && (
              <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 rounded-lg text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <RefreshCw className="mr-1.5 h-3 w-3" /> Trocar arquivo
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 rounded-lg text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    onClick={() => onChange(null)}
                  >
                    <Trash2 className="mr-1.5 h-3 w-3" /> Excluir
                  </Button>
              </div>
             )}
          </div>
        ) : (
          <>
            <div className={cn("w-12 h-12 rounded-full flex items-center justify-center bg-white shadow-sm border border-slate-100", effectiveStatus === "vazio" ? "text-slate-400" : "text-teal-600")}>
              {isUploading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Icon className="w-6 h-6" />}
            </div>
            
            <div className="space-y-1">
              <p className="font-bold text-slate-700 text-sm">
                {isUploading ? "Enviando..." : "Toque para enviar ou tirar uma foto"}
              </p>
              <p className="text-xs text-slate-400">JPG, PNG ou PDF (máx. 10MB)</p>
            </div>

            {!disabled && (
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-xl h-9 px-4 font-semibold border-slate-200"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <Upload className="mr-2 h-4 w-4" /> Arquivo
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-xl h-9 px-4 font-semibold border-slate-200"
                  onClick={onCameraClick ?? (() => fileInputRef.current?.click())}
                  disabled={isUploading}
                >
                  <Camera className="mr-2 h-4 w-4" /> Câmera
                </Button>
              </div>
            )}
          </>
        )}
        {!disabled && (
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*,application/pdf"
            capture="environment"
            onChange={handleFileChange}
          />
        )}
      </div>
    </div>
  );
}
