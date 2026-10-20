# Plano de Ação - Módulo de Análise Pós-Vistoria e Aprovação de Valor

Este plano detalha a implementação do módulo de análise pós-vistoria, onde o administrador define o valor de oferta do veículo com base no laudo do vistoriador e o vendedor aprova ou recusa a proposta.

## Alterações Fiscais e Banco de Dados

- **Novos Campos em `veiculos`**:
  - `valor_fipe_atual`: Valor de referência FIPE no momento da análise.
  - `valor_oferta_essejafoi`: Valor final proposto pela plataforma.
  - `margem_seguranca_percentual`: Margem aplicada sobre a FIPE (ex: 15-20%).
  - `data_proposta`: Data em que a proposta foi enviada ao vendedor.
  - `data_validade_proposta`: Prazo para aceite (ex: 48h).
  - `status_proposta`: `PENDENTE`, `ACEITA`, `RECUSADA`, `EXPIRADA`.
  - `motivo_recusa_proposta`: Texto livre se o vendedor recusar.

- **Tabela `veiculos_depreciacao_detalhe`**:
  - Para registrar cada item de depreciação aplicado (Ex: Pneus -R$ 500, Funilaria -R$ 1.200).

## Backend (Server Functions)

- **`getAnalisePosVistoriaFn`**: Recupera o laudo completo + dados do veículo para o admin.
- **`salvarPropostaValorFn`**:
  - Calcula o valor final baseado em: FIPE - Depreciações (Matriz) - Margem.
  - Atualiza o status do veículo para `AGUARDANDO_APROVACAO_VENDEDOR`.
  - Dispara notificação WhatsApp/E-mail para o vendedor.
- **`responderPropostaVendedorFn`**: Permite ao vendedor aceitar ou recusar (se recusar, volta para análise admin ou encerra).

## Frontend - Painel Administrativo (`/admin/veiculo/$id/pos-vistoria`)

- **Interface de Precificação**:
  - Visualização resumida do laudo técnico (pontos críticos).
  - Calculadora de Depreciação: Lista de itens do checklist que geram desconto.
  - Campo para entrada manual do valor FIPE atualizado.
  - Ajuste fino da margem comercial.
  - Botão "Enviar Proposta ao Vendedor".

## Frontend - Portal do Vendedor (`/vendedor/veiculo/$id/proposta`)

- **Tela de Decisão**:
  - Apresentação do valor de oferta.
  - Justificativa básica (resumo do laudo).
  - Botões "Aceitar Proposta" e "Recusar Proposta".
  - Se Aceitar: Transição para `PRONTO_PARA_ANUNCIO`.

## Detalhes Técnicos

- **Matriz de Depreciação**: Implementar lógica que lê o checklist (ex: se `pneus === 'ruim'`, aplica valor X de desconto configurado).
- **Notificações**: Integrar com `processarEventoSistema` para o evento `PROPOSTA_GERADA`.
- **Status de Veículo**: Adicionar `AGUARDANDO_APROVACAO_VENDEDOR` e `PROPOSTA_RECUSADA` à máquina de estados.
