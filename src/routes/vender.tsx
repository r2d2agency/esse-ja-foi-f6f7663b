import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoEsf } from "@/components/shared/LogoEsf";
import heroVender from "@/assets/hero-car.jpg";

export const Route = createFileRoute("/vender")({
  head: () => ({
    meta: [
      { title: "Venda seu carro — ESSE JÁ FOI" },
      {
        name: "description",
        content: "A plataforma que conecta seu carro aos melhores compradores verificados.",
      },
    ],
  }),
  component: LandingVender,
});

function LandingVender() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [placa, setPlaca] = useState("");

  const irParaCadastro = (p?: string) => {
    const valor = (p ?? placa).trim().toUpperCase();
    if (valor && typeof window !== 'undefined') {
      sessionStorage.setItem('ejf_placa', valor);
    }
    navigate({ to: "/cadastro" });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4 lg:px-12">
          <LogoEsf height={32} />

          <nav className="hidden items-center gap-10 md:flex">
            <Link to="/login" className="text-sm text-slate-500 transition-colors hover:text-slate-900">
              Entrar
            </Link>
            <Button onClick={() => irParaCadastro()} className="h-11 rounded-full bg-slate-900 px-6 text-white hover:bg-teal-800">
              Vender meu carro
            </Button>
          </nav>

          <button
            aria-label="Abrir menu"
            className="md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-slate-100 bg-white px-6 py-6 md:hidden">
            <div className="flex flex-col gap-5">
              <Link to="/login" className="text-base text-slate-600">Entrar</Link>
              <Button onClick={() => irParaCadastro()} className="h-12 rounded-full bg-slate-900 text-white hover:bg-teal-800">
                Vender meu carro
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* HERO VENDER */}
      <section className="mx-auto max-w-[1400px] px-6 py-12 lg:px-12 lg:py-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-teal-700">
              <Zap className="h-3 w-3" /> Plataforma de Vendas
            </div>
            <h1 className="mt-6 text-[2.5rem] font-black leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-[4.5rem]">
              Venda seu carro <br />
              <span className="text-teal-700 italic">sem dor de cabeça.</span>
            </h1>
            <p className="mt-8 max-w-xl text-xl leading-relaxed text-slate-500">
              Conectamos seu veículo a centenas de compradores profissionais verificados. Você recebe ofertas reais, não curiosos.
            </p>

            <div className="mt-12 flex flex-col gap-4 sm:flex-row">
              <div className="relative flex-1">
                <Input
                  placeholder="Placa do seu carro"
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                  className="h-16 rounded-2xl border-slate-200 bg-slate-50 px-6 text-lg font-bold tracking-widest placeholder:tracking-normal placeholder:font-normal"
                />
              </div>
              <Button
                onClick={() => irParaCadastro()}
                className="h-16 rounded-2xl bg-slate-900 px-10 text-lg font-black text-white hover:bg-teal-800"
              >
                Começar agora
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2.5rem] bg-teal-50 lg:-inset-10" />
            <img
              src={heroVender}
              alt="Carro sendo avaliado"
              className="relative aspect-[4/5] w-full rounded-[2rem] object-cover shadow-2xl"
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 py-10">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-6 px-6 sm:flex-row lg:px-12">
          <LogoEsf height={28} />
          <p className="text-sm text-slate-400">© Esse Já Foi. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
