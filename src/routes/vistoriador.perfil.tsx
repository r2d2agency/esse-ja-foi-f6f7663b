import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2, Loader2, Lock, LogOut, Mail, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { alterarSenhaVistoriadorFn, getPainelVistoriadorFn } from "@/lib/vistoriador.functions";
import { useAuthStore } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GpsStatus } from "@/components/vistoriador/GpsStatus";
import { InstalarApp } from "@/components/vistoriador/InstalarApp";

export const Route = createFileRoute("/vistoriador/perfil")({
  component: PerfilPage,
  head: () => ({ meta: [
    { title: "Meu perfil | Esse Já Foi" },
    { name: "description", content: "Dados operacionais, unidade, GPS e segurança do vistoriador." },
    { property: "og:title", content: "Meu perfil | Esse Já Foi" },
    { property: "og:description", content: "Dados operacionais, unidade, GPS e segurança do vistoriador." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function PerfilPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const carregar = useServerFn(getPainelVistoriadorFn);
  const alterarSenha = useServerFn(alterarSenhaVistoriadorFn);
  const [senhas, setSenhas] = useState({ atual: "", nova: "", confirmar: "" });
  const consulta = useQuery({ queryKey: ["perfil-vistoriador", user?.id], queryFn: () => carregar({ data: { usuarioId: user?.id || "" } }), enabled: !!user?.id });
  const perfil = consulta.data?.ok ? consulta.data.data.perfil : null;
  const mutacao = useMutation({
    mutationFn: () => alterarSenha({ data: { usuarioId: user?.id || "", senhaAtual: senhas.atual, novaSenha: senhas.nova } }),
    onSuccess: (res) => { if (!res.ok) { toast.error(res.message); return; } setSenhas({ atual: "", nova: "", confirmar: "" }); toast.success("Senha alterada com sucesso."); },
    onError: () => { toast.error("Não foi possível alterar a senha."); },
  });
  function enviar(e: React.FormEvent) { e.preventDefault(); if (senhas.nova.length < 6) { toast.error("A nova senha deve ter pelo menos 6 caracteres."); return; } if (senhas.nova !== senhas.confirmar) { toast.error("A confirmação da senha não confere."); return; } mutacao.mutate(); }

  if (consulta.isLoading) return <div className="flex min-h-64 items-center justify-center lg:ml-64"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 pb-8 lg:ml-64 lg:p-8">
      {/* Cabeçalho do perfil */}
      <header className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-foreground/10" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-foreground/15 text-2xl font-black">
            {(perfil?.nome || user?.nome || "V").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-primary-foreground/70">Conta operacional</p>
            <h1 className="text-2xl font-black">{perfil?.nome || user?.nome}</h1>
            <p className="text-sm text-primary-foreground/80">Vistoriador · {perfil?.vistoriador_status || "Sem vínculo"}</p>
          </div>
        </div>
        <div className="relative mt-5 grid gap-2 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2 rounded-xl bg-primary-foreground/10 px-3 py-2"><Mail className="h-4 w-4 shrink-0" /><span className="truncate">{perfil?.email || user?.email}</span></p>
          <p className="flex items-center gap-2 rounded-xl bg-primary-foreground/10 px-3 py-2"><Phone className="h-4 w-4 shrink-0" /><span>{perfil?.whatsapp || perfil?.telefone || "Telefone não informado"}</span></p>
        </div>
      </header>

      {consulta.data?.ok === false && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{consulta.data.message}</div>}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-black text-foreground"><Building2 className="h-4 w-4 text-primary" /> Unidade vinculada</h2>
        <p className="mt-3 font-semibold text-foreground">{perfil?.unidade_nome || "Nenhuma unidade vinculada"}</p>
        <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
          {[perfil?.unidade_endereco, perfil?.unidade_cep, perfil?.unidade_cidade, perfil?.unidade_estado].filter(Boolean).join(" · ") || "Endereço não cadastrado"}
        </p>
      </section>

      <GpsStatus />
      <InstalarApp />

      <form onSubmit={enviar} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-black text-foreground"><Lock className="h-4 w-4 text-primary" /> Alterar senha</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Campo label="Senha atual"><Input type="password" value={senhas.atual} onChange={(e) => setSenhas({ ...senhas, atual: e.target.value })} required className="h-11 rounded-xl" /></Campo>
          <Campo label="Nova senha"><Input type="password" value={senhas.nova} onChange={(e) => setSenhas({ ...senhas, nova: e.target.value })} required className="h-11 rounded-xl" /></Campo>
          <Campo label="Confirmar"><Input type="password" value={senhas.confirmar} onChange={(e) => setSenhas({ ...senhas, confirmar: e.target.value })} required className="h-11 rounded-xl" /></Campo>
        </div>
        <Button type="submit" disabled={mutacao.isPending} className="mt-5 h-12 w-full rounded-xl font-bold sm:w-auto">
          {mutacao.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Atualizar senha
        </Button>
      </form>

      <Button variant="outline" onClick={() => { logout(); navigate({ to: "/login" }); }} className="h-12 w-full rounded-xl font-bold text-destructive">
        <LogOut className="mr-2 h-4 w-4" />Sair da conta
      </Button>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-bold text-muted-foreground">{label}</Label>{children}</div>;
}
