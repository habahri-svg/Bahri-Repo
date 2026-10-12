/* The only setting you must change before publishing.
   Paste your Google OAuth Client ID here (EXECUTION-PAGE.md, step 2). It looks like
   123456789-abcdefg.apps.googleusercontent.com
   A Client ID is not a secret. It is safe to keep in a public repository. */
window.WYZ_CONFIG = {
  GOOGLE_CLIENT_ID: "1034484883787-53roq21qkkptqran7eqhenut66u7mgrp.apps.googleusercontent.com",
  /* Company dashboard intake, for example https://YOUR-APP.lovable.app/api/public/ingest-execution-summary
     Each person chooses whether to share. Empty = feature hidden. */
  DASHBOARD_URL: "",
  /* The company dashboard people open from their page */
  DASHBOARD_LINK: "https://dashboard.wyzrent.com",
  /* true once https://99946693.vercel.app/ is listed under "Authorized redirect URIs" on the Google Client ID.
     The installed iPhone app then signs in with a full-page Google screen, which is more reliable there than a popup. */
  IPHONE_APP_REDIRECT: false,
  /* Microsoft sign-in (Outlook, Hotmail, Microsoft 365). Paste the Application (client) ID from the Microsoft app
     registration (EXECUTION-PAGE.md, Microsoft). Empty = the Continue with Microsoft button stays hidden. */
  MS_CLIENT_ID: "",
  /* Brand. To sell this page to another company, change these (open /brand to build them with a preview). */
  COMPANY: "WYZ Rent",
  COMPANY_DESC: "a Dubai holiday home management company",
  APP_NAME: "Execution Page",
  LOGO_URL: "",          /* empty = the built-in tick logo. Or a picture address like https://.../logo.png */
  COLOR_MAIN: "",        /* empty = WYZ navy. Or a colour like #104b70 */
  COLOR_ACCENT: "",      /* empty = WYZ gold. Or a colour like #b8923c */
  /* Command Center: where "Send to Command Center" posts an action item. Empty = the button explains what's needed. */
  COMMAND_CENTER_URL: "",
  /* Command Center, reading: a GET address that returns the signed-in person's actions as
     {"actions":[{id,title,owner,status,due,priority,url,summary}]}. Empty = the cockpit says "setup needed" for this one.
     The exact request to hand to whoever builds it is under Follow-Up Cockpit, Setup & Admin. */
  COMMAND_CENTER_READ_URL: "",
  /* Where "Report a problem" sends people's reports. */
  OWNER_EMAIL: "habahri@gmail.com"
};
