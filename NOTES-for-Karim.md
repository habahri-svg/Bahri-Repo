# Owner Execution Page: notes for Karim

File: owner-execution-page.html (single file, plain HTML, CSS and JavaScript, no build step).
Live copy: https://claude.ai/artifact/Sdfr3Y6xgaL2mXjcDmK9B8

## Important
The page only works when it is published as a claude.ai Artifact and opened by a signed-in claude.ai user.
It uses the Artifact runtime (window.claude.use("mcp" | "sample" | "permissions" | "user" | "db")).
Opened as a plain file, every use() returns null, so the page shows "Not connected to your claude.ai account". That is expected.

Capabilities it must be published with:
- mcp: Gmail (search_threads, get_thread, create_draft), Google Calendar (list_events), Google Drive (list_recent_files), Todoist (find-tasks-by-date, complete-tasks, add-tasks)
- sample, user (scope: profile), db (rules: status read admin / write owner; status/{self} read+write interact)

## Known problems to resolve
1. Owner reports the page shows "Not connected to your claude.ai account" and Refresh now does nothing. Likely cause: access for the page is off in the claude.ai Permissions menu, or the link was opened signed out or in an in-app browser. Needs a check in a real signed-in browser.
2. Gmail, Calendar, Drive and Todoist calls have not been tested against real accounts. Argument names and result shapes (search_threads, get_thread, list_events, list_recent_files, find-tasks-by-date) should be checked with a real call.
3. The "Your Claude research" step calls a server named claude_ai (recent_chats) that is not in the manifest, so it always falls back to the file import.
4. ChatGPT and Claude research needs the export .zip imported by hand. No live connection exists.

## What changed in v2.1
- One access prompt at startup (permissions.request) instead of lazy prompts.
- "Sign in to all accounts" button, 15 second re-check while an account is missing, setup card always expanded.
- Refresh now explains when there is no claude.ai connection.
