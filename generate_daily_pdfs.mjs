// =============================================================
//  generate_daily_pdfs.mjs
//  Robust daily automation: 3 topics (Inspirational, Relaxing, History)
//  Uploads PDFs → waits for server → auto-triggers converter
//  Built for GitHub Actions reliability (Hostinger-safe)
// =============================================================

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE_URL = "https://wordsearchtoprint.com/puzzles";
const CONVERTER_URL = "https://wordsearchtoprint.com/auto_pdf_to_jpg.php";
const TOKEN = "Ygmp146rMNYid8349flmzART";

const topics = [
  { key: "inspirational", url: `${BASE_URL}/Daily-Inspirational-Large-Print-Word-Search-test.html` },
  { key: "relaxing", url: `${BASE_URL}/Daily-Relaxing-Large-Print-Word-Search-test.html` },
  { key: "history", url: `${BASE_URL}/Daily-History-Themed-Large-Print-Word-Search-test.html` },
];

const today = new Date().toISOString().split("T")[0];
const logFile = path.join(process.cwd(), `upload-summary-${today}.txt`);

function log(msg) {
  const line = `${new Date().toISOString()} - ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// --- 1️⃣ Connectivity check before Puppeteer runs ---
async function healthCheck() {
  try {
    const res = await fetch("https://wordsearchtoprint.com/healthcheck.php");
    if (!res.ok) throw new Error("Site unreachable");
    log("✅ Health check passed: site reachable");
    return true;
  } catch (err) {
    log(`❌ Health check failed: ${err.message}`);
    return false;
  }
}

// --- 2️⃣ Safe navigation with retries ---
async function safeGoto(page, url, topic, timeout = 120000) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      log(`🌐 [${topic}] Attempt ${attempt}: loading ${url}`);
      await page.goto(url, { waitUntil: "networkidle2", timeout });
      log(`✅ [${topic}] Page loaded successfully`);
      return true;
    } catch (err) {
      log(`⚠️ [${topic}] Attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) {
        log("⏳ Waiting 15s before retry...");
        await sleep(15000);
      }
    }
  }
  log(`❌ [${topic}] Could not load ${url} after 3 attempts`);
  return false;
}

// --- 3️⃣ Call PHP converter ---
async function callConverter(topic, filename, tries = 4, waitMs = 8000) {
  const q = `?token=${encodeURIComponent(TOKEN)}&topic=${encodeURIComponent(topic)}&filename=${encodeURIComponent(filename)}`;
  const url = `${CONVERTER_URL}${q}`;
  for (let i = 1; i <= tries; i++) {
    try {
      log(`🔄 Converter attempt ${i}/${tries}: ${url}`);
      const res = await fetch(url);
      const raw = await res.text();
      log(`📡 Converter HTTP ${res.status}: ${raw.slice(0, 300)}`);
      const json = JSON.parse(raw);
      if (json.status === "ok") {
        log(`🎉 [${topic}] Conversion success: ${json.pinterest_images.join(", ")}`);
        return true;
      }
    } catch (err) {
      log(`⚠️ [${topic}] Converter error: ${err.message}`);
    }
    if (i < tries) {
      log(`⏳ Waiting ${waitMs / 1000}s before retry...`);
      await sleep(waitMs);
    }
  }
  log(`❌ [${topic}] Conversion failed after ${tries} attempts`);
  return false;
}

// --- 4️⃣ Poll for PDF existence ---
async function pollForPdf(topic) {
  const pdfBase = `https://wordsearchtoprint.com/auto-pdfs/${topic}/`;
  const todayStr = today.replace(/-/g, "_");
  const filenameCandidates = [
    `todays-${topic}-large-print-word-search-${todayStr}.pdf`,
    `todays-${topic}-large-print-word-search-${today}.pdf`,
    `daily-${topic}-${today}.pdf`,
  ];

  async function listFiles() {
    try {
      const res = await fetch(pdfBase);
      const html = await res.text();
      const matches = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map(m => m[1]);
      return matches;
    } catch {
      return [];
    }
  }

  log(`⏳ Polling for ${topic} PDF (up to 3 minutes)...`);
  for (let i = 0; i < 36; i++) { // 36 × 5s = 180s
    const files = await listFiles();
    const match = files.find(f => filenameCandidates.some(c => f.toLowerCase().includes(c.toLowerCase())));
    if (match) {
      log(`✅ [${topic}] Found PDF: ${pdfBase + match}`);
      return match;
    }
    log(`🧾 [${topic}] [${i}] Files seen: ${files.join(", ")}`);
    await sleep(5000);
  }
  log(`❌ [${topic}] PDF not detected after 3 minutes`);
  return null;
}

// --- 🧠 MAIN ---
(async () => {
  log("🚀 Starting Daily Upload & Conversion (02:00 UTC job)");

  if (!(await healthCheck())) {
    log("💤 Site unreachable, exiting early");
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

  for (const { key: topic, url } of topics) {
    log(`\n🚀 ${topic.toUpperCase()} — Loading: ${url}`);
    const loaded = await safeGoto(page, url, topic);
    if (!loaded) {
      log(`💥 [${topic}] Skipping (couldn't load page)`);
      continue;
    }

    log("⏳ Waiting 10s for script initialization...");
    await sleep(10000);

    const btn = await page.$("#pdfBtn");
    if (!btn) {
      log(`❌ [${topic}] #pdfBtn not found`);
      continue;
    }

    log(`🔘 [${topic}] Clicking #pdfBtn to generate & upload PDF`);
    await btn.click();

    const pdfFile = await pollForPdf(topic);
    if (!pdfFile) {
      log(`❌ [${topic}] No PDF found, skipping conversion`);
      continue;
    }

    const filename = pdfFile.split("/").pop();
    log(`⚙️ [${topic}] Triggering converter for ${filename}`);
    await callConverter(topic, filename);

    log("⏳ Waiting 20s before next topic...");
    await sleep(20000);
  }

  await browser.close();
  log("📤 Uploading daily summary log...");
  try {
    const body = fs.readFileSync(logFile, "utf8");
    await fetch("https://wordsearchtoprint.com/auto-pdfs/upload-summary.php", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body
    });
    log("✅ Summary uploaded successfully");
  } catch (err) {
    log(`⚠️ Log upload failed: ${err.message}`);
  }

  log("🛑 Done — all topics processed.");
})();
