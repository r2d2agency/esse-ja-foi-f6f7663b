import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowRight, ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { formatCPF, formatPhone, cn } from "@/lib/utils";
import { buscarCep } from "@/lib/viacep";
import { FileUpload } from "@/components/onboarding/FileUpload";
import {
  cadastrarCompradorFn,
  salvarEtapaCompradorFn,
  getPerfilCompradorFn,
  enviarCadastroCompradorFn,
  enviarDocumentoCompradorFn,
} from "@/lib/comprador.functions";

export const Route = createFileRoute("/comprador/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta de comprador — ESSE JÁ FOI" },
      {
        name: "description",
        content:
          "Cadastre-se em poucos passos para acompanhar leilões, favoritar veículos e dar lances na plataforma Esse Já Foi.",
      },
      { property: "og:title", content: "Criar conta de comprador — ESSE JÁ FOI" },
      {
        property: "og:description",
        content: "Cadastro rápido para participar dos leilões de veículos vistoriados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CadastroComprador,
});

const ETAPAS = ["Conta", "Dados", "Endereço", "Documentos", "Revisão"];

function CadastroComprador() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  const [etapa, setEtapa] = useState(1);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState<{ percentual: number; pendencias: string[] } | null>(
    null,
  );

  const [form, setForm] = useState<any>({
    tipo: "PF",
    nome: "",
    email: "",
    password: "",
    confirm: "",
    whatsapp: "",
    cpf: "",
    cnpj: "",
    razao_social: "",
    nome_fantasia: "",
    inscricao_estadual: "",
    responsavel_nome: "",
    responsavel_cpf: "",
    responsavel_whatsapp: "",
    responsavel_cargo: "",
    cep: "",
    endereco: "",
    numero: "",
    bairro: "",
    cidade: "",
    uf: "",
    documento_cnh_url: "",
    documento_selfie_url: "",
    documento_comprovante_url: "",
    documento_contrato_social_url: "",
  });


  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      const res: any = await getPerfilCompradorFn({ data: { token: getSessionToken() } });
      if (res?.ok) {
        setForm((f: any) => ({ ...f, ...limparNulos(res.perfil), tipo: res.perfil.tipo_pessoa || "PF" }));
        setProgresso(res.progresso);
        setEtapa((e) => Math.max(e, Math.min(res.perfil.etapa_cadastro || 2, 5)));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const pj = form.tipo === "PJ";

  async function criarConta() {
    if (form.password !== form.confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setLoading(true);
    try {
      const res: any = await cadastrarCompradorFn({
        data: {
          tipo: form.tipo,
          nome: pj ? form.razao_social || form.nome : form.nome,
          email: form.email,
          password: form.password,
          whatsapp: form.whatsapp,
          cpf: form.cpf,
          cnpj: form.cnpj,
        },
      });
      if (!res?.ok) {
        toast.error(res?.message || "Erro ao criar conta.");
        return;
      }
      login({
        user: {
          id: res.user.id,
          nome: res.user.nome,
          email: res.user.email,
          role: res.user.role,
          tipo_pessoa: form.tipo,
        },
        accessToken: res.accessToken,
        refreshToken: res.accessToken,
      });
      localStorage.setItem("accessToken", res.accessToken);
      toast.success("Conta criada! Vamos completar seu cadastro.");
      setEtapa(2);
    } catch {
      toast.error("Erro técnico ao criar conta.");
    } finally {
      setLoading(false);
    }
  }

  async function salvarEtapa(proxima: number, dados: Record<string, any>) {
    setLoading(true);
    try {
      const res: any = await salvarEtapaCompradorFn({
        data: { token: getSessionToken(), etapa: proxima, dados },
      });
      if (!res?.ok) {
        toast.error(res?.message || "Não foi possível salvar.");
        return;
      }
      setProgresso(res.progresso);
      setEtapa(proxima);
    } finally {
      setLoading(false);
    }
  }

  async function concluir() {
    setLoading(true);
    try {
      const res: any = await enviarCadastroCompradorFn({ data: { token: getSessionToken() } });
      if (!res?.ok) {
        if (res?.progresso) setProgresso(res.progresso);
        toast.error(res?.message || "Cadastro incompleto.");
        return;
      }
      toast.success("Cadastro enviado para análise!");
      navigate({ to: "/comprador" });
    } finally {
      setLoading(false);
    }
  }

  async function subirDoc(tipo: string, campo: string, url: string) {
    setForm((f: any) => ({ ...f, [campo]: url }));
    await enviarDocumentoCompradorFn({ data: { token: getSessionToken(), tipo, url } });
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-5 py-4">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <Link to="/" className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">
            Esse<span className="text-teal-700">JáFoi</span>
          </Link>
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Etapa {etapa} de {ETAPAS.length}
          </span>
        </div>
        <div className="mx-auto mt-3 flex max-w-xl gap-1.5">
          {ETAPAS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i + 1 <= etapa ? "bg-teal-600" : "bg-slate-200",
              )}
            />
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 py-8">
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-950">
          {ETAPAS[etapa - 1]}
        </h1>

        {etapa === 1 && (
          <div className="mt-6 space-y-4">
            <div className="flex gap-2">
              {(["PF", "PJ"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, tipo: t })}
                  className={cn(
                    "h-16 flex-1 rounded-2xl border-2 font-bold transition-all",
                    form.tipo === t
                      ? "border-teal-600 bg-teal-50 text-teal-900"
                      : "border-slate-200 bg-white text-slate-500",
                  )}
                >
                  {t === "PF" ? "Pessoa Física" : "Empresa (PJ)"}
                </button>
              ))}
            </div>
            <Input
              placeholder={pj ? "Razão Social" : "Nome completo"}
              className="h-14 rounded-xl"
              value={pj ? form.razao_social : form.nome}
              onChange={(e) =>
                setForm({ ...form, [pj ? "razao_social" : "nome"]: e.target.value })
              }
            />
            <Input
              placeholder="E-mail"
              type="email"
              className="h-14 rounded-xl"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="WhatsApp"
              className="h-14 rounded-xl"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: formatPhone(e.target.value) })}
            />
            <Input
              placeholder="Senha"
              type="password"
              className="h-14 rounded-xl"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <Input
              placeholder="Confirmar senha"
              type="password"
              className="h-14 rounded-xl"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            />
            <Button
              disabled={loading}
              onClick={criarConta}
              className="h-14 w-full rounded-xl bg-teal-700 font-bold hover:bg-teal-800"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar conta
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <p className="text-center text-sm text-slate-500">
              Já possui cadastro?{" "}
              <Link to="/login" className="font-semibold text-teal-700 hover:underline">
                Entrar
              </Link>
            </p>
          </div>
        )}

        {etapa === 2 && (
          <div className="mt-6 space-y-4">
            {pj ? (
              <>
                <Input
                  placeholder="CNPJ"
                  className="h-14 rounded-xl"
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                />
                <Input
                  placeholder="Nome fantasia"
                  className="h-14 rounded-xl"
                  value={form.nome_fantasia}
                  onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                />
                <Input
                  placeholder="Inscrição estadual (opcional)"
                  className="h-14 rounded-xl"
                  value={form.inscricao_estadual}
                  onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })}
                />
                <div className="pt-2 text-xs font-black uppercase tracking-widest text-slate-400">
                  Responsável pela loja
                </div>
                <Input
                  placeholder="Nome do responsável"
                  className="h-14 rounded-xl"
                  value={form.responsavel_nome}
                  onChange={(e) => setForm({ ...form, responsavel_nome: e.target.value })}
                />
                <Input
                  placeholder="CPF do responsável"
                  className="h-14 rounded-xl"
                  value={form.responsavel_cpf}
                  onChange={(e) => setForm({ ...form, responsavel_cpf: formatCPF(e.target.value) })}
                />
                <Input
                  placeholder="WhatsApp do responsável"
                  className="h-14 rounded-xl"
                  value={form.responsavel_whatsapp}
                  onChange={(e) =>
                    setForm({ ...form, responsavel_whatsapp: formatPhone(e.target.value) })
                  }
                />
                <Input
                  placeholder="Cargo"
                  className="h-14 rounded-xl"
                  value={form.responsavel_cargo}
                  onChange={(e) => setForm({ ...form, responsavel_cargo: e.target.value })}
                />
              </>
            ) : (
              <>
                <Input
                  placeholder="Nome completo"
                  className="h-14 rounded-xl"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
                <Input
                  placeholder="CPF"
                  className="h-14 rounded-xl"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })}
                />
                <Input
                  placeholder="WhatsApp"
                  className="h-14 rounded-xl"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: formatPhone(e.target.value) })}
                />
              </>
            )}
            <NavBotoes
              loading={loading}
              onVoltar={() => setEtapa(1)}
              onAvancar={() =>
                salvarEtapa(3, {
                  tipo_pessoa: form.tipo,
                  nome: pj ? form.razao_social : form.nome,
                  cpf: form.cpf,
                  cnpj: form.cnpj,
                  whatsapp: form.whatsapp,
                  razao_social: form.razao_social,
                  nome_fantasia: form.nome_fantasia,
                  inscricao_estadual: form.inscricao_estadual,
                  responsavel_nome: form.responsavel_nome,
                  responsavel_cpf: form.responsavel_cpf,
                  responsavel_whatsapp: form.responsavel_whatsapp,
                  responsavel_cargo: form.responsavel_cargo,
                })
              }
            />
          </div>
        )}

        {etapa === 3 && (
          <div className="mt-6 space-y-4">
            <Input
              placeholder="CEP"
              className="h-14 rounded-xl"
              value={form.cep}
              onChange={async (e) => {
                const cep = e.target.value;
                setForm((f: any) => ({ ...f, cep }));
                if (cep.replace(/\D/g, "").length === 8) {
                  try {
                    const end: any = await buscarCep(cep);
                    if (end)
                      setForm((f: any) => ({
                        ...f,
                        endereco: end.logradouro || f.endereco,
                        bairro: end.bairro || f.bairro,
                        cidade: end.localidade || end.cidade || f.cidade,
                        uf: end.uf || f.uf,
                      }));
                  } catch {
                    /* ignora */
                  }
                }
              }}
            />
            <Input
              placeholder="Endereço"
              className="h-14 rounded-xl"
              value={form.endereco}
              onChange={(e) => setForm({ ...form, endereco: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Número"
                className="h-14 rounded-xl"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
              />
              <Input
                placeholder="Bairro"
                className="h-14 rounded-xl"
                value={form.bairro}
                onChange={(e) => setForm({ ...form, bairro: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <Input
                placeholder="Cidade"
                className="h-14 rounded-xl"
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
              />
              <Input
                placeholder="UF"
                className="h-14 rounded-xl"
                value={form.uf}
                onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase().slice(0, 2) })}
              />
            </div>
            <NavBotoes
              loading={loading}
              onVoltar={() => setEtapa(2)}
              onAvancar={() =>
                salvarEtapa(4, {
                  cep: form.cep,
                  endereco: form.endereco,
                  numero: form.numero,
                  bairro: form.bairro,
                  cidade: form.cidade,
                  uf: form.uf,
                })
              }
            />
          </div>
        )}

        {etapa === 4 && (
          <div className="mt-6 space-y-5">
            {pj ? (
              <FileUpload
                label="Contrato social"
                value={form.documento_contrato_social_url}
                onChange={(url: string | null) =>
                  subirDoc("CONTRATO_SOCIAL", "documento_contrato_social_url", url || "")
                }
              />
            ) : (
              <>
                <FileUpload
                  label="CNH ou RG"
                  value={form.documento_cnh_url}
                  onChange={(url: string | null) => subirDoc("CNH", "documento_cnh_url", url || "")}
                />
                <FileUpload
                  label="Selfie segurando o documento"
                  value={form.documento_selfie_url}
                  onChange={(url: string | null) => subirDoc("SELFIE", "documento_selfie_url", url || "")}
                />
              </>
            )}
            <FileUpload
              label="Comprovante de endereço"
              value={form.documento_comprovante_url}
              onChange={(url: string | null) => subirDoc("COMPROVANTE", "documento_comprovante_url", url || "")}
            />
            <NavBotoes
              loading={loading}
              onVoltar={() => setEtapa(3)}
              onAvancar={() => salvarEtapa(5, {})}
            />
          </div>
        )}

        {etapa === 5 && (
          <div className="mt-6 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Progresso
                </span>
                <span className="text-2xl font-black text-teal-700">
                  {progresso?.percentual ?? 0}%
                </span>
              </div>
              {progresso?.pendencias?.length ? (
                <ul className="mt-4 space-y-2">
                  {progresso.pendencias.map((p) => (
                    <li key={p} className="text-sm font-medium text-amber-700">
                      • Falta: {p}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 flex items-center gap-2 text-sm font-bold text-teal-700">
                  <Check className="h-4 w-4" /> Tudo pronto para enviar!
                </p>
              )}
            </div>

            <div className="rounded-3xl bg-slate-950 p-6 text-white">
              <ShieldCheck className="h-6 w-6 text-teal-400" />
              <p className="mt-3 text-sm text-slate-300">
                Após a aprovação você poderá ver valores, favoritar veículos, criar lembretes de
                início de leilão e dar lances.
              </p>
            </div>

            <NavBotoes
              loading={loading}
              onVoltar={() => setEtapa(4)}
              rotuloAvancar="Enviar para análise"
              onAvancar={concluir}
            />
            <Button variant="ghost" className="w-full" onClick={() => navigate({ to: "/veiculos" })}>
              Ver a vitrine agora
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function NavBotoes({
  loading,
  onVoltar,
  onAvancar,
  rotuloAvancar = "Continuar",
}: {
  loading: boolean;
  onVoltar: () => void;
  onAvancar: () => void;
  rotuloAvancar?: string;
}) {
  return (
    <div className="flex gap-3 pt-4">
      <Button variant="outline" className="h-14 rounded-xl px-5" onClick={onVoltar} type="button">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button
        disabled={loading}
        onClick={onAvancar}
        type="button"
        className="h-14 flex-1 rounded-xl bg-teal-700 font-bold hover:bg-teal-800"
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {rotuloAvancar}
      </Button>
    </div>
  );
}

function limparNulos(obj: any) {
  const out: any = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v !== null && v !== undefined) out[k] = v;
  });
  return out;
}

function getSessionToken() {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem("auth-storage");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.accessToken) return parsed.state.accessToken as string;
    }
  } catch {
    /* ignora */
  }
  return localStorage.getItem("accessToken") || "";
}
