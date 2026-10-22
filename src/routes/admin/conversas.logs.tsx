import { createFileRoute, Link } from "@tanstack/react-router";
import React, { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Activity,
  MessageSquare,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  ScrollText,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWebhookLogsFn, executarDiagnosticoFn } from "@/lib/comunicacoes.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/conversas/logs")({
  component: LogWhatsAppPage,
});

/**
 * Log da API Meta (WhatsApp).
 *
 * A conversa estava quebrada sem deixar rastro: o webhook só gravava log depois
 * de validar a assinatura HMAC, então um `app_secret` divergente devolvia 401 e
 * esta tela permanecia vazia — sem como descobrir o motivo. Agora todo desfecho
 * do webhook vira linha aqui, e o diagnóstico no topo diz se a configuração da
 * Meta está completa, sem precisar rodar SELECT no banco.
 */

type Diagnostico = {
  geradoEm: string;
  status: "OK" | "ATENCAO";
  problemas: string[];
  config: {
    existe: boolean;
    status: string | null;
    campos: Record<string, { preenchido: boolean; hash?: string }>;
    versaoGraph?: string;
  };
  tabelas: Record<string, { existe: boolean; linhas: number }>;
  contagens: {
    conversas: number;
    mensagens: number;
    mensagensPorStatus: Record<string, number>;
    conversasPorStatus: Record<string, number>;
  };
  ultimoErroLog: { mensagem: string; em: string } | null;
};

const CAMPOS_OBRIGATORIOS: { chave: string; rotulo: string }[] = [
  { chave: "app_secret", rotulo: "App Secret" },
  { chave: "phone_number_id", rotulo: "Phone Number ID" },
  { chave: "access_token", rotulo: "Token de acesso" },
  { chave: "webhook_verify_token", rotulo: "Verify Token" },
  { chave: "waba_id", rotulo: "WABA ID" },
];

function LogWhatsAppPage() {
  const getLogs = useServerFn(getWebhookLogsFn);
  const rodarDiagnostico = useServerFn(executarDiagnosticoFn);

  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [rodando, setRodando] = useState(false);
  const [payloadAberto, setPayloadAberto] = useState<any>(null);

  const { data: logs, refetch } = useQuery({
    queryKey: ["wa-logs-pagina"],
    queryFn: async () => (await getLogs()) as any[],
    // A tela fica aberta: sozinha ela acompanha a chegada de eventos.
    refetchInterval: 15000,
  });

  const executarDiagnostico = async () => {
    setRodando(true);
    try {
      const resultado = (await rodarDiagnostico()) as Diagnostico;
      setDiagnostico(resultado);
      if (resultado.status === "OK") {
        toast.success("Diagnóstico OK: configuração completa e tabelas presentes.");
      } else {
        toast.warning(`Diagnóstico apontou ${resultado.problemas.length} problema(s).`);
      }
      // O diagnóstico também vira linha de log; traz a tabela para o dia a dia.
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao rodar o diagnóstico.");
    } finally {
      setRodando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin/conversas">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ScrollText className="w-6 h-6" />
              Log da API Meta (WhatsApp)
            </h1>
            <p className="text-sm text-muted-foreground">
              Todo evento que chega do webhook e toda chamada feita à Meta fica registrada aqui.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={rodando}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
          </Button>
          <Button size="sm" onClick={executarDiagnostico} disabled={rodando}>
            {rodando ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Activity className="w-4 h-4 mr-2" />
            )}
            Rodar diagnóstico agora
          </Button>
        </div>
      </div>

      {/* Diagnóstico */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Diagnóstico da conexão
          </CardTitle>
          <CardDescription>
            Confere se a configuração da Meta está completa e se as tabelas existem. O mesmo
            diagnóstico roda sozinho a cada inicialização do servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!diagnostico && (
            <p className="text-sm text-muted-foreground">
              Clique em <strong>Rodar diagnóstico agora</strong> para conferir o App Secret, o
              Phone Number ID, o Token e as tabelas do WhatsApp.
            </p>
          )}

          {diagnostico && (
            <>
              <div className="flex items-center gap-2">
                <Badge
                  variant={diagnostico.status === "OK" ? "success" : "destructive"}
                  className="gap-1"
                >
                  {diagnostico.status === "OK" ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5" />
                  )}
                  {diagnostico.status === "OK" ? "Configuração OK" : "Atenção"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Gerado em {new Date(diagnostico.geradoEm).toLocaleString("pt-BR")}
                </span>
              </div>

              {diagnostico.problemas.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-sm font-medium mb-1.5">
                    {diagnostico.problemas.length} problema(s) encontrado(s):
                  </p>
                  <ul className="text-sm space-y-1 list-disc pl-5">
                    {diagnostico.problemas.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Campos da configuração</h3>
                  <div className="space-y-1.5">
                    {CAMPOS_OBRIGATORIOS.map(({ chave, rotulo }) => {
                      const campo = diagnostico.config.campos[chave];
                      const ok = campo?.preenchido;
                      return (
                        <div key={chave} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            {ok ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <AlertCircle className="w-4 h-4 text-destructive" />
                            )}
                            {rotulo}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {ok
                              ? campo.hash
                                ? `hash ${campo.hash}`
                                : "preenchido"
                              : "ausente"}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between text-sm pt-1 border-t">
                      <span>Status da configuração</span>
                      <Badge variant="outline">{diagnostico.config.status ?? "—"}</Badge>
                    </div>
                    {diagnostico.config.versaoGraph && (
                      <div className="flex items-center justify-between text-sm">
                        <span>Versão da Graph API em uso</span>
                        <Badge variant="outline">{diagnostico.config.versaoGraph}</Badge>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Tabelas e volumes</h3>
                  <div className="space-y-1.5 text-sm">
                    {Object.entries(diagnostico.tabelas).map(([nome, t]) => (
                      <div key={nome} className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs truncate">{nome}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {t.linhas} linha(s)
                          </span>
                          {t.existe ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-destructive" />
                          )}
                        </span>
                      </div>
                    ))}
                    <div className="pt-1 border-t flex items-center justify-between">
                      <span>Conversas / mensagens</span>
                      <span className="font-mono text-xs">
                        {diagnostico.contagens.conversas} / {diagnostico.contagens.mensagens}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {diagnostico.ultimoErroLog && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <p className="font-medium mb-1">O próprio registro de log está falhando:</p>
                  <p className="font-mono text-xs">{diagnostico.ultimoErroLog.mensagem}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Eventos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Eventos
          </CardTitle>
          <CardDescription>
            Atualiza sozinho a cada 15 segundos. Use "Testar conexão" em Comunicações &gt;
            Configurações para ver uma chamada de saída aparecer aqui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                <tr>
                  <th className="px-4 py-3">Data/Hora</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Operação</th>
                  <th className="px-4 py-3">WABA</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Detalhe</th>
                  <th className="px-4 py-3 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs?.map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(log.criado_em).toLocaleString("pt-BR")}
                      {log.duracao_ms != null && (
                        <span className="block text-xs text-muted-foreground">
                          {log.duracao_ms} ms
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={log.direcao === "ENTRADA" ? "secondary" : "outline"}>
                        {log.direcao === "ENTRADA" ? "Recebido" : "Enviado"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {log.event_type}
                      {log.http_status != null && (
                        <span className="block font-mono text-xs text-muted-foreground">
                          HTTP {log.http_status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{log.waba_id || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          log.status === "ERRO"
                            ? "destructive"
                            : log.status === "SUCESSO"
                              ? "success"
                              : "secondary"
                        }
                      >
                        {log.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                      {log.erro_detalhe || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Dialog
                        onOpenChange={(aberto) => {
                          if (aberto) setPayloadAberto(log);
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Search className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>Payload da chamada</DialogTitle>
                            <DialogDescription>
                              {log.event_type} · {new Date(log.criado_em).toLocaleString("pt-BR")}
                            </DialogDescription>
                          </DialogHeader>
                          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-4 text-xs whitespace-pre-wrap break-all">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </DialogContent>
                      </Dialog>
                    </td>
                  </tr>
                ))}
                {!logs?.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhum evento registrado ainda. Use "Testar conexão" ou "Sincronizar
                      templates" na aba Configurações — toda chamada feita à Meta passa a ser
                      registrada aqui.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
