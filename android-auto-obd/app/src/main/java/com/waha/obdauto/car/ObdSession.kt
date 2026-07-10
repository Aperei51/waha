package com.waha.obdauto.car

import android.content.Intent
import androidx.car.app.Screen
import androidx.car.app.Session

class ObdSession : Session() {
    override fun onCreateScreen(intent: Intent): Screen = DashboardScreen(carContext)
}
