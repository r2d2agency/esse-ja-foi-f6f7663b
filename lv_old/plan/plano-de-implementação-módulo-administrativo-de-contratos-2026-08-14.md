# Plano de Implementação: Módulo Administrativo de Contratos

Implementação do módulo completo de gestão de contratos para a plataforma "Esse Já Foi", focado na geração dinâmica, acompanhamento de status e integração com o portal do vendedor.

## 1. Banco de Dados e Lógica de Servidor
- **Tabelas Adicionais**: Garantir que `contratos`, `contrato_modelos`, `contrato_eventos` e `contrato_notificacoes` estejam totalmente funcionais no `src/db/contratos.server.ts`.
- **Lógica de Avanço**: Implementar campo/helper `elegivel_para_avancar` que verifica `Compliance: Aprovado` + `Contrato: Assinado`.
- **Configurações**: Adicionar campos SMTP e OpenAI se ainda não estiverem persistindo corretamente.

## 2. Interface Administrativa (Backoffice)
- **Menu Contratos**: Ativar o item no `AdminLayout.tsx` e implementar a listagem em `src/routes/admin/contratos.tsx`.
- **Filtros e Busca**: Adicionar busca por vendedor/CPF/contrato e filtros por status padronizados (Não gerado, Gerado, Enviado, etc.).
- **Detalhamento do Contrato**: Refinar `src/routes/admin/contrato.$id.tsx` com visualizador completo (zoom, impressão), timeline de eventos e ações de envio/cancelamento.
- **Ficha do Vendedor**: Integrar `AbaContratoVendedor.tsx` na rota `/admin/vendedor/$id`, respeitando a regra de que só libera geração após Compliance Aprovado.

## 3. Portal do Vendedor
- **Dashboard**: Atualizar `CardContratoVendedor.tsx` para mostrar notificações de contrato disponível ou expirado.
- **Visualização e Assinatura**: Refinar `src/routes/vendedor.contrato.tsx` para o fluxo de assinatura manual (simulando integração futura) ou recusa com comentário.

## 4. Integração e Notificações
- **Eventos**: Registrar todas as ações (gerado, enviado, visualizado, assinado, recusado, cancelado) no histórico do contrato e do vendedor.
- **Indicadores**: Atualizar o dashboard administrativo para refletir "Contratos Pendentes" (gerados/enviados e não assinados).

## Detalhes Técnicos
- **Padronização de Status**: `NAO_GERADO`, `GERADO`, `ENVIADO`, `VISUALIZADO`, `ASSINADO`, `RECUSADO`, `EXPIRADO`, `CANCELADO`.
- **Identificadores**: Formato `CTR-XXXXXX` usando sequence de banco.
- **Tags Dinâmicas**: Replicação de dados do vendedor no conteúdo do contrato via `replaceAll` no servidor.
