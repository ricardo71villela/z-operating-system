#!/usr/bin/env bash
# .devcontainer/setup-android-sdk.sh — instala o SDK Android por linha de
# comandos (sem Android Studio) num Codespace do GitHub.
#
# Isto NÃO corre no ambiente onde este repositório foi preparado — nesse
# ambiente, dl.google.com e repo.maven.apache.org estão bloqueados pela rede
# (confirmei isso diretamente, com erros 403 reais, antes de escrever este
# script). Um Codespace do GitHub tem acesso de rede normal, por isso este
# passo deve funcionar sem essa limitação — mas nunca correu de ponta a
# ponta ainda. Se falhar nalgum passo, a mensagem de erro exata é o que
# preciso para corrigir.

set -e

ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
COMPILE_SDK=36   # tem de bater certo com compileSdkVersion em native/android/variables.gradle
BUILD_TOOLS=36.0.0

echo "→ A instalar o SDK Android em: $ANDROID_HOME"
mkdir -p "$ANDROID_HOME/cmdline-tools"
cd /tmp

# descobre o URL atual dos command-line tools em vez de depender de um número
# de versão fixo no script — esses números mudam com regularidade, e um valor
# hardcoded ficaria desatualizado (confirmei isto: a versão que tinha posto
# aqui inicialmente, 11076708, já não era a mais recente ao verificar).
TOOLS_URL=$(curl -sSL https://developer.android.com/studio | grep -o 'https://dl.google.com/android/repository/commandlinetools-linux-[0-9]*_latest.zip' | head -1)
if [ -z "$TOOLS_URL" ]; then
  echo "⚠️  Não consegui descobrir o URL automaticamente — a usar uma versão de recurso conhecida."
  TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
fi
echo "→ A descarregar: $TOOLS_URL"
curl -sSL "$TOOLS_URL" -o cmdline-tools.zip
unzip -q cmdline-tools.zip -d "$ANDROID_HOME/cmdline-tools"
# o sdkmanager espera a estrutura cmdline-tools/latest/bin/..., não cmdline-tools/cmdline-tools/bin/...
mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
rm cmdline-tools.zip

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "→ A aceitar as licenças do SDK (obrigatório antes de instalar pacotes)"
yes | sdkmanager --licenses > /dev/null 2>&1 || true

echo "→ A instalar platform-tools, platform ${COMPILE_SDK}, build-tools ${BUILD_TOOLS}"
sdkmanager "platform-tools" "platforms;android-${COMPILE_SDK}" "build-tools;${BUILD_TOOLS}"

# torna isto permanente para novos terminais dentro do Codespace
{
  echo "export ANDROID_HOME=$ANDROID_HOME"
  echo "export ANDROID_SDK_ROOT=$ANDROID_HOME"
  echo "export PATH=\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$PATH"
} >> ~/.bashrc

echo "✅ SDK Android instalado. Para compilar:"
echo "   cd native/android && ./gradlew assembleDebug"
echo "   O .apk fica em native/android/app/build/outputs/apk/debug/"
