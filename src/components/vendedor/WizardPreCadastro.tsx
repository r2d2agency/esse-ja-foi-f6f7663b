import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2, ShieldCheck, UserPlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/onboarding/FileUpload";
import { getSessionToken } from "@/lib/session";
import { criarVendedorInternoFn } from "@/lib/pre-cadastro.functions";
import { cadastrarMeuVeiculoFn } from "@/lib/vendedor.functions";
import {
  getProvedorConsultaFn,
  consultarLaudoVeiculoFn,
} from "@/lib/consulta-veicular.functions";
import { buscarCep } from "@/lib/viacep";
import { cn } from "@/lib/utils";

type Etapa = 1 | 2 | 3 | 4;

const ETAPAS: { n: Etapa; label: string }[] = [
  { n: 1, label: "Dados do vendedor" },
  { n: 2, label: "Documentos" },
  { n: 3, label: "Veículo" },
  { n: 4, label: "Consulta e conclusão" },
];

const CAMPO = "h-11";

export function WizardPreCadastro({ onConcluir }: { onConcluir?: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [salvando, setSalvando] = useState(false);

  const [perfilId, setPerfilId] = useState<string | null>(null);
  const [senha, setSenha] = useState<{ senha: string; emailEnviado: boolean } | null>(null);
  const [veiculoId, setVeiculoId] = useState<string | null>(null);
  const [consulta, setConsulta] = useState<any>(null);

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
  const [fotos, setFotos] = useState<(string | null)[]>([null, null, null, null]);

  const { data: provedorRes } = useQuery({
    queryKey: ["provedor-consulta"],
    queryFn: () => getProvedorConsultaFn(),
    enabled: aberto,
  });
  const provedor: any = (provedorRes as any)?.data ?? null;
  const consultaAtiva = !!provedor?.ativo;

  function set(campo: string, valor: string) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  async function preencherCep(cep: string, alvo: "vendedor" | "veiculo") {
    if (cep.replace(/\D/g, "").length !== 8) return;
    try {
      const r: any = await buscarCep(cep);
      if (!r) return;
      if (alvo === "vendedor") {
        setDados((d) => ({
          ...d,
          endereco: r.logradouro || d.endereco,
          bairro: r.bairro || d.bairro,
          cidade: r.localidade || r.cidade || d.cidade,
          uf: r.uf || d.uf,
        }));
      } else {
        setVeiculo((v) => ({
          ...v,
          endereco: r.logradouro || v.endereco,
          cidade: r.localidade || r.cidade || v.cidade,
          uf: r.uf || v.uf,
        }));
      }
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
        data: { token: getSessionToken(), ...dados, ...docs } as any,
      });
      if (!res?.ok) { toast.error(res?.message || "Não foi possível criar o vendedor."); return; }
      setPerfilId(res.perfilId);
      setSenha({ senha: res.senha, emailEnviado: !!res.emailEnviado });
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
            ? Number(veiculo.valorInteresse.replace(/\D/g, ""))
            : undefined,
          cep: veiculo.cep || undefined,
          endereco: veiculo.endereco || undefined,
          cidade: veiculo.cidade || undefined,
          uf: veiculo.uf || undefined,
          documento_crlv_url: crlv,
          fotos: fotos.filter(Boolean) as string[],
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

  async function consultarLaudo() {
    if (!veiculoId) return;
    setSalvando(true);
    try {
      const res: any = await consultarLaudoVeiculoFn({
        data: { token: getSessionToken(), veiculoId },
      });
      if (!res?.ok) { toast.error(res?.message || "Falha na consulta."); return; }
      setConsulta(res);
      toast.success("Consulta realizada.");
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
            <div className="grid gap-3 md:grid-cols-2">
              <Campo label="Nome completo / Razão social" valor={dados.nome} onChange={(v) => set("nome", v)} />
              <Campo label="E-mail" valor={dados.email} onChange={(v) => set("email", v)} />
              {dados.tipo_pessoa === "PF" ? (
                <>
                  <Campo label="CPF" valor={dados.cpf} onChange={(v) => set("cpf", v)} />
                  <Campo label="RG" valor={dados.rg} onChange={(v) => set("rg", v)} />
                  <Campo
                    label="Data de nascimento"
                    valor={dados.data_nascimento}
                    onChange={(v) => set("data_nascimento", v)}
                    placeholder="dd/mm/aaaa"
                  />
                </>
              ) : (
                <Campo label="CNPJ" valor={dados.cnpj} onChange={(v) => set("cnpj", v)} />
              )}
              <Campo label="WhatsApp" valor={dados.whatsapp} onChange={(v) => set("whatsapp", v)} />
              <Campo label="Telefone (opcional)" valor={dados.telefone} onChange={(v) => set("telefone", v)} />
              <Campo
                label="CEP"
                valor={dados.cep}
                onChange={(v) => {
                  set("cep", v);
                  void preencherCep(v, "vendedor");
                }}
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
            <div className="grid gap-4 md:grid-cols-2">
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
                Concluir pré-cadastro e gerar senha
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
            <div className="grid gap-3 md:grid-cols-3">
              <Campo label="Placa" valor={veiculo.placa} onChange={(v) => setVeiculo({ ...veiculo, placa: v.toUpperCase() })} />
              <Campo label="Marca" valor={veiculo.marca} onChange={(v) => setVeiculo({ ...veiculo, marca: v })} />
              <Campo label="Modelo" valor={veiculo.modelo} onChange={(v) => setVeiculo({ ...veiculo, modelo: v })} />
              <Campo label="Versão" valor={veiculo.versao} onChange={(v) => setVeiculo({ ...veiculo, versao: v })} />
              <Campo label="Ano fabricação" valor={veiculo.anoFabricacao} onChange={(v) => setVeiculo({ ...veiculo, anoFabricacao: v })} />
              <Campo label="Ano modelo" valor={veiculo.anoModelo} onChange={(v) => setVeiculo({ ...veiculo, anoModelo: v })} />
              <Campo label="Cor" valor={veiculo.cor} onChange={(v) => setVeiculo({ ...veiculo, cor: v })} />
              <Campo label="KM" valor={veiculo.km} onChange={(v) => setVeiculo({ ...veiculo, km: v })} />
              <Campo label="Câmbio" valor={veiculo.cambio} onChange={(v) => setVeiculo({ ...veiculo, cambio: v })} />
              <Campo label="Combustível" valor={veiculo.combustivel} onChange={(v) => setVeiculo({ ...veiculo, combustivel: v })} />
              <Campo label="Valor pretendido (R$)" valor={veiculo.valorInteresse} onChange={(v) => setVeiculo({ ...veiculo, valorInteresse: v })} />
              <Campo
                label="CEP onde está o veículo"
                valor={veiculo.cep}
                onChange={(v) => {
                  setVeiculo({ ...veiculo, cep: v });
                  void preencherCep(v, "veiculo");
                }}
              />
              <Campo label="Endereço" valor={veiculo.endereco} onChange={(v) => setVeiculo({ ...veiculo, endereco: v })} />
              <Campo label="Cidade" valor={veiculo.cidade} onChange={(v) => setVeiculo({ ...veiculo, cidade: v })} />
              <Campo label="UF" valor={veiculo.uf} onChange={(v) => setVeiculo({ ...veiculo, uf: v.toUpperCase().slice(0, 2) })} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FileUpload label="CRLV-e do veículo" value={crlv} onChange={setCrlv} />
              <div className="grid grid-cols-2 gap-3">
                {fotos.map((f, i) => (
                  <FileUpload
                    key={i}
                    label={`Foto ${i + 1}`}
                    value={f}
                    onChange={(u) =>
                      setFotos((atual) => atual.map((v, idx) => (idx === i ? u : v)))
                    }
                  />
                ))}
              </div>
            </div>

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
            {veiculoId && (
              <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <ShieldCheck className="h-4 w-4 text-teal-600" /> Consulta veicular
                  {provedor?.nome ? ` — ${provedor.nome}` : ""}
                </div>
                {consultaAtiva ? (
                  <>
                    <p className="text-sm text-slate-500">
                      Verifica sinistro, roubo/furto, restrições e histórico de leilão da placa
                      informada.
                    </p>
                    <Button
                      onClick={consultarLaudo}
                      disabled={salvando}
                      variant="outline"
                      className="h-11 font-bold"
                    >
                      {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Consultar agora
                    </Button>
                    {consulta && (
                      <pre className="max-h-56 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                        {JSON.stringify(consulta.resumo ?? consulta.data ?? consulta, null, 2)}
                      </pre>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Módulo de consulta desativado. Ative e configure as credenciais em
                    Configurações → Integrações.
                  </p>
                )}
              </div>
            )}

            {senha && (
              <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/50 p-4">
                <p className="text-sm text-slate-700">
                  Senha temporária de <strong>{dados.email}</strong>. No primeiro acesso o vendedor
                  troca a senha e assina o termo com o resumo do cadastro e do veículo.
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
                <p className="text-xs font-semibold text-slate-500">
                  {senha.emailEnviado
                    ? "E-mail com a senha enviado ao vendedor."
                    : "Não foi possível enviar o e-mail — repasse a senha manualmente."}
                </p>
              </div>
            )}

            <Button onClick={fechar} className="h-12 w-full bg-teal-600 font-bold hover:bg-teal-700">
              Concluir
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  label,
  valor,
  onChange,
  placeholder,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-bold text-slate-600">{label}</Label>
      <Input
        className={CAMPO}
        value={valor}
        placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
