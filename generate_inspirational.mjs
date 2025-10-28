// generate_inspirational.mjs (simple uploader + converter)
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const URL = "https://wordsearchtoprint.com/puzzles/Daily-Inspirational-Large-Print-Word-Search-test.html";
const CONVERTER_URL = "https://wordsearchtoprint.com/auto_pdf_to_jpg.php";
const TOKEN = "Ygmp146rMNYid8349flmzART";
const PDF_BASE = "https://wordsearchtoprint.com/auto-pdfs/inspirational/";

const today = new Date().toISOString().split("T")[0]; // yyyy-mm-dd
const parts = today.split("-");
const altDate = `${parts[1]}_${parts[2]}_${parts[0]}`; // mm_dd_yyyy

const expectedFilename = `todays-inspirational-large-print-word-search-${altDate}.pdf`;

const logFile = path.join(process.cwd(), `upload-summary-${today}.txt`);
function log(s) {
  const line = `${new Date().toISOString()} - ${s}\n`;
  fs.appendFileSync(logFile, line);
  console.log(s);
}

async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function callConverter(filename) {
  const url = `${CONVERTER_URL}?token=${encodeURIComponent(TOKEN)}&topic=inspirational&filename=${encodeURIComponent(filename)}`;
  log(`⚙️ Calling converter: ${url}`);
  try {
    const res = await fetch(url, { method: "GET" });
    const raw = await res.text();
    log(`📨 Converter ${res.status}: ${raw}`);
    let parsed;
    try { parsed = JSON.parse(raw); } catch {}
    return { ok: res.ok, status: res.status, raw, json: parsed };
  } catch (err) {
    log(`❌ Converter fetch error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

(async () => {
  log("🚀 Starting Inspirational run (simple uploader)");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox","--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");

  try {
    log(`🌐 Loading: ${URL}`);
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
    log("⏳ Waiting 12s for page scripts...");
    await sleep(12000);

    const btn = await page.$("#pdfBtn");
    if (!btn) {
      log("❌ #pdfBtn not found — aborting");
      await page.screenshot({ path: "debug-screenshot.png", fullPage: true });
      await browser.close();
      process.exit(1);
    }

    log("🔘 Clicking #pdfBtn to generate & upload PDF");
    await btn.click();

    // Wait a conservative 45s for upload to finish on server (adjust later if needed)
    log("⏳ Sleeping 45s to allow upload to finish...");
    await sleep(45000);

    // Now call converter with expected filename (month_day_year format)
    log(`ℹ️ Assuming filename: ${expectedFilename}`);
    const conv = await callConverter(expectedFilename);
    if (conv.ok && conv.json && conv.json.status === "ok") {
      log(`🎉 Converter success: ${JSON.stringify(conv.json)}`);
    } else {
      log(`❌ Converter response or status not OK: ${JSON.stringify(conv)}`);
    }

  } catch (err) {
    log(`💥 Script error: ${err.message}`);
  } finally {
    await browser.close();
    log("🛑 Done");
  }
})();
