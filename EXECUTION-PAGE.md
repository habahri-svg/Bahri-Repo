# WYZ Rent Execution Page: how to publish it

A single web page that shows a person their own day: inbox sorted by what needs action, today's and tomorrow's meetings, tasks, and recent Google Drive files. Each person signs in with their own Google account, and the page then greets them by name and loads only their data.

It is plain HTML, CSS and JavaScript in `docs/`. There is no server and no build step. Google sign-in, Gmail, Calendar and Drive run straight from the visitor's browser. Their data goes from Google to their browser and nowhere else.

Files in `docs/`:

| File | What it does |
| --- | --- |
| `index.html` | The page and its styling |
| `app.js` | The screens and logic |
| `connectors.js` | Google, Todoist and Claude connections |
| `config.js` | **The one setting to change** (your Google Client ID) |

## Publish it (about 15 minutes, one time)

### 1. Put the files on the main branch
This work sits on the branch `claude/gracious-mayer-ywmspl`. Merge it into `main` (open a pull request and merge it, or change the Pages branch in step 3 to this branch).

### 2. Create the Google sign-in (Client ID)
Without this the page can't log anyone in. It shows "One-time setup needed" until you finish it.

1. Go to https://console.cloud.google.com and create a project (any name).
2. **APIs and Services, Library**: enable **Gmail API**, **Google Calendar API**, **Google Drive API** and **People API** (People API gives the address suggestions when you write an email).
3. **APIs and Services, OAuth consent screen**: choose **External**, fill in the app name (for example "WYZ Execution Page") and your email.
4. On the **Scopes** step add these:
   - `.../auth/gmail.readonly`
   - `.../auth/gmail.compose`
   - `.../auth/gmail.modify` (archive and mark as read)
   - `.../auth/calendar.readonly`
   - `.../auth/calendar.events` (create and move meetings)
   - `.../auth/drive.metadata.readonly`
   - `.../auth/drive.readonly` (lets the AI read a Drive file or PDF only when someone asks it to)
   - `.../auth/drive.file` (lets the page save an email attachment into one Drive folder it creates, and see only files it created)
   - `.../auth/contacts.readonly` and `.../auth/contacts.other.readonly` (address suggestions from your contacts and people you've emailed)
5. On the **Audience** page tap **Publish app**. This lets anyone with a Google account sign in, with no test-user list and no 7-day expiry. Until Google verifies the app (see "Going beyond 100 people" below) it shows an "unverified app" warning (Advanced, Go to app) and is capped at 100 people in total.
6. **APIs and Services, Credentials, Create credentials, OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: your site address with no path and no trailing slash, for example `https://habahri-svg.github.io`
   - Leave redirect URIs empty.
7. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) and paste it into `docs/config.js`. A Client ID is public by design, so it is safe in the repository. Never paste a client secret anywhere. This page doesn't use one.

### 3. Turn on GitHub Pages
Repository **Settings, Pages**: Source **Deploy from a branch**, branch `main`, folder **/docs**, Save. After a minute the site is live at `https://<your-user>.github.io/<repo-name>/`. Make sure that origin (`https://<your-user>.github.io`) matches what you put in step 2.

### 3b. Or publish on Vercel
`vercel.json` already tells Vercel to serve the `docs` folder, so import the repo and deploy with no build settings. Two things to know:
- Vercel's production site follows the `main` branch. Until the pull request is merged you only get a preview address, so merge first (or set the production branch to this one).
- Add your Vercel address (for example `https://your-project.vercel.app`, no trailing slash) to **Authorized JavaScript origins** in Google Cloud (step 2), or Google sign-in will refuse to open.

### 4. Open it and test
Open the site address in Chrome or Safari. You should see "Connect your accounts to start". Tap **Continue with Google**, tick every box on Google's screen, and the page loads your inbox, meetings and files and greets you by name.

## Claude for everyone, with no keys (Vercel)
Anthropic doesn't offer a "Sign in with Claude" for other websites, and using someone's Claude subscription outside claude.ai is against its terms. So the page connects Claude one of two ways:

1. **Shared Claude (recommended, Vercel only).** You add your own Claude API key once on the server. Everyone who signs in with Google then gets smart sorting, drafts and follow-ups automatically, with nothing to paste. The key never reaches the browser. In Vercel open **Settings, Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | your key from https://console.anthropic.com/settings/keys |
   | `GOOGLE_CLIENT_ID` | the same Client ID as in `docs/config.js` |
   | `ALLOWED_EMAILS` | optional, comma-separated Google addresses allowed to use Claude |
   | `ALLOWED_DOMAINS` | optional, for example `wyzrent.com` |
   | `DAILY_LIMIT` | optional, calls per person per day (default 50) |
   | `OWNER_EMAILS` | optional, who may open `/admin` (see Owner usage panel below) |

   Then redeploy. You pay for the usage, so set a spending limit in the Anthropic console and use `ALLOWED_EMAILS` or `ALLOWED_DOMAINS` so only your team can use it. The function (`api/claude.js`) checks every request against the person's Google sign-in and refuses tokens issued to any other app.
   **ChatGPT works the same way.** Add these in Vercel to let everyone use your ChatGPT too:

   | Name | Value |
   | --- | --- |
   | `OPENAI_API_KEY` | your key from https://platform.openai.com/api-keys |
   | `OPENAI_MODEL` | optional, the standard ChatGPT model (defaults to `gpt-5.6-terra`, change it if OpenAI renames it) |
   | `ALLOWED_OPENAI_MODELS` | optional, the models people may choose, comma-separated |

   The same `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS`, `ALLOWED_DOMAINS` and `DAILY_LIMIT` apply to both. The standard Claude model is Sonnet 5.5. People can switch model, or switch between Claude and ChatGPT, under Connections, Personalise. Other AIs (Perplexity, Gemini and so on) can be added there by web address and open in a new tab with the question filled in.
2. **Their own key (fallback).** On GitHub Pages there is no server, and on Vercel the function stays off until you add the variables. In both cases the guided screen asks each person for their own key instead.

## Owner usage panel (optional)
Open `https://YOUR-SITE/admin` to see who uses the shared Claude and ChatGPT, how many calls each person made today and in total, the tokens used, and a **Switch off** button per person. It also makes the daily limit exact.

1. In Vercel add the environment variable `OWNER_EMAILS` with your Google email (several are fine, separated by commas).
2. In Vercel open **Storage**, create **Upstash Redis** (the free plan is enough) and connect it to the project. Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
3. Redeploy. Usage is counted from then on.

Without step 2 everything still works. The page then explains what is missing, and daily limits are only approximate. "Switch off" stops that person's use of the shared AI. It can't lock them out of their own Gmail, because the page reads that directly from their Google account.

## What was added after the first version
- **Real email view.** Emails open as designed, with clickable links, pictures on request, and attachments you can download.
- **More mail actions** in the thread's More menu: star, mark unread, move to a label, unsubscribe, move to bin.
- **Select several** emails, then Done, Snooze, Archive or Mute them together.
- **Draft all replies** writes a draft for each email that needs an answer and saves it to Gmail drafts. It never sends. Tick the box under Replies and rules to do this once a day when the page opens. This runs when the page is open. A true overnight run would need a server job.
- **Ask AI about a file.** Email attachments and Drive files (PDF, pictures, text, Google Docs, Sheets and Slides). PDFs and pictures need Claude. Files over 3 MB are skipped.
- **No credit?** If Claude has no credit the page tries ChatGPT. If neither works, "No credit? Use a free chat" opens your own ChatGPT or Claude chat with the email filled in. Paste the answer back. Pick Sonnet 5.5 in Claude's model menu.
- **Speak your reply.** Works in Chrome, Edge and Safari. English and Arabic. The AI tidies what you said.
- **Install as an app** on a phone or computer, from the Install tab. It needs internet.
- **Five colour themes** under Connections, Personalise, each with light and dark.
- **Version label.** The top of the page shows the version name and when it was last updated. Edit `docs/version.js` each time you publish.
- **Suggested answer in the thread.** Open an email and an AI-written reply appears under the last message, written by the AI you pick (Claude, ChatGPT or a free chat). Turn the automatic suggestion off under Replies and rules.
- **Undo send and a check before sending.** After you press Send there is a countdown (default 10 seconds, changeable) with an Undo button. Quick checks catch a missing attachment or a leftover [DATE]. "Check it first" asks the AI to read the email.
- **Top 3 for today** at the top of the Today tab, chosen by the AI from your mail, tasks and next meetings.
- **Prep brief** on every meeting, **person card** (click "About" a sender, or More, About this person), and **Search everything** (mail, files, meetings, tasks and people in one box).
- **One-tap replies.** Buttons under every email (Yes, Not now, Need more info, Call me, Thanks). One tap and the AI writes the full reply. Change the buttons under Replies and rules.
- **Smart snooze.** In any Snooze menu, "Suggest a time" picks the best day to bring the email back and snoozes it in one tap.
- **Save attachments to Drive.** Each attachment has Save to Drive (and Save all). Files go into a folder (default "WYZ Rent Attachments") named by date and sender. This asks everyone to allow one more Google permission.
- **Read my day aloud.** The header button reads your top 3, emails, meetings and overdue tasks. English or Arabic (Arabic needs an AI connected and an Arabic voice on the device).
- **Alerts for urgent mail.** Under Connections, Alerts and security. A notification when a VIP or critical email arrives, while the page or installed app is open. A page that is fully closed can't alert, because that needs a server.
- **PIN lock.** Under Connections, Alerts and security. A 4 to 8 digit PIN before the page opens and after you have been away, with optional fingerprint or face. The PIN is stored only as a salted hash on that device. "Forgot the PIN" removes the lock but signs you out, so Google sign-in is needed again.
- **Automatic AI switch.** If Claude has no credit, its key is refused, or it is busy, ChatGPT answers instead (and the other way round). The page remembers for a few minutes, so it doesn't waste a call on the broken one. Questions about PDFs and pictures stay with Claude, because ChatGPT can't read those here. A line at the very top of the page shows which AI is connected and which one is answering.
- **Hand off to a team member.** More, Hand off sends the email to Karim or Louloua (edit the team under Replies and rules) and tracks it under "Waiting on the team" until they answer. You can nudge them from there.

## What happens when someone opens it
1. First visit: a "Connect your accounts" card with one **Continue with Google** button. Nothing opens until they tap it.
2. After they approve: it hides the card, greets them by name (Good morning, Name), shows their email and avatar, and loads Gmail, Calendar and Drive.
3. Next visits: it reconnects quietly, and if the browser blocks that it shows "Welcome back, Name" with one tap to continue.
4. Straight after Google, a guided screen asks them to connect the rest, one step at a time, each with a Skip button: **Claude** (skipped automatically when shared Claude is on, otherwise their own key, checked on the spot), **Todoist** (their own token) and **ChatGPT / Claude research** (export files). It shows once per person per browser and can be reopened from the Connections tab.
5. **Sign out** (top of the page or the Connections tab) revokes access.

Each person's board (done, snoozed, tasks, links) is stored in their own browser under their own Google ID, so two people on one computer don't mix.

## Optional extras (each person can add their own)
- **Claude API key**: turns on smarter sorting, drafts and research follow-ups. Without it the page sorts mail by simple rules and writes template drafts. The key is stored in that browser only. It is sent only to `api.anthropic.com`.
- **Todoist token**: paste a personal API token from Todoist (Settings, Integrations, Developer) to show today's tasks and complete them.
- **ChatGPT and Claude research**: import the `.zip` from each service's data export. Neither offers a live connection.

## Going beyond 100 people (read this)
Gmail permissions are classed by Google as **restricted**. A published but unverified app works for anyone, but only the first 100 people can ever sign in, and each sees an "unverified app" warning. To lift the cap and remove the warning you must submit the app for Google's OAuth verification. For restricted Gmail scopes that includes an annual paid third-party security assessment (CASA). Nothing in this repository can do that for you. A team or family under 100 people never needs it.

## Privacy
- No server, no analytics, no tracking. The page talks only to Google, and optionally Todoist and Anthropic.
- The Google access token lives in memory only. Browser storage holds the person's board, a "connected" flag, their email as a sign-in hint, and any optional keys.
- Anyone using a shared computer should tap **Sign out** when finished.

## Not tested against real accounts
The page was tested end to end with simulated Google, Todoist and Claude responses (sign-in, personalisation, inbox, calendar, Drive, saving a draft, silent reconnect, sign-out). It has not been run against real accounts, because that needs your Google Client ID. The Todoist calls are the least certain: Todoist changed its API recently, so if tasks don't show, check the token first. Todoist is optional.

## Run it on your computer
```
cd docs
python3 -m http.server 8000
```
Open http://localhost:8000. For sign-in to work locally, also add `http://localhost:8000` to **Authorized JavaScript origins** in Google Cloud.

## Older files
`owner-execution-page.html` and `NOTES-for-Karim.md` are the earlier claude.ai-only version. They only work inside claude.ai and are not part of the published site.

## Decisions so far (owner's answers)
- **Hosting:** Vercel, with shared Claude through the owner's key. A custom domain can come later.
- **Client ID:** the owner sends it and it is saved in `docs/config.js`, so the plain link works for everyone.
- **Google:** app published (up to 100 people, "unverified" warning once). Verification later, if it is sold.
- **Claude use:** only a list of family and staff emails (`ALLOWED_EMAILS`), 50 calls per person per day.
- **Page:** English only, Gmail only, main calendar only, WhatsApp share buttons, built-in tasks plus optional Todoist, optional research import, guided first-run steps. The setup card drops to the last row, folded, once everything is connected.
- **Company dashboard (later):** each person's board stays private. The dashboard receives counts (emails waiting, overdue tasks, meetings today) plus ChatGPT and Claude research topics and ideas. Stored in a small database such as Supabase.
- **Delivery:** a web app installed from the browser. Free trial then monthly per user. First customers: busy executives.

## Microsoft accounts (Outlook, Hotmail, Live, Microsoft 365)

One time, by the owner. About 10 minutes.

1. Go to https://entra.microsoft.com (or portal.azure.com) and sign in with any Microsoft account.
2. App registrations, New registration.
   - Name: WYZ Execution Page
   - Supported account types: Accounts in any organizational directory and personal Microsoft accounts
   - Redirect URI: platform Single-page application (SPA), `https://99946693.vercel.app/`
3. Register. On the app's Authentication page add a second SPA redirect URI: `https://99946693.vercel.app/ms-redirect`
4. API permissions, Add a permission, Microsoft Graph, Delegated: User.Read, Mail.ReadWrite, Mail.Send, Calendars.ReadWrite, Files.ReadWrite, Contacts.Read, People.Read, offline_access.
5. Copy the Application (client) ID from Overview and paste it into `docs/config.js` as `MS_CLIENT_ID`.

The Continue with Microsoft button and Add Microsoft account appear once MS_CLIENT_ID is set.
Work accounts whose company blocks new apps need their IT to approve the app once.
The shared AI accepts Microsoft sign-ins too (the server checks the person with Microsoft Graph), so add their email to ALLOWED_EMAILS.

## Fix the app (owner only)

The owner sees a "🛠 Fix the app" button next to Invite someone. Type what should change, Claude reads the code on GitHub and prepares the change, and nothing goes live until you press Go live. Each publish raises the version number, and the last one can be undone.

Needs these in Vercel, Settings, Environment Variables, then a redeploy:
- OWNER_EMAILS: the Google accounts allowed to use it.
- ANTHROPIC_API_KEY and GOOGLE_CLIENT_ID: already there for the shared AI.
- GITHUB_TOKEN: a fine-grained GitHub token for this repository only, with Contents set to Read and write. Add Deployments set to Read-only to get preview links.
- Optional: FIX_MODEL (default claude-sonnet-5-5), FIX_BRANCH, GITHUB_REPO.

Locked on purpose: api/_shared.js, api/fix.js, api/admin.js, api/seen.js, docs/config.js. Those hold sign-in and safety checks and can only be changed by a developer.

## Business extras (3.41)

- WYZ numbers strip (Hostaway): add HOSTAWAY_ACCOUNT_ID and HOSTAWAY_API_KEY in Vercel. Optional HOSTAWAY_CITY (for example Dubai) and HOSTAWAY_VIEWERS (who else may see it). Owners see it by default.
- Team pulse: needs Upstash Redis on the Vercel project (same storage as /admin). Each page sends counts only, and people can switch sharing off in Settings.
- Send to Command Center: set COMMAND_CENTER_URL in docs/config.js once the Command Center has an intake endpoint. The button shows the request to send Abbas until then.
- Brand for another company: open /brand, fill it in, and paste the settings into docs/config.js of that company's copy.

## WhatsApp Business inbox (3.42)

Needs a Meta WhatsApp Business app (Cloud API) and Upstash Redis. In Vercel add WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET, optional WHATSAPP_VIEWERS. In Meta, set the webhook to https://YOUR-SITE/api/whatsapp with the same verify word and subscribe to messages. Replies are free only within 24 hours of the customer's last message.

## Going back to an earlier version (always there)
A slim bar at the very top of the page has **Back** and **Forward** between published versions. Each version is a full, working copy of the page, kept in `docs/previous/v<version>/`, and the bar reads the list in `docs/versions.json`. Going back never loses anything: the sign-in and your saved board are shared between versions.

It is automatic. Every time `docs/version.js` changes on the live branch (a Fix box publish, a merge, anything), the workflow `.github/workflows/archive-version.yml` saves the version that was just replaced, using `tools/archive-version.js`, and adds it to the list. To save a version by hand, for example an older one: `node tools/archive-version.js <commit-or-tag>`, or run the workflow from the Actions tab with that commit.

If the live site ever needs to go back for everyone, not just you: in Vercel, Deployments, pick an earlier one and choose Instant Rollback. Then in GitHub revert the change that caused it (`git revert <commit>`), so the next publish does not bring it back. Never reset the branch, so nothing is lost.

## Library (3.45): all your ChatGPT and Claude chats and files, by date, plus Lovable
A card under "What you've been researching" on the Today tab. Everything stays in this browser's own storage (IndexedDB) and never goes to a server. It does not sync between devices: import again on another device.

- **Import.** Choose the full export .zip (or the conversations json files) from ChatGPT (Settings, Data controls, Export data) and Claude (Settings, Privacy, Export data). Big exports are read in pieces, and importing again never makes duplicates. The older Import buttons under Documents feed the Library too.
- **Search and review.** Full-text search over every chat, open any chat to read it, ask the AI about it. "Search everything" at the top of Today also searches the Library.
- **Ask my memory.** Finds the most relevant passages in your chats, adds the memory profile you pasted, and asks your chosen AI to answer from that material only, naming the chats it used. Only your question and those passages are sent. ChatGPT's saved memories are not in its export, so use the "Copy the request" button, send it to ChatGPT, and paste the answer in once.
- **All my files, by date.** Every canvas document, artifact, file you shared and file ChatGPT made, plus your Lovable projects, newest first, grouped by day. Filter by source, type and date range, search names and text.
- **Document manager.** Tick one or many files, then Delete. A confirmation lists them and moves them to **Trash**, where you can restore them. **Delete forever** needs a second confirmation and a ticked box, and those files stay deleted even if you import the same export again. This only affects the Library on this device. Nothing is deleted in ChatGPT, Claude, Lovable or Drive.
- **Lovable** is read from `docs/lovable-projects.json`, a saved copy of your projects. To refresh it, ask Claude to "refresh my Lovable list". A live connection needs Lovable's API, which needs a Business plan (your workspaces are on Pro).

## Monthly Revenue Comparison (3.52)
One **📊 Graphs** button in the page header (shown only to owners and REVENUE_VIEWERS) opens a window with this year against last year, month by month, with a Total revenue / Company net switch and a year picker. It is the same method as the Revenue Hub chart. For each month `api/revenue.js` asks Hostaway for the consolidated finance report (by arrival date, starting a month early) and spreads each stay's rental revenue evenly over its nights. Company net is the property manager payout, spread the same way. Nothing is estimated, and if Hostaway fails for any month the year is shown as unavailable rather than partial.
- Uses the same `HOSTAWAY_ACCOUNT_ID` and `HOSTAWAY_API_KEY` as the Hostaway strip. Only owners see it. Add others with `REVENUE_VIEWERS` (the Hostaway strip viewers do not get revenue).
- Months after the current one show bookings made so far, and their change is greyed and marked * so it is not read as a drop.
- Tests: `node tests/revenue.test.js` (15 checks on the allocation, the access rules, the cache and the fail-closed behaviour, with Google and Hostaway mocked).
- Not yet checked against a live Hostaway account. Before relying on it, compare the two year totals with the Revenue Hub chart. They should match closely. If a field name differs in your report, adjust `allocate` in `api/revenue.js`.

## Separate pages (3.54)
Today, Settings, Install and My Life are separate pages, each with its own address (`#/today`, `#/settings`, `#/install`, `#/my-life`). The browser Back and Forward buttons move between them, a page can be bookmarked or sent as a link, and every page opens at the top. Settings and Install have their own header with a Refresh button, a Back to Today button and Sign out; the Today tools stay on Today. Nothing was removed. Code: `docs/pages.js`.

## Undo and Redo (3.55)
↶ Undo, ↷ Redo and 🕘 History buttons in the header of every page, and Ctrl or Cmd + Z (undo), Ctrl or Cmd + Shift + Z or Ctrl + Y (redo). A small bar at the bottom left offers Undo for 8 seconds after each change. It covers what the page stores for you: Done and Reopen (it also adds or removes the Gmail "WYZ-Done" label), Snooze, Pin, tasks, handing an email to the team, links, VIP and muted senders, team, templates, signature, section order, and moving Library files to Trash. History keeps the last 100 changes on this device and survives a reload. A new change clears Redo. It cannot take back things that already left the page: a sent email (use the Undo send countdown), a WhatsApp message, a calendar change, an email archived or deleted in Gmail, a draft saved to Gmail, or Delete forever in the Library. Code: `docs/undo.js`.

## Documents: select, forward, remove (3.56)
Every document in the Documents list has a checkbox, **Forward**, **Remove** and **Delete in Drive ↗**, and the toolbar has Select all, Forward selected, Remove selected and a **Removed** view.
- **Forward** opens the usual email window with the links and your note filled in. You check it and press Send, nothing is sent from the page. It can also share on WhatsApp or copy the links. Library files can be forwarded the same way.
- **Remove** takes a document off the list after a confirmation. It does not delete anything in Google Drive: the page only has permission to read your Drive files (changing arbitrary files would need full access to the whole Drive, which is not recommended). Removed documents are in **Removed**, where you can restore them, and ↶ Undo brings them back too. **Delete in Drive ↗** opens the real file so you can delete it there.
Code: `docs/docman.js`.

## HTML files, created files and sizes (3.57)
- **HTML opens as a page.** Google Drive only shows `.html` files as source code. In Documents, an HTML file has **Preview as a page**, and in the Library any HTML artifact, canvas or version has **Preview**. The page shows in a sealed window (`preview.js`, sandbox without same-origin), so it can run its own scripts but cannot see the app, your email or your data. From there: **Download .html**, **Print / Save as PDF**, **View the code**.
- **Created files in the Library.** Every file gets a type (PDF, HTML page, App, Document, Spreadsheet, Presentation, Image, Diagram, Code, Archive). Filter by type chips with counts and by *Created by the AI* or *Shared by me*. Group by date, chat, type, or list by file name. **Expand all / Collapse all** opens and closes the groups.
- **Versions.** Claude artifacts (create, update, rewrite) and ChatGPT canvas documents (edits applied in order) keep each version, up to 25 per file. Each has Read, Preview (HTML), and shows its size. Import again to pick up new versions. Nothing is duplicated.
- **PDFs.** Exports list a PDF's name, date and chat, not the PDF. Open the original chat to download it again.
- **Size.** Documents show the file size from Google Drive. Native Google Docs and Sheets have none, so they say so. Library files show the export's size, or the size of the text, or "size not in export".

## Graphs button always shows (3.58)
Before, the **📊 Graphs** button hid itself when the server answered "not found" or "not a viewer", so a setup problem looked like a missing feature. Now it always shows. If revenue can't load, its window says why: the revenue service isn't on the site (redeploy so `api/revenue.js` is included), or the signed-in Google email isn't in `OWNER_EMAILS` or `REVENUE_VIEWERS` in Vercel. Only "Hostaway keys missing" for a non-owner still hides it.
