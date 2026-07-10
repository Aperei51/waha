package com.waha.obdauto.obd

/**
 * The set of OBD2 PIDs (mode 01) we poll and how to turn the raw bytes into a
 * human value. Formulas follow the SAE J1979 standard — the same ones Torque
 * and every other OBD2 app use.
 */
data class ObdPid(
    val key: String,
    val label: String,
    val command: String,          // e.g. "010C"
    val unit: String,
    val compute: (IntArray) -> Double,
)

object ObdPids {

    val ALL: List<ObdPid> = listOf(
        ObdPid("rpm", "Rotação", "010C", "rpm") { b -> ((b[0] * 256) + b[1]) / 4.0 },
        ObdPid("speed", "Velocidade", "010D", "km/h") { b -> b[0].toDouble() },
        ObdPid("coolant", "Temp. motor", "0105", "°C") { b -> b[0] - 40.0 },
        ObdPid("intake", "Temp. admissão", "010F", "°C") { b -> b[0] - 40.0 },
        ObdPid("throttle", "Acelerador", "0111", "%") { b -> b[0] * 100.0 / 255.0 },
        ObdPid("load", "Carga motor", "0104", "%") { b -> b[0] * 100.0 / 255.0 },
        ObdPid("maf", "Fluxo de ar", "0110", "g/s") { b -> ((b[0] * 256) + b[1]) / 100.0 },
        ObdPid("fuel", "Combustível", "012F", "%") { b -> b[0] * 100.0 / 255.0 },
    )

    /**
     * Extracts the data bytes for a mode-01 response. For command "010C" the
     * adapter replies "410C...."; we locate the "41 0C" marker and return the
     * bytes that follow, ignoring echo, whitespace and "SEARCHING..." noise.
     */
    fun parseDataBytes(command: String, raw: String): IntArray? {
        val pid = command.substring(2) // drop the "01" mode prefix
        val cleaned = raw.uppercase().replace(Regex("[^0-9A-F]"), "")
        val marker = "41$pid"
        val idx = cleaned.indexOf(marker)
        if (idx < 0) return null

        val dataHex = cleaned.substring(idx + marker.length)
        if (dataHex.length < 2) return null

        val bytes = ArrayList<Int>()
        var i = 0
        while (i + 2 <= dataHex.length) {
            val value = dataHex.substring(i, i + 2).toIntOrNull(16) ?: break
            bytes.add(value)
            i += 2
        }
        return if (bytes.isEmpty()) null else bytes.toIntArray()
    }
}
