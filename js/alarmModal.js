document.addEventListener("DOMContentLoaded", () => {
  const alarmFolderInput = document.getElementById("alarmFolder");
  const alarmSound = document.getElementById("alarmSound");

  // Load saved alarm file path from localStorage
  const savedAlarmPath = localStorage.getItem("selectedAlarmPath");
  if (savedAlarmPath) {
    console.log("Loaded saved alarm path:", savedAlarmPath);
    alarmSound.src = savedAlarmPath; // Set the saved alarm as the default
  }

  // Save selected alarm file path to localStorage
  alarmFolderInput.addEventListener("change", event => {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
      const file = files[0];
      const filePath = URL.createObjectURL(file);
      localStorage.setItem("selectedAlarmPath", filePath);
      console.log("Saved alarm path:", filePath);

      alarmSound.src = filePath; // Update the alarm sound source
    }
  });

  // Ensure the alarm stops playing after it finishes
  alarmSound.addEventListener("ended", () => {
    alarmSound.pause();
    alarmSound.currentTime = 0;
  });
});
