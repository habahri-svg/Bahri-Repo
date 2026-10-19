# Nota+ end-to-end test

Drives the real app in headless Chromium at phone size (Android user agent) with a fake microphone,
a scripted speech recognizer and a mocked AI API. No network and no key needed.

```
cd tests/nota-plus
node e2e.mjs
```

Needs the `playwright` package and a Chromium it can launch. Set `PLAYWRIGHT_NODE_PATH` to the folder that
contains `playwright`, and `CHROMIUM_PATH` if the browser is not found. Screenshots land in `/tmp/nota-test-out`
(override with `NOTA_TEST_OUT`).

It covers first-run key setup, on-device and Cloud Whisper recording, pause, bookmarks, speakers, crash
recovery, notes, search, find and jump, AI summary, ask, translate, import, export, settings, self-check,
Arabic, offline, and failure paths (mic denied, speech blocked, rate limits, no network).

What it cannot prove: how Chrome's real speech recognition behaves on a real phone. Run Settings, Self-check
on the phone for that.
