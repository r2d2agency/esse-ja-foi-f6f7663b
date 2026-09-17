import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { obterRelatorioConsultasFn } from "@/lib/consulta-veicular.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Loader2,
  FileDown,
  ShieldCheck,
  ShieldAlert,
  MinusCircle,
  Car,
  TrendingDown,
  Gavel,
  AlertTriangle,
  CircleDollarSign,
  Lock,
} from "lucide-react";

type ConsultaNormalizada = {
  id: string;
  status: string;
  protocolo: string | null;
  criadoEm: string | null;
  erro: string | null;
  dados: any;
} | null;

function dataBr(valor?: string | null) {
  if (!valor) return "—";
  const d = new Date(valor);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

function moeda(valor: any): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function percentual(valor: any): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** Cartão de verificação do laudo cautelar: verde quando sem ocorrência, vermelho quando há alerta. */
function CartaoSituacao({
  titulo,
  valor,
  icone: Icone,
  semOcorrencia,
}: {
  titulo: string;
  valor: string | null | undefined;
  icone: any;
  semOcorrencia: boolean;
}) {
  const temInfo = !!valor;
  const ok = semOcorrencia || !temInfo;
  return (
    <div
      className={`rounded-xl border p-3 ${
        ok ? "border-teal-100 bg-teal-50/60" : "border-red-200 bg-red-50"
      }`}
    >
      <div className="flex items-center gap-2">
        {ok ? (
          <ShieldCheck className="h-4 w-4 text-teal-600" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-red-600" />
        )}
        <p
          className={`text-[10px] font-black uppercase tracking-wider ${ok ? "text-teal-700" : "text-red-700"}`}
        >
          {titulo}
        </p>
      </div>
      <p className={`mt-1 text-xs font-bold break-words ${ok ? "text-slate-700" : "text-red-800"}`}>
        {temInfo ? String(valor) : "Sem ocorrência"}
      </p>
    </div>
  );
}

export function RelatorioConsultaVeicular({
  veiculoId,
  placa,
  marca,
  modelo,
  ano,
}: {
  veiculoId: string;
  placa?: string | null;
  marca?: string | null;
  modelo?: string | null;
  ano?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exportando, setExportando] = useState(false);

  const { data: res, isLoading } = useQuery({
    queryKey: ["relatorio-consultas", veiculoId],
    queryFn: () => obterRelatorioConsultasFn({ data: { veiculoId } }),
  });
  const gold: ConsultaNormalizada = res?.data?.gold ?? null;
  const fipe: ConsultaNormalizada = res?.data?.fipe ?? null;
  const historico: any[] = Array.isArray(fipe?.dados?.historico) ? fipe.dados.historico : [];
  const resumo = fipe?.dados?.resumo;

  async function exportarPdf() {
    if (!containerRef.current) return;
    setExportando(true);
    try {
      const [html2canvas, jspdfMod] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas.default(containerRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const pdf = new jspdfMod.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const larguraPagina = pdf.internal.pageSize.getWidth();
      const alturaPagina = pdf.internal.pageSize.getHeight();
      const margem = 8;
      const larguraImg = larguraPagina - margem * 2;
      const alturaImg = (canvas.height * larguraImg) / canvas.width;
      let restante = alturaImg;
      let posicao = 0;
      while (restante > 0) {
        pdf.addImage(
          canvas.toDataURL("image/jpeg", 0.92),
          "JPEG",
          margem,
          margem - posicao,
          larguraImg,
          alturaImg,
        );
        restante -= alturaPagina - margem * 2;
        posicao += alturaPagina - margem * 2;
        if (restante > 0) pdf.addPage();
      }
      pdf.save(`relatorio-${(placa || veiculoId).slice(0, 12)}.pdf`);
      toast.success("PDF exportado.");
    } catch (e: any) {
      toast.error("Falha ao exportar PDF: " + (e?.message || e));
    } finally {
      setExportando(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white p-10">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!gold && !fipe) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center">
        <p className="text-sm font-bold text-slate-700">Relatório de consulta veicular</p>
        <p className="mt-1 text-sm text-slate-500">
          Nenhuma consulta Company Conferi concluída para este veículo. Use “Consultar agora” abaixo
          para gerar o laudo cautelar (Gold) e a consulta FIPE.
        </p>
      </div>
    );
  }

  const temConteudo = (gold?.dados && Object.values(gold.dados).some((v: any) => v)) || fipe?.dados;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          Relatório de consulta veicular
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={exportarPdf}
          disabled={exportando || !temConteudo}
        >
          {exportando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="mr-2 h-4 w-4" />
          )}
          Exportar PDF
        </Button>
      </div>

      <div
        ref={containerRef}
        className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6"
      >
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600">
              <Car className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-slate-950">
                {marca || "—"} {modelo || ""} {ano ? `• ${ano}` : ""}
              </p>
              <p className="text-xs font-bold text-slate-500">
                Placa {placa || "—"} • Consulta Company Conferi
              </p>
            </div>
          </div>
          <div className="text-right text-[11px] font-medium text-slate-500">
            {gold?.protocolo && <p>Protocolo Gold: {gold.protocolo}</p>}
            {gold?.criadoEm && <p>Laudo cautelar: {dataBr(gold.criadoEm)}</p>}
            {fipe?.criadoEm && <p>FIPE: {dataBr(fipe.criadoEm)}</p>}
          </div>
        </div>

        {/* Laudo cautelar (Gold) */}
        {gold?.dados && Object.values(gold.dados).some((v: any) => v) && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-slate-400" />
              <p className="text-sm font-black uppercase text-slate-950">Laudo cautelar (Gold)</p>
              {gold.status && (
                <Badge
                  variant={gold.status === "CONCLUIDA" ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {gold.status}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <CartaoSituacao
                titulo="Situação do veículo"
                valor={gold.dados.situacao}
                icone={ShieldCheck}
                semOcorrencia={false}
              />
              <CartaoSituacao
                titulo="Roubo / furto"
                valor={gold.dados.roubo_furto}
                icone={AlertTriangle}
                semOcorrencia
              />
              <CartaoSituacao
                titulo="Lance"
                valor={gold.dados.leilao}
                icone={Gavel}
                semOcorrencia
              />
              <CartaoSituacao
                titulo="Sinistro"
                valor={gold.dados.sinistro}
                icone={AlertTriangle}
                semOcorrencia
              />
              <CartaoSituacao
                titulo="Débitos"
                valor={gold.dados.debitos}
                icone={CircleDollarSign}
                semOcorrencia
              />
              <CartaoSituacao
                titulo="Restrições"
                valor={gold.dados.restricoes}
                icone={Lock}
                semOcorrencia
              />
            </div>
            {gold.dados.renajud && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                RENAJUD: {String(gold.dados.renajud)}
              </p>
            )}
          </section>
        )}

        {/* FIPE + desvalorização */}
        {fipe?.dados && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-slate-400" />
              <p className="text-sm font-black uppercase text-slate-950">FIPE e desvalorização</p>
              {fipe.status && (
                <Badge
                  variant={fipe.status === "CONCLUIDA" ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {fipe.status}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Valor FIPE atual
                </p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {moeda(fipe.dados.valorNumero)}
                </p>
                <p className="text-[10px] font-medium text-slate-500">
                  ref. {fipe.dados.mesReferencia || "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Variação acumulada
                </p>
                <p
                  className={`mt-1 text-lg font-black ${
                    Number(resumo?.variacaoAcumuladaPercentual) <= 0
                      ? "text-teal-700"
                      : "text-red-600"
                  }`}
                >
                  {percentual(resumo?.variacaoAcumuladaPercentual)}
                </p>
                <p className="text-[10px] font-medium text-slate-500">
                  {resumo?.anosAnalisados ?? "—"} anos analisados
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Código FIPE
                </p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {fipe.dados.codigoFipe || "—"}
                </p>
                <p className="text-[10px] font-medium text-slate-500">
                  {fipe.dados.combustivel || ""}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Ano modelo
                </p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {fipe.dados.anoModelo || "—"}
                </p>
                <p className="text-[10px] font-medium text-slate-500">{fipe.dados.marca || ""}</p>
              </div>
            </div>

            {historico.length > 1 && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  Curva de desvalorização
                </p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart
                    data={historico.map((h) => ({
                      ...h,
                      rotulo: String(h.referencia || "").split("/")[1],
                    }))}
                    margin={{ top: 5, right: 10, bottom: 0, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="#94a3b8"
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                      width={45}
                    />
                    <Tooltip
                      formatter={(valor: any) => [moeda(valor), "Valor FIPE"]}
                      labelFormatter={(rotulo: any, payload: any) =>
                        `Ref. ${payload?.[0]?.payload?.referencia || rotulo}`
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="valor"
                      stroke="#0d9488"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#0d9488" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {historico.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <th className="px-3 py-2">Referência</th>
                      <th className="px-3 py-2 text-right">Valor FIPE</th>
                      <th className="px-3 py-2 text-right">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((h, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-1.5 font-bold text-slate-700">
                          {h.referencia || "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right font-black text-slate-950">
                          {moeda(h.valor)}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-bold ${
                            Number(h.variacaoPercentual) < 0
                              ? "text-red-600"
                              : Number(h.variacaoPercentual) > 0
                                ? "text-teal-700"
                                : "text-slate-400"
                          }`}
                        >
                          {i === 0 ? "—" : percentual(h.variacaoPercentual)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!temConteudo && (
          <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
            As consultas deste veículo ainda não retornaram dados utilizáveis.
            {gold?.erro || fipe?.erro ? ` Último erro: ${gold?.erro || fipe?.erro}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
