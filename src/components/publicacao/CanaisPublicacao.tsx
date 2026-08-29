import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gavel, Megaphone, Store, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getCanaisPublicacaoFn, salvarCanalPublicacaoFn } from "@/lib/publicacao.functions";

const CANAIS = [
  { id: "LEILAO", label: "Leilão", icon: Gavel, desc: "Sala de lances com cronômetro e incremento." },
  { id: "ANUNCIO", label: "Anúncio", icon: Megaphone, desc: "Peça comercial para divulgação direta." },
  { id: "VITRINE", label: "Vitrine", icon: Store, desc: "Listagem pública, sem exibir valores." },
] as const;

type CanalId = (typeof CANAIS)[number]["id"];

export function CanaisPublicacao({ veiculoId }: { veiculoId: string }) {
  const [canalAtivo, setCanalAtivo] = useState<CanalId>("LEILAO");
  const [form, setForm] = useState<any>({ ativo: false, titulo: "", descricao: "", fotos: [] });
  const [novaFoto, setNovaFoto] = useState("");
  const [salvando, setSalvando] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["publicacao-canais", veiculoId],
    queryFn: () => getCanaisPublicacaoFn({ data: { veiculoId } }),
    enabled: !!veiculoId,
  });

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

        <div className="space-y-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Fotos do canal
          </p>
          <div className="flex flex-wrap gap-3">
            {form.fotos.map((url: string, i: number) => (
              <div key={i} className="relative h-20 w-28 overflow-hidden rounded-xl bg-slate-100">
                <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, fotos: form.fotos.filter((_: string, j: number) => j !== i) })
                  }
                  className="absolute right-1 top-1 rounded-full bg-slate-950/70 p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="URL da foto"
              className="h-11"
              value={novaFoto}
              onChange={(e) => setNovaFoto(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                if (!novaFoto.trim()) return;
                setForm({ ...form, fotos: [...form.fotos, novaFoto.trim()] });
                setNovaFoto("");
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
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
