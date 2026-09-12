import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listarChangelogFn,
  listarChangelogParaExportarFn,
  criarItemChangelogFn,
  atualizarItemChangelogFn,
  removerItemChangelogFn,
} from "@/lib/changelog.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Plus, Download, Pencil, Trash2, GitCommitHorizontal, Loader2 } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/changelog")({
  component: ChangelogAdminPage,
});

const TIPO_CONFIG: Record<string, { label: string; className: string }> = {
  NOVIDADE: { label: "Novidade", className: "bg-teal-100 text-teal-700 hover:bg-teal-100" },
  MELHORIA: { label: "Melhoria", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  CORRECAO: { label: "Correção", className: "bg-amber-100 text-amber-700 hover:bg-amber-100" },
  OUTRO: { label: "Outro", className: "bg-slate-100 text-slate-600 hover:bg-slate-100" },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PUBLICADO: { label: "Publicado", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  PLANEJADO: { label: "Planejado", className: "bg-slate-100 text-slate-600 hover:bg-slate-100" },
  EM_ANDAMENTO: { label: "Em andamento", className: "bg-purple-100 text-purple-700 hover:bg-purple-100" },
};

const FORM_VAZIO = { id: "", titulo: "", descricao: "", tipo: "MELHORIA", status: "PUBLICADO" };

function ChangelogAdminPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<string>("TODOS");
  const [status, setStatus] = useState<string>("TODOS");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [page, setPage] = useState(0);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const limit = 30;

  const filtros = {
    busca: busca || undefined,
    tipo: tipo !== "TODOS" ? (tipo as any) : undefined,
    status: status !== "TODOS" ? (status as any) : undefined,
    dataInicio: dataInicio ? new Date(dataInicio).toISOString() : undefined,
    dataFim: dataFim ? new Date(`${dataFim}T23:59:59`).toISOString() : undefined,
  };

  const { data: res, isLoading } = useQuery({
    queryKey: ["admin-changelog", filtros, page],
    queryFn: () => listarChangelogFn({ data: { ...filtros, limit, offset: page * limit } }),
  });

  const itens = (res as any)?.itens || [];
  const total = (res as any)?.total || 0;
  const stats = (res as any)?.stats || {};

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["admin-changelog"] });
  }

  function abrirNovo() {
    setForm(FORM_VAZIO);
    setDialogAberto(true);
  }

  function abrirEdicao(item: any) {
    setForm({
      id: item.id,
      titulo: item.titulo,
      descricao: item.descricao || "",
      tipo: item.tipo,
      status: item.status,
    });
    setDialogAberto(true);
  }

  async function salvar() {
    if (!form.titulo.trim()) {
      toast.error("Informe um título.");
      return;
    }
    setSalvando(true);
    try {
      const res: any = form.id
        ? await atualizarItemChangelogFn({
            data: { id: form.id, titulo: form.titulo, descricao: form.descricao, tipo: form.tipo as any, status: form.status as any },
          })
        : await criarItemChangelogFn({
            data: {
              titulo: form.titulo,
              descricao: form.descricao,
              tipo: form.tipo as any,
              status: form.status as any,
              autor: user?.nome,
            },
          });
      if (!res?.ok) {
        toast.error(res?.message || "Não foi possível salvar.");
        return;
      }
      toast.success(form.id ? "Item atualizado." : "Item adicionado ao changelog.");
      setDialogAberto(false);
      recarregar();
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    if (!window.confirm("Remover este item do changelog?")) return;
    const res: any = await removerItemChangelogFn({ data: { id } });
    if (!res?.ok) {
      toast.error(res?.message || "Não foi possível remover.");
      return;
    }
    toast.success("Item removido.");
    recarregar();
  }

  async function exportarPdf() {
    setExportando(true);
    try {
      const res: any = await listarChangelogParaExportarFn({ data: filtros });
      if (!res?.ok) {
        toast.error(res?.message || "Não foi possível exportar.");
        return;
      }
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margem = 40;
      let y = margem;
      const largura = doc.internal.pageSize.getWidth() - margem * 2;

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Changelog — Esse Já Foi", margem, y);
      y += 18;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} • ${res.data.length} item(ns)`, margem, y);
      y += 20;

      for (const item of res.data as any[]) {
        if (y > doc.internal.pageSize.getHeight() - 80) {
          doc.addPage();
          y = margem;
        }
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        const tituloLinhas = doc.splitTextToSize(item.titulo, largura);
        doc.text(tituloLinhas, margem, y);
        y += tituloLinhas.length * 13;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        const tipoLabel = TIPO_CONFIG[item.tipo]?.label || item.tipo;
        const statusLabel = STATUS_CONFIG[item.status]?.label || item.status;
        doc.text(
          `${formatDate(item.criado_em)} • ${tipoLabel} • ${statusLabel}${item.commit_hash ? ` • ${item.commit_hash}` : ""}`,
          margem,
          y,
        );
        y += 12;

        if (item.descricao) {
          const descLinhas = doc.splitTextToSize(item.descricao, largura);
          doc.text(descLinhas, margem, y);
          y += descLinhas.length * 12;
        }
        y += 10;
      }

      doc.save(`changelog-esse-ja-foi-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Changelog</h1>
          <p className="text-slate-500 font-medium">Tudo o que já foi feito, ajustado ou está planejado no sistema.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportarPdf} disabled={exportando} className="font-bold">
            {exportando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Baixar PDF
          </Button>
          <Button onClick={abrirNovo} className="bg-teal-600 hover:bg-teal-700 font-bold">
            <Plus className="mr-2 h-4 w-4" /> Novo item
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-slate-400">Publicados</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-black text-green-600">{stats.PUBLICADO || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-slate-400">Em andamento</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-black text-purple-600">{stats.EM_ANDAMENTO || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase text-slate-400">Planejados (backlog)</CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-black text-slate-500">{stats.PLANEJADO || 0}</div></CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por título ou descrição..."
            className="pl-10 h-11"
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPage(0); }}
          />
        </div>
        <Select value={tipo} onValueChange={(v) => { setTipo(v); setPage(0); }}>
          <SelectTrigger className="h-11 w-full md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os tipos</SelectItem>
            {Object.entries(TIPO_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
          <SelectTrigger className="h-11 w-full md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todos os status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="h-11 w-full md:w-40" value={dataInicio} onChange={(e) => { setDataInicio(e.target.value); setPage(0); }} />
        <Input type="date" className="h-11 w-full md:w-40" value={dataFim} onChange={(e) => { setDataFim(e.target.value); setPage(0); }} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm divide-y divide-slate-100">
        {isLoading ? (
          <div className="p-10 text-center text-slate-400 font-bold">Carregando...</div>
        ) : itens.length === 0 ? (
          <div className="p-10 text-center text-slate-400 font-bold">Nenhum item encontrado para os filtros selecionados.</div>
        ) : (
          itens.map((item: any) => (
            <div key={item.id} className="flex items-start justify-between gap-4 p-4 hover:bg-slate-50">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn("text-[10px] font-black uppercase", TIPO_CONFIG[item.tipo]?.className)}>
                    {TIPO_CONFIG[item.tipo]?.label || item.tipo}
                  </Badge>
                  <Badge className={cn("text-[10px] font-black uppercase", STATUS_CONFIG[item.status]?.className)}>
                    {STATUS_CONFIG[item.status]?.label || item.status}
                  </Badge>
                  <span className="text-xs font-medium text-slate-400">{formatDate(item.criado_em)}</span>
                  {item.commit_hash && (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-slate-300">
                      <GitCommitHorizontal className="h-3 w-3" /> {item.commit_hash}
                    </span>
                  )}
                </div>
                <p className="font-bold text-slate-900">{item.titulo}</p>
                {item.descricao && <p className="text-sm text-slate-500">{item.descricao}</p>}
                {item.autor && <p className="text-[10px] font-bold uppercase text-slate-400">Por {item.autor}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-teal-600" onClick={() => abrirEdicao(item)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => remover(item.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {total > limit && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-slate-500">Mostrando {itens.length} de {total} itens</div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Anterior</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}>Próxima</Button>
          </div>
        </div>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar item" : "Novo item do changelog"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Título curto (ex.: Corrige X, Adiciona Y)"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            />
            <Textarea
              placeholder="Descrição (opcional)"
              rows={3}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-400">
              Use "Planejado" ou "Em andamento" para itens de backlog — ainda não entregues aos usuários.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogAberto(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando} className="bg-teal-600 hover:bg-teal-700">
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
