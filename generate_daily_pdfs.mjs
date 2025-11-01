// generate_daily_pdfs.mjs
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const CONVERTER_URL = "https://wordsearchtoprint.com/auto_pdf_to_jpg.php";
const TOKEN = process.env.CONVERTER_TOKEN || ""; // set in Render env
if (!TOKEN) throw new Error("Please set CONVERTER_TOKEN environment variable");

const topics = [
  { url: "https://wordsearchtoprint.com/puzzles/Daily-Inspirational-Large-Print-Word-Search-test.html", topic: "inspirational" },
  { url: "https://wordsearchtoprint.com/puzzles/Daily-Relaxing-Large-Print-Word-Search-test.html", topic: "relaxing" },
  { url: "https://wordsearchtoprint.com/puzzles/Daily-History-Themed-Large-Print-Word-Search-test.html", topic: "history" }
];

const today = new Date().toISOString().split("T")[0];
const LOGFILE = `upload-summary-${today}.txt`;
function log(s){
  const line = `${new Date().toISOString()} - ${s}\n`;
  fs.appendFileSync(LOGFILE, line);
  console.log(s);
}

async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function urlListFromFolder(folderUrl, timeout = 7000){
  try {
    const controller = new AbortController();
    const id = setTimeout(()=>controller.abort(), timeout);
    const res = await fetch(folderUrl, { method: "GET", signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return [];
    const html = await res.text();
    const matches = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map(m => m[1]);
    return matches;
  } catch (e) {
    return [];
  }
}

async function callConverter(filename, tries = 3, waitMs = 8000){
  const q = `?token=${encodeURIComponent(TOKEN)}&topic=inspirational&filename=${encodeURIComponent(filename)}`;
  const url = `${CONVERTER_URL}${q}`;
  for (let i=1;i<=tries;i++){
    log(`Converter attempt ${i}/${tries} -> ${url}`);
    try {
      const res = await fetch(url, { method: "GET" });
      const raw = await res.text();
      log(`Converter HTTP ${res.status} - ${raw.slice(0,1000)}`);
      try {
        const json = JSON.parse(raw);
        if (res.ok && json.status === "ok") return { ok: true, json };
      } catch {}
      if (i < tries) await sleep(waitMs);
      else return { ok: false, raw, status: res.status };
    } catch (err){
      log(`Converter fetch error: ${err.message}`);
      if (i < tries) await sleep(waitMs);
      else return { ok: false, error: err.message };
    }
  }
}

async function pollForPdf(baseUrl, candidates, maxAttempts=24, intervalMs=5000){
  // maxAttempts × intervalMs = total wait time (default 24*5s = 120s)
  for (let i=0;i<maxAttempts;i++){
    const list = await urlListFromFolder(baseUrl);
    log(`🧾 [${i}] Latest on server: ${list.length ? list[0] : '(none)'}`);
    for (const cand of candidates) {
      const found = list.find(f => f.toLowerCase().includes(cand.replace(/_/g, "-").toLowerCase()));
      if (found) return `${baseUrl}${found}`;
    }
    await sleep(intervalMs);
  }
  return null;
}

async function runTopic(browser, {url, topic}){
  const PDF_BASE = `https://wordsearchtoprint.com/auto-pdfs/${topic}/`;
  const parts = today.split("-");
  const altDate = `${parts[1]}_${parts[2]}_${parts[0]}`; // mm_dd_yyyy
  const filenameCandidates = [
    `todays-${topic}-large-print-word-search-${altDate}.pdf`,
    `todays-${topic}-large-print-word-search-${today.replace(/-/g,"_")}.pdf`,
    `todays-${topic}-large-print-word-search-${today}.pdf`,
    `daily-${topic}-${today}.pdf`
  ];

  log(`\n🚀 ${topic.toUpperCase()} — Loading: ${url}`);
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    log("⏳ Waiting 12s for JS initialization...");
    await sleep(12000);
    const btn = await page.$("#pdfBtn");
    if (!btn) {
      log(`❌ [${topic}] #pdfBtn not found`);
      await page.screenshot({ path: `debug-${topic}.png`, fullPage: true });
      return { topic, ok: false, reason: "no-pdfBtn" };
    }
    log("🔘 Clicking #pdfBtn to generate & upload PDF");
    await btn.click();
    // poll the topic folder (up to 2 minutes)
    const found = await pollForPdf(PDF_BASE, filenameCandidates, 24, 5000);
    if (!found) {
      log(`❌ [${topic}] PDF not detected within poll time`);
      return { topic, ok: false, reason: "no-pdf-found" };
    }
    const foundFilename = found.split("/").pop();
    log(`✅ [${topic}] PDF found: ${foundFilename}`);
    log(`⚙️ Triggering converter for: ${foundFilename}`);
    const conv = await callConverter(foundFilename, 4, 10000);
    if (conv.ok) {
      log(`🎉 [${topic}] Conversion success`);
      return { topic, ok: true, data: conv.json };
    } else {
      log(`❌ [${topic}] Conversion failed: ${JSON.stringify(conv)}`);
      return { topic, ok:false, conv };
    }
  } catch (err){
    log(`💥 [${topic}] Error: ${err.message}`);
    try { await page.screenshot({ path: `debug-${topic}-err.png`, fullPage: true }); } catch {}
    return { topic, ok:false, error: err.message };
  } finally {
    try { await page.close(); } catch {}
  }
}

(async () => {
  log("🚀 Starting Daily Upload & Conversion (02:00 UTC job)");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });

  const summary = [];
  for (const t of topics) {
    const res = await runTopic(browser, t);
    summary.push(res);
    log("⏳ Waiting 20s before next topic...");
    await sleep(20000);
  }

  await browser.close();

  // write final summary file and print
  const final = {
    runAt: new Date().toISOString(),
    results: summary
  };
  fs.writeFileSync(`upload-summary-${today}.json`, JSON.stringify(final, null, 2));
  log("🛑 Done. Summary written.");
})();
