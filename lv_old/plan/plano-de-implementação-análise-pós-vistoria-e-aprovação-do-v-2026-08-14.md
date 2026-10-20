# Plano de Implementação: Análise Pós-Vistoria e Aprovação do Valor

Este plano detalha a criação do módulo administrativo para análise de vistorias concluídas e o fluxo de negociação de valores com o vendedor.

## Mudanças Técnicas
- **Database**:
  - Nova tabela `propostas_veiculo` para gerir propostas enviadas aos vendedores com versionamento.
  - Nova tabela `veiculos_fotos_selecao` para marcar fotos da vistoria que serão usadas no anúncio.
  - Nova tabela `vistorias_pendencias` para gerir solicitações de revisão aos vistoriadores.
- **Backend (Server Functions)**:
  - `getFilaAnalisePosVistoriaFn`: Listar vistorias aguardando análise.
  - `getDetalheAnaliseVistoriaFn`: Dados completos (checklist, fotos, comparativo) para o admin.
  - `enviarPropostaVendedorFn`: Enviar condições comerciais ao vendedor.
  - `responderPropostaVendedorFn`: Aceite ou recusa do vendedor no portal.
- **Frontend Admin**:
  - Nova aba "Aguardando análise" em `/admin/vistorias`.
  - Nova rota `/admin/analise-vistoria/$id` com abas: Resumo, Checklist, Fotos (seleção para anúncio), Comparativo, Valores, Decisão e Histórico.
  - Fluxo de solicitação de pendência para o vistoriador.
- **Frontend Vendedor**:
  - Nova tela de proposta no Portal do Vendedor (`/vendedor/veiculo/$id/proposta`) para aceite ou recusa das condições comerciais.
  - Atualização da jornada do veículo no detalhe do vendedor.

## Passos de Implementação

1. **Backend Infrastructure**:
   - Criar `src/db/analise-pos-vistoria.server.ts` com o schema e lógica de BD.
   - Criar `src/lib/analise-pos-vistoria.functions.ts` com as Server Functions.

2. **Admin UI - Fila de Análise**:
   - Atualizar `src/routes/admin/vistorias.tsx` para incluir a aba "Aguardando análise".

3. **Admin UI - Detalhe da Análise**:
   - Criar `src/routes/admin/analise-vistoria.$id.tsx` com a interface densa de análise pós-vistoria.
   - Implementar comparativo Lado a Lado (Vendedor vs Vistoria).
   - Implementar seleção de fotos para o anúncio.
   - Implementar calculadora de comissão e valor líquido.

4. **Portal do Vendedor**:
   - Criar `src/routes/vendedor.veiculo.$id.proposta.tsx` para o fluxo de aceite do vendedor.
   - Atualizar o componente de Timeline/Jornada no Portal do Vendedor.

5. **Notificações e Status**:
   - Implementar a transição de status de acordo com as ações de admin e vendedor.
   - Adicionar indicadores ao dashboard administrativo.
