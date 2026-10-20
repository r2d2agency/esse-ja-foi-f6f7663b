# Plano: Ajuste da Persistência e Documentos (Vendedor)

Ajustar o fluxo de documentos no portal do vendedor para garantir que o progresso seja salvo corretamente, permitindo que o usuário envie fotos (câmera ou arquivo) sem marcar como concluído prematuramente, e mantendo a persistência de rascunhos de veículos.

## Alterações

### 1. Banco de Dados (Database)
- Atualizar `src/db/cadastro.server.ts` para garantir que a tabela `veiculos` suporte o armazenamento de documentos específicos (como CRLV) e status de análise.

### 2. Funções de Servidor (Server Functions)
- **Vendedor Functions**:
    - Ajustar `cadastrarMeuVeiculoFn` para salvar os dados parciais (rascunho) e fotos do veículo conforme são enviadas.
    - Garantir que `atualizarDocumentosVendedorFn` salve documentos individuais sem exigir a conclusão imediata do cadastro.

### 3. Componentes e UI (Frontend)
- **FileUpload**:
    - Adicionar suporte a `capture="environment"` para facilitar o uso da câmera em dispositivos móveis.
- **Vendedor Onboarding (`vendedor.onboarding.tsx`)**:
    - Garantir que o botão "Continuar" salve o estado atual no servidor e permita avançar mesmo sem todos os documentos (a conclusão final validará tudo).
    - Melhorar a experiência de captura de documentos (CNH, Selfie, Comprovante).
- **Cadastro de Veículo (`vendedor.cadastrar.tsx`)**:
    - Reativar a persistência de rascunho (`localStorage`) de forma segura para não frustrar o usuário ao sair da tela.
    - Integrar o envio de fotos do veículo com salvamento imediato no rascunho do servidor/banco.

## Detalhes Técnicos
- Utilizar `drizzle-orm` para as atualizações de banco de dados idempotentes.
- Manter o padrão de `createServerFn` para as chamadas de API.
- Usar `toast` (sonner) para feedback visual de salvamento automático.
- Respeitar a regra de "Somente 100% concluído para análise" no passo final.
