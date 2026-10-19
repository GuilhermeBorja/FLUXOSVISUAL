# Fluxo Visual

Protótipo navegável para explorar a gestão de projetos, atividades, relações e aprovações. A branch `PRD3` reúne as melhorias funcionais desta rodada e publica a demonstração no [GitHub Pages](https://guilhermeborja.github.io/FLUXOSVISUAL/).

## Como testar

1. Abra o [aplicativo publicado](https://guilhermeborja.github.io/FLUXOSVISUAL/).
2. Entre com um perfil demonstrativo. Luis tem regras GPO globais para explorar os cadastros e permissões; outros usuários simulam escopos mais restritos.
3. Use **Sintética** para expandir subitens, filtrar, reordenar, ajustar vários itens ou abrir a edição de um item.
4. Use **Analítica** para navegar pela árvore, selecionar um item e destacar os itens relacionados; o segundo clique abre os detalhes. O grafo pode ser agrupado por projeto, responsável, empresa ou conexões, e arrastar um nó move apenas o nó selecionado; use os controles de agrupamento para organizar a visão.
5. Use **Gantt** para consultar a hierarquia, predecessoras, duração, folgas, riscos e caminho crítico.

## Regras funcionais da demonstração

- **Conclusão:** o percentual é opcional ao criar ou editar; novos itens começam em 0%, edições preservam o valor existente e o status Concluído define 100%. Reabrir um item concluído exige informar um novo percentual. A data real de conclusão vem da mudança efetiva, e as datas previstas ficam bloqueadas após concluir.
- **Resumo de grupos:** pais herdam o status menos avançado entre os filhos ativos, o intervalo planejado que abrange as atividades e o progresso ponderado dos descendentes elegíveis. Não há percentual ponderado geral do workspace.
- **Duração:** a duração total conta desde a criação; a duração da atividade começa quando suas predecessoras liberam o trabalho. Em uma relação TI, a liberação ocorre na conclusão da predecessora.
- **Aprovação:** aprovar conclui a etapa; reprovar é uma decisão registrada, não um status operacional. A reprovação preserva a etapa anterior, cria um nó de revisão e transfere para ele as relações de dependência.
- **GPO:** regras vinculadas a usuários controlam operações e escopos. Regras mais específicas prevalecem e, em caso de empate, negar prevalece. Regras legadas são convertidas para usuário durante a migração local.
- **Configuração:** ícones e cores dos tipos de item podem ser personalizados por empresa. Modelos mantêm status e permitem rever responsáveis antes da aplicação.
- **Criação em lote:** cada etapa criada junto ao fluxo permite escolher status, responsável, peso e duração, e toda a operação é desfeita se uma etapa falhar na validação.
- **Grafo:** a ação **Animar propagação** começa no item selecionado, percorre seus descendentes, retorna pelos ancestrais e visita os demais ramos sem repetir nós; é um recurso de exploração visual e não altera os registros.
- **Anexos:** a demonstração aceita arquivos locais de até 256 KB cada e 1 MB somados. Os arquivos e seus metadados ficam no armazenamento local do navegador e podem ser incluídos na exportação JSON.

## Desenvolvimento local

```bash
npm ci
npm run build
npm run check
npm test
```

Sirva a pasta `dist` com qualquer servidor estático. Os arquivos sincronizados em `sources/` são referências e não devem ser alterados.

## Limites e próximos requisitos

Os dados e anexos ficam no navegador atual. Login por seleção de usuário e regras GPO executadas no cliente servem para demonstrar o fluxo, não para proteger dados em produção; não há servidor, autenticação real, isolamento seguro entre empresas, sincronização entre navegadores ou colaboração em tempo real.

O Gantt e o caminho crítico são calculados localmente em dias corridos e dependem de datas e relações temporais válidas; o aplicativo indica quando faltam dados. Atributos personalizados e regras configuráveis de transição pertencem à formalização do modelo prevista na Etapa 2. Anexos protegidos e compartilhados exigem armazenamento e autorização no servidor, previstos para etapa futura.

## Calendário inclusivo (PRD3 0.4.1)

Datas planejadas contam início e término: 01/10 a 02/10 = 2 dias. Uma atividade de 1 dia termina no mesmo dia; duração zero continua representando um marco. TI sem defasagem inicia a sucessora no dia seguinte ao término da predecessora. II alinha inícios; TT alinha términos; IF alinha o término da sucessora ao início da predecessora. Defasagens deslocam datas, sem somar um dia extra. Timers reais continuam medindo tempo decorrido. A numeração visual continua dependente da posição, sem alterar IDs internos.

Durações explicitamente registradas são preservadas e suas previsões passam a usar a convenção inclusiva. Registros sem duração usam o intervalo das datas. Antes da primeira leitura de dados legados, uma cópia de recuperação é mantida em `fluxosVisualState.v2.beforeInclusiveCalendar`; nenhum registro é apagado.
