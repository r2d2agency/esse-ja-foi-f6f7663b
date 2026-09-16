import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Executa o serviço real com banco e HTTP simulados; não consome consultas da Company.
const registros = [];
const chamadas = [];
const salvos = [];
const respostas = [];
let proximoRastreio = 1;
const prov = {
  nome: "Company Conferi",
  usuario: "1",
  senha: "teste",
  ativo: true,
  base_url: "https://example.invalid/api-clientes",
  caminho_consulta: "/conferi-veiculo/json",
};
const veiculo = {
  id: "veiculo-1",
  placa: "ABC1234",
  chassi: "chassi-original",
  marca: "Marca",
  modelo: "Modelo",
  valor_interesse_cliente: 45000,
};
const sql = (parts, ...values) => ({ text: parts.join("?"), values });
const db = {
  transaction: async (fn) => fn(db),
  async execute({ text, values: v }) {
    const q = text.replace(/\s+/g, " ").trim();
    if (/^(CREATE|ALTER|DO)/.test(q) || q.includes("pg_advisory")) return [];
    if (q.includes("consulta_provedores")) return q.startsWith("SELECT") ? [prov] : [];
    if (q.startsWith("SELECT") && q.includes("FROM veiculos")) return [veiculo];
    if (q.startsWith("UPDATE veiculos")) return [];
    if (q.startsWith("INSERT INTO veiculo_consultas")) {
      const keys = q.match(/veiculo_consultas \((.*?)\)/)[1].split(", ");
      const row = Object.fromEntries(
        keys.map((k, i) => [
          k,
          ["parametros", "resumo", "resposta"].includes(k) ? JSON.parse(v[i]) : v[i],
        ]),
      );
      row.id = `consulta-${registros.length + 1}`;
      registros.push(row);
      return [row];
    }
    if (q.startsWith("UPDATE veiculo_consultas")) {
      const row = registros.find((r) => r.id === v.at(-1));
      assert.ok(row, "UPDATE deve localizar um registro");
      const assignments = q.split(" SET ")[1].split(" WHERE ")[0].split(", ");
      assignments.forEach((assignment, i) => {
        const key = assignment.split(" = ")[0];
        row[key] = ["resumo", "resposta"].includes(key) ? JSON.parse(v[i]) : v[i];
      });
      return [row];
    }
    if (q.startsWith("SELECT") && q.includes("FROM veiculo_consultas")) {
      if (q.includes("WHERE produto ="))
        return registros
          .filter(
            (r) =>
              r.produto === v[0] && r.placa === v[1] && r.veiculo_id === v[2] && r.chassi === v[3],
          )
          .slice(-1);
      if (q.includes("WHERE protocolo =")) return registros.filter((r) => r.protocolo === v[0]);
      if (q.includes("WHERE id =")) return registros.filter((r) => r.id === v[0]);
      if (q.includes("protocolo IS NULL")) return registros.filter((r) => !r.protocolo);
    }
    throw new Error(`SQL inesperado: ${q}`);
  },
};
function load(path, dependencies) {
  const module = { exports: {} };
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports: module.exports,
    module,
    require: (name) => {
      assert.ok(name in dependencies, `Dependência inesperada: ${name}`);
      return dependencies[name];
    },
    AbortSignal,
    fetch: async (url, options) => {
      chamadas.push({ url, body: JSON.parse(options.body) });
      assert.ok(respostas.length, "Chamada inesperada ao provedor");
      return new Response(JSON.stringify(respostas.shift()), { status: 200 });
    },
  });
  return module.exports;
}
const helpers = load("../src/db/conferi-protocolo.ts", {});
const service = load("../src/db/consulta-veicular.server.ts", {
  "drizzle-orm": { sql },
  "./index": { db },
  "./conferi-protocolo": helpers,
  "./consulta-logs.server": {
    criarContextoConsultaLog: (dados) => ({
      ...dados,
      rastreioId: `rastreio-${proximoRastreio++}`,
    }),
    registrarEventoConsulta: async () => {},
  },
  "./cadastro.server": { salvarVeiculo: async (v) => salvos.push(v) },
});
const pendente = (codigo) => ({ solicitacao: { acao: "4", codigo_consulta: codigo } });
const fipe = (valor) => ({
  solicitacao: { acao: "1" },
  precificador: { precificador: { Valor: valor } },
});

respostas.push({ agregados: { marca: "Marca", modelo: "Modelo" } });
assert.equal((await service.consultarAgregadosPorPlaca("ABC1234")).dados.marca, "Marca");
assert.equal(registros.length, 0, "Agregados mantém o retorno imediato");

respostas.push(pendente("10904442"));
const inicio = await service.consultarDesvalorizacaoFipe(veiculo.id);
assert.equal(inicio.status, "PROCESSANDO");
assert.equal(inicio.protocolo, "10904442");
const antes = chamadas.length;
assert.equal((await service.consultarDesvalorizacaoFipe(veiculo.id)).status, "PROCESSANDO");
assert.equal((await service.obterConsultaRegistrada(inicio.id)).status, "PROCESSANDO");
assert.equal(chamadas.length, antes, "Acompanhar não consulta novamente a Company");
respostas.push(fipe("R$ 71.123,00"));
assert.equal((await service.processarWebhookConferi("10904442")).ok, true);
assert.equal(chamadas.at(-1).body.codigo_consulta, 10904442);
assert.equal(chamadas.at(-1).body.parametros.placa, "ABC1234");
assert.ok(chamadas.at(-1).url.endsWith("/conferi-desvalorizacao/json"));
assert.equal(salvos.at(-1).valorFipe, 71123);
assert.equal(salvos.at(-1).valorInteresseCliente, 45000);
assert.equal((await service.obterConsultaRegistrada(inicio.id)).dados.valorNumero, 71123);

respostas.push(pendente("fipe-teste"));
const teste = await service.consultarDesvalorizacaoFipePorPlaca("ABC1234");
assert.equal(teste.status, "PROCESSANDO");
assert.equal(registros.at(-1).veiculo_id, null);
respostas.push(fipe(72000.25));
await service.processarWebhookConferi("fipe-teste");
assert.equal((await service.obterConsultaRegistrada(teste.id)).dados.valorNumero, 72000.25);
assert.equal(salvos.length, 1, "Teste avulso não altera o veículo");

respostas.push({
  solicitacao: { acao: "1", codigoConsulta: "gold" },
  agregados: { marca: "Marca" },
  estadual: { mensagem: "Sistema indisponível" },
});
const gold = await service.consultarLaudoVeiculo(veiculo.id);
assert.equal(gold.status, "PROCESSANDO");
assert.equal(chamadas.at(-1).body.codigo_consulta, undefined, "Gold não reutiliza protocolo FIPE");
assert.equal(chamadas.at(-1).body.parametros.produto, "conferi-auto-pericia-gold");
respostas.push({ solicitacao: { acao: "1" }, agregados: { situacao: "REGULAR" } });
await service.processarWebhookConferi("gold");
assert.equal((await service.obterConsultaRegistrada(gold.id)).status, "CONCLUIDA");
assert.equal(chamadas.at(-1).body.parametros.chassi, "chassi-original");

respostas.push(pendente("gold-teste"));
const goldTeste = await service.consultarPlacaAvulsa("DEF5678");
assert.equal(goldTeste.status, "PROCESSANDO");
respostas.push({ solicitacao: { acao: "1" }, agregados: { situacao: "REGULAR" } });
await service.processarWebhookConferi("gold-teste");
assert.equal((await service.obterConsultaRegistrada(goldTeste.id)).status, "CONCLUIDA");

// Notificações posteriores atualizam um resultado já concluído.
respostas.push(fipe("R$ 73.000,00"));
await service.processarWebhookConferi("10904442");
assert.equal(salvos.at(-1).valorFipe, 73000);

// Recupera legado salvo sem coluna de protocolo, usando a resposta original.
registros.find((r) => r.id === teste.id).protocolo = null;
registros.find((r) => r.id === teste.id).resposta = pendente("fipe-teste");
respostas.push(fipe("R$ 74.000,00"));
await service.processarWebhookConferi("fipe-teste");
assert.equal((await service.obterConsultaRegistrada(teste.id)).protocolo, "fipe-teste");

// Um histórico indisponível não bloqueia o valor atual pedido pelo usuário.
respostas.push({ ...fipe(75000), historico: { mensagem: "Sistema indisponivel" } });
const valorComHistoricoPendente = await service.consultarDesvalorizacaoFipePorPlaca("GHI1234");
assert.equal(valorComHistoricoPendente.status, "CONCLUIDA");
assert.equal(valorComHistoricoPendente.dados.valorNumero, 75000);

respostas.push({
  solicitacao: { acao: "1" },
  precificador: { precificador: { Valor: "indisponível" } },
});
const semValor = await service.consultarDesvalorizacaoFipePorPlaca("JKL1234");
assert.equal(semValor.ok, false);
assert.equal(semValor.status, "ERRO");

respostas.push(pendente(undefined));
assert.equal((await service.consultarDesvalorizacaoFipePorPlaca("MNO1234")).status, "ERRO");

respostas.push({ solicitacao: { acao: "2", codigoConsulta: "negado" } });
assert.equal((await service.consultarPlacaAvulsa("PQR1234")).ok, false);

assert.equal((await service.processarWebhookConferi("desconhecido")).ok, false);
respostas.push(pendente("10904442"));
const repetida = await service.consultarDesvalorizacaoFipePorPlaca("STU1234");
respostas.push(fipe(76000), fipe(76000));
await service.processarWebhookConferi("10904442");
assert.equal((await service.obterConsultaRegistrada(inicio.id)).dados.valorNumero, 76000);
assert.equal((await service.obterConsultaRegistrada(repetida.id)).dados.valorNumero, 76000);
assert.equal(respostas.length, 0);
console.log("Fluxos Agregados, FIPE, Gold, testes e webhook passaram com HTTP e banco simulados.");
