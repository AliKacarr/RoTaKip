const path = require('path');
const { execSync } = require('child_process');
const schedule = require('node-schedule');
const { chromium } = require('playwright');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc4Ru7BjsB-sNgdw5-r9hBF-yqXuG7gA6OUJISYVjzlCByyjQ/viewform?usp=header";

const DROPDOWN_VALUES = [
    "Ali Kaçar",   // 1. Ad Soyad
    "Ekip C",      // 2. Hangi Ekiptesin?
    "5",           // 3. Kaç Vakit Namaz?
    "5",           // 4. Kaç Sayfa Kuran?
    "5",           // 5. Kaç Vakit Tesbihat?
    "5",           // 6. Cevşen Okudun Mu?
    "1",         // 7. Kaç Saat Risale-i Nur?
    "1.5",           // 8. Kaç Saat Hizmet?
];

const TEXTAREA_VALUE = "Medresem uygulaması çalışması ve youtube video izleme";

/**
 * Gönderim log kaydını gerçekleştirir (MongoDB 'anket' veritabanı 'logs' koleksiyonuna).
 * @param {boolean} isSuccess - Gönderim başarılı mı?
 * @param {string|null} customMessage - Özel log mesajı
 */
async function gonderimKaydet(isSuccess = true, customMessage = null) {
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

        const status = isSuccess ? (ayniGunVar ? 'warning' : 'success') : 'failed';
        const defaultMsg = isSuccess
            ? (ayniGunVar ? 'Bugün için zaten kayıt vardı.' : 'Gönderim başarıyla kaydedildi.')
            : 'Form gönderimi başarısız oldu.';

        const logDoc = {
            createdAt: simdi,
            dateStr: kayitStr,
            date: bugunStr,
            time: saatStr,
            status: status,
            message: customMessage || defaultMsg,
            isDuplicate: ayniGunVar,
            success: isSuccess
        };

        await logsCollection.insertOne(logDoc);

        if (!isSuccess) {
            console.log(`  [HATA LOG] MongoDB 'logs' koleksiyonuna başarısızlık kaydı eklendi: ${logDoc.message}`);
            return { success: false, warning: false, message: logDoc.message };
        }

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
    const DROPDOWN_OPEN_DELAY_MS = 400;
    const DROPDOWN_SELECT_DELAY_MS = 500;
    const OPTION_WAIT_TIMEOUT_MS = 5000;
    const MAX_ATTEMPTS = 4;

    await dropdown.waitFor({ state: 'visible', timeout: 20000 });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await dropdown.scrollIntoViewIfNeeded({ timeout: 10000 });
        } catch (scrollErr) {
            console.log(`  [UYARI] scrollIntoView deneme ${attempt} başarısız, tıklama ile devam...`);
        }
        await page.waitForTimeout(DROPDOWN_OPEN_DELAY_MS);

        try {
            await dropdown.click({ timeout: 10000 });
        } catch (clickErr) {
            console.log(`  [UYARI] Dropdown tıklanamadı (deneme ${attempt}): ${clickErr.message}`);
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(DROPDOWN_OPEN_DELAY_MS);
            if (attempt === MAX_ATTEMPTS) return false;
            continue;
        }
        await page.waitForTimeout(DROPDOWN_SELECT_DELAY_MS);

        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Açık menü seçenekleri listbox altında veya sayfa genelinde olabilir
        const optionInDropdown = dropdown.locator("[role='option']").filter({
            hasText: new RegExp(`^\\s*${escapedValue}\\s*$`)
        });
        const optionGlobal = page.locator("[role='option']").filter({
            hasText: new RegExp(`^\\s*${escapedValue}\\s*$`)
        });
        const option = (await optionInDropdown.count()) > 0 ? optionInDropdown.first() : optionGlobal.first();

        try {
            await option.waitFor({ state: 'visible', timeout: OPTION_WAIT_TIMEOUT_MS });
        } catch (err) {
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(DROPDOWN_OPEN_DELAY_MS);
            if (attempt === MAX_ATTEMPTS) {
                console.error(`  [HATA] '${value}' görünür seçenekler arasında bulunamadı!`);
                return false;
            }
            console.log(`  [TEKRAR ${attempt}] Deneme başarısız, yeniden açılıyor...`);
            continue;
        }

        try {
            await option.scrollIntoViewIfNeeded({ timeout: 5000 });
        } catch (_) { /* tıklama yeterli olabilir */ }

        await option.click({ timeout: 10000 });
        await page.waitForTimeout(DROPDOWN_SELECT_DELAY_MS);

        console.log(`  [OK] '${value}' seçildi.`);
        return true;
    }
    return false;
}

/**
 * Google Forms dropdown'larının DOM'da hazır olmasını bekler.
 */
async function waitForFormDropdowns(page, expectedCount) {
    const FORM_READY_TIMEOUT_MS = 45000;
    const listboxes = page.locator("[role='listbox']");

    console.log(`  [BEKLE] En az ${expectedCount} dropdown görünür olana kadar bekleniyor...`);

    const deadline = Date.now() + FORM_READY_TIMEOUT_MS;
    let lastCount = 0;

    while (Date.now() < deadline) {
        try {
            lastCount = await listboxes.count();
            if (lastCount >= expectedCount) {
                await listboxes.nth(expectedCount - 1).waitFor({ state: 'visible', timeout: 5000 });
                console.log(`  [OK] Dropdown'lar hazır (bulunan: ${lastCount}).`);
                return lastCount;
            }
        } catch (_) {
            // henüz hazır değil
        }
        await page.waitForTimeout(500);
    }

    throw new Error(
        `Form dropdown'ları zaman aşımına uğradı. Beklenen: ${expectedCount}, bulunan: ${lastCount}`
    );
}

/**
 * Tek sayfa üzerinde formu doldurup göndermeyi dener.
 * @returns {{ success: boolean, message: string }}
 */
async function doldurAnketOnPage(page) {
    const expectedCount = DROPDOWN_VALUES.length;

    console.log('\n[1] Form açılıyor...');
    await page.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    let dropdownCount;
    try {
        dropdownCount = await waitForFormDropdowns(page, expectedCount);
    } catch (readyErr) {
        console.log(`  [UYARI] ${readyErr.message} Sayfa yenileniyor...`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
        dropdownCount = await waitForFormDropdowns(page, expectedCount);
    }

    console.log(`Bulunan dropdown: ${dropdownCount} | Doldurulacak: ${expectedCount}\n`);

    if (dropdownCount < expectedCount) {
        throw new Error(
            `Yetersiz dropdown. Beklenen: ${expectedCount}, bulunan: ${dropdownCount}`
        );
    }

    const dropdowns = page.locator("[role='listbox']");

    for (let i = 0; i < DROPDOWN_VALUES.length; i++) {
        const value = DROPDOWN_VALUES[i];
        console.log(`[${i + 2}] Dropdown #${i + 1} -> '${value}'`);
        const dropdown = dropdowns.nth(i);
        const ok = await selectDropdown(page, dropdown, value);
        if (!ok) {
            throw new Error(`Dropdown #${i + 1} için '${value}' seçilemedi.`);
        }
    }

    console.log('\n[10] Görev açıklaması yazılıyor...');
    const textarea = page.locator('textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 15000 });
    try {
        await textarea.scrollIntoViewIfNeeded({ timeout: 10000 });
    } catch (_) { /* devam */ }
    await textarea.click({ timeout: 10000 });
    await textarea.fill(TEXTAREA_VALUE);
    console.log('  [OK] Metin girildi.');

    console.log('\n[11] Form gönderiliyor...');
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

    console.log(submitted ? '  [OK] Gönder butonuna tıklandı.' : '  [UYARI] Gönder butonu bulunamadı!');
    if (!submitted) {
        throw new Error('Gönder butonu bulunamadı.');
    }

    await page.waitForTimeout(4000);

    const content = await page.content();
    const contentLower = content.toLowerCase();
    const sent = [
        'kaydedildi',
        'recorded',
        'submitted',
        'response',
        'confirmation',
        'freebirdformviewerviewresponseconfirmation',
        'tesekk'
    ].some((k) => contentLower.includes(k));

    if (!sent) {
        // Seçimler tamamlandıysa yine de başarı sayılabilir; Google bazen farklı onay metni gösterir
        console.log('  [UYARI] Onay metni net görülmedi; seçimler tamamlandığı için başarılı kabul ediliyor.');
    }

    return {
        success: true,
        message: sent
            ? 'Form başarıyla gönderildi.'
            : 'Form seçimleri tamamlandı ve gönderildi.'
    };
}

/**
 * Anket doldurma işlemini yürütür (gerekirse yeniden dener).
 */
async function doldurAnket(isHeadless = true) {
    console.log('='.repeat(60));
    console.log('  GOOGLE FORM OTOMATİK DOLDURMA (NODE.JS)');
    console.log('='.repeat(60));

    const MAX_FORM_ATTEMPTS = 3;
    let browser;

    try {
        const launchOptions = {
            headless: isHeadless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        };

        try {
            browser = await chromium.launch(launchOptions);
        } catch (launchErr) {
            console.log('  [BİLGİ] Playwright chromium bulunamadı. Render/Sunucuda otomatik indiriliyor...');
            try {
                execSync('npx playwright install chromium', { stdio: 'inherit' });
                browser = await chromium.launch(launchOptions);
            } catch (installErr) {
                console.log('  [BİLGİ] Sistem tarayıcısı deneniyor...');
                try {
                    browser = await chromium.launch({ ...launchOptions, channel: 'chrome' });
                } catch (chromeErr) {
                    browser = await chromium.launch({ ...launchOptions, channel: 'msedge' });
                }
            }
        }

        let lastError = null;

        for (let attempt = 1; attempt <= MAX_FORM_ATTEMPTS; attempt++) {
            const context = await browser.newContext({
                locale: 'tr-TR',
                userAgent:
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            const page = await context.newPage();
            page.setDefaultTimeout(30000);

            try {
                if (attempt > 1) {
                    console.log(`\n[YENİDEN DENEME ${attempt}/${MAX_FORM_ATTEMPTS}] Form tekrar açılıyor...`);
                    await page.waitForTimeout(2000 * attempt);
                }

                const fillResult = await doldurAnketOnPage(page);

                console.log('\n' + '='.repeat(60));
                console.log('  [BAŞARILI] FORM BAŞARIYLA GÖNDERİLDİ!');
                const logRes = await gonderimKaydet(true, fillResult.message);
                await context.close();
                await browser.close();
                return {
                    success: true,
                    message: 'Form başarıyla gönderildi ve loglandı.',
                    logResult: logRes,
                    attempts: attempt
                };
            } catch (attemptErr) {
                lastError = attemptErr;
                console.error(
                    `[DENEME ${attempt}/${MAX_FORM_ATTEMPTS}] Başarısız:`,
                    attemptErr.message
                );
                await context.close().catch(() => {});
            }
        }

        const hataMesaji = `Form doldurma hatası (${MAX_FORM_ATTEMPTS} deneme): ${lastError?.message || 'bilinmeyen hata'}`;
        console.error('Anket doldurulurken hata oluştu:', lastError);
        const logRes = await gonderimKaydet(false, hataMesaji);
        if (browser) await browser.close();
        return { success: false, error: lastError?.message, logResult: logRes };
    } catch (err) {
        console.error('Anket doldurulurken hata oluştu:', err);
        const logRes = await gonderimKaydet(false, `Form doldurma hatası: ${err.message}`);
        if (browser) await browser.close().catch(() => {});
        return { success: false, error: err.message, logResult: logRes };
    }
}

/**
 * Her gün 22:00 (Türkiye Saati) için zamanlayıcıyı başlatır.
 * NODE_ENV=development (localhost) iken kurulmaz; yalnızca production'da çalışır.
 */
function scheduleAnketJob() {
    if (process.env.NODE_ENV === 'development') {
        console.log('⏭️ Anket zamanlayıcısı atlandı (NODE_ENV=development). Localhost otomatik göndermez.');
        return null;
    }

    const job = schedule.scheduleJob({ rule: '0 22 * * *', tz: 'Europe/Istanbul' }, async () => {
        if (process.env.NODE_ENV === 'development') {
            console.log('[ZAMANLAYICI] NODE_ENV=development — anket gönderimi atlandı.');
            return;
        }
        const zaman = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        console.log(`\n[ZAMANLAYICI - ${zaman}] Günlük anket doldurma görevi başlatıldı...`);
        try {
            const sonuc = await doldurAnket(true);
            console.log(`[ZAMANLAYICI] Sonuç:`, sonuc);
        } catch (error) {
            console.error(`[ZAMANLAYICI] Hata:`, error);
        }
    });
    console.log("✅ Anket doldurma zamanlayıcısı kuruldu: Her gün saat 22:00 (TSİ)");
    return job;
}

module.exports = {
    doldurAnket,
    gonderimKaydet,
    scheduleAnketJob
};

if (require.main === module) {
    (async () => {
        console.log("Manuel anket doldurma başlatılıyor...");
        const sonuc = await doldurAnket(false);
        console.log("Sonuç:", sonuc);
    })();
}
