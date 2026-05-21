document.addEventListener("DOMContentLoaded", () => {
  const chooseAlarmBtn = document.getElementById("chooseAlarmBtn");
  const alarmSound = document.getElementById("alarmSound");

  if (!chooseAlarmBtn || !alarmSound) {
    console.error(
      "alarmModal: required elements #chooseAlarmBtn or #alarmSound not found.",
    );
    return;
  }

  // ── Path helper: normalize Windows backslashes for file:// protocol ──
  function toFileUrl(filePath) {
    // Convert C:\Users\... → file:///C:/Users/...
    const normalized = filePath.replace(/\\/g, "/");
    return normalized.startsWith("/")
      ? `file://${normalized}` // Unix: /home/... → file:///home/...
      : `file:///${normalized}`; // Windows: C:/... → file:///C:/...
  }

  // ── Load saved alarm path ────────────────────────────────────
  const savedAlarmPath = localStorage.getItem("selectedAlarmPath");
  if (savedAlarmPath) {
    console.log("Loaded saved alarm path:", savedAlarmPath);
    alarmSound.src = toFileUrl(savedAlarmPath);
  }

  // ── File picker ───────────────────────────────────────────────
  chooseAlarmBtn.addEventListener("click", async () => {
    try {
      const filePath = await window.electronAPI.getFilePath();
      if (!filePath) {
        console.warn("No file selected.");
        return;
      }
      console.log("Selected file path:", filePath);
      localStorage.setItem("selectedAlarmPath", filePath);
      alarmSound.src = toFileUrl(filePath);
    } catch (err) {
      console.error("Error opening file dialog:", err);
    }
  });

  // ── Stop alarm after it finishes naturally ────────────────────
  alarmSound.addEventListener("ended", () => {
    alarmSound.pause();
    alarmSound.currentTime = 0;
  });
});
