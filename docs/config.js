/* The only setting you must change before publishing.
   Paste your Google OAuth Client ID here (EXECUTION-PAGE.md, step 2). It looks like
   123456789-abcdefg.apps.googleusercontent.com
   A Client ID is not a secret. It is safe to keep in a public repository. */
window.WYZ_CONFIG = {
  GOOGLE_CLIENT_ID: "1034484883787-53roq21qkkptqran7eqhenut66u7mgrp.apps.googleusercontent.com",
  /* Company dashboard intake, for example https://YOUR-APP.lovable.app/api/public/ingest-execution-summary
     Each person chooses whether to share. Empty = feature hidden. */
  DASHBOARD_URL: "",
  /* true once https://99946693.vercel.app/ is listed under "Authorized redirect URIs" on the Google Client ID.
     The installed iPhone app then signs in with a full-page Google screen, which is more reliable there than a popup. */
  IPHONE_APP_REDIRECT: false,
  /* Microsoft sign-in (Outlook, Hotmail, Microsoft 365). Paste the Application (client) ID from the Microsoft app
     registration (EXECUTION-PAGE.md, Microsoft). Empty = the Continue with Microsoft button stays hidden. */
  MS_CLIENT_ID: ""
};
