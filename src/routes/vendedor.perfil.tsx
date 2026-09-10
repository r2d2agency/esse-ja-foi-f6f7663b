import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { BadgeCheck, Clock, Loader2, Lock, LogOut, Mail, MapPin, Save, User as UserIcon } from 'lucide-react';
import { obterMeuPerfilFn, atualizarMeuPerfilFn, alterarMinhaSenhaFn } from '@/lib/vendedor.functions';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { maskCep, maskDocumento, maskTelefone, buscarCep } from '@/lib/brasil';

export const Route = createFileRoute('/vendedor/perfil')({
  component: PerfilVendedor,
  head: () => ({
    meta: [
      { title: 'Meu perfil | Esse Já Foi' },
      { name: 'description', content: 'Veja e edite seus dados pessoais, contato e endereço na plataforma Esse Já Foi.' },
    ],
  }),
});

type Form = {
  nome: string;
  whatsapp: string;
  cpf: string;
  cep: string;
  endereco: string;
  cidade: string;
  uf: string;
};

const VAZIO: Form = { nome: '', whatsapp: '', cpf: '', cep: '', endereco: '', cidade: '', uf: '' };

function PerfilVendedor() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const obter = useServerFn(obterMeuPerfilFn);
  const atualizar = useServerFn(atualizarMeuPerfilFn);
  const alterarSenha = useServerFn(alterarMinhaSenhaFn);

  const [form, setForm] = useState<Form>(VAZIO);
  const [senhas, setSenhas] = useState({ atual: '', nova: '', confirmar: '' });
  const [buscandoCep, setBuscandoCep] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['meu-perfil', user?.id],
    queryFn: () => obter({ data: { perfilId: user?.id || '' } }),
    enabled: !!user?.id,
  });

  const perfil: any = (data as any)?.perfil;

  useEffect(() => {
    if (!perfil) return;
    setForm({
      nome: perfil.nome || '',
      whatsapp: perfil.whatsapp ? maskTelefone(perfil.whatsapp) : '',
      cpf: perfil.cpf ? maskDocumento(perfil.cpf) : '',
      cep: perfil.cep ? maskCep(perfil.cep) : '',
      endereco: perfil.endereco || '',
      cidade: perfil.cidade || '',
      uf: perfil.uf || '',
    });
  }, [perfil]);

  const salvar = useMutation({
    mutationFn: async () => atualizar({ data: { perfilId: user?.id || '', ...form } }),
    onSuccess: (res: any) => {
      if (res?.ok === false) {
        toast.error(res.message || 'Não foi possível salvar.');
        return;
      }
      setUser({ nome: form.nome, whatsapp: form.whatsapp, cpf: form.cpf });
      qc.invalidateQueries({ queryKey: ['meu-perfil'] });
      toast.success('Dados atualizados com sucesso.');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar dados.'),
  });

  const trocarSenha = useMutation({
    mutationFn: async () =>
      alterarSenha({ data: { perfilId: user?.id || '', senhaAtual: senhas.atual, novaSenha: senhas.nova } }),
    onSuccess: (res: any) => {
      if (res?.ok === false) {
        toast.error(res.message || 'Não foi possível alterar a senha.');
        return;
      }
      setSenhas({ atual: '', nova: '', confirmar: '' });
      toast.success('Senha alterada com sucesso.');
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao alterar senha.'),
  });

  async function preencherPorCep(valor: string) {
    const cep = maskCep(valor);
    setForm((f) => ({ ...f, cep }));
    if (cep.replace(/\D/g, '').length !== 8) return;
    setBuscandoCep(true);
    try {
      const end = await buscarCep(cep);
      if (end) setForm((f) => ({ ...f, endereco: end.logradouro || f.endereco, cidade: end.cidade, uf: end.uf }));
      else toast.error('CEP não encontrado.');
    } finally {
      setBuscandoCep(false);
    }
  }

  function submeterDados(e: React.FormEvent) {
    e.preventDefault();
    if (form.nome.trim().length < 3) {
      toast.error('Informe seu nome completo.');
      return;
    }
    salvar.mutate();
  }

  function submeterSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senhas.nova.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (senhas.nova !== senhas.confirmar) {
      toast.error('A confirmação da nova senha não confere.');
      return;
    }
    trocarSenha.mutate();
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando seu perfil...
      </div>
    );
  }

  const completo = !!perfil?.cadastro_completo;

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-xl font-black text-white">
            {(perfil?.nome || 'V').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{perfil?.nome || 'Meu perfil'}</h1>
            <p className="flex items-center gap-1.5 text-sm text-slate-500">
              <Mail className="h-3.5 w-3.5" /> {perfil?.email}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            completo ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {completo ? <BadgeCheck className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
          {completo ? 'Cadastro verificado' : 'Cadastro pendente'}
        </span>
      </header>

      {!completo && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-900">
            Faltam documentos para concluir seu cadastro e liberar a venda dos seus veículos.
          </p>
          <Button
            onClick={() => navigate({ to: '/vendedor/onboarding' })}
            className="rounded-xl bg-amber-600 font-semibold text-white hover:bg-amber-700"
          >
            Concluir cadastro
          </Button>
        </div>
      )}

      <form onSubmit={submeterDados} className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
          <UserIcon className="h-4 w-4 text-teal-700" /> Dados pessoais
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Campo label="Nome completo">
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="h-12 rounded-xl" />
          </Campo>
          <Campo label="E-mail (não editável)">
            <Input value={perfil?.email || ''} disabled className="h-12 rounded-xl bg-slate-50" />
          </Campo>
          <Campo label="WhatsApp">
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: maskTelefone(e.target.value) })}
              placeholder="(11) 99999-9999"
              className="h-12 rounded-xl"
            />
          </Campo>
          <Campo label="CPF">
            <Input
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: maskDocumento(e.target.value) })}
              placeholder="000.000.000-00"
              className="h-12 rounded-xl"
            />
          </Campo>
        </div>

        <h3 className="mt-8 flex items-center gap-2 font-bold text-slate-900">
          <MapPin className="h-4 w-4 text-teal-700" /> Endereço
        </h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Campo label="CEP">
            <div className="relative">
              <Input
                value={form.cep}
                onChange={(e) => preencherPorCep(e.target.value)}
                placeholder="00000-000"
                className="h-12 rounded-xl"
              />
              {buscandoCep && <Loader2 className="absolute right-3 top-4 h-4 w-4 animate-spin text-slate-400" />}
            </div>
          </Campo>
          <Campo label="Endereço">
            <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className="h-12 rounded-xl" />
          </Campo>
          <Campo label="Cidade">
            <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="h-12 rounded-xl" />
          </Campo>
          <Campo label="Estado (UF)">
            <Input
              value={form.uf}
              onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase().slice(0, 2) })}
              className="h-12 rounded-xl"
            />
          </Campo>
        </div>

        <Button
          type="submit"
          disabled={salvar.isPending}
          className="mt-6 h-12 w-full rounded-xl bg-teal-700 font-semibold text-white hover:bg-teal-800 sm:w-auto"
        >
          {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar alterações
        </Button>
      </form>

      <form onSubmit={submeterSenha} className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
          <Lock className="h-4 w-4 text-teal-700" /> Alterar senha
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Campo label="Senha atual">
            <PasswordInput value={senhas.atual} onChange={(e) => setSenhas({ ...senhas, atual: e.target.value })} className="h-12 rounded-xl" />
          </Campo>
          <Campo label="Nova senha">
            <PasswordInput value={senhas.nova} onChange={(e) => setSenhas({ ...senhas, nova: e.target.value })} className="h-12 rounded-xl" />
          </Campo>
          <Campo label="Confirmar nova senha">
            <PasswordInput value={senhas.confirmar} onChange={(e) => setSenhas({ ...senhas, confirmar: e.target.value })} className="h-12 rounded-xl" />
          </Campo>
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={trocarSenha.isPending}
          className="mt-6 h-12 w-full rounded-xl font-semibold sm:w-auto"
        >
          {trocarSenha.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Atualizar senha
        </Button>
      </form>

      <button
        onClick={() => {
          logout();
          navigate({ to: '/login' });
        }}
        className="flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-700"
      >
        <LogOut className="h-4 w-4" /> Sair da conta
      </button>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</Label>
      {children}
    </div>
  );
}
