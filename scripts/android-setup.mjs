// Configures the Android project that `npx cap add android` generates (run by GitHub Actions; android/ is not committed).
//  - app name "Admin EAB", package com.jslproperties.admineab (from capacitor.config.json) — separate from the main app;
//  - internet only: no location, camera, contacts or microphone (Admin EAB does not need them);
//  - the sign-in return link com.jslproperties.admineab://auth-callback opens the app (Google login);
//  - no screenshots of admin screens in the recent-apps list (FLAG_SECURE): agent data stays private;
//  - version code from the build number; debug signing with android-config/debug.keystore (same key every build,
//    so each new APK installs over the last one);
//  - black window background so there is no white flash.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const APP_ID = cfg.appId, APP_NAME = cfg.appName;
const A = 'android/app/src/main';
const must = p => { if (!existsSync(p)) throw new Error(`Missing ${p}: run "npx cap add android" first.`); return p; };
const edit = (p, fn) => { const s = readFileSync(must(p), 'utf8'); const t = fn(s); if (t !== s) writeFileSync(p, t); };

edit(`${A}/AndroidManifest.xml`, s => {
  if (!s.includes('"android.permission.INTERNET"')) s = s.replace(/<\/manifest>\s*$/, '    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>\n');
  if (!s.includes('@string/custom_url_scheme') && !s.includes(`android:scheme="${APP_ID}"`)) {
    s = s.replace(/(<activity[^>]*android:name="[^"]*MainActivity"[\s\S]*?)(<\/activity>)/, `$1
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${APP_ID}" />
            </intent-filter>
        $2`);
  }
  return s;
});

edit(`${A}/res/values/strings.xml`, s => {
  const set = (name, value) => {
    const re = new RegExp(`<string name="${name}">[^<]*</string>`);
    return re.test(s) ? s.replace(re, `<string name="${name}">${value}</string>`) : s.replace('</resources>', `    <string name="${name}">${value}</string>\n</resources>`);
  };
  for (const [k, v] of [['app_name', APP_NAME], ['title_activity_main', APP_NAME], ['package_name', APP_ID], ['custom_url_scheme', APP_ID]]) s = set(k, v);
  return s;
});

const styles = `${A}/res/values/styles.xml`;
if (existsSync(styles)) edit(styles, s => (s.includes('android:windowBackground') ? s
  : s.replace(/(<style name="AppTheme.NoActionBar"[^>]*>)/, '$1\n        <item name="android:windowBackground">@android:color/black</item>\n        <item name="android:navigationBarColor">@android:color/black</item>')));

const run = Number(process.env.GITHUB_RUN_NUMBER || 1);
edit('android/app/build.gradle', s => {
  s = s.replace(/versionCode\s+\d+/, `versionCode ${run}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}-n${pkg.nativeVersion ?? 1}"`);
  if (!s.includes('android-config/debug.keystore')) {
    s = s.replace(/android\s*\{/, `android {
    signingConfigs {
        debug {
            storeFile file('../../android-config/debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`);
  }
  return s;
});

// FLAG_SECURE: Android does not show admin screens in the recent-apps preview or allow screen recording of them.
const findMain = dir => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) { const f = findMain(p); if (f) return f; } else if (e.name === 'MainActivity.java') return p;
  }
  return null;
};
const main = existsSync(`${A}/java`) ? findMain(`${A}/java`) : null;
if (!main) throw new Error('MainActivity.java not found');
edit(main, s => {
  if (s.includes('FLAG_SECURE')) return s;
  if (!/public class MainActivity extends BridgeActivity\s*\{\s*\}/.test(s)) throw new Error(`${main} is not the plain Capacitor template; not changing it.`);
  const pkgLine = /^package [^;]+;/m.exec(s)[0];
  return `${pkgLine}

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Admin EAB shows agents' personal data: keep it out of screenshots and the recent-apps preview.
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }
}
`;
});
console.log(`Android project set: ${APP_NAME} (${APP_ID}), versionCode ${run}`);
