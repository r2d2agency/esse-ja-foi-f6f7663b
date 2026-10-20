# Plano de Estabilização e Melhorias do Admin

O objetivo deste plano é garantir que as funcionalidades administrativas do sistema "ESSE JÁ FOI" estejam operacionais, seguras e com logs detalhados para diagnóstico, resolvendo os problemas de permissão encontrados no banco de dados.

## 1. Estabilização do Banco de Dados (Concluído)
- [x] Aplicar `GRANT` em todas as tabelas públicas para os perfis `authenticated` e `service_role`.
- [x] Garantir que o enum `app_role` e a tabela `profiles` possuam todas as colunas necessárias (`documento_*`, `cadastro_completo`).
- [x] Criar a tabela `configuracoes_sistema` para armazenar chaves de API e configurações de SMTP.

## 2. Refatoração do Módulo Admin
- [ ] **Configurações do Sistema**: Implementar a leitura e escrita real das chaves de SMTP e OpenAI no banco de dados, removendo dependências exclusivas de variáveis de ambiente para estas configurações dinâmicas.
- [ ] **Gestão de Usuários**: Corrigir a listagem de vendedores e compradores para aprovação, garantindo que o filtro de status funcione corretamente.
- [ ] **Logs Detalhados**: Melhorar a captura de erros em `cadastrarVendedorFn` e outras funções críticas, registrando o stack trace completo e o contexto do erro no banco de dados para visualização na tela `/admin/logs`.

## 3. Melhorias na Experiência do Desenvolvedor (Admin)
- [ ] Implementar uma verificação de saúde (health check) na tela inicial do admin que mostre quais tabelas estão faltando ou se há problemas de permissão (`GRANT`).
- [ ] Adicionar um botão de "Limpar Logs" e filtros por nível de severidade (INFO, ERRO).

## Detalhes Técnicos

### Logs do Sistema
Utilizaremos a tabela `logs` já existente, mas padronizaremos o campo `detalhe` como um JSON robusto:
```json
{
  "mensagem": "Erro ao inserir perfil",
  "codigo": "23505",
  "stack": "...",
  "payload": { ... }
}
```

### Configurações
As chaves serão criptografadas no banco de dados (opcional para o MVP, prioridade é persistência).
Tabelas afetadas: `configuracoes_sistema`.
