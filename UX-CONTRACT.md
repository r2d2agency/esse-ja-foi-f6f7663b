# Consultas Company Conferi

Escopo: cadastro do veículo e testes nas configurações. Fonte de negócio: fluxo fornecido pelo usuário em 16/09/2026; documentação recebida da Company sobre primeira requisição, notificação GET, segunda requisição com código e atualizações posteriores. Aparência: [DESIGN.md](DESIGN.md).

| Capacidade          | Dono canônico                                  | Contrato                                                         | Verificação                    |
| ------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| Ações               | src/components/ui/button.tsx                   | Estado ocupado durante envio; rótulos por produto                | Revisão das telas              |
| Toast               | Sonner                                         | Informação para espera, sucesso para conclusão, erro para falha  | Revisão dos estados            |
| Consulta registrada | src/db/consulta-veicular.server.ts             | Cadastro e testes usam iniciarConsultaRegistrada                 | scripts/test-conferi-fluxo.mjs |
| Acompanhamento      | obterConsultaRegistradaFn / useConsultaConferi | Leitura do banco a cada 6 segundos, sem nova pesquisa na Company | scripts/test-conferi-fluxo.mjs |

Agregados preenche dados imediatos. FIPE aguarda processamento quando necessário e o webhook salva o valor atual na ficha. Gold conserva a resposta parcial e recebe atualizações pelo mesmo código. Um histórico FIPE indisponível não impede aproveitar o valor atual válido.

Testes registram produto, placa, parâmetros e protocolo sem criar um veículo fictício. Seu vínculo de veículo é nulo: recebem e exibem a resposta pelo mesmo webhook, sem alterar uma ficha por associação implícita de placa.

O banco é a fonte do estado PROCESSANDO/CONCLUIDA/ERRO. A Company é chamada no início e no webhook, reenviando os parâmetros salvos e o código. Leituras repetidas e cliques em uma pendência não criam nova pesquisa. A espera longa continua no servidor quando a página é fechada. Ao repetir o teste da mesma placa e produto, o resultado registrado é retomado.

Resultados parciais têm mensagem de espera e protocolo; erros mantêm texto de diagnóstico. Não exibir toast de conclusão durante processamento. Formatação é pt-BR, e mudanças de estado devem ser anunciadas por região de status. O retorno à página revalida os dados; erros de leitura não significam falha da consulta na Company.
