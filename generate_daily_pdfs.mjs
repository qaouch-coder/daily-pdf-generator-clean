import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const TOKEN = "Ygmp146rMNYid8349flmzART";
const CONVERTER_URL = "https://wordsearchtoprint.com/auto_pdf_to_jpg.php";

const topics = [
  {
    name: "inspirational",
    url: "https://wordsearchtoprint.com/puzzles/Daily-Inspirational-Large-Print-Word-Search-test.html"
  },
  {
    name: "relaxing",
    url: "https://wordsearchtoprint.com/puzzles/Daily-Relaxing-Large-Print-Word-Search-test.html"
  },
  {
    name: "history",
    url: "https://wordsearchtoprint.com/puzzles/Daily-History-Themed-Large-Print-Word-Search-test.html"
  }
];

const today = new Date().toISOString().split("T")[0];
const logFile = path.join(process.cwd(), `upload-summary-${today}.txt`);

const log = msg => {
  const line = `${new Date().toISOString()} - ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(line.trim());
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callConverter(topic, filename, retries = 3) {
  const query = `?token=${TOKEN}&topic=${topic}&filename=${filename}`;
  const url = `${CONVERTER_URL}${query}`;
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url);
      const raw = await res.text();
      log(`Converter [${topic}] HTTP ${res.status}: ${raw.slice(0, 300)}`);
      if (res.ok && raw.includes('"status":"ok"')) return true;
    } catch (e) {
      log(`Converter [${topic}] attempt ${i} failed: ${e.message}`);
    }
    await sleep(10000);
  }
  return false;
}

async function runTopic(browser, topic) {
  log(`\n🚀 ${topic.name.toUpperCase()} — Loading: ${topic.url}`);
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  try {
    await page.goto(topic.url, { waitUntil: "domcontentloaded", timeout: 120000 });
    log("⏳ Waiting 10 s for JS initialization...");
    await sleep(10000);

    const btn = await page.$("#pdfBtn");
    if (!btn) throw new Error("#pdfBtn not found");
    await btn.click();
    log("🖱️ Clicked #pdfBtn — upload initiated");

    const pdfName = `todays-${topic.name}-large-print-word-search-${today.replace(/-/g, "_")}.pdf`;
    log(`⏳ Waiting 60 s for upload: ${pdfName}`);
    await sleep(60000);

    const converted = await callConverter(topic.name, pdfName);
    log(converted ? `✅ ${topic.name} converted successfully` : `❌ ${topic.name} conversion failed`);

  } catch (err) {
    log(`💥 [${topic.name}] ${err.message}`);
  } finally {
    await page.close();
  }
}

(async () => {
  log("🚀 Starting Daily Upload & Conversion (02:00 UTC job)");
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled"
    ]
  });

  for (const topic of topics) {
    await runTopic(browser, topic);
    log("⏳ Waiting 20 s before next topic...");
    await sleep(20000);
  }

  await browser.close();
  log("🛑 Done — all topics processed.");
})();
