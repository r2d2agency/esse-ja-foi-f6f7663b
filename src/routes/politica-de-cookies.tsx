import { createFileRoute, Link } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { LogoEsf } from '@/components/shared/LogoEsf';
import { CATEGORIAS, VERSAO_POLITICA_COOKIES, abrirConfiguracoesCookies } from '@/lib/cookies-consent';

export const Route = createFileRoute('/politica-de-cookies')({
  head: () => ({
    meta: [
      { title: 'Política de Cookies — Esse Já Foi' },
      {
        name: 'description',
        content:
          'Quais cookies o Esse Já Foi utiliza, para que servem, quais dependem de consentimento e como alterar suas preferências.',
      },
      { property: 'og:title', content: 'Política de Cookies — Esse Já Foi' },
      {
        property: 'og:description',
        content: 'Categorias de cookies, finalidades e como gerenciar seu consentimento no Esse Já Foi.',
      },
      { property: 'og:type', content: 'article' },
      { property: 'og:url', content: '/politica-de-cookies' },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [{ rel: 'canonical', href: '/politica-de-cookies' }],
  }),
  component: PoliticaCookies,
});

function PoliticaCookies() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100 bg-white/85 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/">
            <LogoEsf height={32} />
          </Link>
          <Link to="/politica-de-privacidade" className="text-sm font-medium text-slate-600 hover:text-turquoise">
            Política de Privacidade
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-extrabold text-navy">Política de Cookies</h1>
        <p className="mt-3 text-sm text-slate-400">
          Última atualização: 1º de setembro de 2026 — versão {VERSAO_POLITICA_COOKIES}
        </p>

        <div className="mt-10 space-y-8 text-slate-600 leading-relaxed">
          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">1. O que são cookies</h2>
            <p>
              Cookies e tecnologias semelhantes (como armazenamento local do navegador) são pequenos
              arquivos gravados no seu dispositivo para permitir o funcionamento do site, lembrar
              preferências e, quando autorizado, medir o uso da plataforma.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">2. Categorias que utilizamos</h2>
            <div className="space-y-4">
              {CATEGORIAS.map((cat) => (
                <div key={cat.id} className="rounded-xl border border-slate-200 bg-mist p-5">
                  <p className="font-bold text-navy">
                    {cat.titulo}{' '}
                    <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-turquoise-dark">
                      {cat.obrigatoria ? 'sempre ativos' : 'depende do seu consentimento'}
                    </span>
                  </p>
                  <p className="mt-2 text-sm">{cat.descricao}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">3. O que está ativo hoje</h2>
            <p>
              Nesta versão da plataforma, utilizamos apenas cookies e armazenamento{' '}
              <strong>necessários</strong>: sessão de login, proteção contra fraude, rascunhos de
              cadastro, registro da sua preferência de cookies e recursos de aplicativo (service
              worker e manifesto). Não há Google Analytics, Meta Pixel ou qualquer tag de terceiros
              carregada no site. Caso alguma ferramenta de análise ou marketing passe a ser
              utilizada, ela só será carregada após o consentimento da categoria correspondente e
              esta política será atualizada.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">4. Como gerenciar suas preferências</h2>
            <p>
              Você pode aceitar todos, rejeitar os não necessários ou escolher categoria por
              categoria. Sua escolha é registrada com data, hora, versão desta política e versão do
              consentimento, e passa a valer imediatamente — inclusive quando você revoga uma
              autorização já concedida.
            </p>
            <Button
              onClick={abrirConfiguracoesCookies}
              className="mt-5 rounded-full bg-turquoise px-6 text-white hover:bg-turquoise-dark"
            >
              Abrir Configurações de Cookies
            </Button>
            <p className="mt-4 text-sm text-slate-400">
              Você também pode bloquear ou apagar cookies nas configurações do seu navegador. Ao
              bloquear cookies necessários, partes da plataforma podem deixar de funcionar.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-bold text-navy">5. Mais informações</h2>
            <p>
              O tratamento dos dados coletados por meio de cookies segue a{' '}
              <Link to="/politica-de-privacidade" className="font-semibold text-turquoise-dark underline underline-offset-4">
                Política de Privacidade
              </Link>
              . Dúvidas: <span className="font-semibold text-navy">privacidade@essejafoi.com.br</span>.
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
