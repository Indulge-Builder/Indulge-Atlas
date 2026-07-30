# Indulge Academy — Android shell

A Capacitor WebView that opens straight into
`https://indulge-atlas.vercel.app/academy`.

## Why it's a shell, not a bundled app

Academy cannot be packaged into the APK. It is server-dependent by design:

- five pages are `force-dynamic` RSC
- every mutation is a Next.js **server action** (`startAcademySession`,
  `submitTicketUpdate`, `sendClientReminder`, …)
- `getAuthUser()` reads cookies **server-side**
- the persona stream, the Opus evaluator and the ticket reviewer are
  **server-side Anthropic calls** — that API key must never reach a device
- `lib/actions/academy.ts` makes 25 service-role Supabase reads

`next build` with `output: 'export'` fails outright on server actions and dynamic
RSC, so there is no static bundle to ship. The APK is therefore a native
container around the deployed app: real icon, real launcher entry, own window,
no browser chrome — but it needs a connection, and all logic stays on the server.

`mobile/www/` is Capacitor's required `webDir` and holds **only** an offline
fallback page, shown when the device cannot reach the server.

---

## Prerequisites (not installed on this machine)

`npm run apk:debug` needs a JVM and the Android SDK. Neither is present here —
`java`, `gradle`, `sdkmanager` and `ANDROID_HOME` are all missing — which is why
the `.apk` has not been produced yet. Everything else is done and committed.

1. **JDK 17** — Temurin 17 is the safe choice for Android Gradle Plugin 8.x.
   ```
   winget install EclipseAdoptium.Temurin.17.JDK
   ```
2. **Android SDK** — either Android Studio (simplest, bundles the SDK) or just
   the command-line tools.
3. **Environment** — set these for your shell, then reopen it:
   ```
   JAVA_HOME    = C:\Program Files\Eclipse Adoptium\jdk-17...
   ANDROID_HOME = C:\Users\<you>\AppData\Local\Android\Sdk
   ```
4. **Accept licences** once:
   ```
   %ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat --licenses
   ```

Verify with `java -version` and `sdkmanager --list`.

---

## Building

```bash
npm run apk:debug      # sync + assembleDebug
```

Output:

```
mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Sideload it: enable **Install unknown apps** on the device, transfer the file,
tap it. Or with a cable and `adb`:

```bash
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run apk:open` opens the project in Android Studio instead, which is easier
for emulator runs and signing.

### Release builds

`npm run apk:release` produces an **unsigned** APK — Android will refuse to
install it. Signing needs a keystore:

```bash
keytool -genkey -v -keystore indulge-academy.keystore \
  -alias academy -keyalg RSA -keysize 2048 -validity 10000
```

Then add `signingConfigs` to `mobile/android/app/build.gradle` and reference it
from the `release` buildType. **Keep the keystore out of git** — losing it means
never being able to update the app on Play Store under the same identity.

---

## Pointing a build somewhere else

`capacitor.config.ts` reads `CAP_SERVER_URL`:

```bash
# a preview deployment
CAP_SERVER_URL=https://<preview>.vercel.app/academy npm run apk:debug

# a dev server on the same network — use the LAN IP, not localhost:
# on the device, localhost is the device
CAP_SERVER_URL=http://192.168.1.20:3000/academy npm run apk:debug
```

A plain-`http` target automatically enables `cleartext` and
`allowMixedContent`; an `https` target leaves both off.

---

## Things worth knowing

**Navigation is scoped.** `allowNavigation` permits only
`indulge-atlas.vercel.app`, `*.vercel.app` and `*.supabase.co`. Any other link
opens in the real browser instead of inside the shell — otherwise a link pasted
into a conversation would render wearing Academy's chrome and carrying its
session cookie.

**Auth works normally.** Supabase sets standard cookies and the WebView keeps
them, so `/academy/login` behaves as it does on the web and the session
persists between launches.

**Fixed a generated defect.** The scaffold's `styles.xml` referenced
`@color/colorPrimary`, `colorPrimaryDark` and `colorAccent` without defining
them anywhere — `assembleDebug` would have failed on missing resources. They are
now in `res/values/colors.xml` using the Atlas palette.

**The launcher icon is a vector.** `res/drawable/ic_academy_foreground.xml` is a
mortarboard matching the app's own nav icon, on the `#1A1814` shell — no
per-density PNGs to regenerate.

**Re-sync after config changes.** `npm run cap:sync` copies
`capacitor.config.ts` and `mobile/www/` into the native project. The build
scripts already do this first.
