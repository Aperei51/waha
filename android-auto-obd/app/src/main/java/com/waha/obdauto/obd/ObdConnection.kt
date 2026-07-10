package com.waha.obdauto.obd

/**
 * Transport-agnostic connection to an ELM327-compatible OBD2 adapter.
 * Implemented by [BluetoothObdConnection] and [WifiObdConnection].
 *
 * All calls are blocking and must run off the main thread.
 */
interface ObdConnection {

    /** Opens the underlying socket. Throws on failure. */
    fun connect()

    /**
     * Sends a single command (a newline terminator is appended automatically)
     * and returns the adapter's raw text response, up to the ELM327 '>' prompt.
     */
    fun transceive(command: String): String

    /** Closes the socket. Safe to call multiple times. */
    fun close()
}
