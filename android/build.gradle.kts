plugins {
  `java-library`
  kotlin("jvm") version "2.2.21"
}

group = "cam.atlanta"

java {
  sourceCompatibility = JavaVersion.VERSION_17
  targetCompatibility = JavaVersion.VERSION_17
}

tasks.withType<JavaCompile>().configureEach {
  options.release.set(17)
}

kotlin {
  compilerOptions {
    jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    freeCompilerArgs.add("-Xjdk-release=17")
  }
}

dependencies {
  api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
  testImplementation(platform("org.junit:junit-bom:5.13.4"))
  testImplementation(kotlin("test-junit5"))
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

sourceSets.test {
  resources.srcDir("../tests/fixtures")
}

tasks.test {
  useJUnitPlatform()
}
