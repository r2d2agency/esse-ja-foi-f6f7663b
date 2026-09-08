import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  HelpCircle,
  Sparkles,
  Store,
  KeyRound,
  ShieldCheck,
  Users,
  Car,
  ShoppingBag,
  FileText,
  Camera,
  Building2,
  ClipboardCheck,
  Megaphone,
  Gavel,
  Handshake,
  DollarSign,
  Truck,
  UserCog,
  BarChart3,
  Settings,
  Beaker,
  ScrollText,
  Map as MapIcon,
  Workflow,
} from "lucide-react";

export const Route = createFileRoute("/admin/ajuda")({
  component: AjudaPage,
  head: () => ({
    meta: [{ title: "Ajuda | Esse Já Foi" }],
  }),
});

/** Um bloco de acordeão simples, pra não repetir a estrutura em cada tópico. */
function Topico({
  value,
  icon: Icon,
  titulo,
  children,
}: {
  value: string;
  icon: any;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="rounded-2xl border border-slate-200 bg-white px-4">
      <AccordionTrigger className="text-sm font-bold text-slate-900">
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-teal-600" /> {titulo}
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-2 text-sm leading-relaxed text-slate-600">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

function AjudaPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-teal-50 p-3 text-teal-700">
          <HelpCircle className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-slate-900">Ajuda</h1>
          <p className="text-sm text-slate-500">Documentação da rotina administrativa, por tópico</p>
        </div>
      </div>

      <Tabs defaultValue="visao-geral">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1">
          <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="vistoria">Vistoria</TabsTrigger>
          <TabsTrigger value="comercial">Comercial</TabsTrigger>
          <TabsTrigger value="administracao">Administração</TabsTrigger>
        </TabsList>

        {/* ───────────────────────── VISÃO GERAL ───────────────────────── */}
        <TabsContent value="visao-geral" className="space-y-3 pt-4">
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 rounded-2xl bg-teal-50/70 p-4">
                <Workflow className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
                <p className="text-sm text-slate-700">
                  O sistema acompanha o veículo do cadastro até a venda concluída. Cada etapa tem
                  um status que trava a próxima até ser cumprida — por isso a rotina do admin é,
                  basicamente, revisar pendências e destravar o passo seguinte.
                </p>
              </div>
            </CardContent>
          </Card>

          <Accordion type="single" collapsible className="space-y-3">
            <Topico value="funil" icon={Workflow} titulo="O funil completo, do início ao fim">
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>Vendedor se cadastra → <b>Compliance do vendedor</b> (documentos + IA)</li>
                <li>Cadastro do veículo → <b>Compliance do veículo</b> (CRLV + dados obrigatórios)</li>
                <li><b>Liberar para vistoria</b></li>
                <li><b>Agendar</b> a vistoria (unidade/data/horário)</li>
                <li><b>Execução</b> da vistoria pelo app do vistoriador (checklist + fotos + laudo)</li>
                <li><b>Análise pós-vistoria</b> (checklist, fotos, proposta de valor ao vendedor)</li>
                <li>Vendedor aceita → <b>Criar Anúncio</b> (fotos processadas: placa coberta pela logo)</li>
                <li><b>Canais de Publicação</b>: Vitrine / Leilão / Anúncio / WhatsApp</li>
                <li>Leilão encerra com lance válido → <b>Negociação</b> (pagamento do comprador)</li>
                <li><b>Entrega</b> (retirada + código de confirmação)</li>
                <li><b>Pagamentos</b> (repasse ao vendedor) → venda concluída</li>
              </ol>
            </Topico>
            <Topico value="papeis" icon={UserCog} titulo="Papéis de usuário e como são criados">
              <ul className="list-disc space-y-1.5 pl-5">
                <li><b>Admin</b> e <b>Operação</b> — criados em Administração → Usuários Internos.</li>
                <li><b>Vistoriador</b> — criado em Usuários Internos, mas só aparece nos horários da
                  Agenda depois de ser vinculado a uma unidade em Vistoria → Cadastros.</li>
                <li><b>Vendedor</b> e <b>Comprador</b> — perfis públicos, criados pelo próprio fluxo
                  de cadastro do site (ou por um pré-cadastro que o admin faz manualmente).</li>
              </ul>
            </Topico>
          </Accordion>
        </TabsContent>

        {/* ───────────────────────── COMPLIANCE ───────────────────────── */}
        <TabsContent value="compliance" className="space-y-3 pt-4">
          <Accordion type="single" collapsible className="space-y-3">
            <Topico value="vendedores" icon={Users} titulo="Vendedores">
              <p>Cadastro e aprovação documental (CNH frente/verso, CRLV-e, comprovante de endereço, selfie).</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Toda foto de documento é conferida automaticamente pela IA (tipo confere, confiança, motivo).</li>
                <li>Reprovar qualquer documento abre uma pendência para o vendedor resolver.</li>
                <li>"Finalizar Análise e Aprovar" só libera com cadastro e documentos 100% completos.</li>
              </ul>
              <p className="text-xs text-slate-500">
                Status: NÃO ENVIADO → AGUARDANDO ANÁLISE → EM ANÁLISE → (PENDÊNCIA) → APROVADO / REPROVADO / BLOQUEADO.
              </p>
            </Topico>
            <Topico value="veiculos" icon={Car} titulo="Veículos">
              <p>Cadastro do veículo, aprovação do CRLV-e, dados obrigatórios (Renavam, ano, km, cor, combustível, câmbio) e mínimo de 4 fotos.</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Consulta veicular (Company Conferi) traz restrições, roubo/furto, débitos e sinistro por placa/chassi.</li>
                <li><b>Liberar para vistoria</b> só habilita com vendedor aprovado + CRLV aprovado + dados completos + fotos mínimas.</li>
              </ul>
            </Topico>
            <Topico value="compradores" icon={ShoppingBag} titulo="Compradores">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Pré-aprovação documental — compra restrita a pessoa jurídica.</li>
                <li>Dá pra pré-cadastrar direto pelo admin, com senha provisória.</li>
                <li>"Solicitar Correção" aponta a área específica (documentação, cadastro, endereço ou comprovantes).</li>
                <li>Gestão de acesso: reenviar senha, bloquear/reativar, excluir.</li>
              </ul>
            </Topico>
            <Topico value="contratos" icon={FileText} titulo="Contratos">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Geração e envio para assinatura por e-mail, WhatsApp ou portal do vendedor.</li>
                <li>Sem assinatura eletrônica integrada ainda: o admin registra manualmente o retorno (Assinado / Recusado / Expirado).</li>
                <li>Cancelamento exige motivo e é bloqueado se já assinado.</li>
              </ul>
            </Topico>
          </Accordion>
        </TabsContent>

        {/* ───────────────────────── VISTORIA ───────────────────────── */}
        <TabsContent value="vistoria" className="space-y-3 pt-4">
          <Accordion type="single" collapsible className="space-y-3">
            <Topico value="agenda" icon={Camera} titulo="Fila e Agenda">
              <ul className="list-disc space-y-1.5 pl-5">
                <li><b>Aguardando agendamento</b>: veículos liberados sem data marcada — escolha unidade, data e horário livre.</li>
                <li><b>Agenda</b>: vistorias marcadas, com opção de reagendar.</li>
                <li><b>Aguardando análise</b>: vistorias concluídas esperando a análise pós-vistoria.</li>
              </ul>
            </Topico>
            <Topico value="unidades" icon={Building2} titulo="Unidades e Equipe">
              <p>Aba "Cadastros" dentro de Vistoria. Sequência recomendada:</p>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>Criar o usuário com perfil "vistoriador" em Administração → Usuários Internos.</li>
                <li>Cadastrar a unidade (endereço, horário de atendimento, duração padrão da vistoria).</li>
                <li>Vincular o vistoriador a uma unidade ativa — só assim ele aparece nos horários da Agenda.</li>
              </ol>
            </Topico>
            <Topico value="app-vistoriador" icon={ClipboardCheck} titulo="App do Vistoriador">
              <p>
                Interface mobile-first usada em campo: checklist guiado por categoria, roteiro de
                fotos obrigatórias (frente, traseira, laterais, interior, painel, hodômetro, motor,
                porta-malas, 4 pneus) e compressão de imagem antes do envio. Ao concluir, o
                quilômetro do veículo é atualizado com o valor declarado na vistoria.
              </p>
            </Topico>
            <Topico value="pos-vistoria" icon={ScrollText} titulo="Análise Pós-Vistoria">
              <p>Acessada pela fila "Aguardando análise": revisão do checklist e das fotos do laudo.</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li><b>Solicitar nova vistoria</b> (com motivo) — devolve o veículo para a fila de agendamento.</li>
                <li><b>Enviar proposta</b> ao vendedor: valor de referência, valor mínimo acordado, comissão e mensagem (o líquido é calculado automaticamente).</li>
              </ul>
              <p className="text-xs text-slate-500">
                Status: AGUARDANDO ANÁLISE DO LAUDO → EM ANÁLISE PÓS-VISTORIA → AGUARDANDO ACEITE DO
                VENDEDOR → PRONTO PARA ANÚNCIO (aceite) ou VALOR RECUSADO.
              </p>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Existe uma segunda tela de pós-vistoria (calculadora baseada em FIPE), acessada pela
                ficha do veículo quando ele está "VISTORIADO". Se você ver as duas, confirme com o
                time técnico qual é o fluxo oficial antes de usar — evita confundir a equipe.
              </div>
            </Topico>
          </Accordion>
        </TabsContent>

        {/* ───────────────────────── COMERCIAL ───────────────────────── */}
        <TabsContent value="comercial" className="space-y-3 pt-4">
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 rounded-2xl bg-teal-50/70 p-4">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
                <p className="text-sm text-slate-700">
                  Toda foto que vai pra vitrine, leilão ou divulgação externa passa por um
                  processamento automático: a IA localiza a placa e cobre com a logo da{" "}
                  <b>Esse Já Foi</b>. A foto original com a placa visível nunca é exibida publicamente.
                </p>
              </div>
            </CardContent>
          </Card>

          <Accordion type="single" collapsible defaultValue="criar-anuncio" className="space-y-3">
            <Topico value="criar-anuncio" icon={Sparkles} titulo="Vitrine / Criar Anúncio">
              <p>Só lista veículos com status "Pronto para Anúncio" (aprovados na análise pós-vistoria).</p>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>Todas as fotos do laudo são processadas <b>automaticamente</b>: a IA localiza a placa e cobre com a logo; sem placa detectada, aplica a logo como marca d'água padrão no canto.</li>
                <li>A tela mostra "Processando fotos com IA... X/Y" até todas terminarem.</li>
                <li>Clique em <b>"Ajustar logo"</b> em qualquer foto para arrastar/redimensionar manualmente, ou rodar a detecção de placa de novo.</li>
                <li>Escolha a foto de capa clicando em "Definir capa".</li>
                <li><b>"Publicar agora"</b> só libera com todas as fotos prontas — é a versão com a logo que é salva.</li>
              </ol>
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  A detecção usa a chave/modelo da OpenAI configurados em Administração →
                  Configurações. Se não houver chave configurada, ou a IA falhar, a publicação{" "}
                  <b>nunca trava</b> — a foto simplesmente recebe a marca d'água padrão.
                </span>
              </div>
            </Topico>
            <Topico value="canais" icon={Store} titulo="Canais de Publicação">
              <p>Dentro da ficha do veículo, quatro canais independentes — cada um com título, descrição e fotos próprios:</p>
              <ul className="list-disc space-y-1.5 pl-5">
                <li><b>Vitrine</b> — ativar é o que publica o veículo na listagem pública.</li>
                <li><b>Leilão</b> — ativar cria/agenda o leilão (fica agendado até a data de início).</li>
                <li><b>Anúncio</b> — peça comercial para divulgação direta.</li>
                <li><b>WhatsApp</b> — gera link privado com token; o veículo não aparece na vitrine por esse canal.</li>
              </ul>
              <p>Fotos enviadas aqui também passam pelo processamento automático de logo, sem precisar clicar em nada.</p>
            </Topico>
            <Topico value="campanhas" icon={Megaphone} titulo="Campanhas">
              <p>
                Disparo em massa via WhatsApp Cloud API (credenciais próprias dessa tela — não ficam
                em Configurações). Wizard: veículo publicado → público-alvo → template aprovado pela
                Meta → variáveis → prévia → teste → agendar ou enviar.
              </p>
            </Topico>
            <Topico value="leiloes" icon={Gavel} titulo="Leilões">
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Só compradores PJ com compliance aprovado dão lances.</li>
                <li>Cada lance precisa superar o atual + incremento mínimo.</li>
                <li>Lance dentro da janela "anti-sniping" prorroga o fim automaticamente.</li>
                <li>Ao encerrar: sem lances → encerrado sem ofertas; abaixo do mínimo acordado →
                  encerrado sem mínimo; senão, cria a Negociação com o vencedor automaticamente.</li>
              </ul>
            </Topico>
            <Topico value="negociacoes" icon={Handshake} titulo="Negociações">
              <p>
                Acompanha o pagamento do comprador vencedor (Pix pela área dele, ou baixa manual do
                admin para pagamento fora da plataforma).
              </p>
              <p className="text-xs text-slate-500">
                Status: Aguardando Pagamento → Pagamento Confirmado (ou Pagamento Não Realizado se vencer o prazo).
              </p>
            </Topico>
            <Topico value="pagamentos" icon={DollarSign} titulo="Pagamentos">
              <p>
                Cuidado com o nome: aqui é o <b>repasse ao vendedor</b>, não a cobrança do
                comprador (isso fica em Negociações). Só libera depois que a entrega é confirmada.
              </p>
              <p className="text-xs text-slate-500">Status: Aguardando → Autorizado → Concluído.</p>
            </Topico>
            <Topico value="entregas" icon={Truck} titulo="Entregas">
              <p>
                Agendamento de retirada/entrega, com código de confirmação de 6 dígitos (visível só
                ao comprador, validado pelo vendedor no ato). Ao confirmar, libera o repasse
                (Pagamentos) e marca a venda como concluída.
              </p>
            </Topico>
          </Accordion>
        </TabsContent>

        {/* ───────────────────────── ADMINISTRAÇÃO ───────────────────────── */}
        <TabsContent value="administracao" className="space-y-3 pt-4">
          <Accordion type="single" collapsible className="space-y-3">
            <Topico value="usuarios" icon={UserCog} titulo="Usuários Internos">
              <p>Cadastro de acesso da equipe: Administrador, Operação e Vistoriador. Dá pra ativar/desativar acesso — não há exclusão.</p>
            </Topico>
            <Topico value="relatorios" icon={BarChart3} titulo="Relatórios e Analytics">
              <ul className="list-disc space-y-1.5 pl-5">
                <li><b>Relatórios</b>: Visão Geral (funil completo), Vendas (volume, ticket médio, comissão) e Comissões (a receber/recebido).</li>
                <li><b>Analytics</b>: dashboard de gráficos dos últimos 12 meses, atualiza a cada 60s.</li>
              </ul>
            </Topico>
            <Topico value="configuracoes" icon={Settings} titulo="Configurações">
              <ul className="list-disc space-y-1.5 pl-5">
                <li><b>Servidor de E-mail (SMTP)</b> — host, porta, credenciais e remetente autorizado.</li>
                <li><b>Inteligência Artificial (OpenAI)</b> — chave, modelo (precisa suportar visão), prompt e os toggles de auto-reprovação. Usada tanto na validação de documentos quanto na detecção de placa das fotos.</li>
                <li><b>Validação e calibração da IA</b> — testa o modelo/prompt atual sem gravar nada.</li>
                <li><b>Comissão da plataforma</b> — percentual padrão sugerido no fechamento comercial.</li>
                <li><b>Consulta veicular (Company Conferi)</b> — URL, usuário, senha e teste de conexão em homologação.</li>
                <li><b>Termos de adesão</b> — versões separadas para vendedor e comprador.</li>
              </ul>
            </Topico>
            <Topico value="demo" icon={Beaker} titulo="Ambiente Demo">
              <p>
                Cria vendedor/comprador/veículo/vistoriador de teste, refaz checklist, aprova e
                libera divulgação, e abre um leilão de 24h — útil pra treinar a equipe sem usar
                dados reais.
              </p>
            </Topico>
            <Topico value="logs" icon={FileText} titulo="Logs">
              <p>Auditoria com busca e paginação: data, entidade, ação e usuário responsável.</p>
            </Topico>
            <Topico value="dashboard" icon={MapIcon} titulo="Dashboard e Mapa">
              <p>
                O Dashboard (tela inicial do admin) reúne pendências por etapa e o funil visual completo. O Mapa
                mostra a distribuição geográfica de unidades, vendedores e compradores.
              </p>
            </Topico>
          </Accordion>
        </TabsContent>
      </Tabs>

      <Card className="rounded-3xl border-slate-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
            <p className="text-sm text-slate-700">
              Documentação técnica completa (arquitetura, stack, motor de depreciação, backlog
              conhecido) fica no arquivo <Badge variant="secondary">DOCS.md</Badge> na raiz do
              repositório — indicado pro time técnico, não precisa disso pra rotina do dia a dia.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
