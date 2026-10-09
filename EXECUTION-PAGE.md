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
2. **APIs and Services, Library**: enable **Gmail API**, **Google Calendar API** and **Google Drive API**.
3. **APIs and Services, OAuth consent screen**: choose **External**, fill in the app name (for example "WYZ Execution Page") and your email.
4. On the **Scopes** step add these four:
   - `.../auth/gmail.readonly`
   - `.../auth/gmail.compose`
   - `.../auth/calendar.readonly`
   - `.../auth/drive.metadata.readonly`
5. While the app is in **Testing**, add each person's Google address under **Test users** (up to 100). Only listed people can sign in. See "Going beyond test users" below.
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

## What happens when someone opens it
1. First visit: a "Connect your accounts" card with one **Continue with Google** button. Nothing opens until they tap it.
2. After they approve: it hides the card, greets them by name (Good morning, Name), shows their email and avatar, and loads Gmail, Calendar and Drive.
3. Next visits: it reconnects quietly, and if the browser blocks that it shows "Welcome back, Name" with one tap to continue.
4. **Sign out** (top of the page or the Connections tab) revokes access.

Each person's board (done, snoozed, tasks, links) is stored in their own browser under their own Google ID, so two people on one computer don't mix.

## Optional extras (each person can add their own)
- **Claude API key**: turns on smarter sorting, drafts and research follow-ups. Without it the page sorts mail by simple rules and writes template drafts. The key is stored in that browser only. It is sent only to `api.anthropic.com`.
- **Todoist token**: paste a personal API token from Todoist (Settings, Integrations, Developer) to show today's tasks and complete them.
- **ChatGPT and Claude research**: import the `.zip` from each service's data export. Neither offers a live connection.

## Going beyond test users (read this)
Gmail permissions are classed by Google as **restricted**. While the Google app is in Testing, up to 100 listed test users can sign in. Google shows them an "unverified app" warning (Advanced, Go to app). To let anyone sign in without that limit you must publish the app and pass Google's OAuth verification, which for restricted Gmail scopes includes a paid third-party security assessment. For a team or family, stay in Testing and list everyone. Testing-mode sign-ins can also expire after 7 days, so people may need to tap Continue with Google again weekly.

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
