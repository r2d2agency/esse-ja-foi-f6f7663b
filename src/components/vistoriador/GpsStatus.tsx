import { useState } from "react";
import { CheckCircle2, Loader2, LocateFixed, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type EstadoGps = { estado: "ocioso" | "checando" | "ativo" | "erro"; precisao?: number; horario?: string; mensagem?: string };

export function GpsStatus() {
  const [gps, setGps] = useState<EstadoGps>({ estado: "ocioso" });

  function checar() {
    if (!("geolocation" in navigator)) {
      setGps({ estado: "erro", mensagem: "Este aparelho não oferece localização." });
      return;
    }
    setGps({ estado: "checando" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ estado: "ativo", precisao: Math.round(pos.coords.accuracy), horario: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) }),
      () => setGps({ estado: "erro", mensagem: "Ative a localização do aparelho e permita o acesso." }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  const ativo = gps.estado === "ativo";
  return (
    <section className={`border p-4 ${ativo ? "border-emerald-200 bg-emerald-50" : gps.estado === "erro" ? "border-destructive/30 bg-destructive/5" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          {ativo ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" /> : gps.estado === "erro" ? <XCircle className="h-5 w-5 shrink-0 text-destructive" /> : <LocateFixed className="h-5 w-5 shrink-0 text-amber-700" />}
          <div>
            <h2 className="font-bold text-foreground">GPS {ativo ? "ativo e verificado" : "precisa ser verificado"}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{ativo ? `Precisão de ${gps.precisao} m · checado às ${gps.horario}` : gps.mensagem || "Obrigatório para iniciar o check-in de uma vistoria."}</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={checar} disabled={gps.estado === "checando"} aria-label="Verificar GPS">
          {gps.estado === "checando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>
    </section>
  );
}