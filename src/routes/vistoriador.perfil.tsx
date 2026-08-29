import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2, Loader2, Lock, LogOut, Mail, MapPin, Phone, User } from "lucide-react";
import { toast } from "sonner";
import { alterarSenhaVistoriadorFn, getPainelVistoriadorFn } from "@/lib/vistoriador.functions";
import { useAuthStore } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GpsStatus } from "@/components/vistoriador/GpsStatus";

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
    onSuccess: (res) => { if (!res.ok) return toast.error(res.message); setSenhas({ atual: "", nova: "", confirmar: "" }); toast.success("Senha alterada com sucesso."); },
    onError: () => toast.error("Não foi possível alterar a senha."),
  });
  function enviar(e: React.FormEvent) { e.preventDefault(); if (senhas.nova.length < 6) return toast.error("A nova senha deve ter pelo menos 6 caracteres."); if (senhas.nova !== senhas.confirmar) return toast.error("A confirmação da senha não confere."); mutacao.mutate(); }

  if (consulta.isLoading) return <div className="flex min-h-64 items-center justify-center lg:ml-64"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return <div className="mx-auto max-w-4xl space-y-5 p-4 pb-24 lg:ml-64 lg:p-8">
    <header><p className="text-xs font-bold uppercase text-muted-foreground">Conta operacional</p><h1 className="text-2xl font-black text-foreground">Meu perfil</h1></header>
    {consulta.data?.ok === false && <div className="border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{consulta.data.message}</div>}
    <section className="border border-border bg-card p-5">
      <div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center bg-primary text-xl font-black text-primary-foreground">{(perfil?.nome || "V").slice(0, 1)}</div><div><h2 className="text-xl font-black text-foreground">{perfil?.nome || user?.nome}</h2><p className="text-sm text-muted-foreground">Vistoriador · {perfil?.vistoriador_status || "Sem vínculo"}</p></div></div>
      <div className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
        <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-4 w-4" /><span>{perfil?.email || user?.email}</span></p>
        <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /><span>{perfil?.whatsapp || perfil?.telefone || "Telefone não informado"}</span></p>
      </div>
    </section>
    <section className="border border-border bg-card p-5"><h2 className="flex items-center gap-2 font-bold text-foreground"><Building2 className="h-4 w-4 text-primary" /> Unidade vinculada</h2><p className="mt-3 font-semibold text-foreground">{perfil?.unidade_nome || "Nenhuma unidade vinculada"}</p><p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{[perfil?.unidade_endereco, perfil?.unidade_cep, perfil?.unidade_cidade, perfil?.unidade_estado].filter(Boolean).join(" · ") || "Endereço não cadastrado"}</p></section>
    <GpsStatus />
    <form onSubmit={enviar} className="border border-border bg-card p-5"><h2 className="flex items-center gap-2 font-bold text-foreground"><Lock className="h-4 w-4 text-primary" /> Alterar senha</h2><div className="mt-4 grid gap-4 sm:grid-cols-3"><Campo label="Senha atual"><Input type="password" value={senhas.atual} onChange={(e) => setSenhas({ ...senhas, atual: e.target.value })} required /></Campo><Campo label="Nova senha"><Input type="password" value={senhas.nova} onChange={(e) => setSenhas({ ...senhas, nova: e.target.value })} required /></Campo><Campo label="Confirmar"><Input type="password" value={senhas.confirmar} onChange={(e) => setSenhas({ ...senhas, confirmar: e.target.value })} required /></Campo></div><Button type="submit" disabled={mutacao.isPending} className="mt-5 w-full sm:w-auto">{mutacao.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Atualizar senha</Button></form>
    <Button variant="outline" onClick={() => { logout(); navigate({ to: "/login" }); }} className="w-full text-destructive"><LogOut className="mr-2 h-4 w-4" />Sair da conta</Button>
  </div>;
}
function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }