/** Normaliza o protocolo em respostas JSON e em folhas do conversor XML. */
export function codigoConsultaDoPayload(payload: any): string | null {
  const raiz = payload?.conferi ?? payload;
  for (const origem of [raiz?.solicitacao, raiz]) {
    for (const chave of ["codigoConsulta", "codigo_consulta"]) {
      const bruto = origem?.[chave];
      const valor = bruto && typeof bruto === "object" ? bruto["#text"] : bruto;
      if (typeof valor !== "string" && typeof valor !== "number") continue;
      const codigo = String(valor).trim();
      if (codigo) return codigo;
    }
  }
  return null;
}

/** Um HTTP 200 pode conter insumos ainda pendentes nas bases oficiais. */
export function conferiEmProcessamento(payload: any): boolean {
  const raiz = payload?.conferi ?? payload;
  const acao = raiz?.solicitacao?.acao;
  if (String(acao?.["#text"] ?? acao) === "4") return true;
  function indisponivel(valor: any): boolean {
    if (typeof valor === "string") {
      return valor
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes("sistema indisponivel");
    }
    return (
      valor != null &&
      typeof valor === "object" &&
      Object.entries(valor).some(([chave, item]) => chave !== "raw" && indisponivel(item))
    );
  }
  return indisponivel(raiz);
}
