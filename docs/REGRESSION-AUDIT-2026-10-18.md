# Auditoria de regressão — FLUXOSVISUAL

**Data da auditoria:** 18/10/2026  
**Branch auditada:** `PRD3`  
**Commit auditado:** `06154359883f52b0c3e6916a6599b1f14ea38c25`  
**Branch-base:** `feature/prd-evolution`, commit `112cc0bed805cbcc6799c26ff64fd9055e35208a`  
**Status:** sem evidência de exclusão integral de arquivos ou funções de negócio no diff acumulado; auditoria funcional completa ainda pendente. Não autoriza, por si só, release de produção.

## 1. Universo de execuções

Consulta ao histórico de GitHub Actions do repositório: 227 execuções.

| Branch | Sucesso | Falha | Cancelada | Total |
|---|---:|---:|---:|---:|
| `PRD3` — validação | 90 | 29 | 0 | 119 |
| `feature/prd-evolution` — build/deploy | 10 | 40 | 57 | 107 |
| `main` — build/deploy | 1 | 0 | 0 | 1 |
| **Total** | **101** | **69** | **57** | **227** |

As 69 falhas confirmadas se distribuem pelo estágio que falhou:

| Estágio que falhou | Quantidade | Leitura |
|---|---:|---|
| Smoke test de navegador na `PRD3` | 24 | Testes de interface/interação; não são 24 defeitos independentes de produção |
| Testes automatizados na `PRD3` | 5 | Asserções de contrato, cor de linha e cronograma falharam em commits intermediários |
| `Check project` na branch de evolução | 14 | Erros de sintaxe em snapshots intermediários |
| Testes automatizados na branch de evolução | 20 | Testes de regras GPO, exclusão, fixtures, cronograma e outras funcionalidades falharam em snapshots intermediários |
| Job de deploy na branch de evolução | 6 | O build passou e o job de deploy falhou; os logs antigos desses jobs não estavam mais disponíveis para confirmar a causa específica |
| **Total** | **69** | |

As 57 execuções canceladas ocorreram na branch de evolução. O workflow configura `cancel-in-progress: true`; por isso, cancelamentos durante pushes sucessivos não devem ser contados como falhas de build ou de código.

## 2. Evidências das falhas e correções posteriores

### 2.1 Branch `feature/prd-evolution`

- Falhas de `Check project`: os logs confirmam `SyntaxError: missing ) after argument list` em `dist/workspace.js`. Commits posteriores corrigiram expressões de empresa/setor e uma declaração duplicada de liberação automática:
  - [Correção de expressões de empresa/setor](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/c2fa8b3c)
  - [Correção da declaração duplicada](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/9b7b7bfe)
- Testes de exclusão/GPO: a execução [#98](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39154465234) teve 9 falhas em 32 testes. Os logs incluem usuário/setor não encontrado e recusas GPO durante cenários de exclusão. O histórico mostra alterações posteriores para isolar os fixtures e restaurar corretamente o estado persistido nos testes:
  - [Restaurar carregamento de estado persistido no teste de exclusão](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/cb86096f)
  - [Isolar o estado antes do bootstrap dos testes de exclusão](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/333041ce)
- Deploy: seis execuções falharam no job `deploy` após o build passar. Como os logs históricos não puderam ser recuperados, a causa específica não é afirmada. A execução mais recente da branch de evolução consultada, [run #108](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39160276996), concluiu build e deploy com sucesso.

Esses resultados provam que alguns commits intermediários tinham defeitos reais de sintaxe e que alguns testes de regras/fixtures falhavam. Não provam que esses defeitos permaneçam no HEAD atual; também não permitem atribuir todas as falhas de teste exclusivamente a fixtures sem reexecutar os cenários no código atual.

### 2.2 Branch `PRD3`

- 24 falhas ocorreram no passo `Run browser smoke tests`. As falhas observadas incluíram painel ainda visível durante a matriz de resoluções e medição de largura antes de terminar a animação de abertura.
- Cinco falhas ocorreram em `Run automated tests`. Os logs identificaram:
  - teste de cor de linha retornando `transparent` em vez da cor hierárquica esperada; o fallback foi corrigido em [10a16c78](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/10a16c78);
  - incompatibilidade entre uma asserção de teste e o seletor de cor de status;
  - fixture de cronograma incompleto que não exercitava o caso de duração ausente como pretendido;
  - asserções de contrato do fluxo de templates que precisaram ser alinhadas à implementação.
- O smoke test foi corrigido para aguardar o fim da animação e fechar os painéis antes de verificar responsividade.
- A validação integral mais recente, [run #119](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39168686917), passou por todas as etapas: sintaxe, 65 testes automatizados, build e smoke test Playwright em 1920, 1366, 1024, 768 e 390 px.

## 3. Auditoria de alterações de código

Comparação acumulada entre o commit-base `112cc0bed805cbcc6799c26ff64fd9055e35208a` e o HEAD auditado:

- `PRD3` está 124 commits à frente da branch-base e nenhum commit atrás.
- Não há arquivos inteiros com status `removed` no diff acumulado.
- A revisão dos 124 commits não identificou exclusão integral de arquivo. O único commit encontrado com remoção de 20 ou mais linhas em um arquivo de código foi a refatoração de `moveItemHierarchy`: a lógica de movimento foi substituída por uma versão com rollback transacional, sincronização da subárvore e validação do cronograma. A alteração inclui testes de regressão para garantir que uma falha temporal reverta itens, relações, eventos e relações arquivadas.
- O diff acumulado não remove definições completas de funções de negócio em `dist/app.js`, `dist/graph.js` ou `dist/workspace.js`. Existem, porém, blocos de implementação substituídos; a ausência de exclusão de função não prova equivalência comportamental.

### Alterações visíveis que não devem ser confundidas com perda acidental

- **Grafo:** o arraste foi alterado para mover apenas o nó selecionado, em vez de deslocar todo o componente conectado. É uma mudança deliberada documentada no PRD3, mas ainda exige validação manual do comportamento esperado.
- **Nós do grafo:** o rótulo visível de duração foi substituído pelo timer do responsável atual e foram adicionadas datas idealizadas. A duração total continua disponível no tooltip; a alteração visual precisa ser avaliada conforme o requisito de UX.
- **Cronograma:** durações ausentes deixam de ser presumidas e atividades canceladas deixam de ampliar a previsão. São mudanças deliberadas para evitar datas fictícias; precisam permanecer cobertas por testes de regressão.
- **Templates:** gestão de modelos e criação a partir de template passaram a ter ações distintas.

## 4. Limite da conclusão

A matriz [`docs/PRD3-AUDIT.md`](https://github.com/GuilhermeBorja/FLUXOSVISUAL/blob/PRD3/docs/PRD3-AUDIT.md) contém 33 requisitos derivados do PRD2 e 13 requisitos transversais. Na versão consultada, apenas 2 estão marcados como conformes e 44 permanecem parciais.

Portanto, a conclusão tecnicamente sustentada é:

1. **Não foi encontrada evidência de arquivo inteiro ou função de negócio integralmente apagada** na comparação acumulada da branch `PRD3` com sua base.
2. **Foram encontrados defeitos reais em commits intermediários**, incluindo erros de sintaxe e ao menos um defeito de fallback de cor; há correções posteriores e o CI atual está verde.
3. **Não é possível garantir ausência de toda regressão funcional.** A matriz continua majoritariamente parcial e algumas mudanças de comportamento ainda carecem de validação integrada/manual.
4. **Não publicar `PRD3` em produção com base apenas no CI verde.** O próximo gate é fechar a matriz de regressão requisito a requisito, priorizando P0, com testes funcionais e evidências reproduzíveis.

## 5. Próxima ação recomendada

Usar os 44 itens parciais da matriz como checklist de regressão, começando pelos P0: integridade de itens/relações, baseline e repactuação, rede temporal/caminho crítico, progresso ponderado, templates com rollback, GPO e consistência entre Sintética, Analítica e Gantt. Registrar cada item como **preservado**, **corrigido**, **regressão encontrada** ou **não verificado**. Não alterar funcionalidades sem evidência de regressão e sem preservar o comportamento aprovado.
