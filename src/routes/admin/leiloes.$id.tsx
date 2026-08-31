import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLeilaoInfo } from "@/lib/leilao.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Gavel, Clock, Users, ArrowLeft, TrendingUp, AlertCircle, History as HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { formatarTempoRestante } from "@/lib/tempo";


export const Route = createFileRoute("/admin/leiloes/$id")({
  component: AdminLeilaoAcompanhamentoPage,
});

function AdminLeilaoAcompanhamentoPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: leilao, isLoading, error } = useQuery({
    queryKey: ["admin-leilao-detalhe", id],
    queryFn: () => getLeilaoInfo({ data: id }),
    refetchInterval: 3000, // Polling a cada 3 segundos para o admin
  });

  if (isLoading) return <div className="p-8">Carregando detalhes do leilão...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Erro ao carregar o leilão: {(error as Error).message}</div>;
  if (!leilao) return <div className="p-8 text-center text-red-500">Leilão não encontrado.</div>;

  const lanceAtual = Number(leilao.ultimo_lance?.valor || leilao.lance_inicial);
  const fimEm = new Date(leilao.fim_em);

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/admin/leiloes" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">{leilao.titulo}</h1>
          <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">Leilão ID: {leilao.id.substring(0,8)}</p>
        </div>
        <Badge className={
          leilao.status === 'ATIVO' ? 'bg-teal-600' :
          leilao.status === 'PRORROGADO' ? 'bg-amber-600' :
          'bg-slate-600'
        }>
          {leilao.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-slate-950 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-400 uppercase">Lance Atual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-teal-400">
              R$ {lanceAtual.toLocaleString('pt-BR')}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">Tempo restante</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 flex items-center gap-2 tabular-nums">
              <Clock className="h-5 w-5 text-slate-400" />
              {formatarTempoRestante(leilao.fim_em)}
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
              Encerra {format(fimEm, "dd/MM 'às' HH:mm", { locale: ptBR })}
            </p>
          </CardContent>
        </Card>


        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">Participantes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-slate-400" />
              {leilao.total_participantes || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-slate-500 uppercase">Total Lances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <Gavel className="h-5 w-5 text-slate-400" />
              {leilao.total_lances || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
        <Card className="border-slate-200 shadow-none overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between py-4">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <HistoryIcon className="h-4 w-4 text-slate-400" /> Histórico Completo de Lances
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-bold">EXIBIÇÃO ADMIN</Badge>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead>Horário</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead>Lance</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(leilao.historico || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12 text-slate-400 font-bold italic">Nenhum lance registrado até o momento.</TableCell>
                </TableRow>
              ) : (
                leilao.historico.map((lance: any, idx: number) => (
                  <TableRow key={idx} className={idx === 0 ? "bg-teal-50/50" : ""}>
                    <TableCell className="text-xs font-mono">{format(new Date(lance.criado_em), "HH:mm:ss", { locale: ptBR })}</TableCell>
                    <TableCell>
                      <Link
                        to="/admin/comprador/$id"
                        params={{ id: lance.comprador_id }}
                        className="flex flex-col group"
                      >
                        <span className="text-sm font-bold text-slate-700 group-hover:text-teal-700 group-hover:underline">
                          {lance.comprador_nome || "Comprador"}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {lance.comprador_whatsapp || lance.comprador_email || "Contato não informado"}
                        </span>
                        <span className="text-[10px] text-teal-600 font-bold uppercase tracking-tight">Ver perfil do comprador</span>
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono font-bold text-teal-700">R$ {Number(lance.valor).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right">
                      {idx === 0 ? (
                        <Badge className="bg-teal-600 text-[10px] font-bold uppercase tracking-tighter">Líder Atual</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">Superado</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200 shadow-none bg-slate-50">
            <CardHeader>
              <CardTitle className="text-xs font-black uppercase text-slate-500">Controles do Leilão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs uppercase"
                disabled={encerrado || cancelado}
                onClick={() => setDialogEncerrar(true)}
              >
                <Gavel className="h-4 w-4 mr-2" /> Encerrar Leilão
              </Button>
              <Button
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 font-bold text-xs uppercase border-red-100"
                variant="outline"
                disabled={encerrado || cancelado}
                onClick={() => setDialogCancelar(true)}
              >
                Cancelar Leilão
              </Button>
              {(encerrado || cancelado) && (
                <p className="text-[11px] font-bold uppercase text-slate-400">
                  Leilão {leilao.status.toLowerCase()} — controles indisponíveis.
                </p>
              )}
              <div className="pt-4 mt-4 border-t border-slate-200">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                  <AlertCircle className="h-3.5 w-3.5" /> Prorrogação Ativa
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  Configurado para adicionar {leilao.prorrogacao_tempo_segundos / 60} min se houver lance nos últimos {leilao.prorrogacao_janela_segundos / 60} min.
                </p>
              </div>
            </CardContent>
          </Card>


          <Card className="border-slate-200 shadow-none">
            <CardHeader>
              <CardTitle className="text-xs font-black uppercase text-slate-500 tracking-wider">Métricas da Negociação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Valor Inicial:</span>
                <span className="font-bold text-slate-900">R$ {Number(leilao.lance_inicial).toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">Incremento Mín:</span>
                <span className="font-bold text-teal-600">R$ {Number(leilao.incremento_minimo).toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-100">
                <span className="text-slate-500 font-medium">Ágio Atual:</span>
                <span className="font-bold text-teal-600">
                  {leilao.lance_inicial > 0 ? (((lanceAtual / Number(leilao.lance_inicial)) - 1) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
