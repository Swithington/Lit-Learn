# GI/Hep/IM Recall — offline PWA

## What's in this folder
- `index.html` — the whole app (same dashboard, now backed by IndexedDB instead of the Claude.ai artifact sandbox's storage)
- `manifest.json` — makes it installable on Android ("Add to Home Screen")
- `sw.js` — service worker; caches the app shell so it opens with no signal
- `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` — home-screen icons

## Deploying to GitHub Pages

1. Create a new **public** GitHub repo (private repos need GitHub Pro for Pages).
2. Put these 6 files in the **root** of that repo (not in a subfolder) and push.
3. Repo → Settings → Pages → under "Build and deployment", set Source to
   **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. Wait a minute or two, then your app is live at:
   `https://<your-username>.github.io/<repo-name>/`
5. Open that URL on your Android phone in Chrome.

## Installing on Android

1. Open the GitHub Pages URL in Chrome.
2. Chrome should show an "Install app" prompt automatically after a few
   seconds — if not, tap the **⋮** menu → **Add to Home screen** / **Install app**.
3. It'll appear as a normal app icon (teal, "+/-" mark). Opening it launches
   full-screen, no browser chrome.

## First-time setup (once, while online)

The phone starts with an empty library — IndexedDB is local to that
browser/device and has no way to know about your existing cards on its own.

1. On the Claude.ai dashboard: **Tools → Backup & restore → Download my cards**.
2. On the phone app: **Tools → Backup & restore → Restore from file**, pick
   that same downloaded file, choose **Replace my whole library**.

This matters beyond just seeding content: it makes the card `id`s on the
phone identical to the ones on the Claude.ai dashboard, which is what lets
the progress-sync file (below) reference the right cards later.

## Day-to-day offline study

Once set up, the phone app works fully offline for:
- Reviewing due cards, rating them
- Browsing the Library, Favourites
- Favouriting cards / flagging points

It cannot (needs a connection, by nature — these all call the Anthropic
API): Bulk search, Add specific paper, Evidence check, Coverage checks,
DOI/logo enrichment. Attempting these offline shows a clear message rather
than hanging; the app also shows an amber banner whenever it detects no
connection.

## Syncing progress back

When you're back online:

1. On the phone app: **Tools → Study progress sync → Download progress**.
2. Move that small file to whatever device has the Claude.ai dashboard open
   (email to self, Google Drive, Android share sheet — whatever's easiest).
3. On the Claude.ai dashboard: **Tools → Study progress sync → Upload study
   progress**, pick that file, review the preview, **Apply progress**.

This only ever adds new reviews and favourites — it can't overwrite card
content, and can't un-favourite anything. Downloading only ever includes
reviews made since your last download from that device, so repeat syncs
stay small; favourites are re-sent in full each time (harmless — the merge
side already treats an already-favourited card as a no-op).

## Updating the app later

If the dashboard gets new features added on Claude.ai, re-download these 6
files and push them to the same GitHub repo. The service worker will detect
the new version and update automatically the next time the phone app is
opened with a connection (it always checks for updates in the background;
you may need to fully close and reopen the app once for it to take over).

## Troubleshooting

This was built and tested against a simulated browser environment, not a
real phone — so if something doesn't work exactly as described, here's
where to look first.

**"Add to Home Screen" doesn't offer to install / doesn't look like a real app:**
Chrome only offers installation over `https://` (GitHub Pages provides this
automatically) and needs the manifest + service worker to both load
successfully. Open Chrome DevTools remotely (`chrome://inspect` from a
desktop Chrome with the phone connected via USB) and check the Application
tab → Manifest / Service Workers for errors.

**Offline mode shows a blank page instead of the app:**
Means the service worker's install step didn't finish caching before you
went offline the first time. Open the app once with a connection, wait a
few seconds, then test offline — the shell needs one successful online
visit to populate the cache before it can serve offline.

**Changes made on the phone don't seem to save:**
Check whether you're in an Incognito/private Chrome tab — private browsing
limits or blocks IndexedDB in some Chrome versions. Use a normal tab, or
the installed home-screen app (which never runs in private mode).

**A new deploy doesn't show up on the phone:**
The service worker caches aggressively by design. Fully close the app
(swipe it away from recent apps, not just navigate back) and reopen it —
this forces the new service worker to activate. If it still shows the old
version, the cache name in `sw.js` may need a manual bump (v1 → v2) to
force a clean cache.

**Progress sync file won't upload / says "doesn't look like a study-progress file":**
Confirm you're uploading the file from **Download progress**, not
**Download my cards** (the full backup) — they're different files with
different purposes, both live in the same Tools panel area.
