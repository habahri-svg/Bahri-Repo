# CallVault

Android app that records WhatsApp calls automatically, then uses AI to transcribe them, summarise them, pull out action items and schedule follow-up reminders.

## Get the APK (no Android Studio needed)
1. Push this branch to GitHub. The **Build APK** workflow runs automatically.
2. Open the repo's **Actions** tab, open the latest run, download the `CallVault-debug-apk` artifact and unzip it.
3. Copy `app-debug.apk` to the phone and install it (allow "install unknown apps" for your file manager or browser).

## First-time setup on the phone
1. Open CallVault, accept the legal notice.
2. **Permissions**: allow microphone and notifications.
3. **Accessibility**: turn on CallVault. This is how it notices the WhatsApp call screen. (Android 13+ may grey it out: App info > ⋮ > *Allow restricted settings*.)
4. **Battery**: set CallVault to unrestricted. On Honor/MagicOS also open Settings > Battery > App launch, find CallVault, and enable *Manage manually* with *Auto-launch*, *Secondary launch* and *Run in background* all on. Without this the system kills the service mid-call.
5. **Settings**: paste an OpenAI key (Whisper transcription) and an Anthropic key (summaries).

## How it works
- `CallWatcherService` (accessibility) sees WhatsApp's call screen open and arms the recorder.
- `RecorderService` polls the system audio mode. When it flips to `MODE_IN_COMMUNICATION` (call connected) it starts recording, and when it drops back it saves the file.
- `Ai` sends audio to Whisper, then the transcript to Claude, which returns title, summary, action items, key facts, sentiment and follow-ups.
- `ReminderReceiver` turns each follow-up into a notification at the due date.
- Everything lives in the app's private folder `Android/data/com.bahri.callvault/files/recordings` (m4a plus a json sidecar).

## Honest limitations
- **Android blocks direct capture of VoIP audio.** There is no supported way to grab WhatsApp's call stream. CallVault records the microphone, so the other person is only audible through the speaker. That's why speakerphone is forced on by default. Quality depends on the phone and Android version, and some devices silence the mic while WhatsApp is using it. Test with a short call first.
- Call-screen detection matches WhatsApp's class names. A WhatsApp update could break it, in which case detection needs a small tweak.
- Contact name capture is best effort and may show "Unknown contact".
- Reminders are not restored after a reboot.
- API keys are stored in plain app-private preferences.
- This code has not been compiled or run on a device yet.

## Legal
Recording calls without consent is illegal in many places. You are responsible for following local law and informing the other party where required.

## Ideas for next steps
Ask-across-all-calls chat, contact-level history and timelines, speaker labels, automatic Google Calendar events for agreed dates, Google Drive backup, PIN/biometric lock, offline Whisper on device, Arabic and mixed-language tuning, weekly digest.
