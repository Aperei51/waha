plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "br.org.abrajeep.painelauto"
    compileSdk = 35

    defaultConfig {
        applicationId = "br.org.abrajeep.painelauto"
        // A Car App Library exige no mínimo Android 6.0 (API 23).
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    // Biblioteca oficial do Google para apps de Android Auto (templates de carro).
    implementation("androidx.car.app:app:1.4.0")
}
