# Plano de Implementação: App do Vistoriador (Telas 5-8)

Continuar o desenvolvimento do fluxo de preenchimento do laudo no app mobile-first do vistoriador, focando no checklist organizado, catálogo de acessórios, roteiro de fotos guiado, resumo de pendências e tela de sucesso.

## O que será feito

### 1. Checklist e Acessórios (Telas 5 e 5B)
- Refatorar a interface de `src/routes/vistoria/laudo.$laudoId.tsx` para usar um sistema de abas por categoria.
- Implementar barra de progresso por categoria.
- Melhorar a seleção de avarias com obrigatoriedade de foto e descrição ao marcar "AVARIA".
- Melhorar a listagem de acessórios com estados (Funcionando/Defeito) e integração com o catálogo.

### 2. Fotos e Avarias (Tela 6)
- Criar um roteiro guiado de fotos obrigatórias (Frente, Traseira, Laterais, Interior, etc.).
- Implementar compressão de imagem no cliente (máx 1600px, 80% qualidade) antes do upload.
- Adicionar moldura de enquadramento sugerido na interface de captura.

### 3. Resumo e Envio (Telas 7 e 8)
- Criar tela de resumo com validação em tempo real de itens faltantes.
- Transformar pendências em links diretos para os campos não preenchidos.
- Implementar diálogo de confirmação final.
- Criar tela de sucesso com número de protocolo e link para voltar à agenda.

## Detalhes Técnicos

### Componentes Novos
- `src/components/vistoria/ImageCompressor.ts`: Utilitário de compressão.
- `src/components/vistoria/RoteiroFotos.tsx`: Gerenciador do fluxo de fotos.
- `src/components/vistoria/ProgressBar.tsx`: Indicador visual de conclusão por aba.

### Fluxo de Dados
- **Autosave**: Utilizar o hook `useSalvamento` já existente para garantir que nenhuma resposta seja perdida em caso de instabilidade de rede.
- **Validação**: Centralizar a lógica de `pendenciasLaudoFn` para habilitar o botão de envio.

### UI/UX
- Mobile-first: Botões grandes, feedbacks táteis, navegação fluida entre abas.
- Cores: Teal-900 para ações primárias, Amber para estados de atenção/pendências.
