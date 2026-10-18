# FLUXO VISUAL — PRD 3
## Consolidação dos PRDs iniciais, auditoria funcional e revisão de UX

- **Versão:** 3.0
- **Branch de trabalho:** `PRD3`
- **Branch-base:** `feature/prd-evolution`
- **Status:** Especificação para implementação incremental e validação
- **Escopo desta rodada:** funcionalidades locais, regras de negócio, interações e interface existentes
- **Fora do escopo:** backend, banco de dados, autenticação remota, sincronização multiusuário, armazenamento remoto e cobrança

---

## 1. Objetivo e regras de execução

Este PRD cruza os dois documentos iniciais — **PRD FLUXOSVISUAL v1.1** e **PRD FLUXOSVISUAL 2** — com as solicitações mais recentes e o código existente na branch-base.

O objetivo não é reconstruir a aplicação. É corrigir comportamentos defeituosos, concluir recursos parcialmente implementados, recuperar requisitos ainda ausentes e melhorar a experiência de uso sem descaracterizar o produto.

### 1.1 Regras invioláveis

1. Preservar o núcleo baseado em itens e relações, sem impor hierarquia rígida aos dados.
2. Distinguir identidade, tipo, hierarquia de exibição, relações, dependências temporais, agrupamento e contexto organizacional.
3. Preservar IDs, relações, atributos, histórico e dados locais existentes.
4. Não alterar regras de negócio como efeito colateral de ajustes visuais.
5. Não remover nem simplificar uma feature aprovada sem informar o usuário e apresentar alternativa para decisão.
6. Não declarar uma feature concluída pela mera presença de botão ou código.
7. Toda correção deverá ter critério de aceite e teste de regressão proporcional ao risco.
8. Quando o requisito original conflitar com a implementação, prevalece o requisito aprovado; se houver ambiguidade, registrar e pedir decisão antes de alterar a regra.
9. Preservar a identidade visual atual, melhorando alinhamento, responsividade e legibilidade.
10. Toda alteração deverá ser feita e validada na branch `PRD3`, sem modificar diretamente a branch-base.

### 1.2 Ordem de prevalência

1. Integridade dos dados e núcleo do produto.
2. Regras de negócio explícitas dos dois PRDs.
3. Comportamento funcional esperado.
4. Consistência entre as visões.
5. Acessibilidade, legibilidade e responsividade.
6. Preferências de implementação.

### 1.3 Controle obrigatório de requisitos

Cada requisito deve ter: ID, fonte, estado atual, comportamento esperado, arquivos afetados, risco, critério de aceite, testes executados, evidência e decisão final.

Estados permitidos: **Conforme**, **Parcial**, **Defeituoso**, **Ausente**, **Não verificável**, **Adiado com aprovação**.

Nenhuma feature poderá desaparecer do escopo silenciosamente. Se uma implementação não for viável, o agente deve explicar a limitação, sugerir uma alternativa concreta e aguardar aprovação antes de substituir o requisito.

---

## 2. Escopo e exclusões

### Dentro do escopo

- Correção da animação de propagação.
- Movimentação dos nós e decisão objetiva sobre magnetismo.
- Relações hierárquicas de contenção.
- Regras de duração, datas idealizadas e previsão.
- Histórico centralizado e detalhado.
- Edição de relações e transformação de tipo em aprovação.
- Perfis GPO reutilizáveis e exceções por usuário.
- Criação em lote de subitens.
- Estados, progresso e indicadores.
- Templates e revisão de usuários.
- Visões Sintética, Analítica e Gantt.
- Design, configurações de visualização, dimensionamento e responsividade.
- Arquivamento e restauração.
- Testes e rastreabilidade.

### Fora do escopo desta versão

Backend, banco de dados, autenticação real, autorização no servidor, isolamento SaaS efetivo, colaboração em tempo real, migração para armazenamento central, anexos remotos e cobrança. A ausência desses componentes não deverá ser interpretada como segurança multiusuário ou sincronização entre dispositivos.

---

## 3. Matriz de requisitos cruzados

### 3.1 Recursos e requisitos do PRD 2

| ID | Requisito | Situação inicial observável / evidência | Resultado esperado | Prioridade |
|---|---|---|---|---|
| R2-01 | Ao criar ou mover um item para subitem, vinculá-lo a todos os pais pela relação CONTÉM | Há hierarquia `parentId`; validar se todas as relações CONTÉM ancestrais são criadas e mantidas | Relações de contenção coerentes com todos os ancestrais, sem duplicação e sem confundir CONTÉM com dependência temporal | P0 |
| R2-02 | Redimensionar, ocultar e mostrar colunas na Sintética | Redimensionamento e visibilidade de colunas existem no código | Corrigir UX, alinhamento, autoajuste e responsividade sem perder os controles existentes | P0 |
| R2-03 | Histórico dos filhos consultável no histórico do pai | Histórico com snapshots existe; centralização deve ser verificada | Mostrar eventos descendentes na consulta do pai, identificando claramente o item de origem; não duplicar nem reescrever o evento original | P1 |
| R2-04 | Trabalhar com durações e relações, não exigir datas individuais na criação de cada atividade | Existem campos de duração e datas; o modelo atual ainda deve ser auditado contra esse fluxo | Criar fluxo de planejamento por data inicial idealizada do item principal, durações e relações; pré-visualizar término projetado antes de confirmar | P0 |
| R2-05 | Início e término idealizados imutáveis após criação, salvo repactuação explícita | Existem datas de baseline/histórico e término ideal; validar separação real entre baseline e repactuação | Preservar baseline original; registrar repactuações como eventos explícitos; nunca sobrescrever baseline por recálculo | P0 |
| R2-06 | Previsão derivada das durações e relações | Há recursos de cronograma/Gantt; validar fórmula e casos paralelos | Calcular pela rede de dependências, considerando paralelismo, tipos de relação e defasagens; nunca somar indiscriminadamente todas as durações | P0 |
| R2-07 | Transformar um tipo de item em aprovação | Fluxos de aprovação existentes em algum grau; verificar se o tipo pode ser alterado sem recriação | Permitir alterar a configuração/tipo do item para aprovação preservando ID, relações e histórico, com validação de campos e transições | P1 |
| R2-08 | Editar uma relação sem excluir e recriar | Deve ser auditado no editor de relações atual | Editar origem/destino, tipo, defasagem, descrição e demais campos suportados mantendo a identidade da relação e seu histórico | P1 |
| R2-09 | Perfis GPO padrão atribuíveis a usuários e exceções individuais | Perfis reutilizáveis e regras individuais foram implementados | Validar aplicação do perfil, precedência das exceções, edição posterior e representação correta no cadastro | P0 |
| R2-10 | Histórico detalhado: estado anterior/novo, usuário, empresa, data e hora | Eventos com snapshots do ator, empresa e setor foram implementados | Confirmar que cada evento exibe valores anterior/novo quando aplicável, autor, organização, data e hora; não inventar dados históricos ausentes | P1 |
| R2-11 | Editar item pai: nome, responsável e término idealizado; previsto herdado | Edição e resumo de cronograma existem | Permitir repactuação explícita do pai sem sobrescrever baseline; recalcular previsão herdada sem confundir data idealizada e data esperada | P0 |
| R2-12 | Substituir BACKLOG por Lista de pendências | Estados atuais foram parcialmente ajustados | Verificar rótulos, migração de valores locais existentes e transições; não perder itens que usam estado legado | P1 |
| R2-13 | “Pronto” substituído por “Liberado para execução”, atribuído automaticamente quando predecessor liberar | Regra automática já possui teste, segundo histórico de implementação | Validar predecessor concluído/liberado, múltiplas predecessoras, bloqueios e atualização após reabertura | P0 |
| R2-14 | Remover “Em análise” e “Em correção” dos estados operacionais comuns | Estados transitórios foram ocultados dos seletores comuns | Preservar compatibilidade com registros antigos e eventos; não apagar histórico nem tornar estados inválidos ininterpretáveis | P1 |
| R2-15 | Magnetismo dos nós inspirado em mindmap | O grafo usa simulação de forças, posições fixadas e arraste; comportamento relatado continua insatisfatório | Executar tentativa controlada com critérios objetivos; se falhar, restaurar movimento livre convencional e documentar a decisão | P0 |
| R2-16 | IDs da Sintética renumerados após reordenação/indentação | IDs curtos são derivados da posição atual da linha | Confirmar que o número visual reflete a ordem atual, sem alterar IDs internos estáveis nem referências | P1 |
| R2-17 | Criar várias etapas de uma vez também em subitem | Criação em lote já foi adicionada | Testar no contexto de subitem, dados comuns/individuais, validação integral e ausência de criação parcial inconsistente | P1 |
| R2-18 | Alinhar integralmente o painel do item e remover textos auxiliares desnecessários | Painel contém áreas de informação e instruções técnicas; verificar texto atual | Remover os textos explicitamente apontados como ruído de interface quando ainda presentes; manter informação útil em contexto adequado | P1 |
| R2-19 | Propagação segue sequência da Sintética, passa pelos subitens, retorna ao pai e continua | O comportamento atual foi reportado como repetidamente ancorado no pai | Calcular percurso a partir da origem definida e da sequência/hierarquia e relações previstas; descer pelos subitens, retornar ao pai e continuar conforme a regra de percurso | P0 |
| R2-20 | Padronizar proporção do eixo horizontal do Gantt | Eixo com ticks proporcionais foi implementado | Validar escala proporcional, guias alinhadas, datas, zoom e consistência entre períodos curtos e longos | P1 |
| R2-21 | Escolher cor de preenchimento das linhas para diferenciar indentação e projeto | Há distinção visual por tipo/nível; configuração de cor deve ser auditada | Permitir configuração coerente de cor por nível e/ou projeto, com contraste acessível e persistência local | P1 |
| R2-22 | Botão “Criar conforme template” ao lado de “Novo item” | Dois botões apontam para a mesma ação de templates | Manter um botão “Modelos” para gestão e posicionar “Criar conforme template” ao lado de “Novo item”, com ações distintas e sem duplicação funcional | P0 |
| R2-23 | Modificar cores e ícones dos estados | Estados configuráveis existem em algum grau; confirmar suporte visual completo | Permitir editar cor e ícone do estado e refletir em tabela, grafo, Gantt, seletores, legenda e tooltip | P1 |
| R2-24 | Percentual de avanço e estado se retroalimentam | Deve ser validado contra regras atuais | Ao informar avanço maior que zero, sugerir ou aplicar “Em execução” conforme regra aprovada; ao concluir, 100%; não sobrescrever estados de bloqueio/aprovação sem regra explícita | P0 |
| R2-25 | Exibir início idealizado, término idealizado e duração idealizada ao abrir item | Painel e resumo de cronograma existem | Mostrar os valores idealizados claramente, separados dos valores atuais/esperados/realizados e da repactuação | P0 |
| R2-26 | Empresa, setor e estado herdados do responsável; remover de “Descrição e contexto” | A estrutura organizacional atual existe; herança automática precisa de auditoria | Derivar os valores do responsável selecionado, reduzir campos manuais redundantes e exibi-los em área contextual própria; definir fallback para responsável ausente | P1 |
| R2-27 | Item cancelado com percentual de controle 100% | Deve ser verificado | Aplicar 100% apenas ao indicador de controle definido, sem representar cancelamento como conclusão operacional; deixar a semântica documentada | P1 |
| R2-28 | Arquivar itens pais e filhos | Arquivamento/restauração de hierarquias foi implementado | Validar subárvore, permissões, histórico, relações externas e restauração íntegra | P0 |
| R2-29 | Redimensionar painéis de cadastro e itens | Drawers redimensionáveis foram implementados | Testar mouse/teclado, limites, responsividade e persistência quando aplicável | P1 |
| R2-30 | Simplificar “Mostrar subitens como na visão sintética” para “Mostrar subitens” | Rótulo deve ser verificado | Usar o texto curto em todas as ocorrências pertinentes | P2 |
| R2-31 | Nome do programa “Fluxo Visual”, remover “Gestão Operacional” e substituir texto genérico pelo nome da organização | README ainda usa “Fluxos · Gestão operacional”; interface precisa ser auditada | Padronizar nome visível como “Fluxo Visual”, remover o slogan antigo solicitado e apresentar nome da organização no contexto indicado | P1 |
| R2-32 | Grafo exibe término idealizado inicial abaixo do nome e timer do responsável | Tooltip/cartão analítico precisa ser auditado | Exibir a data inicial idealizada no cartão do nó abaixo do nome e junto à informação do responsável, com formato legível | P1 |
| R2-33 | Clicar no responsável na árvore lateral destaca os itens desse responsável | Árvore e filtros existem em algum grau | Clique no responsável aplica destaque reversível aos itens correspondentes sem alterar dados nem perder o contexto de navegação | P1 |

### 3.2 Requisitos transversais do PRD Mestre v1.1

| ID | Requisito | Critério para esta rodada |
|---|---|---|
| M-01 | Preservar o modelo amorfo de itens e relações | Não confundir hierarquia visual com dependência temporal; validar cada mudança no modelo atual |
| M-02 | Consistência entre Sintética, Analítica e Gantt | Alterações de um item ou relação devem refletir nas três visões pertinentes |
| M-03 | Tipos de item configuráveis | Auditar campos, obrigatoriedade, estados e comportamentos; implementar correções locais viáveis |
| M-04 | Progresso ponderado | Evitar dupla contagem de agrupadores e não inventar percentuais sem peso válido |
| M-05 | Indicadores de atraso/risco/bloqueio | Tratar atraso e risco como indicadores, não como estados operacionais |
| M-06 | Caminho crítico e folgas | Validar cálculo com rede temporal, paralelismo e defasagens; indicar dados insuficientes |
| M-07 | Tooltip analítico | Conferir tipo, responsável, estado, progresso, durações, data esperada, desvio, bloqueios e dependências |
| M-08 | Árvore lateral e filtros | Validar expansão, seleção, filtros por tipo/responsável/estado/organização/projeto/setor/atributos |
| M-09 | Aprovações e correções | Preservar decisão anterior, motivo, autor, data e vínculo entre rodadas |
| M-10 | Templates completos | Preservar estrutura, relações, pesos, durações, estados iniciais, atributos, aprovações e revisão antes de confirmar |
| M-11 | Anexos | Não ampliar armazenamento local sem decisão; documentar a limitação atual e não simular segurança de backend |
| M-12 | GPO | Validar escopo, precedência e exceções locais; não afirmar segurança efetiva no servidor |
| M-13 | Critérios de aceite e testes | Registrar o que foi realmente testado e o que permanece pendente |

---

## 4. Regras funcionais detalhadas

### 4.1 Contenção e hierarquia

- Ao criar ou mover um item para uma posição de subitem, atualizar a hierarquia e as relações CONTÉM necessárias para todos os ancestrais.
- Não criar relações duplicadas.
- Ao remover um item da hierarquia, atualizar somente as relações de contenção afetadas.
- Não excluir relações de dependência independentes.
- Detectar ciclos inválidos de contenção.
- A ordenação/indentação da Sintética não deverá modificar automaticamente relações temporais.
- O ID interno permanecerá estável. O número sequencial exibido poderá ser recalculado conforme a ordenação atual.

### 4.2 Planejamento por duração e relações

O fluxo de criação deverá permitir definir a data inicial idealizada do item principal, criar atividades/subitens com durações e relações, e visualizar a data final projetada antes da confirmação.

- Relação padrão para subitens: Término–Início (TI), salvo configuração explícita diferente.
- Duração padrão só poderá ser aplicada se houver regra de produto definida; não inventar duração para preencher campo.
- Suportar TI, II, TT e IT e defasagens positivas/negativas conforme o modelo existente.
- Usar dias/tempo corrido, sem descontar automaticamente fins de semana, feriados ou jornada.
- O cálculo deverá considerar atividades paralelas, não apenas somar todas as durações.
- A duração zero deverá continuar válida para marcos/atividades instantâneas quando suportada.
- A pré-visualização deverá identificar dependências inválidas, ciclos temporais e dados insuficientes.
- O usuário poderá ajustar durações/relações ou aceitar a previsão antes de criar.
- A criação em lote deverá validar todo o conjunto antes de confirmar e evitar criação parcial inconsistente.

### 4.3 Baseline, repactuação e previsão

Manter separados:

1. **Início/término idealizados originais (baseline):** referência original preservada.
2. **Início/término idealizados repactuados:** nova referência explicitamente aprovada e registrada no histórico.
3. **Datas previstas/esperadas:** resultado dinâmico do cálculo de dependências e durações.
4. **Datas realizadas:** dados efetivos de execução.

A previsão pode mudar com a rede de dependências. A baseline original não pode mudar por recálculo. Toda repactuação deverá registrar autor, data/hora, valor anterior e novo valor, motivo quando suportado e impacto no cronograma.

Para itens pais, o término previsto continua derivado dos descendentes/relações aplicáveis. A edição do pai não poderá mascarar a previsão calculada.

### 4.4 Animação de propagação — regra específica

O comportamento não poderá usar o pai como origem automática em todas as execuções.

- A origem será o item explicitamente selecionado/iniciado.
- O algoritmo deverá considerar a sequência da Sintética e a hierarquia conforme solicitado: percorrer os itens pertinentes, descer pelos subitens, retornar ao pai e continuar para os demais itens.
- A hierarquia sozinha não equivale a dependência temporal. O percurso deverá explicitar quais transições são hierárquicas e quais são relações de dependência.
- O percurso deverá visitar nós válidos sem entrar em loop e sem repetir animações indefinidamente.
- Ramificações, itens sem filhos, itens sem relações, filtros e nós ocultos devem ter comportamento definido.
- A animação deverá destacar bloqueios/gargalos quando identificáveis, sem alterar dados.
- Deve haver controles de iniciar, pausar/interromper, repetir e limpar destaque.
- A animação deverá preservar a seleção do usuário e o layout do grafo.

**Testes mínimos:** origem raiz; origem em subitem; pai com vários filhos; irmão com dependência direta; subitem sem dependências; relação não hierárquica entre projetos; ciclo; filtros ativos; item bloqueado; nenhum caminho válido.

### 4.5 Magnetismo e movimentação dos nós

Será feita uma única tentativa técnica controlada para implementar magnetismo no estilo mindmap, em vez de repetir ajustes sem diagnóstico.

Critérios obrigatórios:
- O nó arrastado acompanha o ponteiro sem atraso ou salto relevante.
- Nós relacionados se deslocam de maneira suave e proporcional.
- O usuário continua podendo posicionar nós livremente.
- O magnetismo não prende o nó nem produz oscilação.
- A soltura fixa o layout e não dispara reposicionamento automático.
- O layout manual persiste conforme a persistência local atual.
- Zoom, pan, seleção, arestas e agrupamentos continuam funcionais.
- O movimento é previsível em diferentes resoluções e agrupamentos.

**Plano de contingência:** se qualquer critério essencial falhar, remover o magnetismo e restaurar a movimentação convencional de nós, preservando drag, pan, zoom, enquadramento e posições salvas. Documentar o resultado dos testes e não insistir em outra rodada de magnetismo sem autorização.

### 4.6 Progresso e estados

- Avanço maior que zero deve implicar “Em execução” quando o estado atual permitir a transição.
- Conclusão implica 100%.
- Cancelamento deverá apresentar 100% no indicador de controle solicitado, mas não deve ser rotulado como concluído.
- Estados de bloqueio, aprovação e correção não podem ser sobrescritos automaticamente sem regra explícita.
- “Liberado para execução” deve ser aplicado automaticamente quando todas as condições predecessoras estiverem atendidas.
- “Lista de pendências” deverá substituir o rótulo BACKLOG, com compatibilidade para registros antigos.
- Estados legados “Em análise” e “Em correção” não devem ser apagados dos registros históricos; devem ser interpretados e exibidos de forma consistente.
- Cores e ícones de status deverão ser configuráveis e refletidos em todas as visualizações.
- Atraso, risco e criticidade são indicadores, não estados exclusivos.

### 4.7 Histórico centralizado

- Registrar mudanças relevantes com valor anterior e novo quando aplicável.
- Exibir usuário, organização, data e hora com fuso coerente.
- O histórico do pai poderá consultar eventos dos descendentes, identificando explicitamente o item de origem.
- A consulta centralizada não deve duplicar eventos persistidos nem reatribuir sua autoria ao pai.
- Não fabricar valores anteriores para eventos antigos que não os armazenem.

### 4.8 Usuários e GPO

- Permitir consultar e editar os dados já cadastrados do usuário, conforme permissões atuais.
- Validar os campos editáveis e manter os identificadores.
- Cancelar edição sem modificar dados.
- Exibir confirmação de salvamento e erros de validação.
- Editar organização, setor, estado, perfil ou permissões somente quando permitido.
- Perfis GPO reutilizáveis devem ser atribuíveis a usuários e permitir exceções individuais posteriores.
- Atribuir um perfil não deverá apagar exceções válidas sem confirmação.
- A edição de usuário não deve conceder privilégios implicitamente.
- A herança de empresa/setor/estado pelo responsável deverá ser consistente com o modelo atual; se o responsável não possuir esses dados, mostrar ausência claramente, sem inventar valores.

### 4.9 Templates e ações do cabeçalho

Os dois botões atuais acionam a mesma ação. Corrigir a duplicidade mantendo as duas capacidades solicitadas:

- **Modelos:** abre a área de consultar, criar, editar e administrar templates.
- **Criar conforme template:** permanece ao lado de **Novo item** e inicia o fluxo de escolha e aplicação de um template.

A aplicação de template deverá:
- Criar novas instâncias com IDs novos.
- Preservar relações internas do modelo.
- Resolver referências a responsáveis no contexto local disponível.
- Permitir revisão dos dados antes de confirmar.
- Evitar criação parcial em caso de validação inválida.
- Não alterar o template original ao editar a instância criada.

### 4.10 Design, tabela e responsividade

#### Tabela Sintética
- Implementar ajuste automático de largura das colunas com base em cabeçalhos e conteúdo representativo.
- Definir largura mínima/máxima por coluna e evitar que textos longos expandam indefinidamente a tabela.
- Manter redimensionamento manual por mouse e teclado.
- Manter ocultar/mostrar colunas e persistir preferências locais.
- Oferecer forma explícita de voltar ao ajuste automático.
- Centralizar IDs, datas, durações, percentuais, pesos, status, seleção e ações.
- Manter nomes, descrições e textos longos alinhados à esquerda.
- Alinhar cabeçalho e valores pela mesma regra.
- Preservar hierarquia e recuo sem sobrepor texto e controles.
- Não truncar silenciosamente dados essenciais; quando o espaço for insuficiente, permitir quebra de linha ou rolagem horizontal controlada.

#### Painéis e formulários
- Corrigir alinhamento dos campos e botões.
- Remover textos técnicos auxiliares citados no PRD 2 quando ainda aparecerem na interface principal e não forem necessários para a tarefa.
- Manter informação relevante em tooltip, ajuda contextual ou documentação, em vez de eliminá-la indiscriminadamente.
- Evitar campos espremidos, rótulos sobrepostos, botões cortados e scroll horizontal acidental.
- Manter drawers redimensionáveis com limites seguros e suporte a teclado.
- Formulários devem se reorganizar para telas menores.

#### Página de configurações
Criar uma área de **Configurações de visualização** (ou integrar à área de configurações existente, se já houver) para centralizar preferências locais:
- Colunas visíveis.
- Larguras de coluna e opção de ajuste automático.
- Alinhamento e preferências de visualização quando aplicáveis.
- Cores de preenchimento por nível/projeto.
- Cores e ícones dos estados, se o usuário tiver permissão.
- Restauração de padrões.

Não duplicar configurações que já existam em outra área: primeiro auditar e consolidar.

#### Identidade visual
- Nome de produto visível: **Fluxo Visual**.
- Remover o texto “Gestão Operacional” conforme solicitado.
- Substituir o texto genérico “Processos e demandas” pelo nome da organização no contexto indicado.
- Rótulo “Mostrar subitens” no lugar de “Mostrar subitens como na visão sintética”.
- Manter contraste e legibilidade; cor não pode ser o único sinal de estado.
- A interface deve continuar funcional em larguras de 1920, 1366, 1024, 768 e 390 px.
- Em telas estreitas, adaptar painéis e controles; a tabela pode usar rolagem horizontal controlada, mas os campos essenciais não devem desaparecer.

### 4.11 Gantt e dados analíticos

- Manter escala temporal proporcional e guias verticais alinhadas.
- Exibir início/término idealizados, datas esperadas e realizadas em campos distintos.
- Exibir caminho crítico em vermelho somente quando o cálculo for confiável.
- Mostrar folgas e dependências quando calculáveis.
- Indicar explicitamente dados insuficientes ou ciclos inválidos.
- Tooltip analítico deve incluir nome, tipo, responsável, estado, progresso, durações, data esperada, desvio, bloqueios e dependências relevantes.
- O cartão do nó deverá apresentar o término idealizado inicial conforme solicitado.
- A árvore lateral deverá permitir clicar no responsável e destacar seus itens, com destaque reversível e sem alteração de dados.

---

## 5. Auditoria do estado atual: hipóteses a validar

Esta tabela registra evidências do código e histórico de trabalho, não uma certificação de aceite.

| Área | Evidência conhecida | Avaliação inicial |
|---|---|---|
| Perfis GPO e exceções | Implementação e testes anteriores registrados | Parcial: retestar fluxos de atribuição e precedência |
| Arquivamento/restauração | Suporte a hierarquias e testes registrados | Parcial: retestar relações externas e histórico |
| Colunas ocultas e resize manual | Código presente em `dist/workspace.js` | Parcial: falta validar autoajuste, alinhamento e responsividade |
| Posições do grafo | `dist/graph.js` usa simulação de forças, posições fixadas e arraste | Defeituoso segundo relato: magnetismo não atende ao resultado esperado |
| Animação de propagação | Controle `propagate` presente | Defeituoso segundo relato: origem/percurso se associa indevidamente ao pai |
| Templates | Dois botões no cabeçalho usam a mesma ação `templates` | Defeituoso: duplicação funcional e disposição não atende ao PRD 2 |
| Histórico | Snapshots e eventos implementados | Parcial: validar detalhes e consulta centralizada do pai |
| Duração e cronograma | Duração, resumo e Gantt presentes | Parcial: verificar integralmente a regra de planejamento por duração |
| Usuários | Administração de usuários existe | Parcial: confirmar edição completa e validação |
| Configurações visuais | Configurações de colunas existem; página centralizada precisa ser auditada | Parcial/Não verificável |
| Cores e ícones de status | Configuração de status existente em algum grau | Parcial: confirmar edição de ícone/cor e propagação entre visões |
| Responsividade | Não há evidência suficiente de teste visual abrangente | Não verificável |
| Testes de regressão | Pipeline anterior passou em check, test e build | Não substitui os novos testes específicos desta versão |

Não se deve alterar um status desta tabela para “Conforme” até existir evidência atual de teste.

---

## 6. Plano de implementação

### Fase 0 — Linha de base e rastreabilidade
1. Confirmar branch `PRD3` e registrar commit-base.
2. Inspecionar componentes e regras relacionadas a cada requisito.
3. Criar a matriz completa de testes.
4. Registrar capturas ou resultados visuais de referência.
5. Confirmar quais requisitos já estão implementados, parcialmente implementados ou ausentes.

**Saída:** diagnóstico reproduzível; nenhuma alteração funcional ampla.

### Fase 1 — P0: integridade e defeitos de comportamento
1. Corrigir propagação.
2. Corrigir e testar contenção de todos os ancestrais.
3. Validar planejamento por duração, dependências e baseline.
4. Testar liberação automática e retroalimentação avanço/estado.
5. Executar tentativa controlada de magnetismo; aplicar fallback se falhar.
6. Validar GPO e preservação dos dados.

**Saída:** regras fundamentais previsíveis e testadas.

### Fase 2 — P0: tabela e interface responsiva
1. Ajuste automático de colunas.
2. Alinhamento consistente.
3. Preservar resize manual e visibilidade de colunas.
4. Corrigir painéis, formulários e truncamentos.
5. Validar resoluções-alvo.

**Saída:** interface utilizável sem ajustes manuais obrigatórios.

### Fase 3 — P1: administração e experiência
1. Separar gestão de modelos e criação a partir de template.
2. Permitir edição de usuários.
3. Melhorar histórico centralizado.
4. Permitir edição de relações e conversão de item em aprovação.
5. Ajustar cores/ícones, identidade visual e configurações.
6. Validar filtros, tooltip, navegação por responsável e cartão analítico.

**Saída:** fluxos administrativos coerentes e funcionalidades recuperadas.

### Fase 4 — P1/P2: regressão integral
1. Testar Gantt, caminho crítico e proporção do eixo.
2. Testar criação em lote em item pai e subitem.
3. Testar arquivamento/restauração.
4. Testar templates, estados legados e histórico.
5. Revisar todas as linhas da matriz e classificar o resultado.
6. Documentar itens não concluídos e pedir aprovação para qualquer mudança de escopo.

**Saída:** relatório de aceite com evidências e pendências explícitas.

---

## 7. Critérios de aceite global

Uma entrega só será aceita quando:
- Cada requisito estiver vinculado à fonte original.
- O comportamento for demonstrado por teste ou inspeção visual pertinente.
- Não houver regressões conhecidas em funcionalidades preexistentes.
- Dados, IDs, relações e histórico forem preservados.
- A hierarquia visual não alterar silenciosamente dependências temporais.
- A animação iniciar do item correto e seguir o percurso definido.
- O magnetismo for validado objetivamente ou removido em favor do arraste livre.
- A tabela tiver ajuste automático e manual, alinhamento coerente e opção de ocultar/mostrar colunas.
- O botão de gestão de modelos e o botão de criação por template tiverem ações distintas.
- Os usuários puderem revisar e editar dados conforme as permissões.
- A interface for validada em resoluções amplas e estreitas.
- `npm run check`, `npm test` e `npm run build` forem executados e os resultados registrados.
- A versão publicada for verificada separadamente; sucesso de build não comprova sucesso visual.
- Toda feature não entregue estiver registrada com justificativa e proposta, sem omissão silenciosa.

## 8. Entregáveis desta revisão

1. Este PRD 3 versionado na branch `PRD3`.
2. Matriz de rastreabilidade atualizada.
3. Correções incrementais por fase.
4. Testes funcionais e de regressão.
5. Registro de magnetismo: aprovado ou fallback para arraste livre.
6. Relatório final com: implementado, validado, parcial, não implementado, evidência e decisão necessária.

**Diretriz final:** implementar a menor alteração que resolva cada problema, verificar o resultado no comportamento real e preservar todas as funcionalidades solicitadas. Nenhum requisito poderá ser descartado sem comunicação explícita e proposta de alteração para aprovação.
