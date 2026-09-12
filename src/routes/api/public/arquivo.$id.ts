import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/arquivo/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          // A URL carrega uma extensão (ex: "<uuid>.webp") só para telas que decidem
          // como exibir o arquivo pelo final da URL; o UUID é a parte antes do primeiro ponto.
          const id = params.id.split('.')[0] ?? params.id;
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!UUID_RE.test(id)) {
            return new Response('Arquivo não encontrado', { status: 404 });
          }

          const { obterArquivo } = await import('@/db/arquivos.server');
          const arquivo = await obterArquivo(id);

          if (!arquivo) {
            return new Response('Arquivo não encontrado', { status: 404 });
          }

          return new Response(arquivo.conteudo, {
            status: 200,
            headers: {
              'Content-Type': arquivo.mimeType,
              // O id é único por arquivo e o conteúdo nunca muda, então pode cachear para sempre.
              'Cache-Control': 'public, max-age=31536000, immutable',
              // Sem isso, carregar a foto num <canvas> (editor de logo/marca d'água) a
              // partir de um domínio diferente do que gerou a URL (ex.: essejafoi.com.br
              // vs www.essejafoi.com.br) "suja" o canvas e o navegador bloqueia o
              // toDataURL/toBlob por CORS — é um arquivo público, sem autenticação.
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error: any) {
          console.error('[arquivo] erro ao ler arquivo:', error);
          return new Response('Erro ao carregar arquivo', { status: 500 });
        }
      },
    },
  },
});
