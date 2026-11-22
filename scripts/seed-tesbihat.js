'use strict';
// Tesbihat sekmesi için gösterilecek içerikleri (kısa / uzun / arapça uzun) kaynak
// metinden ayrıştırıp MongoDB'deki `tesbihatlar` koleksiyonuna yazar.
//
// Kullanım: node scripts/seed-tesbihat.js
// Gereken paketler: npm install mongodb dotenv
// Gereken ortam değişkenleri (.env dosyasında): MONGO_URI ve DB_NAME
//
// Kaynak metin: scripts/data/tesbihat-kaynak-arapca-uzun.txt
//   (mavera.com.tr'deki "<vakit>-namazi-tesbihati-arapca-uzun" sayfalarının
//    kullanıcı tarafından birleştirilmiş hali; her vakit için Türkçe yönerge
//    satırları ile Arapça metin satırları sırayla ve ayrı satırlarda verilmiştir.)
//
// Üretilen koleksiyon: tesbihatlar
//   { vakit, tur, baslik, adimlar: [{ bolum, tur: 'turkce'|'arapca', metin }] }
//   vakit: 'sabah' | 'ogle' | 'ikindi' | 'aksam' | 'yatsi'
//   tur:   'kisa' | 'uzun' | 'arapca-uzun'
//     - 'arapca-uzun': kaynak metindeki Arapça yazı aynen kullanılır.
//     - 'uzun': aynı içerik, Arapça kısımların yerine Türkçe okunuşu (transliterasyonu) kullanılır.
//     - 'kisa': 'uzun' ile aynıdır, fakar tesbihten sonraki dua bitince "Fa'lem ennehu" ile başlayan
//       salavat ve Esma-i Hüsna duası bölümleri atlanır, doğrudan tesbihatın bitiriş sûresine geçilir.
//   bolum: 'ana' | 'ozel-dua' | 'esma' | 'kapanis-suresi' (yalnızca gruplama/gösterim amaçlı)

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const COLLECTION = 'tesbihatlar';
const SOURCE_PATH = path.join(__dirname, 'data', 'tesbihat-kaynak-arapca-uzun.txt');

const VAKIT_BASLIKLARI = {
  sabah: 'Sabah Namazı',
  ogle: 'Öğle Namazı',
  ikindi: 'İkindi Namazı',
  aksam: 'Akşam Namazı',
  yatsi: 'Yatsı Namazı'
};

const VAKIT_HEADER_ESLEME = {
  'SABAH NAMAZI': 'sabah',
  'ÖĞLE NAMAZI': 'ogle',
  'İKİNDİ NAMAZI': 'ikindi',
  'AKŞAM NAMAZI': 'aksam',
  'YATSI NAMAZI': 'yatsi'
};

const ARABIC_RE = /[؀-ۿ]/;
const SEPARATOR_RE = /^[-*•\s]+$/;
const HASIYE_RE = /^\{Ha[şs]iye/i;
const KISA_KESIM_BASLANGIC = 'duadan sonra';

// --- Arapça metin -> Türkçe okunuş (transliterasyon) eşlemesi -------------------
// "Uzun tesbihat", "arapça uzun tesbihat" ile birebir aynı sırayı takip eder; tek
// fark Arapça yazı yerine bu eşlemedeki Türkçe okunuşun kullanılmasıdır.

function esmaCiftiOkunus(isim1, isim2) {
  return `Sübhâneke yâ ${isim1}, teâleyte yâ ${isim2}, ecirnâ mine'n-nâri bi-afvike yâ Rahmân.`;
}

// Duâ-i Tercümân-ı İsm-i A'zam'daki 38 çift isim (Arapça metindeki sıra ile aynı)
const ESMA_CIFTLERI = [
  ['اَللّٰهُ', 'رَحْمٰنُ', 'Allah', 'Rahmân'],
  ['رَحٖيمُ', 'كَرٖيمُ', 'Rahîm', 'Kerîm'],
  ['حَمٖيدُ', 'حَكٖيمُ', 'Hamîd', 'Hakîm'],
  ['مَجٖيدُ', 'مَلِكُ', 'Mecîd', 'Melik'],
  ['قُدُّوسُ', 'سَلَامُ', 'Kuddûs', 'Selâm'],
  ['مُؤْمِنُ', 'مُهَيْمِنُ', "Mü'min", 'Müheymin'],
  ['عَزٖيزُ', 'جَبَّارُ', 'Azîz', 'Cebbâr'],
  ['مُتَكَبِّرُ', 'خَالِقُ', 'Mütekebbir', 'Hâlık'],
  ['اَوَّلُ', 'اٰخِرُ', 'Evvel', 'Âhir'],
  ['ظَاهِرُ', 'بَاطِنُ', 'Zâhir', 'Bâtın'],
  ['بَارِىءُ', 'مُصَوِّرُ', 'Bârî', 'Musavvir'],
  ['تَوَّابُ', 'وَهَّابُ', 'Tevvâb', 'Vehhâb'],
  ['بَاعِثُ', 'وَارِثُ', 'Bâis', 'Vâris'],
  ['قَدٖيمُ', 'مُقٖيمُ', 'Kadîm', 'Mukîm'],
  ['فَرْدُ', 'وِتْرُ', 'Ferd', 'Vitr'],
  ['نُورُ', 'سَتَّارُ', 'Nûr', 'Settâr'],
  ['جَلٖيلُ', 'جَمٖيلُ', 'Celîl', 'Cemîl'],
  ['قَاهِرُ', 'قَادِرُ', 'Kâhir', 'Kâdir'],
  ['مَلٖيكُ', 'مُقْتَدِرُ', 'Melîk', 'Muktedir'],
  ['عَلٖيمُ', 'عَلَّامُ', 'Alîm', 'Allâm'],
  ['عَظٖيمُ', 'غَفُورُ', 'Azîm', 'Gafûr'],
  ['حَلٖيمُ', 'وَدُودُ', 'Halîm', 'Vedûd'],
  ['شَهٖيدُ', 'شَاهِدُ', 'Şehîd', 'Şâhid'],
  ['كَبٖيرُ', 'مُتَعَالِ', 'Kebîr', 'Müteâl'],
  ['نُورُ', 'لَطٖيفُ', 'Nûr', 'Latîf'],
  ['سَمٖيعُ', 'كَفٖيلُ', "Semî'", 'Kefîl'],
  ['قَرٖيبُ', 'بَصٖيرُ', 'Karîb', 'Basîr'],
  ['حَقُّ', 'مُبٖينُ', 'Hak', 'Mübîn'],
  ['رَؤُفُ', 'رَحٖيمُ', 'Raûf', 'Rahîm'],
  ['طَاهِرُ', 'مُطَهِّرُ', 'Tâhir', 'Mutahhir'],
  ['مُجَمِّلُ', 'مُفَضِّلُ', 'Mücemmil', 'Müfaddil'],
  ['مُظْهِرُ', 'مُنْعِمُ', 'Muzhir', "Mün'im"],
  ['دَيَّانُ', 'سُلْطَانُ', 'Deyyân', 'Sultân'],
  ['حَنَّانُ', 'مَنَّانُ', 'Hannân', 'Mennân'],
  ['اَحَدُ', 'صَمَدُ', 'Ahad', 'Samed'],
  ['حَىُّ', 'قَيُّومُ', 'Hayy', 'Kayyûm'],
  ['عَدْلُ', 'حَكَمُ', 'Adl', 'Hakem'],
  ['فَرْدُ', 'قُدُّوسُ', 'Ferd', 'Kuddûs']
];

// Mavera metnindeki küçük yazım farklarını (sondaki ötre harekesi vb.) tolere etmek için
// eşleştirme anahtarları kaynak metinden üretilir; burada sadece okunuş üretimi yapılır.
function esmaCiftleriMap() {
  const girdiler = [];
  // İlk çift (29 numaralı satır) ve 30-66 arası aynı kalıpla devam eder.
  for (const [ar1, ar2, tr1, tr2] of ESMA_CIFTLERI) {
    const anahtarVarA = `سُبْحَانَك يَٓا ﴿${ar1}﴾ تَعَالَيْتَ يَا ﴿${ar2}﴾ اَجِرْنَا مِنَ النَّارِ بِعَفْوِكَ يَا رَحْمٰنُ`;
    const anahtarVarB = `سُبْحَانَكَ يَا ﴿${ar1}﴾ تَعَالَيْتَ يَا ﴿${ar2}﴾ اَجِرْنَا مِنَ النَّارِ بِعَفْوِكَ يَا رَحْمٰنُ`;
    const anahtarVarC = `سُبْحَانَكَ يَٓا ﴿${ar1}﴾ تَعَالَيْتَ يَٓا ﴿${ar2}﴾ اَجِرْنَا مِنَ النَّارِ بِعَفْوِكَ يَا رَحْمٰنُ`;
    const okunus = esmaCiftiOkunus(tr1, tr2);
    girdiler.push([anahtarVarA, okunus], [anahtarVarB, okunus], [anahtarVarC, okunus]);
  }
  return girdiler;
}

// "Yâ <isim> yâ Allah" zinciri (99 isim yerine kullanılan kısaltılmış liste, ❁ ile ayrılmış tek satır)
const ZINCIR_ISIMLERI = [
  ['جَمٖيلُ', 'Cemîl'], ['قَرٖيبُ', 'Karîb'], ['مُجٖيبُ', 'Mücîb'], ['حَبٖيبُ', 'Habîb'],
  ['رَؤُفُ', 'Raûf'], ['عَطُوفُ', 'Atûf'], ['مَعْرُوفُ', "Ma'rûf"], ['لَطٖيفُ', 'Latîf'],
  ['عَظٖيمُ', 'Azîm'], ['حَنَّانُ', 'Hannân'], ['مَنَّانُ', 'Mennân'], ['دَيَّانُ', 'Deyyân'],
  ['سُبْحَانُ', 'Sübhân'], ['اَمَانُ', 'Emân'], ['بُرْهَانُ', 'Bürhân'], ['سُلْطَانُ', 'Sultân'],
  ['مُسْتَعَانُ', "Müste'ân"], ['مُحْسِنُ', 'Muhsin'], ['مُتَعَالِ', 'Müteâl'], ['رَحْمٰنُ', 'Rahmân'],
  ['رَحٖيمُ', 'Rahîm'], ['كَرٖيمُ', 'Kerîm'], ['مَجٖيدُ', 'Mecîd'], ['فَرْدُ', 'Ferd'],
  ['وِتْرُ', 'Vitr'], ['اَحَدُ', 'Ahad'], ['صَمَدُ', 'Samed'], ['مَحْمُودُ', 'Mahmûd'],
  ['صَادِقَالْوَعْدِ', "Sâdıka'l-va'd"], ['عَلِىُّ', 'Alî'], ['غَنِىُّ', 'Ganî'], ['شَافٖى', 'Şâfî'],
  ['كَافٖى', 'Kâfî'], ['مُعَافٖى', 'Muâfî'], ['بَاقٖى', 'Bâkî'], ['هَادٖى', 'Hâdî'],
  ['قَادِرُ', 'Kâdir'], ['سَاتِرُ', 'Sâtir'], ['قَهَّارُ', 'Kahhâr'], ['جَبَّارُ', 'Cebbâr'],
  ['غَفَّارُ', 'Gaffâr'], ['فَتَّاحُ', 'Fettâh']
];

function zincirOkunusuUret() {
  return ZINCIR_ISIMLERI.map(([, tr]) => `Yâ ${tr} yâ Allah`).join(' ❁ ') + '.';
}

function zincirAnahtariUret() {
  const parcalar = ZINCIR_ISIMLERI.map(([ar], i) => {
    const ya = i === 0 || i === 24 || i === 13 ? 'يَٓا' : 'يَا';
    return `${ya} ﴿${ar}﴾ يَٓا اَللّٰهُ`;
  });
  return parcalar.join(' ❁ ');
}

const DOGRUDAN_OKUNUSLAR = [
  ['اَللّٰهُمَّ اَنْتَ السَّلَامُ وَ مِنْكَ السَّلَامُ تَبَارَكْتَ يَا ذَا الْجَلَالِ وَ اْلاِكْرَامِ',
    "Allahümme ente's-selâm ve minke's-selâm, tebârekte yâ ze'l-celâli ve'l-ikrâm."],
  ['اَللّٰهُمَّ صَلِّ عَلٰى سَيِّدِنَا مُحَمَّدٍ وَ عَلَٓى اٰلِ سَيِّدِنَا مُحَمَّدٍ صَلَاةً تُنْجٖينَا بِهَا مِنْ جَمٖيعِ الْاَهْوَالِ وَ اْلاٰفَاتِ وَ تَقْضٖى لَنَا بِهَا جَمٖيعَ الْحَاجَاتِ وَ تُطَهِّرُنَا بِهَا مِنْ جَمٖيعِ السَّيِّئَاتِ وَ تَرْفَعُنَا بِهَا عِنْدَكَ اَعْلَى الدَّرَجَاتِ وَ تُبَلِّغُنَا بِهَٓا اَقْصَى الْغَايَاتِ مِنْ جَمٖيعِ الْخَيْرَاتِ فِى الْحَيَاةِ وَ بَعْدَ الْمَمَاتِ اٰمٖينَ يَا مُجٖيبَ الدَّعَوَاتِ وَالْحَمْدُ لِلّٰهِ رَبِّ الْعَالَمٖينَ',
    "Allahümme salli alâ seyyidinâ Muhammedin ve alâ âli seyyidinâ Muhammed, salâten tüncînâ bihâ min cemî'i'l-ehvâli ve'l-âfât, ve takdî lenâ bihâ cemî'a'l-hâcât, ve tutahhirunâ bihâ min cemî'i's-seyyiât, ve terfeunâ bihâ indeke a'le'd-derecât, ve tübelliğunâ bihâ aksa'l-gâyât min cemî'i'l-hayrâti fi'l-hayâti ve ba'de'l-mevât, âmîn yâ mücîbe'd-da'avât, ve'l-hamdü lillâhi Rabbi'l-âlemîn."],
  ['اَللّٰهُمَّ اِنَّا نُقَدِّمُ اِلَيْكَ بَيْنَ يَدَىْ كُلِّ نَفَسٍ وَ لَمْحَةٍ وَ لَحْظَةٍ وَ طَرْفَةٍ يَطْرِفُ بِهَٓا اَهْلُ السَّمٰوَاتِ وَ اَهْلُ الْاَرَضٖينَ شَهَادَةً اَشْهَدُ اَنْ',
    "Allahümme innâ nükaddimu ileyke beyne yedey külli nefesin ve lemhatin ve lahzatin ve tarfetin yatrifu bihâ ehlü's-semâvâti ve ehlü'l-arazîne, şehâdeten eşhedü en:"],
  ['لَٓا اِلٰهَ اِلَّا اللّٰهُ وَحْدَهُ لَٓا شَرٖيكَ لَهُ لَهُ الْمُلْكُ وَ لَهُ الْحَمْدُ يُحْيٖى وَ يُمٖيتُ وَ هُوَ حَىٌّ لَا يَمُوتُ بِيَدِهِ الْخَيْرُ وَ هُوَ عَلٰى كُلِّ شَىْءٍ قَدٖيرٌ',
    "Lâ ilâhe illallahu vahdehû lâ şerîke leh, lehü'l-mülkü ve lehü'l-hamdü, yuhyî ve yümît ve hüve hayyün lâ yemût, bi-yedihi'l-hayr ve hüve alâ külli şey'in kadîr."],
  ['وَ اِلَيْهِ الْمَصٖيرُ', "Ve ileyhi'l-masîr."],
  ['اَللّٰهُمَّ اَجِرْنَا مِنَ النَّارِ', "Allahümme ecirnâ mine'n-nâr."],
  ['اَللّٰهُمَّ اَجِرْنَا مِنْ كُلِّ نَارٍ ❁ اَللّٰهُمَّ اَجِرْنَا مِنَ الْفِتْنَةِ الدّٖينِيَّةِ وَ الدُّنْيَوِيَّةِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ فِتْنَةِ اٰخِرِ الزَّمَانِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ فِتْنَةِ الْمَسٖيحِ الدَّجَّالِ وَ السُّفْيَانِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنَ الضَّلَالَاتِ وَ الْبِدْعِيَّاتِ وَ الْبَلِيَّاتِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ شَرِّ النَّفْسِ الْاَمَّارَةِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ شُرُورِ النُّفُوسِ الْاَمَّارَاتِ الْفِرْعَوْنِيَّةِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ شَرِّ النِّسَٓاءِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ بَلَٓاءِ النِّسَٓاءِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ فِتْنَةِ النِّسَٓاءِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ عَذَابِ الْقَبْرِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ عَذَابِ يَوْمِ الْقِيٰمَةِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ عَذَابِ جَهَنَّمَ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ عَذَابِ قَهْرِكَ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ نَارِ قَهْرِكَ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ عَذَابِ الْقَبْرِ وَ الٖنّيرَانِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنَ الرِّيَاءِ وَ السُّمْعَةِ وَ الْعُجُبِ وَ الْفَخْرِ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ تَجَاوُزِ الْمُلْحِدٖينَ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ شَرِّ الْمُنَافِقٖينَ ❁ اَللّٰهُمَّ اَجِرْنَا مِنْ فِتْنَةِ الْفَاسِقٖينَ ❁ اَللّٰهُمَّ اَجِرْنَا وَ اَجِرْ وَالِدَيْنَا وَ طَلَبَةَ رَسَٓائِلِ النُّورِ الصَّادِقٖينَ فٖى خِدْمَةِ الْقُرْاٰنِ وَ اْلاٖيمَانِ وَ اَحْبَابَنَا الْمُؤْمِنٖينَ الْمُخْلِصٖينَ وَ اَقْرِبَٓائَنَا وَ اَجْدَادَنَا مِنَ النَّارِ',
    "Allahümme ecirnâ min külli nâr ❁ Allahümme ecirnâ mine'l-fitneti'd-dîniyyeti ve'd-dünyeviyye ❁ Allahümme ecirnâ min fitneti âhiri'z-zamân ❁ Allahümme ecirnâ min fitneti'l-Mesîhi'd-Deccâli ve's-Süfyân ❁ Allahümme ecirnâ mine'd-dalâlâti ve'l-bid'iyyâti ve'l-beliyyât ❁ Allahümme ecirnâ min şerri'n-nefsi'l-emmâre ❁ Allahümme ecirnâ min şurûri'n-nüfûsi'l-emmârâti'l-fir'avniyye ❁ Allahümme ecirnâ min şerri'n-nisâ ❁ Allahümme ecirnâ min belâi'n-nisâ ❁ Allahümme ecirnâ min fitneti'n-nisâ ❁ Allahümme ecirnâ min azâbi'l-kabr ❁ Allahümme ecirnâ min azâbi yevmi'l-kıyâme ❁ Allahümme ecirnâ min azâbi Cehennem ❁ Allahümme ecirnâ min azâbi kahrik ❁ Allahümme ecirnâ min nâri kahrik ❁ Allahümme ecirnâ min azâbi'l-kabri ve'n-nîrân ❁ Allahümme ecirnâ mine'r-riyâi ve's-sum'ati ve'l-ucbi ve'l-fahr ❁ Allahümme ecirnâ min tecâvüzi'l-mülhidîn ❁ Allahümme ecirnâ min şerri'l-münâfikîn ❁ Allahümme ecirnâ min fitneti'l-fâsıkîn ❁ Allahümme ecirnâ ve ecir vâlideynâ ve talebete Resâili'n-Nûri's-sâdıkîne fî hidmeti'l-Kur'âni ve'l-îmân, ve ahbâbenâ'l-mü'minîne'l-muhlisîne ve akribâenâ ve ecdâdenâ mine'n-nâr."],
  ['بِعَفْوِكَ يَا مُجٖيرُ بِفَضْلِكَ يَا غَفَّارُ ❁ اَللّٰهُمَّ اَدْخِلْنَا الْجَنَّةَ مَعَ الْاَبْرَارِ ❁ اَللّٰهُمَّ اَدْخِلْنَا الْجَنَّةَ مَعَ الْاَبْرَارِ ❁ اَللّٰهُمَّ اَدْخِلْنَا وَ اَدْخِلْ اُسْتَادَنَا سَعٖيدَ النُّورْسٖى رَضِىَ اللّٰهُ عَنْهُ وَ وَالِدَيْنَا وَ طَلَبَةَ رَسَٓائِلِ النُّورِ الصَّادِقٖينَ وَ اِخْوَانَنَا وَ اَخَوَاتِنَا وَ اَقْرِبَٓائَنَا وَ اَجْدَادَنَا وَ اَحْبَابَنَا الْمُؤْمِنٖينَ الْمُخْلِصٖينَ فٖى خِدْمَةِ اْلاٖيمَانِ وَ الْقُرْاٰنِ اَلْجَنَّةَ مَعَ الْاَبْرَارِ صَلِّ عَلٰى نَبِيِّكَ الْمُخْتَارِ وَ اٰلِهٖ الْاَطْهَارِ وَ اَصْحَابِهِ الْاَخْيَارِ وَ سَلِّمْ مَادَامَ الَّيْلُ وَ النَّهَارُ اٰمٖينَ وَالْحَمْدُ لِلّٰهِ رَبِّ الْعَالَمٖينَ',
    "Bi-afvike yâ Mücîr, bi-fadlike yâ Gaffâr. Allahümme edhilnâ'l-cennete mea'l-ebrâr. Allahümme edhilnâ'l-cennete mea'l-ebrâr. Allahümme edhilnâ ve edhil üstâzenâ Saîde'n-Nûrsî radıyallahu anh ve vâlideynâ ve talebete Resâili'n-Nûri's-sâdıkîne ve ihvânenâ ve ehavâtinâ ve akribâenâ ve ecdâdenâ ve ahbâbenâ'l-mü'minîne'l-muhlisîne fî hidmeti'l-îmâni ve'l-Kur'ân, el-cennete mea'l-ebrâr. Salli alâ Nebiyyike'l-muhtâr ve âlihi'l-athâr ve ashâbihi'l-ahyâr ve sellim mâdâme'l-leylü ve'n-nehâr, âmîn ve'l-hamdü lillâhi Rabbi'l-âlemîn."],
  ['سُبْحَانَ اللّٰهِ وَالْحَمْدُ لِلّٰهِ وَلَٓا اِلَهَ اِلَّا اللّٰهُ وَ اللّٰهُ اَكْبَرْ وَلَا حَوْلَ وَلَا قُوَّةَ اِلَّا بِاللّٰهِ الْعَلِىِّ الْعَظٖيمِْ',
    "Sübhânallâhi ve'l-hamdü lillâhi ve lâ ilâhe illallahu vallâhü ekber, ve lâ havle ve lâ kuvvete illâ billâhi'l-aliyyi'l-azîm."],
  ['بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحٖيمِ', 'Bismillâhirrahmânirrahîm.'],
  ['اَللّٰهُ لَٓا اِلٰهَ اِلَّا هُوَۚ اَلْحَىُّ الْقَيُّومُۚ لَا تَاْخُذُهُ سِنَةٌ وَلَا نَوْمٌۜ لَهُ مَا فِى السَّمٰوَاتِ وَمَا فِى الْاَرْضِۜ مَنْ ذَا الَّذٖى يَشْفَعُ عِنْدَهُٓ اِلَّا بِاِذْنِهٖۜ يَعْلَمُ مَا بَيْنَ اَيْدٖيهِمْ وَمَا خَلْفَهُمْۚ وَلَا يُحٖيطُونَ بِشَيْءٍ مِنْ عِلْمِهٖٓ اِلَّا بِمَا شَٓاءَۚ وَسِعَ كُرْسِيُّهُ السَّمٰوَاتِ وَالْاَرْضَۚ وَلَا يَؤُ۫دُهُ حِفْظُهُمَاۚ وَهُوَ الْعَلِىُّ الْعَظٖيمُ',
    "Allâhü lâ ilâhe illâ hû, el-Hayyu'l-Kayyûm, lâ te'huzühû sinetün ve lâ nevm, lehû mâ fi's-semâvâti ve mâ fi'l-ard, men ze'llezî yeşfeu indehû illâ bi-iznih, ya'lemü mâ beyne eydîhim ve mâ halfehüm, ve lâ yühîtûne bi-şey'in min ilmihî illâ bimâ şâe, vesia kürsiyyühü's-semâvâti ve'l-arda ve lâ yeûdühû hıfzuhümâ, ve hüve'l-Aliyyü'l-Azîm."],
  ['سُبْحَانَ اللّٰهِ', 'Sübhânallah.'],
  ['اَلْحَمْدُ لِلّٰهِ', 'Elhamdülillah.'],
  ['اَللّٰهُ اَكْبَرُ', 'Allahü ekber.'],
  ['لَٓا اِلٰهَ اِلَّا اللّٰهُ وَحْدَهُ لَا شَرٖيكَ لَهُ لَهُ الْمُلْكُ وَ لَهُ الْحَمْدُ يُحْيٖى وَ يُمٖيتُ وَ هُوَ حَىٌّ لَا يَمُوتُ بِيَدِهِ الْخَيْرُ وَ هُوَ عَلٰى كُلِّ شَىْءٍ قَدٖيرٌ وَ اِلَيْهِ الْمَصٖيرُ',
    "Lâ ilâhe illallahu vahdehû lâ şerîke leh, lehü'l-mülkü ve lehü'l-hamdü, yuhyî ve yümît ve hüve hayyün lâ yemût, bi-yedihi'l-hayr ve hüve alâ külli şey'in kadîr, ve ileyhi'l-masîr."],
  ['سُبْحَانَ رَبِّىَ الْعَلِىِّ الْأَعْلَى الْوَهَّابْ', "Sübhâne Rabbiye'l-Aliyyi'l-A'le'l-Vehhâb."],
  ['فَاعْلَمْ اَنَّهُ', "Fa'lem ennehû:"],
  ['لَٓا اِلٰهَ اِلَّا اللّٰهُ', 'Lâ ilâhe illallah.'],
  ['مُحَمَّدٌ رَسُولُ اللّٰهِ صَلَّى اللّٰهُ تَعَالٰى عَلَيْهِ وَ سَلَّمَ', 'Muhammedün Resûlullah, sallallahu teâlâ aleyhi ve sellem.'],
  ['لَٓا اِلٰهَ اِلَّا اللّٰهُ اَلْمَلِكُ الْحَقُّ الْمُبٖينُ مُحَمَّدٌ رَسُولُ اللّٰهِ صَادِقُ الْوَعْدِ الْاَمٖينُ',
    "Lâ ilâhe illallahü'l-Melikü'l-Hakku'l-Mübîn, Muhammedün Resûlullah sâdıku'l-va'di'l-emîn."],
  ['اِنَّ اللّٰهَ وَ مَلَٓئِكَتَهُ يُصَلُّونَ عَلَى النَّبِىِّ يَٓا اَيُّهَا الَّذٖينَ اٰمَنُوا صَلُّوا عَلَيْهِ وَ سَلِّمُوا تَسْلٖيمًا ❁ لَبَّيْكَ',
    "İnnallahe ve melâiketehû yusallûne ale'n-nebî, yâ eyyühe'llezîne âmenû sallû aleyhi ve sellimû teslîmâ. Lebbeyk."],
  ['اَللّٰهُمَّ صَلِّ عَلٰى سَيِّدِنَا مُحَمَّدٍ وَعَلَٓى اٰلِ سَيِّدِنَا مُحَمَّدٍ بِعَدَدِ كُلِّ دَٓاءٍ وَدَوَٓاءٍ وَبَارِكْ وَسَلِّمْ عَلَيْهِ وَعَلَيْهِمْ كَثٖيرًا',
    "Allahümme salli alâ seyyidinâ Muhammedin ve alâ âli seyyidinâ Muhammed, bi-adedi külli dâin ve devâin, ve bârik ve sellim aleyhi ve aleyhim kesîrâ."],
  ['اَللّٰهُمَّ صَلِّ عَلٰى سَيِّدِنَا مُحَمَّدٍ وَعَلَٓى اٰلِ سَيِّدِنَا مُحَمَّدٍ بِعَدَدِ كُلِّ دَٓاءٍ وَدَوَٓاءٍ وَبَارِكْ وَسَلِّمْ عَلَيْهِ وَعَلَيْهِمْ كَثٖيرًا كَثٖيرًا',
    "Allahümme salli alâ seyyidinâ Muhammedin ve alâ âli seyyidinâ Muhammed, bi-adedi külli dâin ve devâin, ve bârik ve sellim aleyhi ve aleyhim kesîran kesîrâ."],
  ['صَلِّ وَ سَلِّمْ يَا رَبِّ عَلٰى حَبٖيبِكَ مُحَمَّدٍ وَ عَلٰى جَمٖيعِ الْاَنْبِيَٓاءِ وَ الْمُرْسَلٖينَ وَ عَلَٓى اٰلِ كُلٍّ وَ صَحْبِ كُلٍّ اَجْمَعٖينَ اٰمٖينَ وَالْحَمْدُ لِلّٰهِ رَبِّ الْعَالَمٖينَ',
    "Salli ve sellim yâ Rabbi alâ habîbike Muhammedin ve alâ cemî'i'l-enbiyâi ve'l-mürselîn, ve alâ âli küllin ve sahbi küllin ecmaîn, âmîn ve'l-hamdü lillâhi Rabbi'l-âlemîn."],
  ['اَلْفُ اَلْفِ صَلَاةٍ وَ اَلْفُ اَلْفِ سَلَامٍ عَلَيْكَ يَا رَسُولَ اللّٰهِ', "Elfü elfi salâtin ve elfü elfi selâmin aleyke yâ Resûlallah."],
  ['اَلْفُ اَلْفِ صَلَاةٍ وَ اَلْفُ اَلْفِ سَلَامٍ عَلَيْكَ يَا حَبٖيبَ اللّٰهِ', "Elfü elfi salâtin ve elfü elfi selâmin aleyke yâ Habîballah."],
  ['اَلْفُ اَلْفِ صَلَاةٍ وَ اَلْفُ اَلْفِ سَلَامٍ عَلَيْكَ يَٓا اَمٖينَ وَحْىِ اللّٰهِ', "Elfü elfi salâtin ve elfü elfi selâmin aleyke yâ Emîne vahyillah."],
  ['اَللّٰهُمَّ صَلِّ وَ سَلِّمْ وَ بَارِكْ عَلٰى سَيِّدِنَا مُحَمَّدٍ وَعَلَٓى اٰلِهٖ وَ اَصْحَابِهٖ بِعَدَدِ اَوْرَاقِ الْاَشْجَارِ وَ اَمْوَاجِ الْبِحَارِ وَ قَطَرَاتِ الْاَمْطَارِ وَ اغْفِرْلَنَا وَ ارْحَمْنَا وَ الْطُفْ بِنَا وَ بِاُسْـتَاذِنَا سَعٖيدِ النُّورْسٖى رَضِىَ اللّٰهُ عَنْهُ وَ وَالِدَيْنَا وَ بِطَلَبَةِ رَسَٓائِلِ النُّورِ الصَّادِقٖينَ يَٓا اِلٰهَنَا بِكُلِّ صَلَاةٍ مِنْهَٓا اَشْهَدُ اَنْ لَٓا اِلٰهَ اِلَّا اللّٰهُ وَ اَشْهَدُ اَنَّ مُحَمَّدًا رَسُولُ اللّٰهِ صَلَّى اللّٰهُ تَعَالٰى عَلَيْهِ وَ سَلَّمْ',
    "Allahümme salli ve sellim ve bârik alâ seyyidinâ Muhammedin ve alâ âlihî ve ashâbihî bi-adedi evrâki'l-eşcâri ve emvâci'l-bihâri ve katarâti'l-emtâr, ve'ğfirlenâ ve'rhamnâ ve'ltuf binâ ve bi-üstâzinâ Saîdi'n-Nûrsî radıyallahu anh ve vâlideynâ ve bi-talebeti Resâili'n-Nûri's-sâdıkîn, yâ İlâhenâ bi-külli salâtin minhâ eşhedü en lâ ilâhe illallah ve eşhedü enne Muhammeden Resûlullah sallallahu teâlâ aleyhi ve sellem."],
  ['سُبْحَانَكَ اٰهِيًّا شَرَاهِيًّا تَعَالَيْتَ لَٓا اِلٰهَ اِلَّٓا اَنْتَ اَجِرْنَا وَ اَجِرْ اُسْتَاذَنَا سَعٖيدَ النُّورْسٖى رَضِىَ اللّٰهُ عَنْهُ وَ وَالِدَيْنَا وَ اِخْوَانَنَا وَ اَخَوَاتِنَـا وَ طَلَبَةَ رَسَٓائِلِ النُّورِ وَ رُفَقَٓائَنَا وَ اَحْبَابَنَا الْمُخْلِصٖينَ مِنَ النَّارِ وَ مِنْ كُلِّ نَارٍ وَ احْفَظْنَا مِنْ شَرِّ النَّفْسِ وَ الشَّيْطَانِ وَ مِنْ شَرِّ الْجِنِّ وَ اْلاِنْسَانِ وَ مِنْ شَرِّ الْبِدْعَةِ وَ الضَّلَالَاتِ وَ اْلاِلْحَادِ وَ الطُّغْيَانِ بِعَفْوِكَ يَا مُجٖيرُ بِفَضْلِكَ يَا غَفَّارُ بِرَحْمَتِكَ يَٓا اَرْحَمَ الرَّاحِمٖينَ ❁ اَللّٰهُمَّ اَدْخِلْنَا الْجَنَّةَ مَعَ الْاَبْرَارِ بِشَفَاعَةِ نَبِيِّكَ الْمُخْتَارِ اٰمٖينَ وَالْحَمْدُ لِلّٰهِ رَبِّ الْعَالَمٖينَ',
    "Sübhâneke Âhiyyen Şerâhiyyen teâleyte, lâ ilâhe illâ ente, ecirnâ ve ecir üstâzenâ Saîde'n-Nûrsî radıyallahu anh ve vâlideynâ ve ihvânenâ ve ehavâtinâ ve talebete Resâili'n-Nûr ve rufekâenâ ve ahbâbenâ'l-muhlisîne mine'n-nâri ve min külli nâr, ve'hfaznâ min şerri'n-nefsi ve'ş-şeytâni ve min şerri'l-cinni ve'l-insâni ve min şerri'l-bid'ati ve'd-dalâlâti ve'l-ilhâdi ve't-tuğyân, bi-afvike yâ Mücîr, bi-fadlike yâ Gaffâr, bi-rahmetike yâ erhame'r-râhimîn. Allahümme edhilnâ'l-cennete mea'l-ebrâr bi-şefâati Nebiyyike'l-muhtâr, âmîn ve'l-hamdü lillâhi Rabbi'l-âlemîn."],
  ['سُبْحَانَكَ اٰهِيًّا شَرَاهِيًّا تَعَالَيْتَ لَٓا اِلٰهَ اِلَّٓا اَنْتَ اَجِرْنَا وَ اَجِرْ اُسْتَادَنَا سَعٖيدَ النُّورْسٖى رَضِىَ اللّٰهُ عَنْهُ وَ وَالِدَيْنَا وَ اِخْوَانَنَا وَ اَخَوَاتِنَا وَ طَلَبَةَ رَسَٓائِلِ النُّورِ وَ رُفَقَٓائَنَا وَ اَحْبَابَنَا الْمُخْلِصٖينَ مِنَ النَّارِ وَ مِنْ كُلِّ نَارٍ وَ احْفَظْنَا مِنْ شَرِّ النَّفْسِ وَ الشَّيْطَانِ وَ مِنْ شَرِّ الْجِنِّ وَ اْلاِنْسَانِ وَ مِنْ شَرِّ الْبِدْعَةِ وَ الضَّلَالَاتِ وَ اْلاِلْحَادِ وَ الطُّغْيَانِ بِعَفْوِكَ يَا مُجٖيرُ بِفَضْلِكَ يَا غَفَّارُ بِرَحْمَتِكَ يَٓا اَرْحَمَ الرَّاحِمٖينَ ❁ اَللّٰهُمَّ اَدْخِلْنَا الْجَنَّةَ مَعَ الْاَبْرَارِ بِشَفَاعَةِ نَبِيِّكَ الْمُخْتَارِ اٰمٖينَ وَالْحَمْدُ لِلّٰهِ رَبِّ الْعَالَمٖينَ',
    "Sübhâneke Âhiyyen Şerâhiyyen teâleyte, lâ ilâhe illâ ente, ecirnâ ve ecir üstâzenâ Saîde'n-Nûrsî radıyallahu anh ve vâlideynâ ve ihvânenâ ve ehavâtinâ ve talebete Resâili'n-Nûr ve rufekâenâ ve ahbâbenâ'l-muhlisîne mine'n-nâri ve min külli nâr, ve'hfaznâ min şerri'n-nefsi ve'ş-şeytâni ve min şerri'l-cinni ve'l-insâni ve min şerri'l-bid'ati ve'd-dalâlâti ve'l-ilhâdi ve't-tuğyân, bi-afvike yâ Mücîr, bi-fadlike yâ Gaffâr, bi-rahmetike yâ erhame'r-râhimîn. Allahümme edhilnâ'l-cennete mea'l-ebrâr bi-şefâati Nebiyyike'l-muhtâr, âmîn ve'l-hamdü lillâhi Rabbi'l-âlemîn."],
  ['لَا يَسْتَوٖٓى اَصْحَابُ النَّارِ وَاَصْحَابُ الْجَنَّةِۜ اَصْحَابُ الْجَنَّةِ هُمُ الْفَٓائِزُونَ ﴿٢٠﴾ لَوْ اَنْزَلْنَا هٰذَا الْقُرْاٰنَ عَلٰى جَبَلٍ لَرَاَيْتَهُ خَاشِعًا مُتَصَدِّعًا مِنْ خَشْيَةِ اللّٰهِۜ وَتِلْكَ الْاَمْثَالُ نَضْرِبُهَا لِلنَّاسِ لَعَلَّهُمْ يَتَفَكَّرُونَ ﴿٢١﴾ هُوَ اللّٰهُ الَّذٖى لَٓا اِلٰهَ اِلَّا هُوَۚ عَالِمُ الْغَيْبِ وَالشَّهَادَةِۚ هُوَ الرَّحْمٰنُ الرَّحٖيمُ ﴿٢٢﴾ هُوَ اللّٰهُ الَّذٖى لَٓا اِلٰهَ اِلَّا هُوَۚ اَلْمَلِكُ الْقُدُّوسُ السَّلَامُ الْمُؤْمِنُ الْمُهَيْمِنُ الْعَزٖيزُ الْجَبَّارُ الْمُتَكَبِّرُۜ سُبْحَانَ اللّٰهِ عَمَّا يُشْرِكُونَ ﴿٢٣﴾ هُوَ اللّٰهُ الْخَالِقُ الْبَارِىُٔ الْمُصَوِّرُ لَهُ الْاَسْمَٓاءُ الْحُسْنٰىۜ يُسَبِّحُ لَهُ مَا فِى السَّمٰوَاتِ وَالْاَرْضِۚ وَهُوَ الْعَزٖيزُ الْحَكٖيمُ ﴿٢٤﴾',
    "Lâ yestevî ashâbü'n-nâri ve ashâbü'l-cenneh; ashâbü'l-cenneti hümü'l-fâizûn. (20) Lev enzelnâ hâze'l-Kur'âne alâ cebelin leraeytehû hâşian mütesaddian min haşyetillâh; ve tilke'l-emsâlü nadribühâ li'n-nâsi leallehüm yetefekkerûn. (21) Hüvallâhü'llezî lâ ilâhe illâ hû, âlimü'l-ğaybi ve'ş-şehâdeh; hüve'r-Rahmânü'r-Rahîm. (22) Hüvallâhü'llezî lâ ilâhe illâ hû, el-Melikü'l-Kuddûsü's-Selâmü'l-Mü'minü'l-Müheyminü'l-Azîzü'l-Cebbârü'l-Mütekebbir; sübhânallahi ammâ yüşrikûn. (23) Hüvallâhü'l-Hâlikü'l-Bâriü'l-Musavviru lehü'l-esmâü'l-hüsnâ; yüsebbihu lehû mâ fi's-semâvâti ve'l-ard; ve hüve'l-Azîzü'l-Hakîm. (24)"],
  ['يَا رَبَّ السَّمٰوَاتِ وَ الْاَرْضِ يَا ذَا الْجَلَالِ وَ اْلاِكْرَامِ ❁ اَسْئَلُكَ بِحَقِّ هٰذِهِ الْاَسْمَٓاءِ كُلِّهَٓا اَنْ تُصَلِّىَ عَلٰى سَيِّدِنَا مُحَمَّدٍ وَ عَلٰٓى اٰلِ مُحَمَّدٍ وَ ارْحَمْ مُحَمَّدًا كَمَا صَلَّيْتَ وَ سَلَّمْتَ وَ بَارَكْتَ وَ رَحِمْتَ وَ تَرَحَّمْتَ عَلٰٓى اِبرَاهٖيمَ وَ عَلٰٓى اٰلِ اِبْرَاهٖيمَ فِى الْعَالَمٖينَ رَبَّنَٓا اِنَّكَ حَمٖيدٌ مَجٖيدٌ بِرَحْمَتِكَ يَٓا اَرْحَمَ الرَّاحِمٖينَ وَ الْحَمْدُ لِلّٰهِ رَبِّ الْعَالَمٖينَ',
    "Yâ Rabbe's-semâvâti ve'l-ard, yâ Ze'l-celâli ve'l-ikrâm; es'elüke bi-hakkı hâzihi'l-esmâi küllihâ en tusalliye alâ seyyidinâ Muhammedin ve alâ âli Muhammed, ve'rham Muhammeden kemâ salleyte ve sellemte ve bârekte ve rahimte ve terahhamte alâ İbrâhîme ve alâ âli İbrâhîme fi'l-âlemîn; Rabbenâ inneke Hamîdün Mecîd, bi-rahmetike yâ erhame'r-râhimîn, ve'l-hamdü lillâhi Rabbi'l-âlemîn."],
  ['لَقَدْ صَدَقَ اللّٰهُ رَسُولَهُ الرُّءْيَا بِالْحَقِّۚ لَتَدْخُلُنَّ الْمَسْجِدَ الْحَرَامَ اِنْ شَٓاءَ اللّٰهُ اٰمِنٖينَۙ مُحَلِّقٖينَ رُؤُ۫سَكُمْ وَمُقَصِّرٖينَۙ لَا تَخَافُونَۜ فَعَلِمَ مَا لَمْ تَعْلَمُوا فَجَعَلَ مِنْ دُونِ ذٰلِكَ فَتْحًا قَرٖيبًا ﴿٢٧﴾ هُوَ الَّذٖٓى اَرْسَلَ رَسُولَهُ بِالْهُدٰى وَدٖينِ الْحَقِّ لِيُظْهِرَهُ عَلَى الدّٖينِ كُلِّهٖۜ وَكَفٰى بِاللّٰهِ شَهٖيدًاۜ ﴿٢٨﴾ مُحَمَّدٌ رَسُولُ اللّٰهِۜ وَالَّذٖينَ مَعَهُٓ اَشِدَّٓاءُ عَلَى الْكُفَّارِ رُحَمَٓاءُ بَيْنَهُمْ تَرٰيهُمْ رُكَّعًا سُجَّدًا يَبْتَغُونَ فَضْلًا مِنَ اللّٰهِ وَرِضْوَانًاۘ سٖيمَاهُمْ فٖى وُجُوهِهِمْ مِنْ اَثَرِ السُّجُودِۜ ذٰلِكَ مَثَلُهُمْ فِى التَّوْرٰيةِۚۛ وَمَثَلُهُمْ فِى الْاِنْجٖيلِ۠ۛ كَزَرْعٍ اَخْرَجَ شَطْئَهُ۫ فَاٰزَرَهُ فَاسْتَغْلَظَ فَاسْتَوٰى عَلٰى سُوقِهٖ يُعْجِبُ الزُّرَّاعَ لِيَغٖيظَ بِهِمُ الْكُفَّارَۜ وَعَدَ اللّٰهُ الَّذٖينَ اٰمَنُوا وَعَمِلُوا الصَّالِحَاتِ مِنْهُمْ مَغْفِرَةً وَاَجْرًا عَظٖيمًا ﴿٢٩﴾',
    "Lekad sadakallâhü Resûlehü'r-rü'yâ bi'l-hakk; le-tedhulünne'l-mescide'l-harâme inşâallahü âminîn, muhallikîne ruûsekum ve mukassirîne lâ tehâfûn; fealime mâ lem ta'lemû fecaale min dûni zâlike fethan karîbâ. (27) Hüve'llezî ersele Resûlehû bi'l-hüdâ ve dîni'l-hakkı li-yuzhirahû ale'd-dîni küllih; ve kefâ billâhi şehîdâ. (28) Muhammedün Resûlullah, ve'llezîne meahû eşiddâü ale'l-küffâri ruhamâü beynehüm, terâhüm rukkean süccedâ, yebteğûne fadlen minallahi ve rıdvânâ; sîmâhüm fî vücûhihim min eseri's-sücûd; zâlike meseluhüm fi't-Tevrâh, ve meseluhüm fi'l-İncîli ke-zer'in ahrace şat'ehû fe-âzerahû festağleza festevâ alâ sûkıhî yu'cibü'z-zürrâa li-yeğîza bihimü'l-küffâr; vaadallâhü'llezîne âmenû ve amilu's-sâlihâti minhüm mağfireten ve ecran azîmâ. (29)"],
  ['سُورَةُ النَّبَاءِ', "Sûretü'n-Nebe'"],
  ['عَمَّ يَتَسَٓاءَلُونَۚ ﴿١﴾ عَنِ النَّبَاِ الْعَظٖيمِۙ ﴿٢﴾ اَلَّذٖى هُمْ فٖيهِ مُخْتَلِفُونَۜ ﴿٣﴾ كَلَّا سَيَعْلَمُونَۙ ﴿٤﴾ ثُمَّ كَلَّا سَيَعْلَمُونَ ﴿٥﴾ اَلَمْ نَجْعَلِ الْاَرْضَ مِهَادًاۙ ﴿٦﴾ وَالْجِبَالَ اَوْتَادًاۖ ﴿٧﴾ وَخَلَقْنَاكُمْ اَزْوَاجًاۙ ﴿٨﴾ وَجَعَلْنَا نَوْمَكُمْ سُبَاتًاۙ ﴿٩﴾ وَجَعَلْنَا الَّيْلَ لِبَاسًاۙ ﴿١٠﴾ وَجَعَلْنَا النَّهَارَ مَعَاشًاۖ ﴿١١﴾ وَبَنَيْنَا فَوْقَكُمْ سَبْعًا شِدَادًاۙ ﴿١٢﴾ وَجَعَلْنَا سِرَاجًا وَهَّاجًاۖ ﴿١٣﴾ وَاَنْزَلْنَا مِنَ الْمُعْصِرَاتِ مَٓاءً ثَجَّاجًاۙ ﴿١٤﴾ لِنُخْرِجَ بِهٖ حَبًّا وَنَبَاتًاۙ ﴿١٥﴾وَجَنَّاتٍ اَلْفَافًاۜ ﴿١٦﴾ اِنَّ يَوْمَ الْفَصْلِ كَانَ مٖيقَاتًاۙ ﴿١٧﴾ يَوْمَ يُنْفَخُ فِى الصُّورِ فَتَاْتُونَ اَفْوَاجًاۙ ﴿١٨﴾ وَفُتِحَتِ السَّمَٓاءُ فَكَانَتْ اَبْوَابًاۙ ﴿١٩﴾ وَسُيِّرَتِ الْجِبَالُ فَكَانَتْ سَرَابًاۜ ﴿٢٠﴾ اِنَّ جَهَنَّمَ كَانَتْ مِرْصَادًاۙ ﴿٢١﴾ لِلطَّاغٖينَ مَاٰبًاۙ ﴿٢٢﴾ لَابِثٖينَ فٖيهَٓا اَحْقَابًاۚ ﴿٢٣﴾ لَايَذُوقُونَ فٖيهَا بَرْدًا وَلَا شَرَابًاۙ ﴿٢٤﴾ اِلَّا حَمٖيمًا وَغَسَّاقًاۙ ﴿٢٥﴾ جَزَٓاءً وِفَاقًا ﴿٢٦﴾ اِنَّهُمْ كَانُوا لَايَرْجُونَ حِسَابًاۙ ﴿٢٧﴾ وَكَذَّبُوا بِاٰيَاتِنَا كِذَّابًاۜ ﴿٢٨﴾ وَكُلَّ شَىْءٍ اَحْصَيْنَاهُ كِتَابًا ﴿٢٩﴾ فَذُوقُوا فَلَنْ نَزٖيدَكُمْ اِلَّا عَذَابًا۟ ﴿٣٠﴾اِنَّ لِلْمُتَّقٖينَ مَفَازًاۙ ﴿٣١﴾ حَدَٓائِقَ وَاَعْنَابًاۙ ﴿٣٢﴾ وَكَوَاعِبَ اَتْرَابًاۙ ﴿٣٣﴾ وَكَاْسًا دِهَاقًاۜ ﴿٣٤﴾ لَا يَسْمَعُونَ فٖيهَا لَغْوًا وَلَا كِذَّابًاۚ ﴿٣٥﴾ جَزَٓاءً مِنْ رَبِّكَ عَطَٓاءً حِسَابًاۙ ﴿٣٦﴾ رَبِّ السَّمٰوَاتِ وَالْاَرْضِ وَمَا بَيْنَهُمَاۙ الرَّحْمٰنِ لَا يَمْلِكُونَ مِنْهُ خِطَابًاۙ ﴿٣٧﴾ يَوْمَ يَقُومُ الرُّوحُ وَالْمَلٰٓئِكَةُ صَفًّاۜ لَا يَتَكَلَّمُونَ اِلَّا مَنْ اَذِنَ لَهُ الرَّحْمٰنُ وَقَالَ صَوَابًا ﴿٣٨﴾ ذٰلِكَ الْيَوْمُ الْحَقُّۚ فَمَنْ شَٓاءَ اتَّخَذَ اِلٰى رَبِّهٖ مَاٰبًا ﴿٣٩﴾ اِنَّٓا اَنْذَرْنَا‌كُمْ عَذَابًا قَرٖيبًاۚ يَوْمَ يَنْظُرُ الْمَرْءُ مَا قَدَّمَتْ يَدَاهُ وَيَقُولُ الْكَافِرُ يَا لَيْتَنٖى كُنْتُ تُرَابًا ﴿٤٠﴾',
    "Amme yetesâelûn. (1) Ani'n-nebei'l-azîm. (2) Ellezî hüm fîhi muhtelifûn. (3) Kellâ seya'lemûn. (4) Sümme kellâ seya'lemûn. (5) Elem nec'ali'l-arda mihâdâ. (6) Ve'l-cibâle evtâdâ. (7) Ve halaknâküm ezvâcâ. (8) Ve cealnâ nevmeküm sübâtâ. (9) Ve cealne'l-leyle libâsâ. (10) Ve cealne'n-nehâra meâşâ. (11) Ve beneynâ fevkaküm seb'an şidâdâ. (12) Ve cealnâ sirâcen vehhâcâ. (13) Ve enzelnâ mine'l-mu'sırâti mâen seccâcâ. (14) Li-nuhrice bihî habben ve nebâtâ. (15) Ve cennâtin elfâfâ. (16) İnne yevme'l-faslı kâne mîkâtâ. (17) Yevme yünfehu fi's-sûri fe-te'tûne efvâcâ. (18) Ve fütihati's-semâü fekânet ebvâbâ. (19) Ve süyyirati'l-cibâlü fekânet serâbâ. (20) İnne cehenneme kânet mirsâdâ. (21) Li't-tâğîne meâbâ. (22) Lâbisîne fîhâ ahkâbâ. (23) Lâ yezûkûne fîhâ berden ve lâ şerâbâ. (24) İllâ hamîmen ve ğassâkâ. (25) Cezâen vifâkâ. (26) İnnehüm kânû lâ yercûne hisâbâ. (27) Ve kezzebû bi-âyâtinâ kizzâbâ. (28) Ve külle şey'in ahsaynâhü kitâbâ. (29) Fe-zûkû fe-len nezîdekum illâ azâbâ. (30) İnne li'l-müttekîne mefâzâ. (31) Hadâika ve a'nâbâ. (32) Ve kevâibe etrâbâ. (33) Ve kâsen dihâkâ. (34) Lâ yesmeûne fîhâ lağven ve lâ kizzâbâ. (35) Cezâen min Rabbike atâen hisâbâ. (36) Rabbi's-semâvâti ve'l-ardı ve mâ beynehüma'r-Rahmâni lâ yemlikûne minhü hitâbâ. (37) Yevme yekûmü'r-rûhu ve'l-melâiketü saffâ, lâ yetekellemûne illâ men ezine lehü'r-Rahmânü ve kâle savâbâ. (38) Zâlike'l-yevmü'l-hakk; fe-men şâe'ttehaze ilâ Rabbihî meâbâ. (39) İnnâ enzernâküm azâben karîbâ, yevme yenzuru'l-mer'ü mâ kaddemet yedâhü ve yekûlü'l-kâfiru yâ leytenî küntü türâbâ. (40)"],
  ['اٰمَنَّا بَاَنَّهُ', "Âmennâ bi-ennehû:"],
  ['لَٓا اِلٰهَ اِلَّا اللّٰهُ وَحْدَهُ لَٓا شَرٖيكَ لَهُ لَهُ الْمُلْكُ وَ لَهُ الْحَمْدُ يُحْيٖى وَ يُمٖيتُ بِيَدِهِ الْخَيْرُ وَ هُوَ عَلٰى كُلِّ شَىْءٍ قَدٖيرٌ',
    "Lâ ilâhe illallahu vahdehû lâ şerîke leh, lehü'l-mülkü ve lehü'l-hamdü, yuhyî ve yümît, bi-yedihi'l-hayr ve hüve alâ külli şey'in kadîr."],
  ['اٰمَنَ الرَّسُولُ بِمَٓا اُنْزِلَ اِلَيْهِ مِنْ رَبِّهٖ وَالْمُؤْمِنُونَۜ كُلٌّ اٰمَنَ بِاللّٰهِ وَمَلٰٓئِكَتِهٖ وَكُتُبِهٖ وَرُسُلِهٖۜ لَا نُفَرِّقُ بَيْنَ اَحَدٍ مِنْ رُسُلِهٖ۠ وَقَالُوا سَمِعْنَا وَاَطَعْنَا غُفْرَانَكَ رَبَّنَا وَاِلَيْكَ الْمَصٖيرُ ﴿٢٨٥﴾ لَا يُكَلِّفُ اللّٰهُ نَفْسًا اِلَّا وُسْعَهَاۜ لَهَا مَا كَسَبَتْ وَعَلَيْهَا مَا اكْتَسَبَتْۜ رَبَّنَا لَا تُؤَاخِذْنَٓا اِنْ نَسٖينَٓا اَوْ اَخْطَاْنَاۚ رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَٓا اِصْرًا كَمَا حَمَلْتَهُ عَلَى الَّذٖينَ مِنْ قَبْلِنَاۚ رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهٖۚ وَاعْفُ عَنَّا۠ وَاغْفِرْ لَنَا۠ وَارْحَمْنَا۠ اَنْتَ مَوْلٰينَا فَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرٖينَ ﴿٢٨٦﴾',
    "Âmene'r-Resûlü bimâ ünzile ileyhi min Rabbihî ve'l-mü'minûn; küllün âmene billâhi ve melâiketihî ve kütübihî ve rusülih; lâ nüferriku beyne ehadin min rusülihî ve kâlû semi'nâ ve eta'nâ ğufrâneke Rabbenâ ve ileyke'l-masîr. (285) Lâ yükellifullahü nefsen illâ vus'ahâ; lehâ mâ kesebet ve aleyhâ me'ktesebet; Rabbenâ lâ tüâhiznâ in-nesînâ ev ahta'nâ; Rabbenâ ve lâ tahmil aleynâ isran kemâ hameltehû ale'llezîne min kablinâ; Rabbenâ ve lâ tühammilnâ mâ lâ tâkate lenâ bih; ve'fu annâ ve'ğfir lenâ ve'rhamnâ; ente Mevlânâ fe'nsurnâ ale'l-kavmi'l-kâfirîn. (286)"]
];

function buildArapcaOkunusMap() {
  const map = new Map();
  for (const [ar, tr] of DOGRUDAN_OKUNUSLAR) map.set(normalizeKey(ar), tr);
  for (const [ar, tr] of esmaCiftleriMap()) map.set(normalizeKey(ar), tr);
  map.set(normalizeKey(zincirAnahtariUret()), zincirOkunusuUret());
  return map;
}

// Harekeleri (teşkil) ve benzeri birleşen işaretleri kaldırır; satırlar elle
// girilirken veya kaynaktan okunurken oluşabilecek harekeleme farklarına karşı
// anahtar eşleştirmesini güvenilir kılar.
function normalizeKey(metin) {
  return metin
    .normalize('NFC')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭࣔ-ࣿـ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function arapcaOkunusBul(arapcaMetin) {
  const anahtar = normalizeKey(arapcaMetin);
  const okunus = ARAPCA_OKUNUS.get(anahtar);
  if (!okunus) {
    throw new Error(`Okunuş eşlemesi bulunamadı: ${arapcaMetin.slice(0, 60)}...`);
  }
  return okunus;
}

const ARAPCA_OKUNUS = buildArapcaOkunusMap();

// --- Kaynak metni ayrıştırma -----------------------------------------------------

function kaynakSatirlariniOku() {
  const raw = fs.readFileSync(SOURCE_PATH, 'utf8');
  return raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
}

function satirTipi(satir) {
  if (VAKIT_HEADER_ESLEME[satir]) return 'vakit-basligi';
  if (HASIYE_RE.test(satir)) return 'hasiye';
  if (SEPARATOR_RE.test(satir)) return 'ayirac';
  if (ARABIC_RE.test(satir)) return 'arapca';
  return 'turkce';
}

function vakitlereAyir(satirlar) {
  const vakitler = {};
  let aktifVakit = null;
  for (const satir of satirlar) {
    const tip = satirTipi(satir);
    if (tip === 'vakit-basligi') {
      aktifVakit = VAKIT_HEADER_ESLEME[satir];
      vakitler[aktifVakit] = [];
      continue;
    }
    if (!aktifVakit) continue; // başlıktan önceki satırlar yok
    vakitler[aktifVakit].push({ tip, satir });
  }
  return vakitler;
}

// Her vakit için ham satır listesinden "arapça uzun tesbihat" adım dizisini üretir.
// Ayraçlara göre bölüm (ana / ozel-dua / esma / kapanis-suresi) etiketler.
const BOLUM_SIRASI = ['ana', 'ozel-dua', 'esma', 'kapanis-suresi'];

function adimlariCikar(hamSatirlar) {
  const adimlar = [];
  let fazIndex = 0; // BOLUM_SIRASI içindeki konum; her ayıraç bir sonraki bölüme geçirir

  for (const { tip, satir } of hamSatirlar) {
    if (tip === 'ayirac') {
      // 1. ayıraç (- - -): özel dua bloğundan Esma-i Hüsna duasına geçiş
      // 2. ayıraç (* * *): Esma-i Hüsna duasından bitiriş sûresine geçiş
      if (fazIndex < BOLUM_SIRASI.length - 1) fazIndex += 1;
      continue; // ayıraçların kendisi bir adım olarak saklanmaz
    }

    const bolum = BOLUM_SIRASI[fazIndex];

    if (tip === 'hasiye') {
      adimlar.push({ bolum, tur: 'turkce', metin: satir.replace(/^\{|\}$/g, '') });
      continue;
    }

    if (tip === 'turkce') {
      if (fazIndex === 0 && normalizeKey(satir).toLocaleLowerCase('tr-TR').startsWith(KISA_KESIM_BASLANGIC)) {
        fazIndex = 1; // ana -> ozel-dua ("Duadan sonra..." notuyla, ayıraçtan önce tetiklenir)
      }
      adimlar.push({ bolum: BOLUM_SIRASI[fazIndex], tur: 'turkce', metin: satir });
      continue;
    }

    // tip === 'arapca'
    adimlar.push({ bolum, tur: 'arapca', metin: satir });
  }

  return adimlar;
}

function arapcaUzunAdimlariUzuneDonustur(adimlar) {
  return adimlar.map(adim => {
    if (adim.tur !== 'arapca') return { ...adim };
    return { ...adim, metin: arapcaOkunusBul(adim.metin) };
  });
}

function kisaAdimlariCikar(uzunAdimlar) {
  return uzunAdimlar.filter(adim => adim.bolum === 'ana' || adim.bolum === 'kapanis-suresi');
}

function belgeleriOlustur() {
  const satirlar = kaynakSatirlariniOku();
  const vakitSatirlari = vakitlereAyir(satirlar);
  const belgeler = [];

  for (const vakit of Object.keys(VAKIT_BASLIKLARI)) {
    const hamSatirlar = vakitSatirlari[vakit];
    if (!hamSatirlar || hamSatirlar.length === 0) {
      throw new Error(`Kaynak metinde '${vakit}' vakti bulunamadı.`);
    }

    const arapcaUzunAdimlar = adimlariCikar(hamSatirlar);
    const uzunAdimlar = arapcaUzunAdimlariUzuneDonustur(arapcaUzunAdimlar);
    const kisaAdimlar = kisaAdimlariCikar(uzunAdimlar);

    const baslik = VAKIT_BASLIKLARI[vakit];
    belgeler.push({ vakit, tur: 'arapca-uzun', baslik: `${baslik} Tesbihatı (Arapça Uzun)`, adimlar: arapcaUzunAdimlar });
    belgeler.push({ vakit, tur: 'uzun', baslik: `${baslik} Tesbihatı (Uzun)`, adimlar: uzunAdimlar });
    belgeler.push({ vakit, tur: 'kisa', baslik: `${baslik} Tesbihatı (Kısa)`, adimlar: kisaAdimlar });
  }

  return belgeler;
}

// --- MongoDB'ye yazma --------------------------------------------------------------

async function main() {
  const belgeler = belgeleriOlustur();

  console.log(`Üretilen belge sayısı: ${belgeler.length}`);
  for (const belge of belgeler) {
    console.log(`  ${belge.vakit} / ${belge.tur}: ${belge.adimlar.length} adım`);
  }

  if (process.argv.includes('--dry-run')) {
    const outPath = path.join(__dirname, 'data', 'tesbihat-onizleme.json');
    fs.writeFileSync(outPath, JSON.stringify(belgeler, null, 2), 'utf8');
    console.log(`Dry run: veritabanına yazılmadı. Önizleme için yazıldı: ${outPath}`);
    return;
  }

  const client = new MongoClient(process.env.MONGO_URI);
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME);
    const koleksiyon = db.collection(COLLECTION);

    await koleksiyon.createIndex({ vakit: 1, tur: 1 }, { unique: true });

    const islemler = belgeler.map(belge => ({
      updateOne: {
        filter: { vakit: belge.vakit, tur: belge.tur },
        update: { $set: { ...belge, guncellenmeTarihi: new Date() } },
        upsert: true
      }
    }));

    const sonuc = await koleksiyon.bulkWrite(islemler);
    console.log(`Eklenen: ${sonuc.upsertedCount}, güncellenen: ${sonuc.modifiedCount}`);
  } finally {
    await client.close();
  }
}

main().catch(err => {
  console.error('Beklenmeyen hata:', err);
  process.exitCode = 1;
});
