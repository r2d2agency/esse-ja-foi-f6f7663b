# Corrigir checklist e concluir o app do vistoriador

## Objetivo
Fazer as categorias e itens do checklist persistirem e aparecerem no admin e na execução da vistoria, além de substituir as telas “Em desenvolvimento” por uma operação mobile-first para o vistoriador.

## Implementação
1. **Checklist confiável**
   - Corrigir a inicialização das tabelas para não ocultar erros de criação/índices.
   - Garantir o cadastro idempotente das categorias e itens padrão.
   - Fazer criação/edição/exclusão retornarem erro real e atualizar a lista imediatamente, preservando categorias manuais.
   - Usar a mesma fonte de dados no admin e no checklist executado pelo vistoriador.

2. **Painel do vistoriador**
   - Carregar as vistorias vinculadas ao usuário autenticado.
   - Exibir resumo do dia e do mês: agendadas hoje, concluídas hoje e realizadas no mês.
   - Mostrar próximo atendimento com veículo, horário, unidade e endereço completo.

3. **Agenda e histórico**
   - Criar agenda com filtros por período e status, ordenada por data/hora.
   - Criar histórico das vistorias realizadas com filtros por período, status, placa, marca ou modelo.
   - Incluir estados de carregamento, vazio e erro com nova tentativa.

4. **GPS e perfil**
   - Solicitar e validar geolocalização no navegador, mostrando status ativo, precisão e horário da última checagem.
   - Exigir GPS válido antes do check-in e registrar latitude/longitude no laudo.
   - Mostrar dados do vistoriador e da unidade vinculada.
   - Permitir troca de senha com validação da senha atual.

5. **Validação**
   - Verificar tipagem e build.
   - Testar no navegador os fluxos públicos disponíveis e a responsividade mobile/desktop.

## Detalhes técnicos
- Manter React/TanStack Start, PostgreSQL customizado e funções de servidor existentes; sem Lovable Cloud para dados.
- Usar `America/Sao_Paulo` nas consultas de data e métricas.
- Não criar dados falsos: telas vazias devem refletir a agenda real do banco.
- Nenhuma mudança nos módulos de leilão, vendedor ou comprador.
