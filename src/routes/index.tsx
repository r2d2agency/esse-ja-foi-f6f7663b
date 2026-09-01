import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Shield,
  Car,
  FileCheck,
  CheckCircle2,
  ArrowRight,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { LogoEsf } from '@/components/shared/LogoEsf';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

const COMO_FUNCIONA = [
  {
    numero: '01',
    titulo: 'Cadastre seu carro',
    descricao: 'Informe a placa e os dados do veículo em poucos minutos, direto pelo site.',
  },
  {
    numero: '02',
    titulo: 'Vistoria especializada',
    descricao: 'Um vistoriador credenciado analisa mais de 50 pontos e emite o laudo do veículo.',
  },
  {
    numero: '03',
    titulo: 'Receba propostas',
    descricao: 'Compradores verificados enviam ofertas reais. Você acompanha tudo pelo painel.',
  },
  {
    numero: '04',
    titulo: 'Venda com segurança',
    descricao: 'O pagamento fica custodiado e só é liberado após a entrega do veículo.',
  },
];

const COMPARATIVO = [
  {
    criterio: 'Tempo até a venda',
    sozinho: 'Semanas ou meses',
    esf: 'Rápido e direto',
  },
  {
    criterio: 'Negociação com o comprador',
    sozinho: 'Você negocia sozinho',
    esf: 'A gente intermedia',
  },
  {
    criterio: 'Segurança do pagamento',
    sozinho: 'Sem garantia',
    esf: 'Pagamento custodiado',
  },
  {
    criterio: 'Documentação e burocracia',
    sozinho: 'Por sua conta',
    esf: 'Cuidamos de tudo',
  },
  {
    criterio: 'Vistoria do veículo',
    sozinho: 'Não incluída',
    esf: 'Mais de 50 pontos checados',
  },
  {
    criterio: 'Exposição a curiosos e golpes',
    sozinho: 'Alta exposição',
    esf: 'Compradores verificados',
  },
];

const FAQ = [
  {
    pergunta: 'Como funciona o pagamento da venda?',
    resposta:
      'O valor do comprador fica custodiado pela plataforma e só é repassado a você depois que a entrega do veículo é confirmada.',
  },
  {
    pergunta: 'Quanto tempo leva para vender meu carro?',
    resposta:
      'Após a vistoria, seu veículo entra na vitrine para compradores verificados. O prazo varia conforme modelo e preço, mas o processo é muito mais rápido do que vender sozinho.',
  },
  {
    pergunta: 'Existe alguma taxa para anunciar?',
    resposta:
      'O cadastro e a vistoria não têm custo inicial. A cobrança acontece apenas quando a venda é concluída com sucesso.',
  },
  {
    pergunta: 'O que é avaliado na vistoria?',
    resposta:
      'Nossos vistoriadores credenciados analisam mais de 50 pontos, incluindo motor, estrutura, documentação e histórico do veículo, gerando um laudo cautelar completo.',
  },
  {
    pergunta: 'É seguro vender pelo Esse Já Foi?',
    resposta:
      'Sim. Toda a negociação, documentação e pagamento são intermediados pela plataforma, reduzindo o risco de golpes e problemas na transferência.',
  },
];

function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [placaCta, setPlacaCta] = useState('');

  const irParaCadastro = (placa?: string) => {
    const valor = (placa ?? placaCta).trim().toUpperCase();
    if (valor && typeof window !== 'undefined') {
      sessionStorage.setItem('ejf_placa', valor);
    }
    navigate({ to: '/cadastro' });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navegação */}
      <nav className="border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <LogoEsf height={36} />

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <Link to="/" className="hover:text-turquoise transition-colors">Comprar</Link>
            <Link to="/vender" className="hover:text-turquoise transition-colors">Vender</Link>
            <Link to="/veiculos" className="hover:text-turquoise transition-colors">Estoque</Link>
            <a href="#faq" className="hover:text-turquoise transition-colors">FAQ</a>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <Button
                onClick={() => navigate({ to: user.role === 'admin' ? '/admin' : user.role === 'vendedor' ? '/vendedor' : '/comprador' })}
                variant="outline"
                className="rounded-full border-navy text-navy hover:bg-navy/5"
              >
                Meu Painel
              </Button>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" className="text-slate-600">Entrar</Button>
                </Link>
                <Link to="/vender">
                  <Button className="bg-turquoise hover:bg-turquoise-dark text-white rounded-full px-6">
                    Vender meu carro
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden bg-navy text-white">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <Badge className="mb-4 bg-turquoise/10 text-turquoise border-turquoise/30">
              Nova experiência em leilões
            </Badge>
            <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6">
              Cadastre seu carro. <br />
              <span className="text-turquoise">A gente cuida da venda.</span>
            </h1>
            <p className="text-xl text-slate-300 mb-10 leading-relaxed">
              Veículos vistoriados, documentação garantida e o melhor preço de mercado.
              Conectamos vendedores e compradores em um ambiente 100% digital.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/vender">
                <Button size="lg" className="bg-turquoise hover:bg-turquoise-dark text-white text-lg px-8 h-14 rounded-full w-full sm:w-auto">
                  Quero Vender <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link to="/comprador/cadastro">
                <Button size="lg" variant="outline" className="bg-transparent !text-white border-white/40 hover:!bg-white/10 hover:!text-white text-lg px-8 h-14 rounded-full w-full sm:w-auto">
                  Quero Comprar
                </Button>
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-6 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-turquoise" />
                Vistoria In Loco
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-turquoise" />
                Pagamento Seguro
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-turquoise" />
                Laudo Cautelar
              </div>
            </div>
          </div>
        </div>

        {/* Background Decor */}
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-20 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-l from-turquoise/20 to-transparent" />
          <div className="w-full h-full bg-[url('https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=2070')] bg-cover bg-center grayscale" />
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold mb-4 text-navy">Por que escolher o Esse Já Foi?</h2>
            <p className="text-slate-500">Eliminamos as dores de cabeça da compra e venda de veículos usados com tecnologia e transparência.</p>
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
              description="Nossos vistoriadores analisam mais de 50 pontos antes do veículo ir para a vitrine."
            />
            <FeatureCard
              icon={<FileCheck className="w-6 h-6" />}
              title="Sem Burocracia"
              description="Cuidamos de toda a parte documental para que você não precise se preocupar."
            />
          </div>
        </div>
      </section>

      {/* Como Funciona */}
      <section className="py-24 bg-navy text-white">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold mb-4">Como funciona</h2>
            <p className="text-slate-300">Do cadastro à venda concluída, tudo acontece em quatro etapas simples.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            {COMO_FUNCIONA.map((etapa) => (
              <div key={etapa.numero}>
                <span className="block text-4xl font-black text-turquoise mb-4">{etapa.numero}</span>
                <h3 className="text-lg font-bold mb-2">{etapa.titulo}</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{etapa.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparativo */}
      <section className="py-24 bg-mist">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold mb-4 text-navy">Vender sozinho ou com o Esse Já Foi?</h2>
            <p className="text-slate-500">A diferença está em como cada etapa da venda é conduzida.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="rounded-2xl bg-white border border-slate-200 p-8">
              <h3 className="text-lg font-bold text-slate-500 mb-6">Vendendo sozinho</h3>
              <ul className="space-y-4">
                {COMPARATIVO.map((item) => (
                  <li key={item.criterio} className="flex items-start gap-3">
                    <X className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-400">{item.criterio}</p>
                      <p className="text-slate-600 font-medium">{item.sozinho}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-navy p-8 shadow-xl shadow-navy/10">
              <h3 className="text-lg font-bold text-turquoise mb-6">Com o Esse Já Foi</h3>
              <ul className="space-y-4">
                {COMPARATIVO.map((item) => (
                  <li key={item.criterio} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-turquoise shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-400">{item.criterio}</p>
                      <p className="text-white font-medium">{item.esf}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold mb-4 text-navy">Perguntas frequentes</h2>
            <p className="text-slate-500">Tudo o que você precisa saber antes de anunciar seu carro.</p>
          </div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible>
              {FAQ.map((item, index) => (
                <AccordionItem key={item.pergunta} value={`item-${index}`} className="border-slate-200">
                  <AccordionTrigger className="text-navy font-semibold text-left [&>svg]:text-turquoise-dark">
                    {item.pergunta}
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-500 leading-relaxed">
                    {item.resposta}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-24 bg-navy-dark text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
              Você anuncia. <span className="text-turquoise">A gente vende.</span>
            </h2>
            <p className="text-slate-300 mb-10">Esse Já Foi.</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                irParaCadastro();
              }}
              className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
            >
              <Input
                placeholder="Placa do seu carro"
                value={placaCta}
                onChange={(e) => setPlacaCta(e.target.value.toUpperCase())}
                className="h-14 rounded-full bg-white text-navy px-6 text-base font-bold tracking-widest placeholder:tracking-normal placeholder:font-normal border-0"
              />
              <Button
                type="submit"
                size="lg"
                className="bg-turquoise hover:bg-turquoise-dark text-white h-14 rounded-full px-8 w-full sm:w-auto"
              >
                Cadastrar meu carro
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-navy-dark text-slate-400 py-12 border-t border-white/10">
        <div className="container mx-auto px-4">
          <div className="flex justify-center items-center mb-6">
            <LogoEsf height={40} variant="dark" />
          </div>
          <div className="flex justify-center flex-wrap gap-6 text-sm mb-6">
            <Link to="/" className="hover:text-turquoise transition-colors">Comprar</Link>
            <Link to="/vender" className="hover:text-turquoise transition-colors">Vender</Link>
            <Link to="/veiculos" className="hover:text-turquoise transition-colors">Estoque</Link>
            <a href="#faq" className="hover:text-turquoise transition-colors">FAQ</a>
            <Link to="/login" className="hover:text-turquoise transition-colors">Entrar</Link>
          </div>
          <p className="text-sm text-center">© 2026 Esse Já Foi - Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: any) {
  return (
    <div className="p-8 rounded-2xl bg-mist border border-slate-100 hover:shadow-xl hover:shadow-slate-200/50 transition-all group">
      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-turquoise shadow-sm mb-6 group-hover:bg-turquoise group-hover:text-white transition-colors">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 text-navy">{title}</h3>
      <p className="text-slate-500 leading-relaxed">{description}</p>
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
