# Resume Gauntlet

Run your resume through an applicant-tracking-system screen and a panel of four tough reviewers, then fix every issue they flag, all in one page.

1. **ATS screen.** Scores the resume the way an applicant tracking system and a recruiter's filters would: parse checks, required keywords (verified against your actual text), measurable results and knockouts. If it fails, it is rewritten to pass, truthfully, and screened again (up to two rewrites).
2. **Review panel.** Four reviewers read the version that passed, each with their own temperament, scoring criteria and focus:
   - **The Interviewer:** a hiring manager probing credibility and consistency.
   - **The Rival Applicant:** a strong competitor comparing you with the top 10% of applicants.
   - **The Field Expert:** a senior practitioner judging technical and domain depth.
   - **The Executive:** a VP judging business value in a 30-second skim.

   Each one gives a first impression, a full review, criteria scores, flagged issues and questions tied to specific lines of your resume.
3. **Fix.** Choose which flags to apply, fill in details only you know, and answer the reviewers' questions.
4. **Final resume.** Edit it by hand, find blind spots, download it as a PDF or text file, and run it through the whole gauntlet again.

The rewriting agents never invent employers, dates, tools or numbers. Where a stronger line needs a fact, they leave a placeholder such as `[ADD: % time saved]` for you to fill in.

## Quick start

You need [Node.js](https://nodejs.org) 18 or later and an [Anthropic API key](https://console.anthropic.com/settings/keys).

```bash
git clone <your-repo-url> resume-gauntlet
cd resume-gauntlet
npm install
```

Save your API key as a Windows environment variable. This runs a small PowerShell script that asks for the key without showing it on screen and stores it in your Windows user profile, not in the project folder:

```bash
npm run set-key
```

Then **open a new terminal** in the project folder (Windows only passes the new variable to programs started after the change) and start the app:

```bash
npm start
```

To delete the saved key later, run `npm run remove-key`.

On macOS or Linux, set the key in your shell instead (`export ANTHROPIC_API_KEY=...`), or copy `.env.example` to `.env` and fill it in.

Then open **http://127.0.0.1:3000** in your browser.

## Configuration

Set these as environment variables (on Windows, `npm run set-key` handles the API key). A `.env` file also works as a fallback; real environment variables take precedence over it.

| Variable | Default | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic API key. It stays on the server and is never sent to the browser. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | The Claude model used for every review. |
| `PORT` | `3000` | Port the server listens on. |
| `HOST` | `127.0.0.1` | Interface to listen on. Keep it local unless the server sits behind your own login. |

## How it works

```
index.html        The whole app: interface, prompts, scoring and file handling (no build step)
server.js         Serves index.html and relays the page's prompts to Claude with your API key
set-api-key.ps1   Windows helper behind npm run set-key / remove-key
```

- The page sends each agent's prompt to `POST /api/claude`. The server calls the Claude Messages API with the official [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) and streams the answer back.
- Each prompt carries a tier (`quick`, `default`, `complex`) that sets the model's effort (`low`, `medium`, `high`). Rewrites use `complex`; reviews use `default`.
- Server-side refusal fallback is enabled (`fallbacks: "default"`). If the model declines a request, the API re-runs it on a fallback model inside the same call.
- Scores are computed in the page, not by the model, so every attempt is judged the same way:
  - **ATS score** = 30% parse checks + 50% keyword match + 20% share of bullets with a number, minus 10 per knockout and 5 per critical flag. Pass mark: 75 with no critical flags.
  - **Reviewer score** = each reviewer's weighted criteria (1–10), scaled to 100.
- Built-in checks that don't depend on the AI (missing contact details, weak bullet openers, buzzwords, first person, mixed date formats, length and more) run on every screen.
- Any flag that quotes text not found in your resume is discarded, and keywords only count when their words actually appear in it.
- Uploaded files are read in the browser: PDF via [PDF.js](https://mozilla.github.io/pdf.js/), Word `.docx` directly from its XML (including page headers and footers, tables and text boxes), plus plain text. PDFs are generated with [jsPDF](https://github.com/parallax/jsPDF). All three libraries load from cdnjs.

The same `index.html` also runs as a claude.ai artifact. There it uses the viewer's own Claude account instead of `server.js`.

### Customizing

All of these live in the `<script>` section of `index.html`:

- `PANEL`: each reviewer's persona, temperament, focus, calibration and weighted criteria.
- `PARSE_CHECKS`: the checks the ATS screen rules on.
- `PASS` and `MAX_OPT`: the ATS pass mark and how many rewrites to attempt.
- `lintResume()`: the built-in checks.

## Privacy and security

- Your resume is sent to Anthropic's API only when a review runs. The server keeps no copies and logs no content.
- Results and drafts are saved only in your browser's local storage. Clearing site data removes them.
- On Windows the API key lives in your user environment (set by `npm run set-key`), outside the project folder, so it can't be committed or picked up by a synced folder such as OneDrive. If you use a `.env` file instead, `.gitignore` keeps it out of the repository; never commit it.
- The server only accepts requests from its own page and listens on `127.0.0.1` by default. Anyone who can reach it can spend your API credit, so don't expose it publicly without adding your own authentication.

## Cost

Every round makes about 6–11 Claude calls: up to 3 screens and 2 rewrites, 4 reviews and 1 final rewrite, plus optional blind-spot questions. These are billed to your Anthropic account at the [standard API rates](https://www.anthropic.com/pricing) for the model you choose. You can check usage in the [Claude Console](https://console.anthropic.com).

## Deploying

The app needs `server.js` running to hold the API key, so a static host such as GitHub Pages can't run it on its own. You can run it locally or on any Node host. If others will use your deployment, put it behind authentication first.

## Limitations

The ATS screen is a simulation of how applicant tracking systems and recruiters typically filter resumes; real systems differ by employer. The reviewers are AI personas, and their feedback can be wrong or miss context. Check every change before you send your resume anywhere.
