import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPropostaVeiculoVendedorFn, responderPropostaVendedorFn } from "@/lib/analise-pos-vistoria.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/vendedor/veiculo/$id/proposta")({
  component: PropostaVendedorPage,
});

function PropostaVendedorPage() {
  const { id } = Route.useParams() as { id: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const getProposta = useServerFn(getPropostaVeiculoVendedorFn);
  const responder = useServerFn(responderPropostaVendedorFn);
  const [respondendo, setRespondendo] = useState(false);

  const { data: res, isLoading } = useQuery({
    queryKey: ["vendedor-proposta", id, user?.id],
    queryFn: () => getProposta({ data: { veiculoId: id, perfilId: user?.id || "" } }),
    enabled: !!user?.id,
  });

  if (isLoading) return <div className="p-8">Carregando proposta...</div>;
  const veiculo = res?.veiculo as any;
  const proposta = res?.proposta as any;
  const statusProposta = String(proposta?.status || "").trim().toUpperCase();
  const respondida = ["ACEITA", "RECUSADA", "EXPIRADA", "CANCELADA"].includes(statusProposta);

  if (!proposta) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-slate-600">Não encontramos nenhuma proposta para este veículo.</p>
        {res && !res.ok ? <p className="text-xs text-red-500">{(res as any).message}</p> : null}
        <Button asChild className="mt-2">
          <Link to="/vendedor/veiculo/$id" params={{ id }}>Voltar</Link>
        </Button>
      </div>
    );
  }

  const handleAceite = async (aceite: boolean) => {
    if (!user?.id) {
      toast.error("Sua sessão não foi identificada. Entre novamente para responder.");
      return;
    }

    setRespondendo(true);
    const tId = toast.loading(aceite ? "Aceitando proposta..." : "Recusando proposta...");
    try {
      const resResp = await responder({
        data: {
          veiculo_id: id,
          proposta_id: proposta.id,
          perfil_id: user.id,
          aceite,
        },
      });
      if (resResp.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["vendedor-proposta", id] }),
          queryClient.invalidateQueries({ queryKey: ["propostas-pendentes-vendedor", user.id] }),
          queryClient.invalidateQueries({ queryKey: ["meus-veiculos", user.id] }),
        ]);
        toast.success(aceite ? "Proposta aceita! Veículo liberado para preparação do leilão." : "Proposta recusada.", { id: tId });
        navigate({ to: "/vendedor/veiculo/$id", params: { id } });
      } else {
        toast.error((resResp as any).message || "Erro", { id: tId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível responder à proposta.", { id: tId });
    } finally {
      setRespondendo(false);
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto space-y-8">
       <Link to="/vendedor/veiculo/$id" params={{ id }} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="text-center space-y-2">
        <h1 className="text-2xl font-black text-slate-900">Seu veículo está pronto para a próxima etapa</h1>
        <p className="text-sm text-slate-500">{veiculo?.marca} {veiculo?.modelo} ({veiculo?.placa})</p>
      </div>

      <Card className="border-teal-100 bg-teal-50/30 overflow-hidden">
        <CardContent className="p-8 space-y-6">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">Valor inicial base</p>
            <p className="text-4xl font-black text-slate-900 text-center">R$ {Number(proposta.valor_minimo_acordado).toLocaleString()}</p>
          </div>

          <div className="space-y-4 border-t border-teal-100 pt-6">
             <h3 className="text-sm font-bold text-slate-900">O que acontece agora?</h3>
             <p className="text-xs text-slate-600 leading-relaxed">
               Ao aceitar, seu veículo será liberado para o leilão. Os compradores verificados poderão fazer lances a partir deste valor inicial.
               Você não precisa aceitar nenhuma oferta abaixo do valor que você autorizou.
             </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {respondida ? (
          <p className="text-xs font-semibold text-slate-500 text-center">
            Esta proposta já foi {proposta.status === "ACEITA" ? "aceita" : "respondida"}.
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          <Button disabled={respondida || respondendo || !user?.id} onClick={() => handleAceite(true)} className="h-14 bg-teal-600 hover:bg-teal-700 text-white font-bold text-base rounded-2xl">
             Aceitar e liberar para leilão
          </Button>
          <Button disabled={respondida || respondendo || !user?.id} onClick={() => handleAceite(false)} variant="ghost" className="text-slate-400 hover:text-red-600 font-bold">
             Não concordo com o valor
          </Button>
        </div>
      </div>
    </div>
  );
}
