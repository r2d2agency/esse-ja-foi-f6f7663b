# Plano de Implementação: App do Vistoriador - Esse Já Foi

Este plano detalha a criação do módulo **App do Vistoriador**, focado em uma experiência mobile-first para a execução de vistorias técnicas em campo.

## 1. Infraestrutura de Banco de Dados
*   Atualizar o schema de vistorias em `src/db/vistorias.server.ts` para incluir:
    *   Tabela `laudos`: Cabeçalho do laudo vinculado à vistoria.
    *   Tabela `laudo_checklist`: Itens preenchidos (conforme, observação, fotos).
    *   Tabela `laudo_fotos`: Armazenamento das fotos obrigatórias e de avarias.
    *   Garantir idempotência na criação das tabelas.

## 2. Lógica de Negócio (Server Functions)
*   Criar `src/lib/vistoriador.functions.ts` com as seguintes funções:
    *   `getVistoriasHojeFn`: Vistorias do dia para o vistoriador logado.
    *   `getVistoriaDetalheFn`: Dados do veículo e vendedor para a vistoria.
    *   `iniciarCheckinFn`: Validação de placa e registro de geolocalização.
    *   `salvarEtapaChecklistFn`: Salvamento incremental de cada etapa (1 a 10).
    *   `uploadFotoVistoriaFn`: Handler para upload de fotos (em base64 ou multipart).
    *   `concluirVistoriaFn`: Validação final e mudança de status para `CONCLUIDA`.

## 3. Interface Mobile-First (Novas Rotas)
*   `src/routes/vistoriador.tsx`: Layout base com navegação inferior (Hoje, Agenda, Histórico, Perfil).
*   `src/routes/vistoriador.index.tsx`: Home "Vistorias de Hoje" com cards e ordenação.
*   `src/routes/vistoriador.agenda.tsx`: Calendário diário simples.
*   `src/routes/vistoriador.perfil.tsx`: Dados do usuário e logout.
*   `src/routes/vistoriador.vistoria.$id.tsx`: Detalhe da vistoria com botão "Iniciar Check-in".
*   `src/routes/vistoriador.execucao.$id.tsx`: Wizard de 10 etapas para a vistoria:
    1.  Identificação (Placa/KM)
    2.  Estrutura
    3.  Exterior
    4.  Interior
    5.  Mecânica básica
    6.  Pneus e rodas
    7.  Equipamentos
    8.  Documentos
    9.  Fotos do anúncio (Guia visual)
    10. Revisão final e Conclusão

## 4. Componentes Específicos do Vistoriador
*   `CardVistoriaVistoriador.tsx`: Card otimizado para mobile com status e horários.
*   `CameraCapture.tsx`: Componente para captura direta e preview de fotos.
*   `ChecklistItem.tsx`: Input com opções Conforme/Observação/Não conforme.
*   `ProgressBar.tsx`: Indicador de progresso das 10 etapas.

## 5. Integração e Segurança
*   Atualizar `src/routes/login.tsx` para redirecionar usuários com role `vistoriador` para `/vistoriador`.
*   Implementar guards de rota para garantir que o vistoriador acesse apenas suas vistorias atribuídas.
*   Adicionar tratamento para salvamento local (localStorage) em caso de conexão instável.

## Detalhes Técnicos
*   **Mobile First**: Uso extensivo de Tailwind para garantir usabilidade em telas pequenas.
*   **Geolocalização**: Uso da API `navigator.geolocation` no check-in.
*   **Performance**: Otimização de imagens no lado do cliente antes do upload.
