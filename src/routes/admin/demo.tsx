import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  statusDemoFn,
  semearDemoFn,
  resetarChecklistDemoFn,
  aprovarChecklistDemoFn,
  criarLeilaoDemoFn,
} from "@/lib/demo.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Beaker, RefreshCw, CheckCircle2, Gavel, Car, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/admin/demo")({
  component: DemoPage,
  head: () => ({
    meta: [
      { title: "Ambiente de Demonstração | Esse Já Foi" },
      {
        name: "description",
        content:
          "Crie um vendedor e um veículo aprovado de demonstração para testar checklist, divulgação e leilão.",
      },
      { property: "og:title", content: "Ambiente de Demonstração | Esse Já Foi" },
      {
        property: "og:description",
        content: "Ambiente de testes para checklist, divulgação e leilão da plataforma Esse Já Foi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DemoPage() {
  const qc = useQueryClient();
  const carregar = useServerFn(statusDemoFn);
  const semear = useServerFn(semearDemoFn);
  const resetar = useServerFn(resetarChecklistDemoFn);
  const aprovar = useServerFn(aprovarChecklistDemoFn);
  const leiloar = useServerFn(criarLeilaoDemoFn);
  const [acao, setAcao] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-demo-status"],
    queryFn: () => carregar({ data: {} } as any),
  });

  const st: any = data || {};

  async function executar(nome: string, fn: () => Promise<any>, sucesso: string) {
    setAcao(nome);
    try {
      const r: any = await fn();
      if (r?.ok === false) {
        toast.error(r.message || "Falha na operação.");
        return;
      }
      toast.success(sucesso);
      await qc.invalidateQueries({ queryKey: ["admin-demo-status"] });
    } catch (e: any) {
      toast.error(e?.message || "Falha inesperada.");
    } finally {
      setAcao(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-black uppercase tracking-tight text-slate-950">
          <Beaker className="h-6 w-6 text-teal-600" /> Ambiente de demonstração
        </h1>
        <p className="font-medium text-slate-500">
          Vendedor e veículo modelo já aprovados para rodar o checklist quantas vezes quiser, validar a divulgação e o leilão.
        </p>
      </header>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-500">
            Situação atual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {isLoading ? (
            <p className="text-slate-400">Carregando…</p>
          ) : !st.existe ? (
            <p className="font-medium text-slate-500">
              Nenhum ambiente criado ainda. Clique em “Criar/atualizar ambiente demo”.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <Info titulo="Veículo" valor={`${st.veiculo?.marca} ${st.veiculo?.modelo} · ${st.veiculo?.placa}`} />
              <Info titulo="Status de análise" valor={st.veiculo?.status_analise || "-"} />
              <Info
                titulo="Vistoria"
                valor={st.vistoria ? `${st.vistoria.status} · ${st.vistoria.data_vistoria} ${String(st.vistoria.horario_vistoria).slice(0, 5)}` : "sem vistoria"}
              />
              <Info titulo="Laudo" valor={st.laudo ? `${st.laudo.status} · ${st.laudo.itens} itens` : "não iniciado"} />
              <Info
                titulo="Leilão"
                valor={st.leilao ? `${st.leilao.status} · ${st.leilao.lances} lance(s)` : "nenhum"}
              />
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Canais</p>
                <div className="flex flex-wrap gap-1 pt-1">
                  {(st.canais || []).length === 0 ? (
                    <span className="text-slate-400">nenhum liberado</span>
                  ) : (
                    st.canais.map((c: any) => (
                      <Badge key={c.canal} variant={c.ativo ? "default" : "outline"} className="text-[10px] font-bold">
                        {c.canal} {c.ativo ? "ON" : "OFF"}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {st.credenciais && (
            <div className="rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-600">
              <p className="pb-1 font-black uppercase tracking-wider text-slate-400">Acessos de teste (senha: {st.credenciais.senha})</p>
              <p>Vendedor: {st.credenciais.vendedor}</p>
              <p>Comprador: {st.credenciais.comprador}</p>
              <p>Vistoriador: {st.credenciais.vistoriador}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Acao
          icone={<Car className="h-4 w-4" />}
          titulo="1. Criar/atualizar ambiente demo"
          texto="Cria o vendedor aprovado, o comprador habilitado, a unidade, o vistoriador e o veículo pronto para vistoria."
          loading={acao === "semear"}
          onClick={() => executar("semear", () => semear({ data: {} } as any), "Ambiente demo pronto.")}
        />
        <Acao
          icone={<RefreshCw className="h-4 w-4" />}
          titulo="2. Refazer o checklist"
          texto="Apaga o laudo atual e devolve a vistoria para hoje, permitindo executar o checklist novamente."
          loading={acao === "reset"}
          onClick={() => executar("reset", () => resetar({ data: {} } as any), "Checklist liberado para nova execução.")}
        />
        <Acao
          icone={<CheckCircle2 className="h-4 w-4" />}
          titulo="3. Aprovar checklist e liberar divulgação"
          texto="Marca o veículo como PRONTO_PARA_ANUNCIO e habilita os canais Leilão, Anúncio e Vitrine."
          loading={acao === "aprovar"}
          onClick={() => executar("aprovar", () => aprovar({ data: {} }), "Divulgação liberada.")}
        />
        <Acao
          icone={<Gavel className="h-4 w-4" />}
          titulo="4. Abrir leilão de teste (24h)"
          texto="Cria um leilão ativo com lance inicial de R$ 45.000 e incremento de R$ 500 para validar os lances."
          loading={acao === "leilao"}
          onClick={() => executar("leilao", () => leiloar({ data: { horas: 24 } }), "Leilão de teste ativo.")}
        />
      </div>

      {st.veiculo?.id && (
        <div className="flex flex-wrap gap-2">
          <Link to="/admin/veiculo/$id" params={{ id: st.veiculo.id } as any}>
            <Button variant="outline" className="font-bold">
              Abrir veículo no admin <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
          <Link to="/admin/vistorias">
            <Button variant="outline" className="font-bold">
              Fila de vistorias <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
          <Link to="/admin/leiloes">
            <Button variant="outline" className="font-bold">
              Leilões <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function Info({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{titulo}</p>
      <p className="font-bold text-slate-800">{valor}</p>
    </div>
  );
}

function Acao({
  icone,
  titulo,
  texto,
  loading,
  onClick,
}: {
  icone: React.ReactNode;
  titulo: string;
  texto: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Card className="border-slate-200">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2 font-black uppercase tracking-tight text-slate-900">
          <span className="text-teal-600">{icone}</span> {titulo}
        </div>
        <p className="text-sm font-medium text-slate-500">{texto}</p>
        <Button onClick={onClick} disabled={loading} className="h-11 w-full rounded-xl bg-teal-600 font-bold hover:bg-teal-700">
          {loading ? "Processando…" : "Executar"}
        </Button>
      </CardContent>
    </Card>
  );
}
