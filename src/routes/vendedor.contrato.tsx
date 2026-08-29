import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { FileText, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { contratoDoVendedorFn } from "@/lib/contratos.functions";
import { LogoEsf } from "@/components/shared/LogoEsf";

export const Route = createFileRoute("/vendedor/contrato")({
  head: () => ({
    meta: [{ title: "Contrato — ESSE JÁ FOI" }],
  }),
  component: ContratoVendedorPage,
});

function ContratoVendedorPage() {
  const { user } = useAuth();
  const carregar = useServerFn(contratoDoVendedorFn);
  
  const { data: res, isLoading } = useQuery({
    queryKey: ["portal-contrato", user?.id],
    queryFn: () => carregar({ data: { vendedorId: user!.id } }),
    enabled: !!user?.id,
  });

  const contrato = (res as any)?.ok ? (res as any).data.contratoAtual : null;

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center text-slate-400">Carregando contrato...</div>;
  }

  if (!contrato) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-slate-300" />
        <h2 className="mt-4 text-xl font-bold text-slate-900">Nenhum contrato encontrado</h2>
        <p className="mt-2 text-slate-500">Seu contrato ainda não foi gerado pela nossa equipe.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Contrato de Intermediação</h1>
        <p className="text-slate-500">Visualize e acompanhe o status do seu contrato.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          <div className="prose prose-slate max-w-none">
            <div className="mb-8 flex items-center justify-between border-b pb-6">
              <LogoEsf height={24} to="" />
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Número do Contrato</div>
                <div className="font-mono text-sm font-bold">{contrato.numero}</div>
              </div>
            </div>
            
            <div className="whitespace-pre-wrap font-serif leading-relaxed text-slate-800">
              {contrato.conteudo || "Carregando conteúdo do contrato..."}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Status Atual</h3>
            <div className="mt-3 flex items-center gap-2">
              {contrato.status === "ASSINADO" ? (
                <CheckCircle2 className="h-5 w-5 text-teal-600" />
              ) : (
                <Clock className="h-5 w-5 text-amber-500" />
              )}
              <span className="font-bold text-slate-900">{contrato.status}</span>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Ações</h3>
            <p className="mt-2 text-xs text-slate-500">
              Caso ainda não tenha assinado, você receberá um link via e-mail ou WhatsApp para realizar a assinatura digital.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
