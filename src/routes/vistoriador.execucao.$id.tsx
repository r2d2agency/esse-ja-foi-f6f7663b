// CACHE_BUSTER_20260829_193100_VISTORIADOR: marker unico para forçar novo hash chunk em prod.
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, Camera, AlertTriangle,
  MapPin, ChevronRight, ChevronLeft, ShieldCheck,
  Check, X, AlertCircle, Plus, Info, Image as ImageIcon,
  RefreshCw, Loader2, Trash2,
} from "lucide-react";
import { useAuthStore } from "@/hooks/use-auth";
import { useFilaOffline } from "@/hooks/use-online";
import {
  getVistoriaDetalheVistoriadorFn,
  iniciarCheckinFn,
  salvarItemChecklistFn,
  concluirVistoriaAppFn,
  getChecklistConfigFn,
  salvarRespostaChecklistFn,
  getRespostasChecklistFn,
  salvarFotoLaudoFn,
} from "@/lib/vistoriador.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { compressImage, extensaoPorMime } from "@/components/vistoria/ImageCompressor";
import { toast } from "sonner";

export const Route = createFileRoute("/vistoriador/execucao/$id")({
  component: VistoriaExecucaoPage,
});

function buildEtapas(categorias: any[]) {
  const base = ["Check-in"];
  const meio = (categorias || []).map((c) => c.nome);
  return [...base, ...meio, "Fotos do anúncio", "Revisão final"];
}

function VistoriaExecucaoPage() {
  const { id: vistoriaId } = Route.useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [etapaAtual, setEtapaAtual] = useState(0);
  const [placaInput, setPlacaInput] = useState("");
  const [checkinRealizado, setCheckinRealizado] = useState(false);
  const [laudoId, setLaudoId] = useState<string | null>(null);
  
  const [km, setKm] = useState("");
  const [observacaoGeral, setObservacaoGeral] = useState("");
  const [declaracao, setDeclaracao] = useState(false);

  const [respostasEmMemoria, setRespostasEmMemoria] = useState<Record<string, any>>({});

  const { data: res } = useQuery({
    queryKey: ["vistoria-detalhe", vistoriaId, user?.id],
    queryFn: () => getVistoriaDetalheVistoriadorFn({ data: { vistoriaId, usuarioId: user?.id || "" } }),
    initialData: { ok: false, data: null } as any,
  });

  const v = res?.data;

  const { data: checklistRes } = useQuery({
    queryKey: ["checklist-config"],
    queryFn: () => getChecklistConfigFn(),
    initialData: { ok: false, data: [] } as any,
  });
  const categoriasConfig = checklistRes?.ok ? (checklistRes.data as any[]) : [];

  const ETAPAS = useMemo(() => buildEtapas(categoriasConfig), [categoriasConfig]);

  // Índice relativo às categorias do checklist config
  // etapaAtual = 0 → Check-in
  // etapaAtual de 1..categoriasConfig.length → CATEGORIAS (índice = etapaAtual-1)
  // etapaAtual = categoriasConfig.length + 1 → Fotos
  // etapaAtual = categoriasConfig.length + 2 → Revisão

  const categoriaDaEtapaAtual = useMemo(() => {
    if (etapaAtual >= 1 && etapaAtual <= categoriasConfig.length) {
      return categoriasConfig[etapaAtual - 1];
    }
    return null;
  }, [etapaAtual, categoriasConfig]);

  // Carrega respostas já salvas se tiver laudo
  useEffect(() => {
    if (v?.laudo_id) {
      setLaudoId(v.laudo_id);
      setCheckinRealizado(true);
      setEtapaAtual(1);
    }
  }, [v]);

  useQuery({
    queryKey: ["respostas-checklist", laudoId],
    queryFn: () => laudoId ? getRespostasChecklistFn({ data: { laudoId } }) : Promise.resolve({ ok: true, data: [] }),
    enabled: !!laudoId,
    initialData: { ok: true, data: [] } as any,
  });

  // Depois que carrega respostas, preenche o estado em memoria
  useEffect(() => {
    if (!laudoId) return;
    queryClient.ensureQueryData({
      queryKey: ["respostas-checklist", laudoId],
      queryFn: () => getRespostasChecklistFn({ data: { laudoId } }),
    }).then((rr: any) => {
      const arr = (rr as any)?.data || [];
      const map: Record<string, any> = {};
      arr.forEach((r: any) => { map[r.item_id] = r; });
      setRespostasEmMemoria((prev) => ({ ...prev, ...map }));
    }).catch(() => { /* ignore */ });
  }, [laudoId, queryClient]);

  const iniciarCheckinMutation = useMutation({
    mutationFn: (data: { placa: string; localizacao: any }) => 
      iniciarCheckinFn({ data: { vistoriaId, usuarioId: user?.id || "", ...data } }),
    onSuccess: (res) => {
      if (res.ok) {
        setLaudoId((res as any).laudoId);
        setCheckinRealizado(true);
        setEtapaAtual(1);
        toast.success("Check-in realizado com sucesso!");
      } else {
        toast.error('message' in res ? (res as any).message : "Erro ao realizar check-in");
      }
    }
  });

  const concluirVistoriaMutation = useMutation({
    mutationFn: () => concluirVistoriaAppFn({ 
      data: { 
        laudoId: laudoId!, 
        quilometragem: parseInt(km || "0"), 
        observacao_geral: observacaoGeral,
        declaracao 
      } 
    }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Vistoria concluída e enviada para análise!");
        navigate({ to: "/vistoriador" });
      } else {
        toast.error('message' in res ? (res as any).message : "Erro ao concluir vistoria");
      }
    }
  });

  const handleCheckin = () => {
    if (!placaInput || placaInput.toUpperCase() !== v?.placa.toUpperCase()) {
      toast.error("A placa digitada não corresponde ao veículo agendado.");
      return;
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          iniciarCheckinMutation.mutate({
            placa: placaInput.toUpperCase(),
            localizacao: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: new Date().toISOString()
            }
          });
        },
        () => {
          toast.error("Ative o GPS e permita o acesso à localização para iniciar a vistoria.");
        }
      );
    } else {
      toast.error("Este aparelho não oferece GPS. O check-in não pode ser iniciado.");
    }
  };

  // Espelho síncrono das respostas (para enviar o registro COMPLETO ao servidor)
  const respostasRef = useRef<Record<string, any>>({});
  useEffect(() => {
    respostasRef.current = respostasEmMemoria;
  }, [respostasEmMemoria]);

  // Fila offline: se a conexão cair, as respostas ficam salvas no aparelho
  // e são reenviadas automaticamente quando a internet volta.
  const filaOffline = useFilaOffline(async (payload: any) => {
    const r: any = await salvarRespostaChecklistFn({ data: payload });
    return { ok: !!r?.ok };
  });

  const persistirRespostaMutation = useMutation({
    mutationFn: (payload: any) => salvarRespostaChecklistFn({ data: payload }),
    onSuccess: (rr: any, payload: any) => {
      if (!rr.ok) {
        filaOffline.enfileirar(payload);
        toast.warning("Sem confirmação do servidor", {
          description: "A resposta ficou salva no aparelho e será enviada automaticamente.",
        });
      }
    },
    onError: (_e, payload: any) => {
      filaOffline.enfileirar(payload);
      toast.warning("Você está offline", {
        description: "A resposta ficou salva no aparelho e será enviada quando a internet voltar.",
      });
    },
  });

  // Auditoria: GPS capturado em segundo plano, sem travar o salvamento
  const gpsRef = useRef<{ gps_lat: number | null; gps_lng: number | null; gps_precisao: number | null }>({
    gps_lat: null,
    gps_lng: null,
    gps_precisao: null,
  });
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        gpsRef.current = {
          gps_lat: pos.coords.latitude,
          gps_lng: pos.coords.longitude,
          gps_precisao: pos.coords.accuracy,
        };
      },
      () => null,
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const enviarResposta = (item: any, registro: any) => {
    if (!laudoId) return;
    persistirRespostaMutation.mutate({
      laudoId,
      vistoriaId,
      item_id: item.id,
      categoria_id: item.categoria_id,
      respondido_por: user?.id || null,
      registrado_em_dispositivo: new Date().toISOString(),
      ...gpsRef.current,
      resposta_conformidade: registro.resposta_conformidade ?? null,
      resposta_texto: registro.resposta_texto ?? null,
      resposta_numero:
        registro.resposta_numero === undefined || registro.resposta_numero === null || registro.resposta_numero === ""
          ? null
          : Number(registro.resposta_numero),
      resposta_opcoes: registro.resposta_opcoes ?? null,
      observacao: registro.observacao ?? null,
      foto_url: registro.foto_url ?? null,
    });
  };

  const handleSalvarResposta = (item: any, patch: any) => {
    if (!laudoId) return;
    // 1) Atualiza o estado local e o espelho síncrono com o registro COMPLETO
    const anterior = respostasRef.current[item.id] || { item_id: item.id };
    const merged = { ...anterior, ...patch, item_id: item.id, _respondido: true };
    respostasRef.current = { ...respostasRef.current, [item.id]: merged };
    setRespostasEmMemoria((prev) => ({ ...prev, [item.id]: merged }));

    // 2) Texto usa debounce curto; escolhas e fotos salvam na hora
    const ehTexto = "observacao" in patch || "resposta_texto" in patch || "resposta_numero" in patch;
    if (timersRef.current[item.id]) clearTimeout(timersRef.current[item.id]);
    if (ehTexto) {
      pendentesRef.current[item.id] = item;
      timersRef.current[item.id] = setTimeout(() => {
        delete pendentesRef.current[item.id];
        enviarResposta(item, respostasRef.current[item.id]);
      }, 700);
    } else {
      delete pendentesRef.current[item.id];
      enviarResposta(item, merged);
    }
  };


  // Garante o envio de qualquer texto pendente ao sair da tela / fechar o app
  const pendentesRef = useRef<Record<string, any>>({});
  const enviarPendentes = () => {
    Object.entries(pendentesRef.current).forEach(([itemId, item]) => {
      if (timersRef.current[itemId]) clearTimeout(timersRef.current[itemId]);
      const registro = respostasRef.current[itemId];
      if (registro) enviarResposta(item, registro);
    });
    pendentesRef.current = {};
  };

  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") enviarPendentes();
    };
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", enviarPendentes);
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", enviarPendentes);
      enviarPendentes();
    };
  });




  const progress = Math.round((etapaAtual / Math.max(1, ETAPAS.length - 1)) * 100);

  if (!v) return null;

  // Itens obrigatórios ainda pendentes na etapa atual
  const pendenciasEtapa = (): string[] => {
    if (!categoriaDaEtapaAtual) return [];
    const faltando: string[] = [];
    for (const item of (categoriaDaEtapaAtual.itens || []) as any[]) {
      if (!item.obrigatorio) continue;
      const r = respostasEmMemoria[item.id];
      const titulo = item.titulo || "Item";
      const tipo = item.tipo_item;
      if (tipo === "CONFORMIDADE") {
        if (!r?.resposta_conformidade) faltando.push(titulo);
        else if (item.foto_obrigatoria && !r?.foto_url) faltando.push(`${titulo} (foto)`);
      } else if (tipo === "TEXTO_LIVRE") {
        if (!String(r?.resposta_texto || "").trim()) faltando.push(titulo);
      } else if (tipo === "CHECKBOX_MULTIPLO" || tipo === "SELECT_UNICO") {
        const op = r?.resposta_opcoes;
        if (!op || (Array.isArray(op) && op.length === 0) || (typeof op === "string" && !op)) faltando.push(titulo);
      } else {
        // NUMERO e tipos não mapeados usam o campo numérico
        if (r?.resposta_numero === undefined || r?.resposta_numero === null || Number.isNaN(Number(r?.resposta_numero))) {
          faltando.push(titulo);
        } else if (item.foto_obrigatoria && !r?.foto_url) {
          faltando.push(`${titulo} (foto)`);
        }
      }
    }
    return faltando;
  };

  const permiteContinuar = () => {
    if (etapaAtual === 0) return checkinRealizado;
    return pendenciasEtapa().length === 0;
  };


  return (
    <div className="flex min-h-screen flex-col bg-background lg:ml-64">
      {/* Header Fixo com dados do veículo */}
      <header className="sticky top-16 z-30 border-b border-border bg-card/95 px-4 pb-3 pt-3 backdrop-blur lg:top-0">
        <div className="mb-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate({ to: `/vistoriador/vistoria/${vistoriaId}` })}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-black uppercase tracking-tight text-foreground">
              {v.marca} {v.modelo}
            </p>
            <p className="truncate text-[11px] font-bold uppercase tracking-widest text-primary">
              {v.placa}{v.ano ? ` • ${v.ano}` : ""}
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px] font-black uppercase">
            {etapaAtual + 1}/{ETAPAS.length}
          </Badge>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <span className="truncate">{ETAPAS[etapaAtual]}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Navegação rápida entre etapas */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ETAPAS.map((nome, idx) => (
            <button
              key={nome}
              type="button"
              onClick={() => { if (idx > 0 && !checkinRealizado) return; if (idx <= etapaAtual || permiteContinuar()) setEtapaAtual(idx); }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-colors ${
                idx === etapaAtual
                  ? "bg-primary text-primary-foreground"
                  : idx < etapaAtual
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {idx + 1}. {nome}
            </button>
          ))}
        </div>
        {filaOffline.pendentes > 0 && (
          <button
            type="button"
            onClick={() => void filaOffline.sincronizar()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-[11px] font-bold text-amber-900"
          >
            {filaOffline.sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {filaOffline.pendentes} alteração(ões) salva(s) no aparelho — toque para sincronizar
          </button>
        )}
      </header>

      <main className="flex-1 p-4 pb-64 lg:pb-40">
        {etapaAtual === 0 && !checkinRealizado && (
            <div className="space-y-6 pt-4">
            <div className="rounded-3xl bg-primary p-8 text-center text-primary-foreground shadow-lg">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-foreground/15">
                <MapPin className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-lg font-black">Iniciar Check-in</h2>
              <p className="mt-2 text-sm text-primary-foreground/80">Usamos sua localização para registrar o início da vistoria com auditoria de GPS, data e hora.</p>
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
              <label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Confirme a placa do veículo</label>
              <Input
                placeholder="ABC-1234"
                className="h-16 rounded-2xl text-center text-3xl font-black uppercase tracking-widest placeholder:text-muted"
                value={placaInput}
                onChange={(e) => setPlacaInput(e.target.value)}
              />
              <Button 
                onClick={handleCheckin}
                disabled={iniciarCheckinMutation.isPending || !placaInput}
                className="h-14 w-full rounded-2xl bg-accent text-lg font-black text-accent-foreground hover:bg-accent/90"
              >
                {iniciarCheckinMutation.isPending ? "Validando..." : "Validar Placa"}
              </Button>
            </div>
          </div>
        )}

        {/* ETAPAS DINAMICAS: 1..N = categorias */}
        {categoriaDaEtapaAtual && (
          <ChecklistCategoriaDinamica
            categoria={categoriaDaEtapaAtual}
            respostasEmMemoria={respostasEmMemoria}
            onMudarResposta={(item, patch) => handleSalvarResposta(item, patch)}
            onSetKm={(val) => setKm(val)}
            kmAtual={km}
          />
        )}

        {etapaAtual === ETAPAS.length - 2 && (
          <FotosAnuncio laudoId={laudoId} />
        )}

        {etapaAtual === ETAPAS.length - 1 && (
          <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Revisão Final</h3>
              
              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600">Observação Geral</label>
                  <Textarea 
                    placeholder="Descreva o estado geral do veículo..."
                    className="min-h-[120px] rounded-xl"
                    value={observacaoGeral}
                    onChange={(e) => setObservacaoGeral(e.target.value)}
                  />
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4">
                  <input 
                    type="checkbox" 
                    id="declara"
                    className="mt-1 h-5 w-5 rounded border-amber-300 accent-amber-600"
                    checked={declaracao}
                    onChange={(e) => setDeclaracao(e.target.checked)}
                  />
                  <label htmlFor="declara" className="text-xs font-bold leading-tight text-amber-900">
                    Confirmo que realizei esta vistoria e registrei as informações de acordo com o observado no veículo.
                  </label>
                </div>

                <Button 
                  onClick={() => concluirVistoriaMutation.mutate()}
                  disabled={!declaracao || concluirVistoriaMutation.isPending}
                  className="h-16 w-full rounded-2xl bg-accent text-lg font-black uppercase text-accent-foreground hover:bg-accent/90"
                >
                  {concluirVistoriaMutation.isPending ? "Concluindo..." : "Concluir Vistoria"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Navegação de Etapas */}
      {checkinRealizado && etapaAtual < ETAPAS.length - 1 && (
        <footer className="fixed bottom-24 left-0 right-0 z-40 border-t border-border bg-card/95 p-4 backdrop-blur lg:bottom-0 lg:left-64">
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="h-14 flex-1 rounded-2xl font-bold"
              onClick={() => setEtapaAtual(Math.max(1, etapaAtual - 1))}
              disabled={etapaAtual <= 1}
            >
              <ChevronLeft className="mr-2 h-5 w-5" />
              Voltar
            </Button>
            <Button 
              className="h-14 flex-2 rounded-2xl bg-primary font-bold disabled:opacity-50"
              onClick={() => setEtapaAtual(etapaAtual + 1)}
              disabled={!permiteContinuar()}
              title={!permiteContinuar() ? "Preencha todos os itens obrigatórios para continuar." : undefined}
            >
              Continuar
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
          {!permiteContinuar() && etapaAtual !== 0 && (
            <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Falta preencher: {pendenciasEtapa().slice(0, 3).join(", ")}
              {pendenciasEtapa().length > 3 ? ` e mais ${pendenciasEtapa().length - 3}` : ""}
            </p>
          )}

        </footer>
      )}
    </div>
  );
}

// ============================================================================
// Sub-componente: upload REAL de foto por item do checklist
// (câmera nativa mobile + compressao WebP automatica + upload endpoint)
// ============================================================================
function UploadFotoItemChecklist({
  item,
  fotoUrlAtual,
  onFotoSalva,
}: {
  item: any;
  fotoUrlAtual?: string | null;
  onFotoSalva: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [carregando, setCarregando] = useState(false);

  const abrirCameraOuGaleria = () => inputRef.current?.click();
  const limparFoto = () => onFotoSalva(null);

  const handleArquivoSelecionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    if (inputRef.current) inputRef.current.value = "";

    setCarregando(true);
    try {
      // 1) Comprime automaticamente: TENTA WEBP PRIMEIRO, fallback JPEG se iOS antigo
      const blobComprimido = await compressImage(
        arquivo,
        1600,      // largura max px (reduz se foto for 4k enorme)
        0.75,      // qualidade WEBP: equilibra tamanho/qualidade p/ vistoria
        0.82       // fallback qualidade JPEG (caso device nao suporte webp)
      );

      // 2) Nomeia arquivo com ID do item + extensao dinâmica (webp ou jpg)
      const extensao = extensaoPorMime(blobComprimido.type || "image/jpeg");
      const nomeArquivo = `checklist-item-${String(item.id || "item").slice(0, 8)}-${Date.now()}.${extensao}`;

      // 3) Envia via FormData pro endpoint /api/public/upload
      const formData = new FormData();
      formData.append("file", blobComprimido, nomeArquivo);

      const resposta = await fetch("/api/public/upload", {
        method: "POST",
        body: formData,
      });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status} no upload`);

      const dados = await resposta.json();
      if (!dados.url) throw new Error("Servidor não retornou URL da foto");

      // 4) Devolve a URL pro estado (data: URL real do storage/base64)
      onFotoSalva(dados.url);
      toast.success("Foto enviada", {
        description: `${blobComprimido.type.toUpperCase()} · ~${Math.round(blobComprimido.size / 1024)} KB`,
        duration: 2200,
      });
    } catch (erro: any) {
      console.error("Erro foto item:", erro);
      toast.error("Não foi possível enviar a foto", {
        description: erro?.message || "Tente novamente.",
      });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleArquivoSelecionado}
        disabled={carregando}
      />

      <div className="grid grid-cols-5 gap-3">
        {/* Preview / área de slot */}
        <div className="col-span-3">
          <div
            onClick={!carregando && !fotoUrlAtual ? abrirCameraOuGaleria : undefined}
            className={`relative flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-all ${
              fotoUrlAtual
                ? "border-emerald-300 bg-emerald-50"
                : carregando
                ? "border-amber-300 bg-amber-50 animate-pulse cursor-wait"
                : "border-slate-200 bg-slate-50 hover:border-teal-400 hover:bg-teal-50/40 cursor-pointer"
            }`}
          >
            {fotoUrlAtual ? (
              <>
                <img
                  src={fotoUrlAtual}
                  alt={item.titulo || "foto item"}
                  className="h-full w-full object-cover"
                />
                <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  <CheckCircle2 className="h-3 w-3" /> Enviada
                </span>
              </>
            ) : carregando ? (
              <div className="flex flex-col items-center gap-2 text-amber-700">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-[11px] font-bold uppercase">Comprimindo &amp; Enviando...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 p-3 text-center text-slate-500">
                <Camera className="h-7 w-7 text-slate-400" />
                <span className="text-[11px] font-bold uppercase tracking-wide">
                  {item.foto_obrigatoria ? "Adicionar Foto *" : "Adicionar Foto"}
                </span>
                <span className="text-[10px] text-slate-400">WebP automático</span>
              </div>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="col-span-2 flex flex-col gap-2 justify-center">
          <Button
            variant="outline"
            className="h-auto min-h-[48px] rounded-xl border-teal-200 text-xs font-black uppercase !text-teal-800 hover:bg-teal-50"
            onClick={abrirCameraOuGaleria}
            disabled={carregando}
          >
            {carregando ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Processando</>
            ) : fotoUrlAtual ? (
              <><RefreshCw className="h-4 w-4 mr-1.5" /> Substituir</>
            ) : (
              <><Camera className="h-4 w-4 mr-1.5" /> Câmera / Galeria</>
            )}
          </Button>
          {fotoUrlAtual && !carregando && (
            <Button
              variant="outline"
              className="h-auto min-h-[40px] rounded-xl border-rose-200 text-xs font-bold uppercase !text-rose-700 hover:bg-rose-50"
              onClick={limparFoto}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover
            </Button>
          )}
          <div className="mt-1 text-center text-[10px] leading-snug text-slate-400">
            Salva automaticamente após upload
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-componente: renderiza uma CATEGORIA DINAMICA com seus itens
// ============================================================================
function ChecklistCategoriaDinamica({ categoria, respostasEmMemoria, onMudarResposta, onSetKm, kmAtual }: {
  categoria: any;
  respostasEmMemoria: Record<string, any>;
  onMudarResposta: (item: any, patch: any) => void;
  onSetKm?: (v: string) => void;
  kmAtual?: string;
}) {
  const itens = (categoria?.itens || []) as any[];
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-teal-100 p-5 bg-gradient-to-br from-teal-50/40 to-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-teal-700">{categoria.nome}</h3>
            {categoria.descricao && <p className="mt-1 text-xs font-medium text-slate-600">{categoria.descricao}</p>}
          </div>
          <Badge variant="outline" className="bg-white text-teal-700 border-teal-200">
            {itens.length} itens
          </Badge>
        </div>
      </Card>

      <div className="space-y-5">
        {itens.map((item) => {
          const r = respostasEmMemoria[item.id] || {};
          return (
            <Card key={item.id} className={`rounded-2xl p-5 ${r._respondido ? "border-emerald-200 bg-emerald-50/30" : "border bg-white"}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    {item.titulo}
                    {item.obrigatorio && <span className="text-rose-500">*</span>}
                  </h4>
                  {item.descricao_ajuda && (
                    <div className="mt-1 flex items-start gap-2 text-[11px] text-slate-500">
                      <Info className="h-3.5 w-3.5 mt-0.5 text-slate-400 flex-shrink-0" />
                      <span>{item.descricao_ajuda}</span>
                    </div>
                  )}
                </div>
                {(item.foto_obrigatoria || item.foto_obrigatoria === false) && (
                  <Badge variant="outline" className={`text-[10px] ${item.foto_obrigatoria ? "border-rose-200 text-rose-700 bg-rose-50" : "border-slate-200 text-slate-500 bg-slate-50"}`}>
                    Foto {item.foto_obrigatoria ? "Obrigatória" : "Opcional"}
                  </Badge>
                )}
              </div>

              {item.tipo_item === "CONFORMIDADE" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: "CONFORME", label: "Conforme", icon: Check, cor: "emerald" },
                      { key: "NAO_CONFORME", label: "Não Conforme", icon: X, cor: "rose" },
                      { key: "NA", label: "N/A", icon: AlertCircle, cor: "slate" },
                    ].map((op) => {
                      const selecionado = r.resposta_conformidade === op.key;
                      return (
                        <Button
                          key={op.key}
                          variant="outline"
                          onClick={() => onMudarResposta(item, { resposta_conformidade: op.key })}
                          className={`h-14 flex-col !py-2 text-[11px] font-black uppercase ${
                            selecionado
                              ? op.cor === "emerald" ? "!bg-emerald-500 !text-white border-emerald-500" :
                                op.cor === "rose" ? "!bg-rose-500 !text-white border-rose-500" :
                                "!bg-slate-700 !text-white border-slate-700"
                              : "border-slate-200 text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <op.icon className="h-4 w-4 mb-0.5" />
                          {op.label}
                        </Button>
                      );
                    })}
                  </div>

                  {/* KM no item QUILOMETRAGEM? */}
                  {(item.titulo || "").toLowerCase().includes("quilometragem") && onSetKm && (
                    <div className="pt-2 border-t">
                      <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Valor em KM</Label>
                      <Input
                        type="number"
                        placeholder="Ex: 45000"
                        className="h-12 rounded-xl mt-1 text-lg font-bold"
                        value={kmAtual || r.resposta_numero || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          onSetKm(val);
                          onMudarResposta(item, { resposta_numero: val ? Number(val) : null });
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {item.tipo_item === "TEXTO_LIVRE" && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Digite aqui..."
                    className="min-h-[80px] rounded-xl text-sm"
                    value={r.resposta_texto || ""}
                    onChange={(e) => onMudarResposta(item, { resposta_texto: e.target.value })}
                  />
                </div>
              )}

              {(item.tipo_item === "NUMERO" ||
                !["CONFORMIDADE", "TEXTO_LIVRE", "CHECKBOX_MULTIPLO", "SELECT_UNICO"].includes(item.tipo_item)) && (
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {(item.titulo || "").toLowerCase().includes("quilometragem") ? "Valor em KM" : "Valor"}
                  </Label>
                  <Input
                    type="number"
                    placeholder="Digite o número..."
                    className="h-12 rounded-xl text-base font-bold"
                    value={r.resposta_numero ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (onSetKm && (item.titulo || "").toLowerCase().includes("quilometragem")) onSetKm(val);
                      onMudarResposta(item, { resposta_numero: val ? Number(val) : null });
                    }}
                  />
                </div>
              )}


              {item.tipo_item === "CHECKBOX_MULTIPLO" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(item.opcoes || []).map((op: any) => {
                    const escolhidos = Array.isArray(r.resposta_opcoes) ? r.resposta_opcoes : [];
                    const marcado = escolhidos.includes(op.valor);
                    return (
                      <div key={op.valor} className="flex items-center gap-2 rounded-xl border p-3">
                        <Checkbox
                          checked={marcado}
                          onCheckedChange={(v) => {
                            const next = new Set(escolhidos);
                            if (v) next.add(op.valor); else next.delete(op.valor);
                            onMudarResposta(item, { resposta_opcoes: Array.from(next) });
                          }}
                        />
                        <span className="text-xs font-bold text-slate-700">{op.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {item.tipo_item === "SELECT_UNICO" && (
                <Select
                  value={r.resposta_opcoes || ""}
                  onValueChange={(val) => onMudarResposta(item, { resposta_opcoes: val })}
                >
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder="Selecione uma opção..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(item.opcoes || []).map((op: any) => (
                      <SelectItem key={op.valor} value={op.valor}>{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Campo de observação (se permite_observacao) */}
              {item.permite_observacao !== false && (
                <div className="mt-3 pt-3 border-t">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Observação</Label>
                  <Textarea
                    placeholder="Campo opcional — detalhe o que você observou..."
                    className="mt-1 min-h-[64px] rounded-xl text-xs"
                    value={r.observacao || ""}
                    onChange={(e) => onMudarResposta(item, { observacao: e.target.value })}
                  />
                </div>
              )}

              {/* Upload REAL de foto: câmera nativa mobile + WebP + upload automático */}
              {item.foto_obrigatoria || item.foto_obrigatoria === false ? (
                <UploadFotoItemChecklist
                  item={item}
                  fotoUrlAtual={r.foto_url || null}
                  onFotoSalva={(url) => onMudarResposta(item, { foto_url: url })}
                />
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-componente: Fotos do anúncio — upload real guiado por ângulos
// ============================================================================
const ANGULOS_ANUNCIO = [
  "Frente 45°", "Frente", "Lateral Esq", "Lateral Dir", "Traseira 45°", "Traseira",
  "Interior (dianteiro)", "Interior (traseiro)", "Painel", "Motor", "Porta-malas", "Estepe",
];

function FotosAnuncio({ laudoId }: { laudoId: string | null }) {
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const anguloAtualRef = useRef<string | null>(null);
  const enviadas = Object.keys(fotos).length;

  const abrirCamera = (angulo: string) => {
    if (!laudoId) {
      toast.error("Faça o check-in antes de enviar fotos.");
      return;
    }
    anguloAtualRef.current = angulo;
    inputRef.current?.click();
  };

  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    const angulo = anguloAtualRef.current;
    if (inputRef.current) inputRef.current.value = "";
    if (!arquivo || !angulo || !laudoId) return;

    setEnviando(angulo);
    try {
      const blob = await compressImage(arquivo, 1600, 0.75, 0.82);
      const extensao = extensaoPorMime(blob.type || "image/jpeg");
      const formData = new FormData();
      formData.append("file", blob, `anuncio-${angulo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.${extensao}`);

      const resp = await fetch("/api/public/upload", { method: "POST", body: formData });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const dados = await resp.json();
      if (!dados.url) throw new Error("Servidor não retornou URL da foto");

      const salvo: any = await salvarFotoLaudoFn({ data: { laudoId, tipo_foto: angulo, url: dados.url } });
      if (salvo?.ok === false) throw new Error(salvo.message || "Falha ao registrar foto no laudo");

      setFotos((prev) => ({ ...prev, [angulo]: dados.url }));
      toast.success(`Foto "${angulo}" enviada`);
    } catch (erro: any) {
      toast.error("Não foi possível enviar a foto", { description: erro?.message || "Tente novamente." });
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Fotos do anúncio</h3>
            <p className="mt-1 text-xs font-medium text-muted-foreground">Siga os ângulos indicados para manter o padrão de publicação.</p>
          </div>
          <Badge variant="outline" className="shrink-0">{enviadas}/{ANGULOS_ANUNCIO.length}</Badge>
        </div>
        <Progress value={Math.round((enviadas / ANGULOS_ANUNCIO.length) * 100)} className="mt-3 h-1.5" />
      </div>

      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleArquivo} />

      <div className="grid grid-cols-2 gap-3">
        {ANGULOS_ANUNCIO.map((angulo) => {
          const url = fotos[angulo];
          const carregando = enviando === angulo;
          return (
            <button
              key={angulo}
              type="button"
              onClick={() => abrirCamera(angulo)}
              disabled={carregando}
              className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-2xl border-2 text-center transition-colors ${
                url
                  ? "border-emerald-300"
                  : carregando
                    ? "border-amber-300 bg-amber-50"
                    : "border-dashed border-border bg-card active:bg-muted/50"
              }`}
            >
              {url ? (
                <>
                  <img src={url} alt={`Foto ${angulo}`} className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-foreground/60 px-2 py-1.5 text-[10px] font-bold uppercase text-primary-foreground backdrop-blur-sm">
                    <CheckCircle2 className="h-3 w-3" /> {angulo}
                  </span>
                </>
              ) : carregando ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
                  <span className="mt-2 text-[10px] font-bold uppercase text-amber-800">Enviando...</span>
                </>
              ) : (
                <>
                  <Camera className="h-6 w-6 text-muted-foreground" />
                  <span className="mt-2 px-2 text-[10px] font-bold uppercase tracking-tight text-muted-foreground">{angulo}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">Toque em um ângulo para abrir a câmera. A foto é comprimida e enviada automaticamente.</p>
    </div>
  );
}

