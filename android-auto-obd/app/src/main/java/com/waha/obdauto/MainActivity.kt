package com.waha.obdauto

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.waha.obdauto.databinding.ActivityMainBinding
import com.waha.obdauto.obd.ObdManager
import com.waha.obdauto.obd.ObdPids
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.lifecycle.lifecycleScope

/**
 * Phone-side companion screen. It exists only to (1) obtain the Bluetooth
 * runtime permission and (2) let the user pick their adapter. The actual live
 * dashboard runs on the car via [com.waha.obdauto.car.DashboardScreen].
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var pairedMacs: List<String> = emptyList()

    private val requestPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { populatePairedDevices() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.modeGroup.setOnCheckedChangeListener { _, _ -> updateModeVisibility() }
        binding.saveButton.setOnClickListener { save() }
        binding.testButton.setOnClickListener { testConnection() }

        binding.hostField.setText(Config.wifiHost(this))
        binding.portField.setText(Config.wifiPort(this).toString())
        if (Config.mode(this) == Config.MODE_WIFI) {
            binding.radioWifi.isChecked = true
        }
        updateModeVisibility()

        ensureBluetoothPermission()
    }

    private fun updateModeVisibility() {
        val bt = binding.radioBluetooth.isChecked
        binding.deviceSpinner.visibility = if (bt) View.VISIBLE else View.GONE
        binding.hostField.visibility = if (bt) View.GONE else View.VISIBLE
        binding.portField.visibility = if (bt) View.GONE else View.VISIBLE
    }

    private fun ensureBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val needed = arrayOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
            ).filter {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
            if (needed.isNotEmpty()) {
                requestPermissions.launch(needed.toTypedArray())
                return
            }
        }
        populatePairedDevices()
    }

    @SuppressLint("MissingPermission")
    private fun populatePairedDevices() {
        val adapter = BluetoothAdapter.getDefaultAdapter()
        val bonded = try {
            adapter?.bondedDevices?.toList() ?: emptyList()
        } catch (_: SecurityException) {
            emptyList()
        }
        pairedMacs = bonded.map { it.address }
        val labels = bonded.map { "${it.name ?: "?"} (${it.address})" }
        binding.deviceSpinner.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item,
            labels.ifEmpty { listOf("Nenhum dispositivo pareado") }
        )
        // Preselect the previously saved adapter.
        Config.btMac(this)?.let { saved ->
            val idx = pairedMacs.indexOf(saved)
            if (idx >= 0) binding.deviceSpinner.setSelection(idx)
        }
    }

    private fun save() {
        if (binding.radioBluetooth.isChecked) {
            val idx = binding.deviceSpinner.selectedItemPosition
            val mac = pairedMacs.getOrNull(idx)
            if (mac == null) {
                setStatus("Selecione um dispositivo Bluetooth pareado primeiro.")
                return
            }
            Config.saveBluetooth(this, mac)
            setStatus("Salvo (Bluetooth: $mac). Abra o app no Android Auto.")
        } else {
            val host = binding.hostField.text.toString().trim()
            val port = binding.portField.text.toString().trim().toIntOrNull() ?: 35000
            if (host.isEmpty()) {
                setStatus("Informe o IP do adaptador Wi-Fi.")
                return
            }
            Config.saveWifi(this, host, port)
            setStatus("Salvo (Wi-Fi: $host:$port). Abra o app no Android Auto.")
        }
    }

    /** Connects once and reads a few PIDs so the user can verify wiring before driving. */
    private fun testConnection() {
        save()
        if (!Config.isConfigured(this)) return
        setStatus("Conectando ao adaptador...")
        lifecycleScope.launch {
            val summary = withContext(Dispatchers.IO) {
                ObdManager.disconnect()
                if (!ObdManager.ensureConnected(this@MainActivity)) {
                    return@withContext "Falha: ${ObdManager.lastError ?: "não conectado"}"
                }
                ObdManager.refresh(this@MainActivity)
                val lines = ObdPids.ALL.mapNotNull { pid ->
                    ObdManager.readings[pid.key]?.let { "${pid.label}: $it" }
                }
                ObdManager.disconnect()
                if (lines.isEmpty()) {
                    "Conectado, mas nenhum dado. Verifique se a ignição está ligada."
                } else {
                    "Conexão OK:\n" + lines.joinToString("\n")
                }
            }
            setStatus(summary)
        }
    }

    private fun setStatus(text: String) {
        binding.statusText.text = text
    }
}
