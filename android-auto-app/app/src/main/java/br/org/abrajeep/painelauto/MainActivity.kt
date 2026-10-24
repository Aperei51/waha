package br.org.abrajeep.painelauto

import android.app.Activity
import android.os.Bundle

/** Tela do celular: só explica como habilitar o app no Android Auto. */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
    }
}
