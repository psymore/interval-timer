const alarmSound = document.getElementById("alarmSound");
const alarmFolderInput = document.getElementById("alarmFolder");
const alarmFolderModal = document.getElementById("alarmFolderModal");
const alarmFolderBtn = document.getElementById("alarmFolderBtn");
const closeAlarmFolderBtn = document.getElementById("closeAlarmFolderBtn");
const audioFileList = document.createElement("select");

audioFileList.id = "audioFileList"; // Ensure the ID matches the CSS
audioFileList.style.marginTop = "10px";
audioFileList.style.width = "100%";
audioFileList.style.padding = "5px";
audioFileList.style.borderRadius = "5px";
audioFileList.style.border = "1px solid #ccc";

alarmFolderModal.querySelector(".modal-content").appendChild(audioFileList);

alarmFolderBtn.onclick = () => {
  alarmFolderModal.classList.remove("hidden");
};

closeAlarmFolderBtn.onclick = () => {
  alarmFolderModal.classList.add("hidden");
};

alarmFolderInput.addEventListener("change", event => {
  const files = event.target.files;
  audioFileList.innerHTML = ""; // Clear previous options

  Array.from(files)
    .filter(file => file.type.startsWith("audio/")) // Filter audio files
    .forEach(file => {
      const option = document.createElement("option");
      option.value = URL.createObjectURL(file);
      option.textContent = file.name;
      audioFileList.appendChild(option);
    });

  if (audioFileList.options.length > 0) {
    audioFileList.value = audioFileList.options[0].value;
    alarmSound.src = audioFileList.value;
    console.log(
      "Alarm sound updated to:",
      audioFileList.options[0].textContent
    );
  }
});

audioFileList.addEventListener("change", () => {
  alarmSound.src = audioFileList.value;
  console.log(
    "Alarm sound updated to:",
    audioFileList.selectedOptions[0].textContent
  );
});
