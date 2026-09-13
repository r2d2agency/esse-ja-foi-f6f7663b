import { jsPDF } from "jspdf";

const LOGO_URL = "/logo-esse-ja-foi.png";
const LOGO_RAZAO = 1459 / 740;
const COR_TEAL: [number, number, number] = [13, 148, 136];
const COR_SLATE_400: [number, number, number] = [148, 163, 184];
const COR_SLATE_950: [number, number, number] = [2, 6, 23];

async function carregarImagemBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * PDF com identidade visual padrão do sistema (logo no cabeçalho, rodapé com crédito do
 * desenvolvedor e numeração de página) — usar em qualquer exportação de documento
 * (changelog, relatórios etc.) para manter a mesma cara em todo o sistema.
 */
export async function criarPdfComMarca(subtitulo?: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margem = 40;
  const largura = doc.internal.pageSize.getWidth();
  const logoBase64 = await carregarImagemBase64(LOGO_URL);
  const logoAltura = 26;
  const logoLargura = logoAltura * LOGO_RAZAO;

  function cabecalho() {
    if (logoBase64) {
      try {
        doc.addImage(logoBase64, "PNG", margem, 26, logoLargura, logoAltura);
      } catch {
        // segue sem logo se o formato falhar por algum motivo
      }
    }
    if (subtitulo) {
      doc.setFontSize(9);
      doc.setTextColor(...COR_SLATE_400);
      doc.text(subtitulo, largura - margem, 40, { align: "right" });
    }
    doc.setDrawColor(...COR_TEAL);
    doc.setLineWidth(1.5);
    doc.line(margem, 64, largura - margem, 64);
    doc.setTextColor(...COR_SLATE_950);
    return 88; // y inicial sugerido pro conteúdo, abaixo do cabeçalho
  }

  function rodapeUmaPagina(pagina: number, totalPaginas: number) {
    const alturaPagina = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...COR_SLATE_400);
    doc.setLineWidth(0.5);
    doc.line(margem, alturaPagina - 34, largura - margem, alturaPagina - 34);
    doc.setFontSize(8);
    doc.setTextColor(...COR_SLATE_400);
    doc.text("Desenvolvido por TNS R2D2", margem, alturaPagina - 20);
    doc.text(`Página ${pagina} de ${totalPaginas}`, largura - margem, alturaPagina - 20, { align: "right" });
    doc.setTextColor(...COR_SLATE_950);
  }

  /** Chamar por último, antes de doc.save(), pra numerar e assinar todas as páginas já criadas. */
  function finalizarComRodape() {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      rodapeUmaPagina(i, total);
    }
    doc.setPage(total);
  }

  return { doc, margem, largura, cabecalho, finalizarComRodape };
}
