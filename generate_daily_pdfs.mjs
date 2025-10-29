// ========================================================
// Daily PDF Generator & Converter Automation
// Topics: Inspirational, Relaxing, History
// ========================================================

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import os from "os";

const BASE_URL = "https://wordsearchtoprint.com/puzzles";
const CONVERTER_URL = "https://wordsearchtoprint.com/auto_pdf_to_jpg.php";
const LOG_UPLOAD_URL = "https://wordsearchtoprint.com/auto_log_upload.php";
const TOKEN = "Ygmp146rMNYid8349flmzART";

const topics = [
  { topic: "inspirational", slug: "Daily-Inspirational-Large-Print-Word-Search-test" },
  { topic: "relaxing", slug: "Daily-Relaxing-Large-Print-Word-Search-test" },
  { topic: "history", slug: "Daily-History-Themed-Large-Print-Word-Search-test" }
];

const today = new Date().toISOString().split("T")[0];
const [y, m, d] = today.split("-");
const altDate = `${m}_${d}_${y}`;
const logFile = path.join(process.cwd(), `upload-summary-${today}.txt`);

function log(msg) {
  const line = `${new Date().toISOString()} - ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callConverter(topic, filename, maxRetries = 3) {
  const url = `${CONVERTER_URL}?token=${TOKEN}&topic=${topic}&filename=${encodeURIComponent(filename)}`;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log(`⚙️ [${topic}] Converter attempt ${attempt}/${maxRetries} -> ${url}`);
    try {
      const res = await fetch(url);
      const raw = await res.text();
      log(`📨 [${topic}] HTTP ${res.status}: ${raw.slice(0, 800)}`);
      let json;
      try { json = JSON.parse(raw); } catch {}
      if (res.ok && json?.status === "ok") {
        log(`🎉 [${topic}] Conversion success`);
        return true;
      }
    } catch (err) {
      log(`⚠️ [${topic}] Converter error: ${err.message}`);
    }
    if (attempt < maxRetries) await sleep(20000);
  }
  return false;
}

async function runTopic(browser, { topic, slug }) {
  const url = `${BASE_URL}/${slug}.html`;
  const filename = `todays-${topic}-large-print-word-search-${altDate}.pdf`;

  log(`\n🚀 ${topic.toUpperCase()} — Loading: ${url}`);
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await sleep(12000);

    const btn = await page.$("#pdfBtn");
    if (!btn) {
      log(`❌ [${topic}] #pdfBtn not found`);
      await page.screenshot({ path: `debug-${topic}.png`, fullPage: true });
      return;
    }

    await btn.click();
    log(`🔘 [${topic}] Clicked #pdfBtn`);

    await sleep(45000);
    log(`✅ [${topic}] Uploaded PDF (${filename})`);

    await callConverter(topic, filename, 3);
  } catch (err) {
    log(`💥 [${topic}] Error: ${err.message}`);
  } finally {
    await page.close();
  }
}

(async () => {
  log(`🚀 Starting Daily Upload & Conversion (02:00 UTC job)`);

  const tmpDir = path.join(os.tmpdir(), `puppeteer-session-${Date.now()}`);
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: tmpDir,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
  });

  try {
    for (const t of topics) {
      await runTopic(browser, t);
      log(`⏳ Waiting 20s before next topic...`);
      await sleep(20000);
    }
  } catch (err) {
    log(`💥 Global error: ${err.message}`);
  } finally {
    // Upload log
    try {
      const fileData = fs.readFileSync(logFile);
      const form = new FormData();
      form.append("token", TOKEN);
      form.append("file", new Blob([fileData]), path.basename(logFile));
      log("📤 Uploading daily summary log...");
      const res = await fetch(LOG_UPLOAD_URL, { method: "POST", body: form });
      const text = await res.text();
      log(`🌐 Log upload response: ${text}`);
    } catch (err) {
      log(`⚠️ Log upload failed: ${err.message}`);
    }

    await browser.close();
    log("🛑 Done — all topics processed.");
  }
})();
