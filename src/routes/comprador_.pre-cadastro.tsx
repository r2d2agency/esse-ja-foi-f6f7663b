import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, FileSignature, ShieldCheck, Search, Info } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { criarPreCadastroPublicoFn } from "@/lib/comprador-pre-cadastro.functions";
import { getTermoVigenteFn } from "@/lib/termos.functions";
import { buscarCep } from "@/lib/viacep";
import { maskCep, maskDocumento, maskTelefone } from "@/lib/brasil";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LogoEsf } from "@/components/shared/LogoEsf";

export const Route = createFileRoute("/comprador_/pre-cadastro")({
  head: () => ({
    meta: [
      { title: "Pré-cadastro de comprador — ESSE JÁ FOI" },
      {
        name: "description",
        content:
          "Cadastre sua empresa em poucos passos, aceite o termo de uso e acompanhe os veículos e os lances da ESSE JÁ FOI.",
      },
      { property: "og:title", content: "Pré-cadastro de comprador — ESSE JÁ FOI" },
      {
        property: "og:description",
        content: "Cadastre sua empresa, aceite o termo e acompanhe os lances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreCadastroComprador,
});

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR",
  "PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

type Form = {
  razao_social: string;
  cnpj: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  responsavel_nome: string;
  responsavel_cpf: string;
  responsavel_whatsapp: string;
  email: string;
  senha: string;
  confirmar: string;
  assinatura: string;
};

const vazio: Form = {
  razao_social: "", cnpj: "", cep: "", endereco: "", numero: "", complemento: "",
  bairro: "", cidade: "", uf: "", responsavel_nome: "", responsavel_cpf: "",
  responsavel_whatsapp: "", email: "", senha: "", confirmar: "", assinatura: "",
};

function PreCadastroComprador() {
  const navigate = useNavigate();
  const { user, isAuthenticated, initialized, login } = useAuth();
  const [f, setF] = useState<Form>(vazio);
  const [concorda, setConcorda] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [termo, setTermo] = useState<any>(null);

  // Já logado como comprador: não faz sentido mostrar o formulário de novo.
  useEffect(() => {
    if (initialized && isAuthenticated && user?.role === "comprador") {
      navigate({ to: "/comprador", replace: true });
    }
  }, [initialized, isAuthenticated, user, navigate]);

  useEffect(() => {
    getTermoVigenteFn({ data: { tipo: "COMPRADOR" } })
      .then((r: any) => setTermo(r?.ok ? r.data : null))
      .catch(() => setTermo(null));
  }, []);

  const set = (k: keyof Form) => (e: any) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function aoBuscarCep() {
    const cep = f.cep.replace(/\D/g, "");
    if (cep.length !== 8) {
      toast.error("Informe um CEP válido com 8 dígitos.");
      return;
    }
    setBuscandoCep(true);
    const r = await buscarCep(cep);
    setBuscandoCep(false);
    if (!r) {
      toast.error("Não foi possível encontrar esse CEP.");
      return;
    }
    setF((p) => ({
      ...p,
      endereco: p.endereco || r.logradouro || "",
      bairro: p.bairro || r.bairro || "",
      cidade: p.cidade || r.cidade || "",
      uf: p.uf || r.uf || "",
    }));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (f.senha.length < 8) {
      toast.error("A senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (f.senha !== f.confirmar) {
      toast.error("As senhas não conferem.");
      return;
    }
    if (!concorda) {
      toast.error("Marque a confirmação de leitura do termo.");
      return;
    }
    if (f.assinatura.trim().length < 3) {
      toast.error("Digite seu nome completo como assinatura.");
      return;
    }

    setSalvando(true);
    try {
      const res: any = await criarPreCadastroPublicoFn({
        data: {
          razao_social: f.razao_social.trim(),
          cnpj: f.cnpj,
          cep: f.cep,
          endereco: f.endereco.trim(),
          numero: f.numero,
          complemento: f.complemento,
          bairro: f.bairro,
          cidade: f.cidade.trim(),
          uf: f.uf.trim().toUpperCase(),
          responsavel_nome: f.responsavel_nome.trim(),
          responsavel_cpf: f.responsavel_cpf,
          responsavel_whatsapp: f.responsavel_whatsapp,
          email: f.email.trim(),
          senha: f.senha,
          assinatura: f.assinatura.trim(),
          aceiteTermo: true,
        },
      });

      if (!res?.ok) {
        toast.error(res?.message || "Não foi possível criar o cadastro.");
        return;
      }

      // O servidor já gravou o cookie httpOnly de sessão; aqui só atualizamos a UI.
      login({
        user: {
          id: res.user.id,
          nome: res.user.nome,
          email: res.user.email,
          role: res.user.role as any,
        },
      });
      toast.success("Cadastro criado! Você já pode acompanhar os veículos e os lances.");
      if (res?.avisoGrupo) toast(res.avisoGrupo, { duration: 8000 });
      navigate({ to: "/veiculos" });
    } catch {
      toast.error("Não foi possível criar o cadastro agora. Tente novamente em instantes.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex justify-center">
          <LogoEsf height={56} />
        </div>

        <div className="mt-6 text-center">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Pré-cadastro de comprador
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-slate-500">
            Cadastre sua empresa em poucos passos. Com o pré-cadastro você já acompanha os
            veículos e os lances da plataforma; para ofertar, conclua o cadastro completo.
          </p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
          <p className="leading-relaxed">
            <strong>Acesso parcial liberado na hora:</strong> você vê os veículos e acompanha os
            lances. Para dar lances, complete o cadastro e aguarde a análise da nossa equipe.{" "}
            <Link
              to="/comprador/cadastro"
              className="font-bold underline underline-offset-4 hover:text-teal-900"
            >
              Concluir cadastro
            </Link>
          </p>
        </div>

        <form onSubmit={enviar} className="mt-6 space-y-6">
          {/* EMPRESA */}
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Dados da empresa</h2>
            <div className="space-y-2">
              <Label>Razão social</Label>
              <Input
                required
                className="h-12"
                placeholder="Ex.: Auto Peças Movimento Ltda"
                value={f.razao_social}
                onChange={set("razao_social")}
              />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input
                required
                inputMode="numeric"
                className="h-12"
                placeholder="00.000.000/0000-00"
                value={f.cnpj}
                onChange={(e) => setF((p) => ({ ...p, cnpj: maskDocumento(e.target.value) }))}
              />
            </div>
          </section>

          {/* ENDEREÇO */}
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Endereço</h2>
            <div className="space-y-2">
              <Label>CEP</Label>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  className="h-12"
                  placeholder="00000-000"
                  value={f.cep}
                  onChange={(e) => setF((p) => ({ ...p, cep: maskCep(e.target.value) }))}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={aoBuscarCep}
                  disabled={buscandoCep}
                  className="h-12 shrink-0 rounded-xl px-4"
                >
                  {buscandoCep ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="mr-1.5 h-4 w-4" /> Buscar
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input
                required
                className="h-12"
                placeholder="Rua, avenida..."
                value={f.endereco}
                onChange={set("endereco")}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Número</Label>
                <Input className="h-12" value={f.numero} onChange={set("numero")} />
              </div>
              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input className="h-12" value={f.complemento} onChange={set("complemento")} />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input className="h-12" value={f.bairro} onChange={set("bairro")} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input
                  required
                  className="h-12"
                  value={f.cidade}
                  onChange={set("cidade")}
                />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <select
                  required
                  value={f.uf}
                  onChange={set("uf")}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900"
                >
                  <option value="">UF</option>
                  {UFS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* RESPONSÁVEL */}
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Contato responsável</h2>
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input
                required
                className="h-12"
                placeholder="Quem responde pela empresa"
                value={f.responsavel_nome}
                onChange={set("responsavel_nome")}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>CPF (opcional)</Label>
                <Input
                  inputMode="numeric"
                  className="h-12"
                  placeholder="000.000.000-00"
                  value={f.responsavel_cpf}
                  onChange={(e) =>
                    setF((p) => ({ ...p, responsavel_cpf: maskDocumento(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input
                  required
                  inputMode="tel"
                  className="h-12"
                  placeholder="(00) 00000-0000"
                  value={f.responsavel_whatsapp}
                  onChange={(e) =>
                    setF((p) => ({ ...p, responsavel_whatsapp: maskTelefone(e.target.value) }))
                  }
                />
              </div>
            </div>
          </section>

          {/* CONTA */}
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Seu acesso</h2>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                required
                type="email"
                className="h-12"
                placeholder="voce@empresa.com.br"
                value={f.email}
                onChange={set("email")}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Senha</Label>
                <PasswordInput
                  required
                  className="h-12"
                  placeholder="Mínimo de 8 caracteres"
                  value={f.senha}
                  onChange={set("senha")}
                />
              </div>
              <div className="space-y-2">
                <Label>Confirmar senha</Label>
                <PasswordInput
                  required
                  className="h-12"
                  value={f.confirmar}
                  onChange={set("confirmar")}
                />
              </div>
            </div>
          </section>

          {/* TERMO */}
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <FileSignature className="h-5 w-5 text-teal-700" />
              {termo?.titulo || "Termo de uso do comprador"}
            </div>

            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {termo?.conteudo || "Carregando o termo de uso..."}
            </div>

            <div className="space-y-2">
              <Label>Assinatura digital (digite seu nome completo)</Label>
              <Input
                className="h-12 font-semibold"
                placeholder={f.responsavel_nome || "Seu nome completo"}
                value={f.assinatura}
                onChange={set("assinatura")}
              />
            </div>

            <label className="flex items-start gap-3 text-sm text-slate-600">
              <Checkbox
                checked={concorda}
                onCheckedChange={(v: boolean | "indeterminate") => setConcorda(v === true)}
              />
              <span>
                Li e concordo com o termo acima. Estou ciente de que este aceite registra data,
                hora, endereço IP e navegador utilizados.
              </span>
            </label>

            <div className="flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-xs font-medium text-teal-800">
              <ShieldCheck className="h-4 w-4" /> Versão {termo?.versao || "—"} • assinatura
              eletrônica com registro de auditoria.
            </div>
          </section>

          <Button
            type="submit"
            disabled={salvando || !concorda}
            className="h-14 w-full rounded-xl bg-teal-700 text-base font-bold text-white transition-colors hover:bg-teal-800"
          >
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar conta e ver os veículos
          </Button>

          <p className="text-center text-sm text-slate-500">
            Já tem cadastro?{" "}
            <Link to="/login" className="font-semibold text-teal-700 hover:underline">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
