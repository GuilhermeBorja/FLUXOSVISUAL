## Problem Statement

Na interface atual, algumas ações de negócio estão ausentes, difíceis de localizar ou não correspondem às permissões aceitas pelo sistema. Isso impede configurar permissões de forma confiável, aceitar compromissos individuais e macro, registrar o avanço real e acessar as funções de calendário já existentes. A arquitetura também acopla a lógica de domínio à compilação de artefatos do navegador, dificultando a evolução dessas funcionalidades.

## Solution

Alinhar o catálogo de permissões entre interface e backend; completar os fluxos de aceite e histórico dos compromissos; tornar o registro de avanço e as funções de calendário acessíveis pela interface; e desacoplar a lógica de domínio dos bundles do navegador sem alterar o comportamento existente.

## User Stories

1. Como administrador, quero configurar operações que o backend realmente reconhece, para que as permissões exibidas e salvas na interface tenham efeito consistente.
2. Como responsável por uma atividade, quero aceitar o compromisso individual associado a ela, para confirmar as datas pelas quais respondo.
3. Como responsável que propôs o próprio compromisso, quero poder aceitá-lo, para concluir o fluxo quando sou também quem executará a atividade.
4. Como usuário, quero que a troca do responsável encerre o compromisso vigente e preserve seu histórico, para não manter um aceite ligado à pessoa errada.
5. Como novo responsável, quero aceitar um novo compromisso após assumir uma atividade, para confirmar meu próprio prazo.
6. Como Aprovador, quero aceitar o compromisso macro do projeto, para confirmar o compromisso geral.
7. Como pessoa autorizada a registrar medições, quero preencher e salvar o avanço real de uma atividade executável, para atualizar o progresso pelo sistema.
8. Como usuário, quero entender por que o campo de avanço não está disponível, para distinguir falta de permissão de restrições do item.
9. Como usuário, quero acessar as funções de calendário existentes pela interface, para consultar ou configurar os calendários disponíveis.
10. Como desenvolvedor, quero evoluir a lógica de domínio sem depender da leitura ou compilação de código do bundle do navegador, para reduzir acoplamento e facilitar mudanças futuras.

## Implementation Decisions

- A pessoa responsável aceita compromissos de atividades individuais.
- Se a pessoa responsável também propôs o compromisso, ela pode aceitar o próprio compromisso.
- O Aprovador aceita o compromisso macro do projeto.
- Ao mudar o responsável, o compromisso vigente é encerrado e preservado no histórico; o novo responsável precisa aceitar um novo compromisso.
- O item raiz do tipo Projeto representa o nível macro. Atividades executáveis são o nível individual; grupos com filhos funcionam como resumos sem compromisso individual próprio.
- A interface de permissões deve refletir as operações e escopos aceitos pelo backend.
- O formulário de avanço deve respeitar permissão e hierarquia do item e explicar sua indisponibilidade.
- O calendário deve expor as funções que já têm suporte no backend. Este escopo não presume uma agenda visual mensal ou semanal.
- A separação entre domínio e bundle do navegador deve preservar o comportamento existente.

## Testing Decisions

- Validar comportamentos pela interface e pelos resultados persistidos, não por detalhes internos de implementação.
- Cobrir configuração de permissões e sua aplicação nas ações visíveis e nas operações aceitas pelo sistema.
- Cobrir aceite individual, autoaceite quando a pessoa também é responsável, aceite macro pelo Aprovador e mudança de responsável com histórico.
- Cobrir registro de avanço permitido e mensagens para casos em que o registro não está disponível.
- Cobrir as funções de calendário expostas e a preservação do comportamento da aplicação após o desacoplamento arquitetural.

## Out of Scope

- Alterar ou implantar o sistema de produção nesta etapa.
- Criar uma agenda mensal ou semanal sem decisão específica de escopo.
- Acrescentar operações de calendário que não tenham suporte no backend.

## Further Notes

- A ausência do campo de avanço na tela reportada ainda precisa ser reproduzida para identificar se a causa é permissão, hierarquia ou outra condição.
- Os tickets detalhados e suas dependências estão na pasta `issues/` desta iniciativa.
