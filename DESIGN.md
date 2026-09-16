---
version: alpha
name: Esse Já Foi
description: Administração de veículos com estados claros de cadastro e consulta.
colors:
  navy: "#0c162c"
  turquoise: "#00b8a9"
  mist: "#f5f7fa"
typography:
  sans:
    fontFamily: "Inter, sans-serif"
omitted:
  - section: spacing
    reason: Mantida nas utilidades Tailwind dos componentes existentes.
  - section: rounded
    reason: Fonte canônica em src/styles.css e componentes ui.
  - section: components
    reason: Fonte canônica em src/components/ui.
---

# Esse Já Foi

## Overview

Registro inicial baseado no código existente, sem redesign. O admin atende a operação de cadastro e análise de veículos no Brasil, com texto em português e valores em reais. A referência é a ficha operacional do veículo: informações agrupadas por tarefa, estados visíveis e ações curtas. Evitar linguagem promocional nas ferramentas de trabalho.

Os tokens de execução em `src/styles.css` são canônicos. Este documento espelha as cores nomeadas e a tipografia; `@theme inline` faz a ponte para Tailwind. Não há geração independente de tokens.

## Colors

Azul navy estrutura a identidade; turquoise destaca ações. Os fluxos existentes de consulta usam teal para sucesso, amber para espera e vermelho para falha, sempre acompanhados de texto. As superfícies do admin permanecem claras, com bordas slate. Não introduzir nova paleta para consultas.

## Typography

Inter para corpo, títulos e controles, conforme `src/styles.css`. Preservar o tamanho de texto existente e permitir quebra de mensagens e protocolos. Valores monetários seguem pt-BR.

## Layout

Preservar as seções e guias existentes. FIPE pertence à guia Valores; laudos pertencem à consulta veicular; configurações mantêm os testes por produto. Resultados aparecem junto à ação que os iniciou, com atualização sem mover os controles.

## Elevation & Depth

Manter bordas e superfícies dos cartões existentes. Estados assíncronos não criam camadas ou modais adicionais.

## Shapes

Reutilizar Button e demais primitivas de `src/components/ui`; preservar os cartões arredondados das telas de cadastro.

## Components

Sonner é o sistema de toast existente; a mensagem persistente do resultado complementa o toast. React Query acompanha dados do servidor. Ícones Lucide acompanham rótulos textuais. Espera por uma base externa usa mensagem informativa, não sucesso nem erro. Acompanhar o resultado não inicia outra pesquisa.

## Do's and Don'ts

- Manter Agregados, FIPE e Gold identificados por produto.
- Exibir protocolo e estado nos testes assíncronos.
- Não apresentar resposta parcial como concluída.
- Não redesenhar o admin para corrigir a integração.
