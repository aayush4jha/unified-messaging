# Orbit on phones

Orbit is one web app that installs three ways. Every install loads the same
deployment, so a website deploy updates every phone at once. Nobody has to
download a new version.

| Platform | How people install it | Cost |
| --- | --- | --- |
| **Android** | Download `Orbit.apk` from `/download`, or use "Install app" in Chrome | Free |
| **iPhone / iPad** | Safari → Share → **Add to Home Screen** (steps shown on `/download`) | Free |
| **Desktop** | Install icon in Chrome/Edge's address bar, Safari → File → Add to Dock, or just the website | Free |

**The link to share is `https://<your-domain>/download`.** It detects the device:
- Android visitors get the APK button.
- iPhone visitors get the Add to Home Screen steps. Instagram and LinkedIn in-app browsers get "Open in Safari" first.
- Desktop visitors get a QR code to scan with their phone.

## What the installed app does

- Full screen with its own icon, splash screen and app switcher entry.
- **Push notifications**, even when Orbit is closed. This needs a signed-in account plus VAPID keys on the server (see below). iPhone needs iOS 16.4+ and the Home Screen app.
- Unread count on the app icon (iOS 16.4+, Android launchers that support badges, desktop).
- **Offline**: a cached app shell opens straight into your saved inbox. Edits made offline are kept and synced when the connection returns.
- Long-press the icon for **shortcuts**: Compose, Unread, Search, Follow-ups.
- **Share → Orbit** from any Android app opens a new message with the shared text or link.
- Phone UI:
  - a bottom tab bar
  - swipe a conversation left to archive or right to toggle read
  - pull to refresh
  - swipe from the edge to go back in the iPhone app
  - larger touch targets

## Android app (APK)

The APK is a [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity): a small signed Android shell, about 1.3 MB, that opens Orbit full screen in Chrome's engine. Chrome's own push, storage and security model apply. Google's Bubblewrap tool generates it from `android/twa-manifest.template.json`.

```bash
scripts/build-android.sh orbit-example.vercel.app          # rebuild for a domain
scripts/build-android.sh orbit-example.vercel.app --bump   # new version (only when the shell changes)
```

The script writes:
- `public/downloads/orbit.apk`: the download.
- `public/downloads/android.json`: version, size and SHA-256, shown on `/download`.
- `public/.well-known/assetlinks.json`: Digital Asset Links. It proves the app and the domain belong together, so Android opens Orbit without a browser bar. If it's missing or wrong, the app still works, but with a URL bar at the top.

Commit those three files and deploy.

**Rebuild only when** the domain changes, or the icon, name, colors or shortcuts change. Web changes never need a new APK.

### The signing key

The key is created on the first build in `~/.orbit/android/`: `orbit-release.jks` and `keystore.env`. It is never committed. **Back up that folder.** Android only installs an update over an existing app if it's signed with the same key. Lose it and users have to uninstall and reinstall.

### Requirements (one-time setup on the build machine)

- JDK 17: `brew install openjdk@17`
- Android SDK command-line tools in `~/Library/Android/sdk` with `platforms;android-36` and `build-tools;36.1.0`
- Bubblewrap: `npm i --prefix ~/.orbit/tools @bubblewrap/cli@1.27.0`

### Installing it (what users see)

Android asks once to allow installs from the browser, because the app doesn't come from the Play Store. The `/download` page explains this and shows the SHA-256 so people can verify the file.

### Later: Google Play ($25 one-time)

The same project builds a Play-ready bundle, `android/app-shell/app-release-bundle.aab`.
1. Upload the bundle in the Play Console.
2. Add the Play App Signing certificate fingerprint to `ORBIT_EXTRA_ANDROID_FINGERPRINTS` when you run the build script, so the Play-signed app is trusted as well.

## iPhone and iPad

Apple doesn't allow installing apps from a file. Every native install route needs the paid Apple Developer Program ($99/year): App Store, TestFlight and ad-hoc. The free route is the Home Screen web app. It's a real app experience: full screen, its own icon, push notifications (iOS 16.4+), badges and offline.

**Later: App Store.** Join the Apple Developer Program and wrap the same site in a native shell such as Capacitor or PWABuilder's iOS package. App Review expects some native integration (for example native push), not only a website in a frame.

## Push notifications (server setup)

1. Generate keys once: `npx web-push generate-vapid-keys`.
2. Set these on the server:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - optionally `VAPID_SUBJECT` (defaults to `ORBIT_PUBLIC_URL`)
3. Apply `supabase/migrations/0008_push_subscriptions.sql`.
4. Users turn notifications on per device in **Settings → Mobile app**.

Pushes follow the same rules as in-app notifications:
- Do Not Disturb
- quiet hours, in each device's own time zone
- priority-only
- muted conversations
- per-account switches

Subscriptions are accepted only for real browser push services (FCM, Apple, Mozilla, Windows). The server sends a request to every subscription URL, so the allowlist stops anyone using it to reach internal addresses (SSRF).

Changing the VAPID keys invalidates every device's subscription. Keep them stable.

## Testing

- Unit tests (`tests/unit/mobile.test.ts`) cover:
  - device detection
  - the push-endpoint allowlist
  - quiet hours across time zones
  - share-to-draft
  - the offline outbox
- Browser tests (`tests/e2e/mobile.spec.ts`, Pixel 7 and iPhone 15 emulation) cover:
  - the tab bar
  - real touch swipes
  - the phone header menu
  - Share → Orbit
  - Settings → Mobile app
  - `/download` per device
  - axe accessibility checks on phone screens
- The service worker is only registered in production builds. To try offline mode, run `next build && next start`, open the app, turn the network off and reload.
