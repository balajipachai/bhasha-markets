// Single-page review lane: English and translation side by side, problem highlighted,
// edit box that re-checks on every save, and a publish button that only works when ready.
export const REVIEW_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bhasha Markets review</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 16px; }
  .lang { border: 1px solid #ccc; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 640px) { .cols { grid-template-columns: 1fr; } }
  .box { background: #f6f6f6; padding: 8px; border-radius: 6px; white-space: pre-wrap; }
  mark { background: #ffd54f; } mark.bad { background: #ef9a9a; }
  textarea { width: 100%; min-height: 4.5em; font: inherit; margin-top: 4px; }
  .ready { color: #1b6e3a; } .blocked { color: #b3261e; } .issue { color: #b3261e; margin: 2px 0; }
  button { padding: 6px 12px; font: inherit; margin-right: 8px; }
</style></head><body>
<h1>Bhasha Markets review</h1>
<p>A version can only be published when every number, date and comparator word matches the English. Highlights show where.</p>
<div id="root"></div>
<script>
const FIELDS = [["question", "Question"], ["resolutionRules", "Resolution rules"], ["resolutionSource", "Resolution source"]];
const NAMES = { hi: "Hindi", ta: "Tamil", mr: "Marathi" };
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function mark(text, ranges, cls) {
  const rs = [...ranges].sort((a, b) => a.start - b.start);
  let out = "", pos = 0;
  for (const r of rs) { if (r.start < pos) continue; out += esc(text.slice(pos, r.start)) + '<mark class="' + cls + '">' + esc(text.slice(r.start, r.end)) + "</mark>"; pos = r.end; }
  return out + esc(text.slice(pos));
}
async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  return { ok: r.ok, data: await r.json() };
}
async function render() {
  const { data } = await api("/api/session");
  const root = document.getElementById("root"); root.innerHTML = "";
  for (const lang of ["hi", "ta", "mr"]) {
    const v = data.versions[lang];
    const div = document.createElement("div"); div.className = "lang";
    let html = "<h2>" + NAMES[lang] + ' <span class="' + (v.status === "ready" ? "ready" : "blocked") + '">' + (v.status === "ready" ? "ready" : "needs review") + "</span></h2>";
    for (const [f, label] of FIELDS) {
      const issues = v.issues.filter((i) => i.field === f);
      html += "<h3>" + label + '</h3><div class="cols"><div class="box">' + mark(data.source[f], issues.flatMap((i) => i.sourceRanges), "bad") + '</div><div class="box">' + mark(v[f], issues.flatMap((i) => i.translationRanges), "bad") + "</div></div>";
      html += issues.map((i) => '<div class="issue">' + esc(i.message) + "</div>").join("");
      html += '<textarea data-lang="' + lang + '" data-field="' + f + '">' + esc(v[f]) + '</textarea><button data-recheck="' + lang + '|' + f + '">Save and re-check</button>';
    }
    html += '<p><button data-publish="' + lang + '"' + (v.status === "ready" ? "" : " disabled") + ">Publish " + NAMES[lang] + '</button><span id="msg-' + lang + '"></span></p>';
    div.innerHTML = html; root.appendChild(div);
  }
  root.querySelectorAll("[data-recheck]").forEach((b) => b.onclick = async () => {
    const [lang, field] = b.dataset.recheck.split("|");
    const text = root.querySelector('textarea[data-lang="' + lang + '"][data-field="' + field + '"]').value;
    await api("/api/revise", { lang, field, text }); render();
  });
  root.querySelectorAll("[data-publish]").forEach((b) => b.onclick = async () => {
    const lang = b.dataset.publish; const r = await api("/api/publish", { lang });
    document.getElementById("msg-" + lang).textContent = r.ok ? " Published." : " " + r.data.error;
  });
}
render();
</script></body></html>`;
