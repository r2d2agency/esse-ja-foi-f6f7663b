import { createFileRoute, Link } from '@tanstack/react-router';

import { LogoEsf } from '@/components/shared/LogoEsf';

export const Route = createFileRoute('/politica-de-privacidade')({
  head: () => ({
    meta: [
      { title: 'Política de Privacidade — Esse Já Foi' },
      {
        name: 'description',
        content:
          'Saiba como o Esse Já Foi coleta, usa, armazena, compartilha e protege dados pessoais em conformidade com a LGPD.',
      },
      { property: 'og:title', content: 'Política de Privacidade — Esse Já Foi' },
      {
        property: 'og:description',
        content:
          'Tratamento de dados pessoais no Esse Já Foi: cadastro, veículos, negociações, pagamentos, entrega e seus direitos como titular.',
      },
      { property: 'og:type', content: 'article' },
      { property: 'og:url', content: '/politica-de-privacidade' },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [{ rel: 'canonical', href: '/politica-de-privacidade' }],
  }),
  component: PoliticaPrivacidade,
});

function PoliticaPrivacidade() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100 bg-white/85 backdrop-blur-md sticky top-0 z-10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/">
            <LogoEsf height={32} />
          </Link>
          <div className="flex items-center gap-6 text-sm font-medium">
            <Link to="/politica-de-cookies" className="text-slate-600 hover:text-turquoise">
              Política de Cookies
            </Link>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('ejf:abrir-cookies'))}
              className="text-slate-600 hover:text-turquoise"
            >
              Configurações de Cookies
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-extrabold text-navy">Política de Privacidade</h1>
        <p className="mt-3 text-sm text-slate-400">Última atualização: setembro de 2026 — versão 2.0</p>

        <div className="mt-10 space-y-10 text-slate-600 leading-relaxed">
          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">1. Introdução</h2>
            <p>
              A sua privacidade é importante para o Esse Já Foi. Esta Política de Privacidade explica como coletamos,
              utilizamos, armazenamos, compartilhamos e protegemos dados pessoais durante a utilização de nossos sites,
              plataformas, aplicativos, canais de atendimento e serviços relacionados à intermediação de venda de
              veículos.
            </p>
            <p className="mt-3">
              O tratamento de dados pessoais é realizado em conformidade com a legislação brasileira aplicável,
              especialmente a Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD).
            </p>
            <p className="mt-3">
              O Esse Já Foi atua como intermediador da negociação de veículos, podendo participar de etapas como cadastro
              de vendedores e compradores, validação cadastral, análise documental, vistoria, preparação e divulgação
              de anúncios, recebimento de ofertas, negociação, pagamento, entrega e encerramento da operação.
            </p>
            <p className="mt-3">Ao utilizar nossos serviços, você declara ter ciência desta Política de Privacidade.</p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">2. Identificação do Controlador</h2>
            <p>Para fins da LGPD, o controlador dos dados pessoais tratados no âmbito da plataforma é:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong>Razão social:</strong> ESSE JA FOI LTDA
              </li>
              <li>
                <strong>Nome fantasia:</strong> Esse Já Foi
              </li>
              <li>
                <strong>CNPJ:</strong> 68.780.970/0001-90
              </li>
              <li>
                <strong>E-mail para assuntos de privacidade:</strong>{' '}
                <span className="font-semibold text-navy">privacidade@essejafoi.com.br</span>
              </li>
            </ul>
            <p className="mt-3">
              Sempre que esta Política utilizar os termos “Esse Já Foi”, “nós”, “nosso” ou “plataforma”, estará se
              referindo à entidade acima indicada.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">3. Quais dados podemos tratar</h2>
            <p>Os dados tratados dependem da forma como cada pessoa utiliza a plataforma.</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong>Dados cadastrais e de identificação:</strong> nome completo, CPF, CNPJ quando aplicável, data de
                nascimento, telefone, WhatsApp, e-mail, endereço, CEP, cidade, Estado e informações relacionadas à
                empresa representada pelo usuário.
              </li>
              <li>
                <strong>Documentos:</strong> CNH, comprovante de endereço, documentos empresariais, selfie e outros
                documentos necessários para verificar identidade, representação ou titularidade.
              </li>
              <li>
                <strong>Dados biométricos:</strong> caso sejam utilizadas tecnologias biométricas para identificação ou
                autenticação, o tratamento será realizado de acordo com as exigências aplicáveis aos dados pessoais
                sensíveis previstas na LGPD.
              </li>
              <li>
                <strong>Dados do veículo:</strong> placa, marca, modelo, versão, ano, cor, quilometragem, combustível,
                câmbio, Renavam quando necessário, chassi quando necessário, CRLV-e, informações de propriedade,
                financiamento, restrições, condição declarada, acessórios, fotos e informações provenientes de vistoria.
              </li>
              <li>
                <strong>Dados de vistoria:</strong> checklist do veículo, fotografias, quilometragem, observações,
                informações sobre avarias e demais elementos necessários à avaliação e divulgação.
              </li>
              <li>
                <strong>Dados de negociação:</strong> interesses, ofertas, lances, valores, data e horário das
                operações, identificação dos participantes, condições comerciais, aceitações realizadas dentro da
                plataforma e histórico dos eventos relacionados à negociação.
              </li>
              <li>
                <strong>Dados financeiros:</strong> valor da operação, forma de pagamento, status da transação,
                identificadores financeiros, dados necessários para Pix ou transferência, titularidade do favorecido,
                comprovantes e informações de conciliação.
              </li>
              <li>
                <strong>Dados de entrega:</strong> data, horário, local, responsável pelo recebimento, quilometragem,
                fotografias, código de confirmação, registros de recebimento e eventuais divergências.
              </li>
              <li>
                <strong>Dados de comunicação:</strong> mensagens de WhatsApp, e-mails, solicitações, anexos e histórico
                de atendimento.
              </li>
              <li>
                <strong>Dados técnicos:</strong> endereço IP, navegador, dispositivo, sistema operacional, páginas
                acessadas, data e horário, eventos de navegação, identificadores de sessão, logs de segurança, origem do
                acesso e dados relacionados ao desempenho da plataforma.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">4. Como os dados são obtidos</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Diretamente do titular:</strong> ao realizar cadastro, preencher formulários, cadastrar veículos,
                enviar documentos, participar de negociações ou entrar em contato conosco.
              </li>
              <li>
                <strong>Automaticamente:</strong> por meio da utilização do site ou plataforma, inclusive por cookies,
                logs, tecnologias de segurança e ferramentas analíticas.
              </li>
              <li>
                <strong>Por prestadores e parceiros:</strong> quando necessário à execução dos serviços, determinadas
                informações poderão ser obtidas por meio de prestadores de serviços, instituições financeiras, empresas
                de vistoria, parceiros tecnológicos ou bases legitimamente acessíveis, respeitando a legislação aplicável.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">5. Para quais finalidades utilizamos os dados</h2>
            <p className="mb-3">Os dados pessoais poderão ser utilizados para:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Criar e administrar contas e autenticar usuários;</li>
              <li>Validar vendedores e compradores e realizar procedimentos de compliance;</li>
              <li>Confirmar identidades e prevenir fraudes;</li>
              <li>Analisar documentos e cadastrar e avaliar veículos;</li>
              <li>Realizar e acompanhar vistorias;</li>
              <li>Preparar, divulgar e gerenciar anúncios;</li>
              <li>Permitir ofertas, lances e conduzir negociações;</li>
              <li>Identificar compradores vencedores;</li>
              <li>Processar pagamentos, conciliações e repasses;</li>
              <li>Organizar entregas e registrar histórico das operações;</li>
              <li>Prestar atendimento e enviar notificações relacionadas aos serviços;</li>
              <li>Proteger a plataforma e identificar atividades suspeitas;</li>
              <li>Cumprir obrigações legais e exercer direitos;</li>
              <li>Elaborar relatórios e melhorar a experiência de utilização;</li>
              <li>Avaliar desempenho e, quando permitido, realizar ações de marketing.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">6. Bases legais</h2>
            <p>
              O tratamento de dados poderá ocorrer com fundamento nas hipóteses previstas na LGPD, conforme a finalidade
              específica, incluindo execução de contrato ou procedimentos preliminares relacionados ao contrato,
              cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse quando
              aplicável, prevenção à fraude e segurança do titular em processos de identificação e autenticação,
              consentimento quando essa for a base adequada e demais hipóteses previstas na legislação.
            </p>
            <p className="mt-3">
              Quando o tratamento depender do consentimento, o titular será informado e poderá exercer os direitos
              relacionados à sua decisão nos termos da legislação.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">7. Cadastro e validação de vendedores e compradores</h2>
            <p>
              Para preservar a segurança das negociações, o Esse Já Foi poderá realizar procedimentos de validação
              cadastral antes de liberar determinadas funcionalidades.
            </p>
            <p className="mt-3">
              Esses procedimentos podem incluir análise de informações, documentos, identidade, representação
              empresarial e outros elementos necessários para verificar se vendedores e compradores atendem aos critérios
              da plataforma.
            </p>
            <p className="mt-3">
              O simples envio de documentos não significa aprovação automática. O resultado poderá ser classificado como
              aguardando análise, em análise, pendente, aprovado, reprovado, bloqueado ou outro estado necessário à
              administração da conta.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">8. Dados dos veículos e anúncios</h2>
            <p>
              O Esse Já Foi poderá utilizar informações fornecidas pelo vendedor e informações obtidas durante a vistoria
              para criar e divulgar anúncios dos veículos.
            </p>
            <p className="mt-3">
              Os anúncios públicos deverão apresentar somente as informações necessárias para divulgação do veículo. Não
              deverão ser divulgados publicamente dados pessoais desnecessários do vendedor, como CPF completo,
              endereço residencial, documentos de identificação, selfie, chave Pix, informações bancárias, CRLV completo,
              Renavam completo ou chassi completo.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">9. Ofertas, lances e negociações</h2>
            <p>
              As ações realizadas durante uma negociação poderão ser registradas para garantir segurança, rastreabilidade
              e integridade da operação.
            </p>
            <p className="mt-3">
              Podemos registrar o usuário responsável, valor da oferta ou lance, data, horário, veículo relacionado,
              situação da negociação e demais eventos necessários para comprovação das ações realizadas. Informações
              internas de compradores não deverão ser divulgadas publicamente durante o processo de ofertas.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">10. Pagamentos e repasses</h2>
            <p>
              O Esse Já Foi poderá integrar a plataforma a instituições financeiras e provedores de pagamento.
              Determinadas informações necessárias à execução financeira poderão ser transmitidas a esses fornecedores.
            </p>
            <p className="mt-3">
              O Esse Já Foi deverá tratar apenas os dados necessários para acompanhar pagamentos, conciliações,
              transferências, repasses, comprovantes e situações relacionadas às negociações. A confirmação de um
              pagamento deve observar as informações fornecidas pelo respectivo provedor financeiro ou processo de
              conciliação autorizado.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">11. Entrega do veículo</h2>
            <p>
              Depois da confirmação das condições necessárias à negociação, poderão ser disponibilizadas às partes as
              informações estritamente necessárias para organização da entrega.
            </p>
            <p className="mt-3">
              Dados de endereço, telefone ou responsável poderão ser apresentados somente aos usuários envolvidos na
              operação e quando efetivamente necessários. Também poderão ser registrados data, horário, local,
              fotografias, quilometragem, código de confirmação e manifestações relacionadas ao recebimento do veículo.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">12. WhatsApp e comunicações</h2>
            <p>
              O Esse Já Foi poderá utilizar a WhatsApp Business Platform, e-mail, notificações internas e outros canais
              para enviar informações relacionadas à conta ou às operações.
            </p>
            <p className="mt-3">
              Podemos enviar comunicações relativas a cadastro, documentos, vistoria, veículos, ofertas, leilões,
              negociações, pagamento, entrega, repasse, segurança e suporte. Quando aplicável, poderão ser enviadas
              comunicações promocionais relacionadas a veículos ou serviços.
            </p>
            <p className="mt-3">
              O titular poderá solicitar a interrupção das comunicações promocionais, sem prejuízo de mensagens
              necessárias para funcionamento da conta ou execução de uma operação em andamento. No uso do WhatsApp,
              determinados dados também poderão ser processados pela Meta de acordo com suas próprias políticas, termos
              e infraestrutura.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">13. Com quem podemos compartilhar dados</h2>
            <p>
              O Esse Já Foi poderá compartilhar dados pessoais somente quando necessário às finalidades desta Política.
              Isso pode envolver:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Compradores e vendedores envolvidos em uma negociação;</li>
              <li>Empresas de vistoria e vistoriadores;</li>
              <li>Instituições financeiras e provedores de pagamento;</li>
              <li>
                Empresas responsáveis por infraestrutura, hospedagem, banco de dados, armazenamento, autenticação,
                comunicação, monitoramento, analytics, segurança, atendimento e demais fornecedores necessários à
                operação da plataforma.
              </li>
            </ul>
            <p className="mt-3">
              Dados também poderão ser compartilhados quando houver obrigação legal, ordem judicial, solicitação legítima
              de autoridade competente ou necessidade relacionada ao exercício regular de direitos. O compartilhamento
              deverá observar princípios de necessidade, finalidade, segurança e minimização de dados.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">14. Serviços e ferramentas de terceiros</h2>
            <p>Atualmente, o site poderá utilizar ferramentas como:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong>Google Tag Manager</strong>, para gerenciamento de tags e integrações;
              </li>
              <li>
                <strong>Google Analytics 4</strong>, para análise de audiência, navegação e desempenho;
              </li>
              <li>
                <strong>Meta Pixel</strong>, para mensuração de campanhas e ações publicitárias.
              </li>
            </ul>
            <p className="mt-3">
              O funcionamento dessas tecnologias também poderá envolver tratamento de dados pelos respectivos
              fornecedores. Mais informações estão disponíveis na nossa{' '}
              <Link to="/politica-de-cookies" className="font-semibold text-turquoise-dark underline underline-offset-4">
                Política de Cookies
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">15. Cookies</h2>
            <p>
              Utilizamos cookies e tecnologias semelhantes para permitir o funcionamento do site, manter sessões,
              melhorar segurança, compreender como nossos serviços são utilizados e, quando autorizado, medir campanhas e
              ações de marketing.
            </p>
            <p className="mt-3">
              Cookies não estritamente necessários deverão respeitar as preferências configuradas pelo usuário conforme a
              implementação adotada no site. O titular poderá aceitar, rejeitar cookies não necessários ou gerenciar suas
              preferências. Essa abordagem está alinhada às orientações da ANPD sobre banners e gestão de cookies.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">16. Armazenamento e retenção</h2>
            <p>
              Os dados serão mantidos pelo período necessário para cumprir as finalidades para as quais foram coletados.
              Também poderão permanecer armazenados quando sua conservação for necessária para cumprimento de
              obrigações legais ou regulatórias, prevenção de fraudes, segurança da operação ou exercício regular de
              direitos.
            </p>
            <p className="mt-3">
              Após o término dos períodos aplicáveis, os dados poderão ser eliminados, anonimizados ou mantidos quando
              sua conservação estiver autorizada pela legislação.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">17. Segurança da informação</h2>
            <p>
              O Esse Já Foi adota medidas técnicas e administrativas destinadas a proteger dados pessoais contra
              acessos não autorizados, perda, destruição, alteração indevida, divulgação ou tratamento inadequado.
            </p>
            <p className="mt-3">
              Entre as medidas que poderão ser utilizadas estão controles de acesso, autenticação, gestão de permissões,
              registros de auditoria, proteção de credenciais, comunicação criptografada, monitoramento, backups e
              mecanismos de segurança da infraestrutura.
            </p>
            <p className="mt-3">
              Nenhum sistema digital é completamente isento de riscos. Caso ocorra incidente de segurança relevante,
              serão adotadas as providências cabíveis de acordo com a legislação.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">18. Direitos dos titulares</h2>
            <p>
              Nos termos da LGPD, o titular poderá exercer, quando aplicável, direitos como confirmação da existência de
              tratamento, acesso aos dados, correção de informações incompletas ou inexatas, anonimização, bloqueio ou
              eliminação de dados tratados em desconformidade, portabilidade nos termos da regulamentação, informações
              sobre compartilhamentos, revogação de consentimento, eliminação de dados tratados com consentimento quando
              cabível, oposição ao tratamento e revisão de determinadas decisões automatizadas.
            </p>
            <p className="mt-3">Os direitos dos titulares estão previstos, entre outros dispositivos, no artigo 18 da LGPD.</p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">19. Como exercer seus direitos</h2>
            <p>
              Solicitações relacionadas à proteção de dados poderão ser encaminhadas para:{' '}
              <span className="font-semibold text-navy">privacidade@essejafoi.com.br</span>.
            </p>
            <p className="mt-3">
              Para proteger o próprio titular, o Esse Já Foi poderá solicitar informações adicionais necessárias para
              confirmar sua identidade antes do atendimento de determinadas solicitações.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">20. Responsabilidades do usuário</h2>
            <p>
              O usuário é responsável pela veracidade das informações fornecidas, atualização de seus dados, proteção
              das próprias credenciais, utilização adequada da plataforma e legitimidade das informações ou documentos
              enviados.
            </p>
            <p className="mt-3">
              O usuário não deverá compartilhar senha, código de autenticação ou credenciais da plataforma com terceiros.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">21. Dados de terceiros</h2>
            <p>
              Caso o usuário forneça dados de outra pessoa, deverá possuir legitimidade para realizar esse fornecimento e
              utilizar as informações de acordo com a legislação aplicável.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">22. Transferência internacional</h2>
            <p>
              Alguns fornecedores de tecnologia utilizados pelo Esse Já Foi poderão possuir infraestrutura localizada
              fora do Brasil. Nesses casos, dados pessoais poderão ser objeto de transferência internacional, observando
              os requisitos aplicáveis da LGPD e as medidas de proteção adequadas.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">23. Alterações desta política</h2>
            <p>
              Esta Política poderá ser atualizada periodicamente para refletir mudanças nos serviços, legislação,
              tecnologias ou práticas de segurança e privacidade. A versão atualizada ficará disponível no site com
              indicação da data da última alteração. Alterações relevantes poderão ser comunicadas aos usuários por meios
              adequados.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-100 py-10">
        <div className="container mx-auto flex flex-col items-center gap-4 px-4 text-sm text-slate-400">
          <Link to="/" className="hover:text-turquoise">Voltar para a página inicial</Link>
          <p>© 2026 Esse Já Foi — Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
