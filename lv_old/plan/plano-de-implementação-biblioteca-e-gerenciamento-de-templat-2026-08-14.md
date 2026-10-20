# Plano de Implementação: Biblioteca e Gerenciamento de Templates WhatsApp Meta

Este plano detalha a implementação da interface administrativa para gerenciamento de templates do WhatsApp, incluindo a listagem, sincronização e o wizard de criação integrado à Meta Cloud API.

## 1. Interface de Templates (`src/routes/admin/comunicacoes.tsx`)

Implementar o conteúdo da aba "Templates" com as seguintes sub-seções:
- **Meus Templates**: Lista de templates sincronizados da Meta com status em tempo real (Aprovado, Pendente, Rejeitado).
- **Biblioteca "Esse Já Foi"**: Modelos pré-definidos prontos para uso (Boas-vindas, Novo Veículo, Lance Superado, Pagamento Pendente).
- **Wizard de Criação**: Processo em 7 etapas para criar e enviar novos templates para aprovação da Meta.

## 2. Wizard de Criação (7 Etapas)

1.  **Tipo e Nome**: Categoria (Marketing, Utilitário) e nome técnico (letras minúsculas e underscores).
2.  **Estrutura Base**: Escolha de componentes (Header, Body, Footer, Botões).
3.  **Cabeçalho (Header)**: Opcional. Suporte a Texto (com 1 variável) ou Mídia (Imagem/Vídeo/Documento).
4.  **Corpo (Body)**: Texto principal com suporte a múltiplas variáveis `{{1}}`, `{{2}}`, etc.
5.  **Rodapé (Footer)**: Texto curto em cinza (opcional).
6.  **Botões**: Call-to-Action (URL, Telefone) ou Quick Reply.
7.  **Revisão e Amostras**: Preenchimento de exemplos para as variáveis (obrigatório para a Meta) e submissão final.

## 3. Integração e Sincronização

- Botão de **Sincronizar Agora** para buscar atualizações de status diretamente da Meta.
- Validação em tempo real do nome e conteúdo do template conforme regras da Meta.
- Armazenamento no banco de dados local (`whatsapp_templates`) após criação bem-sucedida na Meta.

## Detalhes Técnicos

- **Componentes**: Uso de `Dialog` para o wizard, `Card` para a listagem e `Badge` para status.
- **Estado**: Gerenciamento do formulário complexo do wizard com `useState`.
- **Backend**: Chamadas para `sincronizarTemplatesFn` e `criarTemplateMetaFn` (já implementadas).
- **UX**: Visualização em tempo real (preview) do template simulando a tela do celular.
