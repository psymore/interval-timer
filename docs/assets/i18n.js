const translations = {
  en: {
    "nav.features": "Features",
    "nav.feedback": "Feedback",
    "nav.source": "Source",
    "hero.eyebrow": "Free · Windows · No account needed",
    "hero.h1": "Work. Break. Repeat.<br />Wake up to <em>your</em> music, not a beep.",
    "hero.lede": "An interval & countdown timer whose alarm can be a local file, a YouTube video, or a real Spotify track — plus a background-safe tick loop that keeps counting even while the window is minimized.",
    "hero.download": "⬇ Download for Windows",
    "hero.releases": "See all releases",
    "hero.tryPwa": "⬇ Install as App",
    "hero.stat": "free · open source · unsigned installer (SmartScreen may warn once)",
    "hero.demoCaption": "This is the real app, running live — hit play to hear the alarm, or pin it into a small always-on-top window and drag any edge to resize it, just like the desktop app.",
    "hero.demoCaptionMobile": "This is the real app — tap the pin in the corner to try it live.",
    "features.eyebrow": "What it does",
    "features.h2": "Small, focused, and it stays out of your way",
    "features.card1.h3": "Alarms that don't sound like alarms",
    "features.card1.p": "Point the alarm at a local sound file, a YouTube video, or a Spotify track. It falls back to a local sound automatically if a source is unreachable.",
    "features.card2.h3": "Keeps ticking, even minimized",
    "features.card2.p": "Built on an elapsed-time loop rather than tick-counting, so it self-corrects instead of drifting or freezing when the window is backgrounded.",
    "features.card3.h3": "Presets for how you actually work",
    "features.card3.p": "Save your usual work/break/loop combinations and switch between them from a dropdown instead of re-typing numbers every session.",
    "miniShowcase.idle": "Pinned to the corner — click the pin icon to bring it back.",
    "miniShowcase.alarmText": "Time's up!",
    "miniShowcase.loading": "Loading the live app…",
    "feedback.h2": "Found a bug? Missing something?",
    "feedback.p": "This is a small, actively-developed project — reports and feature requests go straight into what gets built next.",
    "feedback.discussion": "Open a discussion →",
    "feedback.giscus.h3": "Or leave a comment right here",
    "footer.line": "Interval Timer — MIT-style personal project.",
    "footer.download": "Download",
    "footer.discussions": "Discussions"
  },
  tr: {
    "nav.features": "Özellikler",
    "nav.feedback": "Geri Bildirim",
    "nav.source": "Kaynak Kod",
    "hero.eyebrow": "Ücretsiz · Windows · Hesap gerekmez",
    "hero.h1": "Çalış. Mola ver. Tekrarla.<br />Bir bip sesine değil, <em>kendi</em> müziğine uyan.",
    "hero.lede": "Alarmı yerel bir dosya, bir YouTube videosu ya da gerçek bir Spotify parçası olabilen bir aralık ve geri sayım sayacı — pencere küçültülse bile saymaya devam eden arka plan güvenli bir döngüyle.",
    "hero.download": "⬇ Windows için indir",
    "hero.releases": "Tüm sürümleri gör",
    "hero.tryPwa": "⬇ Uygulama Olarak Yükle",
    "hero.stat": "ücretsiz · açık kaynak · imzasız kurulum dosyası (SmartScreen bir kez uyarabilir)",
    "hero.demoCaption": "Bu, gerçek uygulamanın canlı hâli — alarmı duymak için oynat'a basın, ya da masaüstü uygulamasındaki gibi onu küçük, her zaman üstte kalan bir pencereye sabitleyip herhangi bir kenarından sürükleyerek yeniden boyutlandırın.",
    "hero.demoCaptionMobile": "Bu, gerçek uygulama — canlı denemek için köşedeki pin simgesine dokunun.",
    "features.eyebrow": "Ne yapar",
    "features.h2": "Küçük, odaklı ve yolunuza çıkmıyor",
    "features.card1.h3": "Alarm gibi çalmayan alarmlar",
    "features.card1.p": "Alarmı yerel bir ses dosyasına, bir YouTube videosuna ya da bir Spotify parçasına yönlendirin. Kaynağa ulaşılamazsa otomatik olarak yerel sese döner.",
    "features.card2.h3": "Küçültülse bile saymaya devam eder",
    "features.card2.p": "Tık saymak yerine geçen süreye dayalı bir döngü üzerine kurulu; bu sayede pencere arka plana alındığında kaymak ya da donmak yerine kendini düzeltir.",
    "features.card3.h3": "Gerçekten nasıl çalıştığınıza göre hazır ayarlar",
    "features.card3.p": "Sık kullandığınız çalışma/mola/döngü kombinasyonlarını kaydedin ve her seansta yeniden yazmak yerine bir açılır menüden aralarında geçiş yapın.",
    "miniShowcase.idle": "Köşeye sabitlendi — geri getirmek için pin simgesine tıklayın.",
    "miniShowcase.alarmText": "Süre doldu!",
    "miniShowcase.loading": "Canlı uygulama yükleniyor…",
    "feedback.h2": "Bir hata mı buldunuz? Bir şey mi eksik?",
    "feedback.p": "Bu küçük, aktif olarak geliştirilen bir proje — bildirimler ve özellik istekleri doğrudan bir sonraki geliştirmelere yansıyor.",
    "feedback.discussion": "Bir tartışma başlat →",
    "feedback.giscus.h3": "Ya da doğrudan buraya bir yorum bırakın",
    "footer.line": "Interval Timer — MIT tarzı kişisel proje.",
    "footer.download": "İndir",
    "footer.discussions": "Tartışmalar"
  }
};

function getStoredLanguage() {
  try {
    return localStorage.getItem("interval-timer-lang");
  } catch {
    return null;
  }
}

function storeLanguage(lang) {
  try {
    localStorage.setItem("interval-timer-lang", lang);
  } catch {
    // localStorage unavailable (privacy mode, disabled storage) — the
    // toggle still works for this page view, it just won't persist.
  }
}

function syncGiscusLanguage(lang) {
  const wrap = document.querySelector(".giscus-wrap");
  if (!wrap) return;

  const sendConfig = (iframe) => {
    iframe.contentWindow.postMessage(
      { giscus: { setConfig: { lang } } },
      "https://giscus.app"
    );
  };

  const existing = wrap.querySelector("iframe.giscus-frame");
  if (existing) {
    sendConfig(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const iframe = wrap.querySelector("iframe.giscus-frame");
    if (iframe) {
      sendConfig(iframe);
      observer.disconnect();
    }
  });
  observer.observe(wrap, { childList: true, subtree: true });
}

function applyLanguage(lang) {
  document.documentElement.lang = lang;
  const strings = translations[lang];

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (strings[key] !== undefined) el.textContent = strings[key];
  });

  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const key = el.getAttribute("data-i18n-html");
    if (strings[key] !== undefined) el.innerHTML = strings[key];
  });

  document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
    const key = el.getAttribute("data-i18n-alt");
    if (strings[key] !== undefined) el.setAttribute("alt", strings[key]);
  });

  const toggleLabel = document.getElementById("lang-toggle-label");
  if (toggleLabel) toggleLabel.textContent = lang === "en" ? "TR" : "EN";

  storeLanguage(lang);
  syncGiscusLanguage(lang);
}

function initLanguage() {
  const stored = getStoredLanguage();
  const lang = stored === "tr" ? "tr" : "en";
  applyLanguage(lang);

  document.getElementById("lang-toggle").addEventListener("click", () => {
    const current = document.documentElement.lang === "tr" ? "tr" : "en";
    applyLanguage(current === "en" ? "tr" : "en");
  });
}

document.addEventListener("DOMContentLoaded", initLanguage);
