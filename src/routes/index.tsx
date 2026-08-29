import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { 
  Shield, 
  Car, 
  ChevronRight, 
  Star, 
  Clock, 
  FileCheck,
  CheckCircle2,
  Phone,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { LogoEsf } from '@/components/shared/LogoEsf';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navegação */}
      <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <LogoEsf height={36} />
          
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <Link to="/" className="hover:text-teal-600 transition-colors">Comprar</Link>
            <Link to="/vender" className="hover:text-teal-600 transition-colors">Vender</Link>
            <Link to="/veiculos" className="hover:text-teal-600 transition-colors">Estoque</Link>
            <a href="#faq" className="hover:text-teal-600 transition-colors">FAQ</a>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <Button 
                onClick={() => navigate({ to: user.role === 'admin' ? '/admin' : user.role === 'vendedor' ? '/vendedor' : '/comprador' })}
                variant="outline"
                className="rounded-full border-teal-600 text-teal-600 hover:bg-teal-50"
              >
                Meu Painel
              </Button>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" className="text-slate-600">Entrar</Button>
                </Link>
                <Link to="/comprador/cadastro">
                  <Button className="bg-teal-600 hover:bg-teal-700 rounded-full px-6">
                    Cadastrar
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden bg-slate-900 text-white">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <Badge className="mb-4 bg-teal-500/20 text-teal-400 border-teal-500/30">
              Nova experiência em leilões
            </Badge>
            <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6">
              O jeito mais <span className="text-teal-400">seguro e rápido</span> de vender seu veículo.
            </h1>
            <p className="text-xl text-slate-300 mb-10 leading-relaxed">
              Veículos vistoriados, documentação garantida e o melhor preço de mercado. 
              Conectamos vendedores e compradores em um ambiente 100% digital.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/comprador/cadastro">
                <Button size="lg" className="bg-teal-600 hover:bg-teal-700 text-lg px-8 h-14 rounded-full w-full sm:w-auto">
                  Quero Comprar <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link to="/vender">
                <Button size="lg" variant="outline" className="bg-transparent !text-white border-slate-500 hover:!bg-white/10 hover:!text-white text-lg px-8 h-14 rounded-full w-full sm:w-auto">
                  Quero Vender
                </Button>
              </Link>
            </div>
            
            <div className="mt-12 flex items-center gap-6 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-teal-500" />
                Vistoria In Loco
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-teal-500" />
                Pagamento Seguro
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-teal-500" />
                Laudo Cautelar
              </div>
            </div>
          </div>
        </div>
        
        {/* Background Decor */}
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-20 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-l from-teal-500/20 to-transparent" />
          <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=2070')] bg-cover bg-center grayscale" />
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold mb-4">Por que escolher o Esse Já Foi?</h2>
            <p className="text-slate-600">Eliminamos as dores de cabeça da compra e venda de veículos usados com tecnologia e transparência.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Shield className="w-6 h-6" />}
              title="100% Seguro"
              description="Fazemos a custódia do pagamento e só liberamos quando o veículo é entregue."
            />
            <FeatureCard 
              icon={<Car className="w-6 h-6" />}
              title="Vistoria Especializada"
              description="Nossos vistoriadores analisam mais de 250 pontos antes do veículo ir para a vitrine."
            />
            <FeatureCard 
              icon={<FileCheck className="w-6 h-6" />}
              title="Sem Burocracia"
              description="Cuidamos de toda a parte documental para que você não precise se preocupar."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12 border-t border-slate-800">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center items-center mb-6">
            <LogoEsf height={40} variant="dark" />
          </div>
          <p className="text-sm">© 2026 Esse Já Foi - Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: any) {
  return (
    <div className="p-8 rounded-2xl bg-slate-50 border border-slate-100 hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-teal-600 shadow-sm mb-6 group-hover:bg-teal-600 group-hover:text-white transition-colors">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 text-slate-900">{title}</h3>
      <p className="text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}

function Badge({ children, className }: any) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide border ${className}`}>
      {children}
    </span>
  );
}
