const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const schedule = require('node-schedule');
const { chromium } = require('playwright');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc4Ru7BjsB-sNgdw5-r9hBF-yqXuG7gA6OUJISYVjzlCByyjQ/viewform?usp=header";

const DROPDOWN_VALUES = [
    "Ali Kaçar",   // 1. Ad Soyad
    "Ekip C",      // 2. Hangi Ekiptesin?
    "5",           // 3. Kaç Vakit Namaz?
    "5",           // 4. Kaç Sayfa Kuran?
    "5",           // 5. Kaç Vakit Tesbihat?
    "5",           // 6. Cevşen Okudun Mu?
    "1.5",         // 7. Kaç Saat Risale-i Nur?
    "2",           // 8. Kaç Saat Hizmet?
];

const TEXTAREA_VALUE = "Medresem uygulaması çalışması, podcast dinleme ve youtube video izleme";

/**
 * Gönderim log kaydını gerçekleştirir (MongoDB 'anket' veritabanı 'logs' koleksiyonuna).
 */
async function gonderimKaydet() {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        console.error("  [HATA] MONGO_URI ortam değişkeni bulunamadı!");
        return { success: false, error: "MONGO_URI tanımlı değil." };
    }

    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        const db = client.db('anket');
        const logsCollection = db.collection('logs');

        const simdi = new Date();

        // Türkiye saatine göre YYYY-MM-DD ve YYYY-MM-DD HH:mm:ss formatı
        const trStr = simdi.toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }); // "YYYY-MM-DD HH:mm:ss"
        const [bugunStr, saatStr] = trStr.split(" ");
        const kayitStr = `${bugunStr} ${saatStr}`;

        const existing = await logsCollection.findOne({ date: bugunStr });
        const ayniGunVar = !!existing;

        const logDoc = {
            createdAt: simdi,
            dateStr: kayitStr,
            date: bugunStr,
            time: saatStr,
            status: ayniGunVar ? 'warning' : 'success',
            message: ayniGunVar ? 'Bugün için zaten kayıt vardı.' : 'Gönderim başarıyla kaydedildi.',
            isDuplicate: ayniGunVar
        };

        await logsCollection.insertOne(logDoc);

        if (ayniGunVar) {
            console.log(`  [UYARI] Bugün (${bugunStr}) için zaten kayıt var. MongoDB logs koleksiyonuna eklendi.`);
            return { success: true, warning: true, message: "Bugün için zaten kayıt vardı, MongoDB logs'a eklendi." };
        }

        console.log(`  [LOG] MongoDB ('anket' db -> 'logs' collection) güncellendi. Tarih: ${kayitStr}`);
        return { success: true, message: "Gönderim MongoDB'ye başarıyla kaydedildi." };
    } catch (err) {
        console.error("  [HATA] MongoDB log kaydı sırasında hata oluştu:", err);
        return { success: false, error: err.message };
    } finally {
        await client.close();
    }
}

/**
 * Dropdown seçim yardımcı fonksiyonu
 */
async function selectDropdown(page, dropdown, value) {
    const DROPDOWN_OPEN_DELAY_MS = 200;
    const DROPDOWN_SELECT_DELAY_MS = 300;
    const OPTION_WAIT_TIMEOUT_MS = 3000;

    for (let attempt = 1; attempt <= 3; attempt++) {
        await dropdown.scrollIntoViewIfNeeded();
        await page.waitForTimeout(DROPDOWN_OPEN_DELAY_MS);

        await dropdown.click();
        await page.waitForTimeout(DROPDOWN_SELECT_DELAY_MS);

        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const option = dropdown.locator("[role='option']").filter({
            hasText: new RegExp(`^\\s*${escapedValue}\\s*$`)
        });

        try {
            await option.waitFor({ state: 'visible', timeout: OPTION_WAIT_TIMEOUT_MS });
        } catch (err) {
            await page.keyboard.press("Escape");
            await page.waitForTimeout(DROPDOWN_OPEN_DELAY_MS);
            if (attempt === 3) {
                console.error(`  [HATA] '${value}' görünür seçenekler arasında bulunamadı!`);
                return false;
            }
            console.log(`  [TEKRAR ${attempt}] Deneme başarısız, yeniden açılıyor...`);
            continue;
        }

        await option.scrollIntoViewIfNeeded();
        await option.click();
        await page.waitForTimeout(DROPDOWN_SELECT_DELAY_MS);

        console.log(`  [OK] '${value}' seçildi.`);
        return true;
    }
    return false;
}

/**
 * Anket doldurma işlemini yürütür.
 */
async function doldurAnket(isHeadless = true) {
    console.log("=".repeat(60));
    console.log("  GOOGLE FORM OTOMATİK DOLDURMA (NODE.JS)");
    console.log("=".repeat(60));

    let browser;
    try {
        const launchOptions = {
            headless: isHeadless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        };

        try {
            browser = await chromium.launch(launchOptions);
        } catch (launchErr) {
            console.log("  [BİLGİ] Playwright chromium bulunamadı. Render/Sunucuda otomatik indiriliyor...");
            try {
                execSync('npx playwright install chromium', { stdio: 'inherit' });
                browser = await chromium.launch(launchOptions);
            } catch (installErr) {
                console.log("  [BİLGİ] Sistem tarayıcısı deneniyor...");
                try {
                    browser = await chromium.launch({ ...launchOptions, channel: 'chrome' });
                } catch (chromeErr) {
                    browser = await chromium.launch({ ...launchOptions, channel: 'msedge' });
                }
            }
        }

        const context = await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(15000);

        console.log("\n[1] Form açılıyor...");
        await page.goto(FORM_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(1000);
        console.log("  [OK] Form yüklendi.\n");

        const dropdowns = page.locator("[role='listbox']");
        const count = await dropdowns.count();
        console.log(`Bulunan dropdown: ${count} | Doldurulacak: ${DROPDOWN_VALUES.length}\n`);

        let basari = true;
        for (let i = 0; i < DROPDOWN_VALUES.length; i++) {
            const value = DROPDOWN_VALUES[i];
            console.log(`[${i + 2}] Dropdown #${i + 1} -> '${value}'`);
            const dropdown = dropdowns.nth(i);
            const ok = await selectDropdown(page, dropdown, value);
            if (!ok) {
                basari = false;
            }
        }

        console.log(`\n[10] Görev açıklaması yazılıyor...`);
        const textarea = page.locator("textarea").first();
        await textarea.scrollIntoViewIfNeeded();
        await textarea.click();
        await textarea.fill(TEXTAREA_VALUE);
        console.log(`  [OK] Metin girildi.`);

        console.log(`\n[11] Form gönderiliyor...`);
        await page.waitForTimeout(1000);

        const submitted = await page.evaluate(() => {
            const btns = document.querySelectorAll("[role='button']");
            for (const btn of btns) {
                const txt = btn.innerText.trim().toLowerCase();
                if (txt === 'gönder' || txt === 'submit' || txt === 'gonder') {
                    btn.click();
                    return true;
                }
            }
            if (btns.length > 0) {
                btns[btns.length - 1].click();
                return true;
            }
            return false;
        });

        console.log(submitted ? "  [OK] Gönder butonuna tıklandı." : "  [UYARI] Gönder butonu bulunamadı!");
        await page.waitForTimeout(4000);

        const content = await page.content();
        const contentLower = content.toLowerCase();
        const sent = ["kaydedildi", "recorded", "submitted", "response", "confirmation", "freebirdformviewerviewresponseconfirmation", "tesekk"].some(k => contentLower.includes(k));

        console.log("\n" + "=".repeat(60));
        if (sent && basari) {
            console.log("  [BAŞARILI] FORM BAŞARIYLA GÖNDERİLDİ!");
            const logRes = await gonderimKaydet();
            await browser.close();
            return { success: true, message: "Form başarıyla gönderildi ve loglandı.", logResult: logRes };
        } else if (basari) {
            console.log("  [BAŞARILI] Tüm seçimler yapıldı.");
            const logRes = await gonderimKaydet();
            await browser.close();
            return { success: true, message: "Form seçimleri tamamlandı ve gönderildi.", logResult: logRes };
        } else {
            console.log("  [UYARI] Bazı seçimler yapılamadı. Log kaydedilmedi.");
            await browser.close();
            return { success: false, message: "Bazı doldurma adımları başarısız oldu." };
        }
    } catch (err) {
        console.error("Anket doldurulurken hata oluştu:", err);
        if (browser) await browser.close();
        return { success: false, error: err.message };
    }
}

/**
 * Her gün 01:00 (Türkiye Saati) için zamanlayıcıyı başlatır.
 */
function scheduleAnketJob() {
    const job = schedule.scheduleJob({ rule: '0 22 * * *', tz: 'Europe/Istanbul' }, async () => {
        const zaman = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        console.log(`\n[ZAMANLAYICI - ${zaman}] Günlük anket doldurma görevi başlatıldı...`);
        try {
            const sonuc = await doldurAnket(true);
            console.log(`[ZAMANLAYICI] Sonuç:`, sonuc);
        } catch (error) {
            console.error(`[ZAMANLAYICI] Hata:`, error);
        }
    });
    console.log("✅ Anket doldurma zamanlayıcısı kuruldu: Her gün saat 01:00 (TSİ)");
    return job;
}

module.exports = {
    doldurAnket,
    gonderimKaydet,
    scheduleAnketJob
};
