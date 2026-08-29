import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getVitrine } from "@/lib/vitrine.functions";
import { getSessionToken } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, MapPin, Gauge, ShieldCheck, Lock, Menu, X } from "lucide-react";
import { useState } from "react";
import { LogoEsf } from "@/components/shared/LogoEsf";

export const Route = createFileRoute("/veiculos/")({
  component: VitrinePublica,
});

function VitrinePublica() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: veiculos, isLoading } = useQuery({
    queryKey: ["vitrine-veiculos"],
    queryFn: () => getVitrine({ data: { token: getSessionToken() } }),
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <LogoEsf height={32} />

          <nav className="hidden items-center gap-8 md:flex">
            <Link to="/veiculos" className="text-sm font-semibold text-teal-700">Veículos</Link>
            <Link to="/" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Como funciona</Link>
            <Link to="/vender" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Quero vender</Link>
            <div className="w-px h-4 bg-slate-200"></div>
            <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Entrar</Link>
            <Link to="/vender">
              <Button className="rounded-full bg-slate-950 text-white hover:bg-teal-700 px-6">Vender meu carro</Button>
            </Link>
          </nav>

          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {/* HERO / BUSCA */}
      <section className="bg-slate-950 py-16 text-white text-center px-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">Encontre sua próxima oportunidade.</h1>
          <p className="text-slate-400 text-lg mb-10">Veículos vistoriados e disponíveis para compradores cadastrados.</p>
          
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <Input 
              placeholder="Busque por marca, modelo ou veículo" 
              className="h-14 pl-12 pr-4 bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-full focus-visible:ring-teal-500 text-lg"
            />
          </div>
        </div>
      </section>

      {/* FILTROS E GRID */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar Filtros (Desktop) */}
          <aside className="hidden md:block w-64 space-y-8 shrink-0">
            <div>
              <h3 className="font-bold text-slate-900 mb-4">Filtros</h3>
              <div className="space-y-4">
                {['Marca', 'Modelo', 'Ano', 'Quilometragem'].map(f => (
                  <div key={f} className="pb-4 border-b border-slate-200">
                    <button className="w-full flex items-center justify-between text-sm font-medium hover:text-teal-600">
                      {f} <Search className="h-4 w-4 text-slate-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Grid de Veículos */}
          <div className="flex-1">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1,2,3].map(i => <div key={i} className="h-96 bg-slate-200 animate-pulse rounded-2xl"></div>)}
              </div>
            ) : veiculos?.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900">Novas oportunidades estão chegando.</h2>
                <p className="text-slate-500 mt-2">No momento não há veículos disponíveis. Volte em breve para conferir novas ofertas.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {veiculos?.map((v: any) => (
                  <Link 
                    key={v.id} 
                    to="/veiculos/$slug"
                    params={{ slug: v.slug }}
                    className="group bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl transition-all hover:border-teal-200"
                  >
                    <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                      {v.foto_capa ? (
                        <img src={v.foto_capa} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={v.modelo} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">Sem foto</div>
                      )}
                      <div className="absolute top-3 left-3 flex gap-2">
                        <span className="bg-teal-600 text-white text-[10px] font-black px-2 py-1 rounded flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> VISTORIADO
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-5">
                      <div className="mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{v.marca}</div>
                      <h3 className="text-lg font-black text-slate-900 mb-2 leading-tight uppercase">{v.modelo}</h3>
                      
                      <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
                        <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> {v.km} km</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {v.localizacao_publica}</span>
                      </div>

                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-slate-900 font-bold">
                          <Lock className="h-3.5 w-3.5 text-teal-600" />
                          <span className="text-sm">Preço restrito</span>
                        </div>
                        <Button variant="ghost" className="h-8 px-3 text-xs font-bold text-teal-700 hover:text-teal-800 hover:bg-teal-50">
                          Ver detalhes
                        </Button>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
