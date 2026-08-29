import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn, formatDate } from "@/lib/utils";
import { gerenciarUsuarioFn, listarUsuariosInternosFn } from "@/lib/admin.functions";
import { CheckCircle, Eye, Mail, ShieldCheck, UserCog, UserPlus, Wrench, XCircle } from "lucide-react";
import { toast } from "sonner";

type InternalRole = "admin" | "operacao" | "vistoriador";

const ROLE_OPTIONS: Array<{
  value: InternalRole;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
  badgeClassName: string;
}> = [
  {
    value: "vistoriador",
    label: "Vistoriador",
    description: "Profissional credenciado que recebe os agendamentos.",
    icon: ShieldCheck,
    badgeClassName: "bg-teal-50 text-teal-700 border-teal-200",
  },
  {
    value: "operacao",
    label: "Operação",
    description: "Equipe interna que acompanha o fluxo administrativo.",
    icon: Wrench,
    badgeClassName: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    value: "admin",
    label: "Administrador",
    description: "Perfil com acesso completo ao backoffice.",
    icon: UserCog,
    badgeClassName: "bg-violet-50 text-violet-700 border-violet-200",
  },
];

const ALL_FILTER = "todos";

function isInternalRole(value: unknown): value is InternalRole {
  return value === "admin" || value === "operacao" || value === "vistoriador";
}

function getRoleMeta(role: string | null | undefined) {
  return ROLE_OPTIONS.find((option) => option.value === role) || ROLE_OPTIONS[0];
}

export const Route = createFileRoute("/admin/usuarios")({
  validateSearch: (search: Record<string, unknown>): { role?: string; open?: string } => ({
    role: isInternalRole(search.role) ? search.role : undefined,
    open: search.open === "novo" ? "novo" : undefined,
  }),
  component: UsuariosAdminPage,
});

function UsuariosAdminPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalhes, setDetalhes] = useState<any | null>(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    whatsapp: "",
    role: search.role ?? "vistoriador",
    password: "",
  });

  const filtroRole = search.role;
  const filtroAtual = filtroRole ?? ALL_FILTER;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listarUsuariosInternosFn({
        data: filtroRole ? { role: filtroRole } : undefined,
      });
      if (res.ok) {
        setUsuarios(res.data);
      } else {
        toast.error(res.message || "Erro ao carregar usuários internos.");
      }
    } catch (err) {
      console.error("[admin/usuarios] erro ao carregar usuários internos:", err);
      toast.error("Falha ao carregar a equipe interna.");
    } finally {
      setLoading(false);
    }
  }, [filtroRole]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    setFormData((current) => ({ ...current, role: search.role ?? current.role ?? "vistoriador" }));
  }, [search.role]);

  useEffect(() => {
    if (search.open === "novo") {
      setModalNovo(true);
    }
  }, [search.open]);

  const resumo = useMemo(() => {
    return ROLE_OPTIONS.reduce<Record<InternalRole, number>>((acc, option) => {
      acc[option.value] = usuarios.filter((usuario) => usuario.role === option.value).length;
      return acc;
    }, { admin: 0, operacao: 0, vistoriador: 0 });
  }, [usuarios]);

  const handleOpenNovoUsuario = (role?: InternalRole) => {
    setFormData((current) => ({
      ...current,
      role: role ?? search.role ?? current.role ?? "vistoriador",
    }));
    setModalNovo(true);
  };

  const handleModalNovoChange = (open: boolean) => {
    setModalNovo(open);
    if (!open && search.open === "novo") {
      void navigate({
        search: (current) => ({
          ...current,
          open: undefined,
        }),
        replace: true,
      });
    }
  };

  const atualizarFiltro = (role: InternalRole | typeof ALL_FILTER) => {
    void navigate({
      search: (current) => ({
        ...current,
        role: role === ALL_FILTER ? undefined : role,
      }),
    });
  };

  const toggleStatus = async (id: string, atual: boolean) => {
    const res = await gerenciarUsuarioFn({ data: { id, ativo: !atual } });
    if (res.ok) {
      toast.success(atual ? "Usuário desativado." : "Usuário ativado.");
      if (detalhes?.id === id) {
        setDetalhes((current: any) => current ? { ...current, ativo: !atual } : null);
      }
      void carregar();
    } else {
      toast.error(res.message || "Erro ao alterar status do usuário.");
    }
  };

  const criarUsuario = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.nome || !formData.email || !formData.password) {
      toast.error("Preencha nome, e-mail e senha inicial.");
      return;
    }

    const res = await gerenciarUsuarioFn({
      data: {
        nome: formData.nome,
        email: formData.email,
        whatsapp: formData.whatsapp,
        role: formData.role,
        password: formData.password,
      },
    });

    if (res.ok) {
      toast.success("Usuário interno criado com sucesso.");
      setFormData({
        nome: "",
        email: "",
        whatsapp: "",
        role: search.role ?? "vistoriador",
        password: "",
      });
      handleModalNovoChange(false);
      void carregar();
    } else {
      toast.error(res.message || "Erro ao criar usuário.");
    }
  };

  const enviarSenhaTemporaria = (email: string) => {
    toast.info(`O envio de recuperação de acesso para ${email} entra na próxima etapa de integração.`);
  };

  return (
    <div className="space-y-6 p-6 text-slate-900">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">Usuários Internos</h1>
            <p className="mt-1 text-sm text-slate-500">
              Cadastre e gerencie a equipe interna do admin. Essa tela concentra os acessos de vistoriadores, operação e administração.
            </p>
          </div>

          <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900">
            <p className="font-bold">Fluxo da vistoria</p>
            <p className="mt-1 text-teal-800">
              Primeiro crie o login do vistoriador aqui. Depois volte em <span className="font-bold">Vistorias &gt; Cadastros</span> para vincular esse usuário a uma unidade credenciada.
            </p>
          </div>
        </div>

        <Button className="bg-teal-700 hover:bg-teal-800 text-white gap-2 self-start" onClick={() => handleOpenNovoUsuario((search.role as any) ?? "vistoriador")}>
          <UserPlus className="h-4 w-4" />
          Novo usuário interno
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ROLE_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => atualizarFiltro(option.value)}
              className={cn(
                "rounded-2xl border bg-white p-5 text-left shadow-sm transition-colors",
                filtroAtual === option.value ? "border-teal-300 ring-2 ring-teal-100" : "border-slate-200 hover:border-slate-300",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Perfil interno</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{option.label}</p>
                  <p className="mt-1 text-sm text-slate-500">{option.description}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-4 text-3xl font-black text-slate-950">{resumo[option.value]}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-950">Equipe cadastrada</h2>
            <p className="mt-1 text-sm text-slate-500">
              {filtroRole
                ? `Mostrando apenas o perfil ${getRoleMeta(filtroRole).label.toLowerCase()}.`
                : "Mostrando todos os perfis internos cadastrados."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn("font-bold", filtroAtual === ALL_FILTER ? "border-slate-950 text-slate-950" : "text-slate-600")}
              onClick={() => atualizarFiltro(ALL_FILTER)}
            >
              Todos
            </Button>
            {ROLE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                className={cn("font-bold", filtroAtual === option.value ? "border-teal-600 text-teal-700" : "text-slate-600")}
                onClick={() => atualizarFiltro(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Nome</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Perfil</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Contato</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Localidade</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Criado em</th>
                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm font-medium text-slate-500">
                    Carregando equipe interna...
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm font-medium text-slate-500">
                    Nenhum usuário interno encontrado para esse filtro.
                  </td>
                </tr>
              ) : (
                usuarios.map((usuario) => {
                  const roleMeta = getRoleMeta(usuario.role);
                  return (
                    <tr key={usuario.id} className="border-t border-slate-100">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">{usuario.nome}</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {usuario.role}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className={cn("font-bold", roleMeta.badgeClassName)}>
                          {roleMeta.label}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <div className="flex flex-col">
                          <span>{usuario.email}</span>
                          <span className="text-xs text-slate-400">{usuario.whatsapp || "Sem WhatsApp"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {[usuario.cidade, usuario.uf].filter(Boolean).join("/") || "Não informado"}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={usuario.ativo ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                          {usuario.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{formatDate(usuario.criado_em)}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <Button size="icon" variant="ghost" className="text-slate-600" onClick={() => setDetalhes(usuario)} title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-slate-600"
                            onClick={() => void toggleStatus(usuario.id, usuario.ativo)}
                            title={usuario.ativo ? "Desativar" : "Ativar"}
                          >
                            {usuario.ativo ? <XCircle className="h-4 w-4 text-red-600" /> : <CheckCircle className="h-4 w-4 text-emerald-600" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={modalNovo} onOpenChange={handleModalNovoChange}>
        <SheetContent className="sm:max-w-md bg-white text-slate-900">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-slate-950">
              <UserPlus className="h-5 w-5 text-teal-700" />
              Criar usuário interno
            </SheetTitle>
            <SheetDescription>
              Cadastre o acesso do vistoriador ou da equipe interna. O perfil fica ativo imediatamente após a criação.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={criarUsuario} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: João Silva"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="joao@email.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Tipo de perfil *</Label>
              <Select value={formData.role} onValueChange={(value: InternalRole) => setFormData({ ...formData, role: value })}>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Selecione o perfil" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">{getRoleMeta(formData.role).description}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha inicial *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="******"
                required
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Depois do cadastro do vistoriador, volte para a tela de vistorias e faça o vínculo com a unidade credenciada.
            </div>

            <Button type="submit" className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold">
              Criar usuário
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={!!detalhes} onOpenChange={() => setDetalhes(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto bg-white text-slate-900">
          <SheetHeader>
            <SheetTitle className="text-slate-950">Detalhes do usuário</SheetTitle>
            <SheetDescription>
              Informações do acesso interno e ações administrativas.
            </SheetDescription>
          </SheetHeader>

          {detalhes && (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nome completo</p>
                  <p className="mt-1 text-base font-bold text-slate-950">{detalhes.nome}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail</p>
                  <p className="mt-1 text-sm text-slate-700">{detalhes.email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">WhatsApp</p>
                  <p className="mt-1 text-sm text-slate-700">{detalhes.whatsapp || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Perfil</p>
                  <div className="mt-1">
                    <Badge variant="outline" className={cn("font-bold", getRoleMeta(detalhes.role).badgeClassName)}>
                      {getRoleMeta(detalhes.role).label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</p>
                  <div className="mt-1">
                    <Badge className={detalhes.ativo ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                      {detalhes.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Criado em</p>
                  <p className="mt-1 text-sm text-slate-700">{formatDate(detalhes.criado_em)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                {detalhes.role === "vistoriador"
                  ? "Esse usuário já pode ser vinculado a uma unidade credenciada dentro da tela de vistorias."
                  : "Esse usuário faz parte da equipe interna do admin e pode atuar no backoffice conforme o perfil."}
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-6">
                <Button
                  variant={detalhes.ativo ? "destructive" : "default"}
                  className="w-full"
                  onClick={() => {
                    void toggleStatus(detalhes.id, detalhes.ativo);
                    setDetalhes(null);
                  }}
                >
                  {detalhes.ativo ? "Desativar acesso" : "Ativar acesso"}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => enviarSenhaTemporaria(detalhes.email)}>
                  <Mail className="mr-2 h-4 w-4" />
                  Enviar recuperação de senha
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
