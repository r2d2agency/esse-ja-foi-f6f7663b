import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Calendar, ClipboardList, Clock, User } from "lucide-react";
import { LogoEsf } from "@/components/shared/LogoEsf";

export const Route = createFileRoute("/vistoriador")({
  component: VistoriadorLayout,
});

function VistoriadorLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-20 lg:pb-0">
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Navegação Inferior Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t bg-white px-2 lg:hidden">
        <Link
          to="/vistoriador"
          activeProps={{ className: "text-teal-700 font-bold" }}
          inactiveProps={{ className: "text-slate-500" }}
          className="flex flex-1 flex-col items-center justify-center gap-1"
        >
          <Clock className="h-5 w-5" />
          <span className="text-[10px]">Hoje</span>
        </Link>
        <Link
          to="/vistoriador/agenda"
          activeProps={{ className: "text-teal-700 font-bold" }}
          inactiveProps={{ className: "text-slate-500" }}
          className="flex flex-1 flex-col items-center justify-center gap-1"
        >
          <Calendar className="h-5 w-5" />
          <span className="text-[10px]">Agenda</span>
        </Link>
        <Link
          to="/vistoriador/historico"
          activeProps={{ className: "text-teal-700 font-bold" }}
          inactiveProps={{ className: "text-slate-500" }}
          className="flex flex-1 flex-col items-center justify-center gap-1"
        >
          <ClipboardList className="h-5 w-5" />
          <span className="text-[10px]">Histórico</span>
        </Link>
        <Link
          to="/vistoriador/perfil"
          activeProps={{ className: "text-teal-700 font-bold" }}
          inactiveProps={{ className: "text-slate-500" }}
          className="flex flex-1 flex-col items-center justify-center gap-1"
        >
          <User className="h-5 w-5" />
          <span className="text-[10px]">Perfil</span>
        </Link>
      </nav>

      {/* Layout Desktop Adaptado */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 border-r bg-white p-6 lg:block">
        <div className="mb-10">
          <LogoEsf height={32} />
        </div>
        <nav className="space-y-2">
          <Link
            to="/vistoriador"
            activeProps={{ className: "bg-teal-50 text-teal-900 font-bold" }}
            inactiveProps={{ className: "text-slate-600 hover:bg-slate-50" }}
            className="flex items-center gap-3 rounded-xl p-3"
          >
            <Clock className="h-5 w-5" />
            Vistorias de Hoje
          </Link>
          <Link
            to="/vistoriador/agenda"
            activeProps={{ className: "bg-teal-50 text-teal-900 font-bold" }}
            inactiveProps={{ className: "text-slate-600 hover:bg-slate-50" }}
            className="flex items-center gap-3 rounded-xl p-3"
          >
            <Calendar className="h-5 w-5" />
            Minha Agenda
          </Link>
          <Link
            to="/vistoriador/historico"
            activeProps={{ className: "bg-teal-50 text-teal-900 font-bold" }}
            inactiveProps={{ className: "text-slate-600 hover:bg-slate-50" }}
            className="flex items-center gap-3 rounded-xl p-3"
          >
            <ClipboardList className="h-5 w-5" />
            Histórico
          </Link>
          <Link
            to="/vistoriador/perfil"
            activeProps={{ className: "bg-teal-50 text-teal-900 font-bold" }}
            inactiveProps={{ className: "text-slate-600 hover:bg-slate-50" }}
            className="flex items-center gap-3 rounded-xl p-3"
          >
            <User className="h-5 w-5" />
            Meu Perfil
          </Link>
        </nav>
      </aside>
    </div>
  );
}
