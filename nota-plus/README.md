# Nota+

Free AI notes in Arabic and English. Record live, read the transcript as people talk, then get a summary, decisions and action items in either language. Installs on an iPad, iPhone or Android phone from a link, with no app store.

It is a progressive web app, plain HTML, CSS and JavaScript. There is no build step and no server of its own.

## What it does
- Live transcript with speaker tags, bookmarks and a live translation line.
- Two ways to transcribe. **On this device** is free and live and uses the phone's own speech recognition, one language at a time. **Cloud Whisper** is the most accurate and handles Arabic and English mixed together.
- AI summary, key points, decisions, action items and topics, in Arabic or English whatever language was spoken. Six templates: meeting, lecture, interview, sales call, study notes, voice memo.
- Clearer transcripts: audio is cut in pauses between sentences, never mid-word. Names and the last words said are passed to the speech model as context. The larger, more accurate Whisper model is used by default (Settings can switch to Fast). The record screen warns when the voice is too quiet or too loud and lists tips. A saved note can be cleaned up with AI, and the original restored.
- **Automatic Arabic and English switching.** Cloud Whisper in Auto mode listens to both languages, hears each sentence in whichever language it is spoken, keeps English words in English letters inside Arabic speech, and tags every line AR or EN. If Auto mistakes an Arabic dialect for another language, it redoes that piece as Arabic.
- **Outline** with tappable chapter times, **Insights** (talk share per speaker, words, questions, Arabic and English mix), a one-tap **follow-up email** draft, and **Add to calendar** for action items that have a real date.
- **Star** notes and filter by Starred. **Custom vocabulary** for names and terms. **Large text** for live captions. Copy any line with its time.
- **Export** to text, Word, Markdown and subtitles, and **Back up and restore** all notes as a file, to keep them safe or move them between devices.
- **The audio is never thrown away.** If transcription fails or hears nothing while audio was recorded, the recording is saved as an audio note with a Transcribe now button for when the connection works. Long-press the app icon for the **Record now** shortcut that starts recording in one tap.
- **Live capture health.** While recording, the app watches the whole chain (microphone, sound, sending, replies, words) and if nothing is being registered a strip says exactly which link broke and what to do, with a one-tap switch to Cloud Whisper when the phone's own recognition stays silent.
- Ask AI about one note, or across every note.
- Find in any transcript: type a word, part of a word or a single letter and every match is highlighted with its time. Use the arrows to jump between matches, type a time like 12:40 to go straight there, or tap a marked moment or a time in an AI answer. With saved audio, playback jumps to the same moment. Arabic search ignores diacritics and alef spellings. Library search opens the note at the match.
- Import audio or video files, paste text, search every word, translate a transcript, export to text, PDF or SRT subtitles.
- Arabic and English interface with full right-to-left layout.
- Notes and audio are stored on the device in the browser. The app opens offline and past notes can be read offline. Recording needs a connection on most phones, because phone speech recognition and Cloud Whisper both use the internet.

## Use it on your phone or iPad
1. Open the deployed link (see Deploy below) in **Chrome on Android** or **Safari on iPad and iPhone**.
2. Android: tap the Install banner, or the browser menu then Install app. iPad and iPhone: tap Share, then Add to Home Screen.
3. The first time you open the app it walks you through the free AI key (below). Without a key the app still records with phone speech recognition and writes a basic summary, but translation, Ask AI and the best Arabic accuracy need the key.
4. Settings, Self-check tests the microphone, speech recognition, storage and key on your device in one tap.

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
- Speakers: type the names before recording, then tap the name of whoever is talking (tap it again to rename). Lines are credited by the time you tapped. For finished notes, Detect speakers (AI) guesses who said what from the conversation, so check the result. A phone cannot reliably tell voices apart from audio alone.
- Automatic switching needs Cloud Whisper. On-device recognition handles one language at a time. A single sentence that mixes two languages is handled on a best-effort basis.
- Not included, because they need a server of their own: a bot that joins Zoom, Meet or Teams calls, shareable links, and automatic sync between devices. Use Back up and restore to move notes.
- Needs a recent browser: current Chrome on Android, or Safari on a recent iPadOS or iOS.

## Run it locally
```
cd nota-plus
python3 -m http.server 8080
```
Open http://localhost:8080. Microphone access needs `localhost` or https.

## Deploy (free)
The app is a folder of static files, so any static host works.
- **GitHub Pages:** the workflow in `.github/workflows/nota-plus-pages.yml` publishes this folder. In the repo go to Settings, Pages, and set Source to GitHub Actions. It runs on pushes to `main` or the repo's current default branch that touch `nota-plus/`, or by hand from the Actions tab.
- **Netlify Drop:** drag the `nota-plus` folder onto https://app.netlify.com/drop.
- **Vercel or Cloudflare Pages:** point the project at the `nota-plus` folder with no build command.

When you change files, bump `VERSION` in `sw.js` so installed copies update.
