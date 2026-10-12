// Converte blocos `DO $$ ... IF NOT EXISTS ... ADD COLUMN ... END $$;`
// em `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...;`
// Uso: node fix-do-blocks.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = "E:/DESENVOLVIMENTOS/ESSE JA FOI/esse-ja-foi-f6f7663b/src/db";

const files = process.argv.slice(2);
let total = 0;

for (const rel of files) {
  const file = join(root, rel);
  let src = readFileSync(file, "utf8");
  const before = src;

  // Captura: DO $$ ... IF NOT EXISTS (...table_name = 'T'... column_name = 'C') THEN
  //            [comentários]
  //            ALTER TABLE T ADD COLUMN C <RESTO>;
  //          END IF; [END $$;]
  const re = /DO\s*\$\$\s*BEGIN([\s\S]*?)(END\s*\$\$;?)/g;

  src = src.replace(re, (whole, body) => {
    // Remove comentários SQL (--) e o wrapper IF NOT EXISTS
    const cleaned = body
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .replace(/IF\s+NOT\s+EXISTS\s*\(SELECT\s+1\s+FROM\s+information_schema\.columns\s+WHERE\s+table_name\s*=\s*'([^']+)'\s+AND\s+column_name\s*=\s*'([^']+)'\)\s*THEN/gi,
        (_m, tbl, col) => `__TBL__${tbl}__COL__${col}__`)
      .replace(/END\s*IF;/gi, "")
      .replace(/^\s*ALTER\s+TABLE\s+(\S+)\s+ADD\s+COLUMN\s+/gi, (_m, tbl) => {
        // encontra o marcador de tabela/coluna mais recente
        return `ALTER TABLE ${tbl} ADD COLUMN `;
      });

    // Extrai pares (tabela, coluna, resto)
    const out = [];
    const reCol = /__TBL__([^_]+)__COL__([^_]+)__ALTER TABLE (\S+) ADD COLUMN ([^;]+);/g;
    let m;
    while ((m = reCol.exec(cleaned)) !== null) {
      const [, tblMarker, colMarker, tbl, rest] = m;
      out.push(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${colMarker} ${rest};`);
    }
    if (out.length === 0) return whole; // não conseguiu parsear, deixa como está
    return out.join("\n");
  });

  if (src !== before) {
    writeFileSync(file, src);
    const n = (before.match(/DO\s*\$\$/g) || []).length - (src.match(/DO\s*\$\$/g) || []).length;
    console.log(`${rel}: ${n} bloco(s) convertido(s)`);
    total += n;
  } else {
    console.log(`${rel}: sem alterações`);
  }
}
console.log(`\nTotal: ${total} bloco(s)`);
