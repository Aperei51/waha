package com.waha.obdauto.car

import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

/**
 * Android Auto entry point declared in the manifest. Android Auto binds to this
 * service and renders the templates returned by [DashboardScreen].
 */
class ObdCarAppService : CarAppService() {

    override fun createHostValidator(): HostValidator {
        // ALLOW_ALL is what lets a side-loaded / self-signed debug build appear
        // on the head unit while developing. For a production build you would
        // restrict this to the official Android Auto host signatures instead.
        return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
    }

    override fun onCreateSession(): Session = ObdSession()
}
