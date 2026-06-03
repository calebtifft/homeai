# HomeAI

Mobile app for AI virtual staging — interior rooms, exterior facades, and wall refreshes. Each install works on its own; no sign-in required.

## Requirements

- Node.js 20+
- iOS Simulator or physical device; Android emulator or device

## Quick start

```bash
cp .env.example .env
# Add your API keys in .env (see .env.example)
npm install --legacy-peer-deps
npm start
```

Press `i` or `a` for iOS/Android, or scan the QR code with Expo Go.

## Configuration

Copy [`.env.example`](.env.example) to `.env` and fill in the values marked there. At minimum you need a staging API key for real image generation. Optional keys enable online history backup and in-app subscriptions.

Set demo mode in `.env` to test the UI without generating real images.

## Online backup (optional)

If you want staged photos saved online:

1. Create a backend project (see `.env.example` for the keys to copy).
2. Enable guest sign-in in the auth settings.
3. Create a private storage bucket.
4. Run the SQL script in [`supabase/storage-policies.sql`](supabase/storage-policies.sql).

Extra SQL files in [`supabase/`](supabase/) are only needed if you add full accounts and cross-device sync later.

## How the app works

```text
Home → Configure → Processing → Result
```

- Pick or take a photo, choose style options, then generate.
- History is saved on the device; optional online backup per install.
- Free tier: 3 staging runs per day. Pro subscription removes the limit.
- Restore purchases via Settings → Subscription plans (uses your App Store or Google Play account).

## iPhone photo check (manual)

On a **physical iPhone**:

1. Home → Interior (or Exterior / Walls) → photo step.
2. **Take photo** → wait for “Preparing photo…” → finish the steps → Generate.
3. Repeat with **Choose from library**.
4. Confirm the result screen shows your staged image.

If something fails, note the message on the processing screen and try again on a stable network.

## Store builds (TestFlight / Internal Testing)

```bash
npm install -g eas-cli
eas login
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

Build profiles are in [`eas.json`](eas.json).

Before submitting to the App Store or Google Play:

- Set your privacy, terms, and community guideline URLs in `.env` or [`constants/legalUrls.ts`](constants/legalUrls.ts).
- Configure subscription products in App Store Connect and Play Console.
- Camera permission text is in `app.json`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Dev server |
| `npm run start:clean` | Dev server with cache cleared |
| `npm run ios` / `android` | Run on device or simulator |
| `npm run lint` | TypeScript check |

## Languages

Six languages in [`locales/strings.ts`](locales/strings.ts): English, Spanish (Mexico), Korean, Japanese, Simplified Chinese, Traditional Chinese.
