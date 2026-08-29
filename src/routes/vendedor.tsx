import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Home, Car, Handshake, FileText, User, HelpCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { LogoEsf } from '@/components/shared/LogoEsf';

export const Route = createFileRoute('/vendedor')({
  component: VendedorLayout,
});

const MENU = [
  { to: '/vendedor', label: 'Início', icon: Home, exact: true },
  { to: '/vendedor/veiculos', label: 'Meus veículos', icon: Car },
  { to: '/vendedor/documentos', label: 'Documentos', icon: FileText },
  { to: '/vendedor/perfil', label: 'Perfil', icon: User },
  { to: '/vendedor/financeiro', label: 'Financeiro', icon: Handshake },
] as const;

const MOBILE = [
  { to: '/vendedor', label: 'Início', icon: Home, exact: true },
  { to: '/vendedor/veiculos', label: 'Veículos', icon: Car },
  { to: '/vendedor/perfil', label: 'Perfil', icon: User },
] as const;

function VendedorLayout() {
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
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">Carregando...</div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex">
        <LogoEsf height={32} />

        <nav className="mt-10 flex-1 space-y-1">
          {MENU.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                ativo(m.to, (m as any).exact)
                  ? 'bg-teal-50 font-semibold text-teal-800'
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
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-rose-600"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </aside>

      {/* Header mobile */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 lg:hidden">
        <LogoEsf height={28} />
        <button
          onClick={sair}
          aria-label="Sair"
          className="-mr-1 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:bg-slate-50 hover:text-rose-600"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <main className="px-4 pb-28 pt-4 lg:ml-64 lg:px-10 lg:pb-12 lg:pt-10">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        {MOBILE.map((m) => (
          <Link
            key={m.to}
            to={m.to}
            className={cn(
              'flex flex-col items-center gap-1 py-3 text-[11px] transition-colors',
              ativo(m.to, (m as any).exact) ? 'text-teal-700' : 'text-slate-400'
            )}
          >
            <m.icon className="h-5 w-5" />
            {m.label}
          </Link>
        ))}
      </nav>

      {user ? null : null}
    </div>
  );
}
