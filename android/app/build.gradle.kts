plugins {
  id("com.android.application") version "8.10.1"
  kotlin("android") version "2.2.21"
}

android {
  namespace = "cam.atlanta.android"
  compileSdk = 35

  defaultConfig {
    applicationId = "cam.atlanta.android"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0"
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  sourceSets["androidTest"].assets.srcDir("../../tests/fixtures")
  testOptions.animationsDisabled = true
}

kotlin {
  compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
}

dependencies {
  implementation("cam.atlanta:atlanta-cam-core")
  androidTestImplementation("androidx.test:runner:1.6.2")
}
