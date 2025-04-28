document.addEventListener("DOMContentLoaded", () => {
  const alarmFolderInput = document.getElementById("alarmFolder");
  const alarmSound = document.getElementById("alarmSound");

  // Load saved alarm file path from localStorage
  const savedAlarmPath = localStorage.getItem("selectedAlarmPath");
  if (savedAlarmPath) {
    console.log("Loaded saved alarm path:", savedAlarmPath);
    alarmSound.src = `file://${savedAlarmPath}`; // Use file:// protocol for Electron
  }

  // Save selected alarm file path to localStorage
  alarmFolderInput.addEventListener("click", async () => {
    const filePath = await window.electronAPI.getFilePath();
    console.log("Selected file path:", filePath);
    if (filePath) {
      localStorage.setItem("selectedAlarmPath", filePath);
      console.log("Saved alarm path:", filePath);

      alarmSound.src = `file://${filePath}`; // Update the alarm sound source with file:// protocol
    } else {
      console.error("No file selected or file path is undefined.");
    }
  });

  // Ensure the alarm stops playing after it finishes
  alarmSound.addEventListener("ended", () => {
    alarmSound.pause();
    alarmSound.currentTime = 0;
  });
});
