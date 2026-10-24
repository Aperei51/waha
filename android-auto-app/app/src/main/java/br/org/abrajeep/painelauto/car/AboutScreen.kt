package br.org.abrajeep.painelauto.car

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.Pane
import androidx.car.app.model.PaneTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import br.org.abrajeep.painelauto.BuildConfig

/** Exemplo de PaneTemplate: lista de informações somente leitura. */
class AboutScreen(carContext: CarContext) : Screen(carContext) {

    override fun onGetTemplate(): Template {
        val pane = Pane.Builder()
            .addRow(
                Row.Builder()
                    .setTitle("Versão")
                    .addText(BuildConfig.VERSION_NAME)
                    .build()
            )
            .addRow(
                Row.Builder()
                    .setTitle("Nível da API do carro")
                    .addText(carContext.carAppApiLevel.toString())
                    .build()
            )
            .addRow(
                Row.Builder()
                    .setTitle("Tecnologia")
                    .addText("Android for Cars App Library")
                    .build()
            )
            .build()

        return PaneTemplate.Builder(pane)
            .setTitle("Sobre o aplicativo")
            .setHeaderAction(Action.BACK)
            .build()
    }
}
