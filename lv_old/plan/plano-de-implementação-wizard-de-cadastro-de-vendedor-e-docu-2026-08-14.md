# Plano de Implementação: Wizard de Cadastro de Vendedor e Documentação

O objetivo é transformar o cadastro de vendedor em um wizard completo que, após a criação da conta, guie o usuário para o cadastro do primeiro veículo e, por fim, para o envio de documentos (Habilitação, CRLV e Selfie), garantindo que ele tenha acesso imediato ao sistema com login e senha.

## Alterações de Infraestrutura (Backend)

1.  **Atualização do Banco de Dados (`src/db/auth.server.ts`):**
    *   Adicionar colunas na tabela `profiles` para armazenar as URLs dos documentos: `documento_cnh_url`, `documento_crlv_url`, `documento_selfie_url`.
    *   Adicionar coluna `cadastro_completo` (boolean) na tabela `profiles` para controlar o status do onboarding.

2.  **Novas Funções de Servidor (`src/lib/vendedor.functions.ts`):**
    *   `atualizarDocumentosVendedorFn`: Recebe as URLs/Base64 das fotos e salva no perfil do usuário.
    *   Atualizar `cadastrarVendedorFn` para retornar o token de acesso imediatamente após a criação, permitindo o login automático para continuar o wizard.

## Interface do Usuário (Frontend)

1.  **Novo Wizard de Onboarding (`src/routes/vendedor.onboarding.tsx`):**
    *   Criar uma rota protegida para gerenciar o fluxo pós-login inicial.
    *   **Etapa 1: Cadastro de Veículo:** Reutilizar/Integrar a lógica de `src/routes/vendedor.cadastrar.tsx`.
    *   **Etapa 2: Documentação (Mobile-first):** Interface intuitiva para capturar fotos:
        *   Frente e Verso da Habilitação (CNH).
        *   Documento do Veículo (CRLV).
        *   Selfie segurando o documento.
    *   Visualização clara de progresso ("Falta apenas 1 passo!").

2.  **Ajuste na Landing Page (`src/routes/index.tsx`):**
    *   Modificar o fluxo de cadastro para que, ao finalizar a Etapa 1 (Dados Pessoais), o usuário seja autenticado e redirecionado automaticamente para o `onboarding`.

3.  **Área do Vendedor (`src/routes/vendedor.tsx`):**
    *   Adicionar alerta/banner caso o cadastro de documentos não tenha sido finalizado.
    *   Bloquear funções específicas (como agendamento de vistoria) até a conclusão do envio dos documentos.

## Detalhes Técnicos
*   Utilizar `sonner` para feedback de progresso.
*   Garantir responsividade (versão Desktop e App/Mobile).
*   Simulação de upload de arquivos (armazenamento de URLs/Placeholders até integração real com bucket).

## Próximos Passos
1. Criar migração para colunas de documentos.
2. Implementar rota de onboarding.
3. Ajustar landing page para redirecionamento pós-cadastro.
