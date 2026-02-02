const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusBox = document.getElementById("status");
const logBox = document.getElementById("log");

let logs = [];

const faceDetection = new FaceDetection({
  locateFile: file =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
});

faceDetection.setOptions({
  model: "short",
  minDetectionConfidence: 0.5
});

faceDetection.onResults(results => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let faces = results.detections.length;
  let event = {
    time: new Date().toISOString(),
    faces
  };

  if (faces === 0) {
    event.status = "NO_FACE";
    statusBox.innerText = "⚠ No Face Detected";
  }
  else if (faces > 1) {
    event.status = "MULTIPLE_FACES";
    statusBox.innerText = "⚠ Multiple Faces Detected";
  }
  else {
    event.status = "NORMAL";
    statusBox.innerText = "✅ Normal";
  }

  logs.push(event);
  // after: logs.push(event);
  if (!window._csvLogs) {
    window._csvLogs = "time,status,faces\n";
  }
  window._csvLogs += `${event.time},${event.status},${event.faces}\n`;

  logBox.innerText = JSON.stringify(logs.slice(-5), null, 2);
});

const camera = new Camera(video, {
  onFrame: async () => {
    try {
      await faceDetection.send({ image: video });
    } catch (e) {
      console.error("Detection Error:", e);
    }
  },
  width: 480,
  height: 360
});

camera.start();
const downloadBtn = document.getElementById("downloadBtn");

downloadBtn.addEventListener("click", () => {
  if (!logs || logs.length === 0) {
    alert("No logs available to download");
    return;
  }

  const blob = new Blob([JSON.stringify(logs, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "proctor_logs.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
