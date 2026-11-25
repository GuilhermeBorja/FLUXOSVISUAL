# 08: Remover publicação estática e modo offline

**What to build:** O Fluxo Visual é utilizado pela aplicação servida pelo Node, com autenticação, persistência compartilhada e autorização do backend. A demonstração no GitHub Pages e o modo alternativo sem backend deixam de ser mantidos.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Problem Statement

A aplicação ainda mantém um caminho estático que roda sem servidor, salva dados de negócio no navegador e permite editar o percentual de avanço diretamente. Esse comportamento diverge do fluxo operacional com autenticação, permissões, persistência compartilhada e registro factual de medições. A demonstração estática também continua sendo publicada pelo GitHub Pages, embora a validação e o uso previstos passem a ocorrer em um servidor Node local.

## Solution

Retirar a publicação do GitHub Pages e o modo offline do frontend. A aplicação deve operar pelo servidor Node e usar os fluxos autenticados do backend. Os arquivos frontend necessários para servir essa aplicação continuam no pacote do servidor. Se os assets forem abertos sem a integração do backend, a interface deve informar que o servidor é necessário e não deve simular que salvou dados.

## User Stories

1. Como pessoa usuária, quero acessar o Fluxo Visual pelo servidor Node local, para carregar os dados do workspace compartilhado.
2. Como pessoa usuária, quero entrar com minha conta autenticada, para que minhas ações sejam associadas à minha identidade.
3. Como pessoa usuária, quero que leituras e alterações passem pelo backend, para que permissões e histórico sejam aplicados de forma consistente.
4. Como pessoa executora, quero registrar avanço real pelo fluxo de medição, para persistir percentual, data efetiva e ocorrência factual juntos.
5. Como pessoa usuária, quero ver uma mensagem quando o backend estiver indisponível, para saber que a interface não salvou meus dados.
6. Como pessoa mantenedora, quero deixar de publicar a demonstração no GitHub Pages, para não oferecer um modo que deixou de ser validado e suportado.
7. Como pessoa mantenedora, quero retirar testes e automações exclusivos do modo estático, para que os gates representem os fluxos suportados.
8. Como pessoa mantenedora, quero preservar os assets frontend usados pelo servidor Node, para que retirar o Pages não impeça a aplicação local de iniciar.
9. Como pessoa mantenedora, quero preservar o domínio e os dados operacionais do backend, para que a retirada do modo estático não altere medições, permissões, histórico ou persistência compartilhada.

## Implementation Decisions

- O servidor Node com backend é o único modo suportado para uso operacional.
- A integração frontend deixa de selecionar comportamentos com base em um fallback sem backend para dados de negócio.
- Sem backend, a interface apresenta uma indicação explícita de que o servidor é necessário e não oferece gravações locais como alternativa.
- A automação que publica GitHub Pages é aposentada; a documentação deixa de anunciar essa demonstração como forma suportada de uso.
- Os assets frontend permanecem porque são servidos pela instalação Node.
- A remoção cobre persistência local e edição direta de dados de negócio que existiam apenas no modo estático. Preferências visuais locais podem permanecer se não armazenarem estado operacional.
- Regras de domínio, modelo de dados, APIs, medições, permissões e persistência do backend ficam fora da remoção.

## Testing Decisions

- Bons testes verificam comportamento observável por uma pessoa usuária, sem depender de detalhes internos de bundles ou de nomes de funções.
- Usar um teste E2E de navegador pelo servidor Node real para validar inicialização, autenticação, leitura e gravação autorizada no workspace, incluindo registro e reabertura de uma medição.
- Verificar que, sem a integração do backend, a interface informa a indisponibilidade e não confirma nem persiste gravações locais de dados operacionais.
- Remover ou adaptar os testes de navegador e gates de CI exclusivos da demonstração estática; manter testes de domínio que ainda protejam contratos usados pelo backend.
- Verificar a configuração de publicação para confirmar que os workflows do GitHub Pages não continuam implantando a demonstração.
- Usar como referência os testes E2E existentes do backend e os fluxos locais documentados de instalação e execução.

## Out of Scope

- Alterar ou remover o servidor Node, a API, autenticação, autorização, banco de dados ou histórico operacional.
- Alterar o modelo de medições, o percentual consolidado dos itens ou as regras de domínio.
- Migrar dados legados que estejam salvos no navegador para o backend.
- Remover os assets frontend usados pelo servidor local.
- Escolher ou implantar outro provedor de hospedagem pública.

## Further Notes

- A validação da aplicação será feita com o servidor Node executado localmente.
- Este ticket é independente da separação da lógica de domínio do bundle do navegador descrita no ticket 07.

## Comments

- 2026-11-25: Ticket 07 retirou os testes legados dos comandos mantidos, mas preservou os arquivos VM para não misturar a aposentadoria do modo offline. Ao implementar este ticket, revisar e retirar as verificações de estado operacional em `localStorage` e migração local ainda presentes em `tests/core.test.mjs`, `tests/deletion.test.mjs`, `tests/inclusive-calendar.test.mjs`, `tests/p0-integrity.test.mjs` e `tests/prd5.test.mjs` (especialmente `canonicalHierarchyVersion`). Os contratos suportados dessas áreas já têm testes de domínio/API e E2E autenticado; não migrar estado local para o backend.
