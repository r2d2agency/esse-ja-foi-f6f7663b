import { sql } from "drizzle-orm";
import { db } from "./index";
import { RegraNegocioError, type Row } from "./cadastro.server";
import { normalizePlaca } from "@/lib/validators";

function requireDb() {
  if (!db) throw new RegraNegocioError("Banco de dados indisponível. Verifique a DATABASE_URL.", 503);
  return db;
}

let prepared = false;

export async function ensureLaudoSchema(silent = true) {
  if (prepared) return;
  const d = requireDb();
  if (!silent && process.env['NODE_ENV'] === 'development') console.log("[laudos.server] Garantindo schema laudos...");



  await d.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'laudos' AND column_name = 'motivo_devolucao') THEN
        ALTER TABLE laudos ADD COLUMN motivo_devolucao text;
      END IF;
    END $$;
  `);
  
  // Um mesmo agendamento pode manter mais de um laudo no histórico quando a
  // vistoria é refeita. O índice antigo era UNIQUE e falhava ao inicializar
  // outros módulos quando já existiam laudos repetidos.
  await d.execute(sql`DROP INDEX IF EXISTS laudos_agendamento_uidx;`);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS laudos_agendamento_idx ON laudos (agendamento_id);`);
  await d.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS laudos_protocolo_uidx ON laudos (protocolo) WHERE protocolo IS NOT NULL;`);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS laudos_vistoriador_idx ON laudos (vistoriador_id, status);`);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS public.laudos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agendamento_id uuid UNIQUE,
      veiculo_id uuid NOT NULL,
      vistoriador_id uuid,
      modelo_id uuid,
      modelo_versao integer,
      placa_confirmada text,
      status text DEFAULT 'RASCUNHO',
      bloqueado boolean DEFAULT false,
      criado_em timestamptz DEFAULT now(),
      atualizado_em timestamptz DEFAULT now()
    );
  `);

  await d.execute(sql`

    CREATE TABLE IF NOT EXISTS laudo_respostas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      laudo_id uuid NOT NULL REFERENCES laudos(id) ON DELETE CASCADE,
      item_id uuid NOT NULL,
      resposta text,
      gravidade text,
      observacao text,
      valor_num numeric(14,2),
      atualizado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS laudo_respostas_uidx ON laudo_respostas (laudo_id, item_id);`);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS laudo_fotos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      laudo_id uuid NOT NULL REFERENCES laudos(id) ON DELETE CASCADE,
      item_id uuid,
      chave text NOT NULL,
      url text,
      legenda text,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS laudo_fotos_laudo_idx ON laudo_fotos (laudo_id, item_id);`);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS laudo_acessorios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      laudo_id uuid NOT NULL REFERENCES laudos(id) ON DELETE CASCADE,
      acessorio_id uuid NOT NULL,
      estado text NOT NULL DEFAULT 'FUNCIONANDO'
    );
  `);
  await d.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS laudo_acessorios_uidx ON laudo_acessorios (laudo_id, acessorio_id);`);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS public.depreciacao_regras (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      item_id uuid, -- liga ao checklist_itens.id
      resposta text, -- 'OK', 'AVARIA', 'NA' ou nulo para regra de km/geral
      tipo_desconto text NOT NULL DEFAULT 'PERCENTUAL', -- 'PERCENTUAL' ou 'VALOR'
      valor numeric(14,2) NOT NULL DEFAULT 0,
      fator_leve numeric(14,2) DEFAULT 0.6,
      fator_media numeric(14,2) DEFAULT 1.0,
      fator_grave numeric(14,2) DEFAULT 1.8,
      ativo boolean NOT NULL DEFAULT true,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);

  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS public.depreciacao_calculos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      laudo_id uuid NOT NULL REFERENCES public.laudos(id) ON DELETE CASCADE,
      veiculo_id uuid NOT NULL,
      usuario_id uuid,
      valor_fipe numeric(14,2) NOT NULL,
      valor_final numeric(14,2) NOT NULL,
      detalhamento jsonb NOT NULL, -- array de ajustes [{titulo, tipo, valor, justificativa}]
      fora_da_curva boolean DEFAULT false,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  await d.execute(sql`CREATE INDEX IF NOT EXISTS depreciacao_calculos_veiculo_idx ON public.depreciacao_calculos (veiculo_id);`);

  // Permissions are managed via Supabase migrations



  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS configuracoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      chave text UNIQUE NOT NULL,
      valor text,
      descricao text,
      atualizado_em timestamptz NOT NULL DEFAULT now()
    );
  `);

  prepared = true;
}

export async function seedConfiguracoes() {
  const d = requireDb();
  const configs = [
    { chave: 'km_media_anual', valor: '12000', descricao: 'Kilometragem média anual esperada' },
    { chave: 'margem_alvo', valor: '8', descricao: 'Margem alvo de lucro (%)' },
    { chave: 'teto_global_depreciacao', valor: '45', descricao: 'Teto global de depreciação (%)' },
  ];
  for (const c of configs) {
    await d.execute(sql`
      INSERT INTO configuracoes (chave, valor, descricao)
      VALUES (${c.chave}, ${c.valor}, ${c.descricao})
      ON CONFLICT (chave) DO NOTHING;
    `);
  }
}

export async function seedDepreciacaoRegras() {
  const d = requireDb();
  // Regras base sugeridas
  const regras = [
    { item: 'Pneu', resposta: 'AVARIA', tipo: 'VALOR', valor: 550, fator_leve: 0.54, fator_media: 1.0, fator_grave: 1.0 }, // Meia vida vs No limite
    { item: 'Amassado', resposta: 'AVARIA', tipo: 'PERCENTUAL', valor: 1.5, fator_leve: 0.53, fator_media: 1.0, fator_grave: 1.66 },
    { item: 'Vidro Trincado', resposta: 'AVARIA', tipo: 'VALOR', valor: 400, fator_leve: 1.0, fator_media: 1.0, fator_grave: 1.0 },
    { item: 'Farol Quebrado', resposta: 'AVARIA', tipo: 'VALOR', valor: 350, fator_leve: 1.0, fator_media: 1.0, fator_grave: 1.0 },
    { item: 'Ar-condicionado Inoperante', resposta: 'AVARIA', tipo: 'VALOR', valor: 1800, fator_leve: 1.0, fator_media: 1.0, fator_grave: 1.0 },
    { item: 'Câmbio com Ruído', resposta: 'AVARIA', tipo: 'PERCENTUAL', valor: 3.0, fator_leve: 1.0, fator_media: 1.0, fator_grave: 1.0 },
    { item: 'Motor com Ruído/Fumaça', resposta: 'AVARIA', tipo: 'PERCENTUAL', valor: 6.0, fator_leve: 1.0, fator_media: 1.0, fator_grave: 1.0 },
    { item: 'Reparo Estrutural Longarina', resposta: 'AVARIA', tipo: 'PERCENTUAL', valor: 25.0, fator_leve: 1.0, fator_media: 1.0, fator_grave: 1.0 },
    { item: 'Sinistro ou Leilão', resposta: 'AVARIA', tipo: 'PERCENTUAL', valor: 30.0, fator_leve: 1.0, fator_media: 1.0, fator_grave: 1.0 },
  ];
  // Note: No sistema real, buscaríamos os IDs reais dos itens do checklist PADRAO. 
  // Por enquanto, faremos match por título se o item_id for nulo ou usaremos regras genéricas.
}

async function carregarLaudoBruto(id: string) {
  const d = requireDb();
  const rows = (await d.execute(sql`SELECT * FROM laudos WHERE id = ${id}::uuid LIMIT 1;`)) as unknown as Array<Row>;
  const laudo = rows[0];
  if (!laudo) throw new RegraNegocioError("Laudo não encontrado.", 404);
  return laudo;
}

/** Regra dura: o vistoriador só acessa os próprios laudos e nunca edita depois de enviado. */
function autorizarVistoriador(laudo: Row, vistoriadorId?: string | null, escrita = false) {
  if (vistoriadorId && String(laudo['vistoriador_id']) !== vistoriadorId) {
    throw new RegraNegocioError("Este laudo pertence a outro vistoriador.", 403);
  }
  if (escrita && (laudo['bloqueado'] === true || String(laudo['status']).toUpperCase() === "ENVIADO")) {
    throw new RegraNegocioError("Laudo já enviado. Peça à operação para devolvê-lo.", 409);
  }
}

/** Detalhe do agendamento para o app do vistoriador (com endereço, coordenadas e contato). */
export async function detalheAgendamento(id: string, vistoriadorId?: string | null) {
  await ensureLaudoSchema();
  const d = requireDb();
  const rows = (await d.execute(sql`
    SELECT a.*, v.placa, v.marca, v.modelo, v.ano_modelo, v.cor, v.km,
           v.endereco, v.cep, v.cidade AS veiculo_cidade, v.uf, v.latitude, v.longitude,
           c.nome AS cliente_nome, c.whatsapp AS cliente_whatsapp, c.telefone AS cliente_telefone,
           pa.nome AS parceiro_nome, pa.endereco AS parceiro_endereco,
           l.id AS laudo_id, l.status AS laudo_status
    FROM agendamentos a
    LEFT JOIN veiculos v ON v.id = a.veiculo_id
    LEFT JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN parceiros_vistoria pa ON pa.id = a.parceiro_id
    LEFT JOIN laudos l ON l.agendamento_id = a.id
    WHERE a.id = ${id}::uuid LIMIT 1;
  `)) as unknown as Array<Row>;
  const item = rows[0];
  if (!item) throw new RegraNegocioError("Agendamento não encontrado.", 404);
  if (vistoriadorId && String(item['vistoriador_id']) !== vistoriadorId) {
    throw new RegraNegocioError("Este agendamento pertence a outro vistoriador.", 403);
  }
  return item;
}

/** Cria (ou recupera) o rascunho do laudo a partir de um agendamento. */
export async function criarLaudo(input: { agendamentoId: string; vistoriadorId: string; placaConfirmada?: string | null | undefined }) {
  await ensureLaudoSchema();
  const d = requireDb();
  const agendamento = await detalheAgendamento(input.agendamentoId, input.vistoriadorId);

  const existentes = (await d.execute(sql`
    SELECT * FROM laudos WHERE agendamento_id = ${input.agendamentoId}::uuid LIMIT 1;
  `)) as unknown as Array<Row>;
  if (existentes[0]) return existentes[0];

  const rows = (await d.execute(sql`
    INSERT INTO laudos (agendamento_id, veiculo_id, vistoriador_id, modelo_id, modelo_versao, status, placa_confirmada)
    VALUES (${input.agendamentoId}::uuid, ${String(agendamento['veiculo_id'])}::uuid, ${input.vistoriadorId}::uuid,
            gen_random_uuid(), 1, 'RASCUNHO',
            ${input.placaConfirmada ? normalizePlaca(input.placaConfirmada) : null})
    RETURNING *;
  `)) as unknown as Array<Row>;

  const laudo = rows[0]!;

  await d.execute(sql`
    UPDATE veiculos SET status = 'EM_VISTORIA', atualizado_em = now() WHERE id = ${String(agendamento['veiculo_id'])}::uuid;
  `);
  await d.execute(sql`
    UPDATE agendamentos SET status = 'EM_ANDAMENTO', atualizado_em = now() WHERE id = ${input.agendamentoId}::uuid;
  `);
  await d.execute(sql`
    INSERT INTO logs (entidade, entidade_id, acao, para, detalhe)
    VALUES ('laudo', ${String(laudo['id'])}, 'Laudo iniciado', 'EM_VISTORIA', 'Modelo base v1');
  `);
  return laudo;
}

/** Estrutura completa: laudo + itens do modelo da versão usada + respostas + fotos + acessórios. */
export async function obterLaudo(id: string, vistoriadorId?: string | null) {
  await ensureLaudoSchema();
  const d = requireDb();
  const laudo = await carregarLaudoBruto(id);
  autorizarVistoriador(laudo, vistoriadorId);

  const [itens, respostas, fotos, acessoriosMarcados, catalogo, contexto] = await Promise.all([
    d.execute(sql`SELECT * FROM checklist_itens WHERE modelo_id = ${String(laudo['modelo_id'])}::uuid ORDER BY categoria, ordem;`),
    d.execute(sql`SELECT * FROM laudo_respostas WHERE laudo_id = ${id}::uuid;`),
    d.execute(sql`SELECT * FROM laudo_fotos WHERE laudo_id = ${id}::uuid ORDER BY criado_em;`),
    d.execute(sql`SELECT * FROM laudo_acessorios WHERE laudo_id = ${id}::uuid;`),
    d.execute(sql`SELECT * FROM acessorios_catalogo WHERE ativo = true ORDER BY coalesce(categoria, ''), nome;`),
    d.execute(sql`
      SELECT a.data_hora, a.observacao, v.placa, v.marca, v.modelo, v.ano_modelo, v.cor, v.km, v.cidade,
             c.nome AS cliente_nome
      FROM agendamentos a
      LEFT JOIN veiculos v ON v.id = a.veiculo_id
      LEFT JOIN clientes c ON c.id = v.cliente_id
      WHERE a.id = ${String(laudo['agendamento_id'])}::uuid LIMIT 1;
    `),
  ]);

  return {
    laudo,
    itens: itens as unknown as Array<Row>,
    respostas: respostas as unknown as Array<Row>,
    fotos: fotos as unknown as Array<Row>,
    acessorios: acessoriosMarcados as unknown as Array<Row>,
    catalogoAcessorios: catalogo as unknown as Array<Row>,
    contexto: (contexto as unknown as Array<Row>)[0] ?? null,
  };
}

/** Salvamento incremental e idempotente de um item. */
export async function salvarResposta(input: {
  laudoId: string;
  itemId: string;
  resposta?: string | null | undefined;
  gravidade?: string | null | undefined;
  observacao?: string | null | undefined;
  valorNum?: number | null | undefined;
  vistoriadorId?: string | null | undefined;
}) {
  await ensureLaudoSchema();
  const d = requireDb();
  const laudo = await carregarLaudoBruto(input.laudoId);
  autorizarVistoriador(laudo, input.vistoriadorId, true);

  const resposta = (input.resposta ?? "").toUpperCase() || null;
  if (resposta === "AVARIA") {
    if (!input.observacao?.trim()) throw new RegraNegocioError("Descreva a avaria encontrada.", 422);
    if (!input.gravidade) throw new RegraNegocioError("Informe a gravidade da avaria.", 422);
  }

  const rows = (await d.execute(sql`
    INSERT INTO laudo_respostas (laudo_id, item_id, resposta, gravidade, observacao, valor_num)
    VALUES (${input.laudoId}::uuid, ${input.itemId}::uuid, ${resposta},
            ${input.gravidade ? input.gravidade.toUpperCase() : null}, ${input.observacao ?? null},
            ${input.valorNum ?? null})
    ON CONFLICT (laudo_id, item_id) DO UPDATE SET
      resposta = EXCLUDED.resposta,
      gravidade = EXCLUDED.gravidade,
      observacao = EXCLUDED.observacao,
      valor_num = EXCLUDED.valor_num,
      atualizado_em = now()
    RETURNING *;
  `)) as unknown as Array<Row>;
  await d.execute(sql`UPDATE laudos SET atualizado_em = now() WHERE id = ${input.laudoId}::uuid;`);
  return rows[0]!;
}

/** Vincula uma foto já enviada (chave do storage) ao laudo/item. */
export async function salvarFoto(input: {
  laudoId: string;
  itemId?: string | null | undefined;
  chave: string;
  url?: string | null | undefined;
  legenda?: string | null | undefined;
  vistoriadorId?: string | null | undefined;
}) {
  await ensureLaudoSchema();
  const d = requireDb();
  const laudo = await carregarLaudoBruto(input.laudoId);
  autorizarVistoriador(laudo, input.vistoriadorId, true);
  if (!input.chave?.trim()) throw new RegraNegocioError("Chave da foto ausente.", 422);
  const rows = (await d.execute(sql`
    INSERT INTO laudo_fotos (laudo_id, item_id, chave, url, legenda)
    VALUES (${input.laudoId}::uuid, ${input.itemId ? input.itemId : null}, ${input.chave.trim()},
            ${input.url ?? null}, ${input.legenda ?? null})
    RETURNING *;
  `)) as unknown as Array<Row>;
  await d.execute(sql`UPDATE laudos SET atualizado_em = now() WHERE id = ${input.laudoId}::uuid;`);
  return rows[0]!;
}

export async function removerFoto(input: { laudoId: string; fotoId: string; vistoriadorId?: string | null | undefined }) {
  await ensureLaudoSchema();
  const d = requireDb();
  const laudo = await carregarLaudoBruto(input.laudoId);
  autorizarVistoriador(laudo, input.vistoriadorId, true);
  await d.execute(sql`DELETE FROM laudo_fotos WHERE id = ${input.fotoId}::uuid AND laudo_id = ${input.laudoId}::uuid;`);
  return { ok: true };
}

/** Substitui a lista de acessórios marcados. */
export async function salvarAcessoriosLaudo(input: {
  laudoId: string;
  itens: Array<{ acessorioId: string; estado: string }>;
  vistoriadorId?: string | null | undefined;
}) {
  await ensureLaudoSchema();
  const d = requireDb();
  const laudo = await carregarLaudoBruto(input.laudoId);
  autorizarVistoriador(laudo, input.vistoriadorId, true);
  await d.execute(sql`DELETE FROM laudo_acessorios WHERE laudo_id = ${input.laudoId}::uuid;`);
  for (const item of input.itens) {
    const estado = item.estado.toUpperCase() === "COM_DEFEITO" ? "COM_DEFEITO" : "FUNCIONANDO";
    await d.execute(sql`
      INSERT INTO laudo_acessorios (laudo_id, acessorio_id, estado)
      VALUES (${input.laudoId}::uuid, ${item.acessorioId}::uuid, ${estado})
      ON CONFLICT (laudo_id, acessorio_id) DO UPDATE SET estado = EXCLUDED.estado;
    `);
  }
  await d.execute(sql`UPDATE laudos SET atualizado_em = now() WHERE id = ${input.laudoId}::uuid;`);
  return { ok: true, total: input.itens.length };
}

/** Compara a placa digitada com a do agendamento. */
export async function validarPlaca(input: { laudoId?: string | null | undefined; agendamentoId?: string | null | undefined; placa: string; vistoriadorId?: string | null | undefined }) {
  await ensureLaudoSchema();
  const d = requireDb();
  let agendamentoId = input.agendamentoId ?? null;
  if (!agendamentoId && input.laudoId) {
    const laudo = await carregarLaudoBruto(input.laudoId);
    autorizarVistoriador(laudo, input.vistoriadorId);
    agendamentoId = String(laudo['agendamento_id']);
  }
  if (!agendamentoId) throw new RegraNegocioError("Agendamento não informado.", 422);
  const agendamento = await detalheAgendamento(agendamentoId, input.vistoriadorId ?? null);
  const esperada = normalizePlaca(String(agendamento['placa'] ?? ""));
  const informada = normalizePlaca(input.placa);
  if (esperada !== informada) {
    return { ok: false as const, confere: false as const, esperada, informada, message: `A placa informada (${informada}) não confere com a do agendamento.` };
  }
  if (input.laudoId) {
    await d.execute(sql`UPDATE laudos SET placa_confirmada = ${informada}, atualizado_em = now() WHERE id = ${input.laudoId}::uuid;`);
  }
  return { ok: true as const, confere: true as const, esperada, informada };
}

export async function registrarDivergenciaPlaca(input: { agendamentoId: string; placaInformada: string; vistoriadorId: string; observacao?: string | null | undefined }) {
  await ensureLaudoSchema();
  const d = requireDb();
  const agendamento = await detalheAgendamento(input.agendamentoId, input.vistoriadorId);
  const texto = `Placa divergente: esperada ${agendamento['placa']}, encontrada ${normalizePlaca(input.placaInformada)}. ${input.observacao ?? ""}`.trim();
  await d.execute(sql`
    INSERT INTO logs (entidade, entidade_id, acao, detalhe)
    VALUES ('agendamento', ${input.agendamentoId}, 'Divergência de placa', ${texto});
  `);
  await d.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notificacoes') THEN
        CREATE TABLE notificacoes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          destinatario_id uuid REFERENCES profiles(id),
          titulo text NOT NULL,
          mensagem text NOT NULL,
          tipo text DEFAULT 'GERAL',
          lida boolean DEFAULT false,
          criado_em timestamptz DEFAULT now()
        );
      END IF;
    END $$;
  `);

  await d.execute(sql`
    INSERT INTO notificacoes (destinatario_id, titulo, mensagem, tipo)
    VALUES (NULL, ${"Divergência de placa na vistoria"}, ${texto}, 'VISTORIA');
  `);
  return { ok: true, mensagem: texto };
}

export async function gerarPdfLaudo(laudoId: string) {
  // Simulação de geração de PDF
  // No futuro, integraria com bibliotecas como react-pdf (server-side) ou puppeteer
  // Retorna um link ou base64 simulado
  return { 
    ok: true, 
    url: "#", 
    message: "Gerador de PDF em fase de implementação (Layout em desenvolvimento)" 
  };
}

export type Pendencia = { itemId: string | null; titulo: string; motivo: string };

/** Lista tudo o que impede o envio do laudo. */
export async function pendenciasLaudo(laudoId: string): Promise<Array<Pendencia>> {
  const d = requireDb();
  const laudo = await carregarLaudoBruto(laudoId);
  const itens = (await d.execute(sql`
    SELECT * FROM checklist_itens WHERE modelo_id = ${String(laudo['modelo_id'])}::uuid ORDER BY categoria, ordem;
  `)) as unknown as Array<Row>;
  const respostas = (await d.execute(sql`SELECT * FROM laudo_respostas WHERE laudo_id = ${laudoId}::uuid;`)) as unknown as Array<Row>;
  const fotos = (await d.execute(sql`SELECT * FROM laudo_fotos WHERE laudo_id = ${laudoId}::uuid;`)) as unknown as Array<Row>;

  const porItem = new Map(respostas.map((r) => [String(r['item_id']), r]));
  const fotosPorItem = new Map<string, number>();
  for (const f of fotos) {
    const key = f['item_id'] ? String(f['item_id']) : "_geral";
    fotosPorItem.set(key, (fotosPorItem.get(key) ?? 0) + 1);
  }

  const pendencias: Array<Pendencia> = [];
  if (!laudo['placa_confirmada']) {
    pendencias.push({ itemId: null, titulo: "Confirmação de placa", motivo: "Confirme a placa do veículo antes de enviar." });
  }
  for (const item of itens) {
    const id = String(item['id']);
    const titulo = String(item['titulo']);
    const r = porItem.get(id);
    const valor = String(r?.['resposta'] ?? "").trim();
    if (item['obrigatorio'] === true && !valor) {
      pendencias.push({ itemId: id, titulo, motivo: "Item não respondido." });
      continue;
    }
    if (valor.toUpperCase() === "AVARIA") {
      if (!String(r?.['observacao'] ?? "").trim()) pendencias.push({ itemId: id, titulo, motivo: "Avaria sem descrição." });
      if (!r?.['gravidade']) pendencias.push({ itemId: id, titulo, motivo: "Avaria sem gravidade." });
      if (!fotosPorItem.get(id)) pendencias.push({ itemId: id, titulo, motivo: "Avaria sem foto." });
    }
    if (item['exige_foto'] === true && !fotosPorItem.get(id)) {
      pendencias.push({ itemId: id, titulo, motivo: "Foto obrigatória ausente." });
    }
  }
  return pendencias;
}

function gerarProtocolo() {
  const agora = new Date();
  const base = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, "0")}${String(agora.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `LAU-${base}-${rand}`;
}

/** Envia o laudo: valida pendências, gera protocolo, bloqueia e move o veículo para EM_AVALIACAO. */
export async function enviarLaudo(input: { laudoId: string; vistoriadorId?: string | null | undefined }) {
  await ensureLaudoSchema();
  const d = requireDb();
  const laudo = await carregarLaudoBruto(input.laudoId);
  autorizarVistoriador(laudo, input.vistoriadorId, true);

  const pendencias = await pendenciasLaudo(input.laudoId);
  if (pendencias.length) {
    const erro = new RegraNegocioError("Existem pendências que impedem o envio.", 422) as RegraNegocioError & { pendencias: Array<Pendencia> };
    erro.pendencias = pendencias;
    throw erro;
  }

  const protocolo = gerarProtocolo();
  const rows = (await d.execute(sql`
    UPDATE laudos SET status = 'ENVIADO', bloqueado = true, protocolo = ${protocolo},
      enviado_em = now(), atualizado_em = now(), motivo_devolucao = NULL
    WHERE id = ${input.laudoId}::uuid RETURNING *;
  `)) as unknown as Array<Row>;
  const atualizado = rows[0]!;

  await d.execute(sql`
    UPDATE veiculos SET status = 'EM_AVALIACAO', atualizado_em = now() WHERE id = ${String(laudo['veiculo_id'])}::uuid;
  `);
  await d.execute(sql`
    UPDATE agendamentos SET status = 'CONCLUIDO', atualizado_em = now() WHERE id = ${String(laudo['agendamento_id'])}::uuid;
  `);
  await d.execute(sql`
    INSERT INTO logs (entidade, entidade_id, acao, para, detalhe)
    VALUES ('laudo', ${input.laudoId}, 'Laudo enviado', 'EM_AVALIACAO', ${`Protocolo ${protocolo}`});
  `);
  await d.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notificacoes') THEN
        CREATE TABLE notificacoes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          destinatario_id uuid REFERENCES profiles(id),
          titulo text NOT NULL,
          mensagem text NOT NULL,
          tipo text DEFAULT 'GERAL',
          lida boolean DEFAULT false,
          criado_em timestamptz DEFAULT now()
        );
      END IF;
    END $$;
  `);

  await d.execute(sql`
    INSERT INTO notificacoes (destinatario_id, titulo, mensagem, tipo)
    VALUES (NULL, ${"Laudo recebido"}, ${`Laudo ${protocolo} enviado e aguardando avaliação.`}, 'VISTORIA');
  `);

  await calcularDepreciacao(input.laudoId);
  return atualizado;
}

/** Cálculo simples de depreciação a partir das avarias registradas. */
export async function calcularDepreciacao(laudoId: string) {
  const d = requireDb();
  await d.execute(sql`
    CREATE TABLE IF NOT EXISTS depreciacao_calculos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      laudo_id uuid NOT NULL,
      veiculo_id uuid NOT NULL,
      percentual numeric(8,2) NOT NULL DEFAULT 0,
      valor numeric(12,2) NOT NULL DEFAULT 0,
      detalhe text,
      criado_em timestamptz NOT NULL DEFAULT now()
    );
  `);
  const laudo = await carregarLaudoBruto(laudoId);
  const rows = (await d.execute(sql`
    SELECT upper(coalesce(gravidade, 'LEVE')) AS gravidade, count(*)::int AS total
    FROM laudo_respostas WHERE laudo_id = ${laudoId}::uuid AND upper(coalesce(resposta, '')) = 'AVARIA'
    GROUP BY 1;
  `)) as unknown as Array<Record<string, string | number>>;
  const pesos: Record<string, number> = { LEVE: 0.5, MEDIA: 1.5, GRAVE: 4 };
  let percentual = 0;
  const partes: Array<string> = [];
  for (const r of rows) {
    const g = String(r['gravidade']);
    const total = Number(r['total'] ?? 0);
    percentual += (pesos[g] ?? 0.5) * total;
    partes.push(`${total}x ${g}`);
  }
  percentual = Math.min(percentual, 40);
  const fipe = (await d.execute(sql`SELECT coalesce(valor_fipe, 0) AS fipe FROM veiculos WHERE id = ${String(laudo['veiculo_id'])}::uuid;`)) as unknown as Array<Record<string, string>>;
  const valorFipe = Number(fipe[0]?.['fipe'] ?? 0);
  const valor = Math.round(valorFipe * (percentual / 100) * 100) / 100;
  await d.execute(sql`
    INSERT INTO depreciacao_calculos (laudo_id, veiculo_id, percentual, valor, detalhe)
    VALUES (${laudoId}::uuid, ${String(laudo['veiculo_id'])}::uuid, ${percentual}, ${valor}, ${partes.join(", ") || "Sem avarias"});
  `);
  return { percentual, valor };
}

/** Operação/Admin reabre o laudo com motivo. */
export async function devolverLaudo(input: { laudoId: string; motivo: string; usuario?: string | null | undefined }) {
  await ensureLaudoSchema();
  const d = requireDb();
  if (!input.motivo?.trim()) throw new RegraNegocioError("Informe o motivo da devolução.", 422);
  const laudo = await carregarLaudoBruto(input.laudoId);
  const rows = (await d.execute(sql`
    UPDATE laudos SET status = 'DEVOLVIDO', bloqueado = false, motivo_devolucao = ${input.motivo.trim()}, atualizado_em = now()
    WHERE id = ${input.laudoId}::uuid RETURNING *;
  `)) as unknown as Array<Row>;
  await d.execute(sql`
    UPDATE veiculos SET status = 'EM_VISTORIA', atualizado_em = now() WHERE id = ${String(laudo['veiculo_id'])}::uuid;
  `);
  await d.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notificacoes') THEN
        CREATE TABLE notificacoes (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          destinatario_id uuid REFERENCES profiles(id),
          titulo text NOT NULL,
          mensagem text NOT NULL,
          tipo text DEFAULT 'GERAL',
          lida boolean DEFAULT false,
          criado_em timestamptz DEFAULT now()
        );
      END IF;
    END $$;
  `);

  await d.execute(sql`
    INSERT INTO notificacoes (destinatario_id, titulo, mensagem, tipo)
    VALUES (${String(laudo['vistoriador_id'])}, ${"Laudo devolvido"}, ${input.motivo.trim()}, 'VISTORIA');
  `);
  await d.execute(sql`
    INSERT INTO logs (entidade, entidade_id, acao, detalhe, usuario)
    VALUES ('laudo', ${input.laudoId}, 'Laudo devolvido', ${input.motivo.trim()}, ${input.usuario ?? null});
  `);
  return rows[0]!;
}

export async function listarLaudos(filtros: { status?: string | null | undefined; vistoriadorId?: string | null | undefined } = {}) {
  await ensureLaudoSchema();
  const d = requireDb();
  const status = (filtros.status ?? "").toUpperCase();
  const vistoriador = filtros.vistoriadorId ?? "";
  return (await d.execute(sql`
    SELECT l.*, v.placa, v.marca, v.modelo, p.nome AS vistoriador_nome
    FROM laudos l
    LEFT JOIN veiculos v ON v.id = l.veiculo_id
    LEFT JOIN profiles p ON p.id = l.vistoriador_id
    WHERE (${status === ""} OR upper(l.status) = ${status})
      AND (${vistoriador === ""} OR l.vistoriador_id::text = ${vistoriador})
    ORDER BY l.atualizado_em DESC LIMIT 200;
  `)) as unknown as Array<Row>;
}