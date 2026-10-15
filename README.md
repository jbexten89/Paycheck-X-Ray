# Paycheck X-Ray

A single-page tool that reads a year of bi-weekly pay stubs and shows:

- **Pay calendar**: which paydays are loaded or missing, and which months have three checks. Tap a payday to open that check.
- **One check**: pick any paycheck (list, arrows, or the calendar) to see where it went and every line on the stub, with year-to-date and the change from the previous check
- **Where the gross went**: take-home, federal tax, Social Security and Medicare, state and local tax, 401(k), health insurance and HSA, plus what your employer pays on top
- **Stub checks**: section totals, net pay, year-to-date carry-forward, FICA rates, and changes between checks
- **W-2 preview**: year-to-date and projected Dec 31 box amounts
- **Federal withholding check**: projected refund or amount owed, including side-business income
- **Savings pace**: 401(k) and HSA against the IRS limits, and a combined you-plus-employer 401(k) total
- **Time off**: vacation, personal, sick and bereavement days by year (from 2014, when stubs list them separately), which months you take vacation, and a dot in the pay calendar on checks that paid time off
- **All years**: a year-over-year view with totals since your first stub, where each year's pay went, base pay and every raise against inflation, tax rates, 401(k) against the limit, health costs, bonuses and overtime, and a sortable table of every year. Records and milestones (biggest and smallest checks, raise streak, years at the 401(k) limit, three-paycheck months), total compensation including what your employer pays, Tax Freedom Day, and pay per hour. Switch between dollars as paid and after inflation (CPI-U).

## Privacy

This repo contains **no pay data**. Everything you add is stored in your browser's `localStorage` on your device and is never sent to a server. The page has no analytics. Its only network requests are for Google Fonts, the pdf.js library from cdnjs when you open a PDF, and the tesseract.js engine and English language data when you read a photo. Those are downloads; nothing you add is sent.

Don't commit stubs, PDFs, or backups to this repo. `.gitignore` blocks the common ones.

## Adding stubs

- **Paste**: open a statement in your pay portal, press Ctrl+A then Ctrl+C, and paste it into **Add stubs**. Several statements in one paste is fine.
- **PDF**: use the portal's Print → Save as PDF, then choose the file. Scanned or photographed PDFs can't be read.
- **Photo**: tap **+ Stub photo** and take a picture of the statement, or pick one from your library. Text recognition runs on your device with [tesseract.js](https://github.com/naptha/tesseract.js), and the photo is never uploaded. The first time, it downloads the recognition engine (about 15 MB), which is cached after that. Photos are matched against the previous stub you saved: every line's year-to-date has to equal last year-to-date plus this check, and each section has to add up. A review screen shows what was read and highlights anything it couldn't confirm. You can edit numbers, name new lines, and add a missing line before saving.
- **Text file**: tap **Choose text file** to load a backup file (.txt or .json) or a saved copy of statement text.
- **Backup file**: **Save backup file** saves every stub and your settings as one .txt file. On iPhone it opens the share sheet; choose **Save to Files**. Load it back any time with **Choose text file**.
- **Backup**: **Copy backup** puts all your stubs and settings on the clipboard as text. Paste that text into **Add stubs** on any device to restore.

## Home screen (iPhone)

1. Open the GitHub Pages URL in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Open the app from the home screen and paste your backup into **Add stubs**.

On iPhone, a home-screen app keeps its own storage, separate from Safari. Restore your backup inside the home-screen app itself, not in a Safari tab.

## Tax figures

2026 values: single-filer brackets and $16,100 standard deduction, $24,500 401(k) deferral limit with an $8,000 catch-up at 50+ ($11,250 at ages 60–63), $72,000 total plan limit before catch-up, $184,500 Social Security wage base, and HSA limits of $4,400 self-only or $8,750 family plus a $1,000 catch-up at 55+. These are estimates, not tax advice.
