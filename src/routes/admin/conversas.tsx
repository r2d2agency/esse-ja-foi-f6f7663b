import { createFileRoute, Link } from '@tanstack/react-router';
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
  Image as ImageIcon,
  Video,
  MapPin,
  ScrollText,
  UserCog,
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
  repararNomesContatosFn,
  cadastrarContatoFn,
  uploadMidiaWhatsAppFn,
} from '@/lib/conversas.functions';
import { listarTemplatesFn } from '@/lib/comunicacoes.functions';
import { toast } from 'sonner';

export const Route = createFileRoute('/admin/conversas')({
  component: CentralConversasPage,
});

/**
 * Rótulo curto do campo: as últimas palavras que vêm **antes** da n-ésima
 * variável. O corpo do template aparece repetido em cada input se mostrarmos o
 * texto inteiro — e o atendente quer ler "Ano", "Modelo", "Preço", não a frase
 * completa seis vezes.
 *
 * Placeholders já resolvidos ({{2}}) e emoji saem do rótulo, porque eles não
 * descrevem o campo. Quando não há nada antes ({{1}}, no início da frase),
 * devolve "" e o componente cai no fallback "Valor N" — adivinhar "Nome" aqui
 * seria chute, já que a variável pode ser qualquer coisa.
 */
function componentesDoTemplate(template: any): any[] {
  const conteudo = template?.conteudo;
  if (Array.isArray(conteudo)) return conteudo;
  if (Array.isArray(conteudo?.components)) return conteudo.components;
  return [];
}

function placeholderDeMensagem(payload: any): React.ReactNode {
  if (!payload) return "Arquivo recebido";
  const tipo = payload.tipo || (payload.image && "IMAGEM") || (payload.audio && "AUDIO");
  switch (tipo) {
    case "TEXTO":
      return payload.text?.body || "Mensagem";
    case "TEMPLATE":
      return `Template: ${payload.template_name || ""}`;
    case "IMAGEM": {
      const url = payload.image?.url || payload.image?.link || "";
      if (url) {
        return (
          <img
            src={url}
            alt={payload.image?.caption || "Imagem"}
            className="max-h-40 rounded-md object-cover"
          />
        );
      }
      const caption = payload.image?.caption?.trim();
      return (
        <span className="flex items-center gap-1.5">
          <ImageIcon className="w-4 h-4 shrink-0" />
          {caption || "Imagem"}
        </span>
      );
    }
    case "VIDEO":
      return (
        <span className="flex items-center gap-1.5">
          <Video className="w-4 h-4 shrink-0" />
          {payload.video?.caption?.trim() || "Vídeo"}
        </span>
      );
    case "AUDIO": {
      const src = payload.audio?.url || payload.audio?.link || "";
      if (src) return <audio controls src={src} className="h-9 max-w-full" />;
      return (
        <span className="flex items-center gap-1.5">
          <Mic className="w-4 h-4 shrink-0" /> Áudio
        </span>
      );
    }
    case "DOCUMENTO": {
      const doc = payload.document || {};
      return (
        <span className="flex items-center gap-1.5">
          <FileText className="w-4 h-4 shrink-0" />
          {doc.filename || "Documento"}
        </span>
      );
    }
    case "STICKER":
      return "Adesivo";
    case "LOCALIZACAO": {
      const loc = payload.location || {};
      return (
        <span className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4 shrink-0" />
          {loc.name || "Localização"}
        </span>
      );
    }
    case "REACAO":
      return `Reagiu ${payload.reaction?.emoji || ""}`.trim();
    case "CONTATO":
      return "Contato compartilhado";
    case "SISTEMA":
      return payload.system?.body || "Sistema";
    default:
      return "Arquivo recebido";
  }
}

/**
 * Conta os placeholders {{n}} do corpo **e** das urls de botão: a numeração
 * corre nos dois, então um template com 6 variáveis no corpo e uma no link
 * precisa de 7 campos — contar só o corpo deixaria o do botão sem input.
 */
function contarVariaveisTemplate(template: any): number {
  const comps = componentesDoTemplate(template);
  let maximo = 0;
  for (const comp of comps) {
    if (comp?.type === "BODY") maximo = Math.max(maximo, contarPlaceholders(comp.text || ""));
    if (comp?.type === "BUTTONS" && Array.isArray(comp.buttons)) {
      for (const b of comp.buttons) {
        if (b?.type === "URL") maximo = Math.max(maximo, contarPlaceholders(b.url || ""));
      }
    }
  }
  return maximo;
}

function contarPlaceholders(texto: string): number {
  const numeros = [...String(texto).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return numeros.length ? Math.max(...numeros) : 0;
}

function contextoDaVariavel(texto: string, numero: number): string {
  const marcador = new RegExp(`\\{\\{${numero}\\}\\}`);
  const idx = texto.search(marcador);
  if (idx <= 0) return "";

  const antes = texto
    .slice(0, idx)
    .replace(/\{\{\d+\}\}/g, "") // tira variáveis já resolvidas
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "") // tira emoji
    .replace(/[*_~]/g, "") // tira marcadores de negrito/itálico da Meta
    .trim();
  if (!antes) return "";

  const palavras = antes
    .split(/\s+/)
    .slice(-3)
    .join(" ")
    .replace(/[,:;.]+$/, "")
    .trim();
  return palavras;
}

/**
 * Campos de variável do template de abertura, no mesmo estilo do "Enviar teste"
 * de Comunicações. A Meta exige um parâmetro por {{n}} do corpo (e de botão URL),
 * na ordem — por isso o atendente preenche aqui em vez de mandar componente vazio.
 */
function VariaveisTemplate({
  template,
  valores,
  onChange,
}: {
  template: any;
  valores: string[];
  onChange: (v: string[]) => void;
}) {
  const comps = Array.isArray(template?.conteudo)
    ? template.conteudo
    : Array.isArray(template?.conteudo?.components)
      ? template.conteudo.components
      : [];

  const campos: { numero: number; contexto: string }[] = [];
  comps.forEach((comp: any) => {
    if (comp?.type === "BODY") {
      for (const m of String(comp.text || "").matchAll(/\{\{(\d+)\}\}/g)) {
        const numero = Number(m[1]);
        campos.push({ numero, contexto: contextoDaVariavel(comp.text, numero) });
      }
    }
    if (comp?.type === "BUTTONS" && Array.isArray(comp.buttons)) {
      comp.buttons.forEach((b: any) => {
        if (b?.type !== "URL") return;
        for (const m of String(b.url || "").matchAll(/\{\{(\d+)\}\}/g)) {
          const numero = Number(m[1]);
          campos.push({ numero, contexto: contextoDaVariavel(b.url, numero) });
        }
      });
    }
  });

  if (!campos.length) return null;

  const unicos = [...new Map(campos.map((c) => [c.numero, c])).values()].sort(
    (a, b) => a.numero - b.numero,
  );

  return (
    <div className="space-y-2 border rounded-lg p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Variáveis de {template?.nome_interno || template?.meta_name}
      </p>
      {unicos.map((c) => (
        <div key={c.numero} className="space-y-1">
          <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <code className="bg-slate-100 px-1 rounded text-[11px] shrink-0">
              {`{{${c.numero}}}`}
            </code>
            {c.contexto ? (
              <span className="truncate" title={c.contexto}>
                {c.contexto}
              </span>
            ) : (
              <span className="truncate">Valor {c.numero}</span>
            )}
          </label>
          <Input
            placeholder={`Preencher ${c.numero}`}
            value={valores[c.numero - 1] ?? ""}
            onChange={(e) => {
              const next = [...valores];
              next[c.numero - 1] = e.target.value;
              onChange(next);
            }}
            className="h-8 text-xs"
          />
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        A Meta exige um valor para cada variável, na ordem.
      </p>
    </div>
  );
}

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
  const cadastrarContato = useServerFn(cadastrarContatoFn);
  const uploadMidia = useServerFn(uploadMidiaWhatsAppFn);
  const repararNomes = useServerFn(repararNomesContatosFn);

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
  // Cadastro de contato novo, para quando a pessoa não está na lista.
  const [novoContato, setNovoContato] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');
  // Template de abertura: o objeto inteiro, para montar os componentes.
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);
  const [variaveisTemplate, setVariaveisTemplate] = useState<string[]>([]);
  // Template escolhido no meio de uma conversa existente: fica pendente até as
  // variáveis serem preenchidas, porque a Meta exige todas.
  const [templateParaEnviar, setTemplateParaEnviar] = useState<any>(null);
  const [variaveisEnvio, setVariaveisEnvio] = useState<string[]>([]);
  // Anexo pendente: o arquivo escolhido ainda não subiu. Fica guardado aqui
  // para o atendente ver o que vai mandar e poder cancelar antes.
  const [anexo, setAnexo] = useState<{
    arquivo: string;
    nome: string;
    tipo: string;
    tamanho: number;
    preview: string;
    legenda: string;
    media_id?: string;
    arquivo_id?: string | null;
    tamanho_meta?: number | null;
  } | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  /**
   * Server functions devolvem `{ok:false, error}` em vez de lançar. Sem esta
   * checagem a mutation tratava a falha como sucesso e o atendente via a
   * mensagem sumir sem nenhum aviso — o erro só existia no log do servidor.
   */
  const exigirOk = (res: any) => {
    if (res && res.ok === false) {
      throw new Error(res.error || "A operação não pôde ser concluída.");
    }
  };

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
    // Falha de banco não pode virar lista vazia e silenciosa: a mensagem já
    // vem com a causa real (SQLSTATE), não com o texto genérico do Drizzle.
    onError: (err: any) =>
      toast.error(`Erro ao carregar os templates: ${err?.message ?? "erro desconhecido"}`),
  });

  const { data: respostasProntas } = useQuery({
    queryKey: ['respostas-prontas'],
    queryFn: () => getRespostasProntas({ data: {} }),
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
    mutationFn: async (payload: any) => {
      const res: any = await enviarMsg({
        data: { conversaId: selectedId, payload },
      });
      exigirOk(res);
      return res;
    },
    onSuccess: () => {
      setMensagem('');
      queryClient.invalidateQueries({ queryKey: ['conversa', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['conversas'] });
    },
    onError: (err) => toast.error(`Erro ao enviar: ${err.message}`),
  });

  const mutationApelido = useMutation({
    mutationFn: async () => {
      const res: any = await definirApelido({
        data: { conversaId: selectedId!, apelido: apelidoTemp },
      });
      exigirOk(res);
      return res;
    },
    onSuccess: () => {
      setEditandoApelido(false);
      queryClient.invalidateQueries({ queryKey: ['conversa', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['conversas'] });
      toast.success('Apelido salvo');
    },
    onError: (err) => toast.error(`Erro ao salvar apelido: ${err.message}`),
  });

  const mutationResolver = useMutation({
    mutationFn: async () => {
      const res: any = await resolverConversa({ data: { conversaId: selectedId! } });
      exigirOk(res);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversa', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['conversas'] });
      toast.success('Conversa resolvida');
    },
    onError: (err) => toast.error(`Erro ao resolver: ${err.message}`),
  });

  // Reparo em massa: puxa os nomes de perfil que a Meta já mandou para os
  // contatos criados como "Contato não identificado".
  const mutationRepararNomes = useMutation({
    mutationFn: async () => {
      const res: any = await repararNomes();
      exigirOk(res);
      return res;
    },
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['conversas'] });
      queryClient.invalidateQueries({ queryKey: ['conversa'] });
      toast.success(
        res?.atualizados > 0
          ? `${res.atualizados} contato(s) atualizado(s) com o nome do WhatsApp.`
          : "Nenhum contato pôde ser atualizado — a Meta ainda não mandou o nome de nenhum deles.",
      );
    },
    onError: (err) => toast.error(`Erro ao reparar: ${err.message}`),
  });

  const mutationSalvarResposta = useMutation({
    mutationFn: async (dados: any) => {
      const res: any = await salvarResposta({ data: { ...dados } });
      exigirOk(res);
      return res;
    },
    onSuccess: () => {
      setNovaResposta(false);
      queryClient.invalidateQueries({ queryKey: ['respostas-prontas'] });
      toast.success('Resposta rápida salva');
    },
    onError: (err) => toast.error(`Erro ao salvar resposta: ${err.message}`),
  });

  const mutationExcluirResposta = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await excluirResposta({ data: { id } });
      exigirOk(res);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['respostas-prontas'] });
      toast.success('Resposta rápida excluída');
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err.message}`),
  });

  const mutationUpload = useMutation({
    mutationFn: async (dados: { arquivo: string; nome: string; tipo: string }) => {
      const res: any = await uploadMidia({ data: { ...dados } });
      exigirOk(res);
      return res;
    },
    onSuccess: (res: any) => {
      if (!anexo) return;
      setAnexo({ ...anexo, media_id: res?.resultado?.media_id ?? res?.media_id, arquivo_id: res?.resultado?.arquivo_id ?? res?.arquivo_id, tamanho: res?.resultado?.tamanho ?? res?.tamanho });
    },
    onError: (err) => toast.error(`Erro ao subir anexo: ${err.message}`),
  });

  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isImage && !isAudio && !isPdf) {
      toast.error('Formato não suportado. Envie imagem, PDF ou áudio.');
      return;
    }
    // A Meta limita envio de mídia a 16 MB; acima disso o Graph API devolve 413.
    if (file.size > 16 * 1024 * 1024) {
      toast.error('O arquivo excede 16 MB (limite da Meta).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setAnexo({
        arquivo: dataUrl,
        nome: file.name,
        tipo: file.type,
        tamanho: file.size,
        preview: isImage ? dataUrl : '',
        legenda: '',
      });
    };
    reader.readAsDataURL(file);
  };

  /**
   * Anexo: sobe para a Meta e envia. O `media_id` só existe depois do upload,
   * então as duas etapas são sequenciais — se a primeira falhar, nada é enviado
   * e o atendente vê o erro no toast, podendo tentar de novo com o arquivo ainda
   * pendente na tela.
   */
  const enviarAnexo = async () => {
    if (!anexo) return;
    const pendente = anexo;
    const tipo = pendente.tipo.startsWith('image/')
      ? 'IMAGEM'
      : pendente.tipo.startsWith('audio/')
        ? 'AUDIO'
        : 'DOCUMENTO';

    try {
      const res: any = await mutationUpload.mutateAsync({
        arquivo: pendente.arquivo,
        nome: pendente.nome,
        tipo: pendente.tipo,
      });
      if (!res?.media_id) throw new Error('A Meta não devolveu o identificador da mídia.');
      setAnexo(null);
      mutationEnviar.mutate({
        tipo,
        conteudo: {
          media_id: res.media_id,
          media_url: null,
          arquivo_id: res.arquivo_id ?? null,
          caption: pendente.legenda.trim() || null,
          filename: pendente.nome,
        },
      });
    } catch {
      // O toast de erro já veio da mutation. O anexo continua na tela.
    }
  };

  /**
   * Cadastra o contato. Não exige template: o cadastro é só o perfil, e o
   * template só importa na hora de enviar a primeira mensagem. Quem quer
   * enviar já escolhe o template no mesmo diálogo; quem só quer cadastrar
   * não precisa ser obrigado a escolher um.
   */
  const mutationCadastrarContato = useMutation({
    mutationFn: async () => {
      const res: any = await cadastrarContato({
        data: { nome: novoNome, telefone: novoTelefone },
      });
      exigirOk(res);
      return res;
    },
    onSuccess: (res: any) => {
      const perfil = {
        id: res?.resultado?.id ?? res?.id,
        nome: novoNome.trim(),
        telefone: novoTelefone,
      };
      setNovoContato(false);
      setNovoNome('');
      setNovoTelefone('');
      setContatoSelecionado(perfil);
      setContatoBusca(perfil.nome);
      queryClient.invalidateQueries({ queryKey: ['contatos-disponiveis'] });

      // Sem template escolhido, o contato fica selecionado e o diálogo aberto:
      // o atendente escolhe o template e envia quando quiser.
      if (!templateSelecionado) {
        toast.success('Contato cadastrado. Escolha o template para enviar.');
        return;
      }

      // Com template, já envia a primeira mensagem.
      mutationIniciarConversa.mutate({
        telefone: perfil.telefone,
        nome: perfil.nome,
        template_id: templateSelecionado.id,
        variaveis: variaveisTemplate,
      });
    },
    onError: (err) => toast.error(`Erro ao cadastrar contato: ${err.message}`),
  });

  /** Limpa o diálogo inteiro: contato, busca, cadastro e template escolhido. */
  const fecharDialogoNovaConversa = () => {
    setNovaConversa(false);
    setContatoSelecionado(null);
    setContatoBusca('');
    setNovoContato(false);
    setNovoNome('');
    setNovoTelefone('');
    setTemplateSelecionado(null);
    setVariaveisTemplate([]);
  };

  /**
   * Números de variável que o template exige ({{1}}, {{2}}...), para saber se o
   * atendente preencheu todos antes de liberar o envio. Conta pelo maior número
   * usado, porque a Meta só aceita parâmetros em sequência a partir do 1.
   */
  const variaveisTemplateExigidas = useMemo(() => {
    const comps = Array.isArray(templateSelecionado?.conteudo)
      ? templateSelecionado.conteudo
      : Array.isArray(templateSelecionado?.conteudo?.components)
        ? templateSelecionado.conteudo.components
        : [];
    let maior = 0;
    comps.forEach((comp: any) => {
      if (comp?.type === "BODY") {
        for (const m of String(comp.text || "").matchAll(/\{\{(\d+)\}\}/g)) {
          maior = Math.max(maior, Number(m[1]));
        }
      }
      if (comp?.type === "BUTTONS" && Array.isArray(comp.buttons)) {
        for (const b of comp.buttons) {
          if (b?.type !== "URL") continue;
          for (const m of String(b.url || "").matchAll(/\{\{(\d+)\}\}/g)) {
            maior = Math.max(maior, Number(m[1]));
          }
        }
      }
    });
    return maior;
  }, [templateSelecionado]);

  const templateIncompleto =
    variaveisTemplateExigidas > 0 &&
    Array.from({ length: variaveisTemplateExigidas }, (_, i) =>
      String(variaveisTemplate[i] ?? "").trim(),
    ).some((v) => !v);

  const mutationIniciarConversa = useMutation({
    mutationFn: async (dados: {
      telefone: string;
      nome?: string | null;
      template_id: string;
      variaveis: string[];
    }) => {
      const res: any = await iniciarConversa({ data: { ...dados } });
      exigirOk(res);
      return res;
    },
    onSuccess: (res: any) => {
      fecharDialogoNovaConversa();
      queryClient.invalidateQueries({ queryKey: ['conversas'] });
      const conversaId = res?.resultado?.conversaId ?? res?.conversaId;
      queryClient.invalidateQueries({ queryKey: ['conversa', conversaId] });
      if (conversaId) setSelectedId(conversaId);
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

  /** Confirma o envio do template pendente, com as variáveis preenchidas. */
  const confirmarTemplateComVariaveis = () => {
    const template = templateParaEnviar;
    if (!template) return;

    setTemplateParaEnviar(null);
    mutationEnviar.mutate({
      tipo: 'TEMPLATE',
      template_name: template.meta_name || template.nome_interno,
      idioma: template.idioma || template.language || 'pt_BR',
      variaveis: variaveisEnvio,
    });
  };

  /**
   * Picker de templates dentro da conversa. Antes mandava só o nome, e a Meta
   * recusava com "invalid parameter" todo template que tivesse {{1}} — que é
   * o caso da maioria. Agora abre o diálogo de variáveis quando o template
   * tem alguma, monta os componentes e só então envia.
   */
  const enviarTemplateSelecionado = (template: any) => {
    setPickerTemplate(false);
    setTabTipo('RESPONDER');
    setMensagem('');

    const quantas = contarVariaveisTemplate(template);
    if (quantas === 0) {
      mutationEnviar.mutate({
        tipo: 'TEMPLATE',
        template_name: template.meta_name || template.nome_interno,
        idioma: template.idioma || template.language || 'pt_BR',
        componentes: [],
      });
      return;
    }

    setTemplateParaEnviar(template);
    setVariaveisEnvio(Array(quantas).fill(''));
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
      <div className="w-80 flex-shrink-0 border-r flex flex-col bg-white">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm">Conversas</h2>
            <div className="flex items-center gap-1">
              {/* Atalho para o log da API Meta: a conversa só existe quando o
                  webhook entrega, e o log é o que mostra se ele está chegando. */}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                title="Puxar os nomes de perfil da Meta para os contatos não identificados"
                disabled={mutationRepararNomes.isPending}
                onClick={() => mutationRepararNomes.mutate()}
              >
                <UserCog className="w-3 h-3" />
                {mutationRepararNomes.isPending ? 'Atualizando...' : 'Atualizar nomes'}
              </Button>
              <Link to="/admin/conversas/logs">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  title="Ver o log da API Meta"
                >
                  <ScrollText className="w-3 h-3" />
                  Log da API Meta
                </Button>
              </Link>
              <Button
                size="sm"
                className="h-7 text-xs bg-teal-600 hover:bg-teal-700 gap-1"
                onClick={() => setNovaConversa(true)}
              >
                <Plus className="w-3 h-3" />
                Nova conversa
              </Button>
            </div>
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
                'px-4 py-3 border-b cursor-pointer transition-colors',
                selectedId === c.id ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6]'
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
                {c.ultima_mensagem_preview || 'Nenhuma mensagem'}
              </p>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500" />
                  <span className="text-[9px] text-muted-foreground">
                    Envio liberado
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
      <div className="flex-1 flex flex-col min-w-0">
        {selectedId ? (
          <>
            <div className="h-16 border-b bg-[#f0f2f5] flex items-center justify-between px-4 md:px-6">
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
                    <Clock className="w-3 h-3 text-green-500" />
                    Envio liberado — janela de 24h não bloqueia mais as respostas
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Detalhes da conversa">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 max-h-[70vh] overflow-y-auto">
                    <div className="space-y-5">
                      {/* Contato */}
                      <div className="space-y-2">
                        <h5 className="font-bold text-sm">{conversaAtiva?.contato_nome}</h5>
                        <p className="text-xs text-muted-foreground">{conversaAtiva?.contato_telefone}</p>
                        <Badge variant="outline" className="bg-white">{conversaAtiva?.contato_role}</Badge>
                        {conversaAtiva?.contato_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs h-8"
                            onClick={() => window.location.href = `/admin/vendedor/${conversaAtiva.contato_id}`}
                          >
                            Ver Perfil Completo
                          </Button>
                        )}
                      </div>

                      {/* Veículo relacionado */}
                      {conversaAtiva?.veiculo_marca && (
                        <div className="space-y-2 pt-4 border-t">
                          <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                            Veículo Relacionado
                          </h4>
                          <div className="bg-slate-50 p-3 rounded-lg border space-y-3">
                            <div className="flex gap-3">
                              <div className="w-10 h-10 bg-slate-100 rounded-md flex items-center justify-center flex-shrink-0">
                                <Car className="w-5 h-5 text-slate-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">
                                  {conversaAtiva.veiculo_marca} {conversaAtiva.veiculo_modelo}
                                </p>
                                <p className="text-[10px] text-muted-foreground">Placa: {conversaAtiva.veiculo_placa}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Respostas rápidas */}
                      <div className="space-y-2 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                            Respostas Rápidas
                          </h4>
                          <button
                            onClick={() => setNovaResposta(true)}
                            className="text-teal-600 hover:text-teal-700"
                            title="Nova resposta rápida"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          {respostasProntas?.map((r: any) => (
                            <div
                              key={r.id}
                              className="bg-slate-50 border rounded-lg p-2 text-xs flex items-start justify-between gap-2"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">/{r.atalho} — {r.titulo}</p>
                                <p className="text-muted-foreground truncate">{r.conteudo}</p>
                              </div>
                              <button
                                onClick={() => mutationExcluirResposta.mutate(r.id)}
                                className="text-muted-foreground hover:text-red-600 flex-shrink-0"
                                title="Excluir"
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
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 md:p-6"
              style={{ backgroundColor: '#efeae2' }}
            >
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
                  <div key={m.id} className={cn('flex mb-2', isMine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[70%] rounded-2xl p-2.5 px-3 shadow-sm relative group',
                        isMine
                          ? 'bg-[#d9fdd3] text-slate-800 rounded-tr-none'
                          : 'bg-white text-slate-800 rounded-tl-none'
                      )}
                    >
                      <p
                        className={cn(
                          'text-sm leading-relaxed break-words',
                          // Imagem, áudio e vídeo ocupam a largura que precisarem;
                          // texto continua restrito à largura da bolha.
                          (m.tipo === 'IMAGEM' || m.payload?.tipo === 'IMAGEM') && 'text-base',
                        )}
                      >
                        {placeholderDeMensagem(m.payload)}
                      </p>
                      <div
                        className={cn(
                          'flex items-center gap-1 mt-0.5 text-[10px] justify-end',
                          isMine ? 'text-emerald-700/70' : 'text-muted-foreground'
                        )}
                      >
                        <span>
                          {m.criado_em
                            ? new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </span>
                        {isMine && (
                          m.lido_em
                            ? <CheckCheck className="w-2.5 h-2.5" />
                            : m.entregue_em
                              ? <CheckCircle2 className="w-2.5 h-2.5" />
                              : <CheckCircle2 className="w-2.5 h-2.5 opacity-50" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-2 md:p-4 bg-[#f0f2f5] border-t space-y-2">
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

              {anexo && (
                <div className="flex items-start gap-3 bg-white border rounded-lg p-3">
                  {anexo.preview ? (
                    <img
                      src={anexo.preview}
                      alt={anexo.nome}
                      className="w-20 h-20 rounded-md object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                      {anexo.tipo.startsWith('audio/') ? (
                        <Mic className="w-8 h-8 text-slate-400" />
                      ) : (
                        <FileText className="w-8 h-8 text-slate-400" />
                      )}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{anexo.nome}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {(anexo.tamanho / 1024).toFixed(0)} KB
                      {anexo.tipo.startsWith('image/') && ' — imagem'}
                      {anexo.tipo.startsWith('audio/') && ' — áudio'}
                      {anexo.tipo === 'application/pdf' && ' — PDF'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Escreva a legenda acima e clique em enviar.
                    </p>
                  </div>
                  <button
                    onClick={() => setAnexo(null)}
                    className="text-muted-foreground hover:text-red-600 flex-shrink-0"
                    title="Remover anexo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {tabTipo === 'RESPONDER' && (
                <div className="flex items-end gap-2">
                  <input
                    ref={inputArquivoRef}
                    type="file"
                    accept="image/*,audio/*,application/pdf"
                    className="hidden"
                    onChange={handleArquivo}
                  />
                  <div className="flex-1 relative">
                    <Textarea
                      placeholder={
                        anexo
                          ? 'Legenda (opcional) — envie junto com o anexo'
                          : 'Digite sua mensagem... (use / para respostas rápidas)'
                      }
                      value={anexo ? anexo.legenda : mensagem}
                      onChange={(e) => {
                        if (anexo) {
                          setAnexo({ ...anexo, legenda: e.target.value });
                          return;
                        }
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
                          if (anexo) return; // anexo se envia pelo botão, para não sumir sem upload
                          if (menuRespostaAberto && respostasFiltradas.length > 0) {
                            inserirResposta(respostasFiltradas[0]);
                          } else {
                            handleEnviar();
                          }
                        } else if (e.key === 'Escape' && anexo) {
                          setAnexo(null);
                        } else if (e.key === 'Escape' && menuRespostaAberto) {
                          setMenuRespostaAberto(false);
                        } else if (e.key === 'Tab' && menuRespostaAberto && respostasFiltradas.length > 0) {
                          e.preventDefault();
                          inserirResposta(respostasFiltradas[0]);
                        }
                      }}
                      className="min-h-[52px] max-h-32 resize-none pr-20 py-3 rounded-lg bg-white border-slate-200"
                    />
                    <div className="absolute right-3 bottom-2.5 flex gap-3">
                      <button
                        type="button"
                        onClick={() => inputArquivoRef.current?.click()}
                        title="Anexar imagem, PDF ou áudio"
                        className="text-slate-500 hover:text-teal-600"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Emoji (em breve)"
                        className="text-slate-500 hover:text-teal-600"
                      >
                        <Smile className="w-4 h-4" />
                      </button>
                    </div>
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
                  </div>
                  {anexo ? (
                    <Button
                      onClick={enviarAnexo}
                      disabled={mutationUpload.isPending || mutationEnviar.isPending}
                      className="h-12 w-12 rounded-full flex-shrink-0 bg-teal-600 hover:bg-teal-700"
                      title="Enviar anexo"
                    >
                      {mutationUpload.isPending || mutationEnviar.isPending
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <Send className="w-5 h-5" />}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleEnviar}
                      disabled={!mensagem.trim() || mutationEnviar.isPending}
                      className="h-12 w-12 rounded-full flex-shrink-0 bg-teal-600 hover:bg-teal-700"
                    >
                      <Send className="w-5 h-5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-30">
            <MessageSquare className="w-20 h-20 mb-4" />
            <p className="text-xl font-medium">Selecione uma conversa para começar</p>
          </div>
        )}
      </div>

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

      {/* Dialog: Variáveis do template escolhido na conversa */}
      <Dialog
        open={!!templateParaEnviar}
        onOpenChange={(aberto) => {
          if (!aberto) setTemplateParaEnviar(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Preencher template</DialogTitle>
            <DialogDescription>
              {templateParaEnviar?.meta_name || templateParaEnviar?.nome_interno} exige
              variáveis. A Meta recusa o envio se faltar qualquer uma.
            </DialogDescription>
          </DialogHeader>
          {templateParaEnviar && (
            <VariaveisTemplate
              template={templateParaEnviar}
              valores={variaveisEnvio}
              onChange={setVariaveisEnvio}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateParaEnviar(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarTemplateComVariaveis}
              disabled={mutationEnviar.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {mutationEnviar.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar
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
        {/* O template tem até N variáveis: sem rolagem própria o diálogo estoura
            a viewport e o rodapé sai da tela. */}
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden gap-0">
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
            <DialogDescription>
              Escolha o contato e o template de abertura. Como a janela de 24h só
              se abre quando o contato responde, o primeiro contato precisa ser
              por template aprovado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 overflow-y-auto flex-1 -mx-6 px-6 py-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Contato</label>
                <button
                  type="button"
                  onClick={() => setNovoContato((v) => !v)}
                  className="text-xs text-teal-700 hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {novoContato ? 'Escolher existente' : 'Cadastrar novo contato'}
                </button>
              </div>

              {novoContato ? (
                <div className="space-y-2 border rounded-lg p-3">
                  <Input
                    placeholder="Nome do contato"
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    autoFocus
                  />
                  <Input
                    placeholder="Telefone com DDD"
                    value={novoTelefone}
                    onChange={(e) => setNovoTelefone(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Cadastra o contato. Ele fica selecionado aqui — escolha o
                    template acima só quando quiser enviar a primeira mensagem.
                  </p>
                </div>
              ) : (
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={contatoBusca}
                  onChange={(e) => setContatoBusca(e.target.value)}
                  className="mt-1"
                />
              )}
            </div>

            {!novoContato && (
              <div className="border rounded-lg max-h-52 overflow-y-auto divide-y">
                {carregandoContatos ? (
                  <p className="text-xs text-muted-foreground p-3">Carregando contatos...</p>
                ) : !contatos?.length ? (
                  <p className="text-xs text-muted-foreground p-3">
                    Nenhum contato com telefone encontrado. Cadastre um contato novo.
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
            )}

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
                      onClick={() => {
                        setTemplateSelecionado(t);
                        setVariaveisTemplate([]);
                      }}
                      className={`w-full text-left p-3 transition-colors ${
                        templateSelecionado?.id === t.id
                          ? 'bg-teal-50 border-l-2 border-l-teal-600'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-xs font-bold">{t.meta_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {t.status} — {t.idioma}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>

            {templateSelecionado && (
              <VariaveisTemplate
                template={templateSelecionado}
                valores={variaveisTemplate}
                onChange={setVariaveisTemplate}
              />
            )}
          </div>

          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setNovaConversa(false)}>
              Cancelar
            </Button>

            {/* Cadastrar não precisa de template: o perfil é só o perfil.
                O template só importa na hora de enviar a primeira mensagem. */}
            {novoContato && (
              <Button
                variant="secondary"
                disabled={!novoNome.trim() || novoTelefone.replace(/\D/g, '').length < 10}
                onClick={() => mutationCadastrarContato.mutate()}
              >
                Cadastrar
              </Button>
            )}

            <Button
              disabled={
                (novoContato
                  ? !novoNome.trim() || novoTelefone.replace(/\D/g, '').length < 10
                  : !contatoSelecionado) ||
                !templateSelecionado ||
                templateIncompleto
              }
              onClick={() => {
                if (novoContato) {
                  mutationCadastrarContato.mutate();
                } else {
                  mutationIniciarConversa.mutate({
                    telefone: contatoSelecionado.telefone,
                    nome: contatoSelecionado.nome,
                    template_id: templateSelecionado.id,
                    variaveis: variaveisTemplate,
                  });
                }
              }}
            >
              {novoContato ? 'Cadastrar e enviar' : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
