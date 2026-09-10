import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ArrowLeft, Mail, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "sonner";
import { solicitarResetSenha, validarOTPResetFn, resetarSenhaFinalFn } from "@/lib/auth.functions";

export const Route = createFileRoute("/esqueci-minha-senha")({
  component: EsqueciSenhaPage,
});

function EsqueciSenhaPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleSolicitar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await solicitarResetSenha({ data: { email } });
      if (res.ok) {
        toast.success("Se o e-mail existir, você receberá um código em instantes.");
        setStep(2);
      } else {
        toast.error(res.message || "Erro ao solicitar recuperação.");
      }
    } catch (err) {
      toast.error("Erro na comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  async function handleValidarOTP(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await validarOTPResetFn({ data: { email, code } });
      if (res.ok) {
        setStep(3);
      } else {
        toast.error("Código inválido ou expirado.");
      }
    } catch (err) {
      toast.error("Erro ao validar código.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetFinal(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("As senhas não conferem.");
      return;
    }
    setLoading(true);
    try {
      const res = await resetarSenhaFinalFn({ data: { email, code, newPassword: password } });
      if (res.ok) {
        toast.success("Senha alterada com sucesso!");
        // Redirecionamento via link no final
        setStep(1); 
        setEmail("");
        setCode("");
        setPassword("");
        window.location.href = "/login";
      } else {
        toast.error(res.message || "Erro ao redefinir senha.");
      }
    } catch (err) {
      toast.error("Erro ao redefinir senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-8">
          <Link to="/login" className="inline-flex items-center text-sm text-slate-500 hover:text-teal-700 mb-8 transition-colors">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar para o login
          </Link>

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Recuperar senha</h1>
                <p className="text-slate-500 mt-2">Informe seu e-mail cadastrado para receber um código de verificação.</p>
              </div>
              <form onSubmit={handleSolicitar} className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input 
                      required 
                      type="email" 
                      placeholder="seu@email.com" 
                      className="h-14 pl-12 rounded-xl"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <Button disabled={loading} className="w-full h-14 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-lg">
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Enviar código"}
                </Button>
              </form>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Verifique seu e-mail</h1>
                <p className="text-slate-500 mt-2">Enviamos um código de 6 dígitos para <strong>{email}</strong>.</p>
              </div>
              <form onSubmit={handleValidarOTP} className="space-y-4">
                <div className="space-y-2 text-center">
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input 
                      required 
                      placeholder="000000" 
                      maxLength={6}
                      className="h-16 text-center text-2xl font-bold tracking-[0.5em] rounded-xl pl-12"
                      value={code}
                      onChange={e => setCode(e.target.value)}
                    />
                  </div>
                </div>
                <Button disabled={loading} className="w-full h-14 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-lg">
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Validar código"}
                </Button>
                <button 
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full text-center text-sm text-slate-500 hover:underline"
                >
                  Não recebeu? Tentar outro e-mail
                </button>
              </form>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Nova senha</h1>
                <p className="text-slate-500 mt-2">Crie uma senha forte para proteger sua conta.</p>
              </div>
              <form onSubmit={handleResetFinal} className="space-y-4">
                <PasswordInput
                  required
                  placeholder="Nova senha"
                  className="h-14 rounded-xl"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <PasswordInput
                  required
                  placeholder="Confirme a nova senha"
                  className="h-14 rounded-xl"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
                <Button disabled={loading} className="w-full h-14 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-lg">
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Redefinir senha"}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
