// CACHE_BUSTER_20260829_193100: marker unico para forçar Vite gerar hash chunk DIFERENTE do build antigo (vistorias-CKJ-QtoS.js). Apos deploy: chunk TEM QUE TER hash DIFERENTE. Se continuar CKJ-QtoS = CDN/browser cache stale.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  criarAgendamentoVistoriaFn,
  remarcarAgendamentoVistoriaFn,
  getSlotsUnidadeDisponiveisFn,
  getUnidadesCadastroFn,
  getUnidadesDisponiveisFn,
  getVeiculosAguardandoVistoriaFn,
  getVistoriadoresCadastroFn,
  getVistoriasAdminFn,
  salvarUnidadeCadastroFn,
  salvarVistoriadorCadastroFn,
} from "@/lib/vistorias.functions";
import { getFilaAnalisePosVistoriaFn } from "@/lib/analise-pos-vistoria.functions";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { 
  Search, 
  Calendar,
  Clock,
  MapPin,
  User,
  Building2,
  UserCog,
  UserPlus,
  Loader2,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Building,
  Users,
  Phone,
  CalendarClock,
  ClipboardCheck,
  ListChecks,
  Pencil,
  Sparkles,
  Info,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { buscarCep, geocodificar, maskCep } from "@/lib/brasil";
import MapaLocalizacao from "@/components/shared/MapaLocalizacao";
import MapaRedeCredenciada from "@/components/shared/MapaRedeCredenciada";

const DIAS_ATENDIMENTO = [
  { key: "1", label: "Segunda" },
  { key: "2", label: "Terça" },
  { key: "3", label: "Quarta" },
  { key: "4", label: "Quinta" },
  { key: "5", label: "Sexta" },
  { key: "6", label: "Sábado" },
  { key: "0", label: "Domingo" },
] as const;

function criarPeriodoPadrao() {
  return { inicio: "08:00", fim: "18:00" };
}

function criarHorarioAtendimentoForm() {
  return DIAS_ATENDIMENTO.reduce<Record<string, Array<{ inicio: string; fim: string }>>>((acc, dia) => {
    acc[dia.key] = [];
    return acc;
  }, {});
}

function normalizarHorarioAtendimentoForm(value: any) {
  const base = criarHorarioAtendimentoForm();
  if (!value || typeof value !== "object") return base;
  for (const dia of DIAS_ATENDIMENTO) {
    const faixa = value[dia.key];
    if (Array.isArray(faixa)) {
      base[dia.key] = faixa
        .filter((item) => item && typeof item === "object")
        .map((item: any) => ({
          inicio: typeof item.inicio === "string" ? item.inicio : "08:00",
          fim: typeof item.fim === "string" ? item.fim : "18:00",
        }));
      continue;
    }
    if (!faixa || typeof faixa !== "object") continue;
    if (typeof faixa.inicio === "string" && typeof faixa.fim === "string") {
      base[dia.key] = [{ inicio: faixa.inicio, fim: faixa.fim }];
    }
  }
  return base;
}

function extrairHorarioAtendimentoPayload(value: Record<string, Array<{ inicio: string; fim: string }>>) {
  return Object.entries(value).reduce<Record<string, Array<{ inicio: string; fim: string }>>>((acc, [dia, faixas]) => {
    const periodos = faixas.filter((faixa) => faixa.inicio && faixa.fim);
    if (periodos.length === 0) return acc;
    acc[dia] = periodos;
    return acc;
  }, {});
}

function horarioParaMinutos(value: string) {
  const [hora, minuto] = String(value || "00:00").split(":").map(Number);
  return (hora || 0) * 60 + (minuto || 0);
}

function resumirHorarioAtendimento(value: any) {
  const horario = normalizarHorarioAtendimentoForm(value);
  const ativos = DIAS_ATENDIMENTO.filter((dia) => (horario[dia.key] || []).length > 0);
  if (ativos.length === 0) return "Sem horários configurados";
  return ativos
    .map((dia) => `${dia.label.slice(0, 3)} ${(horario[dia.key] || []).map((faixa) => `${faixa.inicio}-${faixa.fim}`).join(", ")}`)
    .join(" | ");
}

export const Route = createFileRoute("/admin/vistorias")({
  validateSearch: (search: Record<string, unknown>): { tab?: string; status?: string; veiculoId?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    veiculoId: typeof search.veiculoId === "string" ? search.veiculoId : undefined,
  }),
  head: () => ({
    meta: [{ title: "Vistorias | ESSE JÁ FOI" }],
  }),
  component: VistoriasAdminPage,
});

function normalizarIdStr(value: unknown): string {
  if (value == null) return "";
  const raw = typeof value === "string" ? value : (value as any)?.toString?.() ?? String(value);
  const apenasUuid = raw.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (apenasUuid?.[0]) return apenasUuid[0].toLowerCase();
  return raw.trim().toLowerCase();
}

function idsIguais(a: unknown, b: unknown): boolean {
  const na = normalizarIdStr(a);
  const nb = normalizarIdStr(b);
  if (!na || !nb) return false;
  return na === nb;
}

const DIAS_SEMANA_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatarDataIso(value: Date) {
  const ano = value.getFullYear();
  const mes = String(value.getMonth() + 1).padStart(2, "0");
  const dia = String(value.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function gerar7Dias(offsetSemanas: number) {
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  const inicioSemana = new Date(hoje);
  inicioSemana.setDate(hoje.getDate() + offsetSemanas * 7);
  const hojeIso = formatarDataIso(hoje);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioSemana);
    d.setDate(inicioSemana.getDate() + i);
    const iso = formatarDataIso(d);
    return {
      iso,
      diaSemanaNum: d.getDay(),
      diaSemana: DIAS_SEMANA_LABEL[d.getDay()].slice(0, 3),
      diaMes: String(d.getDate()).padStart(2, "0"),
      mes: String(d.getMonth() + 1).padStart(2, "0"),
      labelCurto: `${DIAS_SEMANA_LABEL[d.getDay()].slice(0, 3)} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      passado: d.getTime() < new Date(`${hojeIso}T12:00:00`).getTime(),
    };
  });
}

function gerarProximos7Dias() { return gerar7Dias(0); }

function resumirHorarioAtendimentoUnidade(value: any): string {
  const horario = normalizarHorarioAtendimentoForm(value?.horario_atendimento);
  const ativos = DIAS_ATENDIMENTO.filter((dia) => (horario[dia.key] || []).length > 0);
  if (ativos.length === 0) return "Sem horários cadastrados.";
  return ativos
    .map((dia) => `${dia.label.slice(0, 3)} ${(horario[dia.key] || []).map((faixa: any) => `${faixa.inicio}-${faixa.fim}`).join(", ")}`)
    .join(" | ");
}

function totalSlotsPorDia(unidadeHorario: any, dataIso: string) {
  const horario = normalizarHorarioAtendimentoForm(unidadeHorario?.horario_atendimento);
  const dataBase = new Date(`${dataIso}T12:00:00`);
  const diaKey = String(dataBase.getDay());
  const periodos = horario[diaKey] || [];
  const duracao = Math.max(Number(unidadeHorario?.duracao_padrao_minutos || 60), 1);
  const intervalo = Math.max(Number(unidadeHorario?.intervalo_entre_vistorias_minutos || 0), 0);
  const passo = duracao + intervalo;
  let total = 0;
  for (const periodo of periodos) {
    const inicio = toMinutesLocal(periodo.inicio);
    const fim = toMinutesLocal(periodo.fim);
    if (fim <= inicio) continue;
    for (let t = inicio; t + duracao <= fim; t += passo) {
      total++;
    }
  }
  const periodosLabel = periodos.length
    ? periodos.map((p: any) => `${p.inicio}-${p.fim}`).join(", ")
    : "Sem horários cadastrados";
  return {
    aberto: periodos.length > 0,
    totalEstimado: total,
    periodosLabel,
  };
}

function toMinutesLocal(value: string) {
  const [hora, minuto] = String(value || "00:00").split(":").map(Number);
  return (hora || 0) * 60 + (minuto || 0);
}

function VistoriasAdminPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/vistorias" });
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const initialTab = search.tab || (search.status ? "agendamentos" : "aguardando_analise");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [buscaFila, setBuscaFila] = useState("");
  const [buscaAgendamento, setBuscaAgendamento] = useState("");
  const [buscaAgendaCriada, setBuscaAgendaCriada] = useState("");
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<any | null>(null);
  const [unidadeId, setUnidadeId] = useState("");
  const [buscaUnidadeModal, setBuscaUnidadeModal] = useState("");
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [dataVistoria, setDataVistoria] = useState("");
  const [horarioVistoria, setHorarioVistoria] = useState("");
  const [unidadeModalOpen, setUnidadeModalOpen] = useState(false);
  const [vistoriadorModalOpen, setVistoriadorModalOpen] = useState(false);
  const [remarcacao, setRemarcacao] = useState<{
    vistoriaId: string;
    dataOriginal?: string;
    horarioOriginal?: string;
    unidadeIdOriginal?: string;
  } | null>(null);

  // Filtros da aba "Unidades e Equipe"
  const [buscaCadastroUnidade, setBuscaCadastroUnidade] = useState("");
  const [filtroStatusUnidade, setFiltroStatusUnidade] = useState<"todas" | "ativas" | "inativas">("ativas");
  const [filtroUFUnidade, setFiltroUFUnidade] = useState<string>("todas");
  const [unidadeFocoMapaId, setUnidadeFocoMapaId] = useState<string | null>(null);
  const [unidadeForm, setUnidadeForm] = useState({
    id: "",
    nome: "",
    cnpj: "",
    cep: "",
    endereco: "",
    cidade: "",
    estado: "",
    latitude: null as number | null,
    longitude: null as number | null,
    telefone: "",
    whatsapp: "",
    email: "",
    responsavel: "",
    horario_atendimento: criarHorarioAtendimentoForm(),
    duracao_padrao_minutos: 60,
    intervalo_entre_vistorias_minutos: 30,
    ativo: true,
  });
  const [buscandoCepUnidade, setBuscandoCepUnidade] = useState(false);
  const [geocodificandoUnidade, setGeocodificandoUnidade] = useState(false);
  const [vistoriadorForm, setVistoriadorForm] = useState({
    usuario_id: "",
    unidade_id: "",
    status: "ATIVO",
  });
  
  const getVistorias = useServerFn(getVistoriasAdminFn);
  const getAguardando = useServerFn(getVeiculosAguardandoVistoriaFn);
  const getFilaPosVistoria = useServerFn(getFilaAnalisePosVistoriaFn);
  const getSlotsUnidade = useServerFn(getSlotsUnidadeDisponiveisFn);
  const getUnidades = useServerFn(getUnidadesDisponiveisFn);
  const criarAgendamento = useServerFn(criarAgendamentoVistoriaFn);
  const remarcarAgendamento = useServerFn(remarcarAgendamentoVistoriaFn);
  const getUnidadesCadastro = useServerFn(getUnidadesCadastroFn);
  const getVistoriadoresCadastro = useServerFn(getVistoriadoresCadastroFn);
  const salvarUnidadeCadastro = useServerFn(salvarUnidadeCadastroFn);
  const salvarVistoriadorCadastro = useServerFn(salvarVistoriadorCadastroFn);

  useEffect(() => {
    setActiveTab(search.tab || (search.status ? "agendamentos" : "aguardando_analise"));
  }, [search.tab, search.status]);

  const updateSearch = (next: { tab?: string; status?: string; veiculoId?: string }) => {
    navigate({
      search: {
        tab: next.tab,
        status: next.status,
        veiculoId: next.veiculoId,
      } as any,
    });
  };

  const statusAgendamento = useMemo(
    () => (activeTab === "agendamentos" ? search.status : undefined),
    [activeTab, search.status],
  );

  const { data: agendamentosRes, isLoading: loadingAgendamentos } = useQuery({
    queryKey: ["admin-vistorias", statusAgendamento || "TODOS"],
    queryFn: () => getVistorias({ data: { status: statusAgendamento } }),
    enabled: activeTab === "agendamentos",
  });

  const { data: aguardandoRes, isLoading: loadingAguardando } = useQuery({
    queryKey: ["admin-veiculos-aguardando-vistoria"],
    queryFn: () => getAguardando(),
    enabled: activeTab === 'aguardando'
  });

  const { data: posVistoriaRes, isLoading: loadingPosVistoria } = useQuery({
    queryKey: ["admin-veiculos-aguardando-analise-pos"],
    queryFn: () => getFilaPosVistoria(),
    enabled: activeTab === 'aguardando_analise'
  });

  const { data: unidadesRes, isLoading: loadingUnidades } = useQuery({
    queryKey: ["unidades-vistoria", agendaOpen ? "todas" : "off"],
    queryFn: () => getUnidades({ data: { cidade: veiculoSelecionado?.vendedor_cidade } }),
    enabled: agendaOpen && !!veiculoSelecionado,
  });

  const unidades = unidadesRes?.data || [];
  const unidadeSelecionada = unidades.find((unidade: any) => idsIguais(unidade.id, unidadeId)) || null;

  const { data: slotsRes, isLoading: loadingSlots } = useQuery({
    queryKey: ["slots-unidade-vistoria", normalizarIdStr(unidadeId), dataVistoria, unidadeSelecionada?.nome || "", unidadeSelecionada?.cidade || ""],
    queryFn: () => getSlotsUnidade({
      data: {
        unidadeId: normalizarIdStr(unidadeId),
        data: dataVistoria,
        vistoriadorId: null,
        nomeUnidade: unidadeSelecionada?.nome ? String(unidadeSelecionada.nome).trim() : null,
        cidadeUnidade: unidadeSelecionada?.cidade ? String(unidadeSelecionada.cidade).trim() : null,
      },
    }),
    enabled: agendaOpen && !!normalizarIdStr(unidadeId) && !!dataVistoria,
  });

  const { data: unidadesCadastroRes, isLoading: loadingUnidadesCadastro } = useQuery({
    queryKey: ["cadastro-unidades-vistoria"],
    queryFn: () => getUnidadesCadastro(),
    enabled: activeTab === "cadastros",
  });

  const { data: vistoriadoresCadastroRes, isLoading: loadingVistoriadoresCadastro } = useQuery({
    queryKey: ["cadastro-vistoriadores"],
    queryFn: () => getVistoriadoresCadastro(),
    enabled: activeTab === "cadastros",
  });

  const agendamentos = agendamentosRes?.data || [];
  const aguardando = aguardandoRes?.data || [];
  const filaPosVistoria = posVistoriaRes?.data || [];
  const unidadesCadastro = unidadesCadastroRes?.data || [];
  const vistoriadoresCadastro = vistoriadoresCadastroRes?.data || [];

  // Filtros das unidades da aba "Cadastros"
  const ufsDisponiveisUnidades = useMemo(() => {
    const set = new Set<string>();
    for (const u of unidadesCadastro) {
      if (u.estado) set.add(String(u.estado).toUpperCase());
    }
    return Array.from(set).sort();
  }, [unidadesCadastro]);

  const unidadesFiltradas = useMemo(() => {
    const termo = buscaCadastroUnidade.trim().toLowerCase();
    return unidadesCadastro.filter((u: any) => {
      if (filtroStatusUnidade === "ativas" && !u.ativo) return false;
      if (filtroStatusUnidade === "inativas" && u.ativo) return false;
      if (filtroUFUnidade !== "todas" && String(u.estado || "").toUpperCase() !== filtroUFUnidade.toUpperCase()) return false;
      if (!termo) return true;
      const haystack = [
        u.nome,
        u.cidade,
        u.estado,
        u.responsavel,
        u.telefone,
        u.whatsapp,
        u.email,
        u.endereco,
        u.cep,
        u.cnpj,
        (u.cidades_atendidas || []).join(" "),
      ].join(" ").toLowerCase();
      return haystack.includes(termo);
    });
  }, [unidadesCadastro, buscaCadastroUnidade, filtroStatusUnidade, filtroUFUnidade]);

  const temAlgumFiltro = !!buscaCadastroUnidade || filtroStatusUnidade !== "ativas" || filtroUFUnidade !== "todas";
  const limparFiltrosUnidades = () => {
    setBuscaCadastroUnidade("");
    setFiltroStatusUnidade("ativas");
    setFiltroUFUnidade("todas");
    setUnidadeFocoMapaId(null);
  };
  const slotsDisponiveis = slotsRes?.slots || [];
  const termoFila = buscaFila.trim().toLowerCase();
  const termoAgendamento = buscaAgendamento.trim().toLowerCase();
  const termoAgendaCriada = buscaAgendaCriada.trim().toLowerCase();

  const statusAgendamentoConfig: Record<string, { label: string; className: string }> = {
    AGUARDANDO_CONFIRMACAO: {
      label: "Aguardando confirmação",
      className: "bg-orange-50 text-orange-700 hover:bg-orange-50",
    },
    CONFIRMADA: {
      label: "Confirmada",
      className: "bg-teal-50 text-teal-700 hover:bg-teal-50",
    },
    EM_ANDAMENTO: {
      label: "Em andamento",
      className: "bg-blue-50 text-blue-700 hover:bg-blue-50",
    },
    CONCLUIDA: {
      label: "Concluída",
      className: "bg-green-50 text-green-700 hover:bg-green-50",
    },
    REAGENDAMENTO_SOLICITADO: {
      label: "Reagendamento solicitado",
      className: "bg-amber-50 text-amber-700 hover:bg-amber-50",
    },
  };

  const filtroAgendamentos = [
    { value: undefined, label: "Todos" },
    { value: "AGUARDANDO_CONFIRMACAO", label: "Aguardando confirmação" },
    { value: "CONFIRMADA", label: "Confirmadas" },
    { value: "EM_ANDAMENTO", label: "Em andamento" },
    { value: "CONCLUIDA", label: "Concluídas" },
  ];

  const agendamentosFiltrados = agendamentos.filter((v: any) =>
    !termoAgendaCriada ||
    `${v.marca || ""} ${v.modelo || ""} ${v.placa || ""} ${v.vendedor_nome || ""} ${v.vistoriador_nome || ""} ${v.unidade_nome || ""}`
      .toLowerCase()
      .includes(termoAgendaCriada)
  );

  const filaPosVistoriaFiltrada = filaPosVistoria.filter((v: any) =>
    !termoFila ||
    `${v.marca || ""} ${v.modelo || ""} ${v.placa || ""} ${v.vendedor_nome || ""} ${v.vistoriador_nome || ""} ${v.unidade_nome || ""}`
      .toLowerCase()
      .includes(termoFila)
  );
  const aguardandoFiltrado = aguardando.filter((v: any) =>
    !termoAgendamento ||
    `${v.marca || ""} ${v.modelo || ""} ${v.placa || ""} ${v.vendedor_nome || ""} ${v.vendedor_cidade || ""} ${v.vendedor_uf || ""}`
      .toLowerCase()
      .includes(termoAgendamento)
  );

  const diasSemanaAtual = useMemo(() => gerar7Dias(semanaOffset), [semanaOffset, agendaOpen]);
  const resumoHorarioUnidade = unidadeSelecionada ? resumirHorarioAtendimentoUnidade(unidadeSelecionada) : "";
  const horarioVazio = !!unidadeSelecionada && resumoHorarioUnidade === "Sem horários cadastrados.";

  const resetAgendaForm = () => {
    setUnidadeId("");
    setBuscaUnidadeModal("");
    setSemanaOffset(0);
    setDataVistoria("");
    setHorarioVistoria("");
    setRemarcacao(null);
  };

  useEffect(() => {
    if (!unidadeSelecionada) {
      if (dataVistoria) setDataVistoria("");
      return;
    }
    const dentroRange = diasSemanaAtual.some((d) => d.iso === dataVistoria);
    if (dentroRange) {
      const info = totalSlotsPorDia(unidadeSelecionada, dataVistoria);
      if (info.aberto) return;
    }
    const primeiroAberto = diasSemanaAtual.find((d) => !d.passado && totalSlotsPorDia(unidadeSelecionada, d.iso).aberto);
    if (primeiroAberto) {
      setDataVistoria(primeiroAberto.iso);
    } else if (!dataVistoria || !dentroRange) {
      const primeiroFuturo = diasSemanaAtual.find((d) => !d.passado);
      if (primeiroFuturo) setDataVistoria(primeiroFuturo.iso);
    }
  }, [unidadeId, unidadeSelecionada, diasSemanaAtual]);

  const resetUnidadeForm = () => {
    setUnidadeForm({
      id: "",
      nome: "",
      cnpj: "",
      cep: "",
      endereco: "",
      cidade: "",
      estado: "",
      latitude: null,
      longitude: null,
      telefone: "",
      whatsapp: "",
      email: "",
      responsavel: "",
      horario_atendimento: criarHorarioAtendimentoForm(),
      duracao_padrao_minutos: 60,
      intervalo_entre_vistorias_minutos: 30,
      ativo: true,
    });
  };

  const resetVistoriadorForm = () => {
    setVistoriadorForm({
      usuario_id: "",
      unidade_id: "",
      status: "ATIVO",
    });
  };

  const abrirAgenda = async (veiculo: any, opts?: {
    modoRemarcacao?: {
      vistoriaId: string;
      unidadeId?: unknown;
      data?: string;
      horario?: string;
    };
  }) => {
    // Antecede qualquer coisa: se for REMARCAO, invalida o cache da listagem e re-busca
    // para nao ter UUIDs stale (vistorias que ja foram deletadas/rollbackadas aparecendo)
    if (opts?.modoRemarcacao) {
      try {
        await queryClient.invalidateQueries({ queryKey: ["admin-vistorias"] });
        const refetchLista = await getVistorias({ data: { status: statusAgendamento } });
        const linhasAtualizadas = (refetchLista as any)?.data || refetchLista || [];
        const idAlvo = normalizarIdStr(opts.modoRemarcacao.vistoriaId);
        const aindaExiste = Array.isArray(linhasAtualizadas) && linhasAtualizadas.some((l: any) => normalizarIdStr(l.id) === idAlvo);
        if (!aindaExiste) {
          toast.warning(
            "Essa vistoria sumiu da lista (dados em cache antigos). Recarregando a tabela e removendo a linha. Tente novamente com a lista atualizada."
          );
          return;
        }
      } catch (_) { /* ignora, deixa abrir */ }
    }

    setVeiculoSelecionado(veiculo);
    resetAgendaForm();
    if (opts?.modoRemarcacao) {
      const r = opts.modoRemarcacao;
      const uidNorm = normalizarIdStr(r.unidadeId);
      if (uidNorm) setUnidadeId(uidNorm);
      const dataAtual = String(r.data || "").slice(0, 10);
      if (dataAtual) setDataVistoria(dataAtual);
      const horaAtual = String(r.horario || "").slice(0, 5);
      if (horaAtual) setHorarioVistoria(horaAtual);
      setRemarcacao({
        vistoriaId: r.vistoriaId,
        dataOriginal: dataAtual,
        horarioOriginal: horaAtual,
        unidadeIdOriginal: uidNorm,
      });
    }
    setAgendaOpen(true);
  };

  const fecharAgenda = () => {
    setAgendaOpen(false);
    setVeiculoSelecionado(null);
    resetAgendaForm();
    if (search.veiculoId) {
      updateSearch({ tab: activeTab, status: search.status, veiculoId: undefined });
    }
  };

  const abrirCadastroUnidade = (unidade?: any) => {
    if (unidade) {
      setUnidadeForm({
        id: unidade.id || "",
        nome: unidade.nome || "",
        cnpj: unidade.cnpj || "",
        cep: unidade.cep || "",
        endereco: unidade.endereco || "",
        cidade: unidade.cidade || "",
        estado: unidade.estado || "",
        latitude: unidade.latitude != null ? Number(unidade.latitude) : null,
        longitude: unidade.longitude != null ? Number(unidade.longitude) : null,
        telefone: unidade.telefone || "",
        whatsapp: unidade.whatsapp || "",
        email: unidade.email || "",
        responsavel: unidade.responsavel || "",
        horario_atendimento: normalizarHorarioAtendimentoForm(unidade.horario_atendimento),
        duracao_padrao_minutos: Number(unidade.duracao_padrao_minutos || 60),
        intervalo_entre_vistorias_minutos: Number(unidade.intervalo_entre_vistorias_minutos || 30),
        ativo: unidade.ativo ?? true,
      });
    } else {
      resetUnidadeForm();
    }
    setUnidadeModalOpen(true);
  };

  const adicionarPeriodoDia = (dia: string) => {
    setUnidadeForm((current) => ({
      ...current,
      horario_atendimento: {
        ...current.horario_atendimento,
        [dia]: [...(current.horario_atendimento[dia] || []), criarPeriodoPadrao()],
      },
    }));
  };

  const removerPeriodoDia = (dia: string, index: number) => {
    setUnidadeForm((current) => ({
      ...current,
      horario_atendimento: {
        ...current.horario_atendimento,
        [dia]: (current.horario_atendimento[dia] || []).filter((_, itemIndex) => itemIndex !== index),
      },
    }));
  };

  const atualizarPeriodoDia = (dia: string, index: number, campo: "inicio" | "fim", valor: string) => {
    setUnidadeForm((current) => ({
      ...current,
      horario_atendimento: {
        ...current.horario_atendimento,
        [dia]: (current.horario_atendimento[dia] || []).map((periodo, itemIndex) =>
          itemIndex === index ? { ...periodo, [campo]: valor } : periodo
        ),
      },
    }));
  };

  const preencherCoordenadasUnidade = async (form = unidadeForm) => {
    const partes = [
      form.endereco,
      form.cidade,
      form.estado,
      form.cep,
      "Brasil",
    ].filter(Boolean);
    if (partes.length < 3) return;

    setGeocodificandoUnidade(true);
    try {
      const coords = await geocodificar(partes.join(", "));
      if (coords) {
        setUnidadeForm((current) => ({
          ...current,
          latitude: coords.lat,
          longitude: coords.lng,
        }));
      } else {
        toast.error("Não consegui localizar esse endereço no mapa.");
      }
    } finally {
      setGeocodificandoUnidade(false);
    }
  };

  const handleCepUnidadeChange = async (value: string) => {
    const cep = maskCep(value);
    setUnidadeForm((current) => ({ ...current, cep }));

    if (cep.replace(/\D/g, "").length !== 8) return;

    setBuscandoCepUnidade(true);
    try {
      const endereco = await buscarCep(cep);
      if (!endereco) {
        toast.error("CEP não encontrado.");
        return;
      }

      const enderecoFormatado = [endereco.logradouro].filter(Boolean).join(", ");
      const proximoForm = {
        ...unidadeForm,
        cep: endereco.cep,
        endereco: enderecoFormatado || unidadeForm.endereco,
        cidade: endereco.cidade,
        estado: endereco.uf,
      };

      setUnidadeForm((current) => ({
        ...current,
        cep: endereco.cep,
        endereco: enderecoFormatado || current.endereco,
        cidade: endereco.cidade,
        estado: endereco.uf,
      }));

      await preencherCoordenadasUnidade(proximoForm);
    } finally {
      setBuscandoCepUnidade(false);
    }
  };

  const abrirCadastroVistoriador = (vistoriador?: any) => {
    if (vistoriador) {
      setVistoriadorForm({
        usuario_id: vistoriador.usuario_id || "",
        unidade_id: vistoriador.unidade_id || "",
        status: vistoriador.status || "ATIVO",
      });
    } else {
      resetVistoriadorForm();
    }
    setVistoriadorModalOpen(true);
  };

  useEffect(() => {
    if (!agendaOpen) return;
    if (unidades.length === 0) {
      if (unidadeId) setUnidadeId("");
      return;
    }

    const unidadeAindaExiste = unidades.some((unidade: any) => unidade.id === unidadeId);
    if (!unidadeAindaExiste) {
      setUnidadeId(unidades[0].id);
    }
  }, [agendaOpen, unidades, unidadeId]);

  useEffect(() => {
    setHorarioVistoria("");
  }, [unidadeId, dataVistoria]);

  useEffect(() => {
    if (!slotsDisponiveis.length) return;
    if (slotsDisponiveis.some((slot: any) => slot.value === horarioVistoria)) return;
    if (slotsDisponiveis.length === 1) {
      setHorarioVistoria(slotsDisponiveis[0].value);
    }
  }, [slotsDisponiveis, horarioVistoria]);

  useEffect(() => {
    if (activeTab !== "aguardando" || !search.veiculoId || aguardando.length === 0) return;
    if (agendaOpen && veiculoSelecionado?.id === search.veiculoId) return;

    const alvo = aguardando.find((item: any) => item.id === search.veiculoId);
    if (alvo) abrirAgenda(alvo);
  }, [activeTab, search.veiculoId, aguardando, agendaOpen, veiculoSelecionado]);

  const handleCriarAgendamento = async () => {
    if (!user?.id || !veiculoSelecionado) {
      toast.error("Usuário ou veículo inválido para o agendamento.");
      return;
    }
    if (!unidadeSelecionada || !dataVistoria || !horarioVistoria) {
      toast.error("Selecione unidade, data e um slot disponível.");
      return;
    }

    const hojeSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hojeSP_iso = hojeSP.toISOString().slice(0, 10);
    if (dataVistoria < hojeSP_iso) {
      toast.error("Não é possível agendar em datas passadas.");
      return;
    }
    if (dataVistoria === hojeSP_iso) {
      const [hh, mm] = String(horarioVistoria || ":").split(":").map(Number);
      const agoraSP_min = hojeSP.getHours() * 60 + hojeSP.getMinutes();
      const horarioSel = (hh || 0) * 60 + (mm || 0);
      if (horarioSel <= agoraSP_min) {
        toast.error("O horário selecionado já passou. Escolha outro horário ou data.");
        return;
      }
    }

    const toastId = toast.loading(
      remarcacao ? "Remarcando agendamento..." : "Criando agendamento..."
    );
    try {
      const unidadeIdNorm = normalizarIdStr(unidadeSelecionada.id);
      const unidadeNome = String(unidadeSelecionada.nome || "").trim() || null;
      const unidadeCidade = String(unidadeSelecionada.cidade || "").trim() || null;

      if (remarcacao) {
        const response = await remarcarAgendamento({
          data: {
            vistoriaId: normalizarIdStr(remarcacao.vistoriaId),
            novaUnidadeId: unidadeIdNorm,
            novaData: dataVistoria,
            novoHorario: horarioVistoria,
            usuarioId: normalizarIdStr(user.id),
            permissaoAdmin: true,
            unidade_nome: unidadeNome,
            unidade_cidade: unidadeCidade,
          },
        });

        if (!response?.ok) {
          toast.error(response?.message || "Não foi possível remarcar o agendamento.", { id: toastId });
          return;
        }
        toast.success("Agendamento remarcado com sucesso.", { id: toastId });
      } else {
        const response = await criarAgendamento({
          data: {
            veiculo_id: normalizarIdStr(veiculoSelecionado.id),
            vendedor_id: normalizarIdStr(veiculoSelecionado.vendedor_id),
            unidade_id: unidadeIdNorm,
            unidade_nome: unidadeNome,
            unidade_cidade: unidadeCidade,
            vistoriador_id: null,
            data_vistoria: dataVistoria,
            horario_vistoria: horarioVistoria,
            usuario_id: normalizarIdStr(user.id),
          },
        });

        if (!response?.ok) {
          toast.error(response?.message || "Não foi possível criar o agendamento.", { id: toastId });
          return;
        }
        toast.success("Vistoria agendada com sucesso.", { id: toastId });
      }

      await queryClient.invalidateQueries({ queryKey: ["admin-veiculos-aguardando-vistoria"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-vistorias"] });
      fecharAgenda();
      updateSearch({ tab: "agendamentos", status: "AGUARDANDO_CONFIRMACAO", veiculoId: undefined });
    } catch (e: any) {
      toast.error(e?.message || "Erro técnico ao salvar agendamento.", { id: toastId });
    }
  };

  const handleSalvarUnidade = async () => {
    if (!unidadeForm.nome || !unidadeForm.endereco || !unidadeForm.cidade || !unidadeForm.estado) {
      toast.error("Preencha nome, endereço, cidade e UF da unidade.");
      return;
    }
    if (unidadeForm.latitude == null || unidadeForm.longitude == null) {
      toast.error("Confirme a localização da unidade no mapa.");
      return;
    }
    const horarioAtendimento = extrairHorarioAtendimentoPayload(unidadeForm.horario_atendimento);
    if (Object.keys(horarioAtendimento).length === 0) {
      toast.error("Selecione pelo menos um dia e horário de atendimento da unidade.");
      return;
    }
    const faixaInvalida = Object.entries(unidadeForm.horario_atendimento).find(([, faixas]) =>
      faixas.some((faixa) => horarioParaMinutos(faixa.fim) <= horarioParaMinutos(faixa.inicio))
    );
    if (faixaInvalida) {
      toast.error("Revise os horários da unidade. O horário final precisa ser maior que o inicial.");
      return;
    }
    const faixaSobreposta = Object.entries(unidadeForm.horario_atendimento).find(([, faixas]) => {
      const ordenadas = [...faixas]
        .map((faixa) => ({ ...faixa, inicioMin: horarioParaMinutos(faixa.inicio), fimMin: horarioParaMinutos(faixa.fim) }))
        .sort((a, b) => a.inicioMin - b.inicioMin);
      return ordenadas.some((faixa, index) => index > 0 && faixa.inicioMin < ordenadas[index - 1].fimMin);
    });
    if (faixaSobreposta) {
      toast.error("Existem períodos sobrepostos no mesmo dia. Revise a disponibilidade da unidade.");
      return;
    }
    if (!Number.isFinite(unidadeForm.duracao_padrao_minutos) || unidadeForm.duracao_padrao_minutos < 15) {
      toast.error("A duração mínima da vistoria deve ser de 15 minutos.");
      return;
    }
    if (!Number.isFinite(unidadeForm.intervalo_entre_vistorias_minutos) || unidadeForm.intervalo_entre_vistorias_minutos < 0) {
      toast.error("O intervalo entre vistorias não pode ser negativo.");
      return;
    }

    const toastId = toast.loading(unidadeForm.id ? "Atualizando unidade..." : "Criando unidade...");
    try {
      const response = await salvarUnidadeCadastro({
        data: {
          ...unidadeForm,
          horario_atendimento: horarioAtendimento,
          duracao_padrao_minutos: Number(unidadeForm.duracao_padrao_minutos),
          intervalo_entre_vistorias_minutos: Number(unidadeForm.intervalo_entre_vistorias_minutos),
          estado: unidadeForm.estado.toUpperCase(),
          email: unidadeForm.email || null,
        },
      });

      if (!response?.ok) {
        toast.error(response?.message || "Não foi possível salvar a unidade.", { id: toastId });
        return;
      }

      toast.success(unidadeForm.id ? "Unidade atualizada." : "Unidade cadastrada.", { id: toastId });
      setUnidadeModalOpen(false);
      resetUnidadeForm();
      await queryClient.invalidateQueries({ queryKey: ["cadastro-unidades-vistoria"] });
      await queryClient.invalidateQueries({ queryKey: ["unidades-vistoria"] });
    } catch {
      toast.error("Erro técnico ao salvar a unidade.", { id: toastId });
    }
  };

  const handleSalvarVistoriador = async () => {
    if (!vistoriadorForm.usuario_id || !vistoriadorForm.unidade_id) {
      toast.error("Selecione o vistoriador e a unidade.");
      return;
    }

    const toastId = toast.loading("Salvando vínculo do vistoriador...");
    try {
      const response = await salvarVistoriadorCadastro({ data: vistoriadorForm as any });

      if (!response?.ok) {
        toast.error(response?.message || "Não foi possível salvar o vistoriador.", { id: toastId });
        return;
      }

      toast.success("Vistoriador vinculado com sucesso.", { id: toastId });
      setVistoriadorModalOpen(false);
      resetVistoriadorForm();
      await queryClient.invalidateQueries({ queryKey: ["cadastro-vistoriadores"] });
    } catch {
      toast.error("Erro técnico ao salvar o vistoriador.", { id: toastId });
    }
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Vistorias</h1>
          <p className="text-slate-500 font-medium">Gestão das filas operacionais de agendamento e análise pós-vistoria.</p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value);
          updateSearch({
            tab: value,
            status: value === "agendamentos" ? search.status : undefined,
            veiculoId: value === "aguardando" ? search.veiculoId : undefined,
          });
        }}
        className="space-y-6"
      >
        <TabsList className="bg-transparent border-b border-slate-200 w-full justify-start rounded-none h-auto p-0 gap-8">
          {[
            { id: "agendamentos", label: "Agenda" },
            { id: "aguardando_analise", label: "Aguardando análise" },
            { id: "aguardando", label: "Aguardando agendamento" },
            { id: "cadastros", label: "Cadastros" },
            { id: "checklist_config", label: "Checklist" },
          ].map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="bg-transparent border-none p-0 pb-3 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-teal-600 data-[state=active]:text-teal-600 font-bold text-xs uppercase tracking-widest text-slate-400"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="agendamentos" className="mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {filtroAgendamentos.map((filtro) => {
                  const ativo = (search.status || undefined) === filtro.value;
                  return (
                    <button
                      key={filtro.label}
                      type="button"
                      className={cn(
                        "rounded-lg border px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-colors",
                        ativo
                          ? "border-teal-200 bg-teal-50 text-teal-700"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                      )}
                      onClick={() => updateSearch({ tab: "agendamentos", status: filtro.value, veiculoId: undefined })}
                    >
                      {filtro.label}
                    </button>
                  );
                })}
              </div>
              <div className="relative w-80 max-w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por veículo, vendedor ou unidade..."
                  className="pl-10 h-10 border-slate-200 bg-white"
                  value={buscaAgendaCriada}
                  onChange={(e) => setBuscaAgendaCriada(e.target.value)}
                />
              </div>
            </div>

            <Card className="border-slate-200 shadow-none overflow-hidden">
              <CardContent className="p-0">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Veículo</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Vendedor</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Agenda</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Unidade / Vistoriador</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {agendamentosFiltrados.map((v: any) => {
                      const badge = statusAgendamentoConfig[v.status] || {
                        label: String(v.status || "Sem status").replaceAll("_", " "),
                        className: "bg-slate-100 text-slate-700 hover:bg-slate-100",
                      };
                      const podeRemarcar = ["AGUARDANDO_CONFIRMACAO", "CONFIRMADA"].includes(String(v.status || ""));

                      return (
                        <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900">{v.marca} {v.modelo}</span>
                              <span className="text-[10px] font-mono text-slate-500 uppercase">{v.placa}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-600">{v.vendedor_nome}</td>
                          <td className="px-6 py-4">
                            <div className="space-y-1 text-sm">
                              <div className="flex items-center gap-2 text-slate-700">
                                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                <span className="font-bold">{format(new Date(v.data_vistoria), "dd/MM/yyyy")}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                <span>{String(v.horario_vistoria).slice(0, 5)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="space-y-1 text-sm">
                              <div className="flex items-center gap-2 text-slate-700">
                                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                                <span className="font-bold">{v.unidade_nome}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <User className="h-3.5 w-3.5 text-slate-400" />
                                <span>{v.vistoriador_nome || "A definir"}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge className={cn("text-[10px] font-black uppercase", badge.className)}>
                              {badge.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex gap-2 justify-end">
                              {podeRemarcar && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="font-bold h-9 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                                  onClick={() => {
                                    abrirAgenda(
                                      {
                                        id: v.veiculo_id,
                                        marca: v.marca,
                                        modelo: v.modelo,
                                        placa: v.placa,
                                        vendedor_id: v.vendedor_id,
                                        vendedor_nome: v.vendedor_nome,
                                        cidade: v.vendedor_cidade || "",
                                      },
                                      {
                                        modoRemarcacao: {
                                          vistoriaId: v.id,
                                          unidadeId: v.unidade_id,
                                          data: v.data_vistoria,
                                          horario: v.horario_vistoria,
                                        },
                                      }
                                    );
                                  }}
                                >
                                  <CalendarClock className="h-4 w-4 mr-1" />
                                  Reagendar
                                </Button>
                              )}
                              <Button asChild size="sm" variant="outline" className="font-bold">
                                <Link to="/admin/veiculo/$id" params={{ id: v.veiculo_id }}>
                                  Ver veículo
                                </Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {agendamentosFiltrados.length === 0 && !loadingAgendamentos && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                          Nenhuma vistoria encontrada para esse filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="aguardando_analise" className="mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase text-slate-900 tracking-wider">Fila de análise pós-vistoria</h2>
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar na fila..."
                  className="pl-10 h-10 border-slate-200 bg-white"
                  value={buscaFila}
                  onChange={(e) => setBuscaFila(e.target.value)}
                />
              </div>
            </div>

            <Card className="border-slate-200 shadow-none overflow-hidden">
              <CardContent className="p-0">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Veículo / Placa</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Vendedor</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Vistoriador / Unidade</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Conclusão</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Responsável</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filaPosVistoriaFiltrada.map((v: any) => (
                      <tr key={v.vistoria_id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-900">{v.marca} {v.modelo}</span>
                            <span className="text-[10px] font-mono text-slate-500 uppercase">{v.placa}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-600">{v.vendedor_nome}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{v.vistoriador_nome || 'N/I'}</span>
                            <span className="text-[10px] text-slate-400 uppercase font-medium">{v.unidade_nome}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">
                              {v.concluido_em ? format(new Date(v.concluido_em), 'dd/MM HH:mm') : '-'}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase font-medium">
                              {v.concluido_em ? "Concluída" : "Sem horário"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {v.responsavel_nome ? (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-tight">
                              {v.responsavel_nome}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Livre</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700 text-white font-bold h-8 rounded-lg">
                            <Link to="/admin/analise-vistoria/$id" params={{ id: v.veiculo_id }}>Analisar</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {filaPosVistoriaFiltrada.length === 0 && !loadingPosVistoria && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                          Nenhuma vistoria aguardando análise.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="aguardando" className="mt-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase text-slate-900 tracking-wider">Fila de espera</h2>
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por placa ou vendedor..."
                  className="pl-10 h-10 border-slate-200 bg-white"
                  value={buscaAgendamento}
                  onChange={(e) => setBuscaAgendamento(e.target.value)}
                />
              </div>
            </div>

            <Card className="border-slate-200 shadow-none overflow-hidden">
              <CardContent className="p-0">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Veículo</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Placa</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Vendedor</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cidade</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {aguardandoFiltrado.map((v: any) => (
                      <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-sm font-bold text-slate-900">{v.marca} {v.modelo}</span>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="font-mono text-[11px] border-slate-200">{v.placa}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-600">{v.vendedor_nome}</td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-600">{v.vendedor_cidade}/{v.vendedor_uf}</td>
                        <td className="px-6 py-4">
                          <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 text-[10px] font-black uppercase">Aguardando</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            size="sm"
                            className="bg-slate-900 hover:bg-teal-700 text-white font-bold h-8 rounded-lg"
                            onClick={() => abrirAgenda(v)}
                          >
                            Agendar
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {aguardandoFiltrado.length === 0 && !loadingAguardando && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                          Nenhum veículo aguardando agendamento no momento.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cadastros" className="mt-0">
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <Card className="border-slate-200 shadow-none">
                <CardContent className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-black uppercase tracking-wider text-slate-900">Rede credenciada e equipe</p>
                    <p className="text-sm text-slate-500">
                      Cadastre as unidades de vistoria e vincule os vistoriadores para que eles apareçam na agenda de agendamento.
                    </p>
                  </div>
                  <Button asChild variant="outline" className="font-bold">
                    <Link to="/admin/usuarios" search={{ role: "vistoriador", open: "novo" }}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Criar login de vistoriador
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-none">
                <CardContent className="p-5 space-y-2">
                  <p className="text-sm font-black uppercase tracking-wider text-slate-900">Como liberar na agenda</p>
                  <ol className="space-y-1 text-sm text-slate-600 list-decimal pl-5">
                    <li>crie o usuário com perfil `vistoriador`</li>
                    <li>cadastre a unidade/credenciado</li>
                    <li>vincule o vistoriador a uma unidade ativa</li>
                  </ol>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              {/* BARRA DE BUSCA E FILTROS */}
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardContent className="p-4 md:p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Unidades credenciadas</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Busque por nome, cidade, UF, responsável, contato, CEP ou CNPJ. Use os filtros para refinar.
                      </p>
                    </div>
                    <div className="flex gap-2 md:justify-end">
                      <Button className="bg-slate-900 hover:bg-slate-800 text-white font-bold" onClick={() => abrirCadastroUnidade()}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nova unidade
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr_1fr_auto]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={buscaCadastroUnidade}
                        onChange={(e) => setBuscaCadastroUnidade(e.target.value)}
                        placeholder="Buscar unidade por nome, cidade, responsável, telefone, CEP, CNPJ..."
                        className="pl-9 font-medium"
                      />
                      {buscaCadastroUnidade && (
                        <button
                          type="button"
                          onClick={() => setBuscaCadastroUnidade("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Limpar busca"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
                        <Filter className="h-4 w-4" />
                      </div>
                      <Select value={filtroStatusUnidade} onValueChange={(v: any) => setFiltroStatusUnidade(v)}>
                        <SelectTrigger className="font-medium">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativas">Somente ativas</SelectItem>
                          <SelectItem value="inativas">Somente inativas</SelectItem>
                          <SelectItem value="todas">Todas as unidades</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 bg-slate-50 text-slate-500">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <Select value={filtroUFUnidade} onValueChange={setFiltroUFUnidade}>
                        <SelectTrigger className="font-medium">
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">Todas as UFs</SelectItem>
                          {ufsDisponiveisUnidades.map((uf) => (
                            <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={limparFiltrosUnidades}
                      disabled={!temAlgumFiltro}
                      className="font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Limpar
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-600">
                      Exibindo <strong className="text-slate-900">{unidadesFiltradas.length}</strong> de <strong className="text-slate-900">{unidadesCadastro.length}</strong> unidade(s)
                      {filtroStatusUnidade !== "todas" && <> · Status: <strong>{filtroStatusUnidade === "ativas" ? "Ativas" : "Inativas"}</strong></>}
                      {filtroUFUnidade !== "todas" && <> · UF: <strong>{filtroUFUnidade}</strong></>}
                      {buscaCadastroUnidade && <> · Busca: <strong>“{buscaCadastroUnidade}”</strong></>}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* COLUNAS: CARDS À ESQUERDA / MAPA À DIREITA */}
              <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {/* COLUNA 1: CARDS */}
                <div className="space-y-3 max-h-[820px] overflow-y-auto pr-1.5 -mr-1.5 [scrollbar-width:thin]">
                  {loadingUnidadesCadastro && (
                    <div className="grid gap-3">
                      {[0, 1, 2].map((i) => (
                        <Card key={i} className="border-slate-200 shadow-none">
                          <CardContent className="p-5 space-y-3">
                            <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
                            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
                            <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100" />
                            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {!loadingUnidadesCadastro && unidadesFiltradas.length === 0 && (
                    <Card className="border-dashed border-amber-300 shadow-none bg-amber-50/40">
                      <CardContent className="p-10 text-center space-y-2">
                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-600 ring-1 ring-inset ring-amber-200">
                          <Building className="h-6 w-6" />
                        </div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-amber-900">Nenhuma unidade encontrada</h3>
                        <p className="text-sm text-amber-800 max-w-md mx-auto">
                          {unidadesCadastro.length === 0
                            ? "Cadastre sua primeira unidade credenciada clicando em “Nova unidade” para começar."
                            : "Tente ajustar os filtros de status, UF ou limpar a busca para encontrar o que procura."}
                        </p>
                        {temAlgumFiltro && unidadesCadastro.length > 0 && (
                          <Button
                            variant="outline"
                            onClick={limparFiltrosUnidades}
                            className="mt-2 border-amber-300 bg-white text-amber-900 hover:bg-amber-100 font-bold"
                          >
                            <X className="mr-1.5 h-3.5 w-3.5" />
                            Limpar filtros
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {!loadingUnidadesCadastro && unidadesFiltradas.map((unidade: any) => {
                    const focado = idsIguais(unidade.id, unidadeFocoMapaId);
                    const horario = resumirHorarioAtendimento(unidade.horario_atendimento);
                    const contato = unidade.whatsapp || unidade.telefone || unidade.email;
                    const semGps = unidade.latitude == null || unidade.longitude == null;
                    return (
                      <Card
                        key={unidade.id}
                        id={`unidade-card-${unidade.id}`}
                        className={cn(
                          "border-slate-200 shadow-sm overflow-hidden transition-all duration-200 cursor-pointer",
                          focado && "ring-2 ring-teal-500/60 border-teal-300 shadow-lg"
                        )}
                        onClick={() => {
                          setUnidadeFocoMapaId((prev) => (idsIguais(prev, unidade.id) ? null : unidade.id));
                        }}
                      >
                        <CardContent className="p-5 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-extrabold text-slate-950 tracking-tight">{unidade.nome}</h3>
                                <Badge className={cn(
                                  "text-[10px] font-black uppercase border-0",
                                  unidade.ativo
                                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                                    : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200"
                                )}>
                                  {unidade.ativo ? "Ativa" : "Inativa"}
                                </Badge>
                                {focado && (
                                  <Badge className="bg-teal-500/10 text-teal-700 ring-1 ring-inset ring-teal-200 text-[10px] font-black uppercase border-0">
                                    selecionada no mapa
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                <span className="truncate">
                                  {unidade.endereco || "Endereço não informado"} · <strong>{unidade.cidade}/{unidade.estado}</strong>
                                </span>
                              </div>
                            </div>
                            <div className="grid shrink-0 h-10 w-10 place-items-center rounded-xl bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200">
                              <Building className="h-5 w-5" />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-200">
                                <Users className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 leading-none">Equipe</p>
                                <p className="text-sm font-extrabold text-slate-900 leading-tight">{unidade.total_vistoriadores || 0}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-200">
                                <Phone className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 leading-none">Contato</p>
                                <p className="text-xs font-semibold text-slate-800 leading-tight truncate" title={contato}>
                                  {unidade.responsavel || contato || "—"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={cn(
                                "grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
                                semGps
                                  ? "bg-amber-50 text-amber-600 ring-amber-200"
                                  : "bg-emerald-50 text-emerald-600 ring-emerald-200"
                              )}>
                                <MapPin className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 leading-none">GPS</p>
                                <p className={cn(
                                  "text-xs font-bold leading-tight truncate",
                                  semGps ? "text-amber-700" : "text-emerald-700"
                                )}>
                                  {semGps ? "Não cadastrado" : "Cadastrado"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Horário de atendimento</p>
                              <p className="text-xs text-slate-700 leading-relaxed">{horario}</p>
                              {Array.isArray(unidade.cidades_atendidas) && unidade.cidades_atendidas.length > 0 && (
                                <p className="mt-1 text-[11px] text-slate-500">
                                  Atende região: <span className="font-semibold text-slate-700">{unidade.cidades_atendidas.join(", ")}</span>
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirCadastroUnidade(unidade);
                                }}
                                className="font-bold"
                              >
                                Editar
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* COLUNA 2: MAPA */}
                <div className="min-h-[680px]">
                  <MapaRedeCredenciada
                    unidades={unidadesFiltradas.map((u: any) => ({
                      id: u.id,
                      nome: u.nome,
                      cidade: u.cidade,
                      estado: u.estado,
                      endereco: u.endereco,
                      latitude: u.latitude,
                      longitude: u.longitude,
                      ativo: !!u.ativo,
                      responsavel: u.responsavel,
                      telefone: u.telefone,
                      whatsapp: u.whatsapp,
                      total_vistoriadores: u.total_vistoriadores,
                    }))}
                    unidadeSelecionadaId={unidadeFocoMapaId}
                    onSelecionarUnidade={(id) => {
                      setUnidadeFocoMapaId(id);
                      const el = document.getElementById(`unidade-card-${id}`);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
                      }
                    }}
                    height={680}
                  />
                </div>
              </div>

              {/* TABELA DE VISTORIADORES */}
              <Card className="border-slate-200 shadow-none overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Vistoriadores</h2>
                      <p className="text-xs text-slate-500">Equipe disponível para ser puxada na agenda.</p>
                    </div>
                    <Button className="bg-teal-600 hover:bg-teal-700 text-white font-bold" onClick={() => abrirCadastroVistoriador()}>
                      <UserCog className="mr-2 h-4 w-4" />
                      Vincular vistoriador
                    </Button>
                  </div>

                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Nome</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Contato</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Unidade</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {vistoriadoresCadastro.map((vistoriador: any) => (
                        <tr key={vistoriador.usuario_id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900">{vistoriador.nome}</span>
                              <span className="text-[10px] text-slate-500">{vistoriador.email}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {vistoriador.whatsapp || "Sem WhatsApp"}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {vistoriador.unidade_nome || "Sem unidade"}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <Badge className={cn(
                                "w-fit text-[10px] font-black uppercase",
                                vistoriador.status
                                  ? "bg-blue-50 text-blue-700 hover:bg-blue-50"
                                  : "bg-amber-50 text-amber-700 hover:bg-amber-50"
                              )}>
                                {vistoriador.status || "Não vinculado"}
                              </Badge>
                              {!vistoriador.usuario_ativo && (
                                <span className="text-[10px] text-red-600 font-bold uppercase">Usuário inativo</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="outline" size="sm" className="font-bold" onClick={() => abrirCadastroVistoriador(vistoriador)}>
                              {vistoriador.status ? "Editar" : "Vincular"}
                            </Button>
                          </td>
                        </tr>
                      ))}

                      {vistoriadoresCadastro.length === 0 && !loadingVistoriadoresCadastro && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                            Nenhum usuário com perfil de vistoriador foi criado ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <AbaChecklistConfigDinamico />

      </Tabs>

      <Dialog open={agendaOpen} onOpenChange={(open) => (open ? setAgendaOpen(true) : fecharAgenda())}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{remarcacao ? "Remarcar vistoria" : "Agendar vistoria"}</DialogTitle>
            <DialogDescription>
              {remarcacao
                ? `Remarcação de ${remarcacao.dataOriginal ?? "-"} às ${remarcacao.horarioOriginal ?? "-"}. Selecione nova unidade, data e horário. Mínimo 1 hora de antecedência.`
                : "Defina a unidade, a data e escolha um horário disponível. O vistoriador será alocado automaticamente a partir da equipe da unidade."}
            </DialogDescription>
          </DialogHeader>

          {veiculoSelecionado && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-black text-slate-950">
                  {veiculoSelecionado.marca} {veiculoSelecionado.modelo}
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                  <span className="font-mono">{veiculoSelecionado.placa}</span>
                  <span>{veiculoSelecionado.vendedor_nome}</span>
                  <span>{veiculoSelecionado.vendedor_cidade}/{veiculoSelecionado.vendedor_uf}</span>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Unidade de vistoria credenciada</Label>
                  <p className="text-xs text-slate-500 -mt-0.5">
                    Escolha qualquer unidade cadastrada. Você pode buscar por nome, cidade ou estado.
                  </p>
                  <Popover open={!!buscaUnidadeModal && buscaUnidadeModal === "__aberto__"} onOpenChange={(open) => setBuscaUnidadeModal(open ? "__aberto__" : "")}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={buscaUnidadeModal === "__aberto__"}
                        className={cn(
                          "w-full justify-between font-normal",
                          !unidadeSelecionada && "text-slate-500",
                          loadingUnidades && "opacity-60 cursor-wait"
                        )}
                      >
                        {loadingUnidades ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Carregando unidades...
                          </span>
                        ) : unidadeSelecionada ? (
                          <span className="flex items-center gap-2 truncate text-left">
                            <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
                            <span className="truncate">
                              <span className="font-semibold text-slate-900">{unidadeSelecionada.nome}</span>
                              <span className="text-slate-500"> — {unidadeSelecionada.cidade}/{unidadeSelecionada.estado}</span>
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Search className="h-4 w-4 shrink-0" />
                            {unidades.length === 0 ? "Nenhuma unidade ativa" : "Selecione ou busque uma unidade..."}
                          </span>
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 ml-2">
                          {unidades.length} disp.
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[min(calc(100vw-2rem),640px)] p-0">
                      <Command>
                        <CommandInput placeholder="Buscar por nome, cidade, estado, responsável..." />
                        <CommandList>
                          <CommandEmpty>Nenhuma unidade encontrada para essa busca.</CommandEmpty>
                          <CommandGroup heading="Unidades credenciadas ativas">
                            {(unidades || []).map((unidade: any) => {
                              const mesmaCidade = !!veiculoSelecionado?.vendedor_cidade &&
                                String(unidade.cidade || "").toLowerCase() === String(veiculoSelecionado.vendedor_cidade).toLowerCase();
                              const atendeCidade = !!veiculoSelecionado?.vendedor_cidade &&
                                !mesmaCidade &&
                                Array.isArray(unidade.cidades_atendidas) &&
                                unidade.cidades_atendidas.some((c: string) => String(c).toLowerCase() === String(veiculoSelecionado.vendedor_cidade).toLowerCase());
                              return (
                                <CommandItem
                                  key={unidade.id}
                                  value={`${unidade.nome} ${unidade.cidade} ${unidade.estado} ${unidade.responsavel || ""} ${unidade.endereco || ""} ${unidade.cep || ""}`}
                                  onSelect={() => {
                                    setUnidadeId(normalizarIdStr(unidade.id));
                                    setBuscaUnidadeModal("");
                                  }}
                                  className={cn(
                                    "flex items-start gap-3 py-3",
                                    idsIguais(unidade.id, unidadeId) && "bg-teal-50/70 aria-selected:bg-teal-50"
                                  )}
                                >
                                  <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full border border-slate-300">
                                    {idsIguais(unidade.id, unidadeId) && (
                                      <div className="h-full w-full rounded-full bg-teal-500 ring-2 ring-teal-200" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 truncate">{unidade.nome}</p>
                                    <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                      <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                                      <span className="truncate">
                                        {unidade.endereco || "Endereço não cadastrado"} · <strong>{unidade.cidade}/{unidade.estado}</strong>
                                      </span>
                                    </p>
                                    {unidade.responsavel && (
                                      <p className="text-[11px] text-slate-500 mt-1">
                                        Responsável: <strong>{unidade.responsavel}</strong>
                                        {unidade.telefone && <> · {unidade.telefone}</>}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    {mesmaCidade && (
                                      <Badge className="bg-emerald-500/10 text-emerald-700 border-0 ring-1 ring-inset ring-emerald-200 text-[10px]">
                                        mesma cidade
                                      </Badge>
                                    )}
                                    {atendeCidade && (
                                      <Badge className="bg-sky-500/10 text-sky-700 border-0 ring-1 ring-inset ring-sky-200 text-[10px]">
                                        atende região
                                      </Badge>
                                    )}
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {!loadingUnidades && unidades.length === 0 && (
                    <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Nenhuma unidade ativa encontrada</p>
                      <p className="text-xs text-amber-700 mt-1">Cadastre a unidade e vincule a equipe no menu lateral <strong>Unidades e Equipe</strong>.</p>
                    </div>
                  )}

                  {unidadeSelecionada && (
                    <div className={cn(
                      "rounded-xl border p-4 mt-3 space-y-2",
                      horarioVazio
                        ? "border-amber-300 bg-amber-50"
                        : "border-slate-200 bg-slate-50"
                    )}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-950">{unidadeSelecionada.nome}</p>
                          <p className="text-xs text-slate-600 mt-1">{unidadeSelecionada.endereco} — {unidadeSelecionada.cidade}/{unidadeSelecionada.estado}</p>
                        </div>
                        {horarioVazio ? (
                          <Badge className="bg-amber-500 text-white text-[10px] font-black">SEM HORÁRIOS</Badge>
                        ) : (
                          <Badge className="bg-emerald-500 text-white text-[10px] font-black">CONFIGURADA</Badge>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Duração</p>
                          <p className="text-sm font-bold text-slate-800">{Number(unidadeSelecionada.duracao_padrao_minutos || 60)} min / vistoria</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Janela</p>
                          <p className="text-sm font-bold text-slate-800">{Number(unidadeSelecionada.intervalo_entre_vistorias_minutos || 0)} min entre</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Responsável</p>
                          <p className="text-sm font-bold text-slate-800 truncate">{unidadeSelecionada.responsavel || "Não cadastrado"}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">
                          Horários de atendimento
                        </p>
                        {horarioVazio ? (
                          <p className="text-sm text-amber-800 font-bold">
                            Nenhum horário cadastrado. Edite a unidade em "Unidades e Equipe" para definir dias e faixas.
                          </p>
                        ) : (
                          <p className="text-xs text-slate-700 font-semibold leading-relaxed">{resumoHorarioUnidade}</p>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 pt-2 border-t border-slate-200/60">
                        Equipe alocada automaticamente no horário confirmado.
                      </p>
                    </div>
                  )}
                </div>

                {unidadeSelecionada && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSemanaOffset((s) => Math.max(0, s - 1))}
                          disabled={semanaOffset === 0}
                          className={cn(
                            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                            semanaOffset === 0
                              ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          )}
                          title={semanaOffset === 0 ? "Semana atual" : "Voltar uma semana"}
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <div>
                          <Label>
                            {semanaOffset === 0 ? "Semana atual" : `+${semanaOffset} semana${semanaOffset > 1 ? "s" : ""}`}
                          </Label>
                          <p className="text-[11px] text-slate-500 font-semibold leading-tight">
                            {diasSemanaAtual[0].labelCurto} ·· {diasSemanaAtual[diasSemanaAtual.length - 1].labelCurto}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSemanaOffset((s) => s + 1)}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                          title="Avançar uma semana"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={dataVistoria}
                          min={formatarDataIso(new Date())}
                          onChange={(e) => {
                            const novaData = e.target.value;
                            if (!novaData) return;
                            setDataVistoria(novaData);
                            const hojeIso = formatarDataIso(new Date());
                            const diffDias = Math.round((new Date(`${novaData}T12:00:00`).getTime() - new Date(`${hojeIso}T12:00:00`).getTime()) / 86400000);
                            const novoOffset = Math.max(0, Math.floor(diffDias / 7));
                            if (novoOffset !== semanaOffset) setSemanaOffset(novoOffset);
                          }}
                          className="w-auto text-xs py-1.5"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {diasSemanaAtual.map((dia) => {
                        const info = totalSlotsPorDia(unidadeSelecionada, dia.iso);
                        const clicavel = !dia.passado && info.aberto;
                        const ativo = dataVistoria === dia.iso;
                        return (
                          <button
                            key={dia.iso}
                            type="button"
                            disabled={!clicavel}
                            onClick={() => setDataVistoria(dia.iso)}
                            className={cn(
                              "flex flex-col items-center gap-0.5 rounded-lg border px-1.5 py-2 text-center transition-colors",
                              !clicavel && "opacity-40 cursor-not-allowed border-slate-200 bg-slate-50",
                              clicavel && !ativo && "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/50",
                              ativo && "border-teal-500 bg-teal-50 ring-2 ring-teal-200"
                            )}
                            title={
                              dia.passado ? "Dia já passou" :
                              info.aberto ? `${info.totalEstimado} slots estimados - ${info.periodosLabel}` :
                              "Unidade não atende nesse dia"
                            }
                          >
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-wider",
                              ativo ? "text-teal-700" : clicavel ? "text-slate-600" : "text-slate-400"
                            )}>{dia.diaSemana}</span>
                            <span className={cn(
                              "text-base font-black",
                              ativo ? "text-teal-800" : clicavel ? "text-slate-900" : "text-slate-400"
                            )}>{dia.diaMes}</span>
                            <span className={cn(
                              "text-[10px]",
                              ativo ? "text-teal-700 font-bold" : clicavel ? "text-slate-500 font-semibold" : "text-slate-400"
                            )}>/{dia.mes}</span>
                            {dia.passado ? (
                              <span className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
                                PASS
                              </span>
                            ) : info.aberto ? (
                              <span className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700">
                                {info.totalEstimado}
                              </span>
                            ) : (
                              <span className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
                                FECH
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {unidadeSelecionada && dataVistoria && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label>Slots disponíveis</Label>
                        <p className="text-xs text-slate-500">
                          Escolha um horário para agendar.
                        </p>
                      </div>
                      {slotsRes?.configuracao && (
                        <p className="text-[11px] text-slate-500 text-right max-w-[55%]">
                          {(slotsRes.configuracao.periodos || []).map((periodo: any) => `${periodo.inicio}-${periodo.fim}`).join(" | ") || "Sem períodos"}
                          <br />
                          {slotsRes.configuracao.duracao_padrao_minutos}min + {slotsRes.configuracao.intervalo_entre_vistorias_minutos}min de janela
                        </p>
                      )}
                    </div>

                    {loadingSlots ? (
                      <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Carregando slots dessa data...
                      </div>
                    ) : slotsDisponiveis.length > 0 ? (
                      <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 lg:grid-cols-5">
                        {slotsDisponiveis.map((slot: any) => {
                          const ativo = horarioVistoria === slot.value;
                          return (
                            <button
                              key={slot.value}
                              type="button"
                              className={cn(
                                "rounded-lg border px-3 py-3 text-center transition-colors",
                                ativo
                                  ? "border-teal-500 bg-teal-50 text-teal-700"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/40"
                              )}
                              onClick={() => setHorarioVistoria(slot.value)}
                            >
                              <p className="text-sm font-black">{slot.value}</p>
                              <p className="text-[10px] text-slate-500 font-semibold">até {slot.fim}</p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-4 py-6 text-sm">
                        <p className="text-amber-800 font-bold">{slotsRes?.message || "Nenhum slot disponível para essa data."}</p>
                        {horarioVazio && (
                          <p className="text-xs text-amber-700 mt-2">Dica: a unidade está sem horários cadastrados. Edite em "Unidades e Equipe".</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={fecharAgenda}>Cancelar</Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => void handleCriarAgendamento()}
              disabled={!veiculoSelecionado || !unidadeSelecionada || !dataVistoria || !horarioVistoria}
            >
              Confirmar agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={unidadeModalOpen}
        onOpenChange={(open) => {
          setUnidadeModalOpen(open);
          if (!open) resetUnidadeForm();
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{unidadeForm.id ? "Editar unidade credenciada" : "Nova unidade credenciada"}</DialogTitle>
            <DialogDescription>
              Cadastre o local que ficará disponível para receber agendamentos de vistoria.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(90vh-11rem)] overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Nome da unidade</Label>
                <Input value={unidadeForm.nome} onChange={(e) => setUnidadeForm((current) => ({ ...current, nome: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input value={unidadeForm.cnpj} onChange={(e) => setUnidadeForm((current) => ({ ...current, cnpj: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>CEP</Label>
                <div className="relative">
                  <Input value={unidadeForm.cep} onChange={(e) => void handleCepUnidadeChange(e.target.value)} placeholder="00000-000" />
                  {(buscandoCepUnidade || geocodificandoUnidade) && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                  )}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Endereço</Label>
                <Input value={unidadeForm.endereco} onChange={(e) => setUnidadeForm((current) => ({ ...current, endereco: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={unidadeForm.cidade} onChange={(e) => setUnidadeForm((current) => ({ ...current, cidade: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Input maxLength={2} value={unidadeForm.estado} onChange={(e) => setUnidadeForm((current) => ({ ...current, estado: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={unidadeForm.telefone} onChange={(e) => setUnidadeForm((current) => ({ ...current, telefone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp</Label>
                <Input value={unidadeForm.whatsapp} onChange={(e) => setUnidadeForm((current) => ({ ...current, whatsapp: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={unidadeForm.email} onChange={(e) => setUnidadeForm((current) => ({ ...current, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Input value={unidadeForm.responsavel} onChange={(e) => setUnidadeForm((current) => ({ ...current, responsavel: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Status</Label>
                <Select
                  value={unidadeForm.ativo ? "ATIVA" : "INATIVA"}
                  onValueChange={(value) => setUnidadeForm((current) => ({ ...current, ativo: value === "ATIVA" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ATIVA">Ativa</SelectItem>
                    <SelectItem value="INATIVA">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-4 md:col-span-2 rounded-xl border border-slate-200 p-4">
                <div className="space-y-1">
                  <Label>Disponibilidade da unidade</Label>
                  <p className="text-xs text-slate-500">
                    Defina os períodos de atendimento de cada dia. Você pode cadastrar mais de uma janela no mesmo dia.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Duração padrão da vistoria (min)</Label>
                    <Input
                      type="number"
                      min={15}
                      step={5}
                      value={unidadeForm.duracao_padrao_minutos}
                      onChange={(e) => setUnidadeForm((current) => ({ ...current, duracao_padrao_minutos: Number(e.target.value || 0) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Janela entre vistorias (min)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={5}
                      value={unidadeForm.intervalo_entre_vistorias_minutos}
                      onChange={(e) => setUnidadeForm((current) => ({ ...current, intervalo_entre_vistorias_minutos: Number(e.target.value || 0) }))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  {DIAS_ATENDIMENTO.map((dia) => {
                    const periodos = unidadeForm.horario_atendimento[dia.key] || [];
                    return (
                      <div key={dia.key} className="rounded-lg border border-slate-200 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-800">{dia.label}</p>
                            <p className="text-xs text-slate-500">
                              {periodos.length > 0 ? `${periodos.length} período(s) configurado(s)` : "Sem períodos configurados"}
                            </p>
                          </div>
                          <Button type="button" variant="outline" size="sm" className="font-bold" onClick={() => adicionarPeriodoDia(dia.key)}>
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar período
                          </Button>
                        </div>

                        {periodos.length > 0 ? (
                          <div className="space-y-2">
                            {periodos.map((periodo, index) => (
                              <div key={`${dia.key}-${index}`} className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                                <div className="space-y-1">
                                  <Label className="text-xs text-slate-500">Início</Label>
                                  <Input
                                    type="time"
                                    value={periodo.inicio}
                                    onChange={(e) => atualizarPeriodoDia(dia.key, index, "inicio", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-slate-500">Fim</Label>
                                  <Input
                                    type="time"
                                    value={periodo.fim}
                                    onChange={(e) => atualizarPeriodoDia(dia.key, index, "fim", e.target.value)}
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="text-slate-500 hover:text-red-600"
                                  onClick={() => removerPeriodoDia(dia.key, index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                            Nenhum período configurado para {dia.label.toLowerCase()}.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-3 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Localização confirmada</Label>
                    <p className="text-xs text-slate-500">
                      O CEP tenta posicionar automaticamente. Se necessário, arraste o pino ou clique no mapa para ajustar.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="font-bold"
                    onClick={() => void preencherCoordenadasUnidade()}
                    disabled={geocodificandoUnidade}
                  >
                    {geocodificandoUnidade ? "Localizando..." : "Atualizar no mapa"}
                  </Button>
                </div>
                <MapaLocalizacao
                  lat={unidadeForm.latitude}
                  lng={unidadeForm.longitude}
                  onChange={({ lat, lng }) =>
                    setUnidadeForm((current) => ({ ...current, latitude: lat, longitude: lng }))
                  }
                  height={300}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Latitude</Label>
                    <Input value={unidadeForm.latitude ?? ""} readOnly />
                  </div>
                  <div className="space-y-2">
                    <Label>Longitude</Label>
                    <Input value={unidadeForm.longitude ?? ""} readOnly />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setUnidadeModalOpen(false)}>Cancelar</Button>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white" onClick={() => void handleSalvarUnidade()}>
              Salvar unidade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={vistoriadorModalOpen}
        onOpenChange={(open) => {
          setVistoriadorModalOpen(open);
          if (!open) resetVistoriadorForm();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Vincular vistoriador</DialogTitle>
            <DialogDescription>
              Escolha o usuário vistoriador e defina em qual unidade ele ficará disponível para a agenda.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Usuário vistoriador</Label>
              <Select value={vistoriadorForm.usuario_id} onValueChange={(value) => setVistoriadorForm((current) => ({ ...current, usuario_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vistoriador" />
                </SelectTrigger>
                <SelectContent>
                  {vistoriadoresCadastro.map((vistoriador: any) => (
                    <SelectItem key={vistoriador.usuario_id} value={vistoriador.usuario_id}>
                      {vistoriador.nome}{vistoriador.unidade_nome ? ` - ${vistoriador.unidade_nome}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Unidade credenciada</Label>
              <Select value={vistoriadorForm.unidade_id} onValueChange={(value) => setVistoriadorForm((current) => ({ ...current, unidade_id: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {unidadesCadastro
                    .filter((unidade: any) => unidade.ativo)
                    .map((unidade: any) => (
                      <SelectItem key={unidade.id} value={unidade.id}>
                        {unidade.nome} - {unidade.cidade}/{unidade.estado}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status do vínculo</Label>
              <Select value={vistoriadorForm.status} onValueChange={(value) => setVistoriadorForm((current) => ({ ...current, status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ATIVO">Ativo</SelectItem>
                  <SelectItem value="INATIVO">Inativo</SelectItem>
                  <SelectItem value="BLOQUEADO">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVistoriadorModalOpen(false)}>Cancelar</Button>
            <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => void handleSalvarVistoriador()}>
              Salvar vistoriador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ============================================================================
// ABA CHECKLIST DINAMICO (separado para não poluir o componente principal)
// ============================================================================
function AbaChecklistConfigDinamico() {
  const queryClient = useQueryClient();
  const [catSelecionadaId, setCatSelecionadaId] = useState<string | null>(null);
  const [novaCatNome, setNovaCatNome] = useState("");
  const [novaCatDesc, setNovaCatDesc] = useState("");
  const [itemModalAberto, setItemModalAberto] = useState(false);
  const [editandoItem, setEditandoItem] = useState<any | null>(null);
  const [formItem, setFormItem] = useState<{
    titulo: string;
    descricao_ajuda: string;
    tipo_item: "CONFORMIDADE" | "TEXTO_LIVRE" | "NUMERO" | "CHECKBOX_MULTIPLO" | "SELECT_UNICO";
    opcoesStr: string;
    obrigatorio: boolean;
    foto_obrigatoria: boolean;
    permite_observacao: boolean;
    ordem: number;
  }>({
    titulo: "",
    descricao_ajuda: "",
    tipo_item: "CONFORMIDADE",
    opcoesStr: "",
    obrigatorio: true,
    foto_obrigatoria: false,
    permite_observacao: true,
    ordem: 10,
  });

  const { data: checklistRes, isLoading: checklistCarregando, error: checklistErroRede, refetch: recarregarChecklist } = useQuery({
    queryKey: ["admin-checklist-config"],
    queryFn: () => import("@/lib/admin-checklist.functions").then((m) => m.getChecklistConfigAdminFn()),
    retry: 1,
  });
  const categorias = (checklistRes as any)?.ok ? ((checklistRes as any).data as any[]) : [];
  const checklistErroMsg =
    (checklistErroRede as any)?.message ||
    (checklistRes && (checklistRes as any).ok === false ? (checklistRes as any).message : null);


  // Mantém selecionada a primeira categoria quando abrir a aba
  useEffect(() => {
    if (!catSelecionadaId && categorias?.[0]) setCatSelecionadaId(categorias[0].id);
  }, [categorias, catSelecionadaId]);

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["admin-checklist-config"] });

  const catSelecionada = categorias.find((c: any) => c.id === catSelecionadaId) || null;

  // ========= Mutações ================
  const criarCategoriaMut = useMutation({
    mutationFn: () => import("@/lib/admin-checklist.functions").then((m) => m.adminCriarCategoriaFn({
      data: { nome: novaCatNome, descricao: novaCatDesc || null, ordem: (categorias.length + 1) * 10 },
    })),
    onSuccess: (r) => {
      if ((r as any).ok) {
        setNovaCatNome("");
        setNovaCatDesc("");
        setCatSelecionadaId((r as any).id || null);
        refetch();
        toast.success("Categoria criada.");
      } else toast.error((r as any).message || "Erro.");
    },
  });

  const excluirCategoriaMut = useMutation({
    mutationFn: (id: string) => import("@/lib/admin-checklist.functions").then((m) => m.adminExcluirCategoriaFn({ data: { id } })),
    onSuccess: () => { refetch(); setCatSelecionadaId(null); toast.success("Categoria removida."); },
  });

  const salvarItemMut = useMutation({
    mutationFn: (payload: any) => {
      return editandoItem
        ? import("@/lib/admin-checklist.functions").then((m) => m.adminAtualizarItemFn({ data: { id: editandoItem.id, ...payload } }))
        : import("@/lib/admin-checklist.functions").then((m) => m.adminCriarItemFn({ data: { categoria_id: catSelecionadaId!, ...payload } }));
    },
    onSuccess: () => { setItemModalAberto(false); setEditandoItem(null); refetch(); toast.success(editandoItem ? "Item atualizado." : "Item criado."); },
  });

  const excluirItemMut = useMutation({
    mutationFn: (id: string) => import("@/lib/admin-checklist.functions").then((m) => m.adminExcluirItemFn({ data: { id } })),
    onSuccess: () => { refetch(); toast.success("Item removido."); },
  });

  const abrirNovoItem = () => {
    setEditandoItem(null);
    const ultimaOrdem = Math.max(0, ...((catSelecionada?.itens || []).map((i: any) => Number(i.ordem || 0)))) + 10;
    setFormItem({
      titulo: "", descricao_ajuda: "", tipo_item: "CONFORMIDADE",
      opcoesStr: "", obrigatorio: true, foto_obrigatoria: false, permite_observacao: true, ordem: ultimaOrdem,
    });
    setItemModalAberto(true);
  };

  const abrirEditarItem = (item: any) => {
    setEditandoItem(item);
    const opStr = item.opcoes ? JSON.stringify(item.opcoes, null, 2) : "";
    setFormItem({
      titulo: item.titulo || "",
      descricao_ajuda: item.descricao_ajuda || "",
      tipo_item: item.tipo_item || "CONFORMIDADE",
      opcoesStr: opStr,
      obrigatorio: item.obrigatorio !== false,
      foto_obrigatoria: item.foto_obrigatoria === true,
      permite_observacao: item.permite_observacao !== false,
      ordem: Number(item.ordem || 10),
    });
    setItemModalAberto(true);
  };

  const handleSalvarItem = () => {
    if (!formItem.titulo.trim()) { toast.error("Título é obrigatório."); return; }
    if (!catSelecionadaId && !editandoItem) { toast.error("Selecione uma categoria primeiro."); return; }
    let opcoes: any = undefined;
    if (formItem.opcoesStr.trim()) {
      try { opcoes = JSON.parse(formItem.opcoesStr); }
      catch { toast.error("Opções JSON inválido."); return; }
    }
    if ((formItem.tipo_item === "CHECKBOX_MULTIPLO" || formItem.tipo_item === "SELECT_UNICO") &&
      (!opcoes || !Array.isArray(opcoes) || opcoes.length === 0)) {
      toast.error(`Para tipo ${formItem.tipo_item} informe opções (array JSON com {valor,label}).`);
      return;
    }
    salvarItemMut.mutate({
      titulo: formItem.titulo.trim(),
      descricao_ajuda: formItem.descricao_ajuda.trim() || null,
      tipo_item: formItem.tipo_item,
      opcoes,
      obrigatorio: formItem.obrigatorio,
      foto_obrigatoria: formItem.foto_obrigatoria,
      permite_observacao: formItem.permite_observacao,
      ordem: Number(formItem.ordem || 0),
    });
  };

  return (
    <TabsContent value="checklist_config" className="mt-0">
      <div className="space-y-6">
        <Card className="border-slate-200 shadow-none">
          <CardContent className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-teal-600" />
                Checklist de Vistoria — Configuração Dinâmica
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Crie <strong>categorias</strong> (grupos) e seus <strong>itens</strong> (perguntas). Cada categoria vira automaticamente UMA ETAPA no wizard do vistoriador.
                Categorias e ordens são refletidas <strong>em tempo real</strong> no app. Totalmente não engessado.
              </p>
            </div>
            <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 self-start md:self-center">
              {categorias.reduce((acc: number, c: any) => acc + (c.itens?.length || 0), 0)} itens · {categorias.length} categorias
            </Badge>
          </CardContent>
        </Card>

        {checklistErroMsg && (
          <Card className="border-red-200 bg-red-50 shadow-none">
            <CardContent className="p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold text-red-800">Não foi possível carregar o checklist</p>
                <p className="text-xs text-red-700 mt-0.5">{String(checklistErroMsg)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => recarregarChecklist()} className="border-red-300 text-red-800 self-start md:self-center">
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}


        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* Coluna esquerda: lista categorias + criar */}
          <div className="space-y-4">
            <Card className="border-slate-200 shadow-none">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Nova categoria</h3>
                <Input placeholder="Nome da categoria (ex: Elétrica)" value={novaCatNome} onChange={(e) => setNovaCatNome(e.target.value)} />
                <Input placeholder="Descrição (opcional)" value={novaCatDesc} onChange={(e) => setNovaCatDesc(e.target.value)} />
                <Button
                  onClick={() => criarCategoriaMut.mutate()}
                  disabled={!novaCatNome.trim() || criarCategoriaMut.isPending}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Categoria
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-none">
              <CardContent className="p-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 px-2 pt-1">Categorias</h3>
                <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                  {checklistCarregando && (
                    <p className="text-xs text-slate-400 px-2 py-3">Carregando categorias...</p>
                  )}
                  {!checklistCarregando && categorias.length === 0 && (
                    <p className="text-xs text-slate-400 px-2 py-3">
                      {checklistErroMsg ? "Erro ao carregar. Veja o aviso acima." : "Nenhuma categoria ainda. Crie a primeira acima."}
                    </p>
                  )}

                  {categorias.map((c: any) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCatSelecionadaId(c.id)}
                      className={cn(
                        "w-full flex items-start justify-between gap-2 rounded-xl px-3 py-3 text-left transition-colors",
                        catSelecionadaId === c.id
                          ? "bg-teal-50 ring-1 ring-inset ring-teal-200"
                          : "hover:bg-slate-50"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={cn(
                          "font-bold truncate",
                          catSelecionadaId === c.id ? "text-teal-900" : "text-slate-800"
                        )}>{c.nome}</p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{c.descricao || "Sem descrição"}</p>
                        <p className="text-[10px] font-black uppercase tracking-wider mt-1.5 text-slate-400">{c.itens?.length || 0} itens</p>
                      </div>
                      <Trash2
                        className="h-4 w-4 mt-1 text-slate-300 hover:text-rose-500 cursor-pointer flex-shrink-0"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (window.confirm(`Remover categoria "${c.nome}" e seus ${c.itens?.length || 0} itens?`)) {
                            excluirCategoriaMut.mutate(c.id);
                          }
                        }}
                      />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coluna direita: itens da categoria */}
          <div className="space-y-4">
            {!catSelecionada ? (
              <Card className="border-dashed border-slate-300 shadow-none bg-slate-50/40">
                <CardContent className="p-10 text-center">
                  <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
                  <h3 className="mt-3 font-bold text-slate-700">Selecione uma categoria</h3>
                  <p className="text-xs text-slate-500 mt-1">Clique em uma categoria à esquerda para gerenciar seus itens.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-slate-200 shadow-none">
                  <CardContent className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-black text-slate-900">{catSelecionada.nome}</h2>
                        <Badge variant="outline">Ordem {catSelecionada.ordem}</Badge>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">{catSelecionada.descricao || "Sem descrição"}</p>
                    </div>
                    <Button onClick={abrirNovoItem} className="bg-teal-600 hover:bg-teal-700 text-white">
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Item
                    </Button>
                  </CardContent>
                </Card>

                <div className="space-y-3">
                  {(catSelecionada.itens || []).length === 0 ? (
                    <Card className="border-dashed border-slate-300 bg-slate-50/40 shadow-none">
                      <CardContent className="p-10 text-center">
                        <ListChecks className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-3 text-sm font-bold text-slate-700">Nenhum item nesta categoria ainda.</p>
                        <p className="text-xs text-slate-500 mt-1">Clique em "Novo Item" para criar a primeira pergunta.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    (catSelecionada.itens || [])
                      .slice()
                      .sort((a: any, b: any) => Number(a.ordem || 0) - Number(b.ordem || 0))
                      .map((item: any) => (
                        <Card key={item.id} className="border-slate-200 shadow-none">
                          <CardContent className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-black text-slate-900">{item.titulo}</h4>
                                  {item.obrigatorio !== false && <Badge className="bg-rose-50 text-rose-700 border-rose-200 border">Obrigatório</Badge>}
                                  {item.foto_obrigatoria && <Badge className="bg-sky-50 text-sky-700 border-sky-200 border">Foto Obrigatória</Badge>}
                                  <Badge variant="outline" className="text-slate-500">{TIPO_ITEM_LABEL[item.tipo_item] || item.tipo_item}</Badge>
                                  <Badge variant="outline" className="text-slate-400 bg-slate-50">Ordem {item.ordem}</Badge>
                                </div>
                                {item.descricao_ajuda && (
                                  <p className="text-xs text-slate-500 mt-2 flex items-start gap-1.5">
                                    <Info className="h-3.5 w-3.5 mt-0.5 text-slate-400 flex-shrink-0" />
                                    <span>{item.descricao_ajuda}</span>
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <Button variant="outline" size="sm" onClick={() => abrirEditarItem(item)}>
                                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                                </Button>
                                <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => {
                                  if (window.confirm(`Remover item "${item.titulo}"?`)) excluirItemMut.mutate(item.id);
                                }}>
                                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
                                </Button>
                              </div>
                            </div>
                            {(item.tipo_item === "CHECKBOX_MULTIPLO" || item.tipo_item === "SELECT_UNICO") && Array.isArray(item.opcoes) && item.opcoes.length > 0 && (
                              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Opções</p>
                                <div className="flex flex-wrap gap-2">
                                  {item.opcoes.map((op: any, idx: number) => (
                                    <Badge key={`${op.valor}-${idx}`} variant="outline" className="bg-white">
                                      {op.label} <span className="text-slate-400 ml-1.5">({op.valor})</span>
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {item.permite_observacao === false && (
                              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Campo de observação DESABILITADO para este item.</p>
                            )}
                          </CardContent>
                        </Card>
                      ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Dialog Novo/Editar Item */}
        <Dialog open={itemModalAberto} onOpenChange={setItemModalAberto}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editandoItem ? "Editar Item do Checklist" : "Novo Item do Checklist"}</DialogTitle>
              <DialogDescription>
                Defina o tipo e as regras do item. Estes campos aparecem no app do vistoriador durante a execução da vistoria.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[2fr_80px_1fr]">
                <div className="space-y-2 md:col-span-2">
                  <Label>Título / Pergunta</Label>
                  <Input placeholder="Ex: Coluna A do veículo" value={formItem.titulo}
                    onChange={(e) => setFormItem((c) => ({ ...c, titulo: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Ordem</Label>
                  <Input type="number" value={formItem.ordem}
                    onChange={(e) => setFormItem((c) => ({ ...c, ordem: Number(e.target.value || 0) }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição / Dica para o vistoriador (opcional)</Label>
                <Textarea rows={2} placeholder="Ex: Verificar amassados, pintura, solda aparente"
                  value={formItem.descricao_ajuda}
                  onChange={(e) => setFormItem((c) => ({ ...c, descricao_ajuda: e.target.value }))} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tipo do Item</Label>
                  <Select value={formItem.tipo_item} onValueChange={(v: any) => setFormItem((c) => ({ ...c, tipo_item: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CONFORMIDADE">Conformidade (Conforme/Não Conforme/N/A)</SelectItem>
                      <SelectItem value="TEXTO_LIVRE">Texto Livre</SelectItem>
                      <SelectItem value="NUMERO">Número</SelectItem>
                      <SelectItem value="CHECKBOX_MULTIPLO">Múltipla Escolha (Checkbox)</SelectItem>
                      <SelectItem value="SELECT_UNICO">Escolha Única (Select)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 flex-col flex justify-end">
                  <div className="flex items-center gap-4 pt-2">
                    <div className="flex items-center gap-2">
                      <Checkbox id="obrigatorio" checked={formItem.obrigatorio} onCheckedChange={(v) => setFormItem((c) => ({ ...c, obrigatorio: !!v }))} />
                      <Label htmlFor="obrigatorio">Obrigatório *</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="foto-obrig" checked={formItem.foto_obrigatoria} onCheckedChange={(v) => setFormItem((c) => ({ ...c, foto_obrigatoria: !!v }))} />
                      <Label htmlFor="foto-obrig">Foto obrigatória</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="permite-obs" checked={formItem.permite_observacao} onCheckedChange={(v) => setFormItem((c) => ({ ...c, permite_observacao: !!v }))} />
                      <Label htmlFor="permite-obs">Permite observação</Label>
                    </div>
                  </div>
                </div>
              </div>

              {(formItem.tipo_item === "CHECKBOX_MULTIPLO" || formItem.tipo_item === "SELECT_UNICO") && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <Label>Opções (Array JSON de objetos {"{valor, label}"})</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFormItem((c) => ({
                        ...c, opcoesStr: JSON.stringify([
                          { valor: "OP1", label: "Opção 1" },
                          { valor: "OP2", label: "Opção 2" },
                        ], null, 2),
                      }))}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Preencher exemplo
                    </Button>
                  </div>
                  <Textarea
                    rows={6}
                    className="font-mono text-xs"
                    placeholder={`[\n  { "valor": "OP1", "label": "Opção 1" },\n  { "valor": "OP2", "label": "Opção 2" }\n]`}
                    value={formItem.opcoesStr}
                    onChange={(e) => setFormItem((c) => ({ ...c, opcoesStr: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setItemModalAberto(false)}>Cancelar</Button>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSalvarItem}>
                {editandoItem ? "Salvar alterações" : "Criar Item"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TabsContent>
  );
}

const TIPO_ITEM_LABEL: Record<string, string> = {
  CONFORMIDADE: "Conforme / Não Conforme",
  TEXTO_LIVRE: "Texto Livre",
  NUMERO: "Número",
  CHECKBOX_MULTIPLO: "Múltipla Escolha",
  SELECT_UNICO: "Escolha Única",
};
