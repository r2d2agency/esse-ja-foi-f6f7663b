import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/hooks/use-auth";
import { loginWithPassword } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { LogoEsf } from "@/components/shared/LogoEsf";
import heroCar from "@/assets/hero-car.jpg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — ESSE JÁ FOI" },
      {
        name: "description",
        content: "Entre na sua conta ESSE JÁ FOI para acompanhar seus veículos e suas negociações.",
      },
      { property: "og:title", content: "Bem-vindo de volta — ESSE JÁ FOI" },
      { property: "og:description", content: "Acompanhe seus veículos e suas negociações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [identificador, setIdentificador] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valor = identificador.trim();
    if (!valor.includes("@")) {
      setErro("Por enquanto o acesso é feito com o seu e-mail.");
      return;
    }
    setErro("");
    setLoading(true);
    try {
      const result = await loginWithPassword({ data: { email: valor, password } });
      if (!result.ok) {
        setErro("E-mail ou senha incorretos.");
        return;
      }

      const { user, accessToken } = result;
      login({
        user: { id: user.id, nome: user.nome, email: user.email, role: user.role as any },
        accessToken,
        refreshToken: accessToken,
      });
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", accessToken);
      toast.success(`Bem-vindo, ${user.nome}!`);

      switch (user.role) {
        case "admin":
        case "operacao":
          navigate({ to: "/admin" });
          break;
        case "vistoriador":
          navigate({ to: "/vistoriador" });
          break;
        case "comprador":
          navigate({ to: "/comprador" });
          break;
        case "vendedor":
          navigate({ to: "/vendedor" });
          break;
        default:
          navigate({ to: "/" });
      }
    } catch {
      setErro("Não foi possível entrar agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1fr_0.9fr]">
      <div className="flex flex-col px-6 py-10 lg:px-16 lg:py-14">
        <LogoEsf height={32} className="justify-center lg:justify-start" />

        <div className="mx-auto mt-16 w-full max-w-md lg:mt-28">
          <h1 className="text-3xl font-black leading-tight tracking-tight">Bem-vindo de volta</h1>
          <p className="mt-3 text-slate-500">Entre para acompanhar seus veículos e suas negociações.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Input
              required
              placeholder="CPF ou e-mail"
              aria-label="CPF ou e-mail"
              className="h-14 rounded-xl text-base"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
            />
            <Input
              required
              type="password"
              placeholder="Senha"
              aria-label="Senha"
              className="h-14 rounded-xl text-base"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {erro && <p className="text-sm text-rose-600">{erro}</p>}

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <Checkbox defaultChecked /> Lembrar meu acesso
              </label>
              <Link to="/esqueci-minha-senha" className="text-sm text-teal-700 hover:underline">
                Esqueci minha senha
              </Link>
            </div>

            <Button
              disabled={loading}
              className="h-14 w-full rounded-xl bg-teal-700 text-base font-bold text-white transition-colors hover:bg-teal-800"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            <p>Ainda não possui conta?</p>
            <div className="mt-2 flex justify-center gap-4">
              <Link to="/cadastro" className="font-semibold text-teal-700 underline-offset-4 hover:underline">
                Vendedor
              </Link>
              <span className="text-slate-300">|</span>
              <Link to="/comprador/cadastro" className="font-semibold text-teal-700 underline-offset-4 hover:underline">
                Comprador
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="relative hidden lg:block">
        <img src={heroCar} alt="Veículo premium" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-slate-950/45" />
      </div>
    </div>
  );
}
