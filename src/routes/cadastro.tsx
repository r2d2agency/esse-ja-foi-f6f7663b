import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { formatCPF, formatPhone } from "@/lib/utils";
import { isValidCPF, formatPlaca } from "@/lib/validators";
import { LogoEsf } from "@/components/shared/LogoEsf";
import heroCar from "@/assets/hero-car.jpg";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta de vendedor — ESSE JÁ FOI" },
      {
        name: "description",
        content:
          "Crie sua conta para acompanhar todo o processo de avaliação e venda do seu veículo na plataforma ESSE JÁ FOI.",
      },
      { property: "og:title", content: "Comece a vender seu carro — ESSE JÁ FOI" },
      { property: "og:description", content: "Cadastro rápido, sem compromisso e com acompanhamento completo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CriarConta,
});

type Erros = Partial<Record<"nome" | "cpf" | "whatsapp" | "email" | "password" | "confirm" | "termos", string>>;

function CriarConta() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [etapa, setEtapa] = useState<"form" | "codigo" | "sucesso">("form");
  const [placa, setPlaca] = useState("");
  const [loading, setLoading] = useState(false);
  const [erros, setErros] = useState<Erros>({});
  const [termos, setTermos] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [contador, setContador] = useState(30);
  const [sessao, setSessao] = useState<{ user: any; accessToken: string } | null>(null);
  const [form, setForm] = useState({
    nome: "",
    cpf: "",
    whatsapp: "",
    email: "",
    password: "",
    confirm: "",
  });

  useEffect(() => {
    const saved = sessionStorage.getItem("ejf_placa");
    if (saved) setPlaca(saved);
  }, []);

  useEffect(() => {
    if (etapa !== "codigo" || contador <= 0) return;
    const t = setTimeout(() => setContador((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [etapa, contador]);

  const senhaOk = {
    tamanho: form.password.length >= 8,
    letra: /[a-zA-Z]/.test(form.password),
    numero: /\d/.test(form.password),
  };

  const validar = () => {
    const e: Erros = {};
    if (form.nome.trim().split(" ").length < 2) e.nome = "Informe seu nome completo.";
    if (!isValidCPF(form.cpf)) e.cpf = "Informe um CPF válido.";
    if (form.whatsapp.replace(/\D/g, "").length < 10) e.whatsapp = "Informe um WhatsApp válido.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = "Informe um e-mail válido.";
    if (!senhaOk.tamanho || !senhaOk.letra || !senhaOk.numero)
      e.password = "A senha precisa ter 8 caracteres, uma letra e um número.";
    if (form.confirm !== form.password) e.confirm = "As senhas não são iguais.";
    if (!termos) e.termos = "É preciso aceitar os termos para continuar.";
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validar()) return;
    setLoading(true);
    try {
      const { cadastrarVendedorFn } = await import("@/lib/vendedor.functions");
      const result = await cadastrarVendedorFn({
        data: {
          nome: form.nome,
          email: form.email,
          password: form.password,
          whatsapp: form.whatsapp,
          cpf: form.cpf,
          cep: null,
          endereco: "",
          cidade: "",
          uf: "",
        },
      });

      if (!result.ok) {
        toast.error(result.message || "Não foi possível criar sua conta. Tente novamente.");
        return;
      }

      setSessao({ user: result.user, accessToken: result.accessToken });
      if (placa) sessionStorage.setItem("ejf_placa", placa);
      setContador(30);
      setEtapa("codigo");
    } catch {
      toast.error("Não foi possível criar sua conta agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  };

  const confirmarCodigo = async () => {
    if (codigo.replace(/\D/g, "").length !== 6) {
      toast.error("Informe os 6 dígitos do código.");
      return;
    }
    if (!sessao) return;
    
    setLoading(true);
    try {
      const { validarOTPCadastroFn } = await import("@/lib/vendedor.functions");
      const res = await validarOTPCadastroFn({ data: { email: form.email, code: codigo } });
      
      if (!res.ok) {
        toast.error("Código inválido ou expirado.");
        return;
      }

      const { user, accessToken } = sessao;
      login({
        user: { id: user.id, nome: user.nome, email: user.email, role: user.role as any },
        accessToken,
        refreshToken: accessToken,
      });
      setEtapa("sucesso");
      setTimeout(() => navigate({ to: "/vendedor/boas-vindas" }), 1200);
    } catch (err) {
      toast.error("Erro ao validar código.");
    } finally {
      setLoading(false);
    }
  };

  const reenviarCodigo = async () => {
    setLoading(true);
    try {
      const { resenderOTPCadastroFn } = await import("@/lib/vendedor.functions");
      const res = await resenderOTPCadastroFn({ data: { email: form.email } });
      if (res.ok) {
        setContador(30);
        toast.success("Enviamos um novo código para o seu e-mail.");
      } else {
        toast.error(res.message || "Erro ao reenviar código.");
      }
    } catch (err) {
      toast.error("Erro ao reenviar código.");
    } finally {
      setLoading(false);
    }
  };


  const campo = (
    key: keyof typeof form,
    placeholder: string,
    props: React.ComponentProps<typeof Input> = {},
    mask?: (v: string) => string
  ) => (
    <div>
      <Input
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-14 rounded-xl border-slate-200 text-base"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: mask ? mask(e.target.value) : e.target.value })}
        {...props}
      />
      {erros[key as keyof Erros] && (
        <p className="mt-1.5 text-sm text-rose-600">{erros[key as keyof Erros]}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[1fr_0.9fr]">
      <div className="flex flex-col px-6 py-10 lg:px-16 lg:py-14">
        <LogoEsf height={32} className="justify-center lg:justify-start" />

        <div className="mx-auto mt-10 w-full max-w-md lg:mt-16">
          {etapa === "form" && (
            <>
              <h1 className="text-3xl font-black leading-tight tracking-tight text-slate-900">
                Comece a vender seu carro
              </h1>
              <p className="mt-3 text-slate-500">
                Crie sua conta para acompanhar todo o processo de avaliação e venda do seu veículo.
              </p>

              {placa ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Veículo informado
                  </p>
                  <p className="mt-1 text-lg font-bold uppercase tracking-[0.2em] text-slate-900">{placa}</p>
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                {campo("nome", "Nome completo")}
                {campo("cpf", "CPF", { inputMode: "numeric" }, formatCPF)}
                {campo("whatsapp", "WhatsApp", { inputMode: "tel" }, formatPhone)}
                {campo("email", "E-mail", { type: "email" })}
                {campo("password", "Senha", { type: "password" })}
                <ul className="space-y-1 text-xs text-slate-500">
                  <li className={senhaOk.tamanho ? "text-teal-700" : ""}>• mínimo de 8 caracteres</li>
                  <li className={senhaOk.letra ? "text-teal-700" : ""}>• pelo menos uma letra</li>
                  <li className={senhaOk.numero ? "text-teal-700" : ""}>• pelo menos um número</li>
                </ul>
                {campo("confirm", "Confirmar senha", { type: "password" })}

                {!placa && (
                  <Input
                    placeholder="Placa do veículo (opcional)"
                    aria-label="Placa do veículo"
                    className="h-14 rounded-xl border-slate-200 text-base uppercase"
                    value={placa}
                    onChange={(e) => setPlaca(formatPlaca(e.target.value))}
                  />
                )}

                <div className="flex items-start gap-3 pt-2">
                  <Checkbox
                    id="termos"
                    checked={termos}
                    onCheckedChange={(v) => setTermos(Boolean(v))}
                    className="mt-1"
                  />
                  <label htmlFor="termos" className="text-sm leading-relaxed text-slate-600">
                    Li e aceito os Termos de Uso e a Política de Privacidade.
                  </label>
                </div>
                {erros.termos && <p className="text-sm text-rose-600">{erros.termos}</p>}

                <Button
                  disabled={loading}
                  className="h-14 w-full rounded-xl bg-teal-700 text-base font-bold text-white transition-colors hover:bg-teal-800"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar minha conta
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                Já possui cadastro?{" "}
                <Link to="/login" className="font-semibold text-teal-700 underline-offset-4 hover:underline">
                  Entrar
                </Link>
              </p>
            </>
          )}

          {etapa === "codigo" && (
            <div className="animate-in fade-in duration-300">
              <h1 className="text-3xl font-black leading-tight tracking-tight">Confirme seu e-mail</h1>
              <p className="mt-3 text-slate-500">
                Enviamos um código para <strong className="text-slate-800">{form.email}</strong>.
              </p>


              <Input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                aria-label="Código de 6 dígitos"
                className="mt-8 h-16 rounded-xl text-center text-2xl font-bold tracking-[0.6em]"
              />

              <Button
                disabled={loading}
                onClick={confirmarCodigo}
                className="mt-5 h-14 w-full rounded-xl bg-teal-700 text-base font-bold text-white hover:bg-teal-800"
              >
                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Confirmar código"}
              </Button>

              <button
                type="button"
                disabled={contador > 0 || loading}
                onClick={reenviarCodigo}
                className="mt-5 w-full text-sm text-slate-500 disabled:opacity-60"
              >
                {contador > 0 ? `Reenviar código em ${contador}s` : "Reenviar código"}
              </button>

            </div>
          )}

          {etapa === "sucesso" && (
            <div className="animate-in fade-in zoom-in-95 py-20 text-center duration-300">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-teal-50 text-3xl text-teal-700">
                ✓
              </div>
              <p className="mt-6 text-xl font-bold text-slate-900">Conta criada com sucesso.</p>
              <p className="mt-2 text-slate-500">Levando você para o seu painel...</p>
            </div>
          )}
        </div>
      </div>

      <div className="relative hidden lg:block">
        <img src={heroCar} alt="Carro em avaliação" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-slate-950/45" />
        <div className="absolute bottom-14 left-12 right-12 text-white">
          <p className="text-2xl font-black leading-tight">
            Você cadastra seu carro. Nós encontramos quem está disposto a pagar por ele.
          </p>
        </div>
      </div>
    </div>
  );
}
