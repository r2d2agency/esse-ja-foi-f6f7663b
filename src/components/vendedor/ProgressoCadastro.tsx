import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EtapaCadastro {
  id: string;
  label: string;
  concluida: boolean;
}

export function montarEtapas(profile: any): EtapaCadastro[] {
  // A lógica de progresso deve vir preferencialmente do backend via getOnboardingStatusFn
  // Mas mantemos este fallback sincronizado com a lógica de calcularProgressoVendedor
  const p = profile || {};
  const steps = p.etapas || {};

  if (steps.conta) {
    return [
      { id: "conta", label: "Conta criada", concluida: steps.conta === "CONCLUIDO" },
      { id: "dados", label: "Dados pessoais", concluida: steps.dados_pessoais === "CONCLUIDO" },
      { id: "endereco", label: "Endereço e Comprovante", concluida: steps.endereco === "CONCLUIDO" },
      { id: "documentos", label: "Documentos (CNH, CRLV)", concluida: steps.documentos === "CONCLUIDO" },
      { id: "validacao", label: "Selfie de validação", concluida: steps.validacao === "CONCLUIDO" },
    ];
  }

  return [
    { id: "conta", label: "Conta criada", concluida: true },
    { id: "dados", label: "Dados pessoais", concluida: Boolean(p.cpf && p.nome && p.data_nascimento) },
    { 
      id: "endereco", 
      label: "Endereço e Comprovante", 
      concluida: Boolean(p.cep && p.cidade)
    },
    {
      id: "documentos",
      label: "Documentos (CNH, CRLV)",
      concluida: Boolean(
        (p.documento_cnh_url || p.cnh_url) &&
          (p.documento_cnh_verso_url || p.cnh_verso_url) &&
          (p.documento_crlv_url || p.crlv_url)
      ),
    },
    { id: "validacao", label: "Selfie de validação", concluida: Boolean(p.documento_selfie_url || p.selfie_url) },
  ];
}

export function percentual(etapas: EtapaCadastro[]) {
  return Math.round((etapas.filter((e) => e.concluida).length / etapas.length) * 100);
}

export function ProgressoCadastro({
  etapas,
  compacto = false,
}: {
  etapas: EtapaCadastro[];
  compacto?: boolean;
}) {
  const pct = percentual(etapas);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-slate-700">Seu cadastro</span>
        <span className="text-sm font-bold text-teal-700">{pct}% concluído</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-teal-600 transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {!compacto && (
        <ul className="mt-3 space-y-1.5">
          {etapas.map((e) => (
            <li key={e.id} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition-colors",
                  e.concluida
                    ? "border-teal-600 bg-teal-600 text-white"
                    : "border-slate-200 bg-white text-slate-300"
                )}
              >
                {e.concluida ? <Check className="h-3 w-3" /> : "○"}
              </span>
              <span className={cn("text-sm", e.concluida ? "text-slate-800" : "text-slate-500")}>
                {e.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
