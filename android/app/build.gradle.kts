plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "app.lente"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.lente"
        minSdk = 29
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Sign-in (add-accounts 7.1): the Supabase project and Google's Web client ID. None is a secret
        // (a publishable key and a client ID ship in every app); they come from gradle.properties or
        // -P flags, and an empty value leaves sign-in off, for a laptop hub with pairing.
        fun prop(name: String) = (project.findProperty(name) as String?).orEmpty().replace("\"", "")
        buildConfigField("String", "SUPABASE_URL", "\"${prop("lente.supabaseUrl")}\"")
        buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"${prop("lente.supabasePublishableKey")}\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${prop("lente.googleWebClientId")}\"")
        // ship-hackathon 3.1: the hub a fresh install signs in to (the public Modal app), never asked for.
        buildConfigField("String", "CLOUD_HUB", "\"${prop("lente.cloudHub").ifEmpty { "https://drew-lizcano--lente-hub-hub.us-east.modal.run" }}\"")
    }
    buildTypes {
        release {
            // Shrunk and signed with the debug key: a build to sideload on the wearer's phone, not a store release.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    lint {
        // credentials-play-services-auth declares androidx.fragment 1.1.0, which resolves to 1.5.7 here;
        // this check reads the declared version, so it fires although the ActivityResult APIs are safe.
        disable += "InvalidFragmentVersionForActivityResult"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    val bom = platform("androidx.compose:compose-bom:2026.09.00")
    implementation(bom)
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:5.5.1")
    // Sign in with Google (add-accounts 7.1): the system account picker and Google's ID token type.
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20260814")
}
