import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, Sparkles, Store, KeyRound, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin/ajuda")({
  component: AjudaPage,
  head: () => ({
    meta: [{ title: "Ajuda | Esse Já Foi" }],
  }),
});

function AjudaPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-teal-50 p-3 text-teal-700">
          <HelpCircle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-slate-900">Ajuda</h1>
          <p className="text-sm text-slate-500">Como as fotos dos veículos são processadas antes de ir pro público</p>
        </div>
      </div>

      <Card className="rounded-3xl border-slate-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3 rounded-2xl bg-teal-50/70 p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
            <p className="text-sm text-slate-700">
              Toda foto que aparece na vitrine, no leilão ou é divulgada externamente passa por um
              processamento automático: a placa do veículo é coberta com a logo da{" "}
              <b>Esse Já Foi</b>. A foto original com a placa visível nunca é exibida publicamente.
            </p>
          </div>
        </CardContent>
      </Card>

      <Accordion type="single" collapsible defaultValue="criar-anuncio" className="space-y-3">
        <AccordionItem value="criar-anuncio" className="rounded-2xl border border-slate-200 bg-white px-4">
          <AccordionTrigger className="text-sm font-bold text-slate-900">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-teal-600" /> Tela "Criar Anúncio"
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-3 text-sm text-slate-600">
            <p>Depois que o veículo é aprovado na análise pós-vistoria, o admin abre a tela de Criar Anúncio (em Comercial → Vitrine → Publicar). A partir daí:</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>Todas as fotos aprovadas do laudo são processadas <b>automaticamente</b>: a IA localiza a placa e cobre com a logo; se não achar placa (foto de interior, motor, painel etc.), aplica a logo como marca d'água padrão no canto da foto.</li>
              <li>Enquanto isso acontece, aparece "Processando fotos com IA... X/Y" e cada miniatura mostra um indicador de carregamento.</li>
              <li>Clique em <b>"Ajustar logo"</b> em qualquer foto para abrir o editor visual: dá pra arrastar e redimensionar a logo na posição exata, além de rodar a detecção de placa de novo ou trocar entre a logo colorida e a branca.</li>
              <li>Escolha qual foto é a <b>capa</b> do anúncio clicando em "Definir capa".</li>
              <li>O botão <b>"Publicar agora"</b> só libera quando todas as fotos terminam de processar. É a versão já com a logo que é salva e usada daí pra frente.</li>
            </ol>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="canais" className="rounded-2xl border border-slate-200 bg-white px-4">
          <AccordionTrigger className="text-sm font-bold text-slate-900">
            <span className="flex items-center gap-2">
              <Store className="h-4 w-4 text-teal-600" /> Canais de Publicação (Leilão, Anúncio, Vitrine, WhatsApp)
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-slate-600">
            <p>
              Cada canal pode ter um conjunto de fotos próprio, enviado na tela de publicação do
              veículo (aba "Fotos do canal"). Toda foto enviada ali também passa pelo mesmo
              processamento — detecta a placa e cobre com a logo, ou aplica a marca d'água padrão —
              de forma automática, assim que o envio termina.
            </p>
            <p>
              Diferente da tela de Criar Anúncio, aqui não tem editor pra arrastar a logo na hora do
              envio. Se o resultado não ficar bom, é só remover a foto e enviar de novo.
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="requisito" className="rounded-2xl border border-slate-200 bg-white px-4">
          <AccordionTrigger className="text-sm font-bold text-slate-900">
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-teal-600" /> O que precisa estar configurado
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-slate-600">
            <p>
              A detecção da placa usa a mesma chave e modelo da OpenAI já configurados em{" "}
              <b>Administração → Configurações</b> (a mesma IA que confere os documentos do
              vendedor). Não precisa configurar nada separado para essa função.
            </p>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="fallback" className="rounded-2xl border border-slate-200 bg-white px-4">
          <AccordionTrigger className="text-sm font-bold text-slate-900">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-600" /> E se a IA não encontrar a placa (ou falhar)?
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-2 text-sm text-slate-600">
            <p>
              Nunca trava a publicação. Se a chave da OpenAI não estiver configurada, ou a IA não
              conseguir localizar a placa, a foto recebe a logo como marca d'água padrão (canto
              inferior direito) — nenhuma foto sai sem a logo aplicada.
            </p>
            <p>
              Se mesmo assim a posição não ficar boa em alguma foto, use o botão{" "}
              <Badge variant="secondary" className="mx-0.5">Ajustar logo</Badge> na tela de Criar
              Anúncio para reposicionar manualmente.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
