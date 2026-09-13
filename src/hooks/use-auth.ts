import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "admin" | "operacao" | "vistoriador" | "comprador" | "vendedor";

interface User {
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
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
   isLoading: boolean;
   initialized: boolean;
  login: (data: { user: User; accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  setUser: (user: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
       isLoading: true,
       initialized: false,
      login: (data) =>
        set({
          user: data.user,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
          isLoading: false,
        }),
      setUser: (user) =>
        set((state) => ({ user: state.user ? { ...state.user, ...user } : state.user })),
      logout: () => {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },
      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: "auth-storage",
      onRehydrateStorage: () => (state) => {
        if (state) state.initialized = true;
      },
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

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
    initialized: store.initialized
  };
}
