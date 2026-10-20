# Plano de Implementação: Fluxo de Vendedor Autenticado e Gestão de Veículos

O objetivo é permitir que vendedores se cadastrem, façam login e gerenciem seus próprios veículos, enquanto a operação mantém o controle de aprovação e agendamento de vistorias.

## Mudanças Propostas

### Backend (Database & Server Functions)
- **Tabela de Veículos**: Adicionar coluna `perfil_id` (UUID) para vincular o veículo ao vendedor que o cadastrou.
- **Tabela de Perfis**: Garantir que vendedores possam se cadastrar com o papel `vendedor` (adicionar se necessário ao enum).
- **Server Functions**:
    - `cadastrarVendedorFn`: Criar perfil de vendedor com senha.
    - `listarMeusVeiculosFn`: Listar veículos vinculados ao `auth.uid()`.
    - `cadastrarMeuVeiculoFn`: Permitir que o vendedor cadastre um veículo (status inicial: `AGUARDANDO_APROVACAO`).
    - `aprovarVeiculoFn`: Função para a operação mover de `AGUARDANDO_APROVACAO` para `CADASTRADO` (disponível para agendamento).

### Frontend (Rotas e Componentes)
- **Página de Venda (`/vender`)**:
    - Atualizar o Hero para oferecer "Cadastro/Login" antes de cadastrar o carro.
    - Transformar o formulário de lead em um Wizard de Cadastro de Usuário -> Cadastro de Veículo.
- **Área do Vendedor (`/vendedor`)**:
    - Dashboard simples com lista de veículos e seus status (Em aprovação, Agendado, Em Vistoria, etc.).
    - Botão "Cadastrar novo veículo".
- **Área de Operação (`/operacao/veiculos`)**:
    - Adicionar aba ou filtro para "Aprovação Pendente" (veículos recém-cadastrados por usuários).

## Detalhes Técnicos
- Adicionar `'vendedor'` ao `app_role` enum no banco de dados.
- Implementar política de RLS (ou filtro em server functions) para que vendedores vejam apenas seus registros.
- Manter o status `CADASTRADO` como o marco onde a operação assume o controle para agendamento.

## User Review Required
- O vendedor deve conseguir agendar a própria vistoria ou a operação entra em contato após a aprovação do cadastro do veículo? (Assumirei contato da operação por padrão).
- O cadastro de vendedor deve exigir documentos imediatos ou apenas dados básicos para o primeiro veículo? (Assumirei dados básicos + documentos no perfil).