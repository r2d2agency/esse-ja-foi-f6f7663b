import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, Settings, BrainCircuit, Mail, Send, ScanSearch, FileSignature, Loader2, PlugZap, Percent } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  getProvedorConsultaFn,
  salvarProvedorConsultaFn,
  testarConexaoConsultaFn,
  testarConsultaPlacaFn,
} from "@/lib/consulta-veicular.functions";
import { getTermoVigenteFn, salvarTermoFn } from "@/lib/termos.functions";
import { listarConfiguracoesFn, salvarConfiguracaoFn, enviarEmailTesteFn } from "@/lib/admin.functions";
import { getComissaoPadraoFn, setComissaoPadraoFn } from "@/lib/relatorios.functions";


export const Route = createFileRoute("/admin/configuracoes")({
  component: ConfiguracoesAdminPage,
});

function ConfiguracoesAdminPage() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      console.log("[admin/configuracoes] Carregando configurações...");
      const res = await listarConfiguracoesFn();
      console.log("[admin/configuracoes] Resposta:", res);
      if (res.ok) {
        setConfigs(res.data);
      } else {
        toast.error(res.message || "Erro ao carregar configurações.");
      }
    } catch (err) {
      console.error("[admin/configuracoes] Erro:", err);
      toast.error("Erro na comunicação com o servidor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = async (chave: string, valor: string) => {
    const res = await salvarConfiguracaoFn({ data: { chave, valor } });
    if (res.ok) {
      toast.success(`Configuração ${chave} salva.`);
    } else {
      toast.error(`Erro ao salvar ${chave}.`);
    }
  };

  const getConfig = (chave: string) => configs.find(c => c.chave === chave)?.valor ?? "";
  
  const setConfig = (chave: string, valor: string) => {
    setConfigs(prev =>
      prev.some(c => c.chave === chave)
        ? prev.map(c => (c.chave === chave ? { ...c, valor } : c))
        : [...prev, { chave, valor }],
    );
  };

  if (loading) return <div className="p-8">Carregando...</div>;

  return (
    <div className="max-w-4xl space-y-8 mb-12 p-6">

        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="h-6 w-6 text-teal-900" />
            Configurações do Sistema
          </h1>
          <p className="text-sm text-slate-500">Ajuste os parâmetros globais da plataforma.</p>
        </div>

        <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Mail className="h-5 w-5 text-teal-700" />
            Servidor de E-mail (SMTP)
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Host SMTP</Label>
              <Input 
                value={getConfig("smtp_host")} 
                onChange={(e) => setConfig("smtp_host", e.target.value)}
                placeholder="smtp.exemplo.com" 
              />
            </div>
            <div className="space-y-2">
              <Label>Porta</Label>
              <Input 
                value={getConfig("smtp_port")} 
                onChange={(e) => setConfig("smtp_port", e.target.value)}
                placeholder="587" 
              />
            </div>
            <div className="space-y-2">
              <Label>Criptografia</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={getConfig("smtp_secure") || "tls"}
                onChange={(e) => setConfig("smtp_secure", e.target.value)}
              >
                <option value="ssl">SSL/TLS direto (porta 465)</option>
                <option value="tls">STARTTLS (porta 587)</option>
                <option value="none">Sem criptografia (porta 25)</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Validar certificado do servidor</Label>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={getConfig("smtp_reject_unauthorized") || "false"}
                onChange={(e) => setConfig("smtp_reject_unauthorized", e.target.value)}
              >
                <option value="false">Não (recomendado em hospedagem compartilhada)</option>
                <option value="true">Sim</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Input 
                value={getConfig("smtp_user")} 
                onChange={(e) => setConfig("smtp_user", e.target.value)}
                placeholder="usuario@exemplo.com" 
              />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input 
                type="password"
                value={getConfig("smtp_pass")} 
                onChange={(e) => setConfig("smtp_pass", e.target.value)}
                placeholder="******" 
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail remetente (From)</Label>
              <Input
                value={getConfig("smtp_from")}
                onChange={(e) => setConfig("smtp_from", e.target.value)}
                placeholder="contato@seudominio.com.br"
              />
              <p className="text-xs text-slate-500">
                Precisa ser um endereço autorizado pelo servidor SMTP, senão ocorre o erro 550 (sender not recognized). Se vazio, usa o usuário.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Nome do remetente</Label>
              <Input
                value={getConfig("smtp_from_name")}
                onChange={(e) => setConfig("smtp_from_name", e.target.value)}
                placeholder="Esse Já Foi"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="bg-teal-900" onClick={() => {
              void salvar("smtp_host", getConfig("smtp_host"));
              void salvar("smtp_port", getConfig("smtp_port"));
              void salvar("smtp_user", getConfig("smtp_user"));
              void salvar("smtp_pass", getConfig("smtp_pass"));
              void salvar("smtp_secure", getConfig("smtp_secure") || "tls");
              void salvar("smtp_reject_unauthorized", getConfig("smtp_reject_unauthorized") || "false");
              void salvar("smtp_from", getConfig("smtp_from"));
              void salvar("smtp_from_name", getConfig("smtp_from_name"));
            }}>
              <Save className="mr-2 h-4 w-4" /> Salvar SMTP
            </Button>
            <Button 
              variant="outline" 
              onClick={async () => {
                const email = prompt("Digite o e-mail para teste:");
                if (!email) return;
                const res = await enviarEmailTesteFn({ data: { email } });
                if (res.ok) toast.success("E-mail de teste enviado!");
                else toast.error(res.message || "Erro ao enviar teste.");
              }}
            >
              <Send className="mr-2 h-4 w-4" /> Enviar Teste
            </Button>
          </div>
        </section>


        <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <BrainCircuit className="h-5 w-5 text-teal-700" />
            Inteligência Artificial (OpenAI)
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Chave de API OpenAI</Label>
              <Input
                type="password"
                value={getConfig("openai_api_key")}
                onChange={(e) => setConfig("openai_api_key", e.target.value)}
                placeholder="sk-..."
              />
            </div>
            <div className="space-y-2">
              <Label>Modelo</Label>
              <Input
                value={getConfig("openai_model")}
                onChange={(e) => setConfig("openai_model", e.target.value)}
                placeholder="gpt-4o"
              />
              <p className="text-xs text-slate-500">Precisa ser um modelo com suporte a visão (ex: gpt-4o), pois a IA lê a imagem do documento.</p>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">Análise automática de documentos do vendedor</p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800">Analisar documentos automaticamente</p>
                <p className="text-xs text-slate-500">Ao enviar CNH, CRLV, comprovante ou selfie, a IA confere se o tipo do documento bate com o esperado.</p>
              </div>
              <Switch
                checked={getConfig("ia_analise_documentos_ativa") !== "false"}
                onCheckedChange={(v: boolean) => setConfig("ia_analise_documentos_ativa", v ? "true" : "false")}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800">Reprovar automaticamente quando a IA tiver certeza</p>
                <p className="text-xs text-slate-500">Se desativado, a IA só sinaliza a divergência para o admin decidir — não abre pendência sozinha.</p>
              </div>
              <Switch
                checked={getConfig("ia_auto_reprovar") !== "false"}
                onCheckedChange={(v: boolean) => setConfig("ia_auto_reprovar", v ? "true" : "false")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Prompt da IA para análise de documentos</Label>
            <Textarea
              rows={14}
              className="font-mono text-xs"
              value={getConfig("ia_prompt_documentos")}
              onChange={(e) => setConfig("ia_prompt_documentos", e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Esse texto é enviado como instrução do sistema para a IA antes de cada análise. Ajuste o comportamento
              (ex: nível de rigor, o que aceitar ou não) editando este prompt.
            </p>
          </div>

          <div className="flex gap-2">
            <Button className="bg-teal-900" onClick={() => {
              void salvar("openai_api_key", getConfig("openai_api_key"));
              void salvar("openai_model", getConfig("openai_model"));
              void salvar("ia_analise_documentos_ativa", getConfig("ia_analise_documentos_ativa") !== "false" ? "true" : "false");
              void salvar("ia_auto_reprovar", getConfig("ia_auto_reprovar") !== "false" ? "true" : "false");
              void salvar("ia_prompt_documentos", getConfig("ia_prompt_documentos"));
            }}>
              <Save className="mr-2 h-4 w-4" /> Salvar Configurações IA
            </Button>
          </div>
        </section>

        <ConsultaVeicularSection />
        <TermoAdesaoSection />
      </div>
  );
}

function ConsultaVeicularSection() {
  const [form, setForm] = useState({
    nome: "Company Conferi",
    base_url: "https://webservice.companyconferi.com.br",
    caminho_consulta: "/api-clientes/consulta",
    produto: "GOLD",
    usuario: "",
    senha: "",
    api_key: "",
    auth_modo: "AUTO",
    ativo: false,
  });
  const [chaveMascarada, setChaveMascarada] = useState<string | null>(null);
  const [temSenha, setTemSenha] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [placaTeste, setPlacaTeste] = useState("");
  const [testandoPlaca, setTestandoPlaca] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<any>(null);


  useEffect(() => {
    void (async () => {
      const res: any = await getProvedorConsultaFn();
      const p = res?.data;
      if (!p) return;
      setForm((f) => ({
        ...f,
        nome: p.nome || f.nome,
        base_url: p.base_url || f.base_url,
        caminho_consulta: p.caminho_consulta || f.caminho_consulta,
        produto: p.produto || f.produto,
        usuario: p.usuario || "",
        senha: "",
        api_key: "",
        auth_modo: p.auth_modo || "AUTO",
        ativo: !!p.ativo,
      }));
      setChaveMascarada(p.chave_mascarada || null);
      setTemSenha(!!p.tem_senha);
    })();
  }, []);

  async function salvarProvedor() {
    setOcupado(true);
    try {
      const res: any = await salvarProvedorConsultaFn({ data: form });
      if (!res?.ok) {
        toast.error(res?.message || "Erro ao salvar o provedor.");
        return;
      }
      toast.success("Módulo de consulta veicular salvo.");
      const atualizado: any = await getProvedorConsultaFn();
      setChaveMascarada(atualizado?.data?.chave_mascarada || null);
      setTemSenha(!!atualizado?.data?.tem_senha);
      setForm((f) => ({ ...f, api_key: "", senha: "" }));
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    setOcupado(true);
    try {
      const res: any = await testarConexaoConsultaFn();
      setResultadoTeste(res);
      if (res?.ok) toast.success(res.message || "Conexão validada.");
      else toast.error(res?.message || "Falha na conexão.");
    } finally {
      setOcupado(false);
    }
  }


  async function testarPlaca() {
    const placa = placaTeste.toUpperCase().replace(/\W/g, "");
    if (placa.length !== 7) {
      toast.error("Informe uma placa válida (7 caracteres).");
      return;
    }
    setTestandoPlaca(true);
    setResultadoTeste(null);
    try {
      const res: any = await testarConsultaPlacaFn({ data: { placa } });
      setResultadoTeste(res);
      if (res?.ok) toast.success("Consulta de teste concluída.");
      else toast.error(res?.message || "Falha na consulta de teste.");
    } finally {
      setTestandoPlaca(false);
    }
  }

  return (
    <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <ScanSearch className="h-5 w-5 text-teal-700" />
          Consulta veicular (Company Conferi)
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500">Módulo ativo</span>
          <Switch
            checked={form.ativo}
            onCheckedChange={(v: boolean) => setForm({ ...form, ativo: v })}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>URL base da API</Label>
          <Input
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            placeholder="https://webservice.companyconferi.com.br"
          />
        </div>
        <div className="space-y-2">
          <Label>Caminho da consulta</Label>
          <Input
            value={form.caminho_consulta}
            onChange={(e) => setForm({ ...form, caminho_consulta: e.target.value })}
            placeholder="/api-clientes/consulta"
          />
        </div>
        <div className="space-y-2">
          <Label>Produto / pacote</Label>
          <Input
            value={form.produto}
            onChange={(e) => setForm({ ...form, produto: e.target.value })}
            placeholder="GOLD"
          />
        </div>
        <div className="space-y-2">
          <Label>Usuário da API</Label>
          <Input
            value={form.usuario}
            onChange={(e) => setForm({ ...form, usuario: e.target.value })}
            placeholder="usuário fornecido pela Company Conferi"
          />
        </div>
        <div className="space-y-2">
          <Label>Senha da API</Label>
          <Input
            type="password"
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
            placeholder={temSenha ? "•••••••• (salva)" : "senha fornecida pelo provedor"}
          />
          <p className="text-xs text-slate-500">
            {temSenha ? "Senha cadastrada. Deixe em branco para manter." : "Nenhuma senha cadastrada."}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Modo de autenticação</Label>
          <select
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={form.auth_modo}
            onChange={(e) => setForm({ ...form, auth_modo: e.target.value })}
          >
            <option value="AUTO">Automático (testa as combinações)</option>
            <option value="XML">XML Conferi (usuário/senha em atributos)</option>
            <option value="XMLTAG">XML Conferi (usuário/senha em elementos)</option>
            <option value="XMLFORM">XML Conferi em campo de formulário (xml=)</option>
            <option value="QUERY">Parâmetros na URL (GET)</option>
            <option value="CORPO">Usuário e senha no corpo (JSON)</option>
            <option value="FORM">Usuário e senha em formulário</option>
            <option value="BASIC">Basic auth (usuário:senha)</option>
            <option value="BEARER">Bearer token</option>
            <option value="APIKEY">Cabeçalho x-api-key</option>

          </select>
        </div>
        <div className="space-y-2">
          <Label>Chave / token de acesso (se houver)</Label>
          <Input
            type="password"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            placeholder={chaveMascarada || "Cole a chave fornecida pelo provedor"}
          />
          <p className="text-xs text-slate-500">
            {chaveMascarada
              ? `Chave atual: ${chaveMascarada}. Deixe em branco para manter.`
              : "Nenhuma chave cadastrada ainda."}
          </p>
        </div>

      </div>

      <div className="flex gap-2">
        <Button className="bg-teal-900" disabled={ocupado} onClick={salvarProvedor}>
          {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar módulo
        </Button>
        <Button variant="outline" disabled={ocupado} onClick={testar}>
          <PlugZap className="mr-2 h-4 w-4" /> Testar conexão
        </Button>
      </div>

      <div className="space-y-3 rounded-xl border border-dashed border-teal-300 bg-teal-50/40 p-4">
        <p className="text-sm font-bold text-slate-800">
          Testar consulta com uma placa real
        </p>
        <p className="text-xs text-slate-500">
          Digite uma placa para executar uma consulta de verdade no provedor e validar o retorno.
          Nada é gravado no cadastro de veículos. Salve o módulo antes de testar.
        </p>
        <div className="flex gap-2">
          <Input
            className="max-w-[180px] uppercase"
            placeholder="ABC1D23"
            value={placaTeste}
            onChange={(e) => setPlacaTeste(e.target.value.toUpperCase())}
            maxLength={8}
          />
          <Button
            variant="outline"
            className="border-teal-600 text-teal-700"
            disabled={testandoPlaca || ocupado}
            onClick={testarPlaca}
          >
            {testandoPlaca ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ScanSearch className="mr-2 h-4 w-4" />
            )}
            Consultar placa
          </Button>
        </div>

        {resultadoTeste && (
          <div className="space-y-2">
            <p
              className={`text-xs font-bold ${
                resultadoTeste.ok ? "text-teal-700" : "text-red-600"
              }`}
            >
              {resultadoTeste.ok ? "Consulta concluída" : "Falha na consulta"}
              {resultadoTeste.httpStatus ? ` — HTTP ${resultadoTeste.httpStatus}` : ""}
              {resultadoTeste.message ? `: ${resultadoTeste.message}` : ""}
            </p>
            {resultadoTeste.resumo && <PainelResultadoConsulta resumo={resultadoTeste.resumo} />}
            {Array.isArray(resultadoTeste.diagnostico) && resultadoTeste.diagnostico.length > 0 && (
              <div className="space-y-1 rounded-lg bg-white p-3 text-xs text-slate-700">
                <p className="font-bold text-slate-500">Tentativas de autenticação</p>
                {resultadoTeste.diagnostico.map((d: any, i: number) => (
                  <div key={i}>
                    {d.modo} — HTTP {d.httpStatus || "sem resposta"}: {d.mensagem}
                  </div>
                ))}
              </div>
            )}

            <details className="rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              <summary className="cursor-pointer font-bold">Ver retorno completo (JSON)</summary>
              <pre className="mt-2 max-h-72 overflow-auto">
                {JSON.stringify(resultadoTeste.resposta ?? resultadoTeste, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}

const ITENS_RISCO: { chave: string; rotulo: string }[] = [
  { chave: "roubo_furto", rotulo: "Roubo / Furto" },
  { chave: "sinistro", rotulo: "Sinistro" },
  { chave: "leilao", rotulo: "Histórico de leilão" },
  { chave: "restricoes", rotulo: "Restrições" },
  { chave: "renajud", rotulo: "Renajud (judicial)" },
  { chave: "debitos", rotulo: "Débitos" },
];

const PADROES_NEGATIVO = ["nada consta", "nao consta", "não consta", "sem registro", "negativ", "nao", "não", "nenhum", "0", "false", "inexistente", "sem restricao", "sem restrição"];

function classificarItem(valor: any): "positivo" | "negativo" | "neutro" {
  if (valor === null || valor === undefined || valor === "") return "neutro";
  const norm = String(typeof valor === "object" ? JSON.stringify(valor) : valor).toLowerCase().trim();
  if (!norm) return "neutro";
  if (PADROES_NEGATIVO.some((p) => norm === p || norm.startsWith(p))) return "negativo";
  return "positivo";
}

function PainelResultadoConsulta({ resumo }: { resumo: Record<string, any> }) {
  const extras = (resumo.extras ?? null) as Record<string, any> | null;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        {ITENS_RISCO.map(({ chave, rotulo }) => {
          const valor = resumo[chave];
          const estado = classificarItem(valor);
          const estilo =
            estado === "positivo"
              ? "border-red-300 bg-red-50 text-red-800"
              : estado === "negativo"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-500";
          return (
            <div key={chave} className={`rounded-lg border p-3 ${estilo}`}>
              <p className="text-xs font-bold uppercase tracking-wide">{rotulo}</p>
              <p className="mt-1 text-sm font-semibold">
                {estado === "neutro"
                  ? "Não informado"
                  : estado === "negativo"
                    ? "Nada encontrado"
                    : String(typeof valor === "object" ? JSON.stringify(valor) : valor)}
              </p>
              {estado === "negativo" && valor != null && String(valor).toLowerCase() !== "nada encontrado" && (
                <p className="mt-0.5 text-[11px] opacity-70">{String(valor)}</p>
              )}
            </div>
          );
        })}
      </div>
      {(resumo.protocolo || resumo.situacao || resumo.documento_url) && (
        <div className="grid gap-1 rounded-lg bg-white p-3 text-xs text-slate-700 md:grid-cols-2">
          {resumo.protocolo && (
            <div>
              <span className="font-bold text-slate-500">Protocolo:</span> {String(resumo.protocolo)}
            </div>
          )}
          {resumo.situacao && (
            <div>
              <span className="font-bold text-slate-500">Situação:</span> {String(resumo.situacao)}
            </div>
          )}
          {resumo.documento_url && (
            <div className="md:col-span-2">
              <span className="font-bold text-slate-500">Documento:</span>{" "}
              <a href={String(resumo.documento_url)} target="_blank" rel="noreferrer" className="text-teal-700 underline">
                {String(resumo.documento_url)}
              </a>
            </div>
          )}
        </div>
      )}
      {extras && Object.keys(extras).length > 0 && (
        <div className="grid gap-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-slate-700 md:grid-cols-2">
          <p className="font-bold text-amber-800 md:col-span-2">
            Campos retornados pelo provedor (fora do mapeamento padrão)
          </p>
          {Object.entries(extras).map(([k, v]) => (
            <div key={k}>
              <span className="font-bold text-slate-500">{k}:</span> {String(v)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TermoAdesaoSection() {
  const [versao, setVersao] = useState("1.0");
  const [titulo, setTitulo] = useState("Termo de adesão do vendedor");
  const [conteudo, setConteudo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void (async () => {
      const res: any = await getTermoVigenteFn();
      const t = res?.data;
      if (!t) return;
      setVersao(t.versao || "1.0");
      setTitulo(t.titulo || "Termo de adesão do vendedor");
      setConteudo(t.conteudo || "");
    })();
  }, []);

  async function salvarTermoAtual() {
    if (conteudo.trim().length < 20) {
      toast.error("Escreva o conteúdo do termo.");
      return;
    }
    setOcupado(true);
    try {
      const res: any = await salvarTermoFn({ data: { versao, titulo, conteudo } });
      if (!res?.ok) {
        toast.error(res?.message || "Erro ao salvar o termo.");
        return;
      }
      toast.success("Nova versão do termo publicada.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <FileSignature className="h-5 w-5 text-amber-600" />
        Termo de adesão do vendedor
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Versão</Label>
          <Input value={versao} onChange={(e) => setVersao(e.target.value)} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Título</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Conteúdo do termo</Label>
        <Textarea rows={12} value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
        <p className="text-xs text-slate-500">
          Ao salvar, uma nova versão é publicada e passa a ser exigida no primeiro acesso dos
          vendedores. O aceite registra data, hora, IP e navegador.
        </p>
      </div>
      <Button className="bg-teal-900" disabled={ocupado} onClick={salvarTermoAtual}>
        {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Publicar versão do termo
      </Button>
    </section>
  );
}

