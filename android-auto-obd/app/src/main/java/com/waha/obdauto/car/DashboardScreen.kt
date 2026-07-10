package com.waha.obdauto.car

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.constraints.ConstraintManager
import androidx.car.app.model.Action
import androidx.car.app.model.ItemList
import androidx.car.app.model.ListTemplate
import androidx.car.app.model.Row
import androidx.car.app.model.Template
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.waha.obdauto.Config
import com.waha.obdauto.obd.ObdManager
import com.waha.obdauto.obd.ObdPids
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The live OBD2 dashboard shown on the Android Auto head unit. Polls the
 * adapter roughly once per second and re-renders the list of readings.
 */
class DashboardScreen(carContext: CarContext) : Screen(carContext), DefaultLifecycleObserver {

    private val pollScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val pollIntervalMs = 900L
    private var pollJob: Job? = null

    init {
        lifecycle.addObserver(this)
    }

    override fun onStart(owner: LifecycleOwner) {
        pollJob?.cancel()
        pollJob = pollScope.launch {
            while (isActive) {
                if (Config.isConfigured(carContext)) {
                    ObdManager.refresh(carContext)
                }
                withContext(Dispatchers.Main) { invalidate() }
                delay(pollIntervalMs)
            }
        }
    }

    override fun onStop(owner: LifecycleOwner) {
        pollJob?.cancel()
        pollJob = null
        ObdManager.disconnect()
    }

    override fun onDestroy(owner: LifecycleOwner) {
        pollScope.cancel()
    }

    override fun onGetTemplate(): Template {
        val listBuilder = ListTemplate.Builder()
            .setHeaderAction(Action.APP_ICON)
            .setTitle("OBD2 Dashboard")

        if (!Config.isConfigured(carContext)) {
            return listBuilder
                .setSingleList(messageList("Abra o app OBD2 Auto no celular e configure o adaptador."))
                .build()
        }

        val haveData = ObdManager.readings.isNotEmpty()
        if (!haveData) {
            if (ObdManager.lastError != null) {
                return listBuilder
                    .setSingleList(messageList("Falha ao conectar: ${ObdManager.lastError}"))
                    .build()
            }
            // Still establishing the connection / first poll.
            return listBuilder.setLoading(true).build()
        }

        val limit = carContext.getCarService(ConstraintManager::class.java)
            .getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST)

        val items = ItemList.Builder()
        var count = 0
        for (pid in ObdPids.ALL) {
            if (count >= limit) break
            val value = ObdManager.readings[pid.key] ?: continue
            items.addItem(
                Row.Builder()
                    .setTitle(pid.label)
                    .addText(value)
                    .build()
            )
            count++
        }

        if (count == 0) {
            return listBuilder.setLoading(true).build()
        }

        return listBuilder.setSingleList(items.build()).build()
    }

    private fun messageList(text: String): ItemList =
        ItemList.Builder()
            .addItem(
                Row.Builder()
                    .setTitle(text)
                    .build()
            )
            .build()
}
