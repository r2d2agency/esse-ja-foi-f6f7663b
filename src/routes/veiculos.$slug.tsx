import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAnuncioPublico } from "@/lib/vitrine.functions";
import { getLeilaoInfo, darLanceFn } from "@/lib/leilao.functions";
import { Button } from "@/components/ui/button";
import { ShieldCheck, MapPin, Fuel, Settings2, Lock, ArrowLeft, Gavel, Clock, TrendingUp, Heart, BellPlus } from "lucide-react";
import { getSessionToken } from "@/lib/session";
import { alternarFavoritoFn, salvarLembreteFn } from "@/lib/comprador.functions";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { LogoEsf } from "@/components/shared/LogoEsf";

export const Route = createFileRoute("/veiculos/$slug")({
  head: () => ({
    meta: [
      { title: "Veículo em leilão — ESSE JÁ FOI" },
      {
        name: "description",
        content:
          "Detalhes completos do veículo vistoriado: fotos, ficha técnica e sala de lances para compradores aprovados.",
      },
      { property: "og:title", content: "Veículo em leilão — ESSE JÁ FOI" },
      {
        property: "og:description",
        content: "Veículo vistoriado disponível para lances na plataforma Esse Já Foi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DetalheVeiculoPublico,
});

function DetalheVeiculoPublico() {
  const { slug } = Route.useParams();
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: anuncio, isLoading: loadingAnuncio } = useQuery({
    queryKey: ["anuncio-publico", slug],
    queryFn: () => getAnuncioPublico({ data: { slug, token: getSessionToken() } }),
  });

  const acesso: any = (anuncio as any)?.acesso || {};
  const podeVerValores = !!acesso.pode_ver_valores;
  const podeDarLances = !!acesso.pode_dar_lances;

  // Buscamos info do leilão em tempo real se o anúncio for carregado e o usuário puder ver
  const { data: leilao, isLoading: loadingLeilao } = useQuery({
    queryKey: ["leilao-veiculo", anuncio?.id],
    queryFn: async () => {
      const res = await getLeilaoInfo({ data: anuncio?.leilao_id });
      return res as any;
    },
    enabled: !!(anuncio?.leilao_id && podeVerValores),
    refetchInterval: 5000,
  });

  const darLanceMutation = useMutation({
    mutationFn: (valor: number) =>
      darLanceFn({
        data: {
          leilaoId: anuncio?.leilao_id,
          valor,
          token: getSessionToken(),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leilao-veiculo"] });
      toast.success("Lance registrado com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao registrar lance.");
    }
  });

  const favoritoMutation = useMutation({
    mutationFn: () =>
      alternarFavoritoFn({ data: { token: getSessionToken(), anuncioId: anuncio?.id } }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ["anuncio-publico", slug] });
      toast.success(res?.favorito ? "Adicionado aos favoritos." : "Removido dos favoritos.");
    },
    onError: () => toast.error("Faça login para favoritar."),
  });

  const lembreteMutation = useMutation({
    mutationFn: () =>
      salvarLembreteFn({
        data: {
          token: getSessionToken(),
          anuncioId: anuncio?.id,
          lembrarEm: anuncio?.inicio_em || null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["anuncio-publico", slug] });
      toast.success("Lembrete criado! Avisaremos antes do leilão começar.");
    },
    onError: () => toast.error("Faça login para criar lembretes."),
  });

  const [activePhoto, setActivePhoto] = useState(0);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!leilao?.fim_em) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const end = new Date(leilao.fim_em);
      const diff = end.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeLeft("Encerrado");
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [leilao?.fim_em]);

  if (loadingAnuncio) return <div className="p-10 text-center">Carregando veículo...</div>;
  if (!anuncio) return <div className="p-10 text-center">Veículo não encontrado.</div>;

  const lanceAtual = Number(leilao?.ultimo_lance?.valor || leilao?.lance_inicial || 0);
  const proximoLanceMinimo = lanceAtual + Number(leilao?.incremento_minimo || 0);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <header className="border-b border-slate-100 py-4 px-6 sticky top-0 bg-white z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/veiculos" className="text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar para vitrine
          </Link>
          <LogoEsf height={32} />
          <div className="w-20"></div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-12">
          
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="aspect-video bg-slate-100 rounded-3xl overflow-hidden relative">
                {anuncio.fotos?.length > 0 ? (
                  <img 
                    src={anuncio.fotos[activePhoto].foto_url} 
                    className="w-full h-full object-cover" 
                    alt={anuncio.titulo}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">Sem fotos</div>
                )}
                <div className="absolute top-4 left-4">
                  <span className="bg-teal-600 text-white text-xs font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
                    <ShieldCheck className="h-4 w-4" /> VEÍCULO VISTORIADO
                  </span>
                </div>
              </div>
              
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {anuncio.fotos?.map((f: any, i: number) => (
                  <button 
                    key={f.id} 
                    onClick={() => setActivePhoto(i)}
                    className={`w-24 h-18 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${activePhoto === i ? 'border-teal-500 ring-2 ring-teal-50' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  >
                    <img src={f.foto_url} className="w-full h-full object-cover" alt={`Miniatura ${i}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 rounded-3xl p-8 space-y-6">
              <h2 className="text-xl font-black uppercase tracking-tight">Sobre o Veículo</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-8">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ano</div>
                  <div className="font-bold">{anuncio.ano_fabricacao}/{anuncio.ano_modelo}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">KM</div>
                  <div className="font-bold">{anuncio.km} km</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Combustível</div>
                  <div className="font-bold flex items-center gap-1.5"><Fuel className="h-3.5 w-3.5 text-slate-400" /> {anuncio.combustivel}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Câmbio</div>
                  <div className="font-bold flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5 text-slate-400" /> {anuncio.cambio}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Localização</div>
                  <div className="font-bold flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {anuncio.localizacao_publica}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Código</div>
                  <div className="font-bold text-slate-500">{anuncio.codigo_publico}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:sticky lg:top-24 h-fit">
            <div className="bg-slate-950 text-white rounded-[2.5rem] p-8 md:p-10 shadow-2xl">
              <div className="mb-8">
                <div className="text-[10px] font-bold text-teal-500 uppercase tracking-widest mb-2">Oportunidade</div>
                <h1 className="text-3xl font-black leading-tight uppercase">{anuncio.marca} {anuncio.modelo}</h1>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed">{anuncio.descricao}</p>
              </div>

              {!isAuthenticated ? (
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-8 text-center">
                  <div className="flex justify-center mb-3">
                    <div className="w-12 h-12 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400">
                      <Lock className="h-6 w-6" />
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-1">Valores Restritos</h3>
                  <p className="text-sm text-slate-400 mb-6">Acesse sua conta para visualizar as condições e participar desta oferta.</p>
                  <Link to="/login">
                    <Button className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl mb-3">
                      Entrar para participar
                    </Button>
                  </Link>
                  <div className="text-xs text-slate-500">
                    Ainda não possui cadastro? <Link to="/comprador/cadastro" className="text-teal-400 hover:underline">Criar conta de comprador</Link>
                  </div>
                </div>
              ) : !podeVerValores ? (
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-8 text-center">
                  <div className="flex justify-center mb-3">
                    <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-1">Aguardando Aprovação</h3>
                  <p className="text-sm text-slate-400 mb-6">Seu cadastro está em análise. Você será notificado assim que seu acesso for liberado.</p>
                </div>
              ) : anuncio.leilao_id ? (
                <div className="space-y-6">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Valor de partida</div>
                        <div className="text-xl font-black text-white">
                          R$ {Number(leilao?.lance_inicial || 0).toLocaleString("pt-BR")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tempo Restante</div>
                        <div className="text-xl font-black text-white flex items-center gap-2 justify-end">
                          <Clock className="h-4 w-4 text-amber-400" /> {timeLeft}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-teal-500/10 border border-teal-500/20 p-5">
                      <div className="text-[11px] font-bold text-teal-300 uppercase tracking-widest mb-1">Lance atual</div>
                      <div className="text-4xl md:text-5xl font-black leading-none tracking-tight text-teal-400 tabular-nums break-words">
                        R$ {lanceAtual.toLocaleString("pt-BR")}
                      </div>
                      <div className="mt-2 text-xs font-medium text-slate-400">
                        Incremento mínimo: R$ {Number(leilao?.incremento_minimo || 0).toLocaleString("pt-BR")}
                      </div>
                    </div>


                    {leilao?.ultimo_lance?.comprador_id === user?.id && (
                      <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3 flex items-center gap-3">
                        <TrendingUp className="h-5 w-5 text-teal-400" />
                        <span className="text-xs font-bold text-teal-400 uppercase">Você é o líder deste leilão!</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <Button 
                        onClick={() => darLanceMutation.mutate(proximoLanceMinimo)}
                        disabled={!podeDarLances || darLanceMutation.isPending || leilao?.status === 'ENCERRADO'}
                        className="h-14 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs uppercase rounded-2xl shadow-lg shadow-teal-900/20"
                      >
                        Dar Lance R$ {proximoLanceMinimo.toLocaleString('pt-BR')}
                      </Button>
                      <Button 
                        onClick={() => darLanceMutation.mutate(proximoLanceMinimo + Number(leilao?.incremento_minimo || 0))}
                        disabled={!podeDarLances || darLanceMutation.isPending || leilao?.status === 'ENCERRADO'}
                        variant="outline"
                        className="h-14 border-white/10 text-white hover:bg-white/5 font-black text-xs uppercase rounded-2xl"
                      >
                        Lance R$ {(proximoLanceMinimo + Number(leilao?.incremento_minimo || 0)).toLocaleString('pt-BR')}
                      </Button>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Gavel className="h-3.5 w-3.5" /> Últimos Lances
                    </div>
                    <div className="space-y-3">
                      {(leilao?.historico || []).slice(0, 3).map((lance: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-white/5 last:border-0">
                          <span className="text-slate-400 font-medium">Comprador {lance.comprador_id.substring(0,4)}***</span>
                          <span className="font-bold text-white">R$ {Number(lance.valor).toLocaleString('pt-BR')}</span>
                        </div>
                      ))}
                      {(leilao?.historico || []).length === 0 && (
                        <div className="text-center py-4 text-xs text-slate-500 font-bold italic">Nenhum lance ainda</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
                  <div className="text-3xl font-black text-white mb-2">R$ {Number(anuncio.valor_comercial).toLocaleString('pt-BR')}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Valor Comercial</div>
                  <Button className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl">
                    Tenho Interesse
                  </Button>
                </div>
              )}
              {isAuthenticated && (
                <div className="mt-8 grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => favoritoMutation.mutate()}
                    className="h-12 rounded-2xl border-white/10 text-xs font-black uppercase text-white hover:bg-white/5"
                  >
                    <Heart
                      className={`mr-2 h-4 w-4 ${anuncio.favorito ? "fill-teal-400 text-teal-400" : ""}`}
                    />
                    {anuncio.favorito ? "Favoritado" : "Favoritar"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => lembreteMutation.mutate()}
                    className="h-12 rounded-2xl border-white/10 text-xs font-black uppercase text-white hover:bg-white/5"
                  >
                    <BellPlus className="mr-2 h-4 w-4" />
                    {anuncio.lembrete ? "Lembrete ativo" : "Lembrar-me"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
