# Daily Follow-Up Cockpit: changelog by stage (version 3.44)

Built on top of version 3.43. Nothing was removed. Every old screen, button and setting is still there.
The page opens on the new first tab, **Follow-Up Cockpit**. The old screen is the **Today** tab next to it.

Files added: `docs/cockpit.js`, `docs/cockpit.css`, `docs/versionswitch.js`, `docs/versions.json`, `api/wafeq.js`, `api/pricelabs.js`, `docs/previous/v3.43/` (a frozen copy of the page before this change).
Files changed a little: `docs/index.html` (new tab and panel, script and style links), `docs/app.js` (the tab list, one extra field on mail threads), `docs/business.js` (shares the WhatsApp chat window), `docs/config.js`, `docs/version.js`, `docs/sw.js`, `docs/demo.js` (sample WyzRent systems in demo mode), `api/hostaway.js` (tomorrow's arrivals and bookings that need a look), `api/fix.js` (keeps the archived copies untouched).

## Also asked: go back to an earlier version from the top of the page
A slim bar at the very top has **Back** and **Forward** between published versions. Back opens a full, frozen copy of version 3.43. Forward returns to the latest. Your sign-in and saved board are shared between them, so nothing is lost either way. See "Going back to an earlier version" in `EXECUTION-PAGE.md` to add the next one.

## Stage 1. The Daily Follow-Up Cockpit (first screen)
- New first tab. Header with **Scan My Day**, a one-line summary, and the last scan time.
- Sections as tabs with counts: Today's Top 10, Reply Needed, Chase Needed, Waiting From Others, Waiting From Me, Overdue Tasks, Due Today, Meetings To Prepare, Urgent WyzRent Issues, CEO Decisions, plus Waiting From Team.
- Every item shows: title, source (a link that opens it), person or company, why it matters, the recommended next action, deadline or suggested date, owner, status, priority and action buttons.
- The header buttons on this tab shrink to Refresh, New email and More, so the list starts higher on a phone.

## Stage 2. Source scanning
- **Gmail**: unanswered emails, promises you made ("I will send..."), threads where you wrote last and nobody answered after 2 or 3 days (your choice), urgent words (urgent, today, asap, pending, deadline, payment, issue, complaint, approval, invoice, renewal, contract), attachments to review, VIP senders.
- **Calendar**: today and tomorrow become "Prepare" items with a prep brief, flagged when the invite has no agenda. Meetings that just ended become "Follow up after" items.
- **Drive**: files changed or shared by someone else, and documents that look like they need a final check.
- **Tasks**: built-in list and Todoist, overdue, today and this week, with completion and reassignment.
- **WhatsApp Business**: messages waiting for you, and chats where nobody answered you. Reply opens the existing chat window.
- **Hostaway**: check-ins and check-outs today, arrivals tomorrow, bookings that are still pending.
- **Wafeq** (new `api/wafeq.js`): invoices to chase and bills to pay.
- **PriceLabs** (new `api/pricelabs.js`): units that need a pricing look.
- **Command Center**: assigned, overdue, blocked actions (needs the read address, see Stage 8).
- **Imported ChatGPT and Claude research**: up to three unfinished threads.
- Plain keyword rules label each item as guest, owner, maintenance, cleaning, pricing, accounting, acquisition or CEO decision. No AI is needed for scanning.

## Stage 3. The 30 buttons
All 30 are on the screen in four groups and every one is clickable. Each opens a section, applies a filter, runs a scan, opens a draft, task or meeting, or explains what is missing. Buttons 14 to 20 and 29 act on the item you tapped, or ask you to choose one.

## Stage 4. Daily reminder and follow-up engine
Morning Brief, Midday Check, End-Of-Day Wrap, Follow-Up Queue and Tomorrow Prep. Each can be copied, written up by the AI, saved as a Gmail draft to yourself (never sent), or shared on WhatsApp. The page highlights the one that fits the time of day, and (if alerts are on) sends one notification at the start of each part of the day while the page is open. The Follow-Up Queue tracks emails and WhatsApp chats waiting on others, items with the team, payments to chase and overdue tasks.

## Stage 5. Action records
Every item is saved as a small record: id, title, source, source link, source type, person or company, summary, recommended next step, owner, deadline, status, priority, created, last updated, notes. Statuses: New, Waiting for me, Waiting for other, Assigned, In progress, Done, Snoozed, Blocked. Priorities: Critical, High, Medium, Low. Records are saved with the rest of your private page data. Items you have handled at the source (replied in Gmail, completed in Todoist) are closed on the next scan. **Setup & Admin** can download them as a file.

## Stage 6. Team assignment
Houssam, Louloua, Karim, Abbas, Sheena, Kelvin, Marz, Mehyar, Other. Assigning creates a task with a deadline, saves the owner, and lists the item under Waiting From Team. From there: **Nudge**, **Take back**, **Done**. Email and WhatsApp for the assignee open ready to send. Email addresses and numbers are saved once under Setup & Admin, Team contacts.

## Stage 7. Safe email behaviour
Unchanged and respected: nothing is sent automatically. Draft with AI and Draft All Replies only save to Gmail drafts. Approve And Send opens each one in the existing writing window, which keeps Check it first, the undo countdown, the missing attachment warning and the leftover placeholder warning. The built-in check confirms none of the cockpit code calls the send function.

## Stage 8. Connection clarity
A strip shows Gmail, Calendar, Drive, Todoist, WhatsApp Business, Hostaway, Wafeq, PriceLabs, Command Center, AI and Microsoft as Connected, Setup needed, Error or Not available. Tap one for a plain explanation and the next step. Technical details (variable names, addresses) appear only under **Setup & Admin**.

## Stage 9. Simpler language
Buttons use Answer, Chase, Delegate, Do today, Prepare, Review, Approve, Pay, Follow up, Done.

## Stage 10. Existing functions kept
Gmail, Calendar, Drive, AI replies, Search everything, Read my day, Draft all replies, Save to Gmail drafts, WhatsApp, Hostaway, Command Center, Team Pulse, Settings, Install, Admin, Microsoft and the System check are all still there. The Today tab is the old first screen, unchanged.

## Stage 11. Testing (done in a real browser against the demo page, `?demo`)
- Loads with no page errors. The cockpit is the first tab.
- 30 buttons visible, all clickable: 17 open a section and show a setup explanation when a source is missing, 10 open a dialog (explaining what is missing when no AI is connected), button 1 scans, 15 opens the meeting form, 30 opens the wrap.
- Scan My Day reads Gmail, Calendar, Drive, WhatsApp, Hostaway and Wafeq in the demo and reports PriceLabs, Todoist and the Command Center as "Setup needed".
- Draft All Replies with an AI saved drafts and made no send call.
- Assign, Nudge, Take back, Snooze, Done, Follow-Up Queue and the wrap all work. Phone width (390 px) has no sideways scrolling and no small tap targets. Desktop (1280 px) checked.
- Back and Forward between 3.43 and 3.44 work, and the old page loads unchanged.
- **Setup & Admin, Run the check** repeats the structural checks on your own device whenever you want.

## Not tested against real accounts
Only the demo page was run. Wafeq and PriceLabs field names come from their public API descriptions and are read defensively, so please check them against a real account and adjust `api/wafeq.js` and `api/pricelabs.js` if a field differs. The Command Center read address needs the Command Center to expose it (the exact request is under Setup & Admin, Copy what Abbas needs). Gmail, Calendar, Drive, Todoist and Microsoft use the connections that already existed in 3.43.
