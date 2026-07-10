package com.waha.obdauto.obd

import java.io.InputStream
import java.io.OutputStream

/**
 * Shared ELM327 request/response framing used by both transports.
 * ELM327 echoes text and terminates every response with the '>' prompt
 * character, so we read until we see it.
 */
internal object SocketObdIo {

    private const val PROMPT = '>'
    private const val READ_TIMEOUT_MS = 5_000L

    fun transceive(input: InputStream, output: OutputStream, command: String): String {
        output.write((command.trim() + "\r").toByteArray(Charsets.US_ASCII))
        output.flush()

        val sb = StringBuilder()
        val deadline = System.nanoTime() + READ_TIMEOUT_MS * 1_000_000
        while (System.nanoTime() < deadline) {
            if (input.available() > 0) {
                val c = input.read()
                if (c == -1) break
                val ch = c.toChar()
                if (ch == PROMPT) break
                sb.append(ch)
            } else {
                // Nothing buffered yet; back off briefly so we don't spin.
                Thread.sleep(4)
            }
        }
        return sb.toString()
    }
}
