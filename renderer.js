let timer;
let remainingSeconds = 0;
let isPaused = false;
let alarmSound = new Audio("alarm.mp3");

function playAlarmFor5Seconds() {
  alarmSound.play();
  setTimeout(() => {
    alarmSound.pause();
    alarmSound.currentTime = 0;
  }, 5000);
}

function startTimer() {
  clearInterval(timer);
  const minutes = parseInt(document.getElementById("minutes").value) || 0;
  const seconds = parseInt(document.getElementById("seconds").value) || 0;
  remainingSeconds = minutes * 60 + seconds;

  if (remainingSeconds <= 0) return;

  isPaused = false;
  runTimer();
}

function runTimer() {
  updateDisplay(remainingSeconds);

  timer = setInterval(() => {
    if (!isPaused) {
      remainingSeconds--;
      updateDisplay(remainingSeconds);

      if (remainingSeconds <= 0) {
        clearInterval(timer);
        document.getElementById("countdown").innerText = "Time's up!";
        playAlarmFor5Seconds();
      }
    }
  }, 1000);
}

function stopTimer() {
  isPaused = true;
}

function continueTimer() {
  if (isPaused && remainingSeconds > 0) {
    isPaused = false;
  }
}

function resetTimer() {
  clearInterval(timer);
  remainingSeconds = 0;
  document.getElementById("countdown").innerText = "00:00";
  document.getElementById("minutes").value = "0";
  document.getElementById("seconds").value = "30";
  alarmSound.pause();
  alarmSound.currentTime = 0;
}

function updateDisplay(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  document.getElementById("countdown").innerText = `${mins}:${secs}`;
}
