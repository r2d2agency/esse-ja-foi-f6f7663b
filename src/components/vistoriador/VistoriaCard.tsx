import { Link } from "@tanstack/react-router";
import { CalendarDays, Car, ChevronRight, Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const rotulos: Record<string, string> = {
  AGUARDANDO_CONFIRMACAO: "Aguardando confirmação",
  CONFIRMADA: "Confirmada",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
  REAGENDAMENTO_SOLICITADO: "Reagendamento solicitado",
  NAO_COMPARECEU_VENDEDOR: "Vendedor ausente",
  NAO_COMPARECEU_VISTORIADOR: "Vistoriador ausente",
};

export function formatarDataVistoria(data: string) {
  const [ano, mes, dia] = String(data).slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
    .format(new Date(ano, (mes || 1) - 1, dia || 1));
}

export function VistoriaCard({ vistoria, destaque = false }: { vistoria: any; destaque?: boolean }) {
  const endereco = [vistoria.unidade_endereco, vistoria.unidade_cidade, vistoria.unidade_estado].filter(Boolean).join(" · ");
  return (
    <article className={`border bg-card p-4 shadow-sm ${destaque ? "border-amber-300" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-primary text-primary-foreground">
            <Car className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-bold text-foreground">{vistoria.marca} {vistoria.modelo}</h3>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{vistoria.placa} {vistoria.ano ? `· ${vistoria.ano}` : ""}</p>
          </div>
        </div>
        <Badge variant="outline" className="max-w-36 whitespace-normal text-right text-[10px] leading-tight">
          {rotulos[vistoria.status] || vistoria.status}
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 border-t pt-3 text-sm text-muted-foreground sm:grid-cols-2">
        <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> {formatarDataVistoria(vistoria.data_vistoria)}</p>
        <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> {String(vistoria.horario_vistoria).slice(0, 5)}</p>
        <p className="flex items-start gap-2 sm:col-span-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span><strong className="text-foreground">{vistoria.unidade_nome}</strong>{endereco ? ` — ${endereco}` : ""}</span></p>
      </div>
      <Button asChild variant="outline" className="mt-4 h-11 w-full justify-between">
        <Link to="/vistoriador/vistoria/$id" params={{ id: vistoria.id }}>
          Ver vistoria <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>
    </article>
  );
}