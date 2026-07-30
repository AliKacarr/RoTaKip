const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const { chromium } = require('playwright');

// Log dosyaları dizini: public/form
const FORM_DIR = path.join(__dirname, 'public', 'form');
const GONDERIM_LOG = path.join(FORM_DIR, 'gonderim_log.txt');
const AYNI_GUN_LOG = path.join(FORM_DIR, 'ayni_gun_log.txt');
const MAX_KAYIT = 5;

const FORM_URL = "https://forms.gle/vb5Yrdk75SBkpZ6a8";

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
 * Gönderim log kaydını gerçekleştirir.
 */
function gonderimKaydet() {
    const simdi = new Date();

    // Türkiye saatine göre YYYY-MM-DD ve YYYY-MM-DD HH:mm:ss formatı
    const trStr = simdi.toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }); // "YYYY-MM-DD HH:mm:ss"
    const [bugunStr, saatStr] = trStr.split(" ");
    const kayitStr = `${bugunStr} ${saatStr}`;

    if (!fs.existsSync(FORM_DIR)) {
        fs.mkdirSync(FORM_DIR, { recursive: true });
    }

    let kayitlar = [];
    if (fs.existsSync(GONDERIM_LOG)) {
        const content = fs.readFileSync(GONDERIM_LOG, 'utf-8');
        kayitlar = content.split('\n').map(s => s.trim()).filter(Boolean);
    }

    const ayniGunVar = kayitlar.some(satir => satir.startsWith(bugunStr));

    if (ayniGunVar) {
        fs.appendFileSync(AYNI_GUN_LOG, kayitStr + '\n', 'utf-8');
        console.log(`  [UYARI] Bugün (${bugunStr}) için zaten kayıt var. ayni_gun_log.txt güncellendi.`);
        return { success: true, warning: true, message: "Bugün için zaten kayıt vardı, ayni_gun_log güncellendi." };
    }

    kayitlar.push(kayitStr);
    if (kayitlar.length > MAX_KAYIT) {
        kayitlar.shift();
    }

    fs.writeFileSync(GONDERIM_LOG, kayitlar.join('\n') + '\n', 'utf-8');
    console.log(`  [LOG] gonderim_log.txt güncellendi. Toplam kayıt: ${kayitlar.length}`);
    return { success: true, message: "Gönderim başarıyla kaydedildi." };
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
            console.log("  [BİLGİ] Varsayılan Playwright chromium bulunamadı, sistem tarayıcısı deneniyor...");
            try {
                browser = await chromium.launch({ ...launchOptions, channel: 'chrome' });
            } catch (chromeErr) {
                browser = await chromium.launch({ ...launchOptions, channel: 'msedge' });
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
            const logRes = gonderimKaydet();
            await browser.close();
            return { success: true, message: "Form başarıyla gönderildi ve loglandı." };
        } else if (basari) {
            console.log("  [BAŞARILI] Tüm seçimler yapıldı.");
            const logRes = gonderimKaydet();
            await browser.close();
            return { success: true, message: "Form seçimleri tamamlandı ve gönderildi." };
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
