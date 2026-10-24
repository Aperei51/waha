package br.org.abrajeep.painelauto.car

import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Template

/** Exemplo de MessageTemplate: texto curto com botões de ação. */
class WelcomeScreen(carContext: CarContext) : Screen(carContext) {

    override fun onGetTemplate(): Template =
        MessageTemplate.Builder("Seu aplicativo está funcionando no Android Auto. Boa viagem!")
            .setTitle("Boas-vindas")
            .setHeaderAction(Action.BACK)
            .addAction(
                Action.Builder()
                    .setTitle("Obrigado")
                    .setOnClickListener {
                        CarToast.makeText(carContext, "De nada!", CarToast.LENGTH_SHORT).show()
                        screenManager.pop()
                    }
                    .build()
            )
            .build()
}
