import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Calendar, ClipboardList, Clock, User, WifiOff } from "lucide-react";
import { LogoEsf } from "@/components/shared/LogoEsf";
import { useOnline } from "@/hooks/use-online";

export const Route = createFileRoute("/vistoriador")({
  component: VistoriadorLayout,
});

const itensNav = [
  { to: "/vistoriador", rotulo: "Hoje", icone: Clock, exato: true },
  { to: "/vistoriador/agenda", rotulo: "Agenda", icone: Calendar },
  { to: "/vistoriador/historico", rotulo: "Histórico", icone: ClipboardList },
  { to: "/vistoriador/perfil", rotulo: "Perfil", icone: User },
] as const;

function VistoriadorLayout() {
  const online = useOnline();

  // Registra o service worker (PWA offline) apenas no cliente
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background pb-28 lg:pb-0">
      {!online && (
        <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-xs font-bold text-amber-950">
          <WifiOff className="h-4 w-4" />
          Sem conexão — suas alterações serão enviadas quando a internet voltar.
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Navegação inferior flutuante (mobile) */}
      <nav className="fixed inset-x-3 bottom-3 z-50 lg:hidden" aria-label="Navegação do vistoriador">
        <div className="mx-auto flex max-w-md items-center justify-between rounded-3xl border border-border bg-card/95 px-2 py-2 shadow-xl shadow-foreground/10 backdrop-blur">
          {itensNav.map((item) => (
            <ItemNavMobile key={item.to} {...item} />
          ))}
        </div>
      </nav>

      {/* Sidebar desktop */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 flex-col border-r border-border bg-card p-6 lg:flex">
        <div className="mb-8 rounded-2xl bg-card p-2">
          <LogoEsf height={34} />
        </div>
        <nav className="flex-1 space-y-1.5" aria-label="Navegação do vistoriador">
          {itensNav.map((item) => (
            <ItemNavDesktop key={item.to} {...item} />
          ))}
        </nav>
        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          App operacional de vistorias · Esse Já Foi
        </p>
      </aside>
    </div>
  );
}

function ItemNavMobile({ to, rotulo, icone: Icone, exato }: any) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ativo = exato ? pathname === to : pathname.startsWith(to);
  return (
    <Link
      to={to}
      aria-current={ativo ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 transition-colors ${
        ativo ? "bg-primary text-primary-foreground" : "text-muted-foreground"
      }`}
    >
      <Icone className="h-5 w-5" />
      <span className="text-[10px] font-bold">{rotulo}</span>
    </Link>
  );
}

function ItemNavDesktop({ to, rotulo, icone: Icone, exato }: any) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const ativo = exato ? pathname === to : pathname.startsWith(to);
  return (
    <Link
      to={to}
      aria-current={ativo ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
        ativo
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <Icone className="h-5 w-5" />
      {rotulo}
    </Link>
  );
}
