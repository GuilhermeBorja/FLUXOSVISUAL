# Fluxo Visual PRD6 — instalação e operação do backend

O servidor entrega a aplicação e a API na mesma origem. Os dados ficam em SQLite no diretório `DATA_DIR`; anexos ficam em `DATA_DIR/attachments`. Cada conta é autenticada no servidor e precisa de vínculo com o workspace e permissão GPO para acessar seus dados.

Requisito: **Node.js 24 LTS**. O backend utiliza os módulos nativos `node:http`, `node:crypto` e `node:sqlite`; as dependências npm existentes são usadas para compilar o frontend.

## 1. Executar com Node.js

Na pasta do repositório, copie `.env.example` para `.env` (`cp .env.example .env` em Linux/macOS ou `Copy-Item .env.example .env` no PowerShell). Ajuste `DATA_DIR` e `PUBLIC_ORIGIN` antes do setup. Em seguida:

```sh
npm ci
npm run build
npm run setup -- --email seu@email.com --name "Seu nome" --organization "Sua empresa" --workspace "Sua obra" --state PE
npm start
```

Abra `http://localhost:3000`. O setup cria somente o administrador e um workspace vazio. Não existem contas de demonstração ou senhas padrão.

Sem senha informada, o setup gera uma senha aleatória e a apresenta uma vez no terminal. Guarde-a em um gerenciador de senhas. Para fornecer uma senha escolhida sem incluí-la nos argumentos visíveis do processo, use `--password-stdin` ou a variável `FLUXOS_ADMIN_PASSWORD` do ambiente de instalação. A senha precisa ter entre 12 e 128 caracteres.

Repetir o setup **não redefine senhas nem recria dados**. Os argumentos organizacionais podem ser ajustados no primeiro setup e posteriormente pelos cadastros autorizados da aplicação. Os comandos `npm start`, `npm run setup`, `npm run backup` e `npm run restore` carregam o arquivo `.env`; variáveis já exportadas no ambiente têm precedência.

### Diretório persistente

Defina `DATA_DIR` no `.env` antes de executar setup e servidor. Os dois comandos precisam apontar para o mesmo diretório. Para usar uma variável do ambiente, configure-a no mesmo terminal dos comandos:

PowerShell:

```powershell
$env:DATA_DIR = "C:\FluxoVisual\dados"
$env:PUBLIC_ORIGIN = "http://localhost:3000"
```

Linux/macOS:

```sh
export DATA_DIR=/var/lib/fluxosvisual
export PUBLIC_ORIGIN=http://localhost:3000
```

O usuário do processo precisa de acesso de leitura e escrita nesse diretório. O banco, seus arquivos auxiliares WAL/SHM e os anexos devem permanecer no mesmo volume local persistente. Esta implantação executa **uma instância da aplicação por banco SQLite**.

## 2. Executar com Docker Compose

Na pasta do repositório, copie `.env.example` para `.env`, caso ainda não exista, e ajuste a origem e a porta publicadas. Não é necessário instalar Node.js no host para essa opção.

```sh
docker compose build
docker compose run --rm fluxosvisual node scripts/setup.mjs --email seu@email.com --name "Seu nome" --organization "Sua empresa" --workspace "Sua obra" --state PE
docker compose up -d
docker compose logs -f fluxosvisual
```

O volume nomeado `fluxosvisual_data` preserva os dados após reiniciar ou recriar o container. O setup e o servidor usam esse mesmo volume em `/var/lib/fluxosvisual`; os valores `HOST` e `DATA_DIR` do `.env` são substituídos pelos valores explícitos de `compose.yaml`. O processo roda como usuário `node` (UID/GID 1000), com sistema de arquivos da imagem somente para leitura. A imagem prepara as permissões do volume nomeado na primeira inicialização. Se substituir esse volume por um diretório do host, dê a esse usuário permissão de leitura e escrita no diretório. A porta padrão publicada é `3000`.

No arquivo `.env` utilizado pelo Compose, configure a origem exata pela qual as pessoas abrirão a aplicação:

```dotenv
PORT=3000
PUBLIC_ORIGIN=http://localhost:3000
```

Se alterar a porta, ajuste também a origem. Para acesso pela internet, use uma URL HTTPS e encaminhe as requisições pelo proxy da hospedagem à porta 3000 do serviço:

```dotenv
PUBLIC_ORIGIN=https://fluxos.suaempresa.com.br
```

`PUBLIC_ORIGIN` controla a verificação de origem e a proteção `Secure` do cookie. O serviço não confia em cabeçalhos de proxy fornecidos pelo navegador. A URL do frontend e da API deve ser a mesma.

## 3. Saúde e logs

```sh
curl http://localhost:3000/api/health
```

O Dockerfile utiliza essa rota no healthcheck. Registros de requisições e erros seguem para a saída do processo; use os logs do container ou do gerenciador de serviços para a coleta. O identificador de correlação permite relacionar comandos e falhas aos eventos do sistema.

Dados operacionais não são apagados por reinício. Login e autorização são verificados novamente no servidor; uma conta inativada perde acesso às sessões existentes. A redefinição de senha revoga as sessões da conta.

### Sessões e proteção do login

- Senhas com scrypt, salt aleatório por conta e custo `N=32768`, `r=8`, `p=1`.
- Tokens de sessão opacos; somente o hash do token fica no banco.
- Cookie `HttpOnly`, `SameSite=Strict` e `Secure` em HTTPS.
- Validade absoluta de 12 horas e expiração após 2 horas de inatividade.
- Mutações autenticadas exigem token CSRF e origem válida.
- Limite inicial de 5 tentativas por conta e 30 por IP em uma janela de 15 minutos. Tentativas bem-sucedidas não acumulam falhas de IP.
- Alterações de senhas em lote são limitadas a 100 contas por solicitação e têm as permissões verificadas antes do cálculo dos hashes.
- Atribuição de perfis e administração de contas com poder de GPO exigem permissão de administrar GPO, inclusive quando a conta administrativa está inativa.
- Um administrador de workspace não redefine a identidade de contas vinculadas também a outros workspaces. A própria pessoa pode trocar sua senha pela ação autenticada que exige a senha atual.

## 4. Backup online

```sh
npm run backup -- /caminho/novo/backup
```

O comando usa `DATA_DIR` para localizar a instalação. Se o destino for omitido, cria `DATA_DIR/backups/<instante-UTC>`.

O resultado contém:

- `fluxos.sqlite`, obtido pela API de backup do SQLite;
- `attachments/`, com os arquivos persistidos;
- `manifest.json`, com data, tamanho e SHA-256 de cada arquivo.

O banco é verificado com `integrity_check` e `foreign_key_check`. A operação pode ocorrer com a aplicação funcionando: os blobs são imutáveis e a exclusão operacional é lógica. Arquivos temporários de upload não integram o backup. Um diretório de destino existente é recusado.

No Docker:

```sh
docker compose exec fluxosvisual node scripts/backup.mjs
```

O comando informa o caminho criado. Copie essa pasta para o destino durável escolhido para backups. Manter a única cópia no mesmo volume da aplicação não protege contra perda desse volume. Os scripts não removem backups automaticamente; a retenção deve ser definida pela empresa.

## 5. Restaurar sem sobrescrever a instalação

Pare o serviço antes de iniciar a recuperação e mantenha-o parado até concluir a troca de `DATA_DIR`. Nenhum processo deve usar o diretório de destino durante a restauração. Se a instalação anterior ainda estiver disponível, faça também um backup final após interromper as gravações. A recuperação volta ao instante do backup escolhido; registros posteriores a esse instante não serão incorporados automaticamente.

Com Node.js, encerre o processo iniciado por `npm start` (ou pare a unidade do seu gerenciador de serviços), depois execute:

```sh
npm run restore -- /caminho/do/backup /caminho/novo/dados-restaurados
```

A restauração exige um diretório de destino **novo ou vazio**. Antes de copiar, valida o manifesto, todos os hashes, a integridade do SQLite e suas referências. Arquivos fora dos caminhos previstos e links simbólicos são recusados.

O processo prepara a nova instalação em um diretório temporário e só a disponibiliza ao concluir a cópia. Sessões antigas são revogadas e um evento registra a restauração. Todas as pessoas deverão entrar novamente.

Após o comando concluir, ajuste `DATA_DIR` no `.env` para o caminho restaurado e inicie com `npm start`. Se houver uma variável `DATA_DIR` exportada no terminal ou no gerenciador de serviços, atualize-a também, pois ela tem precedência sobre o arquivo.

Com Docker, este exemplo utiliza um backup externo montado somente para leitura e restaura em um diretório novo dentro do volume persistente:

```sh
docker compose stop fluxosvisual
docker compose run --rm --volume /caminho/do/backup:/backup:ro fluxosvisual node scripts/restore.mjs /backup /var/lib/fluxosvisual/restaurado
```

O diretório de backup do host precisa permitir leitura pelo UID/GID 1000 do container. Se o backup já estiver no volume da aplicação, omita `--volume` e use seu caminho completo em `/var/lib/fluxosvisual/backups/` como primeiro argumento do script.

Com o serviço ainda parado, altere `environment.DATA_DIR` em `compose.yaml` para `/var/lib/fluxosvisual/restaurado`, mantendo o volume montado em `/var/lib/fluxosvisual`. Em seguida:

```sh
docker compose up -d
docker compose ps
```

Verifique a rota de saúde, entre novamente e confira os dados restaurados. Preserve a instalação anterior até confirmar a recuperação. Não execute `docker compose down --volumes` durante esse procedimento: esse comando remove o volume persistente.

## 6. Atualizar a aplicação

Faça backup antes de atualizar. Com Node, instale as dependências bloqueadas pelo `package-lock.json`, compile e reinicie o processo com o mesmo `DATA_DIR`. Com Docker, recompile a imagem e recrie o serviço mantendo o volume:

```sh
docker compose build
docker compose up -d
```

As migrações de esquema são idempotentes. O setup não precisa ser repetido para cada atualização.

## 7. Hospedagem e decisões operacionais

O link GitHub Pages existente hospeda arquivos estáticos. Para autenticação, persistência compartilhada e anexos, esta versão precisa de um processo Node.js ou container com volume persistente. A publicação do backend depende do servidor/serviço de hospedagem e da URL escolhidos para essa instalação.

Não existe serviço externo de e-mail, armazenamento de objetos ou varredura antimalware conectado automaticamente. As credenciais e políticas desses serviços, quando adotados, precisam ser configuradas pela organização. Os limites de anexos e a política de retenção devem ser ratificados antes de uso empresarial amplo.

Referência técnica do backup online: [documentação oficial do Node.js 24 — SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html#sqlitebackupsourceDb-path-options).
