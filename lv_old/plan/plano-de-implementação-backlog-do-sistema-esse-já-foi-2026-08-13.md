# Plano de Implementação: Backlog do Sistema "ESSE JÁ FOI"

Este plano detalha a implementação das funcionalidades pendentes listadas na documentação: Módulo de Leilão/Lances, Gerador de PDF, Integração FIPE e Dashboard de BI.

## 1. Módulo de Lances e Leilão (Perfil Comprador)
Implementação do fluxo completo de arremate, desde a visualização do anúncio até o lance vencedor.

- **Backend**:
    - Criar `leiloes.functions.ts` e `leiloes.server.ts` para gerenciar o estado do leilão (Aberto, Pausado, Finalizado).
    - Lógica de validação de lances: o lance deve ser maior que o atual e o comprador deve estar com status `verificado`.
- **Frontend**:
    - Rota `/comprador/leiloes`: Grid de veículos ativos em leilão.
    - Rota `/comprador/leilao/$id`: Detalhes do veículo, cronômetro em tempo real e painel de lances.
    - Notificações via toast quando o usuário for superado no lance.

## 2. Gerador de PDF para Laudo Técnico
Transformar o laudo de vistoria preenchido pelo vistoriador em um documento oficial para o cliente.

- **Técnico**:
    - Utilizar uma biblioteca compatível com Edge (ou processamento via server function) para gerar o layout do laudo.
    - Incluir fotos, acessórios detectados, pontuação de depreciação e observações técnicas.
- **Frontend**:
    - Botão "Gerar PDF" na tela de visualização de laudos em `/operacao/laudos`.

## 3. Integração com API FIPE
Automatizar a atualização dos preços base para evitar cálculos manuais obsoletos.

- **Implementação**:
    - Criar um helper `fipe.server.ts` para consultar a API (ex: BrasilAPI ou similar).
    - Atualizar o formulário de veículos para sugerir o valor FIPE automaticamente ao preencher Marca/Modelo/Ano.
    - Atualizar o motor de depreciação para usar esse valor como `valor_base`.

## 4. Dashboard de BI (Metas vs Realizado)
Painel gerencial para acompanhamento de performance.

- **Componentes**:
    - Gráficos de funil: Leads -> Vistorias -> Leilões -> Vendas.
    - Indicadores Financeiros: Volume total transacionado vs Margem operacional.
    - Comparativo mensal de captação de veículos.
- **Localização**: `/admin/dashboard` e `/operacao/dashboard`.

## Detalhes Técnicos
- Persistência: PostgreSQL (Queries via Drizzle/Server Functions).
- Estilização: Tailwind CSS e componentes shadcn/ui.
- Ícones: Lucide React.
- Validação: Zod.
