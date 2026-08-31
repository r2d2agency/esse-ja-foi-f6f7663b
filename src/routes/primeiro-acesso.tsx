import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, KeyRound, FileSignature, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LogoEsf } from "@/components/shared/LogoEsf";
import { getSessionToken } from "@/lib/session";
import {
  getStatusPrimeiroAcessoFn,
  trocarSenhaPrimeiroAcessoFn,
} from "@/lib/pre-cadastro.functions";
import { getTermoVigenteFn, aceitarTermoFn } from "@/lib/termos.functions";

export const Route = createFileRoute("/primeiro-acesso")({
  head: () => ({
    meta: [
      { title: "Primeiro acesso — ESSE JÁ FOI" },
      {
        name: "description",
        content:
          "Crie sua senha definitiva e assine digitalmente o termo de adesão de vendedor da ESSE JÁ FOI.",
      },
      { property: "og:title", content: "Primeiro acesso — ESSE JÁ FOI" },
      {
        property: "og:description",
        content: "Troca de senha obrigatória e aceite digital do termo de adesão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrimeiroAcessoPage,
});

function PrimeiroAcessoPage() {
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<"senha" | "termo" | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [assinatura, setAssinatura] = useState("");
  const [concorda, setConcorda] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const { data: statusRes, refetch } = useQuery({
    queryKey: ["primeiro-acesso"],
    queryFn: () => getStatusPrimeiroAcessoFn({ data: { token: getSessionToken() } }),
  });
  const { data: termoRes } = useQuery({
    queryKey: ["termo-vigente"],
    queryFn: () => getTermoVigenteFn(),
  });

  const status: any = (statusRes as any)?.ok ? (statusRes as any).data : null;
  const termo: any = (termoRes as any)?.data ?? null;

  useEffect(() => {
    if (!status) return;
    if (status.precisaTrocarSenha) setEtapa("senha");
    else if (status.precisaAceitarTermo) setEtapa("termo");
    else navigate({ to: "/vendedor" });
  }, [statusRes]);

  useEffect(() => {
    if (status?.nome && !assinatura) setAssinatura(status.nome);
  }, [status]);

  async function salvarSenha() {
    if (senha.length < 8) {
      toast.error("A senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (senha !== confirmar) {
      toast.error("As senhas não conferem.");
      return;
    }
    setSalvando(true);
    try {
      const res: any = await trocarSenhaPrimeiroAcessoFn({
        data: { token: getSessionToken(), novaSenha: senha },
      });
      if (!res?.ok) {
        toast.error(res?.message || "Não foi possível salvar a senha.");
        return;
      }
      toast.success("Senha definida com sucesso.");
      const novo: any = await refetch();
      const st = novo?.data?.data;
      setEtapa(st?.precisaAceitarTermo ? "termo" : null);
      if (!st?.precisaAceitarTermo) navigate({ to: "/vendedor" });
    } finally {
      setSalvando(false);
    }
  }

  async function aceitar() {
    if (!concorda) {
      toast.error("Marque a confirmação de leitura do termo.");
      return;
    }
    if (assinatura.trim().length < 3) {
      toast.error("Digite seu nome completo como assinatura.");
      return;
    }
    setSalvando(true);
    try {
      const res: any = await aceitarTermoFn({
        data: { token: getSessionToken(), assinatura: assinatura.trim() },
      });
      if (!res?.ok) {
        toast.error(res?.message || "Não foi possível registrar o aceite.");
        return;
      }
      toast.success("Termo aceito e registrado.");
      navigate({ to: "/vendedor" });
    } finally {
      setSalvando(false);
    }
  }

  if (!etapa) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <LogoEsf height={30} className="justify-center" />

        <div className="mt-8 flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest">
          <span className={etapa === "senha" ? "text-teal-700" : "text-slate-400"}>
            1. Nova senha
          </span>
          <span className="text-slate-300">—</span>
          <span className={etapa === "termo" ? "text-teal-700" : "text-slate-400"}>
            2. Termo de adesão
          </span>
        </div>

        {etapa === "senha" && (
          <div className="mt-6 space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <KeyRound className="h-5 w-5 text-teal-700" /> Crie sua senha definitiva
            </div>
            <p className="text-sm text-slate-500">
              Sua conta foi criada pela equipe ESSE JÁ FOI com uma senha temporária. Defina agora
              uma senha pessoal para continuar.
            </p>
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input
                type="password"
                className="h-12"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Mínimo de 8 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                className="h-12"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
              />
            </div>
            <Button
              onClick={salvarSenha}
              disabled={salvando}
              className="h-12 w-full rounded-xl bg-teal-700 font-bold hover:bg-teal-800"
            >
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar e continuar
            </Button>
          </div>
        )}

        {etapa === "termo" && (
          <div className="mt-6 space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <FileSignature className="h-5 w-5 text-teal-700" />
              {termo?.titulo || "Termo de adesão do vendedor"}
            </div>
            <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {termo?.conteudo || "Carregando o termo..."}
            </div>
            <div className="space-y-2">
              <Label>Assinatura digital (digite seu nome completo)</Label>
              <Input
                className="h-12 font-semibold"
                value={assinatura}
                onChange={(e) => setAssinatura(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-3 text-sm text-slate-600">
              <Checkbox
                checked={concorda}
                onCheckedChange={(v: boolean | "indeterminate") => setConcorda(v === true)}
              />
              <span>
                Li e concordo com o termo acima. Estou ciente de que este aceite registra data,
                hora, endereço IP e navegador utilizados.
              </span>
            </label>
            <div className="flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-xs font-medium text-teal-800">
              <ShieldCheck className="h-4 w-4" /> Versão {termo?.versao || "—"} • assinatura
              eletrônica com registro de auditoria.
            </div>
            <Button
              onClick={aceitar}
              disabled={salvando}
              className="h-12 w-full rounded-xl bg-teal-700 font-bold hover:bg-teal-800"
            >
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Aceitar e assinar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
