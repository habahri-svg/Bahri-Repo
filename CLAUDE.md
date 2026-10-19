# Claude working notes for Houssam Bahri

## Data sources Claude can read in cloud sessions

### Gmail (habahri@gmail.com)
Connected through the Gmail connector. Use `mcp__Gmail__search_threads` with Gmail
query syntax, then `mcp__Gmail__get_thread` (PLAIN_TEXT) to read a thread in full.
Search previews only show the oldest messages of a thread, so always open the thread
before answering questions about recent mail.

### WyzRent dashboard (https://dashboard.wyzrent.com)
The live dashboard is the Lovable project **WyzRent Revenue Hub**
(project id `bcb09d21-8c59-455c-819b-237cae292506`, workspace "Abbas's Lovable",
id `dnUgTBnDQo4Um0w1r8z2`). Houssam is a viewer of that workspace, so the Lovable
connector gives read access to:

- Source code: `mcp__Lovable__list_files` / `mcp__Lovable__read_file`.
- Production database (Supabase Postgres): `mcp__Lovable__query_database`.
  Use SELECT only. Writes hit production data.

The site itself is blocked by the environment network policy, so never try to
fetch dashboard.wyzrent.com directly; go through Lovable instead.

Useful tables (public schema, ~250 tables in total):

| Area | Tables |
| --- | --- |
| Portfolio | `properties` (hostaway_listing_id, property_name, area, building, bedrooms, status, owner_id), `owners` |
| Bookings and revenue | `bookings` (hostaway_reservation_id, check_in_date, check_out_date as text YYYY-MM-DD, gross_revenue, hostaway_* payout fields), `daily_property_revenue`, `monthly_property_revenue`, `dashboard_daily_portfolio` |
| Guest messaging | `guest_conversations`, `guest_messages`, `wa_conversations`, `wa_messages` |
| Operations | `cleaning_jobs`, `maintenance_tickets`, `inspections`, `action_orders`, `alerts`, `approval_requests` |
| Pricing and market | `pricing_calendar_days`, `pricing_recommendations`, `pricelabs_*`, `competitor_*`, `market_rates`, `market_events` |
| Finance | `expenses`, `owner_statements`, `company_expense_transactions`, `company_receivable_transactions`, `wafeq_*`, `vat_return_records` |
| Owner acquisition | `owner_prospects`, `sales_leads` |
| Sync health | `sync_logs` (integration, action, status, message, created_at), `job_runs` |

### Hostaway
There is no Hostaway connector and `api.hostaway.com` is blocked by the network
policy. Hostaway data is read through the dashboard database above: the dashboard
syncs Hostaway reservations, listings, finances and conversations every few minutes
(check `sync_logs WHERE integration = 'hostaway'`). Direct Hostaway API access would
need the host allowed in the environment network settings plus `HOSTAWAY_ACCOUNT_ID`
and `HOSTAWAY_API_KEY` stored as environment secrets (never pasted into chat).

### Other connected tools
Google Calendar, Google Drive, Todoist, Lovable (Houssam's own workspace
`kqyiiviv7CmlX95VI0wj`, 16 projects including "WyzRent Command Center Base").

## Writing style for replies
Follow the user's preferences: no em dashes, no semicolons in casual text, plain
words over formal ones, contractions are fine, direct statements over hedging.
