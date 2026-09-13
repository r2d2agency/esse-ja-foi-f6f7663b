import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, Loader2 } from "lucide-react";
import { useAuthStore } from "@/hooks/use-auth";
import { solicitarCodigoSuperadminFn, confirmarAcaoSuperadminFn } from "@/lib/superadmin.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AcaoCritica = "PROMOVER_SUPERADMIN" | "EXCLUIR_VEICULO_FORCADO" | "EXCLUIR_PERFIL_FORCADO";

/**
 * Hook + diálogo reutilizável para qualquer ação que exija confirmação de superadmin por
 * código enviado a todos os superadmins ativos (promover superadmin, forçar exclusão com
 * vínculos). Uso: const { iniciar, dialog } = useConfirmacaoAcaoCritica(); ...renderize
 * {dialog} uma vez no componente, e chame iniciar({...}) a partir de um botão.
 */
export function useConfirmacaoAcaoCritica() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [aberto, setAberto] = useState(false);
  const [acao, setAcao] = useState<AcaoCritica | null>(null);
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const [alvoDescricao, setAlvoDescricao] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"enviando" | "aguardando_codigo" | "confirmando">("enviando");
  const [callback, setCallback] = useState<(() => void) | null>(null);

  async function iniciar(params: { acao: AcaoCritica; alvoId: string; alvoDescricao?: string; onSucesso?: () => void }) {
    if (!accessToken) {
      toast.error("Sessão inválida. Faça login novamente.");
      return;
    }
    setAcao(params.acao);
    setAlvoId(params.alvoId);
    setAlvoDescricao(params.alvoDescricao || "");
    setCodigo("");
    setCallback(() => params.onSucesso || null);
    setAberto(true);
    setEtapa("enviando");

    const res: any = await solicitarCodigoSuperadminFn({
      data: { token: accessToken, acao: params.acao, alvoDescricao: params.alvoDescricao },
    });
    if (!res?.ok) {
      toast.error(res?.message || "Não foi possível enviar o código de confirmação.");
      setAberto(false);
      return;
    }
    toast.success(`Código enviado para ${res.enviados} superadmin(s).`);
    setEtapa("aguardando_codigo");
  }

  async function confirmar() {
    if (!acao || !alvoId || !accessToken) return;
    setEtapa("confirmando");
    const res: any = await confirmarAcaoSuperadminFn({ data: { token: accessToken, acao, alvoId, codigo } });
    if (!res?.ok) {
      toast.error(res?.message || "Código inválido ou expirado.");
      setEtapa("aguardando_codigo");
      return;
    }
    toast.success("Ação confirmada.");
    setAberto(false);
    callback?.();
  }

  const dialog = (
    <Dialog open={aberto} onOpenChange={(v) => !v && setAberto(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <ShieldAlert className="h-5 w-5" /> Confirmação de superadmin
          </DialogTitle>
          <DialogDescription>
            {etapa === "enviando"
              ? "Enviando código de confirmação para os superadmins..."
              : `Um código de 6 dígitos foi enviado por e-mail para os superadmins ativos. Informe-o para confirmar: ${alvoDescricao}`}
          </DialogDescription>
        </DialogHeader>
        {etapa !== "enviando" && (
          <Input
            placeholder="000000"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            autoFocus
            className="text-center text-2xl font-black tracking-[0.5em]"
          />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAberto(false)} disabled={etapa === "confirmando"}>
            Cancelar
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700"
            disabled={etapa !== "aguardando_codigo" || codigo.length < 6}
            onClick={confirmar}
          >
            {etapa === "confirmando" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { iniciar, dialog };
}
