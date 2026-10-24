package br.org.abrajeep.painelauto.car

import androidx.car.app.CarContext
import androidx.car.app.CarToast
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarIcon
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.core.graphics.drawable.IconCompat
import br.org.abrajeep.painelauto.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Tela inicial exibida na central multimídia. */
class MainScreen(carContext: CarContext) : Screen(carContext) {

    private var contador = 0

    override fun onGetTemplate(): Template {
        val agora = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("pt", "BR")).format(Date())

        val itens = ItemList.Builder()
            .addItem(
                Row.Builder()
                    .setTitle("Boas-vindas")
                    .addText("Abrir mensagem de boas-vindas")
                    .setBrowsable(true)
                    .setOnClickListener { screenManager.push(WelcomeScreen(carContext)) }
                    .build()
            )
            .addItem(
                Row.Builder()
                    .setTitle("Contador")
                    .addText("Toques: $contador")
                    .setOnClickListener {
                        contador++
                        // Pede ao Android Auto para redesenhar a tela com o novo valor.
                        invalidate()
                    }
                    .build()
            )
            .addItem(
                Row.Builder()
                    .setTitle("Data e hora")
                    .addText("Atualizado em $agora")
                    .setOnClickListener { invalidate() }
                    .build()
            )
            .addItem(
                Row.Builder()
                    .setTitle("Sobre o aplicativo")
                    .addText("Versão e informações")
                    .setBrowsable(true)
                    .setOnClickListener { screenManager.push(AboutScreen(carContext)) }
                    .build()
            )
            .build()

        val acaoInfo = Action.Builder()
            .setIcon(
                CarIcon.Builder(IconCompat.createWithResource(carContext, R.drawable.ic_info)).build()
            )
            .setOnClickListener {
                CarToast.makeText(carContext, "Painel Auto conectado!", CarToast.LENGTH_SHORT).show()
            }
            .build()

        return ListTemplate.Builder()
            .setTitle("Painel Auto")
            .setHeaderAction(Action.APP_ICON)
            .setActionStrip(ActionStrip.Builder().addAction(acaoInfo).build())
            .setSingleList(itens)
            .build()
    }
}
