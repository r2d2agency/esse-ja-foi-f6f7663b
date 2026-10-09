import { createFileRoute } from '@tanstack/react-router';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  Send,
  MoreVertical,
  User,
  Clock,
  Filter,
  CheckCircle2,
  CheckCheck,
  AlertCircle,
  Hash,
  Car,
  ChevronRight,
  Info,
  Paperclip,
  Smile,
  Mic,
  History,
  Tag,
  Users,
  CornerDownRight,
  FileText,
  StickyNote,
  MessageSquare,
  Edit3,
  Trash2,
  X,
  Check,
  Loader2,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import {
  listarConversasFn,
  getConversaCompletaFn,
  enviarMensagemAtendenteFn,
  definirApelidoFn,
  resolverConversaFn,
  listarRespostasProntasFn,
  salvarRespostaProntaFn,
  excluirRespostaProntaFn,
  listarContatosDisponiveisFn,
  iniciarConversaFn,
} from '@/lib/conversas.functions';
import { listarTemplatesFn } from '@/lib/comunicacoes.functions';
import { getSessionToken } from '@/lib/session';
import { toast } from 'sonner';

export const Route = createFileRoute('/admin/conversas')({
  component: CentralConversasPage,
});

function CentralConversasPage() {
  const queryClient = useQueryClient();
  const listarConversas = useServerFn(listarConversasFn);
  const getConversa = useServerFn(getConversaCompletaFn);
  const enviarMsg = useServerFn(enviarMensagemAtendenteFn);
  const definirApelido = useServerFn(definirApelidoFn);
  const resolverConversa = useServerFn(resolverConversaFn);
  const getRespostasProntas = useServerFn(listarRespostasProntasFn);
  const salvarResposta = useServerFn(salvarRespostaProntaFn);
  const excluirResposta = useServerFn(excluirRespostaProntaFn);
  const getTemplates = useServerFn(listarTemplatesFn);
  const getContatos = useServerFn(listarContatosDisponiveisFn);
  const iniciarConversa = useServerFn(iniciarConversaFn);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useState({ status: 'TODAS' });
  const [mensagem, setMensagem] = useState('');
  const [tabTipo, setTabTipo] = useState<'RESPONDER' | 'NOTA'>('RESPONDER');
  const [editandoApelido, setEditandoApelido] = useState(false);
  const [apelidoTemp, setApelidoTemp] = useState('');
  const [pickerTemplate, setPickerTemplate] = useState(false);
  const [novaResposta, setNovaResposta] = useState(false);
  const [menuRespostaAberto, setMenuRespostaAberto] = useState(false);
  const [filtroResposta, setFiltroResposta] = useState('');
  // Diálogo "Nova conversa": escolher contato e o template de abertura.
  const [novaConversa, setNovaConversa] = useState(false);
  const [contatoBusca, setContatoBusca] = useState('');
  const [contatoSelecionado, setContatoSelecionado] = useState<any>(null);
  const [templateAbertura, setTemplateAbertura] = useState('');

  const token = getSessionToken();

  const filtrosQuery = useMemo(
    () => ({ status: filtros.status, ...(busca.trim() ? { busca: busca.trim() } : {}) }),
    [filtros.status, busca],
  );

  const { data: conversas } = useQuery({
    queryKey: ['conversas', filtrosQuery],
    queryFn: () => listarConversas({ data: filtrosQuery }),
    refetchInterval: 5000,
  });

  const { data: conversaAtiva } = useQuery({
    queryKey: ['conversa', selectedId],
    queryFn: () => getConversa({ data: selectedId! }),
    enabled: !!selectedId,
    refetchInterval: 3000,
  });

  const { data: templates } = useQuery({
    queryKey: ['templates-ativos'],
    queryFn: () => getTemplates(),
  });

  const { data: respostasProntas } = useQuery({
    queryKey: ['respostas-prontas'],
    queryFn: () => getRespostasProntas({ data: { token } }),
  });

  // Só busca contatos com o diálogo aberto — evita varrer `profiles` a cada render.
  const { data: contatos, isLoading: carregandoContatos } = useQuery({
    queryKey: ['contatos-disponiveis', contatoBusca.trim()],
    queryFn: () => getContatos({ data: { busca: contatoBusca.trim() || null } }),
    enabled: novaConversa,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversaAtiva?.mensagens]);

  const mutationEnviar = useMutation({
    mutationFn: (payload: any) =>
      enviarMsg({ data: { token, conversaId: selectedId, payload } }),
    onSuccess: () => {
      setMensagem('');
      queryClient.invalidateQueries({ queryKey: ['conversa', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['conversas'] });
    },
    onError: (err) => toast.error(`Erro ao enviar: ${err.message}`),
  });

  const mutationApelido = useMutation({
    mutationFn: () =>
      definirApelido({ data: { token, conversaId: selectedId!, apelido: apelidoTemp } }),
    onSuccess: () => {
      setEditandoApelido(false);
      queryClient.invalidateQueries({ queryKey: ['conversa', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['conversas'] });
      toast.success('Apelido salvo');
    },
    onError: (err) => toast.error(`Erro ao salvar apelido: ${err.message}`),
  });

  const mutationResolver = useMutation({
    mutationFn: () => resolverConversa({ data: { token, conversaId: selectedId! } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversa', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['conversas'] });
      toast.success('Conversa resolvida');
    },
    onError: (err) => toast.error(`Erro ao resolver: ${err.message}`),
  });

  const mutationSalvarResposta = useMutation({
    mutationFn: (dados: any) => salvarResposta({ data: { token, ...dados } }),
    onSuccess: () => {
      setNovaResposta(false);
      queryClient.invalidateQueries({ queryKey: ['respostas-prontas'] });
      toast.success('Resposta rápida salva');
    },
    onError: (err) => toast.error(`Erro ao salvar resposta: ${err.message}`),
  });

  const mutationExcluirResposta = useMutation({
    mutationFn: (id: string) => excluirResposta({ data: { token, id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['respostas-prontas'] });
      toast.success('Resposta rápida excluída');
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err.message}`),
  });

  const mutationIniciarConversa = useMutation({
    mutationFn: (dados: { telefone: string; nome?: string | null; template_name: string }) =>
      iniciarConversa({ data: { token, ...dados } }),
    onSuccess: (res: any) => {
      setNovaConversa(false);
      setContatoSelecionado(null);
      setContatoBusca('');
      setTemplateAbertura('');
      queryClient.invalidateQueries({ queryKey: ['conversas'] });
      queryClient.invalidateQueries({ queryKey: ['conversa', res?.conversaId] });
      if (res?.conversaId) setSelectedId(res.conversaId);
      toast.success('Conversa iniciada');
    },
    onError: (err) => toast.error(`Erro ao iniciar conversa: ${err.message}`),
  });

  const handleEnviar = () => {
    if (!mensagem.trim()) return;
    if (tabTipo === 'NOTA') {
      mutationEnviar.mutate({
        tipo: 'NOTA_INTERNA',
        conteudo: { text: { body: mensagem } },
      });
    } else {
      mutationEnviar.mutate({
        tipo: 'TEXTO',
        conteudo: { text: { body: mensagem } },
      });
    }
  };

  const enviarTemplateSelecionado = (template: any) => {
    setPickerTemplate(false);
    setTabTipo('RESPONDER');
    setMensagem('');
    const nome = template.meta_name || template.nome_interno;
    mutationEnviar.mutate({
      tipo: 'TEMPLATE',
      template_name: nome,
      idioma: template.language || 'pt_BR',
    });
  };

  const inserirResposta = (r: any) => {
    setMensagem((prev) => {
      // Substitui a palavra "/alguma" atual pelo conteúdo da resposta rápida
      const match = prev.match(/(?:^|\s)\/\S*$/);
      if (!match) return prev + r.conteudo;
      const antes = prev.slice(0, prev.length - match[0].length);
      const prefixo = match[0].startsWith(' ') ? ' ' : '';
      return antes + prefixo + r.conteudo;
    });
    setMenuRespostaAberto(false);
  };

  const handleSalvarApelido = () => {
    mutationApelido.mutate();
  };

  const janelaAberta = conversaAtiva?.janela_aberta ?? false;

  const respostasFiltradas = useMemo(() => {
    if (!respostasProntas || !filtroResposta) return [];
    const termo = filtroResposta.toLowerCase();
    return (respostasProntas as any[]).filter(
      (r) => r.atalho.toLowerCase().includes(termo) || r.titulo?.toLowerCase().includes(termo)
    );
  }, [respostasProntas, filtroResposta]);

  return (
    <div className="flex h-[calc(100vh-12rem)] overflow-hidden bg-white border rounded-xl shadow-sm">
      {/* Coluna 1: Lista */}
      <div className="w-80 flex-shrink-0 border-r flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">Conversas</h2>
            <Button
              size="sm"
              className="h-7 text-xs bg-teal-600 hover:bg-teal-700 gap-1"
              onClick={() => setNovaConversa(true)}
            >
              <Plus className="w-3 h-3" />
              Nova conversa
            </Button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar conversa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 bg-slate-50 border-none"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {['Todas', 'Não lidas', 'NOVA', 'EM_ATENDIMENTO', 'AGUARDANDO_CLIENTE', 'RESOLVIDAS'].map((f) => (
              <Badge
                key={f}
                variant={filtros.status === f ? 'default' : 'outline'}
                className="cursor-pointer whitespace-nowrap text-[10px]"
                onClick={() => setFiltros({ status: f })}
              >
                {f === 'NOVA' ? 'Novas' : f === 'EM_ATENDIMENTO' ? 'Em atendimento' : f === 'AGUARDANDO_CLIENTE' ? 'Aguardando' : f === 'RESOLVIDAS' ? 'Resolvidas' : f}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversas?.map((c: any) => (
            <div
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={cn(
                'p-4 border-b cursor-pointer hover:bg-slate-50 transition-colors',
                selectedId === c.id ? 'bg-teal-50 border-l-4 border-l-teal-600' : ''
              )}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-semibold text-sm truncate w-40">
                  {c.apelido || c.contato_nome}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {c.ultimo_evento_em
                    ? new Date(c.ultimo_evento_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    : ''}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mb-2">
                {c.ultima_direcao_atendente ? 'Você: ' : ''}
                {c.ultima_mensagem_texto ||
                  (c.ultima_mensagem_tipo === 'TEMPLATE' ? 'Template enviado' : 'Nenhuma mensagem')}
              </p>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full flex-shrink-0',
                      c.janela_aberta ? 'bg-green-500' : 'bg-slate-300'
                    )}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    {c.janela_aberta
                      ? formatarTempoRestanteCurto(c.janela_expira_em)
                      : 'Janela fechada'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-[9px] uppercase">{c.status}</Badge>
                  {c.nao_lidas > 0 && (
                    <Badge className="bg-teal-600 h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px]">
                      {c.nao_lidas}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Coluna 2: Chat */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {selectedId ? (
          <>
            <div className="h-16 border-b bg-white flex items-center justify-between px-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  {editandoApelido ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={apelidoTemp}
                        onChange={(e) => setApelidoTemp(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSalvarApelido();
                          if (e.key === 'Escape') setEditandoApelido(false);
                        }}
                        className="h-6 w-40 text-sm"
                        autoFocus
                      />
                      <button onClick={handleSalvarApelido} className="text-teal-600 hover:text-teal-700">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditandoApelido(false)} className="text-muted-foreground hover:text-slate-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <h3 className="font-bold text-sm">
                        {conversaAtiva?.apelido || conversaAtiva?.contato_nome}
                      </h3>
                      <button
                        onClick={() => {
                          setApelidoTemp(conversaAtiva?.apelido || '');
                          setEditandoApelido(true);
                        }}
                        className="text-muted-foreground hover:text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {janelaAberta ? (
                      <>
                        <Clock className="w-3 h-3 text-green-500" />
                        Janela aberta — expira em {formatarTempoRestanteCurto(conversaAtiva?.janela_expira_em)}
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3 text-red-500" />
                        Janela fechada — apenas templates
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => mutationResolver.mutate()}
                  disabled={mutationResolver.isPending}
                >
                  Resolver
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
              {conversaAtiva?.mensagens?.map((m: any) => {
                const isNota = m.tipo === 'NOTA_INTERNA';
                const isMine = m.enviado_por_atendente;

                if (isNota) {
                  return (
                    <div key={m.id} className="flex justify-center">
                      <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg text-xs max-w-md flex gap-2">
                        <StickyNote className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <p className="font-bold mb-1">Nota Interna — {m.autor_nome || 'Sistema'}</p>
                          <p>{m.payload?.text?.body}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={m.id} className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[70%] rounded-2xl p-4 shadow-sm relative group',
                        isMine ? 'bg-teal-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none'
                      )}
                    >
                      <p className="text-sm leading-relaxed">
                        {m.tipo === 'TEMPLATE' || m.payload?.tipo === 'TEMPLATE' ? (
                          <>
                            <FileText className="w-3 h-3 inline mr-1" />
                            Template enviado: {m.payload?.template_name}
                          </>
                        ) : (
                          m.payload?.text?.body || 'Arquivo recebido'
                        )}
                      </p>
                      <div
                        className={cn(
                          'flex items-center gap-1 mt-1 text-[9px]',
                          isMine ? 'text-teal-100' : 'text-muted-foreground'
                        )}
                      >
                        <span>
                          {m.criado_em
                            ? new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </span>
                        {isMine && (m.lido_em ? <CheckCheck className="w-2.5 h-2.5" /> : m.entregue_em ? <CheckCircle2 className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5 opacity-50" />)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-white border-t space-y-3">
              {tabTipo === 'RESPONDER' && !janelaAberta && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Janela de 24h fechada. Envie um template para reabrir o atendimento.</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100"
                    onClick={() => setPickerTemplate(true)}
                  >
                    Abrir template
                  </Button>
                </div>
              )}
              <div className="flex gap-4 border-b pb-2">
                <button
                  onClick={() => setTabTipo('RESPONDER')}
                  className={cn('text-xs font-bold pb-1', tabTipo === 'RESPONDER' ? 'text-teal-600 border-b-2 border-teal-600' : 'text-muted-foreground')}
                >
                  Responder
                </button>
                <button
                  onClick={() => setTabTipo('NOTA')}
                  className={cn('text-xs font-bold pb-1', tabTipo === 'NOTA' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-muted-foreground')}
                >
                  Nota Interna
                </button>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <Textarea
                    placeholder={
                      tabTipo === 'RESPONDER'
                        ? janelaAberta
                          ? 'Digite sua mensagem... (use / para respostas rápidas)'
                          : 'Janela fechada — use um template'
                        : 'Anotação interna (não enviada ao cliente)'
                    }
                    value={mensagem}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setMensagem(valor);
                      // Abre o menu de respostas rápidas quando a palavra atual começa com "/"
                      const match = valor.match(/(?:^|\s)\/(\S*)$/);
                      setMenuRespostaAberto(!!match);
                      setFiltroResposta(match ? match[1] : '');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (menuRespostaAberto && respostasFiltradas.length > 0) {
                          inserirResposta(respostasFiltradas[0]);
                        } else {
                          handleEnviar();
                        }
                      } else if (e.key === 'Escape' && menuRespostaAberto) {
                        setMenuRespostaAberto(false);
                      } else if (e.key === 'Tab' && menuRespostaAberto && respostasFiltradas.length > 0) {
                        e.preventDefault();
                        inserirResposta(respostasFiltradas[0]);
                      }
                    }}
                    disabled={tabTipo === 'RESPONDER' && !janelaAberta}
                    className={cn(
                      'min-h-[80px] resize-none pr-10',
                      tabTipo === 'NOTA' ? 'bg-amber-50 border-amber-200 focus-visible:ring-amber-500' : '',
                      tabTipo === 'RESPONDER' && !janelaAberta ? 'opacity-50 cursor-not-allowed' : ''
                    )}
                  />
                  {menuRespostaAberto && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border rounded-lg shadow-lg overflow-hidden z-10">
                      {respostasFiltradas.length > 0 ? (
                        respostasFiltradas.slice(0, 6).map((r: any) => (
                          <button
                            key={r.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              inserirResposta(r);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-xs"
                          >
                            <span className="font-mono font-bold text-teal-600">/{r.atalho}</span>
                            <span className="text-muted-foreground truncate">{r.titulo || r.conteudo}</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          Nenhuma resposta rápida para "/{filtroResposta}"
                        </p>
                      )}
                    </div>
                  )}
                  <div className="absolute right-3 bottom-3 flex gap-2">
                    <button className="text-muted-foreground hover:text-teal-600"><Paperclip className="w-4 h-4" /></button>
                    <button className="text-muted-foreground hover:text-teal-600"><Smile className="w-4 h-4" /></button>
                  </div>
                </div>
                <Button
                  onClick={handleEnviar}
                  disabled={!mensagem.trim() || mutationEnviar.isPending || (tabTipo === 'RESPONDER' && !janelaAberta)}
                  className={cn(
                    'h-12 w-12 rounded-full',
                    tabTipo === 'NOTA' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'
                  )}
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-30">
            <MessageSquare className="w-20 h-20 mb-4" />
            <p className="text-xl font-medium">Selecione uma conversa para começar</p>
          </div>
        )}
      </div>

      {/* Coluna 3: Contexto */}
      {selectedId && conversaAtiva && (
        <div className="w-80 flex-shrink-0 border-l overflow-y-auto p-6 space-y-8 bg-slate-50/50">
          <div className="space-y-4">
            <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">CONTATO</h4>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                {conversaAtiva.contato_nome?.charAt(0)}
              </div>
              <div>
                <h5 className="font-bold text-sm">{conversaAtiva.contato_nome}</h5>
                <p className="text-xs text-muted-foreground">{conversaAtiva.contato_telefone}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-white">{conversaAtiva.contato_role}</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-8"
              onClick={() => window.location.href = `/admin/vendedor/${conversaAtiva.contato_id}`}
            >
              Ver Perfil Completo
            </Button>
          </div>

          {conversaAtiva.veiculo_marca && (
            <div className="space-y-4 pt-6 border-t">
              <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Veículo Relacionado</h4>
              <div className="bg-white p-3 rounded-lg border shadow-sm space-y-3">
                <div className="flex gap-3">
                  <div className="w-12 h-12 bg-slate-100 rounded-md flex items-center justify-center">
                    <Car className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold">{conversaAtiva.veiculo_marca} {conversaAtiva.veiculo_modelo}</p>
                    <p className="text-[10px] text-muted-foreground">Placa: {conversaAtiva.veiculo_placa}</p>
                  </div>
                </div>
                <Badge className="w-full justify-center bg-teal-600">Lance Ativo</Badge>
                <Button variant="ghost" size="sm" className="w-full text-xs h-7">Ver Veículo</Button>
              </div>
            </div>
          )}

          <div className="space-y-4 pt-6 border-t">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Respostas Rápidas</h4>
              <button
                onClick={() => setNovaResposta(true)}
                className="text-teal-600 hover:text-teal-700"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {respostasProntas?.map((r: any) => (
                <div
                  key={r.id}
                  className="bg-white border rounded-lg p-2 text-xs flex items-start justify-between gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">/{r.atalho} — {r.titulo}</p>
                    <p className="text-muted-foreground truncate">{r.conteudo}</p>
                  </div>
                  <button
                    onClick={() => mutationExcluirResposta.mutate(r.id)}
                    className="text-muted-foreground hover:text-red-600 flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {(!respostasProntas || respostasProntas.length === 0) && (
                <p className="text-xs text-muted-foreground">Nenhuma resposta rápida cadastrada.</p>
              )}
            </div>
          </div>

          <div className="pt-6 border-t">
            <Button variant="ghost" className="w-full text-xs text-muted-foreground h-8 justify-between">
              Vincular Novo Contexto
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialog: Picker de Templates */}
      <Dialog open={pickerTemplate} onOpenChange={setPickerTemplate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar Template</DialogTitle>
            <DialogDescription>
              Selecione um template aprovado para reabrir o atendimento com este contato.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {templates?.map((t: any) => (
              <button
                key={t.id}
                onClick={() => enviarTemplateSelecionado(t)}
                className="w-full text-left p-3 border rounded-lg hover:bg-slate-50 transition-colors"
              >
                <p className="text-xs font-bold">{t.meta_name}</p>
                <p className="text-[10px] text-muted-foreground">{t.status} — {t.language}</p>
              </button>
            ))}
            {(!templates || templates.length === 0) && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhum template cadastrado.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerTemplate(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nova Resposta Rápida */}
      <Dialog open={novaResposta} onOpenChange={setNovaResposta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Resposta Rápida</DialogTitle>
            <DialogDescription>
              Cadastre um atalho para responder rapidamente com /.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Atalho</label>
              <Input placeholder="ex: oi" id="atalho" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Título</label>
              <Input placeholder="ex: Saudação" id="titulo" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Conteúdo</label>
              <Textarea placeholder="Texto da resposta..." id="conteudo" className="mt-1 min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaResposta(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const atalho = (document.getElementById('atalho') as HTMLInputElement)?.value?.trim();
                const titulo = (document.getElementById('titulo') as HTMLInputElement)?.value?.trim();
                const conteudo = (document.getElementById('conteudo') as HTMLTextAreaElement)?.value?.trim();
                if (!atalho || !conteudo) {
                  toast.error('Preencha ao menos o atalho e o conteúdo.');
                  return;
                }
                mutationSalvarResposta.mutate({ atalho, titulo, conteudo });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nova Conversa */}
      <Dialog open={novaConversa} onOpenChange={setNovaConversa}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
            <DialogDescription>
              Escolha o contato e o template de abertura. Como a janela de 24h só
              se abre quando o contato responde, o primeiro contato precisa ser
              por template aprovado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Contato</label>
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={contatoBusca}
                onChange={(e) => setContatoBusca(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="border rounded-lg max-h-52 overflow-y-auto divide-y">
              {carregandoContatos ? (
                <p className="text-xs text-muted-foreground p-3">Carregando contatos...</p>
              ) : !contatos?.length ? (
                <p className="text-xs text-muted-foreground p-3">
                  Nenhum contato com telefone encontrado.
                </p>
              ) : (
                contatos.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => setContatoSelecionado(c)}
                    className={`w-full text-left p-3 transition-colors ${
                      contatoSelecionado?.id === c.id
                        ? 'bg-teal-50 border-l-2 border-l-teal-600'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-bold">{c.nome}</p>
                    <p className="text-[10px] text-muted-foreground">{c.telefone}</p>
                    {c.conversa_aberta_id && (
                      <p className="text-[10px] text-teal-700">Já possui conversa aberta</p>
                    )}
                  </button>
                ))
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Template de abertura</label>
              <div className="border rounded-lg max-h-44 overflow-y-auto divide-y mt-1">
                {!templates?.length ? (
                  <p className="text-xs text-muted-foreground p-3">
                    Nenhum template disponível. Cadastre um template aprovado antes.
                  </p>
                ) : (
                  templates.map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => setTemplateAbertura(t.meta_name || t.nome_interno)}
                      className={`w-full text-left p-3 transition-colors ${
                        templateAbertura === (t.meta_name || t.nome_interno)
                          ? 'bg-teal-50 border-l-2 border-l-teal-600'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-xs font-bold">{t.meta_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t.status} — {t.language}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaConversa(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!contatoSelecionado || !templateAbertura}
              onClick={() =>
                mutationIniciarConversa.mutate({
                  telefone: contatoSelecionado.telefone,
                  nome: contatoSelecionado.nome,
                  template_name: templateAbertura,
                })
              }
            >
              Iniciar conversa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatarTempoRestanteCurto(fim: string | null | undefined): string {
  if (!fim) return '—';
  const alvo = new Date(fim).getTime();
  const diff = alvo - Date.now();
  if (diff <= 0) return 'Fechada';
  const horas = Math.floor(diff / 3600000);
  const minutos = Math.floor((diff % 3600000) / 60000);
  if (horas >= 1) return `${horas}h ${minutos}m restantes`;
  return `${minutos}m restantes`;
}
