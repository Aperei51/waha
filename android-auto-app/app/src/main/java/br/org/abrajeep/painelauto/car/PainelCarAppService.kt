package br.org.abrajeep.painelauto.car

import android.content.Intent
import androidx.car.app.CarAppService
import androidx.car.app.Screen
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator
import br.org.abrajeep.painelauto.BuildConfig

/**
 * Ponto de entrada do Android Auto. O host (app Android Auto no celular) se conecta
 * a este serviço e pede as telas que serão desenhadas na central multimídia.
 */
class PainelCarAppService : CarAppService() {

    override fun createHostValidator(): HostValidator =
        if (BuildConfig.DEBUG) {
            HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
        } else {
            // Em release, aceita apenas os hosts oficiais (Android Auto / Android Automotive).
            HostValidator.Builder(applicationContext)
                .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
                .build()
        }

    override fun onCreateSession(): Session = PainelSession()
}

class PainelSession : Session() {
    override fun onCreateScreen(intent: Intent): Screen = MainScreen(carContext)
}
