import { useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, Loader2, MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskTelefone } from "@/lib/brasil";
import { getSessionToken } from "@/lib/session";
import { gerarLinkVistoriaFn } from "@/lib/vistoria-link.functions";

function mensagemVistoria(nome: string, link: string) {
  return `Olá${nome ? `, ${nome}` : ""}! Para agilizar a análise do seu veículo na Esse Já Foi, preencha as informações dele aqui: ${link}`;
}

function linkWhatsApp(whatsapp: string, mensagem: string) {
  let numero = whatsapp.replace(/\D/g, "");
  if (numero && numero.length <= 11) numero = `55${numero}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * Cria um vendedor "do zero" (só nome + whatsapp) e gera o link público de
 * cadastro simplificado — para o vendedor preencher veículo + condição sem
 * precisar de conta/senha. Usado tanto na home do admin quanto em vendedores.
 */
export function GerarLinkVistoriaDialog() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ link: string } | null>(null);

  async function gerar() {
    if (nome.trim().length < 3) { toast.error("Informe o nome do vendedor."); return; }
    if (whatsapp.replace(/\D/g, "").length < 10) { toast.error("Informe um WhatsApp válido."); return; }

    setSalvando(true);
    try {
      const res: any = await gerarLinkVistoriaFn({
        data: { token: getSessionToken(), nome, whatsapp },
      });
      if (!res?.ok) { toast.error(res?.message || "Não foi possível gerar o link."); return; }
      setResultado({ link: res.link });
    } finally {
      setSalvando(false);
    }
  }

  function fechar(v: boolean) {
    setAberto(v);
    if (!v) {
      setNome("");
      setWhatsapp("");
      setResultado(null);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 font-bold">
          <Link2 className="mr-2 h-4 w-4" /> Link de cadastro
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-black uppercase tracking-tight">
            Gerar link de cadastro simplificado
          </DialogTitle>
        </DialogHeader>

        {!resultado ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Informe só o nome e o WhatsApp do vendedor. Ele recebe um link para preencher os
              dados do veículo e o cadastro simplificado por conta própria, sem precisar criar
              conta.
            </p>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-600">Nome do vendedor</Label>
              <Input className="h-11" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold text-slate-600">WhatsApp</Label>
              <Input
                className="h-11"
                value={whatsapp}
                placeholder="(00) 00000-0000"
                onChange={(e) => setWhatsapp(maskTelefone(e.target.value))}
              />
            </div>
            <Button
              className="h-12 w-full bg-teal-600 font-bold hover:bg-teal-700"
              onClick={gerar}
              disabled={salvando}
            >
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Gerar link
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
              <code className="flex-1 truncate text-xs font-semibold text-slate-700">
                {resultado.link}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(resultado.link);
                  toast.success("Link copiado.");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="h-12 w-full bg-emerald-600 font-bold hover:bg-emerald-700"
              onClick={() => {
                window.open(linkWhatsApp(whatsapp, mensagemVistoria(nome, resultado.link)), "_blank");
              }}
            >
              <MessageCircle className="mr-2 h-4 w-4" /> Enviar por WhatsApp
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => fechar(false)}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
