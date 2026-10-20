# Plano de Implementação: Módulo de Leilão e Lances - Esse Já Foi

Este plano detalha a implementação do sistema de leilão competitivo, permitindo que compradores aprovados deem lances em tempo real nos veículos publicados.

## 1. Banco de Dados e Backend (Drizzle/PostgreSQL)

- **Novas Tabelas e Índices**:
  - `leiloes`: Configuração do leilão (datas, valores, incremento, prorrogação, status).
  - `lances`: Registro de cada oferta (comprador, valor, timestamp, metadados de auditoria).
  - Índices compostos para garantir performance em consultas de tempo real.
- **Lógica Transacional de Lances**:
  - Uso de transações SQL com `FOR UPDATE` para evitar condições de corrida (lances simultâneos).
  - Validação rigorosa: status do leilão, status do comprador (aprovado/ativo), valor mínimo (lance atual + incremento).
- **Mecanismo de Prorrogação (Anti-sniping)**:
  - Implementação automática: se houver lance nos últimos X minutos, o encerramento é postergado por Y minutos.
- **Processamento de Ciclo**:
  - Função para transição automática de status baseada no horário (Agendado -> Ativo -> Encerrado).

## 2. API e Funções de Servidor (TanStack Start)

- `initLeilaoModule`: Garante a existência do esquema.
- `getLeilaoInfo`: Retorna o estado atualizado do leilão e histórico simplificado.
- `darLanceFn`: Processa e valida a nova oferta do comprador.
- `salvarConfiguracaoLeilao`: Permite ao admin definir as regras do leilão.
- `getLeiloesAdmin`: Listagem gerencial para o backoffice.

## 3. Interface Administrativa (Dashboard Navy/Teal)

- **Listagem de Leilões**: Nova tela `/admin/leiloes` com filtros por status (Ativos, Agendados, Encerrados).
- **Acompanhamento ao Vivo**: Tela de monitoramento em tempo real com cronômetro e histórico de lances detalhado (identificando compradores).
- **Configuração no Veículo**: Integração na aba "Valores" do detalhe do veículo para ativar e configurar o leilão.

## 4. Experiência do Comprador (Portal e Vitrine)

- **Vitrine e Detalhe**:
  - Exibição de valores comerciais (Lance Atual, Tempo Restante) apenas para compradores autenticados e aprovados.
  - Bloqueio visual e redirect para compradores não aprovados.
- **Sala de Lances**:
  - Cronômetro regressivo dinâmico.
  - Botões de lance rápido (baseados no incremento mínimo).
  - Histórico de lances anônimo (ex: Comprador 8**2).
  - Feedbacks visuais de status: "Você está na frente", "Seu lance foi superado".
- **Confirmação e Idempotência**: Modal de confirmação antes do lance e prevenção de duplo clique.

## 5. Notificações e Auditoria

- Registro de todos os eventos críticos na timeline do veículo e logs do sistema.
- Notificações internas para lances superados e encerramento iminente.

## Detalhes Técnicos

- **Framework**: React 19 + TanStack Start v1.
- **Estilização**: Tailwind CSS v4 + shadcn/ui.
- **Realtime**: Preparado para integração com WebSockets ou Polling otimizado conforme a infraestrutura disponível.
- **Segurança**: Validação de todas as regras críticas no servidor, nunca confiando apenas no estado do frontend.
