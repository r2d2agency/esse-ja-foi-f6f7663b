# Plano de Implementação: Painel Administrativo "ESSE JÁ FOI"

Estrutura inicial do Painel Administrativo com Dashboard operacional completo, seguindo a identidade visual oficial (azul-marinho, branco, verde/teal).

## Mudanças do Usuário

### Interface (Frontend)

- **Layout Administrativo**: Criação de um novo componente `AdminLayout` exclusivo para o ambiente administrativo, separado do `BackofficeLayout` atual.
  - Menu lateral fixo com todos os módulos solicitados.
  - Cabeçalho com busca global, notificações e menu de usuário.
- **Dashboard Operacional**: Desenvolvimento da rota `/admin/index.tsx` (substituindo o conteúdo atual) com:
  - Indicadores compactos e clicáveis.
  - Funil Operacional visual (Fluxo da operação).
  - Seções "Precisa da sua atenção" e "Minha fila".
  - Timeline de "Atividade recente".
- **Busca Global**: Interface preparada para agrupar resultados por Vendedores, Veículos e Contratos.
- **Central de Notificações**: Menu dropdown no cabeçalho com ações de leitura.

### Backend (Server Functions / DB)

- **Novas Consultas**: Implementação de funções no servidor para buscar dados reais do dashboard:
  - Contagem de vendedores por status (pendente/aprovado).
  - Veículos por etapa do funil.
  - Logs de atividades recentes.
  - Fila de atendimento baseada no usuário logado.

## Detalhes Técnicos

- **Caminhos de Arquivo**:
  - `src/components/layout/AdminLayout.tsx`: Novo layout administrativo.
  - `src/routes/admin.tsx`: Atualizado para usar o `AdminLayout`.
  - `src/routes/admin/index.tsx`: Reconstruído com o novo Dashboard.
  - `src/lib/admin-dashboard.functions.ts`: Funções de servidor para o novo dashboard.
  - `src/db/admin-dashboard.server.ts`: Queries SQL otimizadas para o funil e indicadores.
- **Identidade Visual**: Uso de cores semânticas via Tailwind/shadcn (ex: `bg-slate-950` para o azul-marinho, `text-teal-600` para ações).
- **Desktop First**: Layout otimizado para resoluções de notebook/desktop com menu recolhível.

## Próximos Passos

1. Criar o `AdminLayout` com o menu lateral e cabeçalho.
2. Implementar as funções de backend para alimentar o Dashboard.
3. Reconstruir a página inicial do Admin com o Dashboard operacional.
4. Validar o redirecionamento e permissões de acesso.
