import { createFileRoute } from '@tanstack/react-router'
import React, { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Megaphone
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { 
  getIndicadoresComunicacoesFn, 
  listarCampanhasFn, 
  getWhatsappConfigFn,
  testarConexaoFn,
  sincronizarTemplatesFn,
  updateWhatsappConfigFn,
  gerarNovoVerifyTokenFn,
  getWebhookLogsFn,
  buscarDadosAutomaticosFn,
  listarTemplatesFn,
  criarTemplateMetaFn,
  estimarPublicoFn,
  criarCampanhaFn,
  enviarTesteFn,
  processarEnvioCampanhaFn
} from '@/lib/comunicacoes.functions';
import { listarAutomacoesFn, salvarAutomacaoFn, getExecucoesAutomacaoFn } from '@/lib/automacoes.functions';
import { getAnunciosAdmin } from '@/lib/anuncios.functions';
import { toast } from 'sonner';
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
  LayoutTemplate
} from 'lucide-react';


export const Route = createFileRoute('/admin/comunicacoes')({
  component: ComunicacoesPage,
});

function ComunicacoesPage() {
  const queryClient = useQueryClient();
  const getIndicadores = useServerFn(getIndicadoresComunicacoesFn);
  const listarCampanhas = useServerFn(listarCampanhasFn);
  const getConfig = useServerFn(getWhatsappConfigFn);
  const testarConexao = useServerFn(testarConexaoFn);
  const sincronizarTemplates = useServerFn(sincronizarTemplatesFn);
  const updateConfig = useServerFn(updateWhatsappConfigFn);
  const gerarToken = useServerFn(gerarNovoVerifyTokenFn);
  const getLogs = useServerFn(getWebhookLogsFn);
  const buscarDadosAutos = useServerFn(buscarDadosAutomaticosFn);
  const getTemplates = useServerFn(listarTemplatesFn);
  const criarTemplate = useServerFn(criarTemplateMetaFn);
  const estimarPublico = useServerFn(estimarPublicoFn);
  const criarCampanha = useServerFn(criarCampanhaFn);
  const enviarTeste = useServerFn(enviarTesteFn);
  const getAnuncios = useServerFn(getAnunciosAdmin);
  const processarEnvio = useServerFn(processarEnvioCampanhaFn);
  const getAutomacoes = useServerFn(listarAutomacoesFn);
  const salvarAutomacao = useServerFn(salvarAutomacaoFn);
  const getExecucoes = useServerFn(getExecucoesAutomacaoFn);

  const [activeTab, setActiveTab] = useState('campanhas');
  const [selectedAutomacao, setSelectedAutomacao] = useState<any>(null);
  const [isExecucoesOpen, setIsExecucoesOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>({});
  const [webhookTokenGerado, setWebhookTokenGerado] = useState<string | null>(null);
  
  // Wizard Template State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [newTemplate, setNewTemplate] = useState<any>({
    name: '',
    category: 'MARKETING',
    language: 'pt_BR',
    components: [
      { type: 'BODY', text: '' }
    ]
  });

  // Wizard Campanha State
  const [isCampanhaWizardOpen, setIsCampanhaWizardOpen] = useState(false);
  const [campanhaStep, setCampanhaStep] = useState(1);
  const [novaCampanha, setNovaCampanha] = useState<any>({
    nome: '',
    veiculo_id: '',
    template_id: '',
    filtros: {
      tipo: 'TODOS',
      status: 'APROVADO',
      uf: '',
    },
    mapeamento_variaveis: {},
    agendado_para: null
  });

  // Wizard Automação State
  const [isAutomacaoWizardOpen, setIsAutomacaoWizardOpen] = useState(false);
  const [automacaoStep, setAutomacaoStep] = useState(1);
  const [novaAutomacao, setNovaAutomacao] = useState<any>({
    nome: '',
    evento: '',
    publico: '',
    template_id: '',
    status: 'RASCUNHO',
    config_envio: { momento: 'IMEDIATO' },
    mapeamento_variaveis: []
  });

  // Removido duplicado handleSalvarAutomacao e automacoes query aqui
  
  const [estimativa, setEstimativa] = useState<any>({ total: 0, elegiveis: 0, nao_elegiveis: 0 });


  const { data: indicadores } = useQuery({
    queryKey: ['wa-indicadores'],
    queryFn: () => getIndicadores()
  });

  const { data: campanhas } = useQuery({
    queryKey: ['wa-campanhas'],
    queryFn: () => listarCampanhas()
  });

  const { data: config } = useQuery({
    queryKey: ['wa-config'],
    queryFn: () => getConfig()
  });

  const { data: logs } = useQuery({
    queryKey: ['wa-logs'],
    queryFn: () => getLogs()
  });

  const { data: templates } = useQuery({
    queryKey: ['wa-templates'],
    queryFn: () => getTemplates()
  });

  const { data: anuncios } = useQuery({
    queryKey: ['anuncios-ativos'],
    queryFn: () => getAnuncios({ data: 'PUBLICADO' })
  });

  const { data: automacoes, refetch: refetchAutomacoes } = useQuery({
    queryKey: ['wa-automacoes'],
    queryFn: () => getAutomacoes(),
    enabled: activeTab === 'automacoes'
  });

  const { data: execucoesAutomacao } = useQuery({
    queryKey: ['automacao-execucoes', selectedAutomacao?.id],
    queryFn: () => getExecucoes(selectedAutomacao?.id),
    enabled: !!selectedAutomacao?.id && isExecucoesOpen
  });

  const handleSalvarAutomacao = async () => {
    toast.promise(salvarAutomacao({ data: novaAutomacao }), {
      loading: 'Salvando automação...',
      success: () => {
        setIsAutomacaoWizardOpen(false);
        refetchAutomacoes();
        setAutomacaoStep(1);
        return 'Automação salva!';
      },
      error: (err) => `Erro: ${err.message}`
    });
  };

  const handleEstimar = async () => {
    const res = await estimarPublico({ data: novaCampanha.filtros });
    setEstimativa(res);
  };


  const handleSalvarCampanha = async (enviarAgora = false) => {
    toast.promise(criarCampanha({ data: novaCampanha }), {
      loading: 'Salvando campanha...',
      success: (res: any) => {
        if (res.id) {
          setIsCampanhaWizardOpen(false);
          queryClient.invalidateQueries({ queryKey: ['wa-campanhas'] });
          if (enviarAgora) {
            handleProcessarEnvio(res.id);
          }
          return 'Campanha salva com sucesso!';
        }
        throw new Error(res.error || 'Erro ao salvar');
      },
      error: (err) => `Falha: ${err.message}`
    });
  };

  const handleProcessarEnvio = async (id: string) => {
    toast.promise(processarEnvio({ data: id }), {
      loading: 'Processando fila de envio...',
      success: 'Envio concluído!',
      error: (err) => `Erro no processamento: ${err.message}`
    });
  };

  const handleEnviarTeste = async () => {
    toast.promise(enviarTeste({ 
      data: {
        telefone: '5517999999999', 
        template_id: novaCampanha.template_id,
        variaveis: novaCampanha.mapeamento_variaveis
      }
    }), {
      loading: 'Enviando teste...',
      success: 'Teste enviado!',
      error: (err) => `Erro: ${err.message}`
    });
  };


  const handleSincronizar = async () => {
    toast.promise(sincronizarTemplates(), {
      loading: 'Sincronizando com a Meta...',
      success: (res: any) => {
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ['wa-templates'] });
          return `${res.count} templates sincronizados!`;
        }
        throw new Error(res.error);
      },
      error: (err) => `Erro na sincronização: ${err.message}`
    });
  };

  const handleCriarTemplate = async () => {
    toast.promise(criarTemplate(newTemplate), {
      loading: 'Enviando para análise da Meta...',
      success: (res: any) => {
        if (res.id) {
          setIsWizardOpen(false);
          setWizardStep(1);
          setNewTemplate({
            name: '',
            category: 'MARKETING',
            language: 'pt_BR',
            components: [{ type: 'BODY', text: '' }]
          });
          queryClient.invalidateQueries({ queryKey: ['wa-templates'] });
          return 'Template criado e enviado para análise!';
        }
        throw new Error(res.error || 'Erro ao criar template');
      },
      error: (err) => `Falha: ${err.message}`
    });
  };

  const handleTestarConexao = async () => {
    toast.promise(testarConexao(), {
      loading: 'Validando credenciais com a Meta...',
      success: (res: any) => {
        if (res && typeof res === 'object' && 'ok' in res && res.ok) {
          queryClient.invalidateQueries({ queryKey: ['wa-config'] });
          return '✓ Conexão validada com sucesso!';
        }
        throw new Error((res as any)?.error || 'Erro desconhecido');
      },
      error: (err) => `Erro: ${err.message}`
    });
  };


  const handleSaveConfig = async () => {
    try {
      const res = await updateConfig(editingConfig);
      if (res.ok) {
        toast.success('Configurações salvas!');
        setIsConfigOpen(false);
        queryClient.invalidateQueries({ queryKey: ['wa-config'] });
      }
    } catch (e) {
      toast.error('Erro ao salvar configurações.');
    }
  };

  const handleGerarToken = async () => {
    try {
      const res = await gerarToken();
      if (!res?.ok) {
        throw new Error(res?.error || 'Não foi possível gerar o token.');
      }
      setWebhookTokenGerado(res.token);
      toast.success('Novo Verify Token gerado! Copie o token exibido na tela.');
      queryClient.invalidateQueries({ queryKey: ['wa-config'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar token.');
    }
  };

  const handleBuscarDadosAutos = async () => {
    toast.promise(buscarDadosAutos(), {
      loading: 'Buscando dados na Meta...',
      success: (res: any) => {
        if (res.ok) {
          // Preencher campos se vierem no data
          toast.success('Dados recuperados!');
          return 'Dados sincronizados';
        }
        throw new Error(res.error);
      },
      error: (err) => `Erro: ${err.message}`
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência!');
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
                    <div className={`w-2 h-2 rounded-full ${config?.status === 'CONECTADO' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-sm font-bold">{config?.status || 'DESCONECTADO'}</span>
                  </div>
                </div>
                <div className={`p-2 ${config?.status === 'CONECTADO' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'} rounded-full`}>
                  <Globe className={`w-5 h-5 ${config?.status === 'CONECTADO' ? 'text-green-600' : 'text-red-600'}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="campanhas" className="w-full">
          <TabsList className="flex w-full overflow-x-auto bg-muted/50 p-1 mb-6 border-b rounded-none justify-start h-auto gap-2">
            <TabsTrigger value="campanhas" className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Campanhas</TabsTrigger>
            <TabsTrigger value="automacoes" className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Automações</TabsTrigger>
            <TabsTrigger value="segmentos" className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Segmentos</TabsTrigger>
            <TabsTrigger value="templates" className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Templates</TabsTrigger>
            <TabsTrigger value="contatos" className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Contatos</TabsTrigger>
            <TabsTrigger value="logs" className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Logs</TabsTrigger>
            <TabsTrigger value="config" className="px-6 py-3 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-md">Configurações</TabsTrigger>
          </TabsList>


          {/* Campanhas */}
          <TabsContent value="campanhas" className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Campanhas de Divulgação</h2>
                <p className="text-sm text-muted-foreground">Envios em massa pelo WhatsApp Cloud API</p>
              </div>
              <Dialog open={isCampanhaWizardOpen} onOpenChange={setIsCampanhaWizardOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-teal-600 hover:bg-teal-700">
                    <Plus className="w-4 h-4 mr-2" /> Nova Campanha
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Nova Campanha (Etapa {campanhaStep}/7)</DialogTitle>
                    <DialogDescription>Divulgue veículos ou envie comunicados gerais</DialogDescription>
                  </DialogHeader>

                  <div className="py-6 space-y-6">
                    {campanhaStep === 1 && (
                      <div className="space-y-6">
                        <Label className="text-lg">O que você deseja divulgar?</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <Card 
                            className={cn(
                              "cursor-pointer border-2 hover:border-teal-500 transition-all",
                              novaCampanha.veiculo_id ? "border-teal-600 bg-teal-50" : "border-slate-200"
                            )}
                            onClick={() => setCampanhaStep(2)}
                          >
                            <CardContent className="p-6 text-center space-y-3">
                              <Car className="w-10 h-10 mx-auto text-teal-600" />
                              <h3 className="font-bold">Veículo Específico</h3>
                              <p className="text-xs text-muted-foreground">Envie fotos e detalhes de um anúncio ativo</p>
                            </CardContent>
                          </Card>
                          <Card className="opacity-50 cursor-not-allowed border-slate-200">
                            <CardContent className="p-6 text-center space-y-3">
                              <Megaphone className="w-10 h-10 mx-auto text-slate-400" />
                              <h3 className="font-bold">Campanha Geral</h3>
                              <p className="text-xs text-muted-foreground">Comunicados institucionais ou avisos gerais</p>
                              <Badge variant="outline" className="text-[10px]">Em breve</Badge>
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
                          <Input placeholder="Buscar por marca, modelo ou código EJF..." className="pl-10" />
                        </div>
                        <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2">
                          {anuncios?.map((anuncio: any) => (
                            <div 
                              key={anuncio.id}
                              onClick={() => {
                                setNovaCampanha({
                                  ...novaCampanha, 
                                  veiculo_id: anuncio.veiculo_id,
                                  nome: `${anuncio.marca} ${anuncio.modelo} - ${anuncio.codigo_publico}`
                                });
                                setCampanhaStep(3);
                              }}
                              className={cn(
                                "flex items-center gap-4 p-3 border rounded-lg cursor-pointer hover:border-teal-500 transition-all",
                                novaCampanha.veiculo_id === anuncio.veiculo_id ? "border-teal-600 bg-teal-50" : "border-slate-100"
                              )}
                            >
                              <div className="w-16 h-12 bg-slate-100 rounded overflow-hidden shrink-0">
                                {anuncio.foto_capa ? <img src={anuncio.foto_capa} className="w-full h-full object-cover" /> : <Car className="w-full h-full p-3 text-slate-300" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold truncate">{anuncio.marca} {anuncio.modelo}</p>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                  <span>{anuncio.codigo_publico}</span>
                                  <span>•</span>
                                  <Badge variant="outline" className="text-[8px] px-1 h-3">{anuncio.status}</Badge>
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
                            <p className="text-2xl font-bold text-teal-600">{estimativa.elegiveis}</p>
                            <p className="text-[10px] text-muted-foreground">Elegíveis para WhatsApp</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Tipo de Comprador</Label>
                            <Select 
                              value={novaCampanha.filtros.tipo} 
                              onValueChange={v => {
                                const newFiltros = {...novaCampanha.filtros, tipo: v};
                                setNovaCampanha({...novaCampanha, filtros: newFiltros});
                                handleEstimar();
                              }}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
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
                              onValueChange={v => {
                                const newFiltros = {...novaCampanha.filtros, uf: v};
                                setNovaCampanha({...novaCampanha, filtros: newFiltros});
                                handleEstimar();
                              }}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
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

                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Users className="w-5 h-5 text-slate-400" />
                            <div>
                              <p className="text-sm font-semibold">{estimativa.total} compradores encontrados</p>
                              <p className="text-xs text-muted-foreground">{estimativa.nao_elegiveis} não elegíveis (ausência de WhatsApp ou desativado)</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="text-xs">Ver detalhes</Button>
                        </div>
                      </div>
                    )}

                    {campanhaStep === 4 && (
                      <div className="space-y-4">
                        <Label className="text-lg">Escolher Template</Label>
                        <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-2">
                          {templates?.filter((t: any) => t.status === 'APPROVED').map((template: any) => (
                            <div 
                              key={template.id}
                              onClick={() => {
                                setNovaCampanha({...novaCampanha, template_id: template.id});
                                setCampanhaStep(5);
                              }}
                              className={cn(
                                "p-3 border rounded-lg cursor-pointer hover:border-teal-500 transition-all",
                                novaCampanha.template_id === template.id ? "border-teal-600 bg-teal-50" : "border-slate-100"
                              )}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[120px]">{template.meta_name}</span>
                                <Badge className="text-[8px] bg-blue-100 text-blue-700 hover:bg-blue-100">{template.categoria}</Badge>
                              </div>
                              <p className="text-xs font-medium line-clamp-2">
                                {template.conteudo?.find((c: any) => c.type === 'BODY')?.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {campanhaStep === 5 && (
                      <div className="space-y-6">
                        <Label className="text-lg">Mapeamento de Variáveis</Label>
                        <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-lg border border-blue-100 dark:border-blue-900/50 flex gap-3">
                          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-900 dark:text-blue-200">
                            Preencha as variáveis do template com os dados dinâmicos do veículo ou comprador.
                          </p>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4 items-center">
                            <div className="space-y-1">
                              <Label className="text-xs">{"{{"}1{"}}"} Nome do Comprador</Label>
                              <div className="p-2 bg-slate-100 rounded border text-xs text-muted-foreground flex items-center gap-2">
                                <Users className="w-3 h-3" /> Automático: comprador.nome
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{"{{"}2{"}}"} Marca/Modelo Veículo</Label>
                              <div className="p-2 bg-slate-100 rounded border text-xs text-muted-foreground flex items-center gap-2">
                                <Car className="w-3 h-3" /> Automático: veiculo.nome_completo
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{"{{"}3{"}}"} Link do Anúncio</Label>
                              <div className="p-2 bg-slate-100 rounded border text-xs text-muted-foreground flex items-center gap-2">
                                <Globe className="w-3 h-3" /> Automático: anuncio.url
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {campanhaStep === 6 && (
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <Label className="text-lg">Prévia da Mensagem</Label>
                          <Button variant="outline" size="sm" onClick={handleEnviarTeste}>
                            <Send className="w-4 h-4 mr-2" /> Enviar Teste
                          </Button>
                        </div>
                        
                        <div className="max-w-[320px] mx-auto bg-[#e5ddd5] dark:bg-slate-800 p-4 rounded-xl relative shadow-inner">
                          <div className="bg-white dark:bg-slate-900 rounded-lg p-3 shadow-sm text-sm space-y-2">
                            <div className="w-full aspect-video bg-slate-100 rounded mb-2 flex items-center justify-center">
                              <Car className="w-12 h-12 text-slate-300" />
                            </div>
                            <p className="font-bold">Olá Carlos,</p>
                            <p>Uma nova oportunidade acaba de entrar no Esse Já Foi: <strong>{novaCampanha.nome}</strong>. Confira as fotos e participe pelo botão abaixo.</p>
                            <div className="border-t pt-2 mt-2">
                              <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs">
                                Ver veículo
                              </Button>
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1 text-right">14:30</div>
                        </div>
                      </div>
                    )}

                    {campanhaStep === 7 && (
                      <div className="space-y-6">
                        <Label className="text-lg">Revisão Final</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-4">
                            <div className="p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-2">
                              <p className="text-[10px] text-muted-foreground uppercase">Conteúdo</p>
                              <p className="text-sm font-bold truncate">{novaCampanha.nome}</p>
                              <div className="flex items-center gap-2">
                                <FileText className="w-3 h-3 text-slate-400" />
                                <span className="text-xs">Template: {templates?.find((t: any) => t.id === novaCampanha.template_id)?.meta_name}</span>
                              </div>
                            </div>
                            <div className="p-4 border rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-2">
                              <p className="text-[10px] text-muted-foreground uppercase">Conexão</p>
                              <div className="flex items-center gap-2">
                                <Globe className="w-3 h-3 text-green-500" />
                                <span className="text-xs font-bold text-green-600">Meta WABA Conectada</span>
                              </div>
                              <p className="text-xs font-mono">{config?.phone_number}</p>
                            </div>
                          </div>

                          <div className="p-4 border rounded-lg bg-slate-900 text-white space-y-4">
                            <p className="text-[10px] text-slate-400 uppercase">Resumo de Envio</p>
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
                                <span className="text-xl font-black text-teal-400">{estimativa.elegiveis}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter className="flex justify-between sm:justify-between w-full border-t pt-4">
                    <Button 
                      variant="ghost" 
                      onClick={() => campanhaStep > 1 ? setCampanhaStep(campanhaStep - 1) : setIsCampanhaWizardOpen(false)}
                    >
                      {campanhaStep === 1 ? 'Cancelar' : 'Voltar'}
                    </Button>
                    <div className="flex gap-2">
                      {campanhaStep === 7 ? (
                        <>
                          <Button variant="outline" onClick={() => handleSalvarCampanha(false)}>Agendar</Button>
                          <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => handleSalvarCampanha(true)}>
                            Enviar Agora <Send className="w-4 h-4 ml-2" />
                          </Button>
                        </>
                      ) : (
                        <Button 
                          className="bg-teal-600 hover:bg-teal-700" 
                          onClick={() => {
                            if (campanhaStep === 2 && !novaCampanha.veiculo_id) {
                              toast.error('Selecione um veículo');
                              return;
                            }
                            if (campanhaStep === 3) handleEstimar();
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
              {campanhas?.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center gap-4">
                    <Send className="w-12 h-12 opacity-20" />
                    <p>Nenhuma campanha realizada até o momento.</p>
                    <Button variant="outline" onClick={() => setIsCampanhaWizardOpen(true)}>Criar minha primeira campanha</Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="border rounded-lg overflow-hidden bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campanha</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Veículo</th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Elegíveis</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Enviados</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Lidos</th>
                        <th className="px-4 py-3 text-right font-medium text-muted-foreground">Cliques</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {campanhas?.map((campanha: any) => (
                        <tr key={campanha.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-bold">{campanha.nome}</span>
                              <span className="text-[10px] text-muted-foreground">{new Date(campanha.criado_em).toLocaleDateString()}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs">{campanha.marca} {campanha.modelo}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={
                              campanha.status === 'CONCLUIDA' ? 'success' : 
                              campanha.status === 'PROCESSANDO' ? 'warning' : 'secondary'
                            } className="text-[10px]">
                              {campanha.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{campanha.total_destinatarios}</td>
                          <td className="px-4 py-3 text-right font-mono text-blue-600">{campanha.total_enviados}</td>
                          <td className="px-4 py-3 text-right font-mono text-purple-600">{campanha.total_lidos}</td>
                          <td className="px-4 py-3 text-right font-mono text-teal-600">{campanha.total_cliques}</td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="icon"><ChevronRight className="w-4 h-4" /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Segmentos */}
          <TabsContent value="segmentos" className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Segmentos de Compradores</h2>
                <p className="text-sm text-muted-foreground">Crie públicos dinâmicos baseados em filtros ou listas manuais</p>
              </div>
              <Button className="bg-teal-600 hover:bg-teal-700">
                <Plus className="w-4 h-4 mr-2" /> Novo Segmento
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="col-span-2">
                <CardHeader>
                  <CardTitle className="text-md">Segmentos Ativos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left">Nome</th>
                          <th className="px-4 py-3 text-left">Tipo</th>
                          <th className="px-4 py-3 text-right">Contatos</th>
                          <th className="px-4 py-3 text-right">Elegíveis</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        <tr className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-bold">Lojistas VIP - São Paulo</span>
                              <span className="text-[10px] text-muted-foreground">Filtro: PJ + SP</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"><Badge variant="outline">Dinâmico</Badge></td>
                          <td className="px-4 py-3 text-right">142</td>
                          <td className="px-4 py-3 text-right text-teal-600 font-bold">128</td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="icon"><ChevronRight className="w-4 h-4" /></Button>
                          </td>
                        </tr>
                        <tr className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-bold">Interessados SUVs Premium</span>
                              <span className="text-[10px] text-muted-foreground">Filtro: Interesse SUV + {">"} 2018</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"><Badge variant="outline">Dinâmico</Badge></td>
                          <td className="px-4 py-3 text-right">86</td>
                          <td className="px-4 py-3 text-right text-teal-600 font-bold">74</td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="icon"><ChevronRight className="w-4 h-4" /></Button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-md">Bibliotecas de Filtros</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Por Tipo</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="cursor-pointer">Lojista</Badge>
                        <Badge variant="secondary" className="cursor-pointer">Pessoa Física</Badge>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Por Interesse</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="cursor-pointer">SUV</Badge>
                        <Badge variant="secondary" className="cursor-pointer">Sedan</Badge>
                        <Badge variant="secondary" className="cursor-pointer">Hatch</Badge>
                        <Badge variant="secondary" className="cursor-pointer">Picape</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Contatos */}
          <TabsContent value="contatos" className="mt-6 space-y-4">
             <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Base de Contatos (WhatsApp)</h2>
                <p className="text-sm text-muted-foreground">Monitore a elegibilidade e saúde dos números dos seus compradores</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline">
                  <Filter className="w-4 h-4 mr-2" /> Filtrar Elegíveis
                </Button>
                <Button variant="outline"> Exportar Base</Button>
              </div>
            </div>
            
            <Card>
              <CardContent className="p-0">
                <div className="border-b p-4 bg-slate-50/50 flex gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input placeholder="Buscar por nome, telefone ou empresa..." className="pl-10" />
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">Comprador</th>
                      <th className="px-4 py-3 text-left">WhatsApp</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Elegibilidade</th>
                      <th className="px-4 py-3 text-right">Interesses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">Auto Prime Multimarcas</td>
                      <td className="px-4 py-3 font-mono">(17) 99762-4832</td>
                      <td className="px-4 py-3"><Badge variant="success">ATIVO</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span>Elegível</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Badge variant="outline" className="text-[9px]">SUV</Badge>
                          <Badge variant="outline" className="text-[9px]">Luxury</Badge>
                        </div>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">Carlos Eduardo Silva</td>
                      <td className="px-4 py-3 font-mono">(11) 98221-0092</td>
                      <td className="px-4 py-3"><Badge variant="destructive">INVÁLIDO</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <AlertCircle className="w-4 h-4 text-red-500" />
                          <span>Número Inexistente</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                         <Badge variant="outline" className="text-[9px]">Hatch</Badge>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Segmentos */}
          <TabsContent value="segmentos" className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Segmentos de Compradores</h2>
                <p className="text-sm text-muted-foreground">Crie públicos dinâmicos baseados em filtros ou listas manuais</p>
              </div>
              <Button className="bg-teal-600 hover:bg-teal-700">
                <Plus className="w-4 h-4 mr-2" /> Novo Segmento
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="col-span-2">
                <CardHeader>
                  <CardTitle className="text-md">Segmentos Ativos</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left">Nome</th>
                          <th className="px-4 py-3 text-left">Tipo</th>
                          <th className="px-4 py-3 text-right">Contatos</th>
                          <th className="px-4 py-3 text-right">Elegíveis</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        <tr className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-bold">Lojistas VIP - São Paulo</span>
                              <span className="text-[10px] text-muted-foreground">Filtro: PJ + SP</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"><Badge variant="outline">Dinâmico</Badge></td>
                          <td className="px-4 py-3 text-right">142</td>
                          <td className="px-4 py-3 text-right text-teal-600 font-bold">128</td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="icon"><ChevronRight className="w-4 h-4" /></Button>
                          </td>
                        </tr>
                        <tr className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-bold">Interessados SUVs Premium</span>
                              <span className="text-[10px] text-muted-foreground">Filtro: Interesse SUV + {'>'} 2018</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"><Badge variant="outline">Dinâmico</Badge></td>
                          <td className="px-4 py-3 text-right">86</td>
                          <td className="px-4 py-3 text-right text-teal-600 font-bold">74</td>
                          <td className="px-4 py-3 text-right">
                            <Button variant="ghost" size="icon"><ChevronRight className="w-4 h-4" /></Button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-md">Bibliotecas de Filtros</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Por Tipo</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="cursor-pointer">Lojista</Badge>
                        <Badge variant="secondary" className="cursor-pointer">Pessoa Física</Badge>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium">Por Interesse</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="cursor-pointer">SUV</Badge>
                        <Badge variant="secondary" className="cursor-pointer">Sedan</Badge>
                        <Badge variant="secondary" className="cursor-pointer">Hatch</Badge>
                        <Badge variant="secondary" className="cursor-pointer">Picape</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Contatos */}
          <TabsContent value="contatos" className="mt-6 space-y-4">
             <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Base de Contatos (WhatsApp)</h2>
                <p className="text-sm text-muted-foreground">Monitore a elegibilidade e saúde dos números dos seus compradores</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline">
                  <Filter className="w-4 h-4 mr-2" /> Filtrar Elegíveis
                </Button>
                <Button variant="outline"> Exportar Base</Button>
              </div>
            </div>
            
            <Card>
              <CardContent className="p-0">
                <div className="border-b p-4 bg-slate-50/50 flex gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input placeholder="Buscar por nome, telefone ou empresa..." className="pl-10" />
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left">Comprador</th>
                      <th className="px-4 py-3 text-left">WhatsApp</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Elegibilidade</th>
                      <th className="px-4 py-3 text-right">Interesses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">Auto Prime Multimarcas</td>
                      <td className="px-4 py-3 font-mono">(17) 99762-4832</td>
                      <td className="px-4 py-3"><Badge variant="success">ATIVO</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                          <span>Elegível</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Badge variant="outline" className="text-[9px]">SUV</Badge>
                          <Badge variant="outline" className="text-[9px]">Luxury</Badge>
                        </div>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">Carlos Eduardo Silva</td>
                      <td className="px-4 py-3 font-mono">(11) 98221-0092</td>
                      <td className="px-4 py-3"><Badge variant="destructive">INVÁLIDO</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <AlertCircle className="w-4 h-4 text-red-500" />
                          <span>Número Inexistente</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                         <Badge variant="outline" className="text-[9px]">Hatch</Badge>
                      </td>
                    </tr>
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
                <p className="text-sm text-muted-foreground">Gerencie seus templates do WhatsApp Meta</p>
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
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Novo Template (Etapa {wizardStep}/7)</DialogTitle>
                      <DialogDescription>
                        Crie um novo template aprovado pela Meta
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="py-4 space-y-4">
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
                              onChange={e => setNewTemplate({...newTemplate, name: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')})} 
                              placeholder="ex: boas_vindas_comprador" 
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">Sugestão: use prefixos como bo_ (boas vindas), nv_ (novo veículo).</p>
                          </div>
                          <div>
                            <Label>Categoria</Label>
                            <Select value={newTemplate.category} onValueChange={v => setNewTemplate({...newTemplate, category: v})}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="MARKETING">Marketing (Promoções, anúncios)</SelectItem>
                                <SelectItem value="UTILITY">Utilitário (Alertas, pós-venda, entregas)</SelectItem>
                                <SelectItem value="AUTHENTICATION">Autenticação (Códigos de acesso)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {wizardStep === 2 && (
                        <div className="space-y-6">
                          <Label>Estrutura do Template</Label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="border rounded-lg p-4 cursor-pointer hover:border-teal-500 bg-teal-50/50">
                              <h4 className="font-semibold flex items-center gap-2">
                                <FileText className="w-4 h-4 text-teal-600" />
                                Apenas Texto
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">Ideal para mensagens informativas simples.</p>
                            </div>
                            <div className="border rounded-lg p-4 opacity-50 cursor-not-allowed grayscale">
                              <h4 className="font-semibold flex items-center gap-2">
                                <Layout className="w-4 h-4" />
                                Texto + Mídia
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">Imagens, Vídeos ou Documentos no topo.</p>
                              <Badge variant="outline" className="mt-2 text-[10px]">Em breve</Badge>
                            </div>
                          </div>
                        </div>
                      )}

                      {wizardStep === 3 && (
                        <div className="space-y-4">
                          <Label>Cabeçalho (Opcional)</Label>
                          <Input 
                            placeholder="Título em negrito no topo da mensagem" 
                            onChange={e => {
                              const comps = newTemplate.components.filter((c: any) => c.type !== 'HEADER');
                              if (e.target.value) {
                                comps.push({ type: 'HEADER', format: 'TEXT', text: e.target.value });
                              }
                              setNewTemplate({...newTemplate, components: comps});
                            }}
                          />
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
                                value={newTemplate.components.find((c: any) => c.type === 'BODY')?.text || ''} 
                                onChange={e => {
                                    const comps = [...newTemplate.components];
                                    const bodyIdx = comps.findIndex(c => c.type === 'BODY');
                                    comps[bodyIdx].text = e.target.value;
                                    setNewTemplate({...newTemplate, components: comps});
                                }}
                                placeholder="Olá {{1}}, vimos que você se interessou no {{2}}..." 
                              />
                            </div>
                            <div className="p-3 bg-muted rounded text-xs space-y-2">
                              <p className="font-semibold flex items-center gap-1">
                                <Terminal className="w-3 h-3" /> Dica de Variáveis
                              </p>
                              <p>Use <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code> para dados dinâmicos como nome, marca, valor.</p>
                            </div>
                          </div>

                          <div className="border rounded-xl p-4 bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
                            <div className="flex items-center gap-2 mb-4 border-b pb-2">
                              <Smartphone className="w-4 h-4 text-muted-foreground" />
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Preview WhatsApp</span>
                            </div>
                            <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-sm p-3 relative max-w-[90%] ml-0">
                                <div className="absolute top-2 -left-2 w-0 h-0 border-t-[8px] border-t-transparent border-r-[12px] border-r-white dark:border-r-zinc-800 border-b-[8px] border-b-transparent"></div>
                                {newTemplate.components.find((c: any) => c.type === 'HEADER') && (
                                  <p className="font-bold text-sm mb-1">{newTemplate.components.find((c: any) => c.type === 'HEADER').text}</p>
                                )}
                                <p className="text-sm whitespace-pre-wrap">
                                  {newTemplate.components.find((c: any) => c.type === 'BODY')?.text || 'Digite o conteúdo...'}
                                </p>
                                <p className="text-[10px] text-muted-foreground text-right mt-1">10:45</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {wizardStep === 5 && (
                        <div className="space-y-4">
                          <Label>Rodapé (Opcional)</Label>
                          <Input 
                            placeholder="Texto curto em cinza no final" 
                            onChange={e => {
                              const comps = newTemplate.components.filter((c: any) => c.type !== 'FOOTER');
                              if (e.target.value) {
                                comps.push({ type: 'FOOTER', text: e.target.value });
                              }
                              setNewTemplate({...newTemplate, components: comps});
                            }}
                          />
                        </div>
                      )}

                      {wizardStep === 6 && (
                        <div className="space-y-6">
                          <Label>Botões de Ação</Label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="border rounded-lg p-4 opacity-50 grayscale cursor-not-allowed">
                              <h4 className="font-semibold flex items-center gap-2">
                                <ChevronRight className="w-4 h-4" />
                                Resposta Rápida
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">Até 3 botões de texto.</p>
                            </div>
                            <div className="border rounded-lg p-4 opacity-50 grayscale cursor-not-allowed">
                              <h4 className="font-semibold flex items-center gap-2">
                                <Globe className="w-4 h-4" />
                                Call to Action
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">Botão para Site ou Telefone.</p>
                            </div>
                          </div>
                          <div className="p-4 bg-teal-50 dark:bg-teal-900/10 rounded-lg text-center">
                            <p className="text-xs text-teal-700 dark:text-teal-300">Suporte a botões interativos em breve nesta versão.</p>
                          </div>
                        </div>
                      )}

                      {wizardStep === 7 && (
                        <div className="space-y-4">
                          <div className="p-4 bg-teal-50 dark:bg-teal-900/10 rounded-lg border border-teal-100 dark:border-teal-900/50 flex gap-3">
                            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-teal-900 dark:text-teal-200">Quase lá!</p>
                              <p className="text-xs text-teal-700 dark:text-teal-300 mt-1">
                                O template <strong>{newTemplate.name}</strong> será enviado para análise da Meta agora.
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

                    <DialogFooter>
                      {wizardStep > 1 && <Button variant="outline" onClick={() => setWizardStep(s => s - 1)}>Voltar</Button>}
                      {wizardStep < 7 ? (
                        <Button onClick={() => setWizardStep(s => s + 1)}>Próximo</Button>
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
                    </tr>
                  </thead>
                  <tbody>
                    {templates?.map((t: any) => (
                      <tr key={t.id} className="border-b">
                        <td className="px-4 py-3">{t.nome_interno}</td>
                        <td className="px-4 py-3">{t.categoria}</td>
                        <td className="px-4 py-3">
                          <Badge variant={t.status === 'APPROVED' ? 'success' : 'secondary'}>{t.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{new Date(t.ultima_sincronizacao).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
          
          <TabsContent value="logs" className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Logs do WhatsApp</h2>
              <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['wa-logs'] })}>
                <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
              </Button>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                    <tr>
                      <th className="px-4 py-3">Data/Hora</th>
                      <th className="px-4 py-3">Evento</th>
                      <th className="px-4 py-3">WABA</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {logs?.map((log: any) => (
                      <tr key={log.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 whitespace-nowrap">
                          {new Date(log.criado_em).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {log.event_type}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {log.waba_id}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={log.status === 'PROCESSADO' ? 'success' : 'destructive'}>
                            {log.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm"><Search className="w-4 h-4" /></Button>
                        </td>
                      </tr>
                    ))}
                    {!logs?.length && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                          Nenhum evento recebido recentemente.
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
                      <Badge variant={config?.status === 'CONECTADO' ? 'success' : 'destructive'}>
                        {config?.status === 'CONECTADO' ? '✓ Conectado' : 'Não conectado'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Nome da Empresa (Meta)</Label>
                        <p className="font-semibold">{config?.business_name || '---'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Número Conectado</Label>
                        <p className="font-semibold">{config?.phone_number || '---'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">WABA ID</Label>
                        <p className="font-mono text-xs">{config?.waba_id || '---'}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs uppercase text-muted-foreground">Phone Number ID</Label>
                        <p className="font-mono text-xs">{config?.phone_number_id || '---'}</p>
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
                                value={editingConfig.app_id || ''} 
                                onChange={e => setEditingConfig({...editingConfig, app_id: e.target.value})}
                                placeholder="Ex: 123456789012345"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Meta App Secret</Label>
                              <Input 
                                type="password"
                                value={editingConfig.app_secret || ''} 
                                onChange={e => setEditingConfig({...editingConfig, app_secret: e.target.value})}
                                placeholder="••••••••••••"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>WABA ID</Label>
                              <Input 
                                value={editingConfig.waba_id || ''} 
                                onChange={e => setEditingConfig({...editingConfig, waba_id: e.target.value})}
                                placeholder="WhatsApp Business Account ID"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Phone Number ID</Label>
                              <Input 
                                value={editingConfig.phone_number_id || ''} 
                                onChange={e => setEditingConfig({...editingConfig, phone_number_id: e.target.value})}
                                placeholder="ID do número de telefone"
                              />
                            </div>
                            <div className="col-span-2 space-y-2">
                              <Label>System User Access Token (Permanent)</Label>
                              <Input 
                                type="password"
                                value={editingConfig.access_token || ''} 
                                onChange={e => setEditingConfig({...editingConfig, access_token: e.target.value})}
                                placeholder="EAABw..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Graph API Version</Label>
                              <Input 
                                value={editingConfig.graph_api_version || 'v20.0'} 
                                onChange={e => setEditingConfig({...editingConfig, graph_api_version: e.target.value})}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsConfigOpen(false)}>Cancelar</Button>
                            <Button className="bg-teal-600 hover:bg-teal-700" onClick={handleSaveConfig}>Salvar e Validar</Button>
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
                    <CardDescription>Configure estas URLs no Painel de Desenvolvedor da Meta</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label>Callback URL</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/public/webhooks/whatsapp`} className="font-mono text-xs bg-muted" />
                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(`${window.location.origin}/api/public/webhooks/whatsapp`)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Verify Token</Label>
                      <div className="flex gap-2">
                        <Input readOnly type={webhookTokenGerado ? "text" : "password"} value={webhookTokenGerado || config?.webhook_verify_token || ''} className="font-mono text-xs bg-muted" />
                        <Button variant="ghost" size="icon" onClick={() => copyToClipboard(webhookTokenGerado || config?.webhook_verify_token || '')}>
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleGerarToken}>Gerar Novo</Button>
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
                          {logs && Array.isArray(logs) && logs.length > 0 && (logs[0] as any).criado_em 
                            ? new Date((logs[0] as any).criado_em).toLocaleTimeString() 
                            : 'Nenhum'}
                        </p>
                      </div>
                      <div className="space-y-1 text-right">
                         <Button variant="link" className="h-auto p-0 text-teal-600" onClick={() => {}}>Ver Documentação Meta</Button>
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
                        <Badge variant={config?.waba_id ? 'success' : 'destructive'}>
                          {config?.waba_id ? 'Encontrada' : 'Ausente'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Número</span>
                        <Badge variant={config?.phone_number ? 'success' : 'destructive'}>
                          {config?.phone_number ? 'Ativo' : 'Inativo'}
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
                    <p>• Access Token e App Secret são armazenados de forma criptografada no banco de dados.</p>
                    <p>• O navegador nunca recebe os tokens completos após o salvamento.</p>
                    <p>• Toda comunicação com a API da Meta é feita exclusivamente via servidor.</p>
                  </CardContent>
                </Card>

                <div className="p-4 border border-dashed rounded-lg text-center space-y-2">
                  <Terminal className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
                  <p className="text-xs text-muted-foreground">Modo Desenvolvedor</p>
                  <Button variant="ghost" size="sm" className="text-[10px] h-7">Ver JSON de Resposta</Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Automações */}
          <TabsContent value="automacoes" className="mt-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Automações WhatsApp</h2>
                <p className="text-sm text-muted-foreground">Mensagens disparadas automaticamente por eventos do sistema</p>
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
                    <DialogDescription>Configure disparos automáticos baseados em eventos</DialogDescription>
                  </DialogHeader>

                  <div className="py-6 space-y-6">
                    {automacaoStep === 1 && (
                      <div className="space-y-4">
                        <Label>Selecione o Evento Gatilho</Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[
                            { id: 'VEICULO_PUBLICADO', label: 'Veículo Publicado', icon: Car },
                            { id: 'LANCE_SUPERADO', label: 'Lance Superado', icon: Zap },
                            { id: 'VISTORIA_AGENDADA', label: 'Vistoria Agendada', icon: Clock },
                            { id: 'PAGAMENTO_CONFIRMADO', label: 'Pagamento Confirmado', icon: CheckCircle2 },
                          ].map((ev) => (
                            <Card 
                              key={ev.id}
                              className={cn(
                                "cursor-pointer border-2 hover:border-teal-500 transition-all",
                                novaAutomacao.evento === ev.id ? "border-teal-600 bg-teal-50" : "border-slate-200"
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
                            setNovaAutomacao({...novaAutomacao, publico: val});
                            setAutomacaoStep(3);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o destinatário" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="VENDEDOR">Vendedor</SelectItem>
                            <SelectItem value="COMPRADOR_VENCEDOR">Comprador Vencedor</SelectItem>
                            <SelectItem value="COMPRADOR_PARTICIPANTE">Comprador Participante</SelectItem>
                            <SelectItem value="COMPRADOR_SUPERADO">Comprador Superado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {automacaoStep === 3 && (
                      <div className="space-y-4">
                        <Label>Escolha o Template</Label>
                        <div className="grid grid-cols-1 gap-3">
                          {templates?.map((t: any) => (
                            <Card 
                              key={t.id}
                              className={cn(
                                "cursor-pointer border-2 hover:border-teal-500 transition-all",
                                novaAutomacao.template_id === t.id ? "border-teal-600 bg-teal-50" : "border-slate-200"
                              )}
                              onClick={() => {
                                setNovaAutomacao({ ...novaAutomacao, template_id: t.id });
                                setAutomacaoStep(4);
                              }}
                            >
                              <CardContent className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <LayoutTemplate className="w-5 h-5 text-muted-foreground" />
                                  <div>
                                    <p className="font-medium">{t.meta_name}</p>
                                    <p className="text-xs text-muted-foreground">{t.categoria} • {t.idioma}</p>
                                  </div>
                                </div>
                                <Badge variant={t.status === 'APPROVED' ? 'default' : 'secondary'} className={cn(t.status === 'APPROVED' ? 'bg-green-500' : '')}>
                                  {t.status}
                                </Badge>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {automacaoStep >= 4 && (
                      <div className="text-center py-10 space-y-4">
                        <CheckCircle2 className="w-16 h-16 text-teal-600 mx-auto" />
                        <h3 className="text-xl font-bold">Quase lá!</h3>
                        <p className="text-muted-foreground">O motor de automações cuidará do preenchimento das variáveis e elegibilidade.</p>
                        <Button onClick={handleSalvarAutomacao} className="bg-teal-600">Concluir e Salvar como Rascunho</Button>
                      </div>
                    )}
                  </div>

                  <DialogFooter className="flex justify-between border-t pt-4">
                    <Button variant="outline" onClick={() => setAutomacaoStep(prev => Math.max(1, prev - 1))} disabled={automacaoStep === 1}>
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
                      <Badge variant={auto.status === 'ATIVA' ? 'default' : 'secondary'} className={cn(
                        auto.status === 'ATIVA' ? 'bg-green-500' : 
                        auto.status === 'PAUSADA' ? 'bg-amber-500 text-white' : ''
                      )}>
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
                        <Button variant="ghost" size="icon" className="h-7 w-7"><FileEdit className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600"><Pause className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {(!automacoes || automacoes.length === 0) && (
                <div className="col-span-full py-12 text-center border-2 border-dashed rounded-xl space-y-3">
                  <Zap className="w-12 h-12 mx-auto text-muted-foreground opacity-20" />
                  <p className="text-muted-foreground">Nenhuma automação configurada</p>
                  <Button variant="outline" size="sm" onClick={() => setIsAutomacaoWizardOpen(true)}>Criar Primeira Automação</Button>
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
                        <span className="text-sm font-medium">{exec.destinatario_nome || 'N/A'}</span>
                        <Badge variant={exec.status === 'ENVIADO' ? 'default' : 'destructive'} className="text-[10px]">
                          {exec.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{new Date(exec.criado_em).toLocaleString()}</span>
                        <span>{exec.mensagem_status || 'Pendente'}</span>
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

