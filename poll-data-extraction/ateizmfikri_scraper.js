import puppeteer from "puppeteer";
import mongoose from "mongoose";

// =======================
// MongoDB bağlantısı
// =======================
await mongoose.connect("mongodb://localhost:27017/readingtrucker", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// =======================
// Mongoose Schema
// =======================
const articleSchema = new mongoose.Schema({
  title: String,
  text: String,
  category: String,
  category_url: String,
  date: String,
  destination_url: String,
  image_url: String
});

const Article = mongoose.model("Article", articleSchema);

// =======================
// Scraper Fonksiyonu
// =======================
async function scrapePage(pageNum) {
  const url = `https://www.ateizmfikri.com/author/caykoykeceli/page/${pageNum}/`;
  console.log(`🔎 Sayfa taranıyor: ${url}`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const articles = await page.evaluate(() => {
    const cards = document.querySelectorAll("div.post-list");
    const data = [];

    cards.forEach(card => {
      const title = card.querySelector("h5.post-title a")?.innerText?.trim();
      const text = card.querySelector("p.excerpt")?.innerText?.trim();
      const metaItems = card.querySelectorAll(".meta.list-inline.mb-3 li");
      const category = metaItems[1]?.innerText?.trim();
      const category_url = metaItems[1]?.querySelector("a")?.href;
      const date = metaItems[2]?.innerText?.trim();
      const destination_url = card.querySelector(".inner a")?.href;
      const image_url = card.querySelector(".inner img")?.src;

      if (image_url && title && text && category) {
        data.push({
          title,
          text,
          category,
          category_url,
          date,
          destination_url,
          image_url
        });
      }
    });

    return data;
  });

  await browser.close();
  return articles;
}

// =======================
// Tüm sayfaları gez
// =======================
async function main() {
  for (let i = 1; i <= 28; i++) {
    const data = await scrapePage(i);

    if (data.length > 0) {
      await Article.insertMany(data, { ordered: false });
      console.log(`✅ Sayfa ${i}: ${data.length} makale kaydedildi`);
    } else {
      console.log(`⚠️ Sayfa ${i}: Kayıt bulunamadı`);
    }
  }

  mongoose.connection.close();
  console.log("🎉 İşlem tamamlandı!");
}

main().catch(err => {
  console.error("❌ Hata:", err);
  mongoose.connection.close();
});
