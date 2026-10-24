# Painel Auto — app para Android Auto

Aplicativo Android que é instalado no celular e aparece na tela da central multimídia
quando o celular é conectado (por cabo ou sem fio) a um carro com **Android Auto**.

Foi construído com a biblioteca oficial do Google
[Android for Cars App Library](https://developer.android.com/training/cars/apps)
(`androidx.car.app`), que é o único caminho suportado para apps de terceiros
aparecerem no Android Auto.

## O que aparece no carro

| Tela | Template | Conteúdo |
|------|----------|----------|
| Inicial | `ListTemplate` | Boas-vindas, Contador (atualiza a cada toque), Data e hora, Sobre |
| Boas-vindas | `MessageTemplate` | Mensagem com botão de ação |
| Sobre | `PaneTemplate` | Versão do app e nível da API do carro |

No celular, o app abre uma tela com as instruções de ativação abaixo.

## 1. Obter o APK

**Opção A — GitHub Actions (sem instalar nada):** a cada push que altera `android-auto-app/`,
o workflow *Android Auto App* compila o projeto. Abra a aba **Actions** do repositório,
entre na execução mais recente e baixe o artefato `painel-auto-apk` (contém `app-debug.apk`).
Também é possível rodar manualmente em **Actions › Android Auto App › Run workflow**.

**Opção B — Android Studio:** abra a pasta `android-auto-app/` no Android Studio
(Ladybug ou mais novo) e use *Build › Build APK(s)*.

**Opção C — linha de comando** (JDK 17+ e Android SDK instalados):

```bash
cd android-auto-app
./gradlew assembleDebug
# APK gerado em app/build/outputs/apk/debug/app-debug.apk
```

## 2. Instalar no celular

Copie o `app-debug.apk` para o celular e abra o arquivo (permita "instalar apps de
fontes desconhecidas" quando o Android pedir), ou via cabo USB:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 3. Liberar o app no Android Auto (obrigatório para apps fora da Play Store)

O Android Auto só mostra no carro apps instalados pela Play Store, a menos que o modo
desenvolvedor esteja ligado com "Fontes desconhecidas":

1. No celular, abra **Configurações › Apps › Android Auto** (ou *Configurações › Dispositivos conectados › Android Auto*).
2. Role até o final e toque **7 vezes** em **Versão** até aparecer a mensagem de modo desenvolvedor.
3. Toque no menu **⋮ › Configurações do desenvolvedor** e marque **Fontes desconhecidas** (*Unknown sources*).
4. Volte e, em **Personalizar acesso rápido** / **Personalizar ícones**, confirme que o **Painel Auto** está habilitado.
5. Conecte o celular à central multimídia. O ícone **Painel Auto** aparece no menu de apps do Android Auto.

> Se o ícone não aparecer: desconecte e reconecte o celular, force a parada do app
> Android Auto e confira se "Fontes desconhecidas" continua marcado (algumas
> atualizações do Android Auto desligam essa opção).

### Testar sem carro

Instale o [Desktop Head Unit (DHU)](https://developer.android.com/training/cars/testing/dhu)
pelo SDK Manager do Android Studio (*SDK Tools › Android Auto Desktop Head Unit Emulator*), ative
*Iniciar servidor da unidade principal* no menu de desenvolvedor do Android Auto e rode:

```bash
adb forward tcp:5277 tcp:5277
$ANDROID_HOME/extras/google/auto/desktop-head-unit
```

## Estrutura

```
app/src/main/
├── AndroidManifest.xml              # declara o CarAppService e a categoria do app
├── res/xml/automotive_app_desc.xml  # informa ao Android Auto que o app usa templates
└── java/br/org/abrajeep/painelauto/
    ├── MainActivity.kt              # tela do celular (instruções)
    └── car/
        ├── PainelCarAppService.kt   # ponto de entrada do Android Auto + Session
        ├── MainScreen.kt            # tela inicial no carro
        ├── WelcomeScreen.kt
        └── AboutScreen.kt
```

## Como evoluir

- Novas telas: crie uma classe que estende `Screen`, retorne um template em
  `onGetTemplate()` e abra com `screenManager.push(...)`.
- O Android Auto aceita apenas templates prontos (listas, grades, mensagens, mapas etc.),
  sem layouts livres, para não distrair o motorista. Veja os
  [templates disponíveis](https://developer.android.com/training/cars/apps#templates).
- A categoria está como `POI` (pontos de interesse) no `AndroidManifest.xml`. Para publicar
  na Play Store, o app precisa se encaixar numa das categorias aceitas pelo Google
  (mídia, mensagens, navegação, pontos de interesse, IoT, clima etc.) e passar pela
  [revisão de qualidade para carros](https://developer.android.com/docs/quality-guidelines/car-app-quality).
- Para publicar, gere um APK/AAB de release assinado com sua própria chave
  (*Build › Generate Signed Bundle / APK* no Android Studio). Em release, o app só aceita
  conexões dos hosts oficiais do Google (veja `createHostValidator`).
