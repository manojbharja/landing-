import JSZip from 'jszip';
import type { SiteConfig } from '../types/siteConfig';
import { DEFAULT_SITE_CONFIG } from '../types/siteConfig';
import type { GeneratedIconSet } from './iconProcessor';

function generateSettingsGradle(): string {
  return `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "SHANT MATKA"
include(":app")
`;
}

function generateRootBuildGradle(): string {
  return `plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
`;
}

function generateAppBuildGradle(): string {
  return `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.shantmatka.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.shantmatka.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
}
`;
}

function generateAndroidManifestXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.ShantMatka"
        android:usesCleartextTraffic="false">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>

</manifest>
`;
}

function generateMainActivityKt(websiteUrl: string, themeColor: string, bgColor: string): string {
  let host = 'new.rajagamevip.site';
  try {
    host = new URL(websiteUrl).hostname;
  } catch {
    host = 'new.rajagamevip.site';
  }
  return `package com.shantmatka.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private val targetUrl = "${websiteUrl}"
    private val targetHost = "${host}"

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineLayout: LinearLayout

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.parseColor("${themeColor}")
        window.navigationBarColor = Color.parseColor("${bgColor}")
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        progressBar = findViewById(R.id.progressBar)
        offlineLayout = findViewById(R.id.offlineLayout)
        val retryButton: Button = findViewById(R.id.retryButton)

        // Enable cookies & session persistence for login/registration
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.setBackgroundColor(Color.parseColor("#160000"))

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
                progressBar.progress = newProgress
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                val uri = Uri.parse(url)
                val scheme = uri.scheme?.lowercase() ?: ""

                // Open UPI, tel, mailto, WhatsApp, Telegram, or external non-site links safely
                if (scheme != "http" && scheme != "https") {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        true
                    } catch (_: Exception) {
                        true
                    }
                }

                val host = uri.host?.lowercase() ?: ""
                if (host.contains(targetHost)) {
                    return false
                }

                // External HTTP(S) links open in device browser
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    true
                } catch (_: Exception) {
                    false
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                swipeRefresh.isRefreshing = false
                cookieManager.flush()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    swipeRefresh.isRefreshing = false
                    webView.visibility = View.GONE
                    offlineLayout.visibility = View.VISIBLE
                }
            }
        }

        swipeRefresh.setColorSchemeColors(Color.parseColor("#8B0000"))
        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }

        retryButton.setOnClickListener {
            offlineLayout.visibility = View.GONE
            webView.visibility = View.VISIBLE
            webView.loadUrl(targetUrl)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(targetUrl)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }
}
`;
}

function generateActivityMainXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#160000">

    <androidx.swiperefreshlayout.widget.SwipeRefreshLayout
        android:id="@+id/swipeRefresh"
        android:layout_width="match_parent"
        android:layout_height="match_parent">

        <WebView
            android:id="@+id/webView"
            android:layout_width="match_parent"
            android:layout_height="match_parent" />
    </androidx.swiperefreshlayout.widget.SwipeRefreshLayout>

    <ProgressBar
        android:id="@+id/progressBar"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="3dp"
        android:layout_gravity="top"
        android:max="100"
        android:progressTint="#F7D774"
        android:visibility="gone" />

    <LinearLayout
        android:id="@+id/offlineLayout"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:background="#160000"
        android:gravity="center"
        android:orientation="vertical"
        android:padding="28dp"
        android:visibility="gone">

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="You are offline"
            android:textColor="#FFFFFF"
            android:textSize="20sp"
            android:textStyle="bold" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_marginTop="8dp"
            android:gravity="center"
            android:text="Please check your internet connection to open SHANT MATKA."
            android:textColor="#CBD5E1"
            android:textSize="14sp" />

        <Button
            android:id="@+id/retryButton"
            android:layout_width="wrap_content"
            android:layout_height="48dp"
            android:layout_marginTop="20dp"
            android:backgroundTint="#8B0000"
            android:paddingLeft="24dp"
            android:paddingRight="24dp"
            android:text="Try Again"
            android:textColor="#FFFFFF" />
    </LinearLayout>

</FrameLayout>
`;
}

function generateStringsXml(appName: string): string {
  const escaped = appName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${escaped}</string>
</resources>
`;
}

function generateColorsXml(themeColor: string, bgColor: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="brand_primary">${themeColor}</color>
    <color name="brand_background">${bgColor}</color>
</resources>
`;
}

function generateThemesXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.ShantMatka" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:windowBackground">@color/brand_background</item>
        <item name="android:statusBarColor">@color/brand_primary</item>
        <item name="android:navigationBarColor">@color/brand_background</item>
    </style>
</resources>
`;
}

function generateReadmeBuildApk(): string {
  return `====================================================================
SHANT MATKA — Android APK Source Project
Target URL inside APK: https://new.rajagamevip.site/
====================================================================

When compiled, opening this APK immediately loads:
  https://new.rajagamevip.site/
full-screen inside a portrait Android WebView with:
  - Status bar color: #8B0000
  - Background/Splash color: #160000
  - Full cookie & login session persistence
  - Back button history support
  - External UPI / tel / WhatsApp link support
  - Offline retry screen

HOW TO BUILD THE .APK FILE IN ANDROID STUDIO:
1. Install Android Studio (https://developer.android.com/studio).
2. Extract this ZIP and click "Open" in Android Studio on this folder.
3. Wait for Gradle Sync to finish.
4. Click top menu: Build -> Generate App Bundles or APKs -> Build APK(s).
5. Locate the generated file at:
     app/build/outputs/apk/debug/app-debug.apk
   (For production release signing, use Build -> Generate Signed App Bundle / APK).
6. Rename the compiled APK to "shant-matka.apk" and upload it to your
   cPanel download website inside /downloads/shant-matka.apk.
====================================================================
`;
}

export async function buildAndroidStudioProjectZip(
  icons: GeneratedIconSet,
  config: SiteConfig = DEFAULT_SITE_CONFIG
): Promise<Blob> {
  const zip = new JSZip();
  const appName = config.appName || 'SHANT MATKA';
  const websiteUrl = config.websiteUrl || 'https://new.rajagamevip.site/';
  const themeColor = config.themeColor || '#8B0000';
  const bgColor = config.backgroundColor || '#120000';

  zip.file('settings.gradle.kts', generateSettingsGradle());
  zip.file('build.gradle.kts', generateRootBuildGradle());
  zip.file('README_BUILD_APK.txt', generateReadmeBuildApk());

  zip.file('app/build.gradle.kts', generateAppBuildGradle());
  zip.file('app/proguard-rules.pro', '# Keep rules\n');
  zip.file('app/src/main/AndroidManifest.xml', generateAndroidManifestXml());
  zip.file(
    'app/src/main/java/com/shantmatka/app/MainActivity.kt',
    generateMainActivityKt(websiteUrl, themeColor, bgColor)
  );

  zip.file('app/src/main/res/layout/activity_main.xml', generateActivityMainXml());
  zip.file('app/src/main/res/values/strings.xml', generateStringsXml(appName));
  zip.file('app/src/main/res/values/colors.xml', generateColorsXml(themeColor, bgColor));
  zip.file('app/src/main/res/values/themes.xml', generateThemesXml());

  zip.file('app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', icons.icon512Blob);
  zip.file('app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', icons.icon512MaskableBlob);
  zip.file('app/src/main/res/mipmap-xxhdpi/ic_launcher.png', icons.icon192Blob);
  zip.file('app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png', icons.icon192Blob);

  return zip.generateAsync({ type: 'blob' });
}
