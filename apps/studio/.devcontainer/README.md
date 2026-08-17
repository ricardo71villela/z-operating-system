# Compilar o Android via GitHub Codespaces

Isto existe porque o ambiente onde este repositório foi preparado tem a
rede bloqueada especificamente para os domínios de que o Android precisa
(`dl.google.com`, `repo.maven.apache.org`, `services.gradle.org` — confirmei
com erros 403 reais, não é suposição). Um Codespace do GitHub não tem essa
limitação.

## Passos

1. **Cria um repositório no GitHub** (privado, se preferires) e envia este
   projeto para lá:
   ```bash
   cd mystudio-repo
   git remote add origin https://github.com/<o-teu-utilizador>/mystudio.git
   git push -u origin master
   ```
   (o histórico de commits já existe — os 17 commits desta sessão vão todos
   juntos)

2. **Abre um Codespace**: no GitHub, no repositório, botão verde **Code** →
   separador **Codespaces** → **Create codespace on master**

3. **Espera a configuração automática** — a primeira vez demora uns
   minutos: o Codespace lê `.devcontainer/devcontainer.json`, instala
   Java 21 e Node 22, depois corre `.devcontainer/setup-android-sdk.sh`
   (descarrega o SDK Android por linha de comandos) e `npm run setup`.

4. **Compila**:
   ```bash
   npm run build:android
   ```
   O `.apk` de debug fica em `native/android/app/build/outputs/apk/debug/app-debug.apk`
   — descarrega-o do Codespace (botão direito no explorador de ficheiros →
   Download) e instala no teu telemóvel Android para testar.

## Honestidade sobre isto

Preparei isto com cuidado (confirmei as versões exatas do SDK que o projeto
precisa, validei a sintaxe do JSON e do script) mas **nunca correu de ponta
a ponta**, porque não tenho acesso a um Codespace real para testar. Se
travar nalgum passo, a mensagem de erro exata é o que preciso para
corrigir — não é uma garantia cega, é a minha melhor preparação sem
conseguir validar o resultado final.

## Sobre o iOS

Isto resolve o Android. Para iOS continua a ser preciso um Mac com Xcode —
os Codespaces do GitHub correm em Linux, não há forma de compilar para
iOS a partir daí. Os passos para o teu Mac continuam válidos e são o único
caminho para isso.
