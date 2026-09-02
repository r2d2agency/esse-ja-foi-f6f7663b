import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, AlertCircle, ShieldCheck, FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FileUpload } from "@/components/onboarding/FileUpload";
import { cn } from "@/lib/utils";
import { getSessionToken } from "@/lib/session";
import {
  getPerfilCompradorFn,
  enviarDocumentoCompradorFn,
  enviarCadastroCompradorFn,
} from "@/lib/comprador.functions";
import { getTermoVigenteFn, aceitarTermoFn } from "@/lib/termos.functions";

export const Route = createFileRoute("/comprador/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos e compliance — ESSE JÁ FOI" },
      {
        name: "description",
        content: "Envie seus documentos para liberar valores e lances nos leilões da plataforma.",
      },
      { property: "og:title", content: "Documentos e compliance — ESSE JÁ FOI" },
      { property: "og:description", content: "Compliance do comprador na plataforma Esse Já Foi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompradorDocumentosPage,
});

const STATUS_UI: Record<string, { label: string; cls: string; Icon: any }> = {
  APROVADO: { label: "Aprovado", cls: "bg-teal-50 text-teal-700", Icon: CheckCircle2 },
  AGUARDANDO_ANALISE: { label: "Em análise", cls: "bg-blue-50 text-blue-700", Icon: Clock },
  PENDENCIA: { label: "Com pendência", cls: "bg-amber-50 text-amber-700", Icon: AlertCircle },
  REPROVADO: { label: "Reprovado", cls: "bg-red-50 text-red-700", Icon: AlertCircle },
  NAO_ENVIADO: { label: "Não enviado", cls: "bg-slate-100 text-slate-600", Icon: AlertCircle },
};

function CompradorDocumentosPage() {
  const qc = useQueryClient();
  const [assinatura, setAssinatura] = useState("");
  const [concorda, setConcorda] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["comprador-perfil"],
    queryFn: () => getPerfilCompradorFn({ data: { token: getSessionToken() } }),
  });
  const { data: termoRes } = useQuery({
    queryKey: ["termo-vigente", "COMPRADOR"],
    queryFn: () => getTermoVigenteFn({ data: { tipo: "COMPRADOR" } }),
  });

  const perfil: any = (data as any)?.perfil || {};
  const progresso: any = (data as any)?.progresso || { percentual: 0, pendencias: [] };
  const status = perfil.status_compliance || "NAO_ENVIADO";
  const ui = STATUS_UI[status] || STATUS_UI["NAO_ENVIADO"]!;
  const termo: any = (termoRes as any)?.data ?? null;
  const termoAceito = !!perfil.termo_aceito_em;

  useEffect(() => {
    if (perfil.nome && !assinatura) setAssinatura(perfil.nome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil.nome]);

  const upload = useMutation({
    mutationFn: (v: { tipo: string; url: string }) =>
      enviarDocumentoCompradorFn({ data: { token: getSessionToken(), ...v } }),
    onSuccess: () => {
      toast.success("Documento enviado.");
      qc.invalidateQueries({ queryKey: ["comprador-perfil"] });
    },
    onError: () => toast.error("Erro ao enviar documento."),
  });

  const aceitar = useMutation({
    mutationFn: () =>
      aceitarTermoFn({
        data: { token: getSessionToken(), assinatura: assinatura.trim(), tipo: "COMPRADOR" },
      }),
    onSuccess: (res: any) => {
      if (!res?.ok) {
        toast.error(res?.message || "Não foi possível registrar o aceite.");
        return;
      }
      toast.success("Termo aceito e registrado.");
      qc.invalidateQueries({ queryKey: ["comprador-perfil"] });
    },
  });

  function aceitarTermo() {
    if (!concorda) {
      toast.error("Marque a confirmação de leitura do termo.");
      return;
    }
    if (assinatura.trim().length < 3) {
      toast.error("Digite seu nome completo como assinatura.");
      return;
    }
    aceitar.mutate();
  }

  const enviar = useMutation({
    mutationFn: () => enviarCadastroCompradorFn({ data: { token: getSessionToken() } }),
    onSuccess: (res: any) => {
      if (res?.ok) toast.success("Cadastro enviado para análise!");
      else toast.error(res?.message || "Cadastro incompleto.");
      qc.invalidateQueries({ queryKey: ["comprador-perfil"] });
    },
  });

  const pj = perfil.tipo_pessoa === "PJ";
  const docs = pj
    ? [{ tipo: "CONTRATO_SOCIAL", campo: "documento_contrato_social_url", label: "Contrato social / Cartão CNPJ" }]
    : [
        { tipo: "CNH", campo: "documento_cnh_url", label: "Identidade (RG ou CNH)" },
        { tipo: "SELFIE", campo: "documento_selfie_url", label: "Selfie com documento" },
      ];
  docs.push({
    tipo: "COMPROVANTE",
    campo: "documento_comprovante_url",
    label: "Comprovante de residência",
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-950">
            Compliance e documentos
          </h1>
          <p className="font-medium text-slate-500">
            Mantenha sua documentação em dia para dar lances nos leilões.
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black uppercase",
            ui.cls,
          )}
        >
          <ui.Icon className="h-4 w-4" />
          {ui.label}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">
            Progresso do cadastro
          </span>
          <span className="text-2xl font-black text-teal-700">{progresso.percentual}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-teal-600 transition-all"
            style={{ width: `${progresso.percentual}%` }}
          />
        </div>
        {perfil.compliance_motivo_pendencia && (
          <p className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-800">
            {perfil.compliance_motivo_pendencia}
          </p>
        )}
        {progresso.pendencias?.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm font-medium text-slate-600">
            {progresso.pendencias.map((p: string) => (
              <li key={p}>• Falta: {p}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {docs.map((d) => (
          <FileUpload
            key={d.tipo}
            label={d.label}
            value={perfil[d.campo] || ""}
            onChange={(url: string | null) => upload.mutate({ tipo: d.tipo, url: url || "" })}
          />
        ))}
      </div>

      {status !== "APROVADO" && status !== "AGUARDANDO_ANALISE" && !termoAceito && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <FileSignature className="h-5 w-5 text-teal-700" />
            {termo?.titulo || "Termo de uso do comprador"}
          </div>
          <div className="mt-4 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
            {termo?.conteudo || "Carregando o termo..."}
          </div>
          <div className="mt-4 space-y-2">
            <Label>Assinatura digital (digite seu nome completo)</Label>
            <Input
              className="h-12 font-semibold"
              value={assinatura}
              onChange={(e) => setAssinatura(e.target.value)}
            />
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm text-slate-600">
            <Checkbox
              checked={concorda}
              onCheckedChange={(v: boolean | "indeterminate") => setConcorda(v === true)}
            />
            <span>
              Li e concordo com o termo acima. Estou ciente de que este aceite registra data, hora,
              endereço IP e navegador utilizados.
            </span>
          </label>
          <Button
            onClick={aceitarTermo}
            disabled={aceitar.isPending}
            className="mt-5 h-12 w-full rounded-xl bg-teal-700 font-bold hover:bg-teal-800"
          >
            {aceitar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Aceitar e assinar
          </Button>
        </div>
      )}

      {status !== "APROVADO" && status !== "AGUARDANDO_ANALISE" && (
        <div className="rounded-3xl bg-slate-950 p-6 text-white">
          <ShieldCheck className="h-6 w-6 text-teal-400" />
          <p className="mt-3 text-sm text-slate-300">
            Ao concluir o envio, nossa equipe analisa seus dados e libera valores e lances.
          </p>
          {!termoAceito && (
            <p className="mt-2 text-xs font-semibold text-amber-400">
              Aceite o termo de uso acima antes de enviar para análise.
            </p>
          )}
          <Button
            onClick={() => enviar.mutate()}
            disabled={enviar.isPending || !termoAceito}
            className="mt-5 h-12 rounded-xl bg-teal-600 px-8 font-bold hover:bg-teal-500"
          >
            {enviar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar para análise
          </Button>
        </div>
      )}
    </div>
  );
}
