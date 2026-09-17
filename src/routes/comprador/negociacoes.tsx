import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CardsEntregaComprador } from "@/components/entrega/cards-entrega";
import { getNegociacoesCompradorFn } from "@/lib/negociacoes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Car, ArrowRight, Search } from "lucide-react";
import { PrazoPagamento, STATUS_LABEL, STATUS_CLASSE, brl } from "@/components/negociacao/prazo-pagamento";

export const Route = createFileRoute("/comprador/negociacoes")({
  head: () => ({
    meta: [
      { title: "Minhas negociações | Esse Já Foi" },
      { name: "description", content: "Acompanhe as oportunidades que você venceu, o prazo de pagamento e o histórico das suas participações." },
    ],
  }),
  component: CompradorNegociacoesPage,
});

function CompradorNegociacoesPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["comprador-negociacoes", user?.id],
    queryFn: async () => (await getNegociacoesCompradorFn({ data: user!.id })) as any,
    enabled: !!user?.id,
    refetchInterval: 60000,
  });

  if (isLoading) return <div className="p-8 text-slate-500">Carregando negociações...</div>;

  const ativas: any[] = data?.em_andamento || [];
  const encerradas: any[] = data?.encerradas || [];
  const agora = data?.servidor_agora;
  const vencedora = ativas.find((n) => n.status === "AGUARDANDO_PAGAMENTO");

  if (ativas.length === 0 && encerradas.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Car className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Você ainda não participou de nenhuma oportunidade.</h1>
        <Link to="/veiculos">
          <Button className="mt-6 h-12 bg-teal-600 font-bold hover:bg-teal-700">
            <Search className="mr-2 h-4 w-4" /> Ver veículos disponíveis
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Negociações</h1>
        <p className="text-slate-500">Suas oportunidades vencidas e participações encerradas.</p>
      </div>

      <CardsEntregaComprador compradorId={user?.id} />

      {vencedora && (
        <Card className="overflow-hidden border-teal-200 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]">
            <div className="h-48 bg-slate-100 md:h-full">
              {vencedora.foto_capa ? (
                <img src={vencedora.foto_capa} alt={vencedora.titulo} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-slate-300"><Car className="h-10 w-10" /></div>
              )}
            </div>
            <CardContent className="space-y-5 p-6 md:p-8">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">Resultado do lance</p>
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900">Você venceu esta oportunidade!</h2>
                <p className="mt-1 text-sm font-bold text-slate-600">{vencedora.titulo}</p>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Lance vencedor</p>
                <p className="text-3xl font-black text-slate-900">{brl(vencedora.valor_venda)}</p>
                <Badge className={`mt-2 ${STATUS_CLASSE[vencedora.status]}`}>{STATUS_LABEL[vencedora.status]}</Badge>
              </div>

              <p className="text-sm font-medium text-slate-600">
                Seu lance foi o maior ao final da negociação. Agora precisamos concluir a etapa de pagamento.
              </p>

              <PrazoPagamento prazo={vencedora.prazo_pagamento_em} servidorAgora={agora} />

              <Button asChild className="h-12 w-full bg-teal-600 font-black uppercase tracking-tight hover:bg-teal-700 md:w-auto md:px-10">
                <Link to="/comprador/pagamento/$id" params={{ id: vencedora.id }}>
                  Ir para pagamento <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </div>
        </Card>
      )}

      <Tabs defaultValue="andamento">
        <TabsList className="bg-slate-100 p-1">
          <TabsTrigger value="andamento">Em andamento</TabsTrigger>
          <TabsTrigger value="encerradas">Participações encerradas</TabsTrigger>
        </TabsList>

        <TabsContent value="andamento" className="mt-6 space-y-4">
          {ativas.length === 0 && <p className="py-8 text-center text-sm italic text-slate-400">Nenhuma negociação em andamento.</p>}
          {ativas.map((n) => (
            <Card key={n.id} className="border-slate-200 shadow-none">
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-black uppercase tracking-tight text-slate-900">{n.titulo}</p>
                  <p className="text-xs font-bold uppercase tracking-widest text-teal-600">Você venceu • {n.codigo}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-slate-900">{brl(n.valor_venda)}</p>
                  <Badge className={STATUS_CLASSE[n.status]}>{STATUS_LABEL[n.status]}</Badge>
                </div>
                <Button className="bg-slate-900 font-bold hover:bg-slate-800">Continuar</Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="encerradas" className="mt-6 space-y-4">
          {encerradas.length === 0 && <p className="py-8 text-center text-sm italic text-slate-400">Nenhuma participação encerrada.</p>}
          {encerradas.map((e, i) => (
            <Card key={i} className="border-slate-200 shadow-none">
              <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold text-slate-800">{e.titulo}</p>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Lance encerrado</p>
                  <p className="mt-1 text-sm text-slate-500">Outro comprador apresentou a maior oferta desta vez.</p>
                </div>
                <Link to="/veiculos">
                  <Button variant="outline" className="font-bold">Ver outras oportunidades</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
