import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getLeiloesAdmin } from "@/lib/leilao.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Gavel, Eye } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/leiloes/")({
  component: AdminLeiloesPage,
});

function AdminLeiloesPage() {
  const { data: leiloes, isLoading, isError, error } = useQuery({
    queryKey: ["admin-leiloes"],
    queryFn: () => getLeiloesAdmin({ data: undefined }),
  });

  if (isLoading) return <div className="p-8">Carregando leilões...</div>;
  if (isError)
    return (
      <div className="m-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="font-bold">Erro ao carregar os leilões.</p>
        <p className="text-sm break-words">{(error as any)?.message}</p>
      </div>
    );

  const stats = {
    ativos: leiloes?.filter((l: any) => l.status === 'ATIVO' || l.status === 'PRORROGADO').length || 0,
    agendados: leiloes?.filter((l: any) => l.status === 'AGENDADO').length || 0,
    encerrados: leiloes?.filter((l: any) => l.status === 'ENCERRADO').length || 0,
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">

      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Gestão de Leilões</h1>
          <p className="text-slate-500">Acompanhamento em tempo real das negociações competitivas.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase">Leilões Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-teal-600">{stats.ativos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase">Agendados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-blue-600">{stats.agendados}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase">Encerrados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-400">{stats.encerrados}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="todos" className="w-full">
        <TabsList className="bg-slate-100 p-1">
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="ativos">Ativos</TabsTrigger>
          <TabsTrigger value="agendados">Agendados</TabsTrigger>
          <TabsTrigger value="encerrados">Encerrados</TabsTrigger>
        </TabsList>

        <TabsContent value="todos" className="mt-6">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Veículo</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Encerramento</TableHead>
                  <TableHead>Lance Atual</TableHead>
                  <TableHead>Lances</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!leiloes || leiloes.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-slate-500">
                      Nenhum leilão criado ainda. Abra o veículo em Veículos → aba Publicação →
                      canal Leilão para definir início, encerramento e lance inicial.
                    </TableCell>
                  </TableRow>
                )}
                {leiloes?.map((leilao: any) => (
                  <TableRow key={leilao.id}>
                    <TableCell className="font-bold">{leilao.titulo}</TableCell>
                    <TableCell className="text-xs text-slate-500">{leilao.codigo_publico}</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(leilao.inicio_em), "dd/MM HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(leilao.fim_em), "dd/MM HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-mono font-bold text-teal-600">
                      R$ {Number(leilao.lance_atual || leilao.lance_inicial).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        <Gavel className="h-3 w-3" /> {leilao.qtd_lances || 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        leilao.status === 'ATIVO' ? 'bg-teal-100 text-teal-700' :
                        leilao.status === 'PRORROGADO' ? 'bg-amber-100 text-amber-700' :
                        leilao.status === 'AGENDADO' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-700'
                      }>
                        {leilao.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost" className="gap-2">
                        <Link to="/admin/leiloes/$id" params={{ id: leilao.id }}>
                          <Eye className="h-4 w-4" /> Acompanhar
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
