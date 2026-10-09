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

## Limitations that remain
- **Android blocks direct capture of VoIP audio.** Without root there is no supported way to grab WhatsApp's call stream, so CallVault records the microphone and forces speakerphone on. Quality depends on the phone, and some phones silence the mic while WhatsApp is using it. Test with a short call first.
- Call detection has two layers (WhatsApp call screen names, plus a system audio-mode fallback), but a future WhatsApp redesign could still need a small tweak.
- Contact name capture is best effort and may show "Unknown contact".
- Transcription is capped at about 100 minutes per call (25 MB Whisper limit).
- This code has not been compiled or run on a device yet.

## Added in v1.1
Reminders survive reboots, API keys and the PIN are encrypted on-device, calls recorded offline are analysed automatically when you next open the app, extra microphone-source fallbacks, and an "Ask AI" screen that answers questions across all your calls.

## Legal
Recording calls without consent is illegal in many places. You are responsible for following local law and informing the other party where required.

## Ideas for next steps
Ask-across-all-calls chat, contact-level history and timelines, speaker labels, automatic Google Calendar events for agreed dates, Google Drive backup, PIN/biometric lock, offline Whisper on device, Arabic and mixed-language tuning, weekly digest.
