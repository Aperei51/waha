package com.waha.obdauto.obd

import android.content.Context
import com.waha.obdauto.Config
import java.util.concurrent.ConcurrentHashMap

/**
 * Owns the single OBD2 connection and the latest readings. Shared between the
 * phone UI (for the "test connection" button) and the Android Auto screen, so
 * it is a process-wide singleton guarded for thread safety.
 *
 * All methods here BLOCK on socket I/O and must be called off the main thread.
 */
object ObdManager {

    @Volatile
    var connected: Boolean = false
        private set

    @Volatile
    var lastError: String? = null
        private set

    /** key (see [ObdPids]) -> formatted value like "1980 rpm". */
    val readings: MutableMap<String, String> = ConcurrentHashMap()

    private var connection: ObdConnection? = null
    private val lock = Any()

    private fun buildConnection(context: Context): ObdConnection =
        when (Config.mode(context)) {
            Config.MODE_WIFI ->
                WifiObdConnection(Config.wifiHost(context), Config.wifiPort(context))
            else -> {
                val mac = Config.btMac(context)
                    ?: throw IllegalStateException("Nenhum dispositivo Bluetooth configurado")
                BluetoothObdConnection(mac)
            }
        }

    /** Idempotently opens the connection using the saved config. Returns true if connected. */
    fun ensureConnected(context: Context): Boolean = synchronized(lock) {
        if (connected && connection != null) return true
        return try {
            val conn = buildConnection(context)
            conn.connect()
            connection = conn
            connected = true
            lastError = null
            true
        } catch (t: Throwable) {
            lastError = t.message ?: t.javaClass.simpleName
            disconnectLocked()
            false
        }
    }

    /** Polls every PID once and updates [readings]. Reconnects on I/O failure. */
    fun refresh(context: Context) {
        if (!ensureConnected(context)) return
        val conn = connection ?: return
        synchronized(lock) {
            for (pid in ObdPids.ALL) {
                try {
                    val raw = conn.transceive(pid.command)
                    val bytes = ObdPids.parseDataBytes(pid.command, raw)
                    if (bytes != null) {
                        val value = pid.compute(bytes)
                        readings[pid.key] = format(value, pid.unit)
                    }
                } catch (t: Throwable) {
                    // Adapter dropped: mark disconnected so the next tick reconnects.
                    lastError = t.message ?: t.javaClass.simpleName
                    disconnectLocked()
                    return
                }
            }
        }
    }

    fun disconnect() = synchronized(lock) { disconnectLocked() }

    private fun disconnectLocked() {
        try {
            connection?.close()
        } catch (_: Throwable) {
        }
        connection = null
        connected = false
    }

    private fun format(value: Double, unit: String): String {
        val rounded = if (value == value.toLong().toDouble()) {
            value.toLong().toString()
        } else {
            String.format("%.1f", value)
        }
        return "$rounded $unit"
    }
}
