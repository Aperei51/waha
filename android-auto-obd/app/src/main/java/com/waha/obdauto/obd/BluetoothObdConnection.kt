package com.waha.obdauto.obd

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import java.io.IOException
import java.util.UUID

/**
 * ELM327 over Bluetooth SPP (RFCOMM). Requires the BLUETOOTH_CONNECT runtime
 * permission (granted from [com.waha.obdauto.MainActivity] before use).
 *
 * @param macAddress the MAC of the already-paired OBD2 adapter.
 */
class BluetoothObdConnection(private val macAddress: String) : ObdConnection {

    // Standard Serial Port Profile UUID.
    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    private var socket: BluetoothSocket? = null

    @SuppressLint("MissingPermission")
    override fun connect() {
        val adapter = BluetoothAdapter.getDefaultAdapter()
            ?: throw IOException("Bluetooth não disponível neste dispositivo")
        if (!adapter.isEnabled) throw IOException("Bluetooth desligado")

        val device: BluetoothDevice = adapter.getRemoteDevice(macAddress)
        // Cancel discovery — it slows down / breaks an RFCOMM connect.
        adapter.cancelDiscovery()

        val s = device.createRfcommSocketToServiceRecord(sppUuid)
        s.connect()
        socket = s

        // ELM327 warm-up: reset, echo off, linefeeds off, spaces off, auto protocol.
        for (cmd in listOf("ATZ", "ATE0", "ATL0", "ATS0", "ATSP0")) {
            SocketObdIo.transceive(s.inputStream, s.outputStream, cmd)
        }
    }

    override fun transceive(command: String): String {
        val s = socket ?: throw IOException("Não conectado")
        return SocketObdIo.transceive(s.inputStream, s.outputStream, command)
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
