import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalyticsFn } from "@/lib/analytics.functions";
import { Card, CardContent } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({
    meta: [
      { title: "Dashboard analítico | ESSE JÁ FOI" },
      { name: "description", content: "Gráficos de veículos, vistorias, lances e vendas da operação." },
      { property: "og:title", content: "Dashboard analítico | ESSE JÁ FOI" },
      { property: "og:description", content: "Indicadores e gráficos da operação de leilão de veículos." },
    ],
  }),
  component: Analytics,
});

const CORES = ["#0f766e", "#0ea5e9", "#f59e0b", "#8b5cf6", "#ef4444", "#22c55e", "#64748b", "#e11d48"];

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);

function rotuloMes(mes: string) {
  const [ano, m] = mes.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? m}/${(ano ?? "").slice(2)}`;
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="p-5 space-y-4">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">{titulo}</h2>
        <div className="h-[260px]">{children}</div>
      </CardContent>
    </Card>
  );
}

function Analytics() {
  const carregar = useServerFn(getAnalyticsFn);
  const { data: res, isLoading } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: () => carregar(),
    refetchInterval: 60000,
  });

  const d = res?.ok ? res.data : null;

  const veiculosMes = (d?.veiculosMes ?? []).map((r) => ({ ...r, mes: rotuloMes(r.mes) }));
  const vistoriasMes = (d?.vistoriasMes ?? []).map((r) => ({ ...r, mes: rotuloMes(r.mes) }));
  const lancesMes = (d?.lancesMes ?? []).map((r) => ({ ...r, mes: rotuloMes(r.mes) }));
  const compradoresMes = (d?.compradoresMes ?? []).map((r) => ({ ...r, mes: rotuloMes(r.mes) }));
  const vendasMes = (d?.vendasMes ?? []).map((r) => ({ ...r, mes: rotuloMes(r.mes) }));

  const cards = [
    { label: "Veículos cadastrados", value: d?.resumo.veiculos ?? 0, cor: "text-slate-950" },
    { label: "Vendedores", value: d?.resumo.vendedores ?? 0, cor: "text-amber-600" },
    { label: "Compradores", value: d?.resumo.compradores ?? 0, cor: "text-sky-600" },
    { label: "Lances registrados", value: d?.resumo.lances ?? 0, cor: "text-teal-600" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-black text-slate-950 uppercase tracking-tight">Dashboard analítico</h1>
        <p className="text-slate-500 font-medium">Evolução dos últimos 12 meses da operação.</p>
      </div>

      {res && !res.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600">
          {res.message}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className={`text-3xl font-black tabular-nums ${c.cor}`}>{isLoading ? "..." : c.value}</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Bloco titulo="Veículos cadastrados por mês">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={veiculosMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="total" name="Veículos" stroke="#0f766e" fill="#0f766e" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </Bloco>

        <Bloco titulo="Vistorias realizadas por mês">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vistoriasMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" name="Vistorias" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Bloco>

        <Bloco titulo="Lances por mês">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lancesMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="total" name="Lances" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Bloco>

        <Bloco titulo="Volume de vendas concluídas">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vendasMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => brl(Number(v))} width={90} />
              <Tooltip formatter={(v: any, n: any) => (n === "Volume" ? brl(Number(v)) : v)} />
              <Legend />
              <Bar dataKey="valor" name="Volume" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Bloco>

        <Bloco titulo="Veículos por status">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={d?.veiculosPorStatus ?? []} dataKey="total" nameKey="nome" outerRadius={95} label>
                {(d?.veiculosPorStatus ?? []).map((_, i) => (
                  <Cell key={i} fill={CORES[i % CORES.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Bloco>

        <Bloco titulo="Top marcas cadastradas">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d?.topMarcas ?? []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="nome" fontSize={11} width={90} />
              <Tooltip />
              <Bar dataKey="total" name="Veículos" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Bloco>

        <Bloco titulo="Veículos por estado (UF)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d?.porUf ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="nome" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" name="Veículos" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Bloco>

        <Bloco titulo="Novos compradores por mês">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={compradoresMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="total" name="Compradores" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </Bloco>
      </div>

      <Bloco titulo="Leilões por status">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={d?.leiloes ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="nome" fontSize={11} />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="total" name="Leilões" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Bloco>
    </div>
  );
}
