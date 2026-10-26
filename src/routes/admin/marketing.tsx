import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listarMarketingContatosFn,
  importarMarketingContatosFn,
  atualizarMarketingContatoFn,
  excluirMarketingContatoFn,
  removerContatosSemWhatsappFn,
  criarMarketingTagFn,
  atribuirMarketingTagFn,
  listarMarketingTagsFn,
  removerMarketingTagFn,
  converterContatoEmCompradorFn,
  geocodificarContatosFn,
  getUazapiConfigFn,
  salvarUazapiConfigFn,
  salvarUazapiGruposPermitidosFn,
  listarGruposUazapiFn,
  testarUazapiFn,
  verificarWhatsappContatosFn,
} from "@/lib/marketing.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Search,
  Upload,
  MapPin,
  Tag,
  Loader2,
  Building2,
  CheckCircle2,
  Store,
  User,
  List,
  BadgeCheck,
  Settings,
  FileSpreadsheet,
  FileText,
  Pencil,
  Trash2,
  XCircle,
  Zap,
  Link2,
  Users,
} from "lucide-react";
import MapaContatos from "@/components/shared/MapaContatos";
import {
  CAMPOS_LISTA,
  LABEL_CAMPO,
  CAMPOS_OBRIGATORIOS,
  colunasDaLinha,
  lerCsv,
  lerPlanilhaExcel,
  mapearLinha,
  sugerirMapeamento,
} from "@/lib/importar-lista";

export const Route = createFileRoute("/admin/marketing")({
  component: MarketingPage,
});

const TIPOS = [
  { label: "Todos", value: "todos" },
  { label: "Lojistas", value: "lojista" },
  { label: "Compradores", value: "comprador" },
  { label: "Prospects", value: "prospect" },
];

function MarketingPage() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  // 'todos' | 'verificado' | 'invalido' | 'nao_verificado' | 'erro'
  const [filtroWhatsapp, setFiltroWhatsapp] = useState("todos");
  // Etiquetas cadastradas (para o filtro e para adicionar no diálogo de edição).
  const [tags, setTags] = useState<any[]>([]);
  // Filtro por etiqueta: OR entre as escolhidas (mesma lógica do servidor).
  const [filtroTags, setFiltroTags] = useState<string[]>([]);
  const [removerSemWhatsappOpen, setRemoverSemWhatsappOpen] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [nomeTag, setNomeTag] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [importando, setImportando] = useState(false);
  const [visao, setVisao] = useState<"lista" | "mapa">("lista");
  const [somenteComCoordenadas, setSomenteComCoordenadas] = useState(false);

  // Conversão em comprador
  const [contatoConverter, setContatoConverter] = useState<any>(null);
  const [senhaTemporaria, setSenhaTemporaria] = useState("");
  const [convertendo, setConvertendo] = useState(false);
  const [geocodificando, setGeocodificando] = useState(false);
  const [uazapiUrl, setUazapiUrl] = useState("");
  const [uazapiToken, setUazapiToken] = useState("");
  const [uazapiConfigurado, setUazapiConfigurado] = useState(false);
  const [salvandoUazapi, setSalvandoUazapi] = useState(false);
  const [verificandoWhatsapp, setVerificandoWhatsapp] = useState(false);
  const [uazapiOpen, setUazapiOpen] = useState(false);

  // Importação
  const [tipoContato, setTipoContato] = useState("lojista");
  const [atualizarExistentes, setAtualizarExistentes] = useState(false);
  // Tag criada na hora da importação. Fica fora de `arquivo` porque é
  // independente do arquivo escolhido — o usuário pode importar vários
  // arquivos com a mesma tag.
  const [tagImportacao, setTagImportacao] = useState("");
  // Etiqueta existente escolhida na importação: evita criar uma tag nova a
  // cada arquivo. Quando preenchida, vale mais que o campo de texto.
  const [tagImportacaoId, setTagImportacaoId] = useState("");
  const [contatoEditando, setContatoEditando] = useState<any>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [contatoExcluir, setContatoExcluir] = useState<any>(null);
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [errosImportacao, setErrosImportacao] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<{
    nome: string;
    linhas: Array<Record<string, unknown>>;
  } | null>(null);

  const loadContatos = useServerFn(listarMarketingContatosFn);
  const { data: res, isLoading } = useQuery({
    queryKey: ["admin-marketing", buscaAplicada, filtroTipo, filtroWhatsapp, somenteComCoordenadas, filtroTags],
    queryFn: () =>
      loadContatos({
        data: {
          busca: buscaAplicada,
          tipo: filtroTipo,
          whatsappStatus: filtroWhatsapp,
          somenteComCoordenadas,
          tagIds: filtroTags,
        },
      }),
  });
  const contatos = res?.data || [];
  // A server fn devolve {ok:false, message} quando a query falha. Sem surfar
  // isso, a tela mostrava "Nenhum contato na base" — como se o banco tivesse
  // vazio — e ninguém entendia o que estava quebrado.
  const erroLista =
    res && res.ok === false ? res.message || "Falha ao carregar os contatos." : null;

  // A lista de etiquetas é um catálogo, não um resultado de filtro: fica em
  // chave própria para não refetch a cada digitação na busca.
  const loadTags = useServerFn(listarMarketingTagsFn);
  useEffect(() => {
    loadTags().then((r: any) => {
      if (r?.ok && Array.isArray(r.data)) setTags(r.data);
    });
  }, []);
  // Contatos recém-importados, para aparecerem mesmo que a lista do banco ainda
  // não tenha voltado (a invalidação por prefixo nem sempre dispara refetch).
  const [importadosIds, setImportadosIds] = useState<string[]>([]);
  const importados = useMemo(
    () =>
      importadosIds.map((id) => contatos.find((c: any) => c.id === id)).filter(Boolean) as any[],
    [importadosIds, contatos],
  );

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 400);
    return () => clearTimeout(t);
  }, [busca]);

  const importar = useServerFn(importarMarketingContatosFn);
  const atualizarContato = useServerFn(atualizarMarketingContatoFn);
  const excluirContato = useServerFn(excluirMarketingContatoFn);
  const removerSemWhatsapp = useServerFn(removerContatosSemWhatsappFn);

  async function confirmarRemocaoSemWhatsapp() {
    setRemovendo(true);
    try {
      const r: any = await removerSemWhatsapp();
      if (r?.ok === false) {
        toast.error(r.message || "Não foi possível remover os contatos.");
        return;
      }
      setRemoverSemWhatsappOpen(false);
      setSelecionados([]);
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"] });
      toast.success(`${r?.data?.removidos ?? 0} contato(s) sem WhatsApp removido(s).`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao remover contatos.");
    } finally {
      setRemovendo(false);
    }
  }
  const criarTag = useServerFn(criarMarketingTagFn);
  const atribuirTag = useServerFn(atribuirMarketingTagFn);
  const removerTag = useServerFn(removerMarketingTagFn);
  const converterComprador = useServerFn(converterContatoEmCompradorFn);

  async function confirmarConversao() {
    if (!contatoConverter || senhaTemporaria.length < 6) return;
    setConvertendo(true);
    try {
      const r = await converterComprador({
        data: { contatoId: contatoConverter.id, senha: senhaTemporaria },
      });
      if (!r.ok) throw new Error(r.message);
      toast.success(`Contato convertido em comprador com sucesso.`);
      setContatoConverter(null);
      setSenhaTemporaria("");
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"], exact: false });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConvertendo(false);
    }
  }

  const geocodificar = useServerFn(geocodificarContatosFn);
  const getUazapiConfig = useServerFn(getUazapiConfigFn);
  const salvarUazapi = useServerFn(salvarUazapiConfigFn);
  const salvarGruposPermitidos = useServerFn(salvarUazapiGruposPermitidosFn);
  const listarGrupos = useServerFn(listarGruposUazapiFn);
  const verificarWhatsapp = useServerFn(verificarWhatsappContatosFn);
  const testarUazapi = useServerFn(testarUazapiFn);
  // Grupos da Uazapi: permitidos (salvos) vs disponíveis na instância. Os
  // marcados como permitidos são os que aparecem em automações e campanhas.
  const [gruposDisponiveis, setGruposDisponiveis] = useState<any[]>([]);
  const [gruposPermitidos, setGruposPermitidos] = useState<string[]>([]);
  const [carregandoGrupos, setCarregandoGrupos] = useState(false);
  const [salvandoGrupos, setSalvandoGrupos] = useState(false);
  // Resultado do "Testar": conectado + nome/número da instância, ou o motivo.
  const [testeUazapi, setTesteUazapi] = useState<{
    ok: boolean;
    message?: string;
    conectado?: boolean;
    instancia?: string | null;
    telefone?: string | null;
  } | null>(null);
  const [testandoUazapi, setTestandoUazapi] = useState(false);

  // Carrega a config Uazapi (token só sinaliza se está definido, nunca o valor)
  useEffect(() => {
    getUazapiConfig().then((r) => {
      if (r.ok) {
        setUazapiUrl(r.data.uazapi_base_url || "");
        setUazapiToken(r.data.uazapi_token_definido ? "••••••••••••" : "");
        setUazapiConfigurado(r.data.uazapi_token_definido);
        setGruposPermitidos(r.data.uazapi_grupos_permitidos || []);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega os grupos da instância para marcar os permitidos. Só roda quando
  // o painel de config está aberto, para não bater na Uazapi à toa.
  async function carregarGruposUazapi() {
    setCarregandoGrupos(true);
    try {
      const r: any = await listarGrupos();
      if (r?.ok === false) throw new Error(r.message || "Falha ao listar grupos.");
      setGruposDisponiveis(r?.data || r || []);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao listar grupos.");
    } finally {
      setCarregandoGrupos(false);
    }
  }

  async function confirmarSalvarGrupos() {
    setSalvandoGrupos(true);
    try {
      const r: any = await salvarGruposPermitidos({ data: { grupos: gruposPermitidos } });
      if (r?.ok === false) throw new Error(r.message || "Falha ao salvar grupos.");
      toast.success(`${gruposPermitidos.length} grupo(s) permitido(s). Automação e campanha passam a listar só esses.`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar grupos.");
    } finally {
      setSalvandoGrupos(false);
    }
  }

  async function confirmarSalvarUazapi() {
    setSalvandoUazapi(true);
    try {
      // Salvar já valida a instância, mas o toast genérico de erro escondia o
      // motivo (401/404/timeout). Mostramos o motivo na tela, antes de gravar.
      const r = await salvarUazapi({
        data: {
          base_url: uazapiUrl,
          token: uazapiToken === "••••••••••••" ? undefined : uazapiToken,
        },
      });
      if (!r.ok) throw new Error(r.message);
      toast.success("Configuração da Uazapi salva.");
      setUazapiToken("••••••••••••");
      setUazapiConfigurado(true);
      setTesteUazapi(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvandoUazapi(false);
    }
  }

  async function testarConexaoUazapi() {
    setTestandoUazapi(true);
    setTesteUazapi(null);
    try {
      // Testa com os campos digitados (ou os salvos, se vazio/mascarado) —
      // sem gravar nada. Se falhar, o usuário vê o motivo antes de salvar.
      const r = await testarUazapi({
        data: {
          base_url: uazapiUrl,
          token: uazapiToken === "••••••••••••" ? undefined : uazapiToken,
        },
      });
      setTesteUazapi({
        ok: !!r.ok,
        message: r.ok ? undefined : (r.message || "Falha ao testar a instância."),
        conectado: r.ok ? (r.conectado ?? true) : undefined,
        instancia: r.ok ? r.instancia : undefined,
        telefone: r.ok ? r.telefone : undefined,
      });
    } catch (e: any) {
      setTesteUazapi({ ok: false, message: e?.message || "Falha ao testar a instância." });
    } finally {
      setTestandoUazapi(false);
    }
  }

  async function rodarVerificacaoWhatsapp() {
    setVerificandoWhatsapp(true);
    try {
      const r = await verificarWhatsapp({ data: { limite: 100 } });
      if (!r.ok) throw new Error(r.message);
      toast.success(
        `WhatsApp: ${r.data.verificados} verificado(s), ${r.data.invalidos} sem WhatsApp, ${r.data.erros} erro(s).`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"], exact: false });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setVerificandoWhatsapp(false);
    }
  }

  async function rodarGeocodificacao() {
    setGeocodificando(true);
    try {
      const r = await geocodificar({ data: { limite: 20 } });
      if (!r.ok) throw new Error(r.message);
      toast.success(
        `Geocodificação: ${r.data.sucesso} localizado(s), ${r.data.falha} falha(s) de ${r.data.processados} processado(s).`,
      );
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"], exact: false });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGeocodificando(false);
    }
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const linhas = /\.csv$/i.test(file.name)
        ? lerCsv(await file.text())
        : await lerPlanilhaExcel(await file.arrayBuffer());
      if (!linhas.length) {
        toast.error("O arquivo está vazio ou não tem linhas válidas.");
        return;
      }
      setArquivo({ nome: file.name, linhas });
      setMapeamento(sugerirMapeamento(linhas[0]));
      setErrosImportacao([]);
    } catch (err: any) {
      toast.error("Não foi possível ler o arquivo: " + (err?.message || err));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirmarImportacao() {
    if (!arquivo) return;
    setImportando(true);
    setErrosImportacao([]);
    // A tag é criada e aplicada ANTES da importação rodar no banco. Se a
    // importação falhar (arquivo ruim, etc), a tag fica órfã — mas isso é
    // melhor que o usuário importar 500 contatos, criar a tag, e descobrir
    // depois que a aplicação falhou.
    // A tag só é criada se o nome estiver preenchido; sem nome, a importação
    // segue sem tag.
    let tagId: string | null = null;
    let tagNomeAplicada = "";
    // Etiqueta existente vale mais que o texto: evita criar "lista-outubro",
    // "lista-outubro-2", "lista-outubro-3" a cada arquivo importado.
    if (tagImportacaoId) {
      tagId = tagImportacaoId;
      tagNomeAplicada = tags.find((t: any) => t.id === tagId)?.nome ?? "";
    } else if (tagImportacao.trim()) {
      try {
        const t = await criarTag({ data: { nome: tagImportacao.trim() } });
        if (!t.ok) throw new Error(t.message);
        tagId = t.data?.id;
        if (!tagId) throw new Error("Tag não retornada pelo servidor.");
        tagNomeAplicada = tagImportacao.trim();
      } catch (e: any) {
        toast.error(e.message);
        setImportando(false);
        return;
      }
    }
    importar({
      data: {
        contatos: arquivo.linhas.map((l) => mapearLinha(l, mapeamento)),
        tipo: tipoContato,
        atualizarExistentes,
      },
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.message);
        const d = r.data;
        setErrosImportacao(d.erros ?? []);
        if (d.inseridos > 0 || d.atualizados > 0) {
          // Sem isso o importado fica invisível: a lista ainda estava filtrada
          // pelo tipo/busca anteriores (ex. "Prospects"), e lojista não entra
          // nesse filtro. Forçamos os dois para o que foi importado agora.
          setBusca("");
          setBuscaAplicada("");
          setFiltroTipo(tipoContato);
          setVisao("lista");
          // A tag é aplicada aos contatos que acabaram de entrar. Sem isso o
          // usuário teria que selecionar tudo de novo e aplicar a tag na mão.
          // A tag só é aplicada se foi criada acima (tagId não é null).
          if (tagId) {
            atribuirTag({
              data: { contatoIds: d.inseridosIds ?? [], tagId },
            })
              .then((r) => {
                if (!r.ok) throw new Error(r.message);
                toast.success(
                  `Importação concluída: ${d.inseridos} novo(s), ${d.atualizados} atualizado(s), ${d.duplicados} duplicado(s), ${d.invalidos} inválido(s). Tag "${tagNomeAplicada}" aplicada.`,
                );
              })
              .catch((e: any) => {
                toast.error(
                  `Importação concluída, mas a tag não foi aplicada: ${e.message}`,
                );
              });
          } else {
            toast.success(
              `Importação concluída: ${d.inseridos} novo(s), ${d.atualizados} atualizado(s), ${d.duplicados} duplicado(s), ${d.invalidos} inválido(s).`,
            );
          }
          setImportOpen(false);
          setArquivo(null);
          setTagImportacao("");
          setTagImportacaoId("");
          setImportadosIds(d.inseridosIds ?? []);
          queryClient.invalidateQueries({
            queryKey: ["admin-marketing"],
            exact: false,
          });
          // O filtro/tipo foram trocados acima, então a chave da query mudou:
          // sem isso a UI ainda mostrava o resultado da busca anterior.
          queryClient.refetchQueries({ queryKey: ["admin-marketing"], exact: false });
        } else {
          toast.warning(
            `Nenhum contato importado: ${d.duplicados} duplicado(s), ${d.invalidos} inválido(s). Veja os motivos abaixo.`,
          );
        }
      })
      .catch((e: any) => toast.error(e.message))
      .finally(() => setImportando(false));
  }

  async function salvarEdicao() {
    if (!contatoEditando) return;
    try {
      const r = await atualizarContato({ data: { id: contatoEditando.id, dados: editForm } });
      if (!r.ok) throw new Error(r.message);
      toast.success("Contato atualizado.");
      setContatoEditando(null);
      setEditForm({});
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"], exact: false });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function adicionarTagContato(contatoId: string, tagId: string) {
    try {
      const r = await atribuirTag({ data: { contatoIds: [contatoId], tagId } });
      if (!r.ok) throw new Error(r.message);
      const tag = tags.find((t: any) => t.id === tagId);
      const atuais: any[] = contatoEditando?.tags || [];
      if (tag && !atuais.some((t: any) => t.id === tagId)) {
        refreshTagsContato(contatoId, [...atuais, tag]);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"], exact: false });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removerTagContato(contatoId: string, tagId: string) {
    try {
      const r = await removerTag({ data: { contatoId, tagId } });
      if (!r.ok) throw new Error(r.message);
      const atuais: any[] = contatoEditando?.tags || [];
      refreshTagsContato(contatoId, atuais.filter((t: any) => t.id !== tagId));
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"], exact: false });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  /**
   * Atualiza as etiquetas do contato editado (para o chip de remover aparecer
   * sem fechar o diálogo). Pega a versão mais recente do contato na lista
   * em memória — que já foi refetchada — ou do próprio contato editado.
   */
  function refreshTagsContato(contatoId: string, novasTags?: any[]) {
    if (novasTags) {
      setContatoEditando((prev: any) => ({ ...prev, tags: novasTags }));
      return;
    }
    const atualizado = contatos.find((c: any) => c.id === contatoId);
    if (atualizado) {
      setContatoEditando((prev: any) => ({ ...prev, tags: atualizado.tags || prev?.tags }));
    }
  }

  async function confirmarExclusao() {
    if (!contatoExcluir) return;
    try {
      const r = await excluirContato({ data: { id: contatoExcluir.id } });
      if (!r.ok) throw new Error(r.message);
      toast.success("Contato excluído.");
      setContatoExcluir(null);
      setSelecionados((prev) => prev.filter((id) => id !== contatoExcluir.id));
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"], exact: false });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function aplicarTag() {
    if (!nomeTag.trim() || !selecionados.length) return;
    try {
      const t = await criarTag({ data: { nome: nomeTag.trim() } });
      if (!t.ok) throw new Error(t.message);
      const tagId = t.data?.id;
      if (!tagId) throw new Error("Tag não retornada.");
      const r = await atribuirTag({ data: { contatoIds: selecionados, tagId } });
      if (!r.ok) throw new Error(r.message);
      toast.success(`Tag "${nomeTag.trim()}" aplicada a ${selecionados.length} contato(s).`);
      setTagOpen(false);
      setNomeTag("");
      setSelecionados([]);
      queryClient.invalidateQueries({ queryKey: ["admin-marketing"], exact: false });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const todosMarcados = contatos.length > 0 && selecionados.length === contatos.length;

  // Cabeçalhos do arquivo atual, usados nos selects de mapeamento.
  const colunasDisponiveis = useMemo(
    () => (arquivo?.linhas.length ? colunasDaLinha(arquivo.linhas[0]) : []),
    [arquivo],
  );

  // Conta por tipo, para a pessoa ver onde o que foi importado parou mesmo
  // com o filtro em "Todos".
  const contagemPorTipo = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of contatos) acc[c.tipo] = (acc[c.tipo] ?? 0) + 1;
    return acc;
  }, [contatos]);

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Marketing</h1>
          <p className="text-slate-500 font-medium">
            Base de prospects — lojistas e compradores de veículos.
          </p>
        </div>
        <div className="flex gap-2">
          {selecionados.length > 0 && (
            <Button variant="outline" onClick={() => setTagOpen(true)}>
              <Tag className="mr-2 h-4 w-4" /> Tag para {selecionados.length} selecionado(s)
            </Button>
          )}
          <Button
            variant="outline"
            onClick={async () => {
              const url = `${window.location.origin}/comprador/pre-cadastro`;
              try {
                await navigator.clipboard.writeText(url);
                toast.success("Link da campanha copiado.");
              } catch {
                toast.error("Não foi possível copiar. O link é: " + url);
              }
            }}
          >
            <Link2 className="mr-2 h-4 w-4" /> Copiar link da campanha
          </Button>
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Importar lista
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm font-bold text-slate-900">
              {contatos.length} contato(s)
              {buscaAplicada && (
                <span className="font-normal text-slate-500"> para “{buscaAplicada}”</span>
              )}
              {filtroTipo !== "todos" && (
                <span className="font-normal text-slate-500"> · tipo: {filtroTipo}</span>
              )}
              {filtroWhatsapp === "invalido" && (
                <span className="font-normal text-slate-500"> · sem WhatsApp</span>
              )}
            </p>
            {contatos.some((c: any) => c.whatsapp_status === "invalido") && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setRemoverSemWhatsappOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remover{" "}
                {contatos.filter((c: any) => c.whatsapp_status === "invalido").length}
              </Button>
            )}
            {!buscaAplicada && filtroTipo === "todos" && contatos.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {Object.entries(contagemPorTipo).map(([tipo, qtd]) => (
                  <button
                    key={tipo}
                    onClick={() => setFiltroTipo(tipo)}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-400 capitalize"
                  >
                    {tipo}: {qtd}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BadgeCheck
              className={`h-4 w-4 ${uazapiConfigurado ? "text-teal-600" : "text-slate-400"}`}
            />
            Verificação de WhatsApp (Uazapi){" "}
            {uazapiConfigurado ? (
              <Badge className="bg-teal-600">configurada</Badge>
            ) : (
              <Badge variant="outline">não configurada</Badge>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setUazapiOpen((v) => !v)}>
              <Settings className="mr-2 h-4 w-4" /> Configurar
            </Button>
            <Button
              size="sm"
              onClick={rodarVerificacaoWhatsapp}
              disabled={!uazapiConfigurado || verificandoWhatsapp}
            >
              {verificandoWhatsapp ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <BadgeCheck className="mr-2 h-4 w-4" />
              )}
              Verificar números pendentes
            </Button>
          </div>
        </div>
        {uazapiOpen && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 items-end border-t border-slate-100 pt-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">URL da instância</label>
              <Input
                placeholder="https://gleego.uazapi.com"
                value={uazapiUrl}
                onChange={(e) => setUazapiUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Token</label>
              <Input
                type="password"
                placeholder={uazapiConfigurado ? "•••••••••••• (definido)" : "token da instância"}
                value={uazapiToken}
                onChange={(e) => setUazapiToken(e.target.value)}
              />
            </div>
            <Button onClick={confirmarSalvarUazapi} disabled={salvandoUazapi}>
              {salvandoUazapi ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Settings className="mr-2 h-4 w-4" />
              )}
              Salvar
            </Button>
            {testeUazapi && (
              <div
                className={`col-span-full mt-2 text-xs flex items-start gap-2 rounded-md px-3 py-2 border ${
                  testeUazapi.ok
                    ? "border-teal-200 bg-teal-50 text-teal-800"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {testeUazapi.ok ? (
                  <>
                    <BadgeCheck className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold">Instância conectada.</p>
                      {testeUazapi.instancia && (
                        <p>
                          {testeUazapi.instancia}
                          {testeUazapi.telefone ? ` · ${testeUazapi.telefone}` : ""}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{testeUazapi.message}</p>
                  </>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={testarConexaoUazapi}
              disabled={testandoUazapi || !uazapiUrl}
            >
              {testandoUazapi ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              {testandoUazapi ? "Testando..." : "Testar conexão"}
            </Button>
          </div>
        )}
        {/* Grupos permitidos: marca aqui quais grupos da instância podem ser
            usados. Automação e campanha/disparo passam a listar só esses. */}
        {uazapiOpen && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-bold text-slate-500 uppercase">
                Grupos permitidos ({gruposPermitidos.length})
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={carregarGruposUazapi} disabled={carregandoGrupos}>
                  {carregandoGrupos ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="mr-2 h-4 w-4" />
                  )}
                  {carregandoGrupos ? "Carregando..." : "Carregar grupos da instância"}
                </Button>
                <Button size="sm" onClick={confirmarSalvarGrupos} disabled={salvandoGrupos}>
                  {salvandoGrupos ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Salvar seleção
                </Button>
              </div>
            </div>
            {gruposDisponiveis.length === 0 ? (
              <p className="text-xs text-slate-500">
                Clique em "Carregar grupos da instância" e marque os que devem aparecer em
                automações e campanhas.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {gruposDisponiveis.map((g: any) => {
                  const id = g.id || g.jid;
                  const ativo = gruposPermitidos.includes(id);
                  return (
                    <label
                      key={id}
                      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                        ativo ? "border-teal-500 bg-teal-50" : "border-slate-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={ativo}
                        onChange={() =>
                          setGruposPermitidos((atual) =>
                            ativo ? atual.filter((x) => x !== id) : [...atual, id],
                          )
                        }
                      />
                      <span className="font-medium">{g.nome || g.name || id}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nome, empresa, e-mail ou telefone"
            className="pl-10 h-11 bg-white border-slate-200"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {TIPOS.map((f) => (
            <Button
              key={f.value}
              variant={filtroTipo === f.value ? "default" : "outline"}
              size="sm"
              className="h-11 shrink-0"
              onClick={() => setFiltroTipo(f.value)}
            >
              {f.label}
            </Button>
          ))}
          <Select value={filtroWhatsapp} onValueChange={setFiltroWhatsapp}>
            <SelectTrigger className="h-11 w-[200px] shrink-0">
              <SelectValue placeholder="Status WhatsApp" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">WhatsApp: todos</SelectItem>
              <SelectItem value="verificado">Verificados</SelectItem>
              <SelectItem value="invalido">Não são WhatsApp</SelectItem>
              <SelectItem value="erro">Com erro na verificação</SelectItem>
              <SelectItem value="nao_verificado">Não verificados</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filtroTags.length ? "filtrando" : ""}
            onValueChange={(v) => {
              if (v === "todas") setFiltroTags([]);
              else setFiltroTags((prev) => (prev.includes(v) ? prev : [...prev, v]));
            }}
          >
            <SelectTrigger className="h-11 w-[180px] shrink-0">
              <SelectValue placeholder="Filtrar por tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Tag: todas</SelectItem>
              {tags.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome} ({t.total ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtroTags.length > 0 && (
            <div className="flex gap-1 shrink-0 flex-wrap">
              {filtroTags.map((id) => {
                const t = tags.find((x: any) => x.id === id);
                if (!t) return null;
                return (
                  <button
                    key={id}
                    onClick={() => setFiltroTags((prev) => prev.filter((x) => x !== id))}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:border-red-400 hover:text-red-600"
                    title="Remover filtro"
                  >
                    {t.nome} ✕
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-1 shrink-0 border-l border-slate-200 pl-2">
            <Button
              variant={visao === "lista" ? "default" : "outline"}
              size="sm"
              className="h-11"
              onClick={() => setVisao("lista")}
            >
              <List className="mr-1 h-4 w-4" /> Lista
            </Button>
            <Button
              variant={visao === "mapa" ? "default" : "outline"}
              size="sm"
              className="h-11"
              onClick={() => setVisao("mapa")}
            >
              <MapPin className="mr-1 h-4 w-4" /> Mapa
            </Button>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600 font-medium">
        <input
          type="checkbox"
          checked={somenteComCoordenadas}
          onChange={(e) => setSomenteComCoordenadas(e.target.checked)}
        />
        Somente contatos com localização no mapa
      </label>

      {visao === "mapa" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={rodarGeocodificacao}
              disabled={geocodificando}
            >
              {geocodificando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MapPin className="mr-2 h-4 w-4" />
              )}
              Localizar endereços pendentes
            </Button>
          </div>
          <MapaContatos contatos={contatos} />
          <p className="text-xs text-slate-500">
            Exibindo {contatos.filter((c: any) => c.latitude && c.longitude).length} de{" "}
            {contatos.length} contato(s) com coordenadas. Contatos sem coordenadas aparecem somente
            na lista.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={todosMarcados}
                    onChange={(e) =>
                      setSelecionados(e.target.checked ? contatos.map((c: any) => c.id) : [])
                    }
                  />
                </TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Ações</TableHead>
                <TableHead>Comprador</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </TableCell>
                </TableRow>
              ) : erroLista ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10">
                    <p className="font-semibold text-red-600">
                      Não foi possível carregar os contatos.
                    </p>
                    <p className="text-xs text-slate-500 mt-1 break-words">
                      {erroLista}
                    </p>
                  </TableCell>
                </TableRow>
              ) : contatos.length === 0 && importados.length > 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-slate-500">
                    {importados.length} contato(s) recém-importado(s), aguardando a lista
                    recarregar…
                  </TableCell>
                </TableRow>
              ) : contatos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-slate-500">
                    Nenhum contato na base. Importe uma planilha para começar.
                  </TableCell>
                </TableRow>
              ) : (
                contatos.map((c: any) => (
                  <TableRow
                    key={c.id}
                    className={importadosIds.includes(c.id) ? "bg-emerald-50" : ""}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selecionados.includes(c.id)}
                        onChange={(e) =>
                          setSelecionados((prev) =>
                            e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-900 text-sm">{c.nome}</div>
                      <div className="text-xs text-slate-500">{c.email || "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {c.empresa ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" /> {c.empresa}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {c.tipo === "lojista" ? (
                          <Store className="mr-1 h-3 w-3" />
                        ) : c.tipo === "comprador" ? (
                          <User className="mr-1 h-3 w-3" />
                        ) : null}
                        {c.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">{c.telefone || "—"}</TableCell>
                    <TableCell>
                      {c.whatsapp_status === "verificado" ? (
                        <Badge className="bg-teal-600 text-[10px]">verificado</Badge>
                      ) : c.whatsapp_status === "invalido" ? (
                        <Badge variant="destructive" className="text-[10px]">
                          não encontrado
                        </Badge>
                      ) : c.whatsapp_status === "erro" ? (
                        <Badge variant="outline" className="text-[10px] text-amber-600">
                          erro
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">pendente</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {c.cidade ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" /> {c.cidade}
                          {c.uf ? `/${c.uf}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).map((t: any) => (
                          <Badge
                            key={t.id}
                            style={t.cor ? { backgroundColor: t.cor, color: "#fff" } : undefined}
                          >
                            {t.nome}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          title="Editar contato"
                          onClick={() => {
                            setContatoEditando(c);
                            setEditForm({
                              nome: c.nome ?? "",
                              email: c.email ?? "",
                              telefone: c.telefone ?? "",
                              empresa: c.empresa ?? "",
                              tipo: c.tipo ?? "",
                              cep: c.cep ?? "",
                              endereco: c.endereco ?? "",
                              numero: c.numero ?? "",
                              bairro: c.bairro ?? "",
                              cidade: c.cidade ?? "",
                              uf: c.uf ?? "",
                            });
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-red-600"
                          title="Excluir contato"
                          onClick={() => setContatoExcluir(c)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {c.comprador_id ? (
                        <span className="inline-flex items-center gap-1 text-teal-600 font-bold text-xs">
                          <CheckCircle2 className="h-4 w-4" /> Convertido
                        </span>
                      ) : c.email ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setContatoConverter(c);
                            setSenhaTemporaria("");
                          }}
                        >
                          <User className="mr-1 h-3 w-3" /> Converter
                        </Button>
                      ) : (
                        <span
                          className="text-xs text-slate-400"
                          title="Informe um e-mail para converter"
                        >
                          sem e-mail
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Importação */}
      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) {
            setArquivo(null);
            setErrosImportacao([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar lista de contatos</DialogTitle>
            <DialogDescription>
              Selecione um arquivo Excel (.xlsx, .xls) ou CSV. Depois escolha qual coluna do arquivo
              vai em cada campo do sistema.
            </DialogDescription>
          </DialogHeader>
          {!arquivo ? (
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={aoEscolherArquivo}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-slate-900 file:text-white file:cursor-pointer"
            />
          ) : (
            <>
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <span className="flex items-center gap-2">
                  {/\.csv$/i.test(arquivo.nome) ? (
                    <FileText className="h-4 w-4 text-slate-500" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4 text-slate-500" />
                  )}
                  <strong>{arquivo.nome}</strong> — {arquivo.linhas.length} linha(s)
                </span>
                <Button variant="outline" size="sm" onClick={() => setArquivo(null)}>
                  Trocar arquivo
                </Button>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Tipo do contato
                </label>
                <div className="mt-1 flex gap-2">
                  {[
                    { value: "lojista", label: "Lojista" },
                    { value: "prospect", label: "Prospect" },
                    { value: "comprador", label: "Comprador" },
                  ].map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTipoContato(t.value)}
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        tipoContato === t.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase">
                  Quando o contato já existir
                </p>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={atualizarExistentes}
                    onChange={(e) => setAtualizarExistentes(e.target.checked)}
                  />
                  <span>
                    Atualizar em vez de ignorar. O contato já cadastrado recebe os dados da
                    planilha, inclusive o tipo (lojista, prospect, comprador) escolhido acima —
                    serve para promover um prospect a lojista ou corrigir telefone e cidade.
                  </span>
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase">
                  Mapear colunas do arquivo
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CAMPOS_LISTA.map((campo) => (
                    <div key={campo}>
                      <label className="text-xs font-bold text-slate-500">
                        {LABEL_CAMPO[campo]}
                        {CAMPOS_OBRIGATORIOS.includes(campo) ? " *" : ""}
                      </label>
                      <select
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        value={mapeamento[campo] ?? ""}
                        onChange={(e) => setMapeamento((m) => ({ ...m, [campo]: e.target.value }))}
                      >
                        <option value="">— não usar —</option>
                        {colunasDisponiveis.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                {!mapeamento.nome && (
                  <p className="text-xs text-amber-600">
                    Selecione a coluna com o nome do contato para permitir a importação.
                  </p>
                )}

                <div className="space-y-2 border-t pt-4">
                  <label className="text-xs font-bold text-slate-500">
                    Etiquetar contatos importados
                  </label>
                  {tags.length > 0 && (
                    <select
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm"
                      value={tagImportacaoId}
                      onChange={(e) => setTagImportacaoId(e.target.value)}
                    >
                      <option value="">Usar etiqueta existente…</option>
                      {tags.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.nome} ({Number(t.total ?? 0)})
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm"
                    placeholder="Ou criar nova: ex: lista-outubro, feirao-sp, ..."
                    value={tagImportacao}
                    onChange={(e) => setTagImportacao(e.target.value)}
                    disabled={!!tagImportacaoId}
                  />
                  <p className="text-xs text-slate-500">
                    Escolha uma etiqueta existente ou digite o nome para criar uma nova.
                    Aplica a todos os contatos que entrarem. Deixe em branco para
                    importar sem etiqueta.
                  </p>
                </div>
              </div>

              {errosImportacao.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 max-h-40 overflow-auto">
                  <p className="font-bold mb-1">Linhas não importadas:</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-xs">
                    {errosImportacao.map((erro, i) => (
                      <li key={i}>{erro}</li>
                    ))}
                  </ul>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setImportOpen(false)}
                  disabled={importando}
                >
                  Cancelar
                </Button>
                <Button onClick={confirmarImportacao} disabled={importando || !mapeamento.nome}>
                  {importando ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Confirmar importação
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edição de contato */}
      <Dialog open={!!contatoEditando} onOpenChange={(o) => !o && setContatoEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar contato</DialogTitle>
            <DialogDescription>
              Altere os campos e salve. Deixe em branco para limpar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Nome</label>
              <Input
                value={editForm.nome ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">E-mail</label>
              <Input
                value={editForm.email ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Telefone</label>
              <Input
                value={editForm.telefone ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, telefone: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Empresa / Loja</label>
              <Input
                value={editForm.empresa ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, empresa: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Tipo</label>
              <select
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                value={editForm.tipo ?? "lojista"}
                onChange={(e) => setEditForm((f) => ({ ...f, tipo: e.target.value }))}
              >
                <option value="lojista">Lojista</option>
                <option value="prospect">Prospect</option>
                <option value="comprador">Comprador</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Cidade</label>
              <Input
                value={editForm.cidade ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, cidade: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">UF</label>
              <Input
                value={editForm.uf ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, uf: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Endereço</label>
              <Input
                value={editForm.endereco ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, endereco: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Bairro</label>
              <Input
                value={editForm.bairro ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, bairro: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Número</label>
              <Input
                value={editForm.numero ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, numero: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">CEP</label>
              <Input
                value={editForm.cep ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, cep: e.target.value }))}
              />
            </div>
            {/* Etiquetas do contato: adicionar e remover sem fechar o diálogo */}
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Etiquetas</label>
              <div className="flex gap-1 flex-wrap">
                {(contatoEditando?.tags || []).length === 0 && (
                  <span className="text-sm text-slate-400">Nenhuma etiqueta.</span>
                )}
                {(contatoEditando?.tags || []).map((t: any) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: t.cor || "#94a3b8" }}
                    />
                    {t.nome}
                    <button
                      onClick={() => removerTagContato(contatoEditando.id, t.id)}
                      className="text-slate-400 hover:text-red-600"
                      title="Remover etiqueta"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1 flex-wrap">
                {tags
                  .filter((t: any) => !(contatoEditando?.tags || []).some((x: any) => x.id === t.id))
                  .map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => adicionarTagContato(contatoEditando.id, t.id)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 hover:border-slate-500 hover:text-slate-700"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: t.cor || "#94a3b8" }}
                      />
                      + {t.nome}
                    </button>
                  ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContatoEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicao}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exclusão de contato */}
      <Dialog open={!!contatoExcluir} onOpenChange={(o) => !o && setContatoExcluir(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir contato</DialogTitle>
            <DialogDescription>
              {contatoExcluir?.nome} será removido da base de marketing, junto com suas tags. Essa
              ação não desfaz conversões já feitas em comprador.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContatoExcluir(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarExclusao}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removerSemWhatsappOpen} onOpenChange={setRemoverSemWhatsappOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover contatos sem WhatsApp</DialogTitle>
            <DialogDescription>
              {contatos.filter((c: any) => c.whatsapp_status === "invalido").length} contato(s)
              verificados como “não é WhatsApp” serão removidos da base de marketing, junto com suas
              tags. Contatos com <strong>erro</strong> na verificação são mantidos — neles a
              verificação não deu resposta, então ainda podem ser números válidos. Essa ação não
              desfaz conversões já feitas em comprador.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoverSemWhatsappOpen(false)}
              disabled={removendo}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarRemocaoSemWhatsapp}
              disabled={removendo}
            >
              {removendo ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tag */}
      <Dialog open={tagOpen} onOpenChange={setTagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar tag</DialogTitle>
            <DialogDescription>
              Crie ou reutilize uma tag para identificar os {selecionados.length} contato(s)
              selecionado(s).
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Nome da tag (ex: lojista-sp, comprador-2026)"
            value={nomeTag}
            onChange={(e) => setNomeTag(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={aplicarTag} disabled={!nomeTag.trim() || !selecionados.length}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversão em comprador */}
      <Dialog open={!!contatoConverter} onOpenChange={(o) => !o && setContatoConverter(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Converter em comprador</DialogTitle>
            <DialogDescription>
              Cria um cadastro de comprador pré-preenchido para{" "}
              <strong>{contatoConverter?.empresa || contatoConverter?.nome}</strong> com senha
              provisória. O contato ficará marcado como convertido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              <span className="font-bold">E-mail:</span> {contatoConverter?.email}
            </p>
            <Input
              type="text"
              placeholder="Senha provisória (mín. 6 caracteres)"
              value={senhaTemporaria}
              onChange={(e) => setSenhaTemporaria(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContatoConverter(null)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarConversao}
              disabled={senhaTemporaria.length < 6 || convertendo}
            >
              {convertendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Converter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
