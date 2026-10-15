# Paycheck X-Ray

A single-page tool that reads a year of bi-weekly pay stubs and shows:

- **Pay calendar**: which paydays are loaded or missing, and which months have three checks
- **Where the gross went**: take-home, federal tax, Social Security and Medicare, state and local tax, 401(k), health insurance and HSA, plus what your employer pays on top
- **Stub checks**: section totals, net pay, year-to-date carry-forward, FICA rates, and changes between checks
- **W-2 preview**: year-to-date and projected Dec 31 box amounts
- **Federal withholding check**: projected refund or amount owed, including side-business income
- **Savings pace**: 401(k) and HSA against the IRS limits, and a combined you-plus-employer 401(k) total

## Privacy

This repo contains **no pay data**. Everything you add is stored in your browser's `localStorage` on your device and is never sent to a server. The page has no analytics and makes no network requests beyond Google Fonts and, only when you open a PDF, the pdf.js library from cdnjs.

Don't commit stubs, PDFs, or backups to this repo. `.gitignore` blocks the common ones.

## Adding stubs

- **Paste**: open a statement in your pay portal, press Ctrl+A then Ctrl+C, and paste it into **Add stubs**. Several statements in one paste is fine.
- **PDF**: use the portal's Print → Save as PDF, then choose the file. Scanned or photographed PDFs can't be read.
- **Backup**: **Copy backup** puts all your stubs and settings on the clipboard as text. Paste that text into **Add stubs** on any device to restore.

## Home screen (iPhone)

1. Open the GitHub Pages URL in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Open the app from the home screen and paste your backup into **Add stubs**.

On iPhone, a home-screen app keeps its own storage, separate from Safari. Restore your backup inside the home-screen app itself, not in a Safari tab.

## Tax figures

2026 values: single-filer brackets and $16,100 standard deduction, $24,500 401(k) deferral limit with an $8,000 catch-up at 50+ ($11,250 at ages 60–63), $72,000 total plan limit before catch-up, $184,500 Social Security wage base, and HSA limits of $4,400 self-only or $8,750 family plus a $1,000 catch-up at 55+. These are estimates, not tax advice.
