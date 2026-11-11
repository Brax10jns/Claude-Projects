# Essay Gauntlet

Run your essay through a rubric screen and a panel of four very different readers, then fix every issue they flag, all in one page. It's built on the same foundation as [Resume Gauntlet](../resume-gauntlet/): same server, same five-desk layout, same scoring rules and grounding checks.

1. **Rubric screen.** Checks the essay the way a strict grader with the assignment in hand would: structure checks, the assignment's requirements (each one verified against a line actually in your essay), how well claims are supported, and knockouts such as missing the word count. If it falls short, it's revised to meet the assignment, in your voice and without inventing anything, then screened again (up to two revisions).
2. **Review panel.** Four readers go through the version that passed. Each has their own temperament, scoring criteria and focus:
   - **The Classmate:** a student at your level reading it in peer review. Where did they get lost, bored or unconvinced?
   - **The Teacher / Professor / Editor:** grades it against the assignment and the level's expectations, and gives a letter grade. A teacher through high school (including AP/IB), a professor in college and graduate school, and an editor for professional or publication work.
   - **The Seasoned Writer:** a writer a step or two further along than you, mentoring on craft: voice, sentences, structure, depth, and techniques to raise it a level.
   - **The Renowned Expert:** an authority with decades in the essay's subject, judging accuracy, depth, nuance and engagement with the field's real ideas and debates.

   Each one gives a first impression, a full review, criteria scores, flagged issues and questions tied to specific lines of your essay.
3. **Fix.** Choose which flags to apply, fill in details only you know, and answer the readers' questions.
4. **Final essay.** Edit it by hand, find blind spots, download it as a PDF (Times 12 pt, double-spaced, with a hanging-indent Works Cited page) or a text file, and run it through the whole gauntlet again.

The revising agents never invent quotations, sources, statistics or experiences. Where a stronger paragraph needs evidence, they leave a placeholder such as `[ADD: a credible source on downtown air quality]` for you to fill in with something real.

> If this is for a class, check your school's policy on AI help before you submit a revised version.

## Quick start

You need [Node.js](https://nodejs.org) 18 or later and an [Anthropic API key](https://console.anthropic.com/settings/keys).

```bash
git clone https://github.com/Brax10jns/Claude-Projects.git
cd Claude-Projects/essay-gauntlet
npm install
```

Save your API key as a Windows environment variable (if you already did this for Resume Gauntlet, you can skip it: both apps read the same `ANTHROPIC_API_KEY`):

```bash
npm run set-key
```

Then **open a new terminal** in the project folder and start the app:

```bash
npm start
```

Then open **http://127.0.0.1:3001** in your browser. Essay Gauntlet uses port 3001 so it can run alongside Resume Gauntlet on 3000.

On macOS or Linux, set the key in your shell instead (`export ANTHROPIC_API_KEY=...`), or copy `.env.example` to `.env` and fill it in.

### One-click launch on Windows

```bash
npm run install-shortcuts
```

This adds an **Essay Gauntlet** shortcut to your desktop and starts the server quietly each time you sign in to Windows. Server output goes to `%LOCALAPPDATA%\EssayGauntlet\server.log`. To undo it (and stop the server), run `npm run remove-shortcuts`.

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic API key. It stays on the server and is never sent to the browser. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | The Claude model used for every review. |
| `PORT` | `3001` | Port the server listens on. |
| `HOST` | `127.0.0.1` | Interface to listen on. Keep it local unless the server sits behind your own login. |

## How it works

```
index.html        The whole app: interface, prompts, scoring and file handling (no build step)
server.js         Serves index.html and relays the page's prompts to Claude with your API key
set-api-key.ps1   Windows helper behind npm run set-key / remove-key
launch.ps1        Starts the server in the background if needed and opens the app (npm run open)
install-shortcuts.ps1  Desktop shortcut and sign-in startup entry
```

- `server.js` is the same as Resume Gauntlet's: the page posts each prompt to `POST /api/claude`, which streams the answer back. Revisions use the `complex` tier (high effort); reviews use `default`.
- Scores are computed in the page, not by the model, so every attempt is judged the same way:
  - **Rubric score** = 30% structure checks + 50% requirements met + 20% supported claims (the share of body paragraphs with a quotation, citation, figure or attribution; for narrative and personal essays, concrete detail), minus 10 per knockout and 5 per critical flag. Pass mark: 75 with no critical flags.
  - **Reader score** = each reader's weighted criteria (1–10), scaled to 100. The instructor's score also maps to a letter grade (93+ A, 90 A−, 87 B+ … below 60 F).
- A requirement only counts as met when the line the model cites as evidence is really in your essay. Any flag or question that quotes text not found in your essay is discarded.
- Built-in checks that don't depend on the AI run on every screen: word count against the stated requirement, paragraph count and length, stock openers ("In today's society…"), "In conclusion", second person and contractions in formal essays, vague filler words, "studies show" with no source, missing Works Cited / References and in-text citations, and very long sentences.
- Uploads are read in the browser: PDF via [PDF.js](https://mozilla.github.io/pdf.js/) (paragraphs are rebuilt from the page layout, and running heads and page numbers are dropped), Word `.docx` from its XML (body, tables, text boxes, footnotes and endnotes), plus plain text. PDFs are generated with [jsPDF](https://github.com/parallax/jsPDF).

The same `index.html` also runs as a claude.ai artifact, using the viewer's own Claude account instead of `server.js`.

### Customizing

All of these live in the `<script>` section of `index.html`:

- `PANEL`: each reader's persona, temperament, focus, calibration and weighted criteria. `instructor()` picks teacher, professor or editor from the level; `AHEAD` sets who the Seasoned Writer is at each level.
- `LEVELS`, `TYPES`, `STYLES`: the intake choices.
- `STRUCTURE_CHECKS`: the checks the rubric screen rules on.
- `PASS` and `MAX_OPT`: the pass mark and how many revisions to attempt.
- `lintEssay()`: the built-in checks.

## Privacy, cost and limits

- Your essay is sent to Anthropic's API only when a review runs. The server keeps no copies and logs no content. Results and drafts are saved only in your browser's local storage.
- Every round makes about 6–11 Claude calls (up to 3 screens and 2 revisions, 4 reviews and 1 final revision, plus optional blind-spot questions), billed to your Anthropic account at the [standard API rates](https://www.anthropic.com/pricing).
- The server only accepts requests from its own page and listens on `127.0.0.1` by default. Don't expose it publicly without adding your own authentication.
- The rubric screen is a simulation; real teachers and rubrics differ. The readers are AI personas, and their feedback can be wrong or miss context; the Renowned Expert in particular can misremember sources, so check any work it names before you cite it.
