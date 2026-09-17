import { useQuery } from "@tanstack/react-query";
import { getNegociacoesVendedorFn } from "@/lib/negociacoes.functions";
import { brl } from "@/components/negociacao/prazo-pagamento";
import { Trophy } from "lucide-react";

const ETAPAS = ["Cadastro", "Análise", "Vistoria", "Condições", "Anúncio", "Ofertas", "Pagamento", "Entrega", "Conclusão"];

export function CardOfertaVencedora({ vendedorId }: { vendedorId: string }) {
  const { data } = useQuery({
    queryKey: ["vendedor-negociacoes", vendedorId],
    queryFn: async () => (await getNegociacoesVendedorFn({ data: vendedorId })) as any,
    enabled: !!vendedorId,
    refetchInterval: 60000,
  });

  const lista: any[] = Array.isArray(data) ? data : [];
  const n = lista.find((x) => x.status === "AGUARDANDO_PAGAMENTO" || x.status === "PAGAMENTO_EM_PROCESSAMENTO");
  if (!n) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-teal-200 bg-white">
      <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center">
        {n.foto_capa && <img src={n.foto_capa} alt={n.titulo} className="h-32 w-full rounded-xl object-cover md:w-48" />}
        <div className="flex-1 space-y-2">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-teal-700">
            <Trophy className="h-3.5 w-3.5" /> Seu veículo recebeu uma oferta vencedora
          </p>
          <h2 className="text-lg font-black text-slate-900">{n.titulo}</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Valor final da negociação</p>
          <p className="text-3xl font-black text-slate-900">{brl(n.valor_venda)}</p>
          <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
            Aguardando confirmação do pagamento
          </span>
          <p className="text-sm text-slate-500">
            O lance foi encerrado e estamos aguardando a conclusão do pagamento pelo comprador.
          </p>
        </div>
      </div>
      <ol className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
        {ETAPAS.map((e, i) => (
          <li key={e} className={`text-xs font-bold ${i < 6 ? "text-emerald-600" : i === 6 ? "text-teal-700" : "text-slate-300"}`}>
            {i < 6 ? "✓" : i === 6 ? "●" : "○"} {e}
          </li>
        ))}
      </ol>
    </section>
  );
}
