import { createFileRoute, Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Home, Search, Heart, MessageSquare, FileText, User, LogOut, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { Outlet } from '@tanstack/react-router';
import { LogoEsf } from '@/components/shared/LogoEsf';

export const Route = createFileRoute('/comprador')({
  component: CompradorLayout,
});

const MENU = [
  { to: '/comprador', label: 'Início', icon: Home, exact: true },
  { to: '/veiculos', label: 'Veículos', icon: Search },
  { to: '/comprador/interesses', label: 'Meus interesses', icon: Heart },
  { to: '/comprador/negociacoes', label: 'Negociações', icon: MessageSquare },
  { to: '/comprador/documentos', label: 'Documentos', icon: FileText },
  { to: '/comprador/perfil', label: 'Perfil', icon: User },
] as const;

function CompradorLayout() {
  const { user, isAuthenticated, initialized, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (initialized && !isAuthenticated) navigate({ to: '/login', replace: true });
  }, [initialized, isAuthenticated, navigate]);

  const ativo = (to: string, exact?: boolean) =>
    exact ? pathname === to || pathname === `${to}/` : pathname.startsWith(to);

  const sair = () => {
    logout();
    navigate({ to: '/login', replace: true });
  };

  if (!initialized) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400 font-bold uppercase tracking-widest animate-pulse">Carregando Esse Já Foi...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex shadow-sm">
        <div className="mb-10">
          <LogoEsf height={36} />
        </div>

        <nav className="flex-1 space-y-1">
          {MENU.map((m) => (
            <Link
              key={m.to}
              to={m.to as any}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200',
                ativo(m.to, (m as any).exact)
                  ? 'bg-teal-600 font-bold text-white shadow-lg shadow-teal-100'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <m.icon className="h-4 w-4" />
              {m.label}
            </Link>
          ))}
        </nav>

        <button
          onClick={sair}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 mt-auto"
        >
          <LogOut className="h-4 w-4" /> Sair da conta
        </button>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 lg:hidden">
        <LogoEsf height={28} />
        <button onClick={sair} className="text-slate-400 p-2">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="px-5 pb-28 pt-6 lg:ml-64 lg:px-10 lg:pb-12 lg:pt-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        {MENU.slice(0, 5).map((m) => (
          <Link
            key={m.to}
            to={m.to as any}
            className={cn(
              'flex flex-col items-center gap-1 py-3 text-[10px] font-bold uppercase tracking-tighter transition-colors',
              ativo(m.to, (m as any).exact) ? 'text-teal-700' : 'text-slate-400'
            )}
          >
            <m.icon className="h-5 w-5" />
            {m.label.split(' ')[0]}
          </Link>
        ))}
      </nav>
    </div>
  );
}
