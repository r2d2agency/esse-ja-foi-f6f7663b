import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MessageSquare,
  Users,
  FileText,
  History,
  Settings,
  Send,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layout,
  Copy,
  Terminal,
  Activity,
  ChevronRight,
  ShieldCheck,
  Globe,
  MoreVertical,
  Eye,
  Smartphone,
  Info,
  ChevronLeft,
  Check,
  Car,
  Megaphone,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getIndicadoresComunicacoesFn,
  listarCampanhasFn,
  getWhatsappConfigFn,
  testarConexaoFn,
  sincronizarTemplatesFn,
  updateWhatsappConfigFn,
  gerarNovoVerifyTokenFn,
  getWebhookLogsFn,
  getLogsSincronizacaoFn,
  buscarDadosAutomaticosFn,
  listarTemplatesFn,
  listarContatosWhatsappFn,
  listarSegmentosComTotalFn,
  criarTemplateMetaFn,
  uploadMidiaTemplateFn,
  anexarMidiaTemplateFn,
  excluirTemplateMetaFn,
  estimarPublicoFn,
  criarCampanhaFn,
  criarCampanhaDisparoFn,
  alterarStatusCampanhaFn,
  atualizarCampanhaFn,
  excluirCampanhaFn,
  listarCampanhasDetalhadoFn,
  processarDisparoAgoraFn,
  enviarTesteFn,
  processarEnvioCampanhaFn,
  exemploDestinatarioFn,
  getEnviosCampanhaFn,
  getLogsCampanhaFn,
  getLogsDisparoFn,
  dispararCampanhaAgoraFn,
  agendarDisparoCampanhaFn,
} from "@/lib/comunicacoes.functions";
import { listarMarketingTagsFn, listarGruposUazapiFn, getUazapiConfigFn } from "@/lib/marketing.functions";
import {
  normalizarStatusTemplate,
  rotuloStatusTemplate,
  templateAprovado,
  campanhaTemplateIndisponivel,
} from "@/db/whatsapp-status";
// Rótulo legível da operação: a tela mostrava o código cru
// (SINCRONIZAR_TEMPLATES, TESTAR_CONEXAO...), que o admin não consegue
// ligar ao que aconteceu. `rotuloOperacao` traduz; se a operação for nova e
// ainda não estiver no mapa, devolve o próprio código em vez de esconder.
import { rotuloOperacao } from "@/lib/rotulos-log";
import {
  listarAutomacoesFn,
  salvarAutomacaoFn,
  getExecucoesAutomacaoFn,
} from "@/lib/automacoes.functions";
import { getAnunciosAdmin } from "@/lib/anuncios.functions";
import { getVeiculosAdminFn } from "@/lib/admin-veiculos.functions";
import { toast } from "sonner";
import {
  Clock,
  Zap,
  Play,
  Pause,
  FileEdit,
  Trash2,
  RotateCcw,
  Mail,
  Target,
  LayoutTemplate,
  FileDown,
  Upload,
  Paperclip,
} from "lucide-react";

export const Route = createFileRoute("/admin/comunicacoes")({
  component: ComunicacoesPage,
});

// A Meta devolve o status cru. Traduzir evita ler "PENDING" e não saber se o
// template foi aprovado, recusado ou ainda está em análise. O vocabulário é o
// da Meta; o banco pode ter o valor em português (ver whatsapp-status.ts).
function rotuloStatus(status: string) {
  return rotuloStatusTemplate(status) || status || "—";
}

function varianteStatus(status: string): any {
  const normalizado = normalizarStatusTemplate(status);
  if (normalizado === "APPROVED") return "success";
  if (normalizado === "PENDING") return "warning";
  if (normalizado === "REJECTED") return "destructive";
  return "secondary";
}

/**
 * Rótulo e aparência do detalhe de envios, a partir do `estado_fila` do
 * motor e do `status` que a Meta devolve via webhook.
 */
/**
 * "Enviada" é o instante em que a Meta **aceitou** a mensagem, não em que ela
 * chegou. Chamar isso de "Concluído" fazia a tela mentir: a campanha
 * aparecia verde e o contato recebia nada. Agora os estados que o webhook
 * devolve (entregue/lida) são os únicos que contam como concluído.
 */
function rotuloStatusEnvio(envio: any) {
  if (envio?.estado_fila === "FALHOU") return "Erro";
  if (envio?.estado_fila === "IGNORADA") return "Ignorado";
  if (envio?.status === "LIDA") return "Lida";
  if (envio?.status === "ENTREGUE") return "Entregue";
  if (envio?.estado_fila === "ENVIADA" || envio?.status === "ENVIADA") return "Enviada";
  if (envio?.status === "FALHOU" || envio?.status === "REJEITADA") return "Erro";
  return "Agendada";
}

function varianteStatusEnvio(envio: any): any {
  if (envio?.estado_fila === "FALHOU") return "destructive";
  if (envio?.estado_fila === "IGNORADA") return "secondary";
  if (envio?.status === "LIDA" || envio?.status === "ENTREGUE") return "success";
  if (envio?.estado_fila === "ENVIADA" || envio?.status === "ENVIADA") return "warning";
  if (envio?.status === "FALHOU" || envio?.status === "REJEITADA") return "destructive";
  return "secondary";
}
/** Cor do evento no log da campanha: erro/bloqueio em vermelho, ok em verde. */
function varianteAcaoLog(acao: string): any {
  if (["ERRO", "BLOQUEADA"].includes(acao)) return "destructive";
  if (["LOTE_ENVIADO", "CONCLUIDA", "DISPARO_FORCADO"].includes(acao)) return "success";
  if (["FILA_VAZIA", "FORA_DA_JANELA", "AGUARDANDO_INTERVALO"].includes(acao)) return "warning";
  return "secondary";
}
/** Quantas variáveis o corpo do template usa, na ordem {{1}}, {{2}}... */
/** O conteúdo pode chegar como array de componentes (formato da Meta) ou como objeto com `components`. */
function componentesDoTemplate(template: any): any[] {
  const conteudo = template?.conteudo;
  if (Array.isArray(conteudo)) return conteudo;
  if (Array.isArray(conteudo?.components)) return conteudo.components;
  return [];
}

/**
 * Template com cabeçalho de mídia que ainda não tem binário local.
 *
 * A Meta devolve o HEADER de mídia como `example.header_handle` — uma URL —
 * e nunca como `image.id`. Esse URL não serve como mídia no envio: o
 * `montarComponents` precisa do `media_id` que a Meta emite no upload.
 * Templates criados direto no WhatsApp Manager chegam assim, e sem o arquivo
 * local o disparo morre com o erro 132012. O aviso aponta o problema antes
 * que a campanha quebre.
 */
function precisaSubirCabecalho(template: any): boolean {
  const comps = componentesDoTemplate(template);
  const header = comps.find((c: any) => String(c?.type || "").toUpperCase() === "HEADER");
  if (!header) return false;
  const formato = String(header?.format || "").toUpperCase();
  const ehMidia = ["IMAGE", "VIDEO", "DOCUMENT"].includes(formato);
  if (!ehMidia) return false;
  // Sem mídia local e sem `media_id` válido, o HEADER não pode ser montado.
  return !template?.midia_arquivo_id && !template?.midia_id;
}

/**
 * Conta os placeholders {{n}} do corpo **e** das urls de botão: a numeração
 * corre nos dois, então um template com 6 variáveis no corpo e uma no link
 * precisa de 7 campos — contar só o corpo deixaria o do botão sem input.
 */
export function contarVariaveisTemplate(template: any): number {
  const comps = componentesDoTemplate(template);
  let maximo = 0;
  for (const comp of comps) {
    const tipo = String(comp?.type || "").toUpperCase();
    if (tipo === "BODY") {
      // Formato do wizard: { type: "BODY", text: "Olá {{1}}!" }
      // Formato da Meta:  { type: "body", parameters: [{type:"text", text:"Olá {{1}}!"}] }
      const texto = comp.text ?? comp.parameters?.[0]?.text ?? "";
      maximo = Math.max(maximo, contarPlaceholders(texto));
    }
    if (tipo === "BUTTONS" && Array.isArray(comp.buttons)) {
      for (const b of comp.buttons) {
        if (b?.type === "URL") maximo = Math.max(maximo, contarPlaceholders(b.url || ""));
      }
    }
    // Formato da Meta: botões vêm como componentes individuais
    // { type: "button", sub_type: "url", index: 0, text: "..." }
    // A Meta não devolve a URL, então não há {{n}} para contar aqui.
  }
  return maximo;
}

function contarPlaceholders(texto: string): number {
  const numeros = [...String(texto).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return numeros.length ? Math.max(...numeros) : 0;
}

/**
 * Amostra do que cada campo do veículo vai entregar de verdade, para o passo
 * de mapeamento não exigir que você confie às cegas. O motor monta o valor
 * final; aqui é só uma prévia do registro escolhido.
 */
const RESUMO_VARIAVEIS: Record<string, (v: any) => string> = {
  "veiculo.nome_completo": (v) => [v.marca, v.modelo].filter(Boolean).join(" "),
  "veiculo.marca": (v) => v.marca,
  "veiculo.modelo": (v) => v.modelo,
  "veiculo.ano": (v) => String(v.ano_modelo ?? ""),
  "veiculo.placa": (v) => v.placa,
  "veiculo.cor": (v) => v.cor,
  "veiculo.km": (v) => (v.km != null ? `${Number(v.km).toLocaleString("pt-BR")} km` : ""),
  "veiculo.valor": (v) =>
    v.valor_interesse_cliente != null
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
          Number(v.valor_interesse_cliente),
        )
      : "",
  // O motor formata igual; a prévia só precisa mostrar que o campo existe.
  "anuncio.url": () => "(definido ao publicar o veículo)",
  "vendedor.nome": (v) => v.vendedor_nome,
  // Estes dois mudam a cada contato: o wizard carrega um exemplo real e mostra
  // o nome/telefone dele aqui. Sem contato eles ficam vazios e a prévia exibe
  // "(sem contato de exemplo)".
  "contato.nome": () => "(sem contato de exemplo)",
  "contato.telefone": () => "(sem contato de exemplo)",
};

/** Corpo do template com cada {{n}} trocado pelo valor de exemplo, na ordem. */
function substituirVariaveis(texto: string, valores: Record<string, any>): string {
  return String(texto ?? "").replace(/\{\{(\d+)\}\}/g, (m, n) => {
    const v = valores[String(n)] ?? valores[`{{${n}}}`];
    return v == null ? m : String(v);
  });
}

/** O botão Enviar só habilita com telefone válido e todas as variáveis preenchidas. */
export function podeEnviarTeste(template: any, valores: string[], digitos: string): boolean {
  if (digitos.length < 10 || digitos.length > 13) return false;
  const total = contarVariaveisTemplate(template);
  for (let i = 0; i < total; i++) {
    if (!String(valores[i] ?? "").trim()) return false;
  }
  return true;
}
const EXEMPLOS_VARIAVEIS = ["Carlos", "HB20 2022", "https://essejafoi.com.br/veiculo/EJF-000001"];

const ROTULO_COMPLIANCE: Record<string, string> = {
  APROVADO: "Aprovado",
  PENDENTE: "Pendente",
  EM_ANALISE: "Em análise",
  AGUARDANDO_ANALISE: "Aguardando análise",
  REPROVADO: "Reprovado",
  NAO_ENVIADO: "Não enviado",
};

function rotuloCompliance(status?: string | null) {
  return ROTULO_COMPLIANCE[String(status ?? "")] || status || "Pendente";
}

const ROTULO_CAMPANHA: Record<string, string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO: "Aguardando",
  AGENDADA: "Agendada",
  PROCESSANDO: "Enviando",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
  PAUSADA: "Pausada",
  // Não é falha da campanha: o template ainda não foi aprovado pela Meta.
  TEMPLATE_INDISPONIVEL: "Aguardando template",
  TEMPLATE_INDESPONIVEL: "Aguardando template",
};

function rotuloStatusCampanha(campanha: any) {
  if (campanhaTemplateIndisponivel(campanha?.status)) {
    return `Aguardando template (${rotuloStatus(campanha.template_status).toLowerCase()})`;
  }
  return ROTULO_CAMPANHA[campanha?.status] || campanha?.status || "—";
}

function varianteStatusCampanha(status: string): any {
  if (status === "CONCLUIDA") return "success";
  if (status === "PROCESSANDO") return "warning";
  if (campanhaTemplateIndisponivel(status) || status === "PAUSADA") return "secondary";
  return "outline";
}

/** Cor do evento na trilha do motor de disparo. */
function varianteAcaoDisparo(acao: string): any {
  if (acao === "ERRO" || acao === "BLOQUEADA") return "destructive";
  if (
    acao === "LOTE_ENVIADO" ||
    acao === "CONCLUIDA" ||
    acao === "ENVIO_TESTE" ||
    acao === "SINCRONIZACAO" ||
    acao === "CRIACAO_TEMPLATE" ||
    acao === "EXCLUSAO_TEMPLATE"
  )
    return "success";
  if (acao === "DISPARO_FORCADO" || acao === "PROMOCAO_STATUS") return "warning";
  return "secondary";
}

/**
 * Rótulo legível das ações da trilha do motor.
 *
 * As ações novas (sincronização, criação e exclusão de template) são
 * gravadas com o nome técnico; sem esta tradução a tela mostra
 * "SINCRONIZACAO" cru e o admin não entende o que aconteceu.
 */
function rotuloAcaoDisparo(acao: string): string {
  const mapa: Record<string, string> = {
    SINCRONIZACAO: "Sincronização de templates",
    CRIACAO_TEMPLATE: "Criação de template",
    EXCLUSAO_TEMPLATE: "Exclusão de template",
    ENVIO_TESTE: "Teste de template",
    LOTE_ENVIADO: "Lote enviado",
    FILA_MONTADA: "Fila montada",
    FILA_VAZIA: "Fila vazia",
    FORA_DA_JANELA: "Fora da janela",
    AGUARDANDO_INTERVALO: "Aguardando intervalo",
    BLOQUEADA: "Bloqueada",
    CONCLUIDA: "Concluída",
    DISPARO_FORCADO: "Disparo forçado",
    REAGENDADA: "Reagendada",
    PROMOCAO_STATUS: "Promoção de status",
    CRIADA: "Criada",
    ERRO: "Erro",
  };
  return mapa[acao] || acao;
}

/** Texto → CSV, escapando o separador e aspas. */
function paraCsv(linhas: string[][]) {
  return linhas
    .map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

function baixarCsv(nome: string, conteudo: string) {
  // ﻿ é o BOM: sem ele o Excel abre a lista com acentos quebrados.
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** Campos de exemplo para {{1}}, {{2}}... — o teste envia só o que se preencher. */
function VariáveisTeste({
  template,
  valores,
  onChange,
}: {
  template: any;
  valores: string[];
  onChange: (v: string[]) => void;
}) {
  const total = contarVariaveisTemplate(template);
  if (!total) return null;

  // Verifica quais variáveis estão vazias
  const faltando = Array.from({ length: total }, (_, i) => i).filter(
    (i) => !String(valores[i] ?? "").trim(),
  );

  return (
    <div className="space-y-2">
      <Label>Valores das variáveis</Label>
      {faltando.length > 0 && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm">
          <p className="text-destructive font-medium mb-1">
            Preencha as variáveis abaixo antes de enviar:
          </p>
          <ul className="list-disc list-inside text-destructive/80 space-y-0.5">
            {faltando.map((i) => (
              <li key={i}>
                <code className="bg-destructive/10 px-1 rounded text-[11px]">
                  {"{{"}
                  {i + 1}
                  {"}}"}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {Array.from({ length: total }, (_, i) => {
        const vazio = !String(valores[i] ?? "").trim();
        return (
          <div key={i} className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {"{{"}
              {i + 1}
              {"}}"}
            </Label>
            <Input
              value={valores[i] ?? ""}
              placeholder={EXEMPLOS_VARIAVEIS[i] ?? `Valor ${i + 1}`}
              className={vazio ? "border-destructive focus-visible:ring-destructive/20" : ""}
              onChange={(e) => {
                const novo = [...valores];
                novo[i] = e.target.value;
                onChange(novo);
              }}
            />
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground">
        O WhatsApp exige um valor para cada variável do corpo, na mesma ordem.
      </p>
    </div>
  );
}

function ComunicacoesPage() {
  const queryClient = useQueryClient();
  const getIndicadores = useServerFn(getIndicadoresComunicacoesFn);
  const listarCampanhas = useServerFn(listarCampanhasFn);
  const getConfig = useServerFn(getWhatsappConfigFn);
  const testarConexao = useServerFn(testarConexaoFn);
  const sincronizarTemplates = useServerFn(sincronizarTemplatesFn);
  const excluirTemplate = useServerFn(excluirTemplateMetaFn);
  const updateConfig = useServerFn(updateWhatsappConfigFn);
  const gerarToken = useServerFn(gerarNovoVerifyTokenFn);
  const getLogs = useServerFn(getWebhookLogsFn);
  const getLogsSincronizacao = useServerFn(getLogsSincronizacaoFn);
  const buscarDadosAutos = useServerFn(buscarDadosAutomaticosFn);
  const getTemplates = useServerFn(listarTemplatesFn);
  const listarContatosFn = useServerFn(listarContatosWhatsappFn);
  const listarSegmentosFn = useServerFn(listarSegmentosComTotalFn);
  const criarTemplate = useServerFn(criarTemplateMetaFn);
  const uploadMidia = useServerFn(uploadMidiaTemplateFn);
  const anexarMidia = useServerFn(anexarMidiaTemplateFn);
  const estimarPublico = useServerFn(estimarPublicoFn);
  const criarCampanha = useServerFn(criarCampanhaFn);
  const criarCampanhaDisparo = useServerFn(criarCampanhaDisparoFn);
  const processarDisparoAgora = useServerFn(processarDisparoAgoraFn);
  const alterarStatusCampanha = useServerFn(alterarStatusCampanhaFn);
  const atualizarCampanha = useServerFn(atualizarCampanhaFn);
  const excluirCampanha = useServerFn(excluirCampanhaFn);
  const listarCampanhasDetalhado = useServerFn(listarCampanhasDetalhadoFn);
  const enviarTeste = useServerFn(enviarTesteFn);
  const exemploDestinatario = useServerFn(exemploDestinatarioFn);
  const getAnuncios = useServerFn(getAnunciosAdmin);
  const getVeiculosAdmin = useServerFn(getVeiculosAdminFn);
  const processarEnvio = useServerFn(processarEnvioCampanhaFn);
  const getEnviosCampanha = useServerFn(getEnviosCampanhaFn);
  const getLogsCampanha = useServerFn(getLogsCampanhaFn);
  const getLogsDisparo = useServerFn(getLogsDisparoFn);
  const dispararCampanhaAgora = useServerFn(dispararCampanhaAgoraFn);
  const agendarDisparoCampanha = useServerFn(agendarDisparoCampanhaFn);
  const getAutomacoes = useServerFn(listarAutomacoesFn);
  const salvarAutomacao = useServerFn(salvarAutomacaoFn);
  const getExecucoes = useServerFn(getExecucoesAutomacaoFn);
  const listarTagsMarketing = useServerFn(listarMarketingTagsFn);
  const listarGruposUazapi = useServerFn(listarGruposUazapiFn);
  const obterConfigUazapi = useServerFn(getUazapiConfigFn);

  const [activeTab, setActiveTab] = useState("campanhas");
  const [selectedAutomacao, setSelectedAutomacao] = useState<any>(null);
  const [isExecucoesOpen, setIsExecucoesOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>({});
  const [webhookTokenGerado, setWebhookTokenGerado] = useState<string | null>(null);

  // Wizard Template State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  // Telefone do teste era fixo no código (5517999999999): a mensagem ia para um
  // número de exemplo e a resposta nunca chegava ao contato real.
  const [telefoneTeste, setTelefoneTeste] = useState("");
  const [templateParaExcluir, setTemplateParaExcluir] = useState<any>(null);
  const [templateParaTeste, setTemplateParaTeste] = useState<any>(null);
  const [valoresTeste, setValoresTeste] = useState<string[]>([]);
  // Anexo opcional do teste. Templates criados direto na Meta têm o
  // `header_handle` alfanumérico, que a Meta não aceita como `image.id`; subir
  // o binário na hora do teste resolve sem mexer no template.
  const [midiaTeste, setMidiaTeste] = useState<{
    base64: string;
    nome: string;
    tipo: string;
    preview: string;
  } | null>(null);
  const [buscaContato, setBuscaContato] = useState("");
  const [somenteElegiveis, setSomenteElegiveis] = useState(false);
  const [origemContatos, setOrigemContatos] = useState<"AMBOS" | "COMPRADORES" | "IMPORTADOS">(
    "AMBOS",
  );
  const [newTemplate, setNewTemplate] = useState<any>({
    name: "",
    category: "MARKETING",
    language: "pt_BR",
    components: [{ type: "BODY", text: "" }],
    // Anexo do cabeçalho. Fica fora de `components` porque o `media_id` da Meta
    // não pertence à estrutura do template: ele é resolvido no disparo.
    midia_id: null,
    midia_tipo: null,
    midia_nome: null,
    midia_arquivo_id: null,
  });
  // Estado só da tela: o arquivo escolhido ainda não subiu. A prévia usa o
  // dataURL; o disparo usa o `media_id` que volta do servidor.
  const [midiaTemplate, setMidiaTemplate] = useState<{
    nome: string;
    tipo: string;
    tamanho: number;
    preview: string;
  } | null>(null);
  // Imagem escolhida na campanha (não no template). Vale acima da imagem do
  // template no disparo.
  const [midiaCampanha, setMidiaCampanha] = useState<{
    nome: string;
    tipo: string;
    preview: string;
  } | null>(null);

  // Wizard Campanha State
  const [isCampanhaWizardOpen, setIsCampanhaWizardOpen] = useState(false);
  // Campanha Geral = comunicado sem veículo (convite para se cadastrar, aviso
  // institucional). Nela o passo 2 é pulado e `veiculo_id` fica vazio, que o
  // backend já aceita.
  const [campanhaGeral, setCampanhaGeral] = useState(false);
  const [campanhaStep, setCampanhaStep] = useState(1);
  const [novaCampanha, setNovaCampanha] = useState<any>({
    nome: "",
    veiculo_id: "",
    template_id: "",
    filtros: {
      tipo: "TODOS",
      status: "APROVADO",
      uf: "",
    },
    mapeamento_variaveis: {},
    agendado_para: null,
    // Imagem do cabeçalho da campanha. A Meta não deixa editar a imagem de
    // um template já aprovado, então a troca de imagem acontece na campanha.
    midia_id: null,
    midia_tipo: null,
    midia_nome: null,
    midia_arquivo_id: null,
    // Ritmo de envio: janela de trabalho e intervalo entre mensagens. O padrão
    // 08h–18h a cada 5 min é conservative — a Meta começa a limitar bem antes
    // de 80 msg/s, e qualidade baixa custa caro de recuperar.
    origem_publico: "AMBOS",
    segmento_id: null,
    janela_inicio: "08:00",
    janela_fim: "18:00",
    intervalo_minutos: 5,
    tags: [],
  });

  // Wizard Automação State
  const [isAutomacaoWizardOpen, setIsAutomacaoWizardOpen] = useState(false);
  const [automacaoStep, setAutomacaoStep] = useState(1);
  const [novaAutomacao, setNovaAutomacao] = useState<any>({
    nome: "",
    evento: "",
    publico: "",
    template_id: "",
    status: "RASCUNHO",
    config_envio: { momento: "IMEDIATO" },
    mapeamento_variaveis: [],
    // GRUPOS_UAZAPI: ids dos grupos ("120363...@g.us") escolhidos no wizard.
    regras: { grupos_alvo: [] },
  });

  // Removido duplicado handleSalvarAutomacao e automacoes query aqui

  const [estimativa, setEstimativa] = useState<any>({ total: 0, elegiveis: 0, nao_elegiveis: 0 });
  const [tagsSelecionadas, setTagsSelecionadas] = useState<string[]>([]);
  // "Só novos" x "todos": com true, quem já recebeu alguma campanha antes
  // sai da estimativa e da fila. O valor viaja em `dadosEstimativa`.
  const [apenasNovos, setApenasNovos] = useState(false);
  // Campanha aberta no detalhe de envios (contatos agendados, data e hora,
  // estado). A query em si vive abaixo, junto das outras.
  const [enviosCampanha, setEnviosCampanha] = useState<any>(null);
  // Reagendamento de disparo: campanha alvo + data/hora escolhida.
  const [agendarParaCampanha, setAgendarParaCampanha] = useState<any>(null);
  const [agendarParaValor, setAgendarParaValor] = useState("");
  const [enviosCampabela, setEnviosCampabela] = useState<any[] | null>(null);
  const [logsCampanha, setLogsCampanha] = useState<any[] | null>(null);
  // Paginação da lista de campanhas, do modal de envios e do log: sem isso,
  // com dezenas de campanhas a tela virava uma rolagem sem fim.
  const [paginaCampanhas, setPaginaCampanhas] = useState(1);
  const [paginaEnvios, setPaginaEnvios] = useState(1);
  const [paginaLogs, setPaginaLogs] = useState(1);
  // Edição de ajustes seguros (nome, agendamento, janela, intervalo) e
  // exclusão definitiva. A exclusão apaga a fila em cascata; os logs ficam
  // com campanha_id NULL para preservar a auditoria.
  const [editarCampanha, setEditarCampanha] = useState<any>(null);
  const [editarNome, setEditarNome] = useState("");
  const [editarAgendadoPara, setEditarAgendadoPara] = useState("");
  const [editarJanelaInicio, setEditarJanelaInicio] = useState("");
  const [editarJanelaFim, setEditarJanelaFim] = useState("");
  const [editarIntervalo, setEditarIntervalo] = useState("5");
  const [excluirCampanhaAlvo, setExcluirCampanhaAlvo] = useState<any>(null);

  // Canal de envio: Meta (template oficial) ou Uazapi (conexão nova — a única
  // rota que aceita grupos, já que a Meta não processa template para @g.us).
  const [canalEnvio, setCanalEnvio] = useState<"META" | "UAZAPI">("META");
  const [gruposAlvo, setGruposAlvo] = useState<string[]>([]);
  const [gruposUazapi, setGruposUazapi] = useState<any[]>([]);
  const [gruposPermitidosUazapi, setGruposPermitidosUazapi] = useState<string[]>([]);
  const [carregandoGrupos, setCarregandoGrupos] = useState(false);
  const [erroGrupos, setErroGrupos] = useState<string | null>(null);

  const carregarGruposUazapi = async () => {
    setCarregandoGrupos(true);
    setErroGrupos(null);
    try {
      // Os grupos marcados como permitidos na configuração (Marketing >
      // Uazapi) são os que aparecem aqui e na automação. Lista vazia = sem
      // filtro, mostra tudo da instância.
      const cfg: any = await obterConfigUazapi();
      const permitidos: string[] = Array.isArray(cfg?.data?.uazapi_grupos_permitidos)
        ? cfg.data.uazapi_grupos_permitidos
        : [];
      setGruposPermitidosUazapi(permitidos);
      // Sem este tempo limite a promessa podia ficar pendente para sempre (a
      // função servidora não descarta sozinha), e o botão travava em
      // "Carregando..." com o clique desabilitado — sem saída a não ser
      // recarregar a página.
      const r: any = await Promise.race([
        listarGruposUazapi(),
        new Promise((_, rej) =>
          setTimeout(
            () => rej(new Error("A listagem demorou demais. Tente de novo.")),
            40_000,
          ),
        ),
      ]);
      if (!r?.ok) throw new Error(r?.message || "Falha ao listar grupos.");
      const grupos = Array.isArray(r?.data) ? r.data : [];
      setGruposUazapi(grupos);
      if (!grupos.length) {
        setErroGrupos(
          "Nenhum grupo encontrado nesta instância. Confirme que a conexão está ativa e que este número participa de pelo menos um grupo.",
        );
      }
    } catch (e: any) {
      setErroGrupos(e?.message || "Falha ao listar grupos.");
    } finally {
      setCarregandoGrupos(false);
    }
  };

  // Só os grupos marcados como permitidos na configuração aparecem na
  // automação e no disparo. Sem nada marcado, mostra tudo da instância.
  const gruposVisiveisUazapi =
    gruposPermitidosUazapi.length > 0
      ? gruposUazapi.filter((g: any) => gruposPermitidosUazapi.includes(g.id))
      : gruposUazapi;

  const { data: indicadores } = useQuery({
    queryKey: ["wa-indicadores"],
    queryFn: () => getIndicadores(),
  });

  const { data: campanhas } = useQuery({
    queryKey: ["wa-campanhas"],
    queryFn: () => listarCampanhas(),
  });

  // A lista simples não traz a janela nem o status do template, que a tabela
  // usa para mostrar o ritmo e avisar quando o template não está aprovado.
  // Reflete sozinho porque o worker roda sozinho.
  const { data: campanhasDetalhadas } = useQuery({
    queryKey: ["wa-campanhas-detalhe"],
    queryFn: () => listarCampanhasDetalhado(),
    refetchInterval: 30_000,
  });

  const { data: config } = useQuery({
    queryKey: ["wa-config"],
    queryFn: () => getConfig(),
  });

  const { data: logs } = useQuery({
    queryKey: ["wa-logs"],
    queryFn: () => getLogs(),
  });

  // Log da sincronização de templates. Fica na aba Templates (perto do botão
  // "Sincronizar") porque é ali que o admin precisa ver o que a Meta
  // respondeu — o log geral é inundado pelos eventos do webhook e do motor.
  const { data: logsSincronizacao } = useQuery({
    queryKey: ["wa-logs-sincronizacao"],
    queryFn: () => getLogsSincronizacao(),
  });

  // Trilha do motor de disparo (todas as campanhas). Antes ela só aparecia
  // dentro do dialog de detalhe de cada campanha — esconder o registro do
  // disparo era exatamente o que fazia o admin achar que o motor não logava.
  const { data: logsDisparo } = useQuery({
    queryKey: ["wa-logs-disparo"],
    queryFn: () => getLogsDisparo(),
    refetchInterval: 20_000,
  });

  const {
    data: templates,
    error: erroTemplates,
    isFetching: buscandoTemplates,
    refetch: recarregarTemplates,
  } = useQuery({
    queryKey: ["wa-templates"],
    queryFn: () => getTemplates(),
    // Sem isto a falha de banco virava uma lista vazia e silenciosa. A
    // mensagem que chega aqui já é a causa real (SQLSTATE, coluna que falta),
    // e não o "Failed query: SELECT ... params: ..." do Drizzle.
    onError: (err: any) =>
      toast.error(`Erro ao carregar os templates: ${err?.message ?? "erro desconhecido"}`),
  });

  /**
   * Variáveis ({{1}}, {{2}}…) que o template escolhido na campanha pede,
   * derivadas do conteúdo real — antes o passo de mapeamento era decorativo
   * com {{1}}/{{2}}/{{3}} fixos e nada era salvo, então a Meta recusava o
   * disparo com "Preencha {{n}}".
   *
   * Fica DEPOIS da query de templates: declarada antes dela, o código lia a
   * `const templates` ainda na zona morta e a página inteira quebrava com
   * "Cannot access 'Q' before initialization" (nome minificado da variável).
   */
  // A API devolve `data` (objeto) ou array; se chegar outro formato, `?? []`
  // não protege o `.find`, então isso garante que é array de verdade.
  const listaTemplates = Array.isArray(templates)
    ? templates
    : Array.isArray((templates as any)?.data)
      ? (templates as any).data
      : [];
  const templateCampanha = listaTemplates.find((t: any) => t.id === novaCampanha.template_id);
  const totalVariaveis = contarVariaveisTemplate(templateCampanha);
  const variaveisTemplate = Array.from({ length: totalVariaveis }, (_, i) => i + 1);

  // A seleção de veículo usava getAnuncios filtrado por status PUBLICISHED:
  // só veículos já publicados apareciam, e a maioria dos cadastrados está em
  // outro estágio. Agora lista qualquer veículo e deixa o filtro de busca agir.
  const [buscaVeiculo, setBuscaVeiculo] = useState("");
  const { data: veiculosCampanha } = useQuery({
    queryKey: ["veiculos-campanha", buscaVeiculo],
    queryFn: () => getVeiculosAdmin({ data: { busca: buscaVeiculo.trim() || undefined } }),
    enabled: isCampanhaWizardOpen,
  });
  // Mesmo caso dos templates: a server fn devolve `{ ok, data }`, e o `?.find`
  // quebrava com "find is not a function" quando o passo 5 procurava o veículo
  // selecionado.
  const listaVeiculos = Array.isArray(veiculosCampanha)
    ? veiculosCampanha
    : Array.isArray(veiculosCampanha?.data)
      ? veiculosCampanha.data
      : [];

  // Etiquetas criadas no Marketing: é assim que uma campanha mira "só quem
  // recebeu esta etiqueta". A contagem vem junto, para a tela mostrar se a tag
  // tem 0 ou 200 contatos antes de você montar a fila.
  const { data: tagsMarketing } = useQuery({
    queryKey: ["wa-marketing-tags"],
    queryFn: () => listarTagsMarketing(),
  });
  // As etiquetas também chegam como `{ ok, data }`. Os chips leem `t.id` direto,
  // então garante array — e TEM que ficar depois da query: declarar antes de
  // `tagsMarketing` leria o const na zona morta e a página inteira quebraria
  // com "Cannot access 'Q' before initialization" (nome minificado).
  const listaTags = Array.isArray(tagsMarketing)
    ? tagsMarketing
    : Array.isArray(tagsMarketing?.data)
      ? tagsMarketing.data
      : [];

  // Contato real para a prévia e o teste. A query só dispara quando o wizard
  // abre e o mapeamento muda — é assim que a tela sabe o que cada {{n}} entrega
  // sem que você precise adivinhar. `origem` sem "IMPORTADOS" pega o primeiro
  // comprador/prospect disponível.
  const { data: exemploDestinatarioRes } = useQuery({
    queryKey: [
      "wa-exemplo-contato",
      novaCampanha.veiculo_id,
      novaCampanha.mapeamento_variaveis,
      novaCampanha.origem_publico,
    ],
    queryFn: () =>
      exemploDestinatario({
        data: {
          veiculoId: novaCampanha.veiculo_id ?? null,
          mapeamento: novaCampanha.mapeamento_variaveis ?? {},
          origem: novaCampanha.origem_publico ?? "AMBOS",
        },
      }),
    enabled: isCampanhaWizardOpen,
  });
  const exemplo = Array.isArray(exemploDestinatarioRes)
    ? exemploDestinatarioRes[0]
    : ((exemploDestinatarioRes as any)?.data ?? exemploDestinatarioRes ?? null);

  // A contagem com etiqueta tem que vir do servidor com a tag no critério:
  // `estimarPublico` ignora tag, então sem esta consulta a tela mostrava o
  // mesmo número com e sem etiqueta e a fila entrava diferente.
  const { data: estimativaTags } = useQuery({
    queryKey: [
      "wa-estimativa",
      tagsSelecionadas,
      novaCampanha.filtros.tipo,
      novaCampanha.filtros.uf,
      apenasNovos,
    ],
    queryFn: () =>
      estimarPublico({
        data: { ...novaCampanha.filtros, origem: "IMPORTADOS", tagIds: tagsSelecionadas, apenasNaoEnviados: apenasNovos },
      }),
    enabled: campanhaStep === 3 && tagsSelecionadas.length > 0,
  });

  // Contatos e segmentos: as abas mostravam linhas fictícias escritas no JSX, não
  // consultavam nada. Agora vêm do banco e respeitam busca e filtro.
  const { data: contatos } = useQuery({
    queryKey: ["wa-contatos", buscaContato.trim(), somenteElegiveis, origemContatos],
    queryFn: () =>
      listarContatosFn({
        data: {
          busca: buscaContato.trim() || undefined,
          apenasElegiveis: somenteElegiveis,
          origem: origemContatos,
        },
      }),
    enabled: activeTab === "contatos",
  });

  const { data: segmentos } = useQuery({
    queryKey: ["wa-segmentos-total"],
    queryFn: () => listarSegmentosFn(),
    enabled: activeTab === "segmentos",
  });

  const { data: automacoes, refetch: refetchAutomacoes } = useQuery({
    queryKey: ["wa-automacoes"],
    queryFn: () => getAutomacoes(),
    enabled: activeTab === "automacoes",
  });

  const { data: execucoesAutomacao } = useQuery({
    queryKey: ["automacao-execucoes", selectedAutomacao?.id],
    queryFn: () => getExecucoes(selectedAutomacao?.id),
    enabled: !!selectedAutomacao?.id && isExecucoesOpen,
  });

  const handleSalvarAutomacao = async () => {
    // O botão já fica desabilitado sem nome, mas o recorte aqui evita o voo cego
    // caso a validação do servidor mude.
    if (!novaAutomacao.nome.trim()) {
      toast.error("Informe o nome da automação.");
      return;
    }
    toast.promise(salvarAutomacao({ data: novaAutomacao }), {
      loading: "Salvando automação...",
      success: (res: any) => {
        // O servidor devolve `{ok:false, error}` em vez de lançar erro: sem este
        // desvio o toast de sucesso abria e a automação não existia.
        if (res && res.ok === false) {
          toast.error(res.error || "Não foi possível salvar a automação.");
          return;
        }
        setIsAutomacaoWizardOpen(false);
        refetchAutomacoes();
        setAutomacaoStep(1);
        return "Automação salva!";
      },
      error: (err) => `Erro: ${err.message}`,
    });
  };

  // A estimativa tem que levar origem e tags: sem origem o servidor assume
  // "AMBOS" (a contagem não mudava ao escolher "só lista importada") e sem a
  // tag ela ignorava a etiqueta que a tela mostrava — a tela prometia 500 e a
  // fila entrava com 3.
  const dadosEstimativa = {
    ...novaCampanha.filtros,
    origem: novaCampanha.origem_publico,
    tagIds: tagsSelecionadas,
    // O "só novos" precisa viajar junto: sem isto a tela estimava todos e a
    // fila entrava só com os novos (ou o contrário).
    apenasNaoEnviados: apenasNovos,
  };

  const handleEstimar = async () => {
    const res = await estimarPublico({ data: dadosEstimativa });
    setEstimativa(res);
  };

  // Fechar sem esquecer a etiqueta escolhida: se ela ficasse marcada, a próxima
  // campanha nasceria mirando o grupo da campanha anterior em silêncio.
  const handleFecharCampanha = () => {
    setIsCampanhaWizardOpen(false);
    setCampanhaGeral(false);
    setTagsSelecionadas([]);
    // Voltar o filtro para "todos": se "só novos" ficasse marcado, a próxima
    // campanha nasceria excluindo gente em silêncio.
    setApenasNovos(false);
    // Voltar o canal para META e limpar os grupos: se a opção Uazapi ficasse
    // marcada, a próxima campanha de contatos nasceria como campanha de grupo.
    setCanalEnvio("META");
    setGruposAlvo([]);
    setGruposUazapi([]);
    setErroGrupos(null);
    // A imagem escolhida na campanha é por campanha: se sobrasse, a próxima
    // nasceria com a imagem da anterior sem ninguém pedir.
    setMidiaCampanha(null);
    setNovaCampanha((atual: any) => ({
      ...atual,
      midia_id: null,
      midia_tipo: null,
      midia_nome: null,
      midia_arquivo_id: null,
    }));
  };

  const handleAbrirCampanha = () => {
    setCampanhaGeral(false);
    setTagsSelecionadas([]);
    setCanalEnvio("META");
    setGruposAlvo([]);
    setGruposUazapi([]);
    setErroGrupos(null);
    setMidiaCampanha(null);
    setNovaCampanha((atual: any) => ({
      ...atual,
      midia_id: null,
      midia_tipo: null,
      midia_nome: null,
      midia_arquivo_id: null,
    }));
    setIsCampanhaWizardOpen(true);
  };

  const handleSalvarCampanha = async (enviarAgora = false) => {
    // A nova fn carrega janela, intervalo e público; a antiga criarCampanha
    // continua existindo mas não recebe esses campos.
    // Campanha Geral não tem veículo, então o nome vem do título digitado —
    // sem isso o zod estourava "too_small" em `nome` no INSERT.
    const nome =
      campanhaGeral && !novaCampanha.nome.trim()
        ? "Campanha Geral"
        : novaCampanha.nome;
    toast.promise(
      criarCampanhaDisparo({
        data: {
          ...novaCampanha,
          nome,
          veiculo_id: campanhaGeral ? null : novaCampanha.veiculo_id,
          filtros: dadosEstimativa,
          // A tag tem que ir no topo também: o motor lê `tag_ids` primeiro e
          // só cai em `filtros.tagIds` como fallback. Sem isto a fila nascia
          // vazia e o motor marcava a campanha como concluída sem enviar nada.
          tag_ids: tagsSelecionadas,
          enviar_agora: enviarAgora,
          // O datetime-local devolve hora local do navegador. Convertemos para
          // ISO antes de mandar: se o servidor ler a string crua, o agendamento
          // entra 3h antes (fuso do servidor) e a campanha dispara cedo.
          agendado_para: novaCampanha.agendado_para
            ? new Date(novaCampanha.agendado_para).toISOString()
            : null,
          canal_envio: canalEnvio,
          grupos_alvo: canalEnvio === "UAZAPI" ? gruposAlvo : [],
        },
      }),
      {
        loading: "Salvando campanha e montando a fila...",
        success: (res: any) => {
          if (res.ok && res.id) {
            setIsCampanhaWizardOpen(false);
            queryClient.invalidateQueries({ queryKey: ["wa-campanhas"] });
            setTagsSelecionadas([]);
            const enviados = res.inseridos ?? 0;
            // A estimativa prometia contatos e a fila entrou vazia: avisar o
            // motivo evita a campanha nascer "concluída" sem ter enviado nada.
            // O motivo técnico vem do servidor (`res.erro`) — sem ele a tela
            // só dizia "confira a tag" mesmo quando o problema era outro.
            if (enviados === 0) {
              toast.warning(
                res.erro
                  ? `Nenhum contato entrou na fila. Motivo: ${res.erro}`
                  : "Nenhum contato entrou na fila. Confira se a tag tem prospects com telefone e que não estejam convertidos ou descartados.",
                { duration: 12000 }
              );
            }
            if (enviarAgora) {
              handleProcessarEnvio(res.id);
              return `Campanha criada com ${enviados} contatos. O envio respeita a janela e o intervalo configurados.`;
            }
            return `Campanha criada com ${enviados} contatos na fila.`;
          }
          throw new Error(res.error || "Erro ao salvar");
        },
        error: (err) => `Falha: ${err.message}`,
      },
    );
  };

  const handleProcessarEnvio = async (id: string) => {
    // O handler devolve `{ok:false, error}` em vez de lançar: sem esta
    // checagem o toast de sucesso aparecia mesmo quando o processamento falhava.
    try {
      const res: any = await processarEnvio({ data: id });
      if (res && res.ok === false) {
        toast.error(res.error || "Falha ao processar o envio da campanha.");
        return;
      }
      // O toast precisa refletir o que de fato aconteceu. "Enviado" (a Meta
      // aceitou) nao e "entregue" (o contato recebeu) — e ainda pode haver
      // falhas na fila. Sem isto a tela anunciava sucesso com campanha quebrada.
      const r = res?.resultado ?? {};
      const enviados = Number(r.enviados ?? 0);
      const falhas = Number(r.falhas ?? 0);
      const ignoradas = Number(r.ignoradas ?? 0);
      const pendentes = Number(r.pendentes ?? 0);
      if (enviados === 0 && falhas === 0 && pendentes === 0) {
        toast.info("Nenhuma mensagem foi enviada nesta rodada.");
        return;
      }
      const partes = [`${enviados} enviada(s)`];
      if (falhas) partes.push(`${falhas} falha(s)`);
      if (ignoradas) partes.push(`${ignoradas} ignorada(s)`);
      if (pendentes) partes.push(`${pendentes} ainda na fila`);
      if (falhas > 0) {
        toast.error(`Envio parcial: ${partes.join(", ")}.`);
      } else {
        toast.success(`Envio processado: ${partes.join(", ")}.`);
      }
      queryClient.invalidateQueries({ queryKey: ["wa-campanhas"] });
      queryClient.invalidateQueries({ queryKey: ["wa-campanhas-detalhe"] });
    } catch (err: any) {
      toast.error(`Erro no processamento: ${err.message}`);
    }
  };

  // `valores` entra como parâmetro porque o botão da campanha já monta a lista na
  // hora do clique: depender do estado aqui lia o valor anterior ao set e o teste
  // saía com variável vazia.
  const handleEscolherMidiaTeste = (file: File) => {
    const tipo = file.type || "";
    const ehImagem = tipo.startsWith("image/");
    const ehPdf = tipo === "application/pdf";
    if (!ehImagem && !ehPdf) {
      toast.error("O cabeçalho aceita apenas imagem ou PDF.");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("O arquivo excede 16 MB (limite da Meta).");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      setMidiaTeste({
        base64: dataUrl,
        nome: file.name,
        tipo: ehPdf ? "application/pdf" : tipo,
        preview: ehImagem ? dataUrl : "",
      });
      toast.success(`${file.name} pronto para o teste.`);
    };
    reader.readAsDataURL(file);
  };

  const handleEnviarTeste = async (valores: string[] = valoresTeste) => {
    const digitos = telefoneTeste.replace(/\D/g, "");
    if (digitos.length < 10 || digitos.length > 13) {
      toast.error("Informe o telefone com DDD e código do país. Ex: 5511999999999");
      return;
    }
    // Serve aos dois lugares: o teste avulso na aba de Templates (usa o
    // template escolhido na tabela) e o da campanha (usa o da etapa 4).
    const templateId = templateParaTeste?.id || novaCampanha.template_id;
    if (!templateId) {
      toast.error("Escolha um template antes de enviar o teste.");
      return;
    }

    // Valida se todas as variáveis estão preenchidas
    const template = templateParaTeste;
    const total = contarVariaveisTemplate(template);
    if (total > 0) {
      const faltando = Array.from({ length: total }, (_, i) => i).filter(
        (i) => !String(valores[i] ?? "").trim(),
      );
      if (faltando.length > 0) {
        const vars = faltando.map((i) => `{{${i + 1}}}`).join(", ");
        toast.error(`Preencha as variáveis ${vars} antes de enviar o teste.`);
        return;
      }
    }

    toast.promise(
      enviarTeste({
        data: {
          telefone: digitos,
          template_id: templateId,
          variaveis: valores,
          // Anexo opcional: se o template tem HEADER de mídia sem id válido
          // (criado direto na Meta), o binário é reenviado na hora do teste.
          midia_base64: midiaTeste?.base64,
          midia_nome: midiaTeste?.nome,
          midia_tipo: midiaTeste?.tipo,
        },
      }),
      {
        loading: "Enviando teste...",
        success: (res: any) => {
          if (res && res.ok === false) throw new Error(res.error || "Erro ao enviar teste");
          setTemplateParaTeste(null);
          // A Meta devolve 200 mesmo para números que não existem, então o
          // "enviado com sucesso" sem o id da mensagem não prova nada. O id
          // é o que permite conferir na Central de Conversas se a mensagem
          // de fato saiu.
          const id = res?.messages?.[0]?.id;
          return id
            ? `Teste enviado! Id da Meta: ${id}. Confira na Central de Conversas se chegou.`
            : "Teste enviado! Confira na Central de Conversas se a mensagem chegou.";
        },
        error: (err) => `Erro: ${err.message}`,
      },
    );
  };

  const handleAlterarStatus = async (campanha: any, status: string) => {
    const res: any = await alterarStatusCampanha({ data: { id: campanha.id, status } }).catch(
      (e: any) => ({ ok: false, error: e?.message || String(e) }),
    );
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["wa-campanhas"] });
      toast.success(`Campanha ${status === "PAUSADA" ? "pausada" : "retomada"}.`);
    } else {
      toast.error(res.error || "Erro ao alterar a campanha.");
    }
  };

  // Abre o modal de edição preenchido com os valores atuais. Só ajustes
  // seguros: nome, agendamento, janela e intervalo. O datetime-local espera
  // "YYYY-MM-DDTHH:mm"; o ISO do banco é convertido para esse formato.
  const handleAbrirEdicao = (campanha: any) => {
    setEditarCampanha(campanha);
    setEditarNome(campanha.nome ?? "");
    setEditarAgendadoPara(
      campanha.agendado_para
        ? new Date(campanha.agendado_para).toISOString().slice(0, 16)
        : "",
    );
    setEditarJanelaInicio(campanha.janela_inicio ?? "");
    setEditarJanelaFim(campanha.janela_fim ?? "");
    setEditarIntervalo(String(campanha.intervalo_minutos ?? 5));
  };

  const handleSalvarEdicao = async () => {
    if (!editarCampanha) return;
    const res: any = await atualizarCampanha({
      data: {
        id: editarCampanha.id,
        nome: editarNome,
        agendado_para: editarAgendadoPara
          ? new Date(editarAgendadoPara).toISOString()
          : null,
        janela_inicio: editarJanelaInicio || null,
        janela_fim: editarJanelaFim || null,
        intervalo_minutos: Number(editarIntervalo) || 5,
      },
    }).catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["wa-campanhas"] });
      toast.success("Campanha atualizada.");
      setEditarCampanha(null);
    } else {
      toast.error(res.error || "Erro ao atualizar a campanha.");
    }
  };

  const handleExcluirCampanha = async () => {
    if (!excluirCampanhaAlvo) return;
    const res: any = await excluirCampanha({ data: { id: excluirCampanhaAlvo.id } }).catch(
      (e: any) => ({ ok: false, error: e?.message || String(e) }),
    );
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["wa-campanhas"] });
      toast.success("Campanha excluída.");
      setExcluirCampanhaAlvo(null);
    } else {
      toast.error(res.error || "Erro ao excluir a campanha.");
    }
  };

  // O worker roda sozinho a cada minuto; este botão serve para não esperar o
  // próximo ciclo depois de criar ou agendar. Recebe o id da campanha para
  // processar só ela (antes rodava todas).
  const handleProcessarAgora = async (campanhaId?: string) => {
    if (campanhaId) {
      await handleProcessarEnvio(campanhaId);
      return;
    }
    const res: any = await processarDisparoAgora().catch((e: any) => ({
      ok: false,
      error: e?.message || String(e),
    }));
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ["wa-campanhas"] });
      toast.success("Disparo processado.");
    } else {
      toast.error(res.error || "Erro ao processar o disparo.");
    }
  };

  // "Disparar agora": o pedido do admin ignora a janela de trabalho e o
  // horario agendado. A campanha entra em PROCESSANDO na hora e a fila comeca
  // a sair no ritmo definido (a cada N minutos), com horario proprio por
  // destinatario.
  const handleDispararAgora = async (campanha: any) => {
    try {
      const res: any = await dispararCampanhaAgora({ data: { id: campanha.id } }).catch(
        (e: any) => ({ ok: false, error: e?.message || String(e) }),
      );
      if (res?.ok === false) {
        toast.error(res.error || "Erro ao disparar a campanha agora.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["wa-campanhas"] });
      queryClient.invalidateQueries({ queryKey: ["wa-campanhas-detalhe"] });
      queryClient.invalidateQueries({ queryKey: ["wa-logs-disparo"] });
      toast.success(`Disparo de "${campanha.nome}" iniciado.`);
    } catch (err: any) {
      toast.error(`Erro ao disparar: ${err.message}`);
    }
  };

  // "Agendar disparo": reagenda a campanha e reescala a fila para o novo
  // horario. A fila nasce como roteiro - cada destinatario com a hora em que sai.
  const handleAgendarDisparo = async () => {
    if (!agendarParaCampanha) return;
    if (!agendarParaValor) {
      toast.error("Escolha a data e a hora do disparo.");
      return;
    }
    // O campo datetime-local devolve hora local do navegador (Brasilia). Sem
    // converter, o servidor leria como UTC e o disparo sairia 3h antes.
    const quando = new Date(agendarParaValor);
    if (Number.isNaN(quando.getTime())) {
      toast.error("Data e hora do disparo invalidas.");
      return;
    }
    try {
      const res: any = await agendarDisparoCampanha({
        data: { id: agendarParaCampanha.id, agendado_para: quando.toISOString() },
      }).catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
      if (res?.ok === false) {
        toast.error(res.error || "Erro ao agendar o disparo.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["wa-campanhas"] });
      setAgendarParaCampanha(null);
      setAgendarParaValor("");
      toast.success("Disparo agendado. A fila foi distribuida no novo ritmo.");
    } catch (err: any) {
      toast.error(`Erro ao agendar: ${err.message}`);
    }
  };

  // Carrega a fila da campanha aberta no detalhe. Fechar o detalhe limpa a
  // lista: sem isto a tabela do card seguinte mostrava os contatos da
  // campanha anterior.
  useEffect(() => {
    if (!enviosCampanha?.id) {
      setEnviosCampabela(null);
      setLogsCampanha(null);
      return;
    }
    let ativo = true;
    // `useServerFn` chama a server fn direto no browser: por isso ela e POST
    // (GET rodaria no cliente, sem DATABASE_URL, e voltaria vazia).
    getEnviosCampanha({ data: enviosCampanha.id })
      .then((dados: any) => {
        if (!ativo) return;
        // O motor guarda o nome em `variaveis->>'contato.nome'`; a query já
        // devolve esse valor pronto.
        setEnviosCampabela(dados ?? []);
      })
      .catch(() => {
        if (ativo) setEnviosCampabela([]);
      });
    getLogsCampanha({ data: enviosCampanha.id })
      .then((dados: any) => {
        if (ativo) setLogsCampanha(dados ?? []);
      })
      .catch(() => {
        if (ativo) setLogsCampanha([]);
      });
    return () => {
      ativo = false;
    };
  }, [enviosCampanha?.id]);

  const handleExportarContatos = () => {
    if (!contatos?.length) {
      toast.error("Nada para exportar.");
      return;
    }
    baixarCsv(
      "contatos-whatsapp.csv",
      paraCsv([
        [
          "Nome",
          "WhatsApp",
          "Email",
          "Cidade",
          "UF",
          "Origem",
          "Compliance",
          "Status WhatsApp",
          "Elegivel",
          "Motivo",
        ],
        ...contatos.map((c: any) => [
          c.nome,
          c.telefone,
          c.email,
          c.cidade,
          c.uf,
          c.origem,
          c.status_compliance ?? "",
          c.whatsapp_status ?? "",
          c.elegivel ? "Sim" : "Nao",
          c.motivo_inelegivel ?? "",
        ]),
      ]),
    );
  };

  const handleExcluirTemplate = async () => {
    if (!templateParaExcluir) return;
    const res: any = await excluirTemplate({
      data: {
        meta_name: templateParaExcluir.meta_name,
        // O id que a Meta devolveu: sem ele a exclusão depende só do nome, e
        // um nome com diferença de caixa/espaços faz a API recusar com
        // "Invalid parameter".
        meta_id: templateParaExcluir.meta_id ?? null,
      },
    }).catch((e: any) => ({ ok: false, error: e?.message || String(e) }));
    if (res?.ok) {
      toast.success(
        res.removidoNaMeta
          ? "Template excluído na Meta e no sistema."
          : "Removido do sistema. Ele já não existia na Meta.",
      );
      setTemplateParaExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
    } else {
      toast.error(`Erro ao excluir: ${res?.error || "erro desconhecido"}`);
    }
  };

  const handleSincronizar = async () => {
    toast.promise(sincronizarTemplates(), {
      loading: "Sincronizando com a Meta...",
      success: (res: any) => {
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
          // O log da sincronização é o registro do que a Meta respondeu: sem
          // invalidá-lo, a aba Templates continuava mostrando o log da
          // sincronização anterior e parecia que o botão não fazia nada.
          queryClient.invalidateQueries({ queryKey: ["wa-logs-sincronizacao"] });
          queryClient.invalidateQueries({ queryKey: ["wa-logs"] });
          // A contagem é o que foi REALMENTE gravado, não o que a Meta
          // devolveu: um template que falha ao salvar não pode entrar na
          // conta, senão a tela anuncia uma sincronização que não aconteceu.
          const salvos = Number(res.salvos ?? res.count ?? 0);
          const lidos = Number(res.lidos ?? salvos);
          const falhas = Array.isArray(res.falhas) ? res.falhas : [];
          if (falhas.length) {
            toast.warning(
              `${salvos} de ${lidos} templates sincronizados. ${falhas.length} falharam: ${falhas
                .map((f: any) => f?.nome)
                .slice(0, 3)
                .join(", ")}${falhas.length > 3 ? "…" : ""}`,
            );
          }
          if (salvos === 0 && lidos === 0) {
            return "Nenhum template encontrado na Meta.";
          }
          // "Sincronizado" sem ressalva quando nada foi gravado é mentira: a
          // Meta devolveu templates e nenhum entrou no banco.
          if (salvos === 0) {
            return `A Meta devolveu ${lidos} template${lidos === 1 ? "" : "s"}, mas nenhum foi gravado.`;
          }
          // O que a Meta mandou, por status. Sem isso a tela só dizia
          // "sincronizado" e não havia como perceber que a Meta tinha 3
          // aprovados e o sistema mostrava menos — a divergência aparecia
          // como "não sincronizou", sem número nenhum para conferir.
          const resumoStatus =
            res.porStatus && typeof res.porStatus === "object"
              ? Object.entries(res.porStatus)
                  .map(([status, total]) => `${rotuloStatus(status)}: ${total}`)
                  .join(" · ")
              : "";
          // A Meta informa quantos templates ela tem. Quando esse número é
          // maior do que lemos, a diferença é a resposta para "não
          // sincroniza": a listagem não-devolveu tudo, e o admin precisa ver
          // essa conta, não um "sincronizado" sem número.
          const totalMeta = Number(res.totalMeta ?? 0);
          const faltando =
            Number.isFinite(totalMeta) && totalMeta > 0 ? totalMeta - lidos : 0;
          const aviso =
            faltando > 0
              ? ` Atenção: a Meta informa ${totalMeta} template${totalMeta === 1 ? "" : "s"} ` +
                `no total e a listagem devolveu ${lidos} — ${faltando} não vieram.`
              : "";
          return (
            `${salvos} template${salvos === 1 ? "" : "s"} sincronizado${salvos === 1 ? "" : "s"}!` +
            (resumoStatus ? ` (${resumoStatus})` : "") +
            aviso
          );
        }
        throw new Error(res.error);
      },
      error: (err) => {
        // Mesmo falhando, a tentativa fica registrada no log — é justamente
        // aí que o admin vê a resposta da Meta.
        queryClient.invalidateQueries({ queryKey: ["wa-logs-sincronizacao"] });
        return `Erro na sincronização: ${err.message}`;
      },
    });
  };

  /**
   * Anexo do cabeçalho do template. Sobes para a Meta antes do "Enviar para
   * Análise": o `media_id` precisa existir para o disparo anexar a mídia, mas
   * a Meta não devolve erro de template pendente — então o upload acontece
   * aqui, na hora de escolher o arquivo, e o resultado fica no `newTemplate`.
   */
  const handleEscolherMidiaTemplate = (file: File) => {
    const tipo = file.type || "";
    const ehImagem = tipo.startsWith("image/");
    const ehPdf = tipo === "application/pdf";
    if (!ehImagem && !ehPdf) {
      toast.error("O cabeçalho aceita apenas imagem ou PDF.");
      return;
    }
    // A Meta limita envio de mídia a 16 MB; acima disso o Graph API devolve 413.
    if (file.size > 16 * 1024 * 1024) {
      toast.error("O arquivo excede 16 MB (limite da Meta).");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      setMidiaTemplate({
        nome: file.name,
        // O estado guarda o tipo no formato da Meta ("image"/"document"), e não
        // o MIME do arquivo. A tela compara com "document" para mostrar o
        // ícone de PDF; com "application/pdf" o PDF caía no ramo da imagem e
        // aparecia como imagem quebrada.
        tipo: ehPdf ? "document" : "image",
        tamanho: file.size,
        preview: ehImagem ? dataUrl : "",
      });
      toast.promise(
        (async () => {
          const res: any = await uploadMidia({ data: { arquivo: dataUrl, nome: file.name, tipo } });
          if (!res?.ok) throw new Error(res?.error || "Falha no upload da mídia.");
          setNewTemplate((atual: any) => ({
            ...atual,
            midia_id: res.midia_id,
            midia_tipo: res.midia_tipo,
            midia_nome: res.midia_nome,
            midia_arquivo_id: res.midia_arquivo_id,
            // HEADER de mídia: sem texto, o formato diz à Meta o que renderizar.
            components: [
              { type: "HEADER", format: res.midia_tipo === "document" ? "DOCUMENT" : "IMAGE" },
              ...atual.components.filter((c: any) => c.type !== "HEADER"),
            ],
          }));
          return res.midia_nome as string;
        })(),
        {
          loading: `Subindo ${file.name} para a Meta...`,
          success: (nome: string) => `${nome} anexado ao template.`,
          error: (err: Error) => `Erro no anexo: ${err.message}`,
        },
      );
    };
    reader.readAsDataURL(file);
  };

  /**
   * Reanexa a mídia do cabeçalho em um template que já existe. Templates
   * sincronizados do WhatsApp Manager chegam sem binário local, e o
   * `header_handle` da Meta é uma URL — nenhuma das duas serve como
   * `image.id`, então o HEADER de mídia matava o envio do disparo.
   */
  const handleAnexarMidiaExistente = (template: any, file: File) => {
    const tipo = file.type || "";
    const ehImagem = tipo.startsWith("image/");
    const ehPdf = tipo === "application/pdf";
    if (!ehImagem && !ehPdf) {
      toast.error("O cabeçalho aceita apenas imagem ou PDF.");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("O arquivo excede 16 MB (limite da Meta).");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      toast.promise(
        (async () => {
          const res: any = await anexarMidia({
            data: {
              template_id: template.id,
              arquivo: dataUrl,
              nome: file.name,
              tipo,
            },
          });
          if (!res?.ok) throw new Error(res?.error || "Falha ao anexar a mídia.");
          // A lista de templates mostra o anexo salvo: recarrega para refletir.
          queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
          return file.name;
        })(),
        {
          loading: `Subindo ${file.name} para a Meta...`,
          success: (nome: string) => `${nome} anexado. O disparo já vai com a imagem.`,
          error: (err: Error) => `Erro no anexo: ${err.message}`,
        },
      );
    };
    reader.readAsDataURL(file);
  };

  /**
   * Imagem do cabeçalho da campanha. A Meta não deixa editar a imagem de um
   * template já aprovado, então a troca de imagem acontece na própria
   * campanha: o arquivo sobe para a Meta e a cópia local fica guardada, como
   * no template — sem ela o `media_id` (que vence em 30 dias) não dá para
   * refazer o upload.
   */
  const handleEscolherMidiaCampanha = (file: File) => {
    const tipo = file.type || "";
    const ehImagem = tipo.startsWith("image/");
    const ehPdf = tipo === "application/pdf";
    if (!ehImagem && !ehPdf) {
      toast.error("O cabeçalho aceita apenas imagem ou PDF.");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("O arquivo excede 16 MB (limite da Meta).");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      setMidiaCampanha({
        nome: file.name,
        tipo: ehPdf ? "document" : "image",
        preview: ehImagem ? dataUrl : "",
      });
      toast.promise(
        (async () => {
          const res: any = await uploadMidia({ data: { arquivo: dataUrl, nome: file.name, tipo } });
          if (!res?.ok) throw new Error(res?.error || "Falha no upload da imagem.");
          setNovaCampanha((atual: any) => ({
            ...atual,
            midia_id: res.midia_id,
            midia_tipo: res.midia_tipo,
            midia_nome: res.midia_nome,
            midia_arquivo_id: res.midia_arquivo_id,
          }));
          return res.midia_nome as string;
        })(),
        {
          loading: `Subindo ${file.name} para a Meta...`,
          success: (nome: string) => `${nome} anexada à campanha.`,
          error: (err: Error) => `Erro no anexo: ${err.message}`,
        },
      );
    };
    reader.readAsDataURL(file);
  };

  const handleCriarTemplate = async () => {
    // Um HEADER de mídia sem `media_id` significa que o upload falhou ou
    // nunca rodou: a Meta recusa o template e o disparo não teria anexo.
    const header = newTemplate.components.find((c: any) => c.type === "HEADER");
    const headerEhMidia = String(header?.format || "TEXT").toUpperCase() !== "TEXT";
    if (headerEhMidia && !newTemplate.midia_id) {
      toast.error(
        "O anexo do cabeçalho ainda não subiu. Selecione a imagem ou PDF antes de continuar.",
      );
      return;
    }
    toast.promise(criarTemplate({ data: newTemplate }), {
      loading: "Enviando para análise da Meta...",
      success: (res: any) => {
        // O servidor só devolve `id` quando a criação foi CONFIRMADA na Meta.
        // Sem a confirmação, o servidor devolve `{ok:false, error}` com o
        // motivo — e o template não é gravado aqui, para não existir na
        // plataforma sem existir na Meta.
        if (res?.ok && res?.id) {
          setIsWizardOpen(false);
          setWizardStep(1);
          setNewTemplate({
            name: "",
            category: "MARKETING",
            language: "pt_BR",
            components: [{ type: "BODY", text: "" }],
            midia_id: null,
            midia_tipo: null,
            midia_nome: null,
            midia_arquivo_id: null,
          });
          setMidiaTemplate(null);
          queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
          queryClient.invalidateQueries({ queryKey: ["wa-logs-disparo"] });
          queryClient.invalidateQueries({ queryKey: ["wa-logs"] });
          return "Template criado na Meta e enviado para análise!";
        }
        throw new Error(res?.error || "Erro ao criar template");
      },
      error: (err) => {
        queryClient.invalidateQueries({ queryKey: ["wa-logs-disparo"] });
        return `Falha: ${err.message}`;
      },
    });
  };

  const handleTestarConexao = async () => {
    toast.promise(testarConexao(), {
      loading: "Validando credenciais com a Meta...",
      success: (res: any) => {
        if (res && typeof res === "object" && "ok" in res && res.ok) {
          queryClient.invalidateQueries({ queryKey: ["wa-config"] });
          return "✓ Conexão validada com sucesso!";
        }
        throw new Error((res as any)?.error || "Erro desconhecido");
      },
      error: (err) => `Erro: ${err.message}`,
    });
  };

  const handleSaveConfig = async () => {
    // O useServerFn do TanStack Start só popula `data` quando o objeto { data }
    // é passado. Chamado com o argumento solto, `data` chega undefined no
    // servidor: o UPDATE roda, não erra, não grava — e a tela confirma "salvado".
    // Todas as outras server fns do arquivo já usavam o padrão { data }.
    const res: any = await updateConfig({ data: editingConfig }).catch((e: any) => ({
      ok: false,
      error: e?.message || String(e),
    }));
    if (res?.ok) {
      toast.success("Configurações salvas!");
      setIsConfigOpen(false);
      setEditingConfig({});
      queryClient.invalidateQueries({ queryKey: ["wa-config"] });
    } else {
      toast.error(`Erro ao salvar configurações: ${res?.error || "erro desconhecido"}`);
    }
  };

  const handleGerarToken = async () => {
    try {
      const res = await gerarToken();
      if (!res?.ok) {
        throw new Error(res?.error || "Não foi possível gerar o token.");
      }
      setWebhookTokenGerado(res.token);
      toast.success("Novo Verify Token gerado! Copie o token exibido na tela.");
      queryClient.invalidateQueries({ queryKey: ["wa-config"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar token.");
    }
  };

  const handleBuscarDadosAutos = async () => {
    toast.promise(buscarDadosAutos(), {
      loading: "Buscando dados na Meta...",
      success: (res: any) => {
        if (res.ok) {
          // Preencher campos se vierem no data
          toast.success("Dados recuperados!");
          return "Dados sincronizados";
        }
        throw new Error(res.error);
      },
      error: (err) => `Erro: ${err.message}`,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência!");
  };

  return (
    <div className="p-6 space-y-6 pb-20">
      {/* Header com Indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Campanhas</p>
                <h3 className="text-2xl font-bold">{indicadores?.total_campanhas ?? 0}</h3>
              </div>
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                <Send className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Leituras</p>
                <h3 className="text-2xl font-bold">{indicadores?.total_lidas ?? 0}</h3>
              </div>
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Elegíveis (WhatsApp)</p>
                <h3 className="text-2xl font-bold">{indicadores?.compradores_elegiveis ?? 0}</h3>
              </div>
              <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-full">
                <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status Conexão</p>
                <div className="flex items-center gap-2 mt-1">
                  <div
                    className={`w-2 h-2 rounded-full ${config?.status === "CONECTADO" ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
                  />
                  <span className="text-sm font-bold">{config?.status || "DESCONECTADO"}</span>
                </div>
              </div>
              <div
                className={`p-2 ${config?.status === "CONECTADO" ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"} rounded-full`}
              >
                <Globe
                  className={`w-5 h-5 ${config?.status === "CONECTADO" ? "text-green-600" : "text-red-600"}`}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="campanhas" className="w-full">
        <TabsList className="flex w-full overflow-x-auto bg-muted/50 p-1 mb-6 border-b rounded-none justify-start h-auto gap-2">
          <TabsTrigger
            value="campanhas"
            className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Campanhas
          </TabsTrigger>
          <TabsTrigger
            value="automacoes"
            className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Automações
          </TabsTrigger>
          <TabsTrigger
            value="segmentos"
            className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Segmentos
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Templates
          </TabsTrigger>
          <TabsTrigger
            value="contatos"
            className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Contatos
          </TabsTrigger>
          <TabsTrigger
            value="logs"
            className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Logs
          </TabsTrigger>
          <TabsTrigger
            value="config"
            className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md"
          >
            Configurações
          </TabsTrigger>
        </TabsList>

        {/* Campanhas */}
        <TabsContent value="campanhas" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Campanhas de Divulgação</h2>
              <p className="text-sm text-muted-foreground">
                Envios em massa pelo WhatsApp Cloud API
              </p>
            </div>
            <Dialog
              open={isCampanhaWizardOpen}
              onOpenChange={(aberto) => (aberto ? handleAbrirCampanha() : handleFecharCampanha())}
            >
              <DialogTrigger asChild>
                <Button className="bg-teal-600 hover:bg-teal-700">
                  <Plus className="w-4 h-4 mr-2" /> Nova Campanha
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    Nova Campanha (Etapa {campanhaStep}/7)
                    {campanhaGeral && campanhaStep > 2 ? " — Campanha Geral" : ""}
                  </DialogTitle>
                  <DialogDescription>
                    Divulgue veículos ou envie comunicados gerais
                  </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                  {campanhaStep === 1 && (
                    <div className="space-y-6">
                      <Label className="text-lg">O que você deseja divulgar?</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <Card
                          className={cn(
                            "cursor-pointer border-2 hover:border-teal-500 transition-all",
                            novaCampanha.veiculo_id && !campanhaGeral
                              ? "border-teal-600 bg-teal-50"
                              : "border-slate-200",
                          )}
                          onClick={() => {
                            setCampanhaGeral(false);
                            setCampanhaStep(2);
                          }}
                        >
                          <CardContent className="p-6 text-center space-y-3">
                            <Car className="w-10 h-10 mx-auto text-teal-600" />
                            <h3 className="font-bold">Veículo Específico</h3>
                            <p className="text-xs text-muted-foreground">
                              Envie fotos e detalhes de um anúncio ativo
                            </p>
                          </CardContent>
                        </Card>
                        <Card
                          className={cn(
                            "cursor-pointer border-2 hover:border-teal-500 transition-all",
                            !novaCampanha.veiculo_id && !campanhaGeral
                              ? "border-teal-600 bg-teal-50"
                              : "border-slate-200",
                          )}
                          onClick={() => {
                            setCampanhaGeral(true);
                            // `null`, não "": o zod do servidor aceita uuid ou
                            // null. String vazia estourava "invalid_format" no
                            // veiculo_id na hora de salvar a campanha.
                            setNovaCampanha({ ...novaCampanha, veiculo_id: null, nome: "" });
                            setCampanhaStep(3);
                          }}
                        >
                          <CardContent className="p-6 text-center space-y-3">
                            <Megaphone className="w-10 h-10 mx-auto text-teal-600" />
                            <h3 className="font-bold">Campanha Geral</h3>
                            <p className="text-xs text-muted-foreground">
                              Comunicados institucionais, avisos ou convites — sem vínculo com um
                              veículo
                            </p>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  )}

                  {campanhaStep === 2 && (
                    <div className="space-y-4">
                      <Label>Escolha o Veículo</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          placeholder="Buscar por placa, marca, modelo ou vendedor..."
                          className="pl-10"
                          value={buscaVeiculo}
                          onChange={(e) => setBuscaVeiculo(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2">
                        {veiculosCampanha?.data?.length === 0 && (
                          <p className="py-6 text-center text-sm text-muted-foreground">
                            {buscaVeiculo.trim()
                              ? `Nenhum veículo encontrado para "${buscaVeiculo.trim()}".`
                              : "Nenhum veículo cadastrado ainda."}
                          </p>
                        )}
                        {listaVeiculos.map((veiculo: any) => (
                          <div
                            key={veiculo.id}
                            onClick={() => {
                              setCampanhaGeral(false);
                              setNovaCampanha({
                                ...novaCampanha,
                                veiculo_id: veiculo.id,
                                nome: `${veiculo.marca} ${veiculo.modelo} - ${veiculo.placa}`,
                              });
                              setCampanhaStep(3);
                            }}
                            className={cn(
                              "flex items-center gap-4 p-3 border rounded-lg cursor-pointer hover:border-teal-500 transition-all",
                              novaCampanha.veiculo_id === veiculo.id
                                ? "border-teal-600 bg-teal-50"
                                : "border-slate-100",
                            )}
                          >
                            <div className="w-16 h-12 bg-slate-100 rounded overflow-hidden shrink-0">
                              <Car className="w-full h-full p-3 text-slate-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate">
                                {veiculo.marca} {veiculo.modelo}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>{veiculo.placa}</span>
                                {veiculo.vendedor_nome && (
                                  <>
                                    <span>•</span>
                                    <span className="truncate">{veiculo.vendedor_nome}</span>
                                  </>
                                )}
                                {veiculo.status_analise && (
                                  <Badge variant="outline" className="text-[8px] px-1 h-3">
                                    {veiculo.status_analise}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {campanhaStep === 3 && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-end">
                        <Label className="text-lg">Público Alvo</Label>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-teal-600">
                            {tagsSelecionadas.length
                              ? (estimativaTags?.elegiveis ?? "…")
                              : estimativa.elegiveis}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Elegíveis para WhatsApp
                          </p>
                        </div>
                      </div>

                      {/* Canal de envio. A Meta não processa template para grupo
                          (@g.us), então enviar em grupo só existe pela conexão
                          Uazapi — por isso a escolha é uma só e não duas. */}
                      <div className="space-y-2">
                        <Label>Canal de envio</Label>
                        <div className="flex flex-col sm:flex-row gap-3">
                          {[
                            {
                              value: "META" as const,
                              label: "Meta API (oficial)",
                              desc: "Template aprovado, número a número. Para contatos e listas.",
                            },
                            {
                              value: "UAZAPI" as const,
                              label: "Conexão (Uazapi)",
                              desc: "Texto livre pelo número conectado. É a única rota que aceita grupos.",
                            },
                          ].map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => {
                                setCanalEnvio(o.value);
                                // Grupo escolhido em outra campanha não pode
                                // sobrar marcado aqui: a fila nasceria com
                                // destinatário que ninguém revisou.
                                if (o.value === "META") setGruposAlvo([]);
                              }}
                              className={`flex-1 rounded-lg border p-3 text-left ${
                                canalEnvio === o.value
                                  ? "border-teal-600 bg-teal-50 dark:bg-teal-950/40"
                                  : "border-slate-200 bg-white"
                              }`}
                            >
                              <p className="text-sm font-bold">{o.label}</p>
                              <p className="text-xs text-muted-foreground">{o.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {canalEnvio === "UAZAPI" && (
                        <div className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/50 dark:bg-teal-950/20 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <Label>Grupos do WhatsApp</Label>
                              <p className="text-xs text-muted-foreground">
                                A mensagem usa o texto do corpo do template. Origem,
                                filtros e estimativa não se aplicam a grupos.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={carregarGruposUazapi}
                              disabled={carregandoGrupos}
                            >
                              {carregandoGrupos
                                ? "Carregando..."
                                : gruposVisiveisUazapi.length
                                  ? "Atualizar lista"
                                  : "Carregar grupos"}
                            </Button>
                          </div>

                          {erroGrupos && (
                            <p className="text-xs text-red-600 dark:text-red-400">{erroGrupos}</p>
                          )}

                          {gruposVisiveisUazapi.length > 0 && (
                            <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                              {gruposVisiveisUazapi.map((g: any) => {
                                const ativo = gruposAlvo.includes(g.id);
                                return (
                                  <label
                                    key={g.id}
                                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
                                      ativo
                                        ? "border-teal-600 bg-white"
                                        : "border-slate-200 bg-white hover:border-slate-400"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 accent-teal-600"
                                      checked={ativo}
                                      onChange={() =>
                                        setGruposAlvo((prev) =>
                                          ativo
                                            ? prev.filter((id) => id !== g.id)
                                            : [...prev, g.id],
                                        )
                                      }
                                    />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold truncate">{g.nome}</p>
                                      <p className="text-[10px] text-muted-foreground font-mono truncate">
                                        {g.id}
                                      </p>
                                    </div>
                                    {typeof g.participantes === "number" && (
                                      <span className="text-[10px] text-muted-foreground shrink-0">
                                        {g.participantes} participantes
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}

                          {gruposVisiveisUazapi.length > 0 && gruposAlvo.length === 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              Marque pelo menos um grupo para continuar.
                            </p>
                          )}
                          {gruposPermitidosUazapi.length > 0 && gruposVisiveisUazapi.length === 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              Nenhum grupo permitido foi encontrado nesta instância. Confira a seleção em Marketing, na configuração da Uazapi.
                            </p>
                          )}
                          {gruposAlvo.length > 0 && (
                            <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                              {gruposAlvo.length}{" "}
                              {gruposAlvo.length === 1 ? "grupo selecionado" : "grupos selecionados"}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Etiquetas do Marketing: marcar uma tag muda o público de
                          "todos os contatos" para "só quem tem esta etiqueta". */}
                      <div
                        className={`space-y-2 ${
                          canalEnvio === "UAZAPI" ? "hidden" : ""
                        }`}
                      >
                        <Label>Filtrar por etiqueta (opcional)</Label>
                        {!tagsMarketing || (tagsMarketing as any).ok === false ? (
                          <p className="text-xs text-muted-foreground">
                            Crie etiquetas em Marketing para mirar grupos específicos.
                          </p>
                        ) : listaTags.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Nenhuma etiqueta criada. Crie uma em Marketing para mirar grupos
                            específicos.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {listaTags.map((t: any) => {
                              const ativa = tagsSelecionadas.includes(t.id);
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() =>
                                    setTagsSelecionadas((prev) =>
                                      ativa ? prev.filter((id) => id !== t.id) : [...prev, t.id],
                                    )
                                  }
                                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                                    ativa
                                      ? "border-teal-600 bg-teal-50 text-teal-700"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                                  }`}
                                >
                                  <span
                                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                                    style={{ backgroundColor: t.cor || "#14b8a6" }}
                                  />
                                  {t.nome}
                                  <span className="ml-1.5 text-[10px] opacity-60">
                                    {Number(t.total ?? 0) || 0}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          {tagsSelecionadas.length
                            ? "Com etiqueta selecionada, só ela define o público (origem e filtros abaixo são ignorados)."
                            : "Sem etiqueta, o público é definido pela origem e pelos filtros abaixo."}
                        </p>
                      </div>

                      {/* Quem recebe: "só novos" exclui quem já recebeu qualquer
                          campanha antes; "todos" manda para a base inteira de novo. */}
                      <div
                        className={`space-y-2 ${
                          canalEnvio === "UAZAPI" ? "hidden" : ""
                        }`}
                      >
                        <Label>Quem recebe</Label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setApenasNovos(false)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                              !apenasNovos
                                ? "border-teal-600 bg-teal-50 text-teal-700"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                            }`}
                          >
                            Todos
                          </button>
                          <button
                            type="button"
                            onClick={() => setApenasNovos(true)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                              apenasNovos
                                ? "border-teal-600 bg-teal-50 text-teal-700"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
                            }`}
                          >
                            Só quem nunca recebeu
                          </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {apenasNovos
                            ? "Só entra na fila quem nunca recebeu nenhuma campanha (a estimativa já reflete isso)."
                            : "Manda para todo o público selecionado, mesmo quem já recebeu antes."}
                        </p>
                      </div>

                      <div
                        className={`space-y-2 ${
                          canalEnvio === "UAZAPI" ? "hidden" : ""
                        }`}
                      >
                        <Label>Origem do público</Label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            {
                              value: "IMPORTADOS",
                              label: "Lista importada (lojistas)",
                              desc: "Contatos da planilha/CSV",
                            },
                            {
                              value: "COMPRADORES",
                              label: "Compradores da plataforma",
                              desc: "Quem já tem cadastro",
                            },
                            {
                              value: "AMBOS",
                              label: "Ambos",
                              desc: "Compradores + lista importada",
                            },
                          ].map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              onClick={() => {
                                setNovaCampanha({
                                  ...novaCampanha,
                                  origem_publico: o.value as any,
                                });
                                handleEstimar();
                              }}
                              className={`flex-1 min-w-[180px] rounded-lg border p-3 text-left ${
                                novaCampanha.origem_publico === o.value
                                  ? "border-teal-600 bg-teal-50 dark:bg-teal-950/40"
                                  : "border-slate-200 bg-white"
                              } ${tagsSelecionadas.length ? "opacity-40 pointer-events-none" : ""}`}
                            >
                              <p className="text-sm font-bold">{o.label}</p>
                              <p className="text-xs text-muted-foreground">{o.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div
                        className={`grid grid-cols-2 gap-4 ${
                          tagsSelecionadas.length ? "opacity-40 pointer-events-none" : ""
                        }`}
                      >
                        <div className="space-y-2">
                          <Label>Tipo de Comprador</Label>
                          <Select
                            value={novaCampanha.filtros.tipo}
                            onValueChange={(v) => {
                              const newFiltros = { ...novaCampanha.filtros, tipo: v };
                              setNovaCampanha({ ...novaCampanha, filtros: newFiltros });
                              handleEstimar();
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="TODOS">Todos</SelectItem>
                              <SelectItem value="PF">Pessoa Física</SelectItem>
                              <SelectItem value="PJ">Empresa / Lojista</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Estado (UF)</Label>
                          <Select
                            value={novaCampanha.filtros.uf}
                            onValueChange={(v) => {
                              const newFiltros = { ...novaCampanha.filtros, uf: v };
                              setNovaCampanha({ ...novaCampanha, filtros: newFiltros });
                              handleEstimar();
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="TODOS">Todos</SelectItem>
                              <SelectItem value="SP">São Paulo</SelectItem>
                              <SelectItem value="RJ">Rio de Janeiro</SelectItem>
                              <SelectItem value="MG">Minas Gerais</SelectItem>
                              <SelectItem value="PR">Paraná</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div
                        className={`bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg flex items-center justify-between ${
                          canalEnvio === "UAZAPI" ? "hidden" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Users className="w-5 h-5 text-slate-400" />
                          <div>
                            <p className="text-sm font-semibold">
                              {tagsSelecionadas.length
                                ? `${estimativaTags?.total ?? "…"} contatos com a etiqueta`
                                : `${estimativa.total} compradores encontrados`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {tagsSelecionadas.length
                                ? `${estimativaTags?.nao_elegiveis ?? "…"} não elegíveis (sem WhatsApp ou número inválido)`
                                : `${estimativa.nao_elegiveis} não elegíveis (ausência de WhatsApp ou desativado)`}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="text-xs">
                          Ver detalhes
                        </Button>
                      </div>
                    </div>
                  )}

                  {campanhaStep === 4 && (
                    <div className="space-y-4">
                      <Label className="text-lg">Escolher Template</Label>
                      {/* Template em análise NÃO pode ser usado: a Meta só
                          aceita APPROVED no disparo. Mas esconder o que está
                          pendente faz o usuário achar que a sincronização
                          falhou — então ele aparece, desabilitado, com o
                          motivo. */}
                      {listaTemplates.filter((t: any) => !templateAprovado(t?.status)).length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Templates em análise ou rejeitados não podem ser usados em campanhas
                          até a aprovação da Meta.
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-2">
                        {listaTemplates.map((template: any) => {
                          const aprovado = templateAprovado(template?.status);
                          return (
                            <div
                              key={template.id}
                              onClick={() => {
                                if (!aprovado) return;
                                setNovaCampanha({ ...novaCampanha, template_id: template.id });
                                setCampanhaStep(5);
                              }}
                              title={
                                aprovado
                                  ? template.meta_name
                                  : `${template.meta_name} — ${rotuloStatus(template?.status)}`
                              }
                              className={cn(
                                "p-3 border rounded-lg transition-all",
                                aprovado
                                  ? "cursor-pointer hover:border-teal-500"
                                  : "cursor-not-allowed opacity-60 bg-slate-50",
                                novaCampanha.template_id === template.id
                                  ? "border-teal-600 bg-teal-50"
                                  : "border-slate-100",
                              )}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">
                                  {template.meta_name}
                                </span>
                                <Badge className="text-[8px] bg-blue-100 text-blue-700 hover:bg-blue-100">
                                  {template.categoria}
                                </Badge>
                              </div>
                              <p className="text-xs font-medium line-clamp-2">
                                {template.conteudo?.find((c: any) => c.type === "BODY")?.text}
                              </p>
                              {!aprovado && (
                                <Badge variant={varianteStatus(template?.status)} className="text-[8px] mt-2">
                                  {rotuloStatus(template?.status)}
                                </Badge>
                              )}
                              {aprovado && precisaSubirCabecalho(template) && (
                                <p className="text-[10px] text-amber-700 mt-2">
                                  Falta anexar o cabeçalho (imagem/PDF) deste template.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Imagem do cabeçalho da campanha. A Meta não deixa
                          trocar a imagem de um template já aprovado, então a
                          escolha aqui é o que permite a campanha ir com a
                          imagem que o usuário quer. */}
                      <div className="space-y-2 border-t pt-4">
                        <Label className="text-sm">Imagem do cabeçalho (opcional)</Label>
                        {midiaCampanha ? (
                          <div className="flex items-center gap-3">
                            {midiaCampanha.preview ? (
                              <img
                                src={midiaCampanha.preview}
                                alt="Imagem escolhida"
                                className="h-16 w-16 rounded-lg object-cover border"
                              />
                            ) : (
                              <div className="h-16 w-16 rounded-lg border flex items-center justify-center text-[10px] text-muted-foreground">
                                PDF
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{midiaCampanha.nome}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Esta imagem vai no cabeçalho da campanha.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setMidiaCampanha(null);
                                setNovaCampanha((atual: any) => ({
                                  ...atual,
                                  midia_id: null,
                                  midia_tipo: null,
                                  midia_nome: null,
                                  midia_arquivo_id: null,
                                }));
                              }}
                            >
                              Remover
                            </Button>
                          </div>
                        ) : (
                          <>
                            <label
                              htmlFor="midia-campanha"
                              className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 cursor-pointer hover:border-teal-500 text-xs text-muted-foreground"
                            >
                              <ImageIcon className="w-4 h-4" />
                              Clique para escolher uma imagem (até 16 MB)
                            </label>
                            <input
                              id="midia-campanha"
                              type="file"
                              accept="image/*,application/pdf"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleEscolherMidiaCampanha(file);
                                e.target.value = "";
                              }}
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Sem esta opção, a campanha usa a imagem do template escolhido.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {campanhaStep === 5 && (
                    <div className="space-y-6">
                      <Label className="text-lg">Mapeamento de Variáveis</Label>
                      <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg border border-blue-100 dark:border-blue-900/50 flex gap-3">
                        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-900 dark:text-blue-200">
                          {variaveisTemplate.length
                            ? `O template tem ${variaveisTemplate.length} ${variaveisTemplate.length === 1 ? "variável" : "variáveis"}. Escolha o que entra em cada uma — dado do veículo, do contato ou texto que você mesmo escreve.`
                            : "Este template não usa variáveis. Pode seguir em frente sem mapear nada."}
                        </p>
                      </div>

                      {!variaveisTemplate.length ? null : (
                        <div className="space-y-3">
                          {variaveisTemplate.map((numero) => {
                            const chave = `{{${numero}}}`;
                            // O mapeamento é salvo com a chave da variável
                            // ("{{1}}"); o motor aceita "1" também — o parâmetro
                            // chega dos dois jeitos.
                            const valorAtual = String(
                              novaCampanha.mapeamento_variaveis?.[numero] ??
                                novaCampanha.mapeamento_variaveis?.[chave] ??
                                "",
                            );
                            const selecionada = valorAtual.startsWith("literal:")
                              ? "__literal__"
                              : valorAtual || "";
                            const veiculo = listaVeiculos.find(
                              (v: any) => v.id === novaCampanha.veiculo_id,
                            );

                            return (
                              <div
                                key={numero}
                                className="rounded-lg border p-3 space-y-2 bg-white"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-sm font-semibold text-teal-700">
                                    {chave}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground truncate">
                                    {valorAtual.startsWith("literal:")
                                      ? "texto fixo"
                                      : valorAtual
                                        ? "dado dinâmico"
                                        : "variável vazia — a mensagem falha"}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  <Select
                                    value={selecionada}
                                    onValueChange={(v) => {
                                      // "Digitar manualmente" reaproveita o texto
                                      // que já estava mapeado, para você não
                                      // perder o que escreveu ao trocar de ideia.
                                      const texto =
                                        v === "__literal__"
                                          ? valorAtual.replace(/^literal:/, "")
                                          : v;
                                      const proximo = {
                                        ...(novaCampanha.mapeamento_variaveis ?? {}),
                                      };
                                      if (v === "__vazio__") delete proximo[numero];
                                      else
                                        proximo[numero] =
                                          v === "__literal__" ? `literal:${texto}` : v;
                                      setNovaCampanha({
                                        ...novaCampanha,
                                        mapeamento_variaveis: proximo,
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Escolha a origem" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__vazio__">
                                        — (vazio, preencho depois) —
                                      </SelectItem>
                            {/* Na Campanha Geral não há veículo: as opções de
                                veículo/vendedor/anúncio saem da lista, senão o
                                motor entregaria string vazia e a Meta recusaria. */}
                            {!campanhaGeral && (
                              <>
                                <SelectItem value="veiculo.nome_completo">
                                  Veículo — Marca + Modelo
                                </SelectItem>
                                <SelectItem value="veiculo.marca">Veículo — Marca</SelectItem>
                                <SelectItem value="veiculo.modelo">
                                  Veículo — Modelo
                                </SelectItem>
                                <SelectItem value="veiculo.ano">Veículo — Ano</SelectItem>
                                <SelectItem value="veiculo.placa">Veículo — Placa</SelectItem>
                                <SelectItem value="veiculo.cor">Veículo — Cor</SelectItem>
                                <SelectItem value="veiculo.km">Veículo — Km</SelectItem>
                                <SelectItem value="veiculo.valor">
                                  Veículo — Preço (R$)
                                </SelectItem>
                                <SelectItem value="anuncio.url">
                                  Anúncio — Link do veículo
                                </SelectItem>
                                <SelectItem value="vendedor.nome">Vendedor — Nome</SelectItem>
                              </>
                            )}
                                      <SelectItem value="contato.nome">Contato — Nome</SelectItem>
                                      <SelectItem value="contato.telefone">
                                        Contato — Telefone
                                      </SelectItem>
                                      <SelectItem value="__literal__">
                                        Digitar manualmente
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>

                                  {selecionada === "__literal__" ? (
                                    <Input
                                      placeholder="Texto que vai na mensagem"
                                      value={
                                        valorAtual.startsWith("literal:")
                                          ? valorAtual.replace(/^literal:/, "")
                                          : ""
                                      }
                                      onChange={(e) => {
                                        const proximo = `literal:${e.target.value}`;
                                        setNovaCampanha({
                                          ...novaCampanha,
                                          mapeamento_variaveis: {
                                            ...(novaCampanha.mapeamento_variaveis ?? {}),
                                            [numero]: proximo,
                                          },
                                        });
                                      }}
                                    />
                                  ) : (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                      {valorAtual.startsWith("literal:") ? (
                                        <>→ {valorAtual.slice("literal:".length)}</>
                                      ) : valorAtual ? (
                                        <>
                                          <Check className="w-3 h-3 text-green-600" />{" "}
                                          {valorAtual.startsWith("contato.") && exemplo ? (
                                            `Ex.: ${valorAtual === "contato.telefone" ? exemplo.telefone : exemplo.nome || "(sem nome)"}`
                                          ) : veiculo
                                            ? `Ex.: ${RESUMO_VARIAVEIS[valorAtual]?.(veiculo) ?? valorAtual}`
                                            : valorAtual}
                                        </>
                                      ) : (
                                        "Escolha um campo ou digite o texto"
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {!variaveisTemplate.length ? null : (
                        <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-sm">Prévia da mensagem</Label>
                            <span className="text-[11px] text-muted-foreground">
                              {exemplo
                                ? `Contato de exemplo: ${exemplo.nome || "(sem nome)"}`
                                : "Carregando contato de exemplo…"}
                            </span>
                          </div>
                          <div className="rounded-md bg-white dark:bg-black/40 border p-3 text-sm whitespace-pre-wrap">
                            {(() => {
                              // O conteúdo mora em `.conteudo` (array de componentes),
                              // não em `.components` — usar o helper, que trata as duas formas.
                              const corpo =
                                componentesDoTemplate(templateCampanha).find(
                                  (c: any) => c.type === "BODY",
                                )?.text ?? "";
                              const valores = exemplo?.variaveis ?? {};
                              const texto = substituirVariaveis(corpo, valores);
                              // {{n}} que sobrou = variável sem valor: a Meta recusa.
                              if (/\{\{\d+\}\}/.test(texto)) {
                                return (
                                  <span className="text-destructive">
                                    {texto}{" "}
                                    <span className="text-[11px]">
                                      (ainda há variável vazia — a Meta recusa)
                                    </span>
                                  </span>
                                );
                              }
                              return texto || "(template sem corpo)";
                            })()}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            É assim que a mensagem chega no WhatsApp. Se algo estiver
                            errado, volte ao mapeamento acima.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {campanhaStep === 6 && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <Label className="text-lg">Agendamento e ritmo de envio</Label>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        A campanha só dispara dentro da janela e no intervalo definidos aqui. Sem
                        isso, a Meta bloqueia o número por excesso de mensagens.
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="janela-inicio">Início do horário de trabalho</Label>
                          <Input
                            id="janela-inicio"
                            type="time"
                            value={novaCampanha.janela_inicio}
                            onChange={(e) =>
                              setNovaCampanha({ ...novaCampanha, janela_inicio: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="janela-fim">Fim do horário de trabalho</Label>
                          <Input
                            id="janela-fim"
                            type="time"
                            value={novaCampanha.janela_fim}
                            onChange={(e) =>
                              setNovaCampanha({ ...novaCampanha, janela_fim: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="intervalo">Intervalo entre mensagens</Label>
                        <div className="flex flex-wrap gap-2">
                          {[1, 5, 10, 15, 30, 60].map((min) => (
                            <Button
                              key={min}
                              type="button"
                              size="sm"
                              variant={
                                novaCampanha.intervalo_minutos === min ? "default" : "outline"
                              }
                              className={
                                novaCampanha.intervalo_minutos === min
                                  ? "bg-teal-600 hover:bg-teal-700"
                                  : ""
                              }
                              onClick={() =>
                                setNovaCampanha({ ...novaCampanha, intervalo_minutos: min })
                              }
                            >
                              {min === 60 ? "1 hora" : `${min} min`}
                            </Button>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Com {novaCampanha.intervalo_minutos} min entre mensagens,{" "}
                          {estimativa.total} contatos levam cerca de{" "}
                          <strong>
                            {Math.max(
                              1,
                              Math.ceil((estimativa.total * novaCampanha.intervalo_minutos) / 60),
                            )}{" "}
                            h
                          </strong>{" "}
                          de envio.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="agendado-para">Quando começar</Label>
                        <Input
                          id="agendado-para"
                          type="datetime-local"
                          value={novaCampanha.agendado_para}
                          onChange={(e) =>
                            setNovaCampanha({ ...novaCampanha, agendado_para: e.target.value })
                          }
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Se o horário cair fora da janela, o envio começa na próxima abertura.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4 bg-muted/40 space-y-3">
                        <p className="text-xs font-semibold flex items-center gap-1">
                          <Terminal className="w-3 h-3" /> Testar antes de disparar
                        </p>
                        <div className="flex gap-2">
                          <Input
                            inputMode="numeric"
                            placeholder="5511999999999"
                            value={telefoneTeste}
                            onChange={(e) =>
                              setTelefoneTeste(e.target.value.replace(/\D/g, "").slice(0, 13))
                            }
                          />
                          <Button
                            variant="outline"
                            onClick={() => {
                              // O teste precisa das variáveis já preenchidas, senão
                              // a Meta recusa a mensagem. O contato de exemplo da
                              // prévia carrega os valores reais; se ele ainda não
                              // chegou (ou a variável não tem campo), avisa em vez
                              // de disparar para falhar.
                              const total = contarVariaveisTemplate(templateCampanha);
                              const preenchidos = exemplo?.variaveis
                                ? Array.from(
                                    { length: total },
                                    (_, i) => exemplo.variaveis[String(i + 1)] ?? "",
                                  )
                                : [];
                              const vazias = preenchidos
                                .slice(0, total)
                                .some((v: string) => !String(v ?? "").trim());
                              if (total > 0 && (vazias || !exemplo)) {
                                toast.error(
                                  !exemplo
                                    ? "Aguarde o contato de exemplo carregar para enviar o teste."
                                    : "Ainda há variável sem valor no contato de exemplo. Ajuste o mapeamento na etapa anterior.",
                                );
                                return;
                              }
                              handleEnviarTeste(preenchidos);
                            }}
                            disabled={!novaCampanha.template_id}
                          >
                            <Send className="w-4 h-4 mr-2" /> Enviar Teste
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          O teste usa o contato de exemplo da prévia
                          {exemplo?.nome ? ` (${exemplo.nome})` : ""}. Só funciona com
                          template aprovado pela Meta.
                        </p>
                      </div>
                    </div>
                  )}

                  {campanhaStep === 7 && (
                    <div className="space-y-6">
                      <Label className="text-lg">Revisão Final</Label>
                      {/* Nome próprio para cada campanha: sem isso todas caíam
                          no fallback "Campanha Geral" e a lista ficava
                          indistinguível. */}
                      <div className="space-y-2">
                        <Label htmlFor="nome-campanha">Nome da campanha</Label>
                        <Input
                          id="nome-campanha"
                          placeholder='Ex.: "Lançamento SUV — novembro"'
                          value={novaCampanha.nome}
                          onChange={(e) =>
                            setNovaCampanha({ ...novaCampanha, nome: e.target.value })
                          }
                        />
                        {!novaCampanha.nome.trim() && (
                          <p className="text-[11px] text-muted-foreground">
                            Sem nome, ela será salva como "Campanha Geral".
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-4">
                          <div className="p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-2">
                            <p className="text-[10px] text-muted-foreground uppercase">Conteúdo</p>
                            <p className="text-sm font-bold truncate">
                              {campanhaGeral
                                ? "Campanha Geral"
                                : (() => {
                                    const v = listaVeiculos.find(
                                      (veiculo: any) => veiculo.id === novaCampanha.veiculo_id,
                                    );
                                    return v ? `${v.marca} ${v.modelo} - ${v.placa}` : "Sem veículo";
                                  })()}
                            </p>
                            <div className="flex items-center gap-2">
                              <FileText className="w-3 h-3 text-slate-400" />
                              <span className="text-xs">
                                Template:{" "}
                                {
                                  listaTemplates.find((t: any) => t.id === novaCampanha.template_id)
                                    ?.meta_name
                                }
                              </span>
                            </div>
                          </div>
                          <div className="p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-2">
                            <p className="text-[10px] text-muted-foreground uppercase">Conexão</p>
                            {canalEnvio === "UAZAPI" ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <Globe className="w-3 h-3 text-teal-500" />
                                  <span className="text-xs font-bold text-teal-600">
                                    Conexão Uazapi (grupos)
                                  </span>
                                </div>
                                <p className="text-xs">
                                  {gruposAlvo.length}{" "}
                                  {gruposAlvo.length === 1
                                    ? "grupo selecionado"
                                    : "grupos selecionados"}
                                </p>
                                {gruposAlvo.length > 0 && (
                                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                                    {gruposAlvo
                                      .map(
                                        (id) =>
                                          gruposVisiveisUazapi.find((g: any) => g.id === id)?.nome ?? id,
                                      )
                                      .join(", ")}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <Globe className="w-3 h-3 text-green-500" />
                                  <span className="text-xs font-bold text-green-600">
                                    Meta WABA Conectada
                                  </span>
                                </div>
                                <p className="text-xs font-mono">{config?.phone_number}</p>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="p-4 border rounded-lg bg-slate-900 text-white space-y-4">
                          <p className="text-[10px] text-slate-400 uppercase">Resumo de Envio</p>
                          {canalEnvio === "UAZAPI" ? (
                            <div className="space-y-3">
                              <div className="flex justify-between items-center text-xs">
                                <span>Destino</span>
                                <span>Grupos do WhatsApp</span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span>Grupos marcados</span>
                                <span>{gruposAlvo.length}</span>
                              </div>
                              <div className="border-t border-slate-700 pt-2 flex justify-between items-center">
                                <span className="text-sm font-bold">Total a enviar</span>
                                <span className="text-xl font-black text-teal-400">
                                  {gruposAlvo.length}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                Uma mensagem por grupo. O texto vem do corpo do template — a
                                aprovação da Meta não se aplica por aqui.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex justify-between items-center text-xs">
                                <span>Público encontrado</span>
                                <span>{estimativa.total}</span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span>Duplicados removidos</span>
                                <span>0</span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span>Não elegíveis</span>
                                <span className="text-red-400">{estimativa.nao_elegiveis}</span>
                              </div>
                              <div className="border-t border-slate-700 pt-2 flex justify-between items-center">
                                <span className="text-sm font-bold">Total a enviar</span>
                                <span className="text-xl font-black text-teal-400">
                                  {estimativa.elegiveis}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex justify-between sm:justify-between w-full border-t pt-4">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      // Campanha Geral não tem etapa de veículo: voltar da etapa 3
                      // precisa ir para a etapa 1, senão o usuário caía no seletor
                      // de veículo que ele nunca deveria ver.
                      if (campanhaStep === 1) {
                        handleFecharCampanha();
                      } else if (campanhaGeral && campanhaStep === 3) {
                        setCampanhaStep(1);
                      } else {
                        setCampanhaStep(campanhaStep - 1);
                      }
                    }}
                  >
                    {campanhaStep === 1 ? "Cancelar" : "Voltar"}
                  </Button>
                  <div className="flex gap-2">
                    {campanhaStep === 7 ? (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => {
                            // Agendar sem horário não tem sentido: a campanha
                            // precisa de um instante para virar roteiro e
                            // respeitar a janela de trabalho.
                            if (!novaCampanha.agendado_para) {
                              toast.error(
                                "Escolha a data e a hora do disparo no passo de ritmo antes de agendar.",
                              );
                              setCampanhaStep(6);
                              return;
                            }
                            handleSalvarCampanha(false);
                          }}
                        >
                          Agendar
                        </Button>
                        <Button
                          className="bg-teal-600 hover:bg-teal-700"
                          onClick={() => handleSalvarCampanha(true)}
                        >
                          Enviar Agora <Send className="w-4 h-4 ml-2" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        className="bg-teal-600 hover:bg-teal-700"
                        onClick={() => {
                          if (campanhaStep === 2 && !campanhaGeral && !novaCampanha.veiculo_id) {
                            toast.error("Selecione um veículo");
                            return;
                          }
                          if (campanhaStep === 3) {
                            if (canalEnvio === "UAZAPI" && gruposAlvo.length === 0) {
                              toast.error("Selecione pelo menos um grupo para continuar.");
                              return;
                            }
                            // A campanha de grupo não tem público de contatos: sem
                            // este `if` a estimativa rodava e atrasava o wizard.
                            if (canalEnvio !== "UAZAPI") handleEstimar();
                          }
                          setCampanhaStep(campanhaStep + 1);
                        }}
                      >
                        Próximo <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {(campanhasDetalhadas ?? campanhas)?.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center gap-4">
                  <Send className="w-12 h-12 opacity-20" />
                  <p>Nenhuma campanha realizada até o momento.</p>
                  <Button variant="outline" onClick={handleAbrirCampanha}>
                    Criar minha primeira campanha
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="border rounded-lg overflow-hidden bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Campanha
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Ritmo
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        Elegíveis
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        Enviados
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        Entregues
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        Lidos
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                        Cliques
                      </th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(() => {
                      // Paginação da lista: 10 por página para a tela não
                      // virar rolagem infinita quando houver dezenas.
                      const todas = campanhasDetalhadas ?? campanhas ?? [];
                      const totalPaginas = Math.max(1, Math.ceil(todas.length / 10));
                      const pagina = Math.min(paginaCampanhas, totalPaginas);
                      return todas
                        .slice((pagina - 1) * 10, pagina * 10)
                        .map((campanha: any) => (
                      <tr key={campanha.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-bold">{campanha.nome}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(campanha.criado_em).toLocaleDateString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs">
                            {campanha.janela_inicio || "—"}–{campanha.janela_fim || "—"}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">
                            a cada {campanha.intervalo_minutos ?? 5} min
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={varianteStatusCampanha(campanha.status)}
                            className="text-[10px]"
                          >
                            {rotuloStatusCampanha(campanha)}
                          </Badge>
                          {campanha.template_status && campanha.template_status !== "APPROVED" && (
                            <p className="text-[9px] text-amber-600 mt-1">
                              template {rotuloStatus(campanha.template_status).toLowerCase()}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {campanha.total_destinatarios}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-blue-600">
                          {campanha.total_enviados}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-green-600">
                          {campanha.total_entregues ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-purple-600">
                          {campanha.total_lidos}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-teal-600">
                          {campanha.total_cliques}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Ver contatos agendados"
                              onClick={() => setEnviosCampanha(campanha)}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              {campanha.total_destinatarios ?? 0}
                            </Button>
                            {["AGUARDANDO", "PROCESSANDO"].includes(campanha.status) ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleAlterarStatus(campanha, "PAUSADA")}
                              >
                                Pausar
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={
                                  campanha.status === "CONCLUIDA" ||
                                  campanhaTemplateIndisponivel(campanha.status)
                                }
                                onClick={() => handleAlterarStatus(campanha, "AGUARDANDO")}
                              >
                                Retomar
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Disparar agora, sem esperar a janela ou o proximo ciclo"
                              disabled={
                                campanha.status === "CONCLUIDA" ||
                                campanha.status === "CANCELADA" ||
                                campanhaTemplateIndisponivel(campanha.status)
                              }
                              onClick={() => handleDispararAgora(campanha)}
                            >
                              <Zap className="w-3.5 h-3.5 mr-1" />
                              Disparar agora
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Agendar o disparo desta campanha"
                              disabled={
                                campanha.status === "CONCLUIDA" ||
                                campanhaTemplateIndisponivel(campanha.status)
                              }
                              onClick={() => {
                                setAgendarParaCampanha(campanha);
                                setAgendarParaValor("");
                              }}
                            >
                              <Clock className="w-3.5 h-3.5 mr-1" />
                              Agendar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Editar nome, agendamento, janela e intervalo"
                              onClick={() => handleAbrirEdicao(campanha)}
                            >
                              <FileEdit className="w-3.5 h-3.5 mr-1" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Excluir a campanha e a fila de envios"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setExcluirCampanhaAlvo(campanha)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" />
                              Excluir
                            </Button>
                          </div>
                        </td>
                      </tr>
                        ));
                    })()}
                  </tbody>
                </table>
                {/* Controles de página da lista de campanhas. */}
                {(() => {
                  const todas = campanhasDetalhadas ?? campanhas ?? [];
                  const totalPaginas = Math.max(1, Math.ceil(todas.length / 10));
                  if (totalPaginas <= 1) return null;
                  return (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50">
                      <span className="text-xs text-muted-foreground">
                        Página {paginaCampanhas} de {totalPaginas} — {todas.length} campanha(s)
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={paginaCampanhas <= 1}
                          onClick={() => setPaginaCampanhas((p) => Math.max(1, p - 1))}
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={paginaCampanhas >= totalPaginas}
                          onClick={() => setPaginaCampanhas((p) => Math.min(totalPaginas, p + 1))}
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Detalhe por envio em modal: a lupa abre por cima, sem rolar
                a página. Envios e log têm paginação própria de 20 itens. */}
            {enviosCampanha && (
              <Dialog open onOpenChange={(v) => {
                if (!v) {
                  setEnviosCampanha(null);
                  setPaginaEnvios(1);
                  setPaginaLogs(1);
                }
              }}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Envios — {enviosCampanha.nome}</DialogTitle>
                    <DialogDescription>
                      {enviosCampabela?.length ?? 0} contato(s) na fila
                    </DialogDescription>
                  </DialogHeader>
                  {(() => {
                    const todosEnvios = enviosCampabela ?? [];
                    const totalPagEnvios = Math.max(1, Math.ceil(todosEnvios.length / 20));
                    const pagEnv = Math.min(paginaEnvios, totalPagEnvios);
                    const todosLogs = logsCampanha ?? [];
                    const totalPagLogs = Math.max(1, Math.ceil(todosLogs.length / 20));
                    const pagLog = Math.min(paginaLogs, totalPagLogs);
                    return (
                      <>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Contato</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Telefone</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Agendado para</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Enviado em</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Já recebeu</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">Erro</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {todosEnvios.slice((pagEnv - 1) * 20, pagEnv * 20).map((envio: any) => (
                          <tr key={envio.id}>
                            <td className="px-3 py-2">{envio.contato_nome || "—"}</td>
                            <td className="px-3 py-2 font-mono">{envio.telefone}</td>
                            <td className="px-3 py-2">
                              {envio.proxima_tentativa_em
                                ? new Date(envio.proxima_tentativa_em).toLocaleString()
                                : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {envio.enviado_em
                                ? new Date(envio.enviado_em).toLocaleString()
                                : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {envio.ja_recebeu_antes ? (
                                <Badge variant="outline" className="text-[10px]">
                                  Já recebeu antes
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">Primeira vez</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={varianteStatusEnvio(envio)} className="text-[10px]">
                                {rotuloStatusEnvio(envio)}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-destructive">
                              {envio.erro_mensagem || "—"}
                            </td>
                          </tr>
                        ))}
                        {!enviosCampabela?.length && (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-3 py-6 text-center text-muted-foreground"
                            >
                              Nenhum contato na fila desta campanha.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {totalPagEnvios > 1 && (
                      <div className="flex items-center justify-between px-3 py-2 border-t bg-slate-50">
                        <span className="text-[11px] text-muted-foreground">
                          Página {pagEnv} de {totalPagEnvios} — {todosEnvios.length} contato(s)
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pagEnv <= 1}
                            onClick={() => setPaginaEnvios((p) => Math.max(1, p - 1))}
                          >
                            Anterior
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pagEnv >= totalPagEnvios}
                            onClick={() => setPaginaEnvios((p) => Math.min(totalPagEnvios, p + 1))}
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Log do motor: o que a campanha esta fazendo (ou por que
                      nao esta). Sem isso a tela so mostrava "0 contato(s) na
                      fila" e nao dava nenhuma pista do motivo. */}
                  <div className="mt-4 border rounded-lg overflow-hidden">
                    <div className="bg-slate-50 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                      Log da campanha ({logsCampanha?.length ?? 0} evento(s))
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y">
                      {todosLogs.slice((pagLog - 1) * 20, pagLog * 20).map((log: any) => (
                        <div key={log.id} className="px-3 py-2 text-xs flex gap-3">
                          <span className="text-muted-foreground whitespace-nowrap">
                            {new Date(log.criado_em).toLocaleString()}
                          </span>
                          <Badge
                            variant={varianteAcaoLog(log.acao)}
                            className="text-[10px] shrink-0"
                          >
                            {log.acao}
                          </Badge>
                          <span className="text-foreground">{log.detalhe || "—"}</span>
                        </div>
                      ))}
                      {!logsCampanha?.length && (
                        <div className="px-3 py-6 text-center text-muted-foreground">
                          Nenhum evento registrado ainda.
                        </div>
                      )}
                    </div>
                    {totalPagLogs > 1 && (
                      <div className="flex items-center justify-between px-3 py-2 border-t bg-slate-50">
                        <span className="text-[11px] text-muted-foreground">
                          Página {pagLog} de {totalPagLogs} — {todosLogs.length} evento(s)
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pagLog <= 1}
                            onClick={() => setPaginaLogs((p) => Math.max(1, p - 1))}
                          >
                            Anterior
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pagLog >= totalPagLogs}
                            onClick={() => setPaginaLogs((p) => Math.min(totalPagLogs, p + 1))}
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                      </>
                    );
                  })()}
                </DialogContent>
              </Dialog>
            )}

            {/* Agendar o disparo de uma campanha que já existe. O novo horario
                reescala a fila: cada destinatario passa a ter hora propria,
                espacada pelo intervalo da campanha. */}
            {agendarParaCampanha && (
              <Dialog open onOpenChange={(v) => !v && setAgendarParaCampanha(null)}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Agendar disparo</DialogTitle>
                    <DialogDescription>
                      {agendarParaCampanha.nome} — a fila sera redistribuida a partir do
                      novo horario, a cada {agendarParaCampanha.intervalo_minutos ?? 5} min.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    <Label htmlFor="agendar-disparo-quando">Data e hora do disparo</Label>
                    <Input
                      id="agendar-disparo-quando"
                      type="datetime-local"
                      value={agendarParaValor}
                      onChange={(e) => setAgendarParaValor(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Fora da janela de trabalho, o envio comeca na proxima abertura.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAgendarParaCampanha(null)}>
                      Cancelar
                    </Button>
                    <Button
                      className="bg-teal-600 font-bold hover:bg-teal-700"
                      onClick={handleAgendarDisparo}
                    >
                      Agendar disparo
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {editarCampanha && (
              <Dialog open onOpenChange={(v) => !v && setEditarCampanha(null)}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Editar campanha</DialogTitle>
                    <DialogDescription>
                      Ajustes seguros: nome, agendamento, janela de trabalho e intervalo entre mensagens.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="editar-nome">Nome da campanha</Label>
                      <Input
                        id="editar-nome"
                        value={editarNome}
                        onChange={(e) => setEditarNome(e.target.value)}
                        placeholder='Ex.: "Lançamento SUV — novembro"'
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editar-agendado">Agendar para (opcional)</Label>
                      <Input
                        id="editar-agendado"
                        type="datetime-local"
                        value={editarAgendadoPara}
                        onChange={(e) => setEditarAgendadoPara(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="editar-janela-inicio">Janela início</Label>
                        <Input
                          id="editar-janela-inicio"
                          type="time"
                          value={editarJanelaInicio}
                          onChange={(e) => setEditarJanelaInicio(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editar-janela-fim">Janela fim</Label>
                        <Input
                          id="editar-janela-fim"
                          type="time"
                          value={editarJanelaFim}
                          onChange={(e) => setEditarJanelaFim(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editar-intervalo">Intervalo entre mensagens (minutos)</Label>
                      <Input
                        id="editar-intervalo"
                        type="number"
                        min={1}
                        max={120}
                        value={editarIntervalo}
                        onChange={(e) => setEditarIntervalo(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditarCampanha(null)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSalvarEdicao}>Salvar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {excluirCampanhaAlvo && (
              <Dialog open onOpenChange={(v) => !v && setExcluirCampanhaAlvo(null)}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Excluir campanha</DialogTitle>
                    <DialogDescription>
                      Tem certeza que deseja excluir a campanha{" "}
                      <strong>{excluirCampanhaAlvo.nome}</strong>? Esta ação é definitiva: a
                      fila de envios será apagada em cascata. Os logs de auditoria serão
                      preservados sem vínculo com esta campanha.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setExcluirCampanhaAlvo(null)}>
                      Cancelar
                    </Button>
                    <Button variant="destructive" onClick={handleExcluirCampanha}>
                      Excluir definitivamente
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </TabsContent>

        {/* Segmentos */}
        <TabsContent value="segmentos" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Segmentos de Compradores</h2>
              <p className="text-sm text-muted-foreground">
                Públicos montados por filtro, para reutilizar em várias campanhas
              </p>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-right">Membros</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {segmentos?.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        Nenhum segmento ainda. Crie um para reutilizar o mesmo público em várias
                        campanhas.
                      </td>
                    </tr>
                  )}
                  {segmentos?.map((s: any) => (
                    <tr key={s.id} className="border-b hover:bg-muted/40">
                      <td className="px-4 py-3 font-medium">{s.nome}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {s.tipo === "DINAMICO" ? "Dinâmico" : "Lista manual"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {Number(s.total_membros ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setNovaCampanha((c: any) => ({ ...c, segmento_id: s.id }));
                            setTagsSelecionadas([]);
                            setIsCampanhaWizardOpen(true);
                            setCampanhaStep(3);
                          }}
                        >
                          Usar em campanha
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contatos */}
        <TabsContent value="contatos" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Base de Contatos</h2>
              <p className="text-sm text-muted-foreground">
                Compradores cadastrados e contatos importados, lado a lado
                {contatos && (
                  <span className="ml-1 font-medium text-foreground">
                    {contatos.filter((c: any) => c.elegivel).length} elegíveis de {contatos.length}.
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <div className="flex rounded-lg border p-0.5">
                {(
                  [
                    ["AMBOS", "Todos"],
                    ["COMPRADORES", "Compradores"],
                    ["IMPORTADOS", "Importados"],
                  ] as const
                ).map(([valor, label]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setOrigemContatos(valor)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                      origemContatos === valor
                        ? "bg-teal-600 text-white"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Button
                variant={somenteElegiveis ? "default" : "outline"}
                onClick={() => setSomenteElegiveis((v) => !v)}
              >
                <Filter className="w-4 h-4 mr-2" /> Só elegíveis
              </Button>
              <Button variant="outline" onClick={handleExportarContatos}>
                <FileDown className="w-4 h-4 mr-2" /> Exportar
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="border-b p-4 bg-slate-50/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por nome, telefone, cidade ou e-mail..."
                    className="pl-10"
                    value={buscaContato}
                    onChange={(e) => setBuscaContato(e.target.value)}
                  />
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">Contato</th>
                    <th className="px-4 py-3 text-left">WhatsApp</th>
                    <th className="px-4 py-3 text-left">Origem</th>
                    <th className="px-4 py-3 text-left">Compliance</th>
                    <th className="px-4 py-3 text-left">Elegibilidade</th>
                    <th className="px-4 py-3 text-right">Interesses</th>
                  </tr>
                </thead>
                <tbody>
                  {contatos?.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        {buscaContato.trim()
                          ? `Nenhum contato encontrado para "${buscaContato.trim()}".`
                          : somenteElegiveis
                            ? "Nenhum contato elegível no momento."
                            : "Nenhum contato cadastrado ainda. Importe uma lista em Marketing."}
                      </td>
                    </tr>
                  )}
                  {contatos?.map((c: any) => (
                    <tr key={`${c.origem}-${c.id}`} className="border-b hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.nome}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {c.telefone || <span className="text-muted-foreground">sem número</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={c.origem === "COMPRADOR" ? "secondary" : "outline"}>
                          {c.origem === "COMPRADOR" ? "Cadastrado" : "Importado"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c.origem === "PROSPECT" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge
                            variant={c.status_compliance === "APROVADO" ? "success" : "secondary"}
                          >
                            {rotuloCompliance(c.status_compliance)}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.elegivel ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-xs">Elegível</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            <span className="text-xs">{c.motivo_inelegivel}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1 flex-wrap">
                          {(c.interesses_veiculos ?? []).slice(0, 3).map((i: string) => (
                            <Badge key={i} variant="outline" className="text-[9px]">
                              {i}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Templates</h2>
              <p className="text-sm text-muted-foreground">
                Gerencie seus templates do WhatsApp Meta
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSincronizar}>
                <RefreshCw className="w-4 h-4 mr-2" /> Sincronizar
              </Button>
              <Dialog open={isWizardOpen} onOpenChange={setIsWizardOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-teal-600 hover:bg-teal-700">
                    <Plus className="w-4 h-4 mr-2" /> Novo Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                  <DialogHeader className="shrink-0">
                    <DialogTitle>Novo Template (Etapa {wizardStep}/7)</DialogTitle>
                    <DialogDescription>Crie um novo template aprovado pela Meta</DialogDescription>
                  </DialogHeader>

                  {/* O conteúdo rola sozinho: o diálogo tem altura máxima e o
                      rodapé fica fora da área de rolagem, senão um texto longo
                      empurrava os botões para fora da tela, sem como chegar
                      neles. */}
                  <div className="py-4 space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
                    {wizardStep === 1 && (
                      <div className="space-y-4">
                        <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-lg border border-amber-100 dark:border-amber-900/50 flex gap-3">
                          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-sm text-amber-900 dark:text-amber-200">
                            <p className="font-semibold">Regras da Meta:</p>
                            <ul className="list-disc list-inside mt-1 space-y-1 opacity-80">
                              <li>Nome: Apenas letras minúsculas e underscores.</li>
                              <li>Não pode conter espaços ou caracteres especiais.</li>
                              <li>Uma vez enviado, a aprovação leva de 2h a 24h.</li>
                            </ul>
                          </div>
                        </div>
                        <div>
                          <Label>Nome do Template (Meta Name)</Label>
                          <Input
                            value={newTemplate.name}
                            onChange={(e) =>
                              setNewTemplate({
                                ...newTemplate,
                                name: e.target.value
                                  .toLowerCase()
                                  .replace(/\s+/g, "_")
                                  .replace(/[^a-z0-9_]/g, ""),
                              })
                            }
                            placeholder="ex: boas_vindas_comprador"
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Sugestão: use prefixos como bo_ (boas vindas), nv_ (novo veículo).
                          </p>
                        </div>
                        <div>
                          <Label>Categoria</Label>
                          <Select
                            value={newTemplate.category}
                            onValueChange={(v) => setNewTemplate({ ...newTemplate, category: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="MARKETING">
                                Marketing (Promoções, anúncios)
                              </SelectItem>
                              <SelectItem value="UTILITY">
                                Utilitário (Alertas, pós-venda, entregas)
                              </SelectItem>
                              <SelectItem value="AUTHENTICATION">
                                Autenticação (Códigos de acesso)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    {wizardStep === 2 && (
                      <div className="space-y-6">
                        <Label>Estrutura do Template</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div
                            className={cn(
                              "border rounded-lg p-4 cursor-pointer hover:border-teal-500 transition-all",
                              !midiaTemplate ? "bg-teal-50/50 border-teal-500" : "",
                            )}
                            onClick={() => {
                              // Voltar para texto puro descarta o anexo: a Meta
                              // não aceita HEADER de texto junto com HEADER de
                              // mídia no mesmo template.
                              setMidiaTemplate(null);
                              setNewTemplate({
                                ...newTemplate,
                                midia_id: null,
                                midia_tipo: null,
                                midia_nome: null,
                                midia_arquivo_id: null,
                                components: newTemplate.components.filter(
                                  (c: any) => c.type !== "HEADER",
                                ),
                              });
                            }}
                          >
                            <h4 className="font-semibold flex items-center gap-2">
                              <FileText className="w-4 h-4 text-teal-600" />
                              Apenas Texto
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              Ideal para mensagens informativas simples.
                            </p>
                          </div>
                          <div
                            className={cn(
                              "border rounded-lg p-4 cursor-pointer hover:border-teal-500 transition-all",
                              midiaTemplate ? "bg-teal-50/50 border-teal-500" : "",
                            )}
                            // "Texto + Mídia" precisa marcar o HEADER como mídia
                            // ANTES de ir para o passo 3: o passo 3 decide entre
                            // o campo de texto e o seletor de arquivo olhando o
                            // `format` do HEADER. Sem isso, o HEADER continuava
                            // como texto, o seletor de arquivo nunca aparecia e
                            // a mídia saía como null.
                            onClick={() => {
                              const comps = newTemplate.components.filter(
                                (c: any) => c.type !== "HEADER",
                              );
                              comps.unshift({ type: "HEADER", format: "IMAGE" });
                              setNewTemplate({ ...newTemplate, components: comps });
                              setWizardStep(3);
                            }}
                          >
                            <h4 className="font-semibold flex items-center gap-2">
                              <Layout className="w-4 h-4" />
                              Texto + Mídia
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              Imagem ou PDF no topo da mensagem.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {wizardStep === 3 && (
                      <div className="space-y-4">
                        <Label>Cabeçalho (Opcional)</Label>
                        {(() => {
                          const header = newTemplate.components.find(
                            (c: any) => c.type === "HEADER",
                          );
                          const headerEhMidia =
                            String(header?.format || "TEXT").toUpperCase() !== "TEXT";
                          if (!headerEhMidia) {
                            return (
                              <div className="space-y-3">
                                <Input
                                  placeholder="Título em negrito no topo da mensagem"
                                  maxLength={60}
                                  // Sem `value`, o texto digitado some a cada re-render.
                                  // A ordem HEADER→BODY é garantida no envio, pelo
                                  // normalizarComponentes do meta-whatsapp.server.ts.
                                  value={header?.text || ""}
                                  onChange={(e) => {
                                    const comps = newTemplate.components.filter(
                                      (c: any) => c.type !== "HEADER",
                                    );
                                    if (e.target.value) {
                                      comps.unshift({ type: "HEADER", text: e.target.value });
                                    }
                                    setNewTemplate({ ...newTemplate, components: comps });
                                  }}
                                />
                                {/* Atalho para a mesma escolha do passo 2: sem ele,
                                    quem entra no passo 3 sem ter clicado em
                                    "Texto + Mídia" não achava onde anexar a
                                    imagem e a mídia saía como null. */}
                                <label className="block">
                                  <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      // Anexar é a mesma coisa que escolher
                                      // "Texto + Mídia": o HEADER deixa de ser
                                      // texto e passa a ser mídia.
                                      const comps = newTemplate.components.filter(
                                        (c: any) => c.type !== "HEADER",
                                      );
                                      comps.unshift({ type: "HEADER", format: "IMAGE" });
                                      setNewTemplate({ ...newTemplate, components: comps });
                                      handleEscolherMidiaTemplate(file);
                                      e.target.value = "";
                                    }}
                                  />
                                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs cursor-pointer hover:border-teal-500 transition-all">
                                    <Upload className="w-3.5 h-3.5" />
                                    Anexar imagem ou PDF no lugar do título
                                  </span>
                                </label>
                              </div>
                            );
                          }
                          const arquivo = midiaTemplate;
                          return (
                            <div className="space-y-3">
                              {arquivo && (
                                <div className="border rounded-lg p-3 space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                      {arquivo.tipo === "document" ? (
                                        <FileText className="w-10 h-10 text-teal-600 shrink-0" />
                                      ) : (
                                        <img
                                          src={arquivo.preview}
                                          alt={arquivo.nome}
                                          className="w-14 h-14 object-cover rounded-md border"
                                        />
                                      )}
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">
                                          {arquivo.nome}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                          {(arquivo.tamanho / 1024 / 1024).toFixed(2)} MB ·{" "}
                                          {arquivo.tipo === "document" ? "PDF" : "Imagem"}
                                        </p>
                                        {newTemplate.midia_id && (
                                          <p className="text-[11px] text-teal-600">
                                            ✓ Anexado ao template
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        // Voltar para texto puro: o HEADER de
                                        // mídia sai junto, senão o template vai
                                        // para a Meta sem o anexo correspondente.
                                        setMidiaTemplate(null);
                                        setNewTemplate({
                                          ...newTemplate,
                                          midia_id: null,
                                          midia_tipo: null,
                                          midia_nome: null,
                                          midia_arquivo_id: null,
                                          components: newTemplate.components.filter(
                                            (c: any) => c.type !== "HEADER",
                                          ),
                                        });
                                      }}
                                    >
                                      <Trash2 className="w-4 h-4" /> Remover
                                    </Button>
                                  </div>
                                </div>
                              )}
                              <label className="block">
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleEscolherMidiaTemplate(file);
                                    // Permite escolher o mesmo arquivo de novo.
                                    e.target.value = "";
                                  }}
                                />
                                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm cursor-pointer hover:border-teal-500 transition-all">
                                  <Upload className="w-4 h-4" />
                                  {arquivo ? "Trocar anexo" : "Anexar imagem ou PDF"}
                                </span>
                              </label>
                              <p className="text-[11px] text-muted-foreground">
                                O arquivo vai no topo da mensagem. Aceita imagem ou PDF de
                                até 16 MB (limite da Meta).
                              </p>
                            </div>
                          );
                        })()}
                        <p className="text-xs text-muted-foreground">Máximo 60 caracteres.</p>
                      </div>
                    )}

                    {wizardStep === 4 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <Label>Corpo da Mensagem (Obrigatório)</Label>
                            <Textarea
                              className="h-48 font-mono text-sm"
                              value={
                                newTemplate.components.find((c: any) => c.type === "BODY")?.text ||
                                ""
                              }
                              onChange={(e) => {
                                const comps = [...newTemplate.components];
                                const bodyIdx = comps.findIndex((c) => c.type === "BODY");
                                comps[bodyIdx].text = e.target.value;
                                setNewTemplate({ ...newTemplate, components: comps });
                              }}
                              placeholder="Olá {{1}}, vimos que você se interessou no {{2}}..."
                            />
                          </div>
                          <div className="p-3 bg-muted rounded text-xs space-y-2">
                            <p className="font-semibold flex items-center gap-1">
                              <Terminal className="w-3 h-3" /> Dica de Variáveis
                            </p>
                            <p>
                              Use <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code> para dados
                              dinâmicos como nome, marca, valor.
                            </p>
                          </div>
                          {(() => {
                            const texto = String(
                              newTemplate.components.find((c: any) => c.type === "BODY")?.text ||
                                "",
                            );
                            const link = texto.match(/https?:\/\/\S+/i);
                            if (!link) return null;
                            return (
                              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded text-xs space-y-1">
                                <p className="font-semibold text-amber-800 dark:text-amber-200">
                                  Tem um link no texto do corpo
                                </p>
                                <p className="text-amber-700 dark:text-amber-300/90">
                                  A Meta costuma recusar a criação de templates com link no
                                  texto do corpo ("parâmetro inválido"). O link funciona
                                  normalmente no botão de ação — considere tirá-lo de cá.
                                </p>
                              </div>
                            );
                          })()}
                        </div>

                        <div className="border rounded-xl p-4 bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                          <div className="flex items-center gap-2 mb-4 border-b pb-2">
                            <Smartphone className="w-4 h-4 text-muted-foreground" />
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              Preview WhatsApp
                            </span>
                          </div>
                          <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm p-3 relative max-w-[90%] ml-0">
                            <div className="absolute top-2 -left-2 w-0 h-0 border-t-[8px] border-t-transparent border-r-[12px] border-r-white dark:border-r-zinc-800 border-b-[8px] border-b-transparent"></div>
                            {(() => {
                              const header = newTemplate.components.find(
                                (c: any) => c.type === "HEADER",
                              );
                              if (!header) return null;
                              const headerEhMidia =
                                String(header.format || "TEXT").toUpperCase() !== "TEXT";
                              if (headerEhMidia) {
                                // A prévia mostra o dataURL local: o `media_id` da
                                // Meta não serve para o navegador exibir a imagem.
                                if (midiaTemplate?.preview) {
                                  return (
                                    <img
                                      src={midiaTemplate.preview}
                                      alt={midiaTemplate.nome}
                                      className="rounded-md mb-1 max-h-32 w-full object-cover"
                                    />
                                  );
                                }
                                return (
                                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                                    <FileText className="w-3 h-3" />
                                    {midiaTemplate?.nome || "Anexo (PDF)"}
                                  </p>
                                );
                              }
                              return (
                                <p className="font-bold text-sm mb-1">{header.text}</p>
                              );
                            })()}
                            <p className="text-sm whitespace-pre-wrap">
                              {newTemplate.components.find((c: any) => c.type === "BODY")?.text ||
                                "Digite o conteúdo..."}
                            </p>
                            <p className="text-[10px] text-muted-foreground text-right mt-1">
                              10:45
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {wizardStep === 5 && (
                      <div className="space-y-4">
                        <Label>Rodapé (Opcional)</Label>
                        <Input
                          placeholder="Texto curto em cinza no final"
                          maxLength={60}
                          // Mesmo problema do cabeçalho: sem `value` o texto
                          // digitado some a cada re-render.
                          value={
                            newTemplate.components.find((c: any) => c.type === "FOOTER")?.text || ""
                          }
                          onChange={(e) => {
                            const comps = newTemplate.components.filter(
                              (c: any) => c.type !== "FOOTER",
                            );
                            if (e.target.value) {
                              comps.push({ type: "FOOTER", text: e.target.value });
                            }
                            setNewTemplate({ ...newTemplate, components: comps });
                          }}
                        />
                      </div>
                    )}

                    {wizardStep === 6 && (
                      <div className="space-y-4">
                        <Label>Botões de Ação (Opcional)</Label>

                        {(() => {
                          const botoes: any[] =
                            newTemplate.components.find((c: any) => c.type === "BUTTONS")
                              ?.buttons ?? [];
                          const setBotoes = (novos: any[]) => {
                            const comps = newTemplate.components.filter(
                              (c: any) => c.type !== "BUTTONS",
                            );
                            if (novos.length) {
                              comps.push({ type: "BUTTONS", buttons: novos });
                            }
                            setNewTemplate({ ...newTemplate, components: comps });
                          };

                          return (
                            <div className="space-y-3">
                              {botoes.map((b: any, i: number) => (
                                <div
                                  key={i}
                                  className="border rounded-lg p-3 space-y-3 bg-muted/30"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium">
                                      {b.type === "PHONE_NUMBER" ? "Ligar" : "Abrir site"}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive"
                                      aria-label="Remover botão"
                                      onClick={() =>
                                        setBotoes(botoes.filter((_x, j) => j !== i))
                                      }
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                  <Input
                                    placeholder="Texto do botão (ex: Ver veículos)"
                                    maxLength={25}
                                    value={b.text || ""}
                                    onChange={(e) => {
                                      const copia = [...botoes];
                                      copia[i] = { ...copia[i], text: e.target.value };
                                      setBotoes(copia);
                                    }}
                                  />
                                  {b.type === "PHONE_NUMBER" ? (
                                    <Input
                                      placeholder="Telefone com DDD (ex: 5511999999999)"
                                      value={b.phone_number || ""}
                                      onChange={(e) => {
                                        const copia = [...botoes];
                                        copia[i] = {
                                          ...copia[i],
                                          phone_number: e.target.value,
                                        };
                                        setBotoes(copia);
                                      }}
                                    />
                                  ) : (
                                    <Input
                                      placeholder="https://exemplo.com/veiculos"
                                      value={b.url || ""}
                                      onChange={(e) => {
                                        const copia = [...botoes];
                                        copia[i] = { ...copia[i], url: e.target.value };
                                        setBotoes(copia);
                                      }}
                                    />
                                  )}
                                  {b.type === "URL" && (
                                    <p className="text-[10px] text-muted-foreground">
                                      A URL pode usar uma variável do corpo, como
                                      {" {{1}}"} — o valor é preenchido no disparo.
                                    </p>
                                  )}
                                </div>
                              ))}

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Button
                                  variant="outline"
                                  disabled={botoes.length >= 3}
                                  onClick={() =>
                                    setBotoes([
                                      ...botoes,
                                      { type: "URL", text: "", url: "" },
                                    ])
                                  }
                                >
                                  <Globe className="w-4 h-4 mr-2" /> Botão de site
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={botoes.length >= 3}
                                  onClick={() =>
                                    setBotoes([
                                      ...botoes,
                                      { type: "PHONE_NUMBER", text: "", url: "" },
                                    ])
                                  }
                                >
                                  <Smartphone className="w-4 h-4 mr-2" /> Botão de telefone
                                </Button>
                              </div>

                              <p className="text-[10px] text-muted-foreground">
                                A Meta aceita até 3 botões por template. Botão de resposta
                                rápida não é suportado por aqui.
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {wizardStep === 7 && (
                      <div className="space-y-4">
                        <div className="p-4 bg-teal-50 dark:bg-teal-900/10 rounded-lg border border-teal-100 dark:border-teal-900/50 flex gap-3">
                          <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-teal-900 dark:text-teal-200">
                              Quase lá!
                            </p>
                            <p className="text-xs text-teal-700 dark:text-teal-300 mt-1">
                              O template <strong>{newTemplate.name}</strong> será enviado para
                              análise da Meta agora.
                            </p>
                          </div>
                        </div>

                        <div className="border rounded-lg p-6 space-y-4">
                          <h4 className="font-semibold text-sm">Resumo do Conteúdo:</h4>
                          <div className="bg-muted p-4 rounded font-mono text-xs whitespace-pre-wrap">
                            {JSON.stringify(newTemplate, null, 2)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter className="shrink-0 border-t pt-4">
                    {wizardStep > 1 && (
                      <Button variant="outline" onClick={() => setWizardStep((s) => s - 1)}>
                        Voltar
                      </Button>
                    )}
                    {wizardStep < 7 ? (
                      <Button onClick={() => setWizardStep((s) => s + 1)}>Próximo</Button>
                    ) : (
                      <Button onClick={handleCriarTemplate}>Enviar para Análise</Button>
                    )}
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card>
            <div className="p-0">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Última Sinc.</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {listaTemplates.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm">
                        {erroTemplates ? (
                          <>
                            <p className="text-destructive font-medium">
                              Não foi possível carregar os templates.
                            </p>
                            <p className="text-muted-foreground mt-1">
                              {String((erroTemplates as any)?.message ?? erroTemplates)}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              onClick={() => recarregarTemplates()}
                            >
                              <RefreshCw className="w-4 h-4 mr-2" /> Tentar de novo
                            </Button>
                          </>
                        ) : buscandoTemplates ? (
                          <span className="text-muted-foreground">Carregando templates…</span>
                        ) : (
                          <span className="text-muted-foreground">
                            Nenhum template ainda. Use "Sincronizar" para trazer os que já existem
                            na Meta, ou "Novo Template" para enviar um novo para análise.
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                  {listaTemplates.map((t: any) => (
                    <tr key={t.id} className="border-b">
                      <td className="px-4 py-3">
                        <div>{t.nome_interno}</div>
                        {precisaSubirCabecalho(t) && (
                          <p className="text-[10px] text-amber-700 mt-1 max-w-[240px]">
                            Cabeçalho de imagem/PDF pendente: anexe o arquivo (ícone de clipe) para
                            este template poder ser usado no disparo.
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">{t.categoria}</td>
                      <td className="px-4 py-3">
                        <Badge variant={varianteStatus(t.status)}>{rotuloStatus(t.status)}</Badge>
                        {t.status === "REJECTED" && t.motivo_recusa && (
                          <p className="text-[10px] text-muted-foreground mt-1 max-w-[220px]">
                            {t.motivo_recusa}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(t.ultima_sincronizacao).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <label
                            htmlFor={`anexar-midia-${t.id}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title="Anexar imagem/PDF do cabeçalho a este template"
                            aria-label={`Anexar mídia ao template ${t.nome_interno}`}
                          >
                            <Paperclip className="w-4 h-4" />
                          </label>
                          <input
                            id={`anexar-midia-${t.id}`}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleAnexarMidiaExistente(t, file);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Testar template ${t.nome_interno}`}
                            title="Enviar este template para o seu próprio celular"
                            onClick={() => {
                              setTemplateParaTeste(t);
                              // Values de outro template não servem: a ordem das
                              // variáveis pode ser diferente.
                              setValoresTeste([]);
                              setMidiaTeste(null);
                            }}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={`Excluir template ${t.nome_interno}`}
                            onClick={() => setTemplateParaExcluir(t)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Log da sincronização. Fica NA aba Templates, ao lado do botão
              "Sincronizar", porque é ali que o admin precisa ver por que a
              Meta devolveu 4 aprovados e a tela mostra menos. O log geral
              (aba Logs) mistura com os eventos do webhook e some no meio
              deles. */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Log da sincronização</CardTitle>
                  <CardDescription>
                    Cada tentativa de listar templates na Meta, com o total informado
                    pela Meta, o que veio em cada chamada e o que falhou.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    queryClient.invalidateQueries({ queryKey: ["wa-logs-sincronizacao"] })
                  }
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Data/Hora
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Resumo
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Chamada
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Detalhe
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        Payload
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(logsSincronizacao ?? []).map((log: any) => {
                      // O resumo da operação é gravado na coluna `erro_detalhe`
                      // (é onde o `registrarLogMeta` guarda o texto). O payload
                      // traz os dados estruturados da sincronização.
                      const resumo = log?.erro_detalhe ?? null;
                      // O payload é jsonb: o driver pode devolver o objeto já
                      // pronto ou o texto. Nos dois casos precisa virar objeto
                      // para o painel conseguir ler `porStatus`/`falhas`.
                      let payload: any = log?.payload ?? null;
                      if (typeof payload === "string") {
                        try {
                          payload = JSON.parse(payload);
                        } catch {
                          payload = null;
                        }
                      }
                      const porStatus = payload?.porStatus ?? null;
                      const totalMeta = payload?.totalMeta ?? null;
                      const falhas = Array.isArray(payload?.falhas) ? payload.falhas : [];
                      const passagens = Array.isArray(payload?.passagens) ? payload.passagens : [];
                      return (
                        <tr key={log.id} className="hover:bg-muted/30 align-top">
                          <td className="px-3 py-2 whitespace-nowrap">
                            {new Date(log.criado_em).toLocaleString("pt-BR")}
                            {log.duracao_ms != null && (
                              <span className="block text-muted-foreground">{log.duracao_ms} ms</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                log.status === "ERRO"
                                  ? "destructive"
                                  : log.status === "SUCESSO"
                                    ? "success"
                                    : "secondary"
                              }
                            >
                              {log.status}
                            </Badge>
                            {log.http_status != null && (
                              <span className="block font-mono text-muted-foreground mt-1">
                                HTTP {log.http_status}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {totalMeta != null && (
                              <span className="block text-muted-foreground">
                                Meta informa: {totalMeta}
                              </span>
                            )}
                            {porStatus && (
                              <span className="block text-muted-foreground">
                                {Object.entries(porStatus)
                                  .map(([s, t]) => `${rotuloStatus(String(s))}: ${t}`)
                                  .join(" · ")}
                              </span>
                            )}
                            {falhas.length > 0 && (
                              <span className="block text-destructive">
                                {falhas.length} falha(s)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-muted-foreground max-w-xs">
                            <span className="block truncate">{log.endpoint || "—"}</span>
                            {passagens.length > 0 && (
                              <span className="block">
                                {passagens.length} chamada(s) feita(s)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground max-w-xs">
                            {resumo || "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Search className="w-4 h-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-3xl">
                                <DialogHeader>
                                  <DialogTitle>Log da sincronização</DialogTitle>
                                  <DialogDescription>
                                    {new Date(log.criado_em).toLocaleString("pt-BR")}
                                  </DialogDescription>
                                </DialogHeader>
                                <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-4 text-xs whitespace-pre-wrap break-all">
                                  {JSON.stringify(log.payload, null, 2)}
                                </pre>
                              </DialogContent>
                            </Dialog>
                          </td>
                        </tr>
                      );
                    })}
                    {!logsSincronizacao?.length && (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                          Nenhuma sincronização registrada ainda. Aperte "Sincronizar" e o
                          resultado de cada chamada à Meta aparece aqui.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Dialog
            open={!!templateParaTeste}
            onOpenChange={(v) => {
              if (!v) {
                setTemplateParaTeste(null);
                setMidiaTeste(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Testar template</DialogTitle>
                <DialogDescription>
                  Preencha as variáveis e o número para enviar{" "}
                  <strong>{templateParaTeste?.nome_interno}</strong>. O WhatsApp só aceita template
                  aprovado — se ainda estiver em análise, a Meta recusará.
                </DialogDescription>
              </DialogHeader>
              <VariáveisTeste
                template={templateParaTeste}
                valores={valoresTeste}
                onChange={setValoresTeste}
              />
              <div className="space-y-2">
                <Label htmlFor="telefone-teste-template">Telefone (com DDD e código do país)</Label>
                <Input
                  id="telefone-teste-template"
                  inputMode="numeric"
                  placeholder="5511999999999"
                  value={telefoneTeste}
                  onChange={(e) => setTelefoneTeste(e.target.value.replace(/\D/g, "").slice(0, 13))}
                />
                <p className="text-[11px] text-muted-foreground">
                  Só números. Ex: 55 + 11 + 9 + número.
                </p>
              </div>
              {/* O anexo aparece SEMPRE. Antes ele só existia quando o
                  template já tinha HEADER de mídia — que é exatamente o caso
                  em que ele é desnecessário (a imagem do template já vai). O
                  usuário precisa poder subir a imagem de qualquer jeito, e
                  o servidor decide se usa a do template ou a enviada aqui. */}
              {(() => (
                <div className="space-y-2">
                  <Label htmlFor="midia-teste">Imagem ou PDF do cabeçalho (opcional)</Label>
                  <label className="block">
                    <input
                      id="midia-teste"
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleEscolherMidiaTeste(file);
                        e.target.value = "";
                      }}
                    />
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm cursor-pointer hover:border-teal-500 transition-all">
                      <Upload className="w-4 h-4" />
                      {midiaTeste ? "Trocar anexo" : "Anexar imagem ou PDF"}
                    </span>
                  </label>
                  {midiaTeste && (
                    <div className="flex items-center gap-3 rounded-md border p-2">
                      {midiaTeste.preview ? (
                        <img
                          src={midiaTeste.preview}
                          alt="Prévia do anexo"
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                          <Upload className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium">{midiaTeste.nome}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {(midiaTeste.base64.length / 1024 / 1024).toFixed(1)} MB — vai no topo
                          da mensagem
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMidiaTeste(null)}
                      >
                        <Trash2 className="w-4 h-4" /> Remover
                      </Button>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Use quando o template veio da Meta com o cabeçalho sem imagem válida, ou
                    quando quiser ver como fica com a sua imagem.
                  </p>
                </div>
              ))()}
              <DialogFooter>
                <Button variant="outline" onClick={() => setTemplateParaTeste(null)}>
                  Cancelar
                </Button>
                <Button
                  // Sem arrow, o evento de clique entraria como `valores` e
                  // estragaria o teste do diálogo de Templates.
                  onClick={() => handleEnviarTeste()}
                  disabled={
                    !podeEnviarTeste(
                      templateParaTeste,
                      valoresTeste,
                      telefoneTeste.replace(/\D/g, ""),
                    )
                  }
                >
                  Enviar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog
            open={!!templateParaExcluir}
            onOpenChange={(v) => !v && setTemplateParaExcluir(null)}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Excluir template</DialogTitle>
                <DialogDescription>
                  O template <strong>{templateParaExcluir?.nome_interno}</strong> será apagado
                  <strong> na Meta e neste sistema</strong>. A exclusão na Meta é definitiva: para
                  ter o template de volta será preciso criar e passar pela análise de novo.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTemplateParaExcluir(null)}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleExcluirTemplate}>
                  Excluir
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="logs" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Logs do WhatsApp</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["wa-logs"] });
                queryClient.invalidateQueries({ queryKey: ["wa-logs-disparo"] });
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
            </Button>
          </div>

          {/* Trilha do motor de disparo. Fica acima dos logs de webhook
              porque é ela que responde "por que a campanha não saiu?" — o
              log de webhook só registra chamadas feitas à Meta. */}
          <Card>
            <CardHeader>
              <CardTitle>Log de disparo (motor)</CardTitle>
              <CardDescription>
                Cada passo do motor de envio: fila montada, bloqueio por template,
                janela de trabalho, lotes enviados, testes de template e erros.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Data/Hora
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Campanha
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Evento
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        Detalhe
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(logsDisparo ?? []).map((log: any) => (
                      <tr key={log.id} className="hover:bg-muted/30 align-top">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(log.criado_em).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-3 py-2">
                          {log.campanha_nome || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={varianteAcaoDisparo(log.acao)}>
                            {rotuloAcaoDisparo(log.acao)}
                          </Badge>
                          {log.em_memoria && (
                            <Badge variant="outline" className="ml-1">
                              não gravado
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-xl">
                          {log.detalhe || "—"}
                        </td>
                      </tr>
                    ))}
                    {!logsDisparo?.length && (
                      <tr>
                        <td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">
                          Nenhum evento de disparo ainda. Ao criar uma campanha ou apertar
                          "Disparar agora", cada passo do motor aparece aqui.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="px-4 py-3">Data/Hora</th>
                    <th className="px-4 py-3">Origem</th>
                    <th className="px-4 py-3">Operação</th>
                    <th className="px-4 py-3">WABA</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Detalhe</th>
                    <th className="px-4 py-3 text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs?.map((log: any) => (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(log.criado_em).toLocaleString("pt-BR")}
                        {log.duracao_ms != null && (
                          <span className="block text-xs text-muted-foreground">
                            {log.duracao_ms} ms
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={log.direcao === "ENTRADA" ? "secondary" : "outline"}>
                          {log.direcao === "ENTRADA" ? "Recebido" : "Enviado"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {rotuloOperacao(log.event_type)}
                        {log.http_status != null && (
                          <span className="block font-mono text-xs text-muted-foreground">
                            HTTP {log.http_status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{log.waba_id || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            log.status === "ERRO"
                              ? "destructive"
                              : log.status === "SUCESSO"
                                ? "success"
                                : "secondary"
                          }
                        >
                          {log.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                        {log.erro_detalhe || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Search className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>Payload da chamada</DialogTitle>
                              <DialogDescription>
                                {rotuloOperacao(log.event_type)} · {new Date(log.criado_em).toLocaleString("pt-BR")}
                              </DialogDescription>
                            </DialogHeader>
                            <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-4 text-xs whitespace-pre-wrap break-all">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          </DialogContent>
                        </Dialog>
                      </td>
                    </tr>
                  ))}
                  {!logs?.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        Nenhum evento registrado ainda. Use "Testar conexão" ou "Sincronizar
                        templates" na aba Configurações — toda chamada feita à Meta passa a ser
                        registrada aqui.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Configurações */}
        <TabsContent value="config" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>WhatsApp Business Platform</CardTitle>
                      <CardDescription>Conexão oficial via Meta Cloud API</CardDescription>
                    </div>
                    <Badge variant={config?.status === "CONECTADO" ? "success" : "destructive"}>
                      {config?.status === "CONECTADO" ? "✓ Conectado" : "Não conectado"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <Label className="text-xs uppercase text-muted-foreground">
                        Nome da Empresa (Meta)
                      </Label>
                      <p className="font-semibold">{config?.business_name || "---"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs uppercase text-muted-foreground">
                        Número Conectado
                      </Label>
                      <p className="font-semibold">{config?.phone_number || "---"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs uppercase text-muted-foreground">WABA ID</Label>
                      <p className="font-mono text-xs">{config?.waba_id || "---"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs uppercase text-muted-foreground">
                        Phone Number ID
                      </Label>
                      <p className="font-mono text-xs">{config?.phone_number_id || "---"}</p>
                    </div>
                  </div>

                  <div className="pt-6 border-t flex flex-wrap gap-3">
                    <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
                      <DialogTrigger asChild>
                        <Button
                          className="bg-teal-600 hover:bg-teal-700"
                          onClick={() => setEditingConfig(config || {})}
                        >
                          <Settings className="w-4 h-4 mr-2" /> Configurar Credenciais
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>Conectar WhatsApp Meta</DialogTitle>
                          <DialogDescription>
                            Insira as credenciais do seu App na Meta Developers Platform.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-4 py-4">
                          <div className="space-y-2">
                            <Label>Meta App ID</Label>
                            <Input
                              value={editingConfig.app_id || ""}
                              onChange={(e) =>
                                setEditingConfig({ ...editingConfig, app_id: e.target.value })
                              }
                              placeholder="Ex: 123456789012345"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Meta App Secret</Label>
                            <Input
                              type="password"
                              value={editingConfig.app_secret || ""}
                              onChange={(e) =>
                                setEditingConfig({ ...editingConfig, app_secret: e.target.value })
                              }
                              placeholder="••••••••••••"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>WABA ID</Label>
                            <Input
                              value={editingConfig.waba_id || ""}
                              onChange={(e) =>
                                setEditingConfig({ ...editingConfig, waba_id: e.target.value })
                              }
                              placeholder="Somente números. Ex: 1338904312641924"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Phone Number ID</Label>
                            <Input
                              value={editingConfig.phone_number_id || ""}
                              onChange={(e) =>
                                setEditingConfig({
                                  ...editingConfig,
                                  phone_number_id: e.target.value,
                                })
                              }
                              placeholder="Somente números. Ex: 1028433120244316"
                            />
                          </div>
                          <div className="col-span-2 space-y-2">
                            <Label>System User Access Token (Permanent)</Label>
                            <Input
                              type="password"
                              value={editingConfig.access_token || ""}
                              onChange={(e) =>
                                setEditingConfig({ ...editingConfig, access_token: e.target.value })
                              }
                              placeholder="EAABw..."
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Graph API Version</Label>
                            <Select
                              value={
                                // A tela mostra sempre o formato canônico: o
                                // valor gravado pode ter vindo como "v26" e
                                // seria irreconhecível no seletor.
                                ["v26.0", "v25.0", "v24.0"].includes(
                                  editingConfig.graph_api_version || "",
                                )
                                  ? editingConfig.graph_api_version
                                  : "v26.0"
                              }
                              onValueChange={(v) =>
                                setEditingConfig({
                                  ...editingConfig,
                                  graph_api_version: v,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="v26.0">v26.0 (mais recente)</SelectItem>
                                <SelectItem value="v25.0">v25.0</SelectItem>
                                <SelectItem value="v24.0">v24.0</SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Versões suportadas pela Meta: v26.0, v25.0 e v24.0. Versões
                              antigas saem do ar e passam a recusar todas as chamadas.
                            </p>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsConfigOpen(false)}>
                            Cancelar
                          </Button>
                          <Button
                            className="bg-teal-600 hover:bg-teal-700"
                            onClick={handleSaveConfig}
                          >
                            Salvar e Validar
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Button variant="outline" onClick={handleTestarConexao}>
                      <RefreshCw className="w-4 h-4 mr-2" /> Validar Conexão
                    </Button>

                    <Button variant="outline" onClick={handleBuscarDadosAutos}>
                      <Search className="w-4 h-4 mr-2" /> Buscar Dados Meta
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Webhook Meta</CardTitle>
                  <CardDescription>
                    Configure estas URLs no Painel de Desenvolvedor da Meta
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Callback URL</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/public/webhooks/whatsapp`}
                        className="font-mono text-xs bg-muted"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          copyToClipboard(`${window.location.origin}/api/public/webhooks/whatsapp`)
                        }
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Verify Token</Label>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        type={webhookTokenGerado ? "text" : "password"}
                        value={webhookTokenGerado || config?.webhook_verify_token || ""}
                        className="font-mono text-xs bg-muted"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          copyToClipboard(webhookTokenGerado || config?.webhook_verify_token || "")
                        }
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleGerarToken}>
                        Gerar Novo
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase text-muted-foreground">Status Webhook</p>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-medium text-green-600">Funcionando</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase text-muted-foreground">Último Evento</p>
                      <p className="text-sm">
                        {logs &&
                        Array.isArray(logs) &&
                        logs.length > 0 &&
                        (logs[0] as any).criado_em
                          ? new Date((logs[0] as any).criado_em).toLocaleTimeString()
                          : "Nenhum"}
                      </p>
                    </div>
                    <div className="space-y-1 text-right">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-teal-600"
                        onClick={() => {}}
                      >
                        Ver Documentação Meta
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-md">Saúde da Integração</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Meta API</span>
                      <Badge variant="success">OK</Badge>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">WABA</span>
                      <Badge variant={config?.waba_id ? "success" : "destructive"}>
                        {config?.waba_id ? "Encontrada" : "Ausente"}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Número</span>
                      <Badge variant={config?.phone_number ? "success" : "destructive"}>
                        {config?.phone_number ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Webhook</span>
                      <Badge variant="success">Ativo</Badge>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full text-xs" size="sm">
                    Executar Diagnóstico Completo
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-teal-50 dark:bg-teal-900/10 border-teal-100 dark:border-teal-900/50">
                <CardHeader>
                  <CardTitle className="text-md flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-600" />
                    Segurança
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-2">
                  <p>
                    • Access Token e App Secret são armazenados de forma criptografada no banco de
                    dados.
                  </p>
                  <p>• O navegador nunca recebe os tokens completos após o salvamento.</p>
                  <p>• Toda comunicação com a API da Meta é feita exclusivamente via servidor.</p>
                </CardContent>
              </Card>

              <div className="p-4 border border-dashed rounded-lg text-center space-y-2">
                <Terminal className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
                <p className="text-xs text-muted-foreground">Modo Desenvolvedor</p>
                <Button variant="ghost" size="sm" className="text-[10px] h-7">
                  Ver JSON de Resposta
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Automações */}
        <TabsContent value="automacoes" className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold">Automações WhatsApp</h2>
              <p className="text-sm text-muted-foreground">
                Mensagens disparadas automaticamente por eventos do sistema
              </p>
            </div>
            <Dialog open={isAutomacaoWizardOpen} onOpenChange={setIsAutomacaoWizardOpen}>
              <DialogTrigger asChild>
                <Button className="bg-teal-600 hover:bg-teal-700">
                  <Plus className="w-4 h-4 mr-2" /> Nova Automação
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Nova Automação (Etapa {automacaoStep}/7)</DialogTitle>
                  <DialogDescription>
                    Configure disparos automáticos baseados em eventos
                  </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                  {automacaoStep === 1 && (
                    <div className="space-y-4">
                      <Label>Selecione o Evento Gatilho</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { id: "VEICULO_PUBLICADO", label: "Veículo Publicado", icon: Car },
                          { id: "LANCE_SUPERADO", label: "Lance Superado", icon: Zap },
                          { id: "VISTORIA_AGENDADA", label: "Vistoria Agendada", icon: Clock },
                          {
                            id: "PAGAMENTO_CONFIRMADO",
                            label: "Pagamento Confirmado",
                            icon: CheckCircle2,
                          },
                        ].map((ev) => (
                          <Card
                            key={ev.id}
                            className={cn(
                              "cursor-pointer border-2 hover:border-teal-500 transition-all",
                              novaAutomacao.evento === ev.id
                                ? "border-teal-600 bg-teal-50"
                                : "border-slate-200",
                            )}
                            onClick={() => {
                              setNovaAutomacao({ ...novaAutomacao, evento: ev.id });
                              setAutomacaoStep(2);
                            }}
                          >
                            <CardContent className="p-4 flex items-center gap-4">
                              <div className="p-2 bg-white rounded-lg shadow-sm">
                                <ev.icon className="w-6 h-6 text-teal-600" />
                              </div>
                              <div className="text-left">
                                <h3 className="font-bold text-sm">{ev.label}</h3>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {automacaoStep === 2 && (
                    <div className="space-y-4">
                      <Label>Quem deve receber?</Label>
                      <Select
                        value={novaAutomacao.publico}
                        onValueChange={(val) => {
                          setNovaAutomacao({ ...novaAutomacao, publico: val });
                          setAutomacaoStep(3);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o destinatário" />
                        </SelectTrigger>
                        <SelectContent>
                          {novaAutomacao.evento === "VEICULO_PUBLICADO" && (
                            <SelectItem value="GRUPOS_UAZAPI">Grupos WhatsApp</SelectItem>
                          )}
                          <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                          <SelectItem value="COMPRADOR_VENCEDOR">Comprador Vencedor</SelectItem>
                          <SelectItem value="COMPRADOR_PARTICIPANTE">
                            Comprador Participante
                          </SelectItem>
                          <SelectItem value="COMPRADOR_SUPERADO">Comprador Superado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {automacaoStep === 3 && novaAutomacao.publico === "GRUPOS_UAZAPI" && (
                    <div className="space-y-4">
                      <Label>Quais grupos recebem o veículo publicado?</Label>
                      {gruposVisiveisUazapi.length === 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={carregarGruposUazapi}
                          disabled={carregandoGrupos}
                        >
                          {carregandoGrupos ? "Carregando..." : "Carregar grupos"}
                        </Button>
                      )}
                      {erroGrupos && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">{erroGrupos}</p>
                      )}
                      {gruposPermitidosUazapi.length > 0 && gruposVisiveisUazapi.length === 0 && !carregandoGrupos && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Nenhum grupo permitido foi encontrado nesta instância. Confira a seleção em Marketing, na configuração da Uazapi.
                        </p>
                      )}
                      {gruposVisiveisUazapi.length > 0 && (
                        <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                          {gruposVisiveisUazapi.map((g: any) => {
                            const ativo = (novaAutomacao.regras?.grupos_alvo || []).includes(g.id);
                            return (
                              <label
                                key={g.id}
                                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
                                  ativo
                                    ? "border-teal-600 bg-white"
                                    : "border-slate-200 bg-white hover:border-slate-400"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-teal-600"
                                  checked={ativo}
                                  onChange={() =>
                                    setNovaAutomacao({
                                      ...novaAutomacao,
                                      regras: {
                                        ...(novaAutomacao.regras || {}),
                                        grupos_alvo: ativo
                                          ? (novaAutomacao.regras?.grupos_alvo || []).filter(
                                              (id: string) => id !== g.id,
                                            )
                                          : [...(novaAutomacao.regras?.grupos_alvo || []), g.id],
                                      },
                                    })
                                  }
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{g.nome}</p>
                                  <p className="truncate text-[10px] text-muted-foreground">{g.id}</p>
                                </div>
                                {typeof g.participantes === "number" && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {g.participantes} participantes
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                        <p className="text-xs font-medium text-muted-foreground">Mensagem</p>
                        <p className="text-xs text-muted-foreground">
                          É montada automaticamente a partir do veículo publicado: nome, ano e km,
                          localização e o link público da vitrine, com a foto de capa.
                        </p>
                        <Button variant="secondary" size="sm" onClick={() => setAutomacaoStep(4)}>
                          Continuar
                        </Button>
                      </div>
                    </div>
                  )}

                  {automacaoStep === 3 && novaAutomacao.publico !== "GRUPOS_UAZAPI" && (
                    <div className="space-y-4">
                      <Label>Escolha o Template</Label>
                      <div className="grid grid-cols-1 gap-3">
                        {listaTemplates.map((t: any) => {
                          const aprovado = templateAprovado(t?.status);
                          return (
                          <Card
                            key={t.id}
                            className={cn(
                              "border-2 transition-all",
                              aprovado
                                ? "cursor-pointer hover:border-teal-500"
                                : "cursor-not-allowed opacity-60",
                              novaAutomacao.template_id === t.id
                                ? "border-teal-600 bg-teal-50"
                                : "border-slate-200",
                            )}
                            onClick={() => {
                              if (!aprovado) return;
                              setNovaAutomacao({ ...novaAutomacao, template_id: t.id });
                              setAutomacaoStep(4);
                            }}
                          >
                            <CardContent className="p-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <LayoutTemplate className="w-5 h-5 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{t.meta_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {t.categoria} • {t.idioma}
                                  </p>
                                </div>
                              </div>
                              <Badge variant={varianteStatus(t?.status)}>
                                {rotuloStatus(t?.status)}
                              </Badge>
                              {precisaSubirCabecalho(t) && (
                                <p className="text-[10px] text-amber-700 mt-1">
                                  Falta anexar o cabeçalho (imagem/PDF) deste template.
                                </p>
                              )}
                            </CardContent>
                          </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {automacaoStep >= 4 && (
                    <div className="text-center py-10 space-y-4">
                      <CheckCircle2 className="w-16 h-16 text-teal-600 mx-auto" />
                      <h3 className="text-xl font-bold">Quase lá!</h3>
                      <p className="text-muted-foreground">
                        O motor de automações cuidará do preenchimento das variáveis e
                        elegibilidade.
                      </p>
                      <div className="max-w-sm mx-auto space-y-2">
                        <Label htmlFor="automacao-nome">Nome da automação</Label>
                        <Input
                          id="automacao-nome"
                          value={novaAutomacao.nome}
                          onChange={(e) =>
                            setNovaAutomacao({ ...novaAutomacao, nome: e.target.value })
                          }
                          placeholder="Ex.: Aviso de veículo publicado"
                        />
                        <p className="text-xs text-muted-foreground">
                          Obrigatório — é o nome que aparece na lista de automações.
                        </p>
                      </div>
                      <Button
                        onClick={handleSalvarAutomacao}
                        className="bg-teal-600"
                        disabled={!novaAutomacao.nome.trim()}
                      >
                        Concluir e Salvar como Rascunho
                      </Button>
                    </div>
                  )}
                </div>

                <DialogFooter className="flex justify-between border-t pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setAutomacaoStep((prev) => Math.max(1, prev - 1))}
                    disabled={automacaoStep === 1}
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" /> Voltar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {automacoes?.map((auto: any) => (
              <Card key={auto.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{auto.nome}</CardTitle>
                      <CardDescription className="text-xs">{auto.evento}</CardDescription>
                    </div>
                    <Badge
                      variant={auto.status === "ATIVA" ? "default" : "secondary"}
                      className={cn(
                        auto.status === "ATIVA"
                          ? "bg-green-500"
                          : auto.status === "PAUSADA"
                            ? "bg-amber-500 text-white"
                            : "",
                      )}
                    >
                      {auto.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Público</p>
                      <p className="font-medium">{auto.publico}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Template</p>
                      <p className="font-medium truncate">{auto.template_name}</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Activity className="w-3 h-3" />
                      <span>{auto.total_enviados} envios</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setSelectedAutomacao(auto);
                          setIsExecucoesOpen(true);
                        }}
                      >
                        <History className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <FileEdit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600">
                        <Pause className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {(!automacoes || automacoes.length === 0) && (
              <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl space-y-3">
                <Zap className="w-12 h-12 mx-auto text-muted-foreground opacity-20" />
                <p className="text-muted-foreground">Nenhuma automação configurada</p>
                <Button variant="outline" size="sm" onClick={() => setIsAutomacaoWizardOpen(true)}>
                  Criar Primeira Automação
                </Button>
              </div>
            )}
          </div>

          <Sheet open={isExecucoesOpen} onOpenChange={setIsExecucoesOpen}>
            <SheetContent className="sm:max-w-xl overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Histórico de Execução</SheetTitle>
                <SheetDescription>{selectedAutomacao?.nome}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                {execucoesAutomacao?.map((exec: any) => (
                  <div key={exec.id} className="p-3 border rounded-lg space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">{exec.destinatario_nome || "N/A"}</span>
                      <Badge
                        variant={exec.status === "ENVIADO" ? "default" : "destructive"}
                        className="text-[10px]"
                      >
                        {exec.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{new Date(exec.criado_em).toLocaleString()}</span>
                      <span>{exec.mensagem_status || "Pendente"}</span>
                    </div>
                    {exec.erro_detalhe && (
                      <p className="text-[10px] text-red-500 mt-1">{exec.erro_detalhe}</p>
                    )}
                  </div>
                ))}
                {(!execucoesAutomacao || execucoesAutomacao.length === 0) && (
                  <div className="py-20 text-center opacity-50">Nenhuma execução registrada</div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </TabsContent>
      </Tabs>
    </div>
  );
}
