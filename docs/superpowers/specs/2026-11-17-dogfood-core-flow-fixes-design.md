# Correções do fluxo central de acompanhamento — design

## Intenção

Tornar executável, compreensível e verificável o fluxo central: criar a estrutura, registrar fatos de execução, visualizar tendência, formalizar um novo compromisso e aprová-lo.

## Regra de negócio

- Execução registra avanço, data/hora, ocorrência e justificativa factual. Não propõe datas.
- Planejamento cria e mantém a estrutura e propõe novo compromisso quando a tendência deixa o acordo vigente inviável.
- Aprovador aceita ou rejeita a proposta. Quem propõe não aprova a própria proposta.
- Baseline permanece imutável; compromisso vigente é versionado; tendência é recalculada por fatos.
- Itens com filhos são resumos: cronograma e avanço vêm dos descendentes. O responsável do agrupador é de coordenação, não de execução.

## Abordagens consideradas

1. **Dar `manage_commitment` ao executor.** Menor mudança, mas viola a separação entre fato e acordo e reabre o problema já rejeitado pelo usuário.
2. **Manter aceite bilateral entre proponente e executor.** Preserva o modelo atual, mas não corresponde ao fluxo solicitado com um aprovador independente.
3. **Planejamento propõe e aprovador decide.** Escolhida. Preserva a separação de responsabilidades, cria alçada clara e corresponde ao roteiro de validação.

## Mudanças

1. Corrigir a escolha da medição mais recente quando duas atualizações têm a mesma data/hora efetiva, usando também o instante de gravação.
2. Exibir confirmação persistente da última medição, inclusive justificativa, ocorrência e horário.
3. Atualizar o limite de data/hora do formulário sem congelá-lo na abertura do painel e impedir confirmação falsa.
4. Conceder proposta de compromisso ao Planejamento e decisão ao Aprovador, com proponente e aprovador distintos.
5. Tornar o indicador de salvamento não bloqueante e desabilitar apenas a ação em processamento.
6. Normalizar colagens que tragam `\\n` literal quando não houver quebra real e apresentar a prévia antes de salvar.
7. Corrigir os textos com codificação quebrada no fluxo tocado.
8. Explicitar no painel que agrupadores resumem os filhos e retirar deles a edição de duração de execução.

## Não objetivos

- Reescrever o Gantt, o grafo ou o motor completo de tendência.
- Limpar automaticamente dados de teste existentes.
- Alterar baseline histórica.
- Criar novos perfis ou um motor genérico de workflow.

## Critérios de aceite

- Duas medições no mesmo minuto mostram a segunda como última medição.
- A resposta de sucesso só aparece após a projeção refletir o percentual enviado.
- A justificativa salva aparece no painel sem abrir outro submenu.
- Planejamento vê e envia “Propor novo compromisso”.
- Aprovador vê a pendência e consegue aprovar; executor não vê proposta de data.
- O overlay não impede fechar painel ou navegar.
- Colagem com quebras reais e com `\\n` literal produz a mesma hierarquia.
- O painel do agrupador informa que datas/duração são calculadas pelos filhos.

