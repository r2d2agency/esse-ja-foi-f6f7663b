import { createFileRoute } from '@tanstack/react-router';
import React, { useState, useEffect, useRef } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Plus,
  Search, 
  Send, 
  MoreVertical, 
  User, 
  Clock, 
  Filter, 
  CheckCircle2, 
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
  StickyNote
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { 
  listarConversasFn, 
  getConversaCompletaFn, 
  enviarMensagemAtendenteFn 
} from '@/lib/conversas.functions';
import { listarTemplatesFn } from '@/lib/comunicacoes.functions';
import { toast } from 'sonner';

export const Route = createFileRoute('/admin/conversas')({
  component: CentralConversasPage,
});

function CentralConversasPage() {
  const queryClient = useQueryClient();
  const listarConversas = useServerFn(listarConversasFn);
  const getConversa = useServerFn(getConversaCompletaFn);
  const enviarMsg = useServerFn(enviarMensagemAtendenteFn);
  const getTemplates = useServerFn(listarTemplatesFn);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtros, setFiltros] = useState({ status: 'TODAS' });
  const [mensagem, setMensagem] = useState('');
  const [tabTipo, setTabTipo] = useState<'RESPONDER' | 'NOTA'>('RESPONDER');
  
  const { data: conversas } = useQuery({
    queryKey: ['conversas', filtros],
    queryFn: () => listarConversas({ data: filtros }),
    refetchInterval: 5000
  });

  const { data: conversaAtiva } = useQuery({
    queryKey: ['conversa', selectedId],
    queryFn: () => getConversa({ data: selectedId! }),
    enabled: !!selectedId,
    refetchInterval: 3000
  });

  const { data: templates } = useQuery({
    queryKey: ['templates-ativos'],
    queryFn: () => getTemplates()
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversaAtiva?.mensagens]);

  const mutationEnviar = useMutation({
    mutationFn: (payload: any) => enviarMsg({ data: { conversaId: selectedId, payload } }),
    onSuccess: () => {
      setMensagem('');
      queryClient.invalidateQueries({ queryKey: ['conversa', selectedId] });
    },
    onError: (err) => toast.error(`Erro ao enviar: ${err.message}`)
  });

  const handleEnviar = () => {
    if (!mensagem.trim()) return;
    mutationEnviar.mutate({
      tipo: tabTipo === 'RESPONDER' ? 'MENSAGEM' : 'NOTA_INTERNA',
      conteudo: { text: { body: mensagem } }
    });
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] overflow-hidden bg-white border rounded-xl shadow-sm">

        
        {/* Coluna 1: Lista */}
        <div className="w-80 flex-shrink-0 border-r flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar conversa..." className="pl-9 bg-slate-50 border-none" />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {['Todas', 'Não lidas', 'Minhas', 'Resolvidas'].map(f => (
                <Badge 
                  key={f}
                  variant={filtros.status === f ? 'default' : 'outline'} 
                  className="cursor-pointer whitespace-nowrap"
                  onClick={() => setFiltros({ status: f })}
                >
                  {f}
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
                  "p-4 border-b cursor-pointer hover:bg-slate-50 transition-colors",
                  selectedId === c.id ? "bg-teal-50 border-l-4 border-l-teal-600" : ""
                )}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-sm truncate w-40">{c.contato_nome}</span>
                  <span className="text-[10px] text-muted-foreground">18:42</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mb-2">{c.ultima_mensagem_preview || 'Nenhuma mensagem'}</p>
                <div className="flex justify-between items-center">
                  <Badge variant="outline" className="text-[9px] uppercase">{c.contato_role}</Badge>
                  {c.nao_lidas > 0 && (
                    <Badge className="bg-teal-600 h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px]">
                      {c.nao_lidas}
                    </Badge>
                  )}
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
                    <h3 className="font-bold text-sm">{conversaAtiva?.contato_nome}</h3>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Respondeu há 12 min
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 text-xs">Resolver</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
                {conversaAtiva?.mensagens?.map((m: any) => {
                  const isNota = m.tipo === 'NOTA_INTERNA';
                  const isMine = m.status === 'ENVIADA';
                  
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
                    <div key={m.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[70%] rounded-2xl p-4 shadow-sm relative group",
                        isMine ? "bg-teal-600 text-white rounded-tr-none" : "bg-white text-slate-800 rounded-tl-none"
                      )}>
                        <p className="text-sm leading-relaxed">{m.payload?.text?.body || 'Arquivo recebido'}</p>
                        <div className={cn(
                          "flex items-center gap-1 mt-1 text-[9px]",
                          isMine ? "text-teal-100" : "text-muted-foreground"
                        )}>
                          <span>18:42</span>
                          {isMine && <CheckCircle2 className="w-2.5 h-2.5" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-white border-t space-y-3">
                <div className="flex gap-4 border-b pb-2">
                  <button 
                    onClick={() => setTabTipo('RESPONDER')}
                    className={cn("text-xs font-bold pb-1", tabTipo === 'RESPONDER' ? "text-teal-600 border-b-2 border-teal-600" : "text-muted-foreground")}
                  >
                    Responder
                  </button>
                  <button 
                    onClick={() => setTabTipo('NOTA')}
                    className={cn("text-xs font-bold pb-1", tabTipo === 'NOTA' ? "text-amber-600 border-b-2 border-amber-600" : "text-muted-foreground")}
                  >
                    Nota Interna
                  </button>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1 relative">
                    <Textarea 
                      placeholder={tabTipo === 'RESPONDER' ? "Digite sua mensagem..." : "Anotação interna (não enviada ao cliente)"}
                      value={mensagem}
                      onChange={(e) => setMensagem(e.target.value)}
                      className={cn(
                        "min-h-[80px] resize-none pr-10",
                        tabTipo === 'NOTA' ? "bg-amber-50 border-amber-200 focus-visible:ring-amber-500" : ""
                      )}
                    />
                    <div className="absolute right-3 bottom-3 flex gap-2">
                      <button className="text-muted-foreground hover:text-teal-600"><Paperclip className="w-4 h-4" /></button>
                      <button className="text-muted-foreground hover:text-teal-600"><Smile className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <Button 
                    onClick={handleEnviar}
                    disabled={!mensagem.trim() || mutationEnviar.isPending}
                    className={cn(
                      "h-12 w-12 rounded-full",
                      tabTipo === 'NOTA' ? "bg-amber-600 hover:bg-amber-700" : "bg-teal-600 hover:bg-teal-700"
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
              <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Contato</h4>
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
                <Badge className="bg-green-500">Aprovado</Badge>
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs h-8">Ver Perfil Completo</Button>
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
              <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Histórico Recente</h4>
              <div className="space-y-4">
                {[
                  { icon: Hash, label: 'Participou do lance', date: '18/08' },
                  { icon: AlertCircle, label: 'Lance superado', date: '18/08' },
                  { icon: Send, label: 'Enviou mensagem', date: '18/08' },
                ].map((item, i) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center">
                      <item.icon className="w-3 h-3 text-slate-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground">{item.date}</p>
                    </div>
                  </div>
                ))}
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
      </div>
  );
}


import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';
