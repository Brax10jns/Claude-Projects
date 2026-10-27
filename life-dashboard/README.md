# Life Dashboard

A personal dashboard in the style of WHOOP or Oura, covering your whole day: **sleep, recovery, training, work and tasks**. The five pillars combine into one **Life Score (0–100)**, shown as a big ring, plus a **weekly review** with charts.

Local scripts fetch your data, compute every score and bake the result into **one self-contained HTML file** (`LifeDashboard\life-dashboard.html` in your user folder). It works offline. Open it on your laptop or add it to your phone's home screen.

| Pillar | Source | What's measured |
| --- | --- | --- |
| Sleep | Apple Health | Hours asleep vs goal, deep + REM share |
| Recovery | Apple Health | HRV and resting heart rate vs your own 30-day baseline |
| Training | Apple Health | Exercise minutes and steps vs goal, workouts |
| Work | RescueTime | Focused hours vs goal, productivity pulse |
| Tasks | iCloud Calendar | Share of events in your "Tasks" calendar marked ✓ |

**Real vs DEMO.** A source you haven't connected shows clearly labeled **DEMO** data so you can preview the design. DEMO pillars are never counted in your Life Score. A connected source with nothing recorded for a day shows **no data** for that day, never a made-up value.

**Your folder.** Your settings (`config.json`), synced data (`data\`) and the built dashboard live in **`C:\Users\<you>\LifeDashboard`** (`~/LifeDashboard` on Mac), outside the code. You can re-download or update the code any time without losing anything. Set `LIFE_DASHBOARD_HOME` to use a different folder. Nothing in it is ever committed, and it stays on your laptop.

## Setup (once)

1. Install [Node.js](https://nodejs.org) (the LTS version). There's nothing else to install.
2. Download this folder (on GitHub: **Code → Download ZIP**, then Extract All) or `git clone` it.

Everything below can be done by **double-clicking the `.cmd` files** in this folder. You never need to type commands. The first run creates `LifeDashboard\config.json`, where you can change your goals (`sleepHours`, `exerciseMinutes`, `steps`, `focusHours`) and pillar `weights`. `timezone` defaults to your laptop's.

| Double-click | What it does |
| --- | --- |
| `Connect Apple Health.cmd` | Imports the newest Health export zip in Downloads |
| `Connect Calendar.cmd` | Asks for your Tasks calendar link, syncs it |
| `Connect RescueTime.cmd` | Asks for your RescueTime API key, syncs it |
| `Update Dashboard.cmd` | Re-syncs everything (including a new Health export), rebuilds, opens the dashboard |
| `Schedule Daily Update.cmd` | Runs that update automatically every day (Windows Task Scheduler) |
| `Stop Daily Update.cmd` | Removes the daily schedule |
| `Phone Access On.cmd` | Always-on, private phone access from anywhere through Tailscale |
| `Phone Access Off.cmd` | Turns that off |
| `Open on Phone.cmd` | Serves the dashboard on your Wi-Fi only while its window is open |

If Windows shows "Windows protected your PC" the first time, click **More info → Run anyway**.

## Connect sources (one at a time)

Each sync script prints a 14-day check table. Compare a few rows with the app before moving on to the next source.

### 1. Apple Health

**Easiest (no PowerShell):** export from your iPhone (step 1 below), save `export.zip` to your Downloads, then double-click **`Connect Apple Health.cmd`** in this folder. It finds the newest `export*.zip` in Downloads, unzips it to a temp folder (deleted afterwards), imports it, builds the dashboard and opens it. You can also drag the zip, or an extracted `apple_health_export` folder, onto that file. If Node.js isn't installed, it opens nodejs.org for you.

Apple Health has no web API, so you export it from your iPhone:

1. iPhone **Health** app → tap your picture (top right) → **Export All Health Data** → Export. This can take a few minutes.
2. Send `export.zip` to your laptop (AirDrop, iCloud Drive, email…), then right-click it → **Extract All**.
3. Run:
   ```powershell
   npm run health -- "C:\Users\you\Downloads\export\apple_health_export"
   ```
   To skip the argument next time, set `appleHealth.exportPath` in `config.json`.
4. Check the table against the Health app (sleep hours, HRV, resting HR, steps), then `npm run build`.

Notes: a night counts toward the day you wake up. When your iPhone and Watch both record steps, the larger total is used (no double-counting). Sleep prefers the Watch's staged sleep over iPhone "in bed" time. Recovery shows **calibrating** until it has 7 days of history.

### 2. iCloud Calendar (tasks)

1. Create a calendar named **Tasks** if you don't have one. Every event in it is a task. When you finish one, edit the title to add **✓** (or `[x]`).
2. Share it as a link. On iPhone: Calendar → Calendars → ⓘ next to Tasks → turn on **Public Calendar** → Share Link → Copy. On Mac: Calendar → right-click Tasks → Share Calendar → **Public**.
3. Get the link (it starts with `webcal://`) onto your laptop, for example by emailing it to yourself. Then double-click **`Connect Calendar.cmd`** and paste it. (Command line: `npm run calendar -- "<link>"`.)
   The link is unguessable, but anyone who has it can read that calendar. Only that one calendar is shared.

Recurring events, deleted occurrences and edited single occurrences are handled. To mark one instance of a repeating task as done, edit only that event.

### 3. RescueTime (work)

1. Create an API key at <https://www.rescuetime.com/anapi/manage>.
2. Double-click **`Connect RescueTime.cmd`** and paste the key. (Or set it in `config.json` → `rescueTime.apiKey`, or the `RESCUETIME_API_KEY` environment variable, and run `npm run rescuetime`.)

Days with less than `work.minTrackedMinutes` of tracked time (default 30) show no data, not a low score.

## Daily use

**Automatic (recommended).** Double-click **`Schedule Daily Update.cmd`** once and pick a time (default 07:15). Every day Windows will:
- re-sync your iCloud Calendar and RescueTime,
- import a **new Apple Health export** if one has appeared in `Downloads`, your OneDrive folder or `OneDrive\Downloads` since the last import (it unzips to a temp folder and deletes it afterwards),
- rebuild `LifeDashboard\life-dashboard.html`.

If the laptop is off or asleep at that time, it runs as soon as it wakes. It runs a test straight after you set it up, and every run is logged to `LifeDashboard\update.log`. The task points at this code folder, so keep the folder somewhere permanent. If you move it or download a new version, double-click `Schedule Daily Update.cmd` again. `Stop Daily Update.cmd` removes the schedule.

**The one manual step is Apple Health.** Apple doesn't let anything export Health data on its own. When you want new days, do Health app → your picture → Export All Health Data → **Save to Files → OneDrive** (or AirDrop it to Downloads). The next update picks it up. Export in the evening or the next morning: activity on the export's own day is shown as "so far" and isn't counted in the Life Score until a later export.

**By hand:** double-click `Update Dashboard.cmd` (or `npm run refresh`) whenever you want to update now.

## On your phone

**Anywhere (recommended): Tailscale.** [Tailscale](https://tailscale.com) is a free private network that connects only your own devices. Your phone reaches the laptop directly, at home or on cellular, and your data never goes to a hosting service.

1. Install Tailscale on the laptop ([download](https://tailscale.com/download/windows)) and on your iPhone (App Store). Sign in to both with the same account.
2. Double-click **`Phone Access On.cmd`**. It starts a small hidden server now and at every login. It prints your link, e.g. `http://100.x.y.z:8787`, and checks that it answers.
3. On the iPhone, with Tailscale connected, open that link in Safari, then Share → **Add to Home Screen**.

The server listens **only** on your Tailscale address and on the laptop itself, never on the Wi-Fi you're connected to, so nobody on a shared network can reach it. The laptop must be on and online. The page reloads itself when you reopen it after 10+ minutes, so it shows the latest daily update. `Phone Access Off.cmd` stops the server and removes it from startup. Server messages go to `LifeDashboard\phone-server.log`.

If the phone can't open the link but the laptop can, Windows Firewall is probably blocking it. Allow Node.js when Windows asks, or check Windows Security → Firewall → Allow an app.

**Home Wi-Fi only, no install:** double-click `Open on Phone.cmd` and open the `192.168.x.x` link it shows. It works only while that window is open, and anyone on the same Wi-Fi who knows the address can see it.

## How scores work

All scores are 0–100 and computed in `src/scores.js`. The page only displays them.

- **Sleep**: 75% hours asleep vs goal + 25% deep+REM share vs a 40% target (hours only if there are no stages).
- **Recovery**: HRV (65%) and resting HR (35%) as standard deviations from your previous 30 days. 50 = your normal; ±2 SD reaches 100 or 0. HRV is compared on a log scale.
- **Training**: 70% exercise minutes vs goal + 30% steps vs goal. Without Apple Watch exercise minutes, logged workout minutes are used instead.
- **Work**: 60% focused hours (RescueTime productive + very productive) vs goal + 40% productivity pulse.
- **Tasks**: done ÷ planned for that day. No tasks planned = no data.
- **Life Score**: weighted mean of the pillars with data that day. Missing pillars' weights are spread across the rest. DEMO pillars are excluded. If nothing is connected, the ring shows a labeled DEMO preview built only from DEMO data.
- **Bands**: ▲ Strong 67–100 · ● Steady 34–66 · ▼ Low 0–33.

## Files

```
src/sources/   apple-health.js, calendar.js, rescuetime.js   fetch + verify → data/*.json
src/lib/       Apple Health stream parser, iCalendar parser, time zones, config
src/scores.js  all scoring
src/demo.js    DEMO data for unconnected sources
src/build.js   scores + template.html → LifeDashboard/life-dashboard.html
src/connect.js prompt for a link/key, save it, sync, build (used by the .cmd files)
src/refresh.js daily update: new Health export from Downloads/OneDrive, calendar, RescueTime, build
src/schedule.js registers/removes the Windows scheduled task
src/serve.js   serves the dashboard for the phone (Wi-Fi window, or Tailscale-only background)
src/phone.js   turns always-on Tailscale phone access on/off
test/          npm test (synthetic fixtures only)
```
