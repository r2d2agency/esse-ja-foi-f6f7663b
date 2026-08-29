import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gavel, Megaphone, Store, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { UploadFotos } from "./UploadFotos";
import { getCanaisPublicacaoFn, salvarCanalPublicacaoFn } from "@/lib/publicacao.functions";
import { getLeilaoVeiculoFn, salvarLeilaoVeiculoFn } from "@/lib/leilao.functions";

/** Converte ISO/UTC para o formato aceito pelo input datetime-local (horário local). */
function paraInputLocal(valor?: string | null) {
  if (!valor) return "";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const CANAIS = [
  { id: "LEILAO", label: "Leilão", icon: Gavel, desc: "Sala de lances com cronômetro e incremento." },
  { id: "ANUNCIO", label: "Anúncio", icon: Megaphone, desc: "Peça comercial para divulgação direta." },
  { id: "VITRINE", label: "Vitrine", icon: Store, desc: "Listagem pública, sem exibir valores." },
] as const;

type CanalId = (typeof CANAIS)[number]["id"];

export function CanaisPublicacao({ veiculoId }: { veiculoId: string }) {
  const [canalAtivo, setCanalAtivo] = useState<CanalId>("LEILAO");
  const [form, setForm] = useState<any>({ ativo: false, titulo: "", descricao: "", fotos: [] });
  const [salvando, setSalvando] = useState(false);
  const [leilao, setLeilao] = useState({
    inicio_em: "",
    fim_em: "",
    lance_inicial: "",
    incremento_minimo: "500",
    prorrogacao_ativa: true,
    prorrogacao_janela_minutos: "2",
    prorrogacao_tempo_minutos: "2",
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["publicacao-canais", veiculoId],
    queryFn: () => getCanaisPublicacaoFn({ data: { veiculoId } }),
    enabled: !!veiculoId,
  });

  const { data: leilaoRes, refetch: refetchLeilao } = useQuery({
    queryKey: ["leilao-veiculo", veiculoId],
    queryFn: () => getLeilaoVeiculoFn({ data: { veiculoId } }),
    enabled: !!veiculoId,
  });
  const leilaoAtual: any = (leilaoRes as any)?.data ?? null;

  useEffect(() => {
    if (!leilaoAtual) return;
    setLeilao({
      inicio_em: paraInputLocal(leilaoAtual.inicio_em),
      fim_em: paraInputLocal(leilaoAtual.fim_em),
      lance_inicial: leilaoAtual.lance_inicial ? String(Number(leilaoAtual.lance_inicial)) : "",
      incremento_minimo: leilaoAtual.incremento_minimo
        ? String(Number(leilaoAtual.incremento_minimo))
        : "500",
      prorrogacao_ativa: leilaoAtual.prorrogacao_ativa !== false,
      prorrogacao_janela_minutos: String(Math.round((leilaoAtual.prorrogacao_janela_segundos ?? 120) / 60)),
      prorrogacao_tempo_minutos: String(Math.round((leilaoAtual.prorrogacao_tempo_segundos ?? 120) / 60)),
    });
  }, [leilaoRes]);

  const payload = (data as any)?.data;
  const canais: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.canais)
      ? payload.canais
      : [];

  useEffect(() => {
    const c = canais.find((x) => x.canal === canalAtivo);
    setForm({
      ativo: !!c?.ativo,
      titulo: c?.titulo || "",
      descricao: c?.descricao || "",
      fotos: Array.isArray(c?.fotos) ? c.fotos : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canalAtivo, data]);

  async function salvar() {
    setSalvando(true);
    try {
      const res: any = await salvarCanalPublicacaoFn({
        data: { veiculo_id: veiculoId, canal: canalAtivo, ...form },
      });
      if (!res?.ok) {
        toast.error(res?.message || "Erro ao salvar canal.");
        return;
      }
      if (canalAtivo === "LEILAO" && form.ativo) {
        if (!leilao.inicio_em || !leilao.fim_em || !Number(leilao.lance_inicial)) {
          toast.error("Preencha início, encerramento e lance inicial do leilão.");
          return;
        }
        const resL: any = await salvarLeilaoVeiculoFn({
          data: {
            veiculo_id: veiculoId,
            inicio_em: new Date(leilao.inicio_em).toISOString(),
            fim_em: new Date(leilao.fim_em).toISOString(),
            lance_inicial: Number(leilao.lance_inicial),
            incremento_minimo: Number(leilao.incremento_minimo || 0),
            prorrogacao_ativa: leilao.prorrogacao_ativa,
            prorrogacao_janela_segundos: Math.max(1, Number(leilao.prorrogacao_janela_minutos || 2)) * 60,
            prorrogacao_tempo_segundos: Math.max(1, Number(leilao.prorrogacao_tempo_minutos || 2)) * 60,
          },
        });
        if (!resL?.ok) {
          toast.error(resL?.message || "Erro ao salvar o leilão.");
          return;
        }
        refetchLeilao();
      }
      toast.success(`Canal ${canalAtivo.toLowerCase()} atualizado.`);
      refetch();
    } finally {
      setSalvando(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {CANAIS.map((c) => {
          const cfg = canais.find((x) => x.canal === c.id);
          const ativo = canalAtivo === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCanalAtivo(c.id)}
              className={cn(
                "rounded-2xl border-2 p-4 text-left transition-all",
                ativo ? "border-teal-600 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-200",
              )}
            >
              <div className="flex items-center justify-between">
                <c.icon className={cn("h-5 w-5", ativo ? "text-teal-700" : "text-slate-400")} />
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                    cfg?.ativo ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {cfg?.ativo ? "Publicado" : "Inativo"}
                </span>
              </div>
              <p className="mt-3 text-sm font-black uppercase text-slate-900">{c.label}</p>
              <p className="mt-1 text-xs font-medium text-slate-500">{c.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Publicar no canal {canalAtivo.toLowerCase()}
            </p>
            <p className="text-sm font-medium text-slate-500">
              Textos e fotos são independentes por canal.
            </p>
          </div>
          <Switch
            checked={form.ativo}
            onCheckedChange={(v: boolean) => setForm({ ...form, ativo: v })}
          />
        </div>

        <Input
          placeholder="Título exibido neste canal"
          className="h-12"
          value={form.titulo}
          onChange={(e) => setForm({ ...form, titulo: e.target.value })}
        />
        <Textarea
          placeholder="Descrição / texto comercial deste canal"
          rows={5}
          value={form.descricao}
          onChange={(e) => setForm({ ...form, descricao: e.target.value })}
        />

        {canalAtivo === "LEILAO" && (
          <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700">
                Parâmetros do leilão
              </p>
              {leilaoAtual && (
                <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                  {leilaoAtual.status}
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Início das ofertas</label>
                <Input
                  type="datetime-local"
                  className="h-11 bg-white"
                  value={leilao.inicio_em}
                  onChange={(e) => setLeilao({ ...leilao, inicio_em: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Encerramento</label>
                <Input
                  type="datetime-local"
                  className="h-11 bg-white"
                  value={leilao.fim_em}
                  onChange={(e) => setLeilao({ ...leilao, fim_em: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Lance inicial (R$)</label>
                <Input
                  inputMode="numeric"
                  placeholder="45000"
                  className="h-11 bg-white"
                  value={leilao.lance_inicial}
                  onChange={(e) =>
                    setLeilao({ ...leilao, lance_inicial: e.target.value.replace(/[^\d.]/g, "") })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Incremento mínimo (R$)</label>
                <Input
                  inputMode="numeric"
                  placeholder="500"
                  className="h-11 bg-white"
                  value={leilao.incremento_minimo}
                  onChange={(e) =>
                    setLeilao({ ...leilao, incremento_minimo: e.target.value.replace(/[^\d.]/g, "") })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-white p-3">
              <div>
                <p className="text-sm font-bold text-slate-800">Prorrogação automática</p>
                <p className="text-xs text-slate-500">
                  Evita lances de última hora (anti-sniping).
                </p>
              </div>
              <Switch
                checked={leilao.prorrogacao_ativa}
                onCheckedChange={(v: boolean) => setLeilao({ ...leilao, prorrogacao_ativa: v })}
              />
            </div>

            {leilao.prorrogacao_ativa && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">
                    Lance nos últimos (min)
                  </label>
                  <Input
                    inputMode="numeric"
                    className="h-11 bg-white"
                    value={leilao.prorrogacao_janela_minutos}
                    onChange={(e) =>
                      setLeilao({
                        ...leilao,
                        prorrogacao_janela_minutos: e.target.value.replace(/\D/g, ""),
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600">Prorroga por (min)</label>
                  <Input
                    inputMode="numeric"
                    className="h-11 bg-white"
                    value={leilao.prorrogacao_tempo_minutos}
                    onChange={(e) =>
                      setLeilao({
                        ...leilao,
                        prorrogacao_tempo_minutos: e.target.value.replace(/\D/g, ""),
                      })
                    }
                  />
                </div>
              </div>
            )}

            <p className="text-xs font-medium text-amber-800">
              Ative o canal e salve para publicar o leilão. Ele fica AGENDADO até a data de início
              e passa a ATIVO automaticamente.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Fotos do canal
          </p>
          <UploadFotos
            fotos={form.fotos}
            onChange={(fotos) => setForm({ ...form, fotos })}
          />
        </div>

        <Button
          onClick={salvar}
          disabled={salvando}
          className="h-12 w-full rounded-xl bg-teal-600 font-bold hover:bg-teal-700"
        >
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar canal
        </Button>
      </div>
    </div>
  );
}
