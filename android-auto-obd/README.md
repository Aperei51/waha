# OBD2 Auto — dados do carro no Android Auto

App **nativo de Android Auto** que lê os dados OBD2 do veículo (via adaptador
ELM327, Bluetooth ou Wi-Fi) e mostra na tela do carro — rotação, velocidade,
temperatura do motor, carga, acelerador, etc. É o mesmo protocolo que o Torque
Pro usa, mas empacotado como um app que o Android Auto aceita de verdade.

> **Por que não é o Torque modificado?** O Android Auto só roda apps que usam os
> *templates* oficiais dele (listas, painéis) e de categorias aprovadas. A
> interface do Torque (mostradores desenhados por ele mesmo) é incompatível com
> esse modelo — não há como "patchar" o APK do Torque para virar um app de
> Android Auto. Este projeto resolve o objetivo real (ver os dados do carro na
> tela) por um caminho que funciona.

---

## Pré-requisitos

- **Android Studio** (Hedgehog ou mais novo) — ele baixa o Android SDK sozinho.
- Um **adaptador OBD2 ELM327** (Bluetooth ou Wi-Fi) já pareado/conectado ao
  celular e testado.
- Celular Android com **Android Auto** instalado.

## 1. Compilar o app

```bash
# abra a pasta android-auto-obd/ no Android Studio (File > Open) e deixe o
# Gradle sincronizar; ou, por linha de comando com o SDK instalado:
cd android-auto-obd
./gradlew assembleDebug
# o APK sai em app/build/outputs/apk/debug/app-debug.apk
```

Instale no celular via Android Studio (botão Run ▶) ou:

```bash
./gradlew installDebug        # com o celular conectado por USB e depuração ativa
```

## 2. Configurar o adaptador (app no celular)

Abra o app **OBD2 Auto** no celular:

1. Conceda a permissão de **Bluetooth** quando pedir.
2. Escolha **Bluetooth** (e selecione o adaptador pareado) ou **Wi-Fi**
   (informe IP e porta — o padrão dos ELM327 Wi-Fi é `192.168.0.10:35000`).
3. Toque em **Salvar configuração**.
4. Com o **carro na ignição**, toque em **Testar conexão agora**. Se aparecer
   "Conexão OK" com valores (rotação, temperatura...), o adaptador está OK.
   - Se falhar aqui, o problema é adaptador/pareamento — resolva antes de ir ao
     carro. Se o Torque também não lê, o problema não é este app.

## 3. Liberar o app no Android Auto (modo desenvolvedor)

Como é um app *sideloaded* (não vem da Play Store), o Android Auto precisa estar
em modo desenvolvedor **uma única vez**:

1. Abra o app **Android Auto** (nas versões novas, fica em
   *Configurações do Android > Apps > Configurações de apps conectados > Android
   Auto*).
2. Role até **Versão** e toque **10 vezes** para virar desenvolvedor.
3. No menu **⋮ > Configurações do desenvolvedor**, ative
   **"Fontes desconhecidas"** (*Unknown sources*).
   - Se essa opção **não aparecer** (o Google removeu em versões recentes), veja
     "Solução de problemas" abaixo.

## 4. Testar no carro (o teste que vale)

Não dá para testar isso num emulador de forma confiável — o teste real é este:

1. Conecte o celular ao carro (cabo ou sem fio) e abra o **Android Auto**.
2. Na grade de apps do carro, abra **OBD2 Auto**.
3. Com o **carro ligado (parado, freio de mão)**, confirme que os valores
   aparecem e **atualizam ao vivo** — acelere levemente e veja a rotação subir.
4. Só depois, em uso normal, valide com segurança.

Opcional: para testar sem carro, use a **Desktop Head Unit (DHU)** do Android
Studio (`SDK > extras > Android Auto Desktop Head Unit`) com o celular ligado a
um adaptador ELM327 num simulador OBD2.

---

## Solução de problemas

- **"Fontes desconhecidas" não aparece:** o Google removeu o botão em versões
  recentes do Android Auto. Contorno usado pela comunidade: instalar uma versão
  mais antiga do Android Auto (onde o toggle existe) e desativar a atualização
  automática dela na Play Store. Confirme o método atual para a sua versão em
  `r/AndroidAuto` (Reddit) ou no XDA.
- **App não aparece na grade do carro:** confirme que o modo desenvolvedor +
  fontes desconhecidas estão ativos, e reinicie o Android Auto (desconectar e
  reconectar o celular).
- **Conecta mas sem dados:** ignição precisa estar ligada; alguns PIDs não
  existem em todo carro (os que faltarem simplesmente não aparecem).
- **Bluetooth não conecta:** o adaptador precisa estar **pareado** no Android
  antes; este app só usa adaptadores já pareados.

## Estrutura do código

| Arquivo | Função |
|---|---|
| `car/ObdCarAppService.kt` | Ponto de entrada do Android Auto. |
| `car/ObdSession.kt` | Cria a tela do painel. |
| `car/DashboardScreen.kt` | Painel ao vivo (poll ~1x/s + templates). |
| `obd/ObdManager.kt` | Conexão única + últimas leituras. |
| `obd/ObdPids.kt` | PIDs OBD2 e fórmulas (SAE J1979). |
| `obd/BluetoothObdConnection.kt` / `WifiObdConnection.kt` | Transportes ELM327. |
| `MainActivity.kt` | Tela do celular: permissões + configuração + teste. |

## Aviso

Feito para uso responsável (carro parado / passageiro / diagnóstico). Não
manipule dados na tela enquanto dirige.
