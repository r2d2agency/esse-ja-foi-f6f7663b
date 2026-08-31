import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Loader2,
  Upload,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Search,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSessionToken } from "@/lib/session";
import {
  listarLaudosExternosFn,
  salvarLaudoExternoFn,
  removerLaudoExternoFn,
} from "@/lib/laudos-externos.functions";
import {
  consultarLaudoVeiculoFn,
  listarConsultasVeiculoFn,
} from "@/lib/consulta-veicular.functions";

const TIPOS = [
  { id: "CAUTELAR", label: "Laudo cautelar" },
  { id: "VISTORIA_TRANSFERENCIA", label: "Vistoria de transferência" },
  { id: "PERICIA", label: "Perícia" },
  { id: "OUTRO", label: "Outro" },
];

function dataBr(valor?: string | null) {
  if (!valor) return "—";
  const d = new Date(valor);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

export function LaudosVeiculo({ veiculoId }: { veiculoId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [form, setForm] = useState({
    tipo: "CAUTELAR",
    fornecedor: "",
    numero_laudo: "",
    data_laudo: "",
    resultado: "",
    observacao: "",
    arquivo_url: "",
    arquivo_nome: "",
  });

  const { data: laudosRes, refetch } = useQuery({
    queryKey: ["laudos-externos", veiculoId],
    queryFn: () => listarLaudosExternosFn({ data: { veiculoId } }),
  });
  const { data: consultasRes, refetch: refetchConsultas } = useQuery({
    queryKey: ["consultas-veiculo", veiculoId],
    queryFn: () => listarConsultasVeiculoFn({ data: { veiculoId } }),
  });

  const laudos: any[] = (laudosRes as any)?.data ?? [];
  const consultas: any[] = (consultasRes as any)?.data ?? [];

  async function selecionarArquivo(file?: File) {
    if (!file) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/public/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!json?.url) return toast.error("Falha ao enviar o arquivo.");
      setForm((f) => ({ ...f, arquivo_url: json.url, arquivo_nome: file.name }));
      toast.success("Arquivo carregado. Complete os dados e salve.");
    } finally {
      setEnviando(false);
    }
  }

  async function salvar() {
    if (!form.arquivo_url) return toast.error("Envie o arquivo do laudo (PDF ou imagem).");
    setEnviando(true);
    try {
      const res: any = await salvarLaudoExternoFn({
        data: { token: getSessionToken(), veiculo_id: veiculoId, ...form },
      });
      if (!res?.ok) return toast.error(res?.message || "Erro ao salvar o laudo.");
      toast.success("Laudo vinculado ao veículo.");
      setForm({
        tipo: "CAUTELAR",
        fornecedor: "",
        numero_laudo: "",
        data_laudo: "",
        resultado: "",
        observacao: "",
        arquivo_url: "",
        arquivo_nome: "",
      });
      refetch();
    } finally {
      setEnviando(false);
    }
  }

  async function remover(id: string) {
    const res: any = await removerLaudoExternoFn({ data: { id } });
    if (!res?.ok) return toast.error(res?.message || "Erro ao remover.");
    toast.success("Laudo removido.");
    refetch();
  }

  async function consultar() {
    setConsultando(true);
    try {
      const res: any = await consultarLaudoVeiculoFn({
        data: { token: getSessionToken(), veiculoId },
      });
      if (!res?.ok) return toast.error(res?.message || "Não foi possível consultar.");
      toast.success("Consulta realizada e vinculada ao veículo.");
      refetchConsultas();
    } finally {
      setConsultando(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Consulta veicular
            </p>
            <p className="text-sm font-medium text-slate-500">
              Consulta automática pelo provedor configurado (Company Conferi).
            </p>
          </div>
          <Button
            onClick={consultar}
            disabled={consultando}
            className="bg-teal-600 font-bold hover:bg-teal-700"
          >
            {consultando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Consultar agora
          </Button>
        </div>

        {consultas.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm italic text-slate-400">
            Nenhuma consulta realizada para este veículo.
          </p>
        ) : (
          <div className="space-y-3">
            {consultas.map((c) => {
              const ok = c.situacao === "OK" || c.status === "SUCESSO";
              return (
                <div key={c.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {ok ? (
                        <ShieldCheck className="h-5 w-5 text-teal-600" />
                      ) : (
                        <ShieldAlert className="h-5 w-5 text-amber-600" />
                      )}
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {c.produto || "Consulta veicular"} • {c.status}
                        </p>
                        <p className="text-xs text-slate-500">{dataBr(c.criado_em)}</p>
                      </div>
                    </div>
                    {c.arquivo_url && (
                      <a
                        href={c.arquivo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-teal-700"
                      >
                        Abrir <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {c.resumo && (
                    <p className="mt-2 whitespace-pre-wrap text-xs font-medium text-slate-600">
                      {typeof c.resumo === "string" ? c.resumo : JSON.stringify(c.resumo, null, 2)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          Laudos enviados
        </p>

        {laudos.length === 0 ? (
          <p className="rounded-xl bg-slate-50 p-4 text-sm italic text-slate-400">
            Nenhum laudo anexado a este veículo.
          </p>
        ) : (
          <div className="space-y-2">
            {laudos.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-teal-700" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {TIPOS.find((t) => t.id === l.tipo)?.label || l.tipo}
                      {l.fornecedor ? ` • ${l.fornecedor}` : ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      {l.numero_laudo ? `Nº ${l.numero_laudo} • ` : ""}
                      {dataBr(l.data_laudo || l.criado_em)}
                      {l.resultado ? ` • ${l.resultado}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={l.arquivo_url} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm" className="font-bold">
                      Abrir
                    </Button>
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => remover(l.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          Anexar novo laudo
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => selecionarArquivo(e.target.files?.[0])}
        />
        <Button
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="font-bold"
        >
          {enviando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {form.arquivo_nome || "Selecionar arquivo (PDF ou imagem)"}
        </Button>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-600">Tipo</Label>
            <select
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            >
              {TIPOS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-600">Empresa / fornecedor</Label>
            <Input
              className="h-11"
              value={form.fornecedor}
              onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-600">Número do laudo</Label>
            <Input
              className="h-11"
              value={form.numero_laudo}
              onChange={(e) => setForm({ ...form, numero_laudo: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold text-slate-600">Data do laudo</Label>
            <Input
              type="date"
              className="h-11"
              value={form.data_laudo}
              onChange={(e) => setForm({ ...form, data_laudo: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs font-bold text-slate-600">Resultado</Label>
            <Input
              className="h-11"
              placeholder="Ex.: Nada consta / Apto"
              value={form.resultado}
              onChange={(e) => setForm({ ...form, resultado: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs font-bold text-slate-600">Observações</Label>
            <Textarea
              rows={3}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>
        </div>

        <Button
          onClick={salvar}
          disabled={enviando}
          className="h-12 w-full rounded-xl bg-teal-600 font-bold hover:bg-teal-700"
        >
          {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar laudo
        </Button>
      </section>
    </div>
  );
}
