import { createFileRoute, Link } from '@tanstack/react-router';

import { LogoEsf } from '@/components/shared/LogoEsf';

export const Route = createFileRoute('/politica-de-privacidade')({
  head: () => ({
    meta: [
      { title: 'Política de Privacidade — Esse Já Foi' },
      {
        name: 'description',
        content:
          'Como o Esse Já Foi coleta, usa, compartilha e protege dados pessoais de vendedores, compradores e visitantes, conforme a LGPD.',
      },
      { property: 'og:title', content: 'Política de Privacidade — Esse Já Foi' },
      {
        property: 'og:description',
        content: 'Tratamento de dados pessoais no Esse Já Foi, direitos do titular e contato do encarregado.',
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
      <header className="border-b border-slate-100 bg-white/85 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/">
            <LogoEsf height={32} />
          </Link>
          <Link to="/politica-de-cookies" className="text-sm font-medium text-slate-600 hover:text-turquoise">
            Política de Cookies
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-extrabold text-navy">Política de Privacidade</h1>
        <p className="mt-3 text-sm text-slate-400">Última atualização: 1º de setembro de 2026 — versão 1.0</p>

        <div className="mt-10 space-y-8 text-slate-600 leading-relaxed">
          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">1. Quem somos</h2>
            <p>
              O Esse Já Foi é uma plataforma digital de compra e venda de veículos que intermedia
              vistoria, negociação, documentação e pagamento entre vendedores e compradores
              verificados. Esta política descreve como tratamos dados pessoais, em conformidade com
              a Lei nº 13.709/2018 (LGPD).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">2. Dados que coletamos</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Dados cadastrais:</strong> nome, CPF/CNPJ, data de nascimento, e-mail,
                telefone/WhatsApp e endereço.
              </li>
              <li>
                <strong>Documentos:</strong> CNH (frente e verso), CRLV-e, comprovante de residência
                e selfie de validação, quando exigidos para conclusão do cadastro.
              </li>
              <li>
                <strong>Dados do veículo:</strong> placa, chassi, renavam, quilometragem, fotos,
                laudos de vistoria e consultas veiculares (débitos, restrições, sinistro, leilão).
              </li>
              <li>
                <strong>Dados transacionais:</strong> propostas, lances, contratos, comissões,
                repasses e comprovantes de pagamento.
              </li>
              <li>
                <strong>Dados técnicos:</strong> endereço IP, navegador, dispositivo, data e hora de
                acesso, registros de aceite de termos e localização aproximada de vistorias.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">3. Para que usamos os dados</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Criar e manter sua conta e autenticar seus acessos.</li>
              <li>Executar o contrato: vistoria, anúncio, leilão, negociação, entrega e pagamento.</li>
              <li>Prevenir fraudes, verificar a procedência do veículo e cumprir obrigações legais.</li>
              <li>Comunicar status por e-mail e WhatsApp sobre negociações e etapas do processo.</li>
              <li>Melhorar a plataforma, mediante consentimento para cookies de análise.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">4. Bases legais</h2>
            <p>
              Tratamos dados com fundamento na execução de contrato, no cumprimento de obrigação
              legal ou regulatória, no legítimo interesse (segurança e prevenção a fraudes) e no
              consentimento, quando aplicável — especialmente para cookies não necessários e
              comunicações de marketing.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">5. Compartilhamento</h2>
            <p>
              Compartilhamos dados apenas na medida necessária com: vistoriadores credenciados,
              compradores e vendedores envolvidos na negociação, provedores de consulta veicular e
              laudos, instituições de pagamento, provedores de mensageria e infraestrutura, e
              autoridades públicas quando exigido por lei. Não vendemos dados pessoais.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">6. Retenção</h2>
            <p>
              Mantemos os dados pelo tempo necessário às finalidades acima e pelos prazos legais
              aplicáveis a operações de compra e venda de veículos, registros fiscais e prevenção a
              fraudes. Encerrado o prazo, os dados são eliminados ou anonimizados.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">7. Segurança</h2>
            <p>
              Adotamos controles de acesso por perfil, criptografia em trânsito, registro de
              auditoria das operações sensíveis e segregação de ambientes. Nenhum sistema é
              totalmente imune, por isso mantenha sua senha em sigilo e comunique acessos suspeitos.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">8. Seus direitos</h2>
            <p>
              Você pode solicitar confirmação de tratamento, acesso, correção, anonimização,
              portabilidade, informação sobre compartilhamentos, revogação de consentimento e
              eliminação de dados tratados com base em consentimento.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">9. Cookies</h2>
            <p>
              O uso de cookies e tecnologias semelhantes está detalhado na{' '}
              <Link to="/politica-de-cookies" className="font-semibold text-turquoise-dark underline underline-offset-4">
                Política de Cookies
              </Link>
              , onde você também pode alterar suas preferências a qualquer momento.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">10. Contato</h2>
            <p>
              Para exercer seus direitos ou esclarecer dúvidas sobre privacidade, fale com nosso
              encarregado de proteção de dados pelo e-mail{' '}
              <span className="font-semibold text-navy">privacidade@essejafoi.com.br</span>.
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
