import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listarEventosConsultaFn } from "@/lib/consulta-logs.functions";
import { getSessionToken } from "@/lib/session";

type Filtros = { placa?: string; veiculo?: string; codigo?: string; status?: string; produto?: string; pagina?: number };
const statusOpcoes = { PENDENTE: "Pendente / enviada", PROCESSANDO: "Processando", RECEBIDA: "Resposta recebida", CONCLUIDA: "Concluída", ERRO: "Erro" };
const produtos = { "conferi-agregados": "Agregados", "conferi-desvalorizacao-fipe": "FIPE", "conferi-auto-pericia-gold": "Gold" };
const eventos: Record<string, string> = { CONSULTA_ENVIADA: "Consulta enviada", RESGATE_ENVIADO: "Resgate enviado", RESPOSTA_RECEBIDA: "Resposta recebida", AGUARDANDO_RESPOSTA: "Aguardando resposta", WEBHOOK_RECEBIDO: "Webhook recebido", CONSULTA_CONCLUIDA: "Consulta concluída", RESULTADO_DISPONIVEL: "Resultado disponível", VALOR_FIPE_ATUALIZADO: "Valor FIPE atualizado", CONSULTA_NAO_LOCALIZADA: "Código não localizado", FALHA_COMUNICACAO: "Falha de comunicação", FALHA_CONSULTA: "Falha na consulta", FALHA_RESGATE: "Falha no resgate", FALHA_REGISTRO: "Falha ao salvar", FALHA_WEBHOOK: "Falha no webhook" };
const origens: Record<string, string> = { CADASTRO: "Cadastro do veículo", TESTE: "Teste nas configurações", WEBHOOK: "Webhook", POR_PLACA: "Consulta por placa", HOMOLOGACAO: "Homologação" };

export const Route = createFileRoute("/admin/logs-consultas")({
  validateSearch: (search: Record<string, unknown>): Filtros => ({
    placa: typeof search.placa === "string" ? search.placa.slice(0, 20) : undefined,
    veiculo: typeof search.veiculo === "string" ? search.veiculo.slice(0, 120) : undefined,
    codigo: typeof search.codigo === "string" ? search.codigo.slice(0, 100) : undefined,
    status: typeof search.status === "string" && search.status in statusOpcoes ? search.status : undefined,
    produto: typeof search.produto === "string" && search.produto in produtos ? search.produto : undefined,
    pagina: Number.isInteger(Number(search.pagina)) ? Math.min(100000, Math.max(0, Number(search.pagina))) : 0,
  }),
  component: LogsConsultasPage,
});

function LogsConsultasPage() {
  const filtros = Route.useSearch();
  const navigate = Route.useNavigate();
  const [form, setForm] = useState<Filtros>(filtros);
  useEffect(() => setForm(filtros), [filtros]);
  const { data, error, isFetching, isPending, refetch } = useQuery({
    queryKey: ["logs-consultas", filtros],
    queryFn: async () => {
      const resultado = await listarEventosConsultaFn({ data: {
        ...filtros, pagina: filtros.pagina || 0, token: getSessionToken() || "",
        status: filtros.status as keyof typeof statusOpcoes | undefined,
        produto: filtros.produto as keyof typeof produtos | undefined,
      } });
      if (!resultado.ok) throw new Error(resultado.message);
      return resultado;
    },
    refetchInterval: 10000,
    retry: 1,
  });
  const aplicar = (valores: Filtros) => void navigate({ search: { ...valores, pagina: 0 } });
  const pagina = filtros.pagina || 0;
  const total = data?.total || 0;
  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Logs de consultas</h1>
          <p className="mt-1 text-sm text-slate-500">Company Conferi · envios, respostas e atualizações por webhook.</p>
        </div>
        <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={isFetching ? "animate-spin motion-reduce:animate-none" : ""} /> Atualizar
        </Button>
      </header>

      <form noValidate onSubmit={(event) => { event.preventDefault(); aplicar(form); }} className="grid gap-4 rounded-xl border bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
        {([['placa', 'Placa', 'ABC1D23'], ['veiculo', 'Veículo', 'Marca, modelo ou ID'], ['codigo', 'Código da consulta', 'Código Company ou ID interno']] as const).map(([campo, titulo, placeholder]) => (
          <div className="space-y-2" key={campo}>
            <Label htmlFor={`consulta-log-${campo}`}>{titulo}</Label>
            <div className="relative">
              <Input id={`consulta-log-${campo}`} value={form[campo] || ""} placeholder={placeholder} maxLength={campo === "placa" ? 20 : campo === "codigo" ? 100 : 120} className="pr-9" onChange={(event) => setForm({ ...form, [campo]: event.target.value })} />
              {form[campo] && <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" aria-label={`Limpar ${titulo.toLowerCase()}`} onClick={() => { const novo = { ...form, [campo]: "" }; setForm(novo); aplicar(novo); document.getElementById(`consulta-log-${campo}`)?.focus(); }}><X /></Button>}
            </div>
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="consulta-log-status">Status do evento</Label>
          <Select value={form.status || "TODOS"} onValueChange={(value) => setForm({ ...form, status: value === "TODOS" ? "" : value })}>
            <SelectTrigger id="consulta-log-status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="TODOS">Todos os status</SelectItem>{Object.entries(statusOpcoes).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="consulta-log-produto">Produto</Label>
          <Select value={form.produto || "TODOS"} onValueChange={(value) => setForm({ ...form, produto: value === "TODOS" ? "" : value })}>
            <SelectTrigger id="consulta-log-produto"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="TODOS">Todos os produtos</SelectItem>{Object.entries(produtos).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-5">
          <Button type="submit"><Search /> Filtrar</Button>
          <Button type="button" variant="outline" onClick={() => { setForm({}); aplicar({}); }}>Limpar filtros</Button>
        </div>
      </form>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error.message} <Button variant="outline" size="sm" onClick={() => void refetch()}>Tentar novamente</Button></div>}
      <p role="status" className="text-sm text-slate-500">{isPending ? "Carregando eventos…" : `${total} eventos encontrados. Atualização automática a cada 10 segundos.`}</p>
      <div className="rounded-xl border bg-white" aria-busy={isFetching}>
        <Table className="min-w-[980px]">
          <TableHeader><TableRow>{["Data e hora", "Placa / veículo", "Produto / origem", "Evento / status", "Código / rastreio", "Detalhes"].map((titulo) => <TableHead key={titulo}>{titulo}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {!data?.data.length && <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-500">{isPending ? "Carregando…" : error ? "Não foi possível carregar o histórico." : "Nenhum evento encontrado. Os logs são registrados a partir da ativação desta funcionalidade."}</TableCell></TableRow>}
            {data?.data.map((item) => <TableRow key={item.id}>
              <TableCell className="whitespace-nowrap text-xs">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(item.criado_em))}</TableCell>
              <TableCell><div className="font-mono font-semibold">{item.placa || "Não identificada"}</div>{item.veiculo_id ? <Link to="/admin/veiculo/$id" params={{ id: item.veiculo_id }} className="text-xs text-teal-700 underline">{item.veiculo_nome || "Abrir veículo"}</Link> : <span className="text-xs text-slate-500">Sem vínculo de veículo</span>}</TableCell>
              <TableCell><div>{produtos[item.produto as keyof typeof produtos] || item.produto || "Não identificado"}</div><div className="text-xs text-slate-500">{origens[item.origem] || item.origem}</div></TableCell>
              <TableCell><div className="mb-1 text-sm font-medium">{eventos[item.evento] || item.evento}</div><Badge variant="outline" className={item.status === "ERRO" ? "border-red-200 text-red-700" : item.status === "CONCLUIDA" ? "border-teal-200 text-teal-700" : "border-amber-200 text-amber-800"}>{statusOpcoes[item.status as keyof typeof statusOpcoes] || item.status}</Badge></TableCell>
              <TableCell>{item.protocolo ? <Button variant="link" className="h-auto p-0 font-mono" onClick={() => aplicar({ codigo: item.protocolo || "" })}>{item.protocolo}</Button> : <span className="text-xs text-slate-500">Aguardando código</span>}<details className="mt-1 max-w-52 text-xs"><summary className="cursor-pointer text-slate-500">IDs internos</summary><p className="break-all">Requisição: {item.rastreio_id}</p>{item.consulta_id && <p className="mt-1 break-all">Consulta: {item.consulta_id}</p>}</details></TableCell>
              <TableCell className="max-w-sm"><p className="text-sm">{item.mensagem}</p><p className="mt-1 text-xs text-slate-500">{item.http_status != null ? `HTTP ${item.http_status || "sem resposta"}` : ""}{item.duracao_ms != null ? ` · ${item.duracao_ms} ms` : ""}</p></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <p>Página {pagina + 1} · até 50 eventos por página · horário de Brasília</p>
        <div className="flex gap-2"><Button variant="outline" disabled={!pagina || isFetching} onClick={() => void navigate({ search: { ...filtros, pagina: pagina - 1 } })}>Anterior</Button><Button variant="outline" disabled={(pagina + 1) * 50 >= total || isFetching} onClick={() => void navigate({ search: { ...filtros, pagina: pagina + 1 } })}>Próxima</Button></div>
      </footer>
    </div>
  );
}
