import { createFileRoute, useNavigate, useParams, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Car, ArrowLeft, Check, DollarSign, Megaphone, ExternalLink } from 'lucide-react';
import { listarMeusVeiculosFn } from '@/lib/vendedor.functions';
import { getAnuncioVeiculoVendedor } from '@/lib/anuncios-vendedor.functions';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge, statusVeiculo } from '@/components/vendedor/StatusBadge';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/vendedor/veiculo/$id')({
  component: DetalheVeiculo,
});

const JORNADA = ['Cadastro do veículo', 'Análise', 'Vistoria', 'Aprovação do valor', 'Anúncio', 'Venda'];

function etapaAtual(status?: string, statusAnalise?: string) {
  if (statusAnalise === 'AGUARDANDO_ACEITE_VENDEDOR') return 3;
  if (statusAnalise === 'PRONTO_PARA_ANUNCIO') return 4;
  
  switch (status) {
    case 'AGUARDANDO_APROVACAO': return 1;
    case 'CADASTRADO': return 2;
    case 'AGENDADO':
    case 'EM_VISTORIA': return 2;
    case 'VISTORIA_CONCLUIDA': return 3;
    case 'EM_LEILAO': return 4;
    case 'VENDIDO': return 5;
    default: return 0;
  }
}

function DetalheVeiculo() {
  const { id } = useParams({ from: '/vendedor/veiculo/$id' });
  const { user } = useAuth();
  const navigate = useNavigate();
  const exibindoProposta = useRouterState({
    select: (state) => state.location.pathname.endsWith('/proposta'),
  });
  const listar = useServerFn(listarMeusVeiculosFn);

  const { data, isLoading } = useQuery({
    queryKey: ['meus-veiculos', user?.id],
    queryFn: () => listar({ data: { perfilId: user?.id || '' } }),
    enabled: !!user?.id,
  });

  const veiculo = ((data as any)?.data || []).find((v: any) => String(v.id) === id);

  if (exibindoProposta) return <Outlet />;

  if (isLoading) return <p className="text-sm text-slate-400">Carregando veículo...</p>;
  if (!veiculo) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
        <p className="font-semibold text-slate-900">Veículo não encontrado</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => navigate({ to: '/vendedor/veiculos' })}>
          Voltar para meus veículos
        </Button>
      </div>
    );
  }

  const fotos: string[] = veiculo.fotos || [];
  const atual = etapaAtual(veiculo.status, veiculo.status_analise);
  const criado = veiculo.criado_em ? new Date(veiculo.criado_em) : null;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate({ to: '/vendedor/veiculos' })} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Meus veículos
      </button>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex aspect-[16/7] items-center justify-center bg-slate-100">
          {fotos[0] ? (
            <img src={fotos[0]} alt={`${veiculo.marca} ${veiculo.modelo}`} className="h-full w-full object-cover" />
          ) : (
            <Car className="h-10 w-10 text-slate-300" />
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900">{veiculo.marca} {veiculo.modelo}</h1>
            <p className="text-xs uppercase tracking-widest text-slate-400">{veiculo.placa}</p>
          </div>
          <StatusBadge status={statusVeiculo(veiculo.status)} />
        </div>
      </div>

      {veiculo.status_analise === 'AGUARDANDO_ACEITE_VENDEDOR' && (
        <Card className="border-teal-200 bg-teal-50 overflow-hidden">
          <CardContent className="p-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase">Proposta Recebida!</h3>
                <p className="text-xs text-slate-600">Sua vistoria foi concluída e temos uma proposta para você.</p>
              </div>
            </div>
            <Button asChild className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl">
              <Link to="/vendedor/veiculo/$id/proposta" params={{ id }}>Ver Proposta</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Acompanhamento</h2>
        <ol className="mt-5 space-y-4">
          {JORNADA.map((etapa, i) => (
            <li key={etapa} className="flex items-center gap-3">
              <span className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[11px]',
                i < atual ? 'bg-emerald-600 text-white' : i === atual ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-300',
              )}>
                {i < atual ? <Check className="h-3 w-3" /> : i === atual ? '●' : '○'}
              </span>
              <span className={cn('text-sm', i <= atual ? 'font-semibold text-slate-900' : 'text-slate-400')}>{etapa}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-bold text-slate-900">Informações</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <Linha termo="Ano" valor={`${veiculo.ano_fabricacao || '—'}/${veiculo.ano_modelo || '—'}`} />
            <Linha termo="Quilometragem" valor={veiculo.km ? `${Number(veiculo.km).toLocaleString('pt-BR')} km` : '—'} />
            <Linha termo="Cidade" valor={[veiculo.cidade, veiculo.uf].filter(Boolean).join('/') || '—'} />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-bold text-slate-900">Fotos</h2>
          {fotos.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Nenhuma foto enviada.</p>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {fotos.slice(0, 9).map((f, i) => (
                <img key={i} src={f} alt={`Foto ${i + 1}`} className="aspect-[4/3] w-full rounded-lg object-cover" />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-bold text-slate-900">Histórico</h2>
        <ul className="mt-4 space-y-4">
          {criado && (
            <li className="border-l-2 border-teal-600 pl-4">
              <p className="text-xs font-bold text-slate-400">
                {criado.toLocaleDateString('pt-BR')} às {criado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-sm text-slate-700">Veículo enviado para análise.</p>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Linha({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-400">{termo}</dt>
      <dd className="font-semibold text-slate-900">{valor}</dd>
    </div>
  );
}
