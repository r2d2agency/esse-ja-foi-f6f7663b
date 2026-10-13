/**
 * Extrai o erro REAL de uma falha de query.
 *
 * O que acontecia: o Drizzle embrulha o erro do Postgres em `.cause`, mas a
 * mensagem de `err.message` continua sendo "Failed query: SELECT ... params: ...".
 * Todo log de erro do WhatsApp mostrava exatamente isso — a query e os parâmetros,
 * nunca o motivo. Um `contato_id` com tipo errado, uma coluna inexistente e um
 * UUID malformado apareciam todos como a mesma query, sem nenhuma pista.
 *
 * O erro do Postgres (via postgres-js) carrega os campos que explicam a falha:
 * `code` (SQLSTATE, ex. 22P02 = UUID inválido, 42703 = coluna inexistente,
 * 42804 = tipo incompatível), `severity`, `detail` e `hint`. São esses que
 * precisam aparecer.
 */

/** SQLSTATE -> explicação em português dos mais comuns neste projeto. */
const SQLSTATE: Record<string, string> = {
  "22P02": "texto com formato inválido (ex.: UUID ou número malformado)",
  "42703": "a coluna não existe na tabela",
  "42P01": "a tabela não existe",
  "42804": "tipo de dado incompatível na comparação",
  "42883": "a função não existe com esses argumentos",
  "23505": "violação de unicidade (registro duplicado)",
  "23503": "violação de chave estrangeira (registro referenciado não existe)",
  "23502": "campo obrigatório (NOT NULL) ficou vazio",
  "25P02": "a transação foi abortada por um erro anterior",
  "42P07": "a tabela já existe",
  "42701": "a coluna já existe",
  "42710": "o objeto já existe",
  "08006": "a conexão com o banco caiu",
  "57P01": "o servidor do banco está sendo encerrado",
};

export type ErroPostgres = {
  /** Mensagem legível, já com a causa real do Postgres quando disponível. */
  mensagem: string;
  /** SQLSTATE, quando o driver o informou. */
  code: string | null;
  /** Explicação do SQLSTATE em português, quando conhecido. */
  explicacao: string | null;
  /** Coluna/tabela/restrição apontada pelo Postgres, quando houver. */
  detalhe: string | null;
  /** Sugestão do próprio Postgres, quando houver. */
  hint: string | null;
  /** Query e params, só para contexto — nunca como substituto do motivo. */
  query: string | null;
};

function limpar(v: unknown, limite = 600): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, limite) : null;
}

/**
 * Percorre a cadeia `cause` procurando o erro que tem `code` de Postgres. Sem
 * isso, o que se obtém é sempre a mensagem do Drizzle com a query.
 */
export function extrairErroPostgres(erro: any): ErroPostgres {
  // O erro do Postgres pode estar no próprio objeto ou em .cause (Drizzle),
  // possivelmente aninhado mais fundo.
  let atual = erro;
  let pg: any = null;
  for (let i = 0; i < 6 && atual; i++) {
    if (typeof atual?.code === "string" && /^[0-9A-Z]{5}$/.test(atual.code)) {
      pg = atual;
      break;
    }
    // postgres-js às vezes guarda o erro original em `.cause` ou `.error`.
    atual = atual?.cause ?? atual?.error ?? null;
  }

  const code = pg?.code ?? null;
  const detalhe = limpar(pg?.detail) ?? limpar(pg?.column_name ?? pg?.table_name ?? pg?.constraint_name);
  const hint = limpar(pg?.hint);
  const query = limpar(pg?.query ?? erro?.query);

  // A mensagem preferencial é a do Postgres; se não achou nenhum erro com code,
  // cai para a mensagem original — mas ainda mostra a query como contexto.
  const bruta = limpar(pg?.message ?? erro?.message ?? erro, 900);
  const explicacao = code ? SQLSTATE[code] ?? null : null;

  const partes = [bruta];
  if (code) partes.push(`[SQLSTATE ${code}${explicacao ? ` — ${explicacao}` : ""}]`);
  if (detalhe) partes.push(`detalhe: ${detalhe}`);
  if (hint) partes.push(`dica: ${hint}`);

  return {
    mensagem: partes.filter(Boolean).join(" "),
    code,
    explicacao,
    detalhe,
    hint,
    query,
  };
}

/** Atalho para gravar só a string em logs já existentes. */
export function mensagemErroPostgres(erro: any): string {
  return extrairErroPostgres(erro).mensagem;
}
