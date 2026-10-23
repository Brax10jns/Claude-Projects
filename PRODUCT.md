# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS with no build step, published by GitHub Pages (Jekyll) from the `main` branch of `Brax10jns/Claude-Projects`. The app itself (`resume-gauntlet/`) is a single `index.html` plus a small Node `server.js`.

## Users

- **Employers and recruiters** looking at the author's work: they want to see what was built, how it works and the judgment behind it, quickly.
- **Job seekers** who want to run Resume Gauntlet on their own resume: they need to understand what it does and how to set it up locally.

Both audiences matter equally on the public site.

## Product Purpose

Claude Projects is a home for projects the author designed and built with Claude. The first is **Resume Gauntlet**: it screens a resume the way an applicant tracking system would, rewrites it to pass (truthfully), then runs it past four AI reviewers (the Interviewer, the Rival Applicant, the Field Expert, the Executive) and walks the user through fixing every issue they flag, ending with an editable, downloadable final resume.

## Positioning

Resume Gauntlet is not a one-shot "AI resume rewriter". Its mechanism is a staged gauntlet: an ATS screen with scores computed in the page (not by the model), verified keywords, four reviewers with distinct temperaments and weighted criteria, and rewrites that never invent employers, dates, tools or numbers, leaving `[ADD: ...]` placeholders instead.

## Operating Context

- Runs locally: `npm install`, `npm run set-key` (Windows) or `ANTHROPIC_API_KEY`, `npm start`, then http://127.0.0.1:3000.
- The same `index.html` also runs as a claude.ai artifact using the viewer's Claude account.
- GitHub Pages cannot run reviews (no server to hold the API key). There is no hosted demo link.

## Capabilities and Constraints

- ATS score = 30% parse checks + 50% keyword match + 20% share of bullets with a number, minus 10 per knockout and 5 per critical flag; pass mark 75 with no critical flags; up to two rewrites.
- Reviewer score = weighted criteria (1–10) scaled to 100.
- Built-in non-AI checks: missing contact details, weak openers, buzzwords, first person, mixed date formats, length.
- Flags quoting text not found in the resume are discarded.
- Reads PDF (PDF.js), .docx (from XML) and text; exports PDF (jsPDF) and text.
- About 6–11 Claude calls per round, billed to the user's own Anthropic account.
- Privacy: resume sent to Anthropic only when a review runs; server keeps no copies; drafts live in browser local storage.

## Evidence on Hand

- Source and READMEs in this repo. No screenshots, testimonials, users, metrics or press exist; do not fabricate any.

## Product Principles

1. Honesty over polish: never invent facts on a resume, and never overclaim on the site.
2. Show the mechanism: explain how scores and reviews work, not just that they exist.
3. Respect both readers: a recruiter skimming and a user setting it up should each find their path fast.
4. Be clear about limits: it's a simulation; real ATSs and reviewers differ.
