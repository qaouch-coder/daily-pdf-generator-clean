// generate_daily_pdfs.mjs
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const CONVERTER_URL = process.env.CONVERTER_URL || "https://wordsearchtoprint.com/auto_pdf_to_jpg.php";
const TOKEN = process.env.CONVERTER_TOKEN || "Ygmp146rMNYid8349flmzART";

const topics = [
  { name: "inspirational", url: "https://wordsearchtoprint.com/puzzles/Daily-Inspirational-Large-Print-Word-Search-test.html" },
  { name: "relaxing",      url: "https://wordsearchtoprint.com/puzzles/Daily-Relaxing-Large-Print-Word-Search-test.html" },
  { name: "history",       url: "https://wordsearchtoprint.com/puzzles/Daily-History-Themed-Large-Print-Word-Search-test.html" },
];

const today = new Date().toISOString().split("T")[0];
const logFile = path.join(process.cwd(), `upload-summary-${today}.txt`);
function log(s) {
  const line = `${new Date().toISOString()} - ${s}\n`;
  fs.appendFileSync(logFile, line);
  console.log(s);
}

async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// Try HEAD then GET to check file existence
async function urlExists(url, timeoutMs = 6000){
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, { method: "HEAD", signal: controller.signal });
    } catch (e) {
      res = await fetch(url, { method: "GET", signal: controller.signal });
    } finally {
      clearTimeout(id);
    }
    return res && res.ok;
  } catch (err) {
    return false;
  }
}

// Poll folder listing for a matching PDF up to maxAttempts
async function pollForPdf(topic, filenameCandidates, intervalMs = 5000, maxAttempts = 36){
  const base = `https://wordsearchtoprint.com/auto-pdfs/${topic}/`;
  log(`⏳ Polling folder ${base} for candidates: ${filenameCandidates.join(", ")} (up to ${(intervalMs*maxAttempts)/1000}s)`);
  for (let i = 0; i < maxAttempts; i++){
    try {
      // Try HEAD for each candidate directly (faster than parsing HTML)
      for (const cand of filenameCandidates){
        const url = base + cand;
        if (await urlExists(url, 6000)) {
          return url;
        }
      }
      // fallback: fetch index and search links (some servers list)
      const res = await fetch(base);
      if (res.ok) {
        const html = await res.text();
        for (const match of html.matchAll(/href="([^"]+\.pdf)"/gi)) {
          const href = match[1];
          const found = filenameCandidates.find(c => href.toLowerCase().includes(c.replace(/_/g,"-").toLowerCase()));
          if (found) return base + href;
        }
      }
    } catch (e) {
      // ignore and retry
    }
    log(`🧾 [${i}] not found yet...`);
    await sleep(intervalMs);
  }
  return null;
}

async function callConverter(filename, tries = 4, waitMs = 10000){
  const q = `?token=${encodeURIComponent(TOKEN)}&topic=inspirational&filename=${encodeURIComponent(filename)}`;
  const url = `${CONVERTER_URL}${q}`;
  for (let i=1;i<=tries;i++){
    log(`⚙️ Converter attempt ${i}/${tries} -> ${url}`);
    try {
      const res = await fetch(url, { method: "GET" });
      const raw = await res.text();
      log(`📡 Converter HTTP ${res.status} - ${raw.slice(0,2000)}`);
      let json = null;
      try { json = JSON.parse(raw); } catch {}
      if (res.ok && json && json.status === "ok") return { ok:true, json };
      if (i < tries) await sleep(waitMs);
      else return { ok:false, status: res.status, raw };
    } catch (err){
      log(`⚠️ Converter fetch error: ${err.message}`);
      if (i < tries) await sleep(waitMs);
      else return { ok:false, error: err.message };
    }
  }
}

function makeFilenameCandidates(topic){
  // today variants: todays-...-MM_DD_YYYY.pdf and daily-topic-YYYY-MM-DD.pdf
  const parts = today.split("-");
  const altDate = `${parts[1]}_${parts[2]}_${parts[0]}`; // MM_DD_YYYY
  const candidates = [
    `todays-${topic}-large-print-word-search-${altDate}.pdf`,
    `todays-${topic}-large-print-word-search-${today.replace(/-/g,"_")}.pdf`,
    `todays-${topic}-large-print-word-search-${today}.pdf`,
    `daily-${topic}-${today}.pdf`,
  ];
  // also include a more generic guess used previously (if topic word appears)
  const generic = candidates.map(s => s.toLowerCase());
  return generic;
}

async function runTopic(browser, topicObj) {
  const topic = topicObj.name;
  const url = topicObj.url;
  log(`\n🚀 ${topic.toUpperCase()} — Loading: ${url}`);
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    log("⏳ Waiting 12s for JS initialization...");
    await sleep(12000);

    const btn = await page.$("#pdfBtn");
    if (!btn) {
      log(`❌ [${topic}] #pdfBtn not found — skipping`);
      await page.screenshot({ path: `debug-${topic}-no-pdfbtn.png`, fullPage: true });
      return { ok: false, error: "#pdfBtn not found" };
    }

    // try to override jsPDF save name if present (best-effort)
    await page.evaluate((topic, date) => {
      try {
        const oldSave = window.doc?.save;
        if (oldSave) {
          window.doc.save = function(fn) {
            const newName = `todays-${topic}-large-print-word-search-${date.replace(/-/g,"_")}.pdf`;
            return oldSave.call(this, newName);
          };
        }
      } catch(e) { /* ignore */ }
    }, topic, today);

    log(`🔘 Clicking #pdfBtn to generate & upload PDF`);
    await btn.click();

    // Give the page a pause to let upload begin (server might be slow)
    await sleep(5000);

    // Now poll for the newly uploaded file
    const filenameCandidates = makeFilenameCandidates(topic);
    const found = await pollForPdf(topic, filenameCandidates, 5000, 36); // up to 3 minutes
    if (!found) {
      log(`❌ [${topic}] PDF did not appear within timeout.`);
      await page.screenshot({ path: `debug-${topic}-no-pdf.png`, fullPage: true });
      return { ok: false, error: "PDF not found on server" };
    }

    log(`✅ [${topic}] PDF found: ${found}`);
    const foundFilename = decodeURIComponent(found.split("/").pop());

    // Trigger converter (topic-specific param)
    log(`⚙️ [${topic}] Triggering converter for ${foundFilename}`);
    // call converter with topic param too
    const convUrl = `${CONVERTER_URL}?token=${encodeURIComponent(TOKEN)}&topic=${encodeURIComponent(topic)}&filename=${encodeURIComponent(foundFilename)}`;
    let conv = null;
    for (let attempt=1; attempt<=3; attempt++){
      try {
        log(`➤ Converter HTTP GET (attempt ${attempt}): ${convUrl}`);
        const res = await fetch(convUrl, { method: "GET" });
        const raw = await res.text();
        log(`📨 Converter reply (status ${res.status}): ${raw.slice(0,2000)}`);
        try { conv = JSON.parse(raw); } catch {}
        if (res.ok && conv && conv.status === "ok") {
          log(`🎉 [${topic}] Conversion OK`);
          return { ok:true, result: conv };
        }
      } catch (err) {
        log(`⚠️ [${topic}] Converter call error: ${err.message}`);
      }
      await sleep(8000);
    }

    return { ok:false, error: "converter failed", converterResult: conv };
  } catch (err) {
    log(`💥 [${topic}] Error: ${err.message}`);
    await page.screenshot({ path: `debug-${topic}-error.png`, fullPage: true });
    return { ok:false, error: err.message };
  } finally {
    try { await page.close(); } catch(e) {}
  }
}

(async () => {
  log("🚀 Starting Daily Upload & Conversion (02:00 UTC job)");
  const summary = [];

  // Launch Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  for (const t of topics) {
    // Attempt each topic up to 3 tries (with gaps) to be robust
    let ok = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      log(`\n🔁 [${t.name}] Attempt ${attempt}/3`);
      const res = await runTopic(browser, t);
      if (res.ok) {
        summary.push(`✅ ${t.name}: success`);
        ok = true;
        break;
      } else {
        summary.push(`❌ ${t.name}: ${res.error || "unknown"}`);
        log(`⏳ Waiting before retry (20s)`);
        await sleep(20000);
      }
    }
    if (!ok) {
      log(`⛔ [${t.name}] All attempts failed.`);
    }
    // small gap between topics
    await sleep(5000);
  }

  await browser.close();

  // Write final summary file
  log("\n🧾 Final summary:");
  summary.forEach(s => log(s));

  log("📤 Uploading daily summary file to local (artifact will be collected by Actions).");
  log("🛑 Done");
  process.exit(0);
})();
