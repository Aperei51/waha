package com.waha.obdauto

import android.content.Context

/** Persisted OBD2 adapter configuration, shared between the phone UI and the car app. */
object Config {

    const val MODE_BLUETOOTH = "bluetooth"
    const val MODE_WIFI = "wifi"

    private const val PREFS = "obd_config"
    private const val KEY_MODE = "mode"
    private const val KEY_BT_MAC = "bt_mac"
    private const val KEY_WIFI_HOST = "wifi_host"
    private const val KEY_WIFI_PORT = "wifi_port"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun mode(context: Context): String =
        prefs(context).getString(KEY_MODE, MODE_BLUETOOTH) ?: MODE_BLUETOOTH

    fun btMac(context: Context): String? =
        prefs(context).getString(KEY_BT_MAC, null)

    fun wifiHost(context: Context): String =
        prefs(context).getString(KEY_WIFI_HOST, "192.168.0.10") ?: "192.168.0.10"

    fun wifiPort(context: Context): Int =
        prefs(context).getInt(KEY_WIFI_PORT, 35000)

    fun isConfigured(context: Context): Boolean = when (mode(context)) {
        MODE_BLUETOOTH -> !btMac(context).isNullOrBlank()
        MODE_WIFI -> wifiHost(context).isNotBlank()
        else -> false
    }

    fun saveBluetooth(context: Context, mac: String) {
        prefs(context).edit()
            .putString(KEY_MODE, MODE_BLUETOOTH)
            .putString(KEY_BT_MAC, mac)
            .apply()
    }

    fun saveWifi(context: Context, host: String, port: Int) {
        prefs(context).edit()
            .putString(KEY_MODE, MODE_WIFI)
            .putString(KEY_WIFI_HOST, host)
            .putInt(KEY_WIFI_PORT, port)
            .apply()
    }
}
