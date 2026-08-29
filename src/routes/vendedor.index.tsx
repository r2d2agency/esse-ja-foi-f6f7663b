import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CardsEntregaVendedor } from '@/components/entrega/cards-entrega';
import { useServerFn } from '@tanstack/react-start';
import { Car, Plus, CheckCircle2, AlertTriangle, Clock, BadgeCheck, Calendar } from 'lucide-react';
import { listarMeusVeiculosFn } from '@/lib/vendedor.functions';
import { getOnboardingStatusFn } from '@/lib/onboarding.functions';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { StatusBadge, statusVeiculo } from '@/components/vendedor/StatusBadge';
import { ProgressoCadastro, montarEtapas, percentual } from '@/components/vendedor/ProgressoCadastro';
import { CardContratoVendedor } from '@/components/contratos/CardContratoVendedor';
import { CardVistoriaVendedor } from '@/components/vendedor/CardVistoriaVendedor';
import { CardOfertaVencedora } from '@/components/negociacao/CardOfertaVencedora';
import { CardPropostaVendedor } from '@/components/vendedor/CardPropostaVendedor';

export const Route = createFileRoute('/vendedor/')({
  component: DashboardVendedor,
});

const CAMINHO = [
  'Complete seu cadastro',
  'Cadastre seu veículo',
  'Faça a vistoria',
  'Receba ofertas',
];

function DashboardVendedor() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const listar = useServerFn(listarMeusVeiculosFn);
  const getOnboardingStatus = useServerFn(getOnboardingStatusFn);
  const [placaPendente, setPlacaPendente] = useState('');

  useEffect(() => {
    setPlacaPendente(sessionStorage.getItem('ejf_placa') || '');
  }, []);

  const { data: veiculosData, isLoading: loadingVeiculos } = useQuery({
    queryKey: ['meus-veiculos', user?.id],
    queryFn: () => listar({ data: { perfilId: user?.id || '' } }),
    enabled: !!user?.id,
  });

  const { data: onboardingData, isLoading: loadingOnboarding } = useQuery({
    queryKey: ['onboarding-status', user?.id],
    queryFn: () => getOnboardingStatus({ data: { perfilId: user?.id || '' } }),
    enabled: !!user?.id,
  });

  const isLoading = loadingVeiculos || loadingOnboarding;
  const veiculos: any[] = (veiculosData as any)?.data || [];
  const profile = (onboardingData as any) || {};
  
  // Mapear campos para compatibilidade com ProgressoCadastro
  const statusEtapas = (onboardingData as any)?.etapas || {};
  const etapas = [
    { id: "conta", label: "Conta criada", concluida: true },
    { id: "dados", label: "Dados pessoais", concluida: statusEtapas.dados_pessoais === "CONCLUIDO" },
    { id: "endereco", label: "Endereço e Comprovante", concluida: statusEtapas.endereco === "CONCLUIDO" },
    { id: "documentos", label: "Documentos (CNH, CRLV)", concluida: statusEtapas.documentos === "CONCLUIDO" },
    { id: "validacao", label: "Selfie de validação", concluida: statusEtapas.validacao === "CONCLUIDO" },
  ];

  const pct = profile.progresso || 0;
  const completo = profile.cadastroCompleto || pct === 100;
  const primeiroNome = user?.nome?.split(' ')[0] || 'vendedor';
  const complianceStatus = profile.complianceStatus;
  const motivoPendencia = profile.motivoPendencia;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-slate-900 lg:text-2xl">Olá, {primeiroNome} 👋</h1>
            {profile.verificado && (
              <div 
                className="cursor-help transition-transform hover:scale-110"
                title={`Verificado em ${profile.dataVerificacao ? new Date(profile.dataVerificacao).toLocaleDateString('pt-BR') : 'data pendente'}`}
                onClick={() => alert(`Perfil verificado em: ${profile.dataVerificacao ? new Date(profile.dataVerificacao).toLocaleString('pt-BR') : 'data pendente'}`)}

              >
                <BadgeCheck className="h-6 w-6 fill-teal-600 text-white lg:h-7 lg:w-7" />
              </div>
            )}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">Vamos deixar tudo pronto para você vender seu veículo.</p>
        </div>
        {profile.verificado && (
          <div className="hidden lg:flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-700 border border-teal-100">
            <Calendar className="h-3 w-3" />
            Verificado em {profile.dataVerificacao ? new Date(profile.dataVerificacao).toLocaleDateString('pt-BR') : 'data pendente'}
          </div>

        )}
      </div>

      {user?.id && <CardPropostaVendedor vendedorId={user.id} />}

      <CardsEntregaVendedor vendedorId={user?.id} />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        {/* Card cadastro */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-6">
          {complianceStatus === 'APROVADO' ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <div>
                <p className="text-lg font-bold text-slate-900">Cadastro aprovado</p>
                <p className="text-sm text-slate-500">Sua conta está ativa e pronta para operar.</p>
              </div>
            </div>
          ) : complianceStatus === 'PENDENCIA' ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900">Precisamos de algumas informações</h2>
                <StatusBadge status="aguardando" label="Pendência" />
              </div>
              <p className="mt-1.5 text-sm text-slate-500">
                {motivoPendencia || "Existem itens no seu cadastro que precisam de correção."}
              </p>
              <Button
                onClick={() => navigate({ to: '/vendedor/onboarding' })}
                className="mt-4 h-11 w-full rounded-xl bg-amber-600 font-semibold text-white transition-colors hover:bg-amber-700"
              >
                Resolver pendência
              </Button>
            </>
          ) : (complianceStatus === 'AGUARDANDO_ANALISE' || complianceStatus === 'EM_ANALISE') ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {complianceStatus === 'EM_ANALISE' ? 'Cadastro em análise' : 'Cadastro enviado para análise'}
                </h2>
                <StatusBadge status="analise" />
              </div>
              <p className="mt-1.5 text-sm text-slate-500">
                {complianceStatus === 'EM_ANALISE'
                  ? 'Nossa equipe já iniciou a análise das suas informações.' 
                  : 'Solicitação de cadastro enviada com sucesso, aguardando aprovação.'}
              </p>
              <div className="mt-4 space-y-2.5">
                 <div className="flex items-center gap-3">
                    <div className="h-6 w-6 flex items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]"><CheckCircle2 className="w-3 h-3" /></div>
                    <span className="text-sm text-slate-600 font-medium">Cadastro 100% concluído</span>
                 </div>
                 <div className="flex items-center gap-3">
                    <div className={`h-6 w-6 flex items-center justify-center rounded-full ${complianceStatus === 'EM_ANALISE' ? 'bg-teal-600 text-white' : 'bg-teal-100 text-teal-700'} text-[10px] ${complianceStatus === 'EM_ANALISE' ? '' : 'animate-pulse'}`}>
                      {complianceStatus === 'EM_ANALISE' ? <CheckCircle2 className="w-3 h-3" /> : '●'}
                    </div>
                    <span className={`text-sm ${complianceStatus === 'EM_ANALISE' ? 'text-slate-600 font-medium' : 'text-slate-900 font-bold'}`}>
                      {complianceStatus === 'EM_ANALISE' ? 'Em análise' : 'Aguardando aprovação'}
                    </span>
                 </div>
                 <div className="flex items-center gap-3">
                    <div className="h-6 w-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-300 text-[10px]">○</div>
                    <span className="text-sm text-slate-400">Liberação do perfil</span>
                 </div>
              </div>
              <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Cadastro bloqueado para edição</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Enquanto seus dados estão em análise, as alterações no perfil ficam desabilitadas.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900">Complete seu cadastro</h2>
                <StatusBadge status="incompleto" />
              </div>
              <p className="mt-1.5 text-sm text-slate-500">
                Precisamos validar algumas informações antes de liberar seu veículo para análise.
              </p>
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                Existem informações pendentes no seu cadastro.
              </p>
              <div className="mt-4">
                <ProgressoCadastro etapas={etapas} />
              </div>
              <Button
                onClick={() => navigate({ to: '/vendedor/onboarding' })}
                className="mt-4 h-11 w-full rounded-xl bg-teal-700 font-semibold text-white transition-colors hover:bg-teal-800"
              >
                Continuar cadastro
              </Button>
            </>
          )}
        </section>

        {/* Card veículos */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:p-6">
          {isLoading ? (
            <p className="text-sm text-slate-400">Carregando seus veículos...</p>
          ) : veiculos.length > 0 ? (
            <>
              <h2 className="text-lg font-bold text-slate-900">Seus veículos</h2>
              <ul className="mt-4 space-y-3">
                {veiculos.slice(0, 3).map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {v.marca} {v.modelo}
                      </p>
                      <p className="text-xs uppercase tracking-widest text-slate-400">{v.placa}</p>
                    </div>
                    <StatusBadge status={statusVeiculo(v.status)} />
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                onClick={() => navigate({ to: '/vendedor/veiculos' })}
                className="mt-4 h-11 w-full rounded-xl"
              >
                Ver todos
              </Button>
            </>
          ) : placaPendente ? (
            <>
              <h2 className="text-lg font-bold text-slate-900">Seu veículo</h2>
              <p className="mt-2 text-xl font-bold uppercase tracking-[0.2em] text-slate-900">{placaPendente}</p>
              <div className="mt-3">
                <StatusBadge status="incompleto" label="Cadastro não concluído" />
              </div>
              <Button
                onClick={() => navigate({ to: '/vendedor/cadastrar', search: { id: undefined } })}
                className="mt-4 h-11 w-full rounded-xl bg-teal-700 font-semibold text-white hover:bg-teal-800"
              >
                Continuar cadastro do veículo
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50">
                  <Car className="h-5 w-5 text-teal-700" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Cadastre seu primeiro veículo</h2>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                Enquanto conclui seu cadastro, você já pode adiantar os dados do seu carro.
              </p>
              <Button
                onClick={() => navigate({ to: '/vendedor/cadastrar', search: { id: undefined } })}
                className="mt-4 h-11 w-full rounded-xl bg-teal-700 font-semibold text-white hover:bg-teal-800"
              >
                <Plus className="mr-2 h-4 w-4" /> Cadastrar veículo
              </Button>
            </>
          )}
        </section>
      </div>

      {user?.id && <CardPropostaVendedor vendedorId={user.id} />}
      {user?.id && <CardOfertaVencedora vendedorId={user.id} />}
      {user?.id && <CardVistoriaVendedor vendedorId={user.id} />}
      {user?.id && <CardContratoVendedor vendedorId={user.id} />}

      {/* Como funciona */}
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-3 lg:p-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Como funciona</h2>
        <ol className="mt-2 grid gap-1.5 lg:grid-cols-4 lg:gap-4">
          {CAMINHO.map((etapa, i) => (
            <li key={etapa} className="flex items-center gap-2">
              <span className="text-xs font-black text-teal-700">{i + 1}</span>
              <span className="text-xs text-slate-500">{etapa}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
