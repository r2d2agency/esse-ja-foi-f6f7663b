import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";

const source = readFileSync(new URL("../src/db/conferi-protocolo.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
});
const { codigoConsultaDoPayload: codigo } = await import(
  "data:text/javascript;base64," + Buffer.from(outputText).toString("base64")
);

for (const payload of [
  { solicitacao: { codigoConsulta: 10904442, acao: 4 } },
  { solicitacao: { codigo_consulta: "10904442" } },
  { conferi: { solicitacao: { codigoConsulta: { "#text": "10904442" } } } },
  { conferi: { codigo_consulta: " 10904442 " } },
  { solicitacao: { codigoConsulta: {}, codigo_consulta: "10904442" } },
])
  assert.equal(codigo(payload), "10904442");

for (const payload of [
  null,
  {},
  { solicitacao: { codigoConsulta: {} } },
  { codigo_consulta: " " },
]) {
  assert.equal(codigo(payload), null);
}
console.log("9 testes de protocolo Conferi passaram.");
