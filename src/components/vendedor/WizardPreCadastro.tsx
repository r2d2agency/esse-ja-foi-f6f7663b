import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, MessageCircle, UserPlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/onboarding/FileUpload";
import { FormularioVeiculoCondicao, Campo } from "@/components/veiculo/FormularioVeiculoCondicao";
import { getSessionToken } from "@/lib/session";
import { criarVendedorInternoFn, reenviarSenhaTemporariaFn } from "@/lib/pre-cadastro.functions";
import { cadastrarMeuVeiculoFn } from "@/lib/vendedor.functions";
import { buscarCep } from "@/lib/viacep";
import { maskDocumento, maskTelefone, maskCep, maskData } from "@/lib/brasil";
import {
  FOTOS_VEICULO,
  CONDICAO_INICIAL,
  serializarCondicao,
  type CondicaoVeiculo,
} from "@/lib/veiculo-condicao";
import { cn } from "@/lib/utils";

type Etapa = 1 | 2 | 3 | 4;

const ETAPAS: { n: Etapa; label: string }[] = [
  { n: 1, label: "Dados do vendedor" },
  { n: 2, label: "Documentos" },
  { n: 3, label: "Veículo" },
  { n: 4, label: "Conclusão" },
];

export function WizardPreCadastro({ onConcluir }: { onConcluir?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [salvando, setSalvando] = useState(false);

  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [senha, setSenha] = useState<{ senha: string; emailEnviado: boolean; emailErro?: string | null } | null>(
    null,
  );
  const [veiculoId, setVeiculoId] = useState<string | null>(null);

  const [dados, setDados] = useState<Record<string, string>>({
    nome: "",
    email: "",
    tipo_pessoa: "PF",
    cpf: "",
    cnpj: "",
    rg: "",
    data_nascimento: "",
    whatsapp: "",
    telefone: "",
    cep: "",
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
  });

  const [docs, setDocs] = useState<Record<string, string | null>>({
    doc_cnh_frente: null,
    doc_cnh_verso: null,
    doc_comprovante: null,
    doc_selfie: null,
  });

  const [veiculo, setVeiculo] = useState<Record<string, string>>({
    placa: "",
    marca: "",
    modelo: "",
    versao: "",
    anoFabricacao: "",
    anoModelo: "",
    cor: "",
    km: "",
    cambio: "",
    combustivel: "",
    valorInteresse: "",
    cep: "",
    endereco: "",
    cidade: "",
    uf: "",
  });
  const [crlv, setCrlv] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Record<string, string | null>>(
    Object.fromEntries(FOTOS_VEICULO.map((f) => [f.id, null])),
  );
  const [condicao, setCondicao] = useState<CondicaoVeiculo>(CONDICAO_INICIAL);
  const setCondicaoCampo = (patch: Partial<CondicaoVeiculo>) =>
    setCondicao((c) => ({ ...c, ...patch }));

  function set(campo: string, valor: string) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  async function preencherCep(cep: string) {
    if (cep.replace(/\D/g, "").length !== 8) return;
    try {
      const r: any = await buscarCep(cep);
      if (!r) return;
      setDados((d) => ({
        ...d,
        endereco: r.logradouro || d.endereco,
        bairro: r.bairro || d.bairro,
        cidade: r.localidade || r.cidade || d.cidade,
        uf: r.uf || d.uf,
      }));
    } catch {
      /* silencioso */
    }
  }

  async function criarVendedor() {
    if (dados.nome.trim().length < 3) { toast.error("Informe o nome completo."); return; }
    if (!dados.email.includes("@")) { toast.error("Informe um e-mail válido."); return; }
    if (dados.tipo_pessoa === "PF" && !dados.cpf.trim())
      { toast.error("Informe o CPF do vendedor."); return; }
    if (!docs.doc_cnh_frente || !docs.doc_cnh_verso)
      { toast.error("Envie a CNH (frente e verso)."); return; }
    if (!docs.doc_comprovante) { toast.error("Envie o comprovante de residência."); return; }

    setSalvando(true);
    try {
      const res: any = await criarVendedorInternoFn({
        data: { token: getSessionToken(), ...dados, ...docs, enviarAcesso: false } as any,
      });
      if (!res?.ok) { toast.error(res?.message || "Não foi possível criar o vendedor."); return; }
      setPerfilId(res.perfilId);
      setSenha({ senha: res.senha, emailEnviado: false });
      toast.success("Pré-cadastro concluído. Agora cadastre o veículo.");
      setEtapa(3);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarVeiculo() {
    if (!perfilId) return;
    if (veiculo.placa.replace(/\W/g, "").length < 7) { toast.error("Informe a placa."); return; }
    if (veiculo.marca.trim().length < 2 || veiculo.modelo.trim().length < 2)
      { toast.error("Informe marca e modelo."); return; }

    setSalvando(true);
    try {
      const res: any = await cadastrarMeuVeiculoFn({
        data: {
          perfilId,
          id: veiculoId || undefined,
          placa: veiculo.placa.toUpperCase().replace(/\W/g, ""),
          marca: veiculo.marca,
          modelo: veiculo.modelo,
          versao: veiculo.versao || null,
          anoFabricacao: veiculo.anoFabricacao || undefined,
          anoModelo: veiculo.anoModelo || undefined,
          cor: veiculo.cor || null,
          cambio: veiculo.cambio || null,
          combustivel: veiculo.combustivel || null,
          km: veiculo.km ? Number(veiculo.km.replace(/\D/g, "")) : undefined,
          valorInteresse: veiculo.valorInteresse
            ? Number(veiculo.valorInteresse.replace(/\D/g, "")) / 100
            : undefined,
          cep: veiculo.cep || undefined,
          endereco: veiculo.endereco || undefined,
          cidade: veiculo.cidade || undefined,
          uf: veiculo.uf || undefined,
          documento_crlv_url: crlv,
          fotos: Object.values(fotos).filter(Boolean) as string[],
          observacoes: serializarCondicao(condicao),
          status: "AGUARDANDO_APROVACAO",
        } as any,
      });
      const id = res?.id || res?.data?.id;
      if (!id) { toast.error(res?.message || "Não foi possível salvar o veículo."); return; }
      setVeiculoId(id);
      toast.success("Veículo vinculado ao vendedor.");
      setEtapa(4);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar o veículo.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarAcesso() {
    if (!perfilId) return;
    setSalvando(true);
    try {
      const res: any = await reenviarSenhaTemporariaFn({ data: { perfilId } });
      if (!res?.ok) { toast.error(res?.message || "Não foi possível enviar o acesso."); return; }
      setSenha({ senha: res.senha, emailEnviado: !!res.emailEnviado, emailErro: res.emailErro ?? null });
      if (res.emailEnviado) toast.success("Acesso enviado por e-mail ao vendedor.");
      else
        toast.warning(
          res.emailErro
            ? `Senha gerada, mas o e-mail falhou: ${res.emailErro} — repasse manualmente.`
            : "Senha gerada, mas o e-mail falhou — repasse manualmente.",
        );
    } finally {
      setSalvando(false);
    }
  }

  function fechar() {
    setAberto(false);
    onConcluir?.();
    window.location.reload();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v: boolean) => (v ? setAberto(true) : fechar())}>
      <DialogTrigger asChild>
        <Button className="h-11 bg-teal-600 font-bold hover:bg-teal-700">
          <UserPlus className="mr-2 h-4 w-4" /> Pré-cadastro interno
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-black uppercase tracking-tight">
            Pré-cadastro completo de vendedor
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-widest">
          {ETAPAS.map((e) => (
            <span
              key={e.n}
              className={cn(
                "rounded-full px-3 py-1",
                etapa === e.n
                  ? "bg-teal-600 text-white"
                  : etapa > e.n
                    ? "bg-teal-50 text-teal-700"
                    : "bg-slate-100 text-slate-400",
              )}
            >
              {e.n}. {e.label}
            </span>
          ))}
        </div>

        {etapa === 1 && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {["PF", "PJ"].map((t) => (
                <Button
                  key={t}
                  variant={dados.tipo_pessoa === t ? "default" : "outline"}
                  className={cn("h-9", dados.tipo_pessoa === t && "bg-teal-600 hover:bg-teal-700")}
                  onClick={() => set("tipo_pessoa", t)}
                >
                  {t === "PF" ? "Pessoa física" : "Pessoa jurídica"}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Campo label="Nome completo / Razão social" valor={dados.nome} onChange={(v) => set("nome", v)} />
              <Campo label="E-mail" valor={dados.email} onChange={(v) => set("email", v)} />
              {dados.tipo_pessoa === "PF" ? (
                <>
                  <Campo label="CPF" valor={dados.cpf} onChange={(v) => set("cpf", maskDocumento(v))} placeholder="000.000.000-00" />
                  <Campo label="RG" valor={dados.rg} onChange={(v) => set("rg", v)} />
                  <Campo
                    label="Data de nascimento"
                    valor={dados.data_nascimento}
                    onChange={(v) => set("data_nascimento", maskData(v))}
                    placeholder="dd/mm/aaaa"
                  />
                </>
              ) : (
                <Campo label="CNPJ" valor={dados.cnpj} onChange={(v) => set("cnpj", maskDocumento(v))} placeholder="00.000.000/0000-00" />
              )}
              <Campo label="WhatsApp" valor={dados.whatsapp} onChange={(v) => set("whatsapp", maskTelefone(v))} placeholder="(00) 00000-0000" />
              <Campo label="Telefone (opcional)" valor={dados.telefone} onChange={(v) => set("telefone", maskTelefone(v))} placeholder="(00) 00000-0000" />
              <Campo
                label="CEP"
                valor={dados.cep}
                onChange={(v) => {
                  const cep = maskCep(v);
                  set("cep", cep);
                  void preencherCep(cep);
                }}
                placeholder="00000-000"
              />
              <Campo label="Endereço" valor={dados.endereco} onChange={(v) => set("endereco", v)} />
              <Campo label="Número" valor={dados.numero} onChange={(v) => set("numero", v)} />
              <Campo label="Complemento" valor={dados.complemento} onChange={(v) => set("complemento", v)} />
              <Campo label="Bairro" valor={dados.bairro} onChange={(v) => set("bairro", v)} />
              <Campo label="Cidade" valor={dados.cidade} onChange={(v) => set("cidade", v)} />
              <Campo
                label="UF"
                valor={dados.uf}
                onChange={(v) => set("uf", v.toUpperCase().slice(0, 2))}
              />
            </div>
            <Button
              className="h-12 w-full bg-teal-600 font-bold hover:bg-teal-700"
              onClick={() => setEtapa(2)}
            >
              Continuar para documentos
            </Button>
          </div>
        )}

        {etapa === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              O operador anexa os documentos do vendedor. Ao concluir, o cadastro já nasce validado
              e dispensa a análise de compliance no app.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FileUpload
                label="CNH — frente"
                value={docs.doc_cnh_frente}
                onChange={(u) => setDocs((d) => ({ ...d, doc_cnh_frente: u }))}
              />
              <FileUpload
                label="CNH — verso"
                value={docs.doc_cnh_verso}
                onChange={(u) => setDocs((d) => ({ ...d, doc_cnh_verso: u }))}
              />
              <FileUpload
                label="Comprovante de residência"
                value={docs.doc_comprovante}
                onChange={(u) => setDocs((d) => ({ ...d, doc_comprovante: u }))}
              />
              <FileUpload
                label="Selfie / foto do vendedor (opcional)"
                value={docs.doc_selfie}
                onChange={(u) => setDocs((d) => ({ ...d, doc_selfie: u }))}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="h-12 flex-1" onClick={() => setEtapa(1)}>
                Voltar
              </Button>
              <Button
                className="h-12 flex-[2] bg-teal-600 font-bold hover:bg-teal-700"
                onClick={criarVendedor}
                disabled={salvando}
              >
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar dados e continuar para o veículo
              </Button>
            </div>
          </div>
        )}

        {etapa === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Cadastro do veículo habilitado para <strong>{dados.nome}</strong>. O vendedor apenas
              assina o termo no final, com o resumo dos dados e do veículo.
            </p>
            <FormularioVeiculoCondicao
              veiculo={veiculo}
              setVeiculo={setVeiculo}
              condicao={condicao}
              setCondicaoCampo={setCondicaoCampo}
              crlv={crlv}
              setCrlv={setCrlv}
              fotos={fotos}
              setFotos={setFotos}
            />

            <div className="flex gap-3">
              <Button variant="outline" className="h-12 flex-1" onClick={() => setEtapa(4)}>
                Pular veículo
              </Button>
              <Button
                className="h-12 flex-[2] bg-teal-600 font-bold hover:bg-teal-700"
                onClick={salvarVeiculo}
                disabled={salvando}
              >
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar veículo
              </Button>
            </div>
          </div>
        )}

        {etapa === 4 && (
          <div className="space-y-5">
            {senha && (
              <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
                <p className="text-sm text-slate-700">
                  Acesso de <strong>{dados.email}</strong>. O envio acontece{" "}
                  <strong>somente agora, no final do cadastro</strong> — assim o vendedor já entra,
                  troca a senha e assina o termo vendo o resumo completo dos dados e do veículo.
                </p>
                <p className="text-xs font-semibold text-slate-500">
                  {senha.emailEnviado
                    ? "E-mail com o acesso enviado ao vendedor."
                    : senha.emailErro
                      ? `E-mail falhou: ${senha.emailErro}`
                      : "Acesso ainda não enviado. Conclua para disparar o e-mail."}
                </p>

                <div className="flex items-center gap-2 rounded-xl bg-white p-3">
                  <code className="flex-1 font-black tracking-widest text-slate-900">
                    {senha.senha}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(senha.senha);
                      toast.success("Senha copiada.");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>

                <Button
                  size="sm"
                  className="w-full bg-emerald-600 font-bold hover:bg-emerald-700"
                  onClick={() => {
                    window.open(linkWhatsApp(dados.whatsapp, mensagemAcesso(dados.nome, dados.email, senha.senha)), "_blank");
                  }}
                >
                  <MessageCircle className="mr-2 h-4 w-4" /> Enviar acesso pelo WhatsApp
                </Button>
              </div>
            )}

            {senha && !senha.emailEnviado ? (
              <Button
                onClick={enviarAcesso}
                disabled={salvando}
                className="h-12 w-full bg-teal-600 font-bold hover:bg-teal-700"
              >
                {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Concluir e enviar acesso ao vendedor
              </Button>
            ) : (
              <Button onClick={fechar} className="h-12 w-full bg-teal-600 font-bold hover:bg-teal-700">
                Concluir
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function mensagemAcesso(nome: string, email: string, senha: string) {
  const link = `${window.location.origin}/login`;
  return `Olá${nome ? `, ${nome}` : ""}! Seu acesso à plataforma Esse Já Foi foi criado.\n\nE-mail: ${email}\nSenha temporária: ${senha}\n\nAcesse: ${link}\n\nNo primeiro acesso você vai criar uma nova senha.`;
}

function linkWhatsApp(whatsapp: string, mensagem: string) {
  let numero = whatsapp.replace(/\D/g, "");
  if (numero && numero.length <= 11) numero = `55${numero}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
