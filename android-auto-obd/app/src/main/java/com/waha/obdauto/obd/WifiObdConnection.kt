package com.waha.obdauto.obd

import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket

/**
 * ELM327 over Wi-Fi (TCP). Typical adapters expose 192.168.0.10:35000.
 */
class WifiObdConnection(
    private val host: String,
    private val port: Int,
) : ObdConnection {

    private var socket: Socket? = null

    override fun connect() {
        val s = Socket()
        s.connect(InetSocketAddress(host, port), 5_000)
        s.soTimeout = 5_000
        socket = s

        for (cmd in listOf("ATZ", "ATE0", "ATL0", "ATS0", "ATSP0")) {
            SocketObdIo.transceive(s.getInputStream(), s.getOutputStream(), cmd)
        }
    }

    override fun transceive(command: String): String {
        val s = socket ?: throw IOException("Não conectado")
        return SocketObdIo.transceive(s.getInputStream(), s.getOutputStream(), command)
    }

    override fun close() {
        try {
            socket?.close()
        } catch (_: IOException) {
        } finally {
            socket = null
        }
    }
}
