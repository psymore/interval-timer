let timer;
let remainingTime = 0;

export function setupTimer() {
  document.getElementById("startBtn").onclick = startTimer;
  document.getElementById("stopBtn").onclick = stopTimer;
  document.getElementById("continueBtn").onclick = continueTimer;
  document.getElementById("resetBtn").onclick = resetTimer;
}

function startTimer() {
  const mins = parseInt(document.getElementById("minutes").value, 10);
  const secs = parseInt(document.getElementById("seconds").value, 10);
  remainingTime = mins * 60 + secs;
  runTimer();
}

function stopTimer() {
  clearInterval(timer);
}

function continueTimer() {
  if (remainingTime > 0) runTimer();
}

function resetTimer() {
  clearInterval(timer);
  remainingTime = 0;
  document.getElementById("countdown").textContent = "00:00";
}

function runTimer() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (remainingTime <= 0) {
      clearInterval(timer);
      return;
    }

    const mins = String(Math.floor(remainingTime / 60)).padStart(2, "0");
    const secs = String(remainingTime % 60).padStart(2, "0");
    document.getElementById("countdown").textContent = `${mins}:${secs}`;
    remainingTime--;
  }, 1000);
}
