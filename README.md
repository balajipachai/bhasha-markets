# Bhasha Markets

Takes one finished English market (question + resolution rules) and produces Hindi, Tamil and Marathi versions. A version is blocked from publishing if any number or date in it doesn't match the English.

## Run

```sh
npm install
export ANTHROPIC_API_KEY=...        # see .env.example; never commit it
npm run translate -- fixtures/market.json
npm test                            # offline, uses fixture translations
```

`translate` writes `out/<lang>.json` for versions that pass and prints the reasons for any that are blocked.

## How it works

- `src/pipeline.ts`: requests all three languages for both the question and the resolution rules, checks each result against the English, and sets `ready` or `needs_review`. `publishVersion` refuses anything not `ready`.
- `src/invariants.ts`: deterministic extraction (regex, no model) of dates and numbers (including percentages and unit words) from the English and from each translation, then a multiset comparison. Any missing or unexpected value blocks the version.
- `src/lexicon.ts`: normalises Devanagari and Tamil digits to ASCII, and holds month names and unit words (lakh/crore and their Hindi, Tamil and Marathi forms). Grouping commas are dropped, so `1,00,000`, `100,000` and `1 लाख` compare equal while `1 करोड़` does not.
- `src/translator.ts`: the default translator calls Claude. Any object with `translate(text, lang)` can replace it (for example Sarvam Translate); correctness doesn't depend on it because the check runs in code.
- `fixtures/translations.json`: good translations and deliberately wrong ones (changed date, lakh turned into crore, changed percentage) used by `test/invariants.test.ts`.

## Limits

The check covers what code can verify: numbers, percentages, units and dates. It can't tell that "before" turned into "by"; those cases still need a human reviewer.
