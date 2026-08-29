import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Users, 
  Car, 
  FileText, 
  Camera, 
  Megaphone, 
  Gavel, 
  Handshake,
  ShoppingBag, 
  DollarSign, 
  Truck, 
  BarChart3, 
  UserCog, 
  Settings,
  ClipboardCheck,
  Search,
  Bell,
  LogOut,
  User,
  ChevronDown,
  Menu,
  X,
  Building2,
  MapPin
} from "lucide-react";
import { ReactNode, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogoEsf } from "@/components/shared/LogoEsf";

type MenuItem = {
  label: string;
  icon: any;
  to: string;
  search?: Record<string, any>;
  activePrefixes?: string[];
  activeIncludes?: string[];
  exact?: boolean;
  description?: string;
};

type MenuSection = {
  label: string;
  items: MenuItem[];
};

const MENU_SECTIONS: MenuSection[] = [
  {
    label: "Visão Geral",
    items: [
      {
        label: "Dashboard",
        icon: LayoutDashboard,
        to: "/admin",
        activePrefixes: ["/admin"],
        exact: true,
        description: "Resumo da operação",
      },
    ],
  },
  {
    label: "1. Compliance",
    items: [
      {
        label: "Vendedores",
        icon: Users,
        to: "/admin/vendedores",
        activePrefixes: ["/admin/vendedores", "/admin/vendedor"],
        description: "Cadastro e documentos",
      },
      {
        label: "Veículos",
        icon: Car,
        to: "/admin/veiculos",
        activePrefixes: ["/admin/veiculos", "/admin/veiculo"],
        description: "Análise documental",
      },
      {
        label: "Compradores",
        icon: ShoppingBag,
        to: "/admin/compradores",
        activePrefixes: ["/admin/compradores", "/admin/comprador"],
        description: "Pré-aprovação de compra",
      },
      {
        label: "Contratos",
        icon: FileText,
        to: "/admin/contratos",
        activePrefixes: ["/admin/contratos", "/admin/contrato"],
        description: "Assinaturas pendentes",
      },
    ],
  },
  {
    label: "2. Vistoria",
    items: [
      {
        label: "Fila e Agenda",
        icon: Camera,
        to: "/admin/vistorias",
        activePrefixes: ["/admin/vistorias", "/admin/analise-vistoria"],
        activeIncludes: ["/pos-vistoria"],
        description: "Agendamentos, laudos e triagem",
      },
      {
        label: "Unidades e Equipe",
        icon: Building2,
        to: "/admin/vistorias",
        search: { tab: "cadastros" },
        activeIncludes: ["/admin/vistorias"],
        description: "Credenciados e vistoriadores",
      },
      {
        label: "App Vistoriador",
        icon: ClipboardCheck,
        to: "/vistoriador",
        activePrefixes: ["/vistoriador"],
        description: "Atalho para execução de vistorias",
      },
    ],
  },
  {
    label: "3. Comercial",
    items: [
      {
        label: "Vitrine",
        icon: ClipboardCheck,
        to: "/admin/anuncios",
        activePrefixes: ["/admin/anuncios"],
        description: "Veículos aptos para venda",
      },
      {
        label: "Campanhas",
        icon: Megaphone,
        to: "/admin/comunicacoes",
        activePrefixes: ["/admin/comunicacoes"],
        description: "Disparo para grupos e listas",
      },
      {
        label: "Leilões",
        icon: Gavel,
        to: "/admin/leiloes",
        activePrefixes: ["/admin/leiloes"],
        description: "Lances e acompanhamento",
      },
      {
        label: "Negociações",
        icon: Handshake,
        to: "/admin/negociacoes",
        activePrefixes: ["/admin/negociacoes", "/admin/negociacao"],
        description: "Fechamento e acompanhamento",
      },
      {
        label: "Pagamentos",
        icon: DollarSign,
        to: "/admin/pagamentos",
        activePrefixes: ["/admin/pagamentos", "/admin/pagamento"],
        description: "Liquidação do processo",
      },
      {
        label: "Entregas",
        icon: Truck,
        to: "/admin/entregas",
        activePrefixes: ["/admin/entregas"],
        description: "Retirada e entrega",
      },
    ],
  },
  {
    label: "Administração",
    items: [
      {
        label: "Usuários Internos",
        icon: UserCog,
        to: "/admin/usuarios",
        activePrefixes: ["/admin/usuarios"],
        description: "Equipe e acessos",
      },
      {
        label: "Relatórios",
        icon: BarChart3,
        to: "/admin/relatorios",
        activePrefixes: ["/admin/relatorios"],
        description: "Indicadores e consultas",
      },
      {
        label: "Configurações",
        icon: Settings,
        to: "/admin/configuracoes",
        activePrefixes: ["/admin/configuracoes", "/admin/logs"],
        description: "Parâmetros do sistema",
      },
    ],
  },
];

interface AdminLayoutProps {
  children?: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {

  const { user, isAuthenticated, initialized, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (initialized && !isAuthenticated) navigate({ to: "/login", replace: true });
  }, [initialized, isAuthenticated, navigate]);

  if (!initialized) return null;

  const isActive = (item: MenuItem) => {
    const prefixes = item.activePrefixes || [item.to];
    const prefixMatch = prefixes.some((prefix) => {
      if (item.exact) return pathname === prefix || pathname === `${prefix}/`;
      return pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}.`);
    });
    const includesMatch = (item.activeIncludes || []).some((fragment) => pathname.includes(fragment));
    return prefixMatch || includesMatch;
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <aside className={cn(
        "bg-slate-950 text-white transition-all duration-300 flex flex-col",
        sidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <Link to="/admin" className="flex items-center gap-2 overflow-hidden">
            <LogoEsf height={sidebarOpen ? 32 : 28} variant="dark" />
          </Link>
        </div>

        <ScrollArea className="flex-1">
          <nav className="p-3 space-y-5">
            {MENU_SECTIONS.map((section) => (
              <div key={section.label} className="space-y-1.5">
                {sidebarOpen && (
                  <p className="px-3 pb-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    {section.label}
                  </p>
                )}
                {section.items.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    search={item.search}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group",
                      isActive(item)
                        ? "bg-teal-500 text-slate-950 font-bold"
                        : "text-slate-400 hover:text-white hover:bg-slate-900"
                    )}
                    title={!sidebarOpen ? `${item.label} - ${item.description || section.label}` : undefined}
                  >
                    <item.icon className={cn("h-5 w-5 shrink-0", isActive(item) ? "text-slate-950" : "group-hover:text-teal-400")} />
                    {sidebarOpen && (
                      <div className="min-w-0">
                        <span className="block truncate">{item.label}</span>
                        {item.description && (
                          <span className={cn(
                            "block truncate text-[10px] font-semibold",
                            isActive(item) ? "text-slate-900/70" : "text-slate-500 group-hover:text-slate-300"
                          )}>
                            {item.description}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </ScrollArea>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-slate-900 text-slate-400"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar vendedor, comprador, placa, veículo ou leilão"
              className="pl-10 bg-slate-50 border-none focus-visible:ring-1 focus-visible:ring-teal-500 h-10"
            />
          </div>

          <div className="flex items-center gap-4 ml-4">
            <Button variant="ghost" size="icon" className="relative text-slate-500">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-teal-500 rounded-full border-2 border-white"></span>
            </Button>

            <div className="h-8 w-px bg-slate-200"></div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 p-1 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold leading-none">{user?.nome?.split(' ')[0]}</p>
                    <p className="text-[11px] text-slate-500 font-medium mt-1">Operações</p>
                  </div>
                  <Avatar className="h-9 w-9 border border-slate-200">
                    <AvatarFallback className="bg-teal-50 text-teal-700 font-bold">{user?.nome?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin/usuarios" className="flex items-center gap-2 cursor-pointer">
                    <User className="h-4 w-4" /> Meu perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/vistoriador" className="flex items-center gap-2 cursor-pointer">
                    <ClipboardCheck className="h-4 w-4" /> App Vistoriador
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/admin/configuracoes" className="flex items-center gap-2 cursor-pointer">
                    <Settings className="h-4 w-4" /> Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()} className="text-red-600 focus:text-red-600 cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
