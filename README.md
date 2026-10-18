# Bhasha Markets

Takes one finished English market (question, resolution rules, resolution source, close date) and produces Hindi, Tamil and Marathi versions. A version cannot be published if anything checkable in it doesn't match the English: numbers, dates, or the comparator words ("before", "by", "at least"…) that decide who wins.

## Run

```sh
npm install
export ANTHROPIC_API_KEY=...                    # see .env.example; never commit it
npm run translate -- fixtures/market.json       # or any file in fixtures/samples/
npm run review                                  # review lane at http://localhost:4000
npm test                                        # offline, uses fixture translations
```

`translate` writes `out/session.json` and prints the status of each language. `review` opens the review lane: the English and the translation side by side with the problem highlighted, a plain-language reason for each flag, a box to edit the translation (it is re-checked on every save), and a Publish button that is refused unless the version is clean. Published versions go to `out/published/<lang>.json`.

## What is checked, and how

- **Numbers and dates** (`src/invariants.ts`): extracted from the English and from each translation by regex, no model. Devanagari and Tamil digits are normalised, grouping commas are ignored (`1,00,000` = `100,000`), unit words are understood (`1 लाख` = 1,00,000, `1 करोड़` is not), and month names in all three languages are mapped. Any missing or extra value blocks the version.
- **Comparator words** (`src/comparators.ts`): this is the "before 15 June" became "by 15 June" incident. The English is scanned for before / by / after / on or after / at least / more than / less than / at most. The translation is scanned for the matching wording in its own language. A swapped comparator (before → by) is flagged as a conflict; wording the tool can't find goes to a human rather than passing. "by 25 basis points" is not treated as a deadline; "by" only counts when a date follows.
- **Gate** (`src/pipeline.ts`): a failed check sets `needs_review`, and `publishVersion` refuses it. A reviewer's edit re-runs every check from scratch.
- **Translator** (`src/translator.ts`): Claude by default. Any object with `translate(text, lang)` works (for example Sarvam Translate, which caps requests at 2,000 characters). Nothing depends on the translator being right, since the checks run in code.

## Samples and tests

- `fixtures/market.json` and `fixtures/samples/*.json`: markets with the tricky cases (deadlines, "on or before", "at least", "fewer than", lakh and crore).
- `fixtures/translations.json`: good translations, plus deliberately wrong ones: changed date, lakh turned into crore, changed percentage, and "before" turned into "by" in all three languages.

## Limits

Comparator markers cover the common phrasings in each language, not every possible wording. A translation that phrases it some other way is sent to a reviewer instead of passing. The Hindi, Tamil and Marathi lexicons were written without a native-speaker review, so please have one look over `src/lexicon.ts` and `src/comparators.ts`.
