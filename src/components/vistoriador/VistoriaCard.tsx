import { Link } from "@tanstack/react-router";
import { CalendarDays, Car, ChevronRight, Clock, MapPin, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const rotulosStatusVistoria: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: "Aguardando confirmação",
  CONFIRMADA: "Confirmada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
  REAGENDAMENTO_SOLICITADO: "Reagendamento solicitado",
  NAO_COMPARECEU_VENDEDOR: "Vendedor ausente",
  NAO_COMPARECEU_VISTORIADOR: "Vistoriador ausente",
};

const estiloStatus: Record<string, string> = {
  CONFIRMADA: "bg-emerald-100 text-emerald-800",
  EM_ANDAMENTO: "bg-blue-100 text-blue-800",
  CONCLUIDA: "bg-emerald-600 text-white",
  CANCELADA: "bg-muted text-muted-foreground",
  AGUARDANDO_CONFIRMACAO: "bg-amber-100 text-amber-900",
  REAGENDAMENTO_SOLICITADO: "bg-amber-100 text-amber-900",
  NAO_COMPARECEU_VENDEDOR: "bg-rose-100 text-rose-800",
  NAO_COMPARECEU_VISTORIADOR: "bg-rose-100 text-rose-800",
};

export function formatarDataVistoria(data: string) {
  const [ano, mes, dia] = String(data).slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
    .format(new Date(ano, (mes || 1) - 1, dia || 1));
}

export function VistoriaCard({ vistoria, destaque = false }: { vistoria: any; destaque?: boolean }) {
  const endereco = [vistoria.unidade_endereco, vistoria.unidade_cidade, vistoria.unidade_estado].filter(Boolean).join(" · ");
  const emAndamento = vistoria.status === "EM_ANDAMENTO";
  const concluida = vistoria.status === "CONCLUIDA";

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md ${
        destaque ? "border-accent ring-2 ring-accent/30" : "border-border"
      }`}
    >
      {destaque && !concluida && (
        <div className="flex items-center gap-1.5 bg-accent px-4 py-1.5 text-[11px] font-black uppercase tracking-wider text-accent-foreground">
          <Zap className="h-3.5 w-3.5" /> Próximo atendimento
        </div>
      )}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Car className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-foreground">
                {vistoria.marca} {vistoria.modelo}
              </h3>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {vistoria.placa} {vistoria.ano ? `· ${vistoria.ano}` : ""}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
              estiloStatus[vistoria.status] || "bg-muted text-muted-foreground"
            }`}
          >
            {rotulosStatusVistoria[vistoria.status] || vistoria.status}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
            <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-semibold capitalize">{formatarDataVistoria(vistoria.data_vistoria)}</span>
          </p>
          <p className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
            <Clock className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-semibold">{String(vistoria.horario_vistoria).slice(0, 5)}</span>
          </p>
          <p className="col-span-2 flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-xs leading-relaxed">
              <strong className="text-foreground">{vistoria.unidade_nome}</strong>
              {endereco ? ` — ${endereco}` : ""}
            </span>
          </p>
        </div>

        <Button
          asChild
          variant={emAndamento ? "default" : "outline"}
          className={`mt-4 h-12 w-full justify-between rounded-xl font-bold ${
            emAndamento ? "" : concluida ? "" : "border-primary/30"
          }`}
        >
          <Link to="/vistoriador/vistoria/$id" params={{ id: vistoria.id }}>
            {emAndamento ? "Continuar vistoria" : concluida ? "Ver laudo" : "Ver vistoria"}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}
