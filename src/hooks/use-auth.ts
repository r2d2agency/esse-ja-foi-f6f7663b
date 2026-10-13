import { create } from "zustand";

export type Role = "admin" | "operacao" | "vistoriador" | "comprador" | "vendedor";

export interface User {
  id: string;
  nome: string;
  email: string;
  role: Role;
  whatsapp?: string;
  cpf?: string;
  pode_ver_valores?: boolean;
  tipo_pessoa?: "PF" | "PJ";
  /** Superadmin: pode forçar exclusões com vínculos e promover outros superadmins. */
  protegido?: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initialized: boolean;
  login: (data: { user: User }) => void;
  /** Apaga o cookie no servidor e esvazia o store. */
  logout: () => Promise<void> | void;
  setUser: (user: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
}

/**
 * A sessão não mora mais no navegador: o token vive num cookie httpOnly e é o
 * servidor quem o lê a cada requisição (`usuarioDaSessao`). Este store guarda
 * só o perfil para a UI, e é preenchido pela query `getSessaoAtualFn` montada
 * em `src/routes/__root.tsx`. Sem `persist`, sem `accessToken`, sem localStorage.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  initialized: false,
  login: (data) =>
    set({ user: data.user, isAuthenticated: true, isLoading: false }),
  logout: async () => {
    try {
      const { logoutFn } = await import("@/lib/auth.functions");
      await logoutFn({ data: {} });
    } catch {
      /* o cookie pode já ter expirado; o store é limpo mesmo assim */
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
  setUser: (user) =>
    set((state) => ({ user: state.user ? { ...state.user, ...user } : state.user })),
  setLoading: (loading) => set({ isLoading: loading }),
}));

/** Hook para facilitar o uso do store de autenticação */
export function useAuth() {
  const store = useAuthStore();
  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    login: store.login,
    setUser: store.setUser,
    logout: store.logout,
    initialized: store.initialized,
  };
}
