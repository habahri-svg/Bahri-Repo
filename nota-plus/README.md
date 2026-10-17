# Nota+

Free AI notes in Arabic and English. Record live, read the transcript as people talk, then get a summary, decisions and action items in either language. Installs on an iPad, iPhone or Android phone from a link, with no app store.

It is a progressive web app, plain HTML, CSS and JavaScript. There is no build step and no server of its own.

## What it does
- Live transcript with speaker tags, bookmarks and a live translation line.
- Two ways to transcribe. **On this device** is free and live and uses the phone's own speech recognition, one language at a time. **Cloud Whisper** is the most accurate and handles Arabic and English mixed together.
- AI summary, key points, decisions, action items and topics, in Arabic or English whatever language was spoken. Six templates: meeting, lecture, interview, sales call, study notes, voice memo.
- Ask AI about one note, or across every note.
- Import audio or video files, paste text, search every word, translate a transcript, export to text, PDF or SRT subtitles.
- Arabic and English interface with full right-to-left layout.
- Works offline for recording on device. Notes and audio are stored on the device in the browser.

## Use it on your phone or iPad
1. Open the deployed link (see Deploy below) in **Chrome on Android** or **Safari on iPad and iPhone**.
2. Android: tap the Install banner, or the browser menu then Install app. iPad and iPhone: tap Share, then Add to Home Screen.
3. Open Settings in the app and paste a free AI key (below). Without a key the app still records on device and writes a basic offline summary.

### Get the free AI key
The app talks to any OpenAI-compatible API. It defaults to Groq's free tier, which covers Whisper transcription and the language model with one key.
1. Go to https://console.groq.com/keys and create a key.
2. Paste it in Nota+ under Settings, then tap Test key.

The key stays in your browser. Free tiers have rate limits, so a very long recording can hit them. To use another provider, change the API address and model names under Settings, Advanced.

## Honest limits
- **iPad and iPhone:** Safari's on-device speech recognition is often blocked once the app is added to the Home Screen. Use Cloud Whisper there. If on-device recognition fails and a key is saved, the app switches to Cloud Whisper on its own.
- **Android:** on-device recognition can clash with saving audio at the same time, so saving audio is off by default for that mode.
- Cloud Whisper sends audio to the AI provider in short chunks. Keep the screen on and the app open while recording, since phones pause web pages in the background. The app asks the phone to keep the screen awake.
- Imported files are limited to 24 MB by the free tier.
- Speaker labels are manual. Tap the Speaker button when the voice changes, and tap a name in the transcript to rename it.
- Needs a recent browser: current Chrome on Android, or Safari on a recent iPadOS or iOS.

## Run it locally
```
cd nota-plus
python3 -m http.server 8080
```
Open http://localhost:8080. Microphone access needs `localhost` or https.

## Deploy (free)
The app is a folder of static files, so any static host works.
- **GitHub Pages:** the workflow in `.github/workflows/nota-plus-pages.yml` publishes this folder. In the repo go to Settings, Pages, and set Source to GitHub Actions. It runs on pushes to the default branch that touch `nota-plus/`, or by hand from the Actions tab.
- **Netlify Drop:** drag the `nota-plus` folder onto https://app.netlify.com/drop.
- **Vercel or Cloudflare Pages:** point the project at the `nota-plus` folder with no build command.

When you change files, bump `VERSION` in `sw.js` so installed copies update.
