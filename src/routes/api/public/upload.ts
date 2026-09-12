import { createFileRoute } from '@tanstack/react-router';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// Mantém a extensão na URL porque há telas (ex: admin) que decidem como exibir
// o arquivo (imagem vs PDF) olhando o final da URL.
function extensaoPorMime(mime: string): string {
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('png')) return 'png';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'bin';
}

export const Route = createFileRoute('/api/public/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const formData = await request.formData();
          const file = formData.get('file') as File;

          if (!file) {
            return new Response(JSON.stringify({ error: 'Nenhum arquivo enviado' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (file.size > MAX_BYTES) {
            return new Response(JSON.stringify({ error: 'Arquivo muito grande (máx. 10MB).' }), {
              status: 413,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Salva o arquivo no banco no momento do upload (não depende do resto do
          // formulário ser salvo depois), garantindo que nada se perde mesmo se o
          // usuário fechar a aba ou abandonar o cadastro antes de concluir.
          const buffer = Buffer.from(await file.arrayBuffer());
          const mimeType = file.type || 'application/octet-stream';

          const { salvarArquivo } = await import('@/db/arquivos.server');
          const id = await salvarArquivo(buffer, mimeType);
          const ext = extensaoPorMime(mimeType);

          // URL absoluta: a análise por IA (CNH/CRLV/selfie, placa na foto) manda essa
          // mesma URL direto para a API da OpenAI, que precisa conseguir buscá-la pela internet.
          // Mesma variável usada em outros links públicos gerados pelo backend (vistoria, pré-cadastro).
          const base = process.env["APP_URL"] || process.env["VITE_APP_URL"] || "https://www.essejafoi.com.br";
          const url = `${base.replace(/\/$/, "")}/api/public/arquivo/${id}.${ext}`;

          return new Response(JSON.stringify({ url }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error: any) {
          console.error('[upload] erro ao salvar arquivo:', error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
