import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Outlet } from "@tanstack/react-router";

import { DataTable } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Search, Terminal, AlertCircle, Info, Database, Trash2 } from "lucide-react";
import { getSystemLogsFn, limparLogsFn } from "@/lib/logs.functions";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/logs")({
  component: LogsAdminPage,
});

function LogsAdminPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [page, setPage] = useState(0);
  const limit = 50;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSystemLogsFn({ data: { limit, offset: page * limit, busca } });
      if (res.ok) {
        setLogs(res.data);
        setTotal(res.total);
      } else {
        toast.error(res.message || "Erro ao carregar logs.");
      }
    } catch (err) {
      console.error("[admin/logs] Erro:", err);
      toast.error("Falha na rede ao carregar logs.");
    } finally {
      setLoading(false);
    }
  }, [page, busca]);

  useEffect(() => {
    const timer = setTimeout(() => {
        void carregar();
    }, 300);
    return () => clearTimeout(timer);
  }, [carregar]);

  const getStatusIcon = (acao: string) => {
    if (acao.includes("ERRO") || acao.includes("FALHA")) return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (acao.includes("CRIADO") || acao.includes("ATUALIZADO")) return <Database className="h-4 w-4 text-blue-500" />;
    return <Info className="h-4 w-4 text-slate-400" />;
  };

  const limparLogs = async () => {
    if (!confirm("Tem certeza que deseja apagar todos os logs do sistema?")) return;
    try {
        const res = await limparLogsFn();
        if (res.ok) {
            toast.success("Logs limpos com sucesso.");
            void carregar();
        } else {
            toast.error(res.message);
        }
    } catch (e) {
        toast.error("Erro ao limpar logs.");
    }
  };

  return (
    <div className="space-y-6 p-6">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="h-6 w-6 text-teal-600" />
              Logs do Sistema
            </h1>
            <p className="text-sm text-slate-500">Rastreamento detalhado de eventos, erros e auditoria.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar em logs..."
                className="pl-9"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className={busca === "erro_cliente" ? "border-red-300 bg-red-50 text-red-700" : ""}
              onClick={() => {
                setBusca((b) => (b === "erro_cliente" ? "" : "erro_cliente"));
                setPage(0);
              }}
            >
              <AlertCircle className="mr-1.5 h-4 w-4" /> Erros de usuários
            </Button>
            <Button variant="outline" size="icon" onClick={() => void carregar()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="icon" onClick={limparLogs} className="text-red-600 hover:text-red-700 hover:bg-red-50" title="Limpar logs">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total de Registros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Página Atual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{page + 1} / {Math.ceil(total / limit) || 1}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Registros por Página</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{limit}</div>
            </CardContent>
          </Card>
        </div>

        <DataTable
          data={logs}
          emptyMessage={loading ? "Carregando logs..." : "Nenhum log encontrado para o critério de busca."}
          columns={[
            {
              header: "Data/Hora",
              accessor: (l: any) => (
                <span className="text-xs font-mono text-slate-600">
                  {formatDate(l.criado_em)}
                </span>
              )
            },
            {
              header: "Entidade",
              accessor: (l: any) => (
                <Badge variant="outline" className="text-[10px] uppercase font-bold">
                  {l.entidade}
                </Badge>
              )
            },
            {
              header: "Ação",
              accessor: (l: any) => (
                <div className="flex items-center gap-2">
                  {getStatusIcon(l.acao)}
                  <span className={`text-sm font-medium ${l.acao.includes("ERRO") ? "text-red-600" : "text-slate-700"}`}>
                    {l.acao}
                  </span>
                </div>
              )
            },
            {
              header: "Detalhes",
              accessor: (l: any) => {
                let texto = l.detalhe || "-";
                if (l.entidade === "ERRO_CLIENTE" && l.detalhe) {
                  try {
                    const d = JSON.parse(l.detalhe);
                    texto = `${d.mensagem}${d.url ? ` — ${d.url}` : ""}`;
                  } catch {
                    // detalhe não é JSON — mostra como veio
                  }
                }
                return (
                  <div className="max-w-md truncate text-xs text-slate-500" title={texto}>
                    {texto}
                  </div>
                );
              }
            },
            {
              header: "Usuário",
              accessor: (l: any) => (
                <span className="text-xs text-slate-600 truncate max-w-[120px]" title={l.usuario}>
                  {l.usuario || "Sistema"}
                </span>
              )
            }
          ]}
        />
        
        <div className="flex items-center justify-between px-2 py-4">
          <div className="text-sm text-slate-500">
            Mostrando {logs.length} de {total} registros
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
            >
              Anterior
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * limit >= total || loading}
            >
              Próxima
            </Button>
          </div>
        </div>
      </div>
  );
}

