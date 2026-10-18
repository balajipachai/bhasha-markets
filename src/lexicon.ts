export const LANGS = ["hi", "ta", "mr"] as const;
export type Lang = (typeof LANGS)[number];
export type AnyLang = Lang | "en";

export const LANG_NAMES: Record<Lang, string> = { hi: "Hindi", ta: "Tamil", mr: "Marathi" };

export const nfc = (s: string) => s.normalize("NFC");

// Native-script digit blocks, each starting at the zero digit.
const DIGIT_ZEROS = [0x0966 /* Devanagari (Hindi, Marathi) */, 0x0be6 /* Tamil */];

export function normalizeDigits(text: string): string {
  let out = "";
  for (const ch of nfc(text)) {
    const cp = ch.codePointAt(0)!;
    const zero = DIGIT_ZEROS.find((z) => cp >= z && cp < z + 10);
    out += zero === undefined ? ch : String(cp - zero);
  }
  return out;
}

// Month names per language, plus English (translators often leave these in Latin script).
const MONTHS: Record<AnyLang, string[][]> = {
  en: [
    ["january", "jan"], ["february", "feb"], ["march", "mar"], ["april", "apr"], ["may"], ["june", "jun"],
    ["july", "jul"], ["august", "aug"], ["september", "sept", "sep"], ["october", "oct"], ["november", "nov"], ["december", "dec"],
  ],
  hi: [
    ["जनवरी"], ["फरवरी", "फ़रवरी"], ["मार्च"], ["अप्रैल"], ["मई"], ["जून"],
    ["जुलाई"], ["अगस्त"], ["सितंबर", "सितम्बर"], ["अक्टूबर", "अक्तूबर"], ["नवंबर", "नवम्बर"], ["दिसंबर", "दिसम्बर"],
  ],
  mr: [
    ["जानेवारी"], ["फेब्रुवारी"], ["मार्च"], ["एप्रिल"], ["मे"], ["जून"],
    ["जुलै"], ["ऑगस्ट"], ["सप्टेंबर"], ["ऑक्टोबर"], ["नोव्हेंबर"], ["डिसेंबर"],
  ],
  ta: [
    ["ஜனவரி"], ["பிப்ரவரி"], ["மார்ச்"], ["ஏப்ரல்"], ["மே"], ["ஜூன்"],
    ["ஜூலை"], ["ஆகஸ்ட்"], ["செப்டம்பர்"], ["அக்டோபர்"], ["நவம்பர்"], ["டிசம்பர்"],
  ],
};

export function monthTable(lang: AnyLang): Map<string, number> {
  const table = new Map<string, number>();
  for (const l of lang === "en" ? (["en"] as const) : ([lang, "en"] as const)) {
    MONTHS[l].forEach((names, i) => names.forEach((n) => table.set(nfc(n).toLowerCase(), i + 1)));
  }
  return table;
}

export type Unit = { word: string; multiplier: number; percent: boolean };

const u = (word: string, multiplier: number, percent = false): Unit => ({ word: nfc(word).toLowerCase(), multiplier, percent });

const COMMON: Unit[] = [u("%", 1, true), u("percent", 1, true), u("thousand", 1e3), u("lakhs", 1e5), u("lakh", 1e5), u("crores", 1e7), u("crore", 1e7), u("million", 1e6), u("billion", 1e9)];

// Unit words that follow a number, so "1 lakh" and "1 लाख" compare equal but "1 crore" does not.
const UNITS: Record<AnyLang, Unit[]> = {
  en: COMMON,
  hi: [...COMMON, u("प्रतिशत", 1, true), u("फीसदी", 1, true), u("हज़ार", 1e3), u("हजार", 1e3), u("लाख", 1e5), u("करोड़", 1e7), u("मिलियन", 1e6), u("अरब", 1e9)],
  mr: [...COMMON, u("टक्के", 1, true), u("टक्का", 1, true), u("हजार", 1e3), u("लाख", 1e5), u("कोटी", 1e7), u("दशलक्ष", 1e6), u("अब्ज", 1e9)],
  ta: [...COMMON, u("சதவீதம்", 1, true), u("ஆயிரம்", 1e3), u("இலட்சம்", 1e5), u("லட்சம்", 1e5), u("கோடி", 1e7), u("மில்லியன்", 1e6), u("பில்லியன்", 1e9)],
};

export function unitsFor(lang: AnyLang): Unit[] {
  return [...UNITS[lang]].sort((a, b) => b.word.length - a.word.length);
}
