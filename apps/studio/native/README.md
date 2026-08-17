# My Studio — wrapper nativo (iOS + Android)

Este é o projeto Capacitor que embrulha o `my-studio.html` numa app nativa,
pronta a abrir no Xcode (iOS) e no Android Studio (Android). Gerei e
configurei tudo o que dava para fazer sem essas ferramentas — o que falta
só pode ser feito nelas, por ti.

## O que já está feito e verificado

- ✅ Projetos `ios/` e `android/` gerados e sincronizados
- ✅ Ícones nativos em todos os tamanhos exigidos (iOS: 1024×1024 universal;
  Android: 5 densidades × quadrado, redondo e "adaptativo")
- ✅ Cor de fundo do ícone adaptativo Android ajustada à marca (`#0A0A0A`)
- ✅ Permissões de câmara/galeria configuradas no `Info.plist` (iOS) e
  `AndroidManifest.xml` (Android) — sem isto, a app **rebentava** ao tentar
  tirar uma foto
- ✅ `npx cap sync` corrido sem erros nos dois projetos

## O que NÃO consegui fazer aqui (e porquê)

- **Compilar a app** — o Gradle (Android) precisa de descarregar de
  `services.gradle.org`, que este ambiente não consegue alcançar (confirmei:
  erro 403). O Xcode (iOS) só existe em macOS, que não está disponível aqui
  de todo. Isto só se resolve na tua máquina.
- **Testar num dispositivo/simulador real** — por isso há 3 pontos que
  preciso que confirmes assim que compilares (ver secção "Testar primeiro").

## Antes de tudo: 3 coisas que só tu decides

1. **App ID definitivo** — está como `com.mystudio.app` (placeholder). Muda
   para algo que controlas, ex.: `com.<teudominio>.mystudio`, em
   `capacitor.config.ts` E dentro do Xcode/Android Studio (não basta mudar
   o ficheiro de config depois de gerado — ver abaixo).
2. **Nome de exibição** — está "My Studio" em todo o lado; muda se quiseres
   outro nome comercial.
3. **Versão** — ambos os projetos começam em `1.0`.

## Passos seguintes — iOS (precisas de um Mac)

1. Instala o [Xcode](https://apps.apple.com/app/xcode/id497799835) (grátis,
   App Store) e cria uma conta [Apple Developer](https://developer.apple.com/programs/)
   (99€/ano).
2. `npm install` nesta pasta (instala as dependências do Capacitor).
3. `npx cap open ios` — abre o projeto no Xcode.
4. No Xcode: seleciona o projeto → separador "Signing & Capabilities" →
   escolhe a tua equipa de developer → confirma o Bundle Identifier.
5. Liga um iPhone por USB (ou usa o simulador) e carrega em ▶ para testar.
6. Quando estiver pronto: Product → Archive → Distribute App → App Store
   Connect, e segue o assistente.

## Passos seguintes — Android

1. Instala o [Android Studio](https://developer.android.com/studio) (grátis)
   e cria uma conta [Google Play Console](https://play.google.com/console/)
   (25$, pagamento único).
2. `npm install` nesta pasta.
3. `npx cap open android` — abre o projeto no Android Studio.
4. Deixa o Android Studio descarregar o Gradle e o SDK automaticamente
   (é aqui que este ambiente ficava bloqueado — no teu computador funciona
   normalmente).
5. Testa num emulador ou num telemóvel Android por USB (▶ Run).
6. Build → Generate Signed Bundle/APK → segue o assistente para criar a
   chave de assinatura (guarda-a bem — perde-la impede atualizações futuras
   à app).
7. Sobe o `.aab` gerado à Google Play Console.

## Testar primeiro — 3 pontos de risco genuíno

A app foi construída como página web, com funcionalidades que dependem de
APIs do browser. Dentro do wrapper nativo, o comportamento pode ser
diferente — testa isto logo no início, antes de gastares tempo a preparar
a loja:

1. **Descarregar PNG / ZIP / PDF** — usa APIs de download do browser
   (`<a download>`). Dentro da WebView nativa pode não guardar como
   esperado. Se não funcionar bem, a correção é adicionar os plugins
   oficiais `@capacitor/filesystem` + `@capacitor/share` para guardar
   ficheiros de forma nativa — não implementei isto agora porque não
   conseguia testar se era mesmo necessário.
2. **"Escolher pasta" (Google Drive/Dropbox/OneDrive sincronizados)** —
   usa a File System Access API, que **não existe** em WebViews nativas
   (nem no Safari/iOS, nem garantidamente no Android). Vai mostrar o aviso
   "browser não suportado" e cair para o upload normal — o que é o
   comportamento correto, só confirma que não achas isto confuso para
   quem usar a app nativa.
3. **Partilhar (Web Share API)** — deve funcionar em Android; em iOS dentro
   de uma WebView Capacitor pode precisar do plugin `@capacitor/share`
   para abrir a folha de partilha nativa em vez de cair para download.

## Estrutura desta pasta

```
capacitor.config.ts   — configuração central (nome, app ID, cores)
package.json           — dependências do Capacitor
www/                    — cópia da app web (index.html = my-studio.html)
ios/                    — projeto Xcode completo
android/                — projeto Android Studio completo
```

**Nota:** `www/` é uma cópia estática. Se atualizares o `my-studio.html`
original, tens de copiar o novo ficheiro para `www/index.html` e correr
`npx cap sync` outra vez antes de recompilar.
