const BACKEND_URL = 'http://localhost:8000';

let audioContext = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;

// Krisp SDK
let krispSDK = null;
let krispFilterNode = null;
let krispEnabled = false;

// DOM elements
const btnRecord = document.getElementById('btn-record');
const btnStop = document.getElementById('btn-stop');
const btnPlay = document.getElementById('btn-play');
const btnTranscribe = document.getElementById('btn-transcribe');
const krispToggle = document.getElementById('krisp-toggle');
const krispStatus = document.getElementById('krisp-status');
const recordingStatus = document.getElementById('recording-status');
const audioPlayer = document.getElementById('audio-player');
const transcriptBox = document.getElementById('transcript');

async function initKrisp() {
  try {
    // Check if Krisp SDK is available
    const KrispSDK = window.KrispSDK || (await import('/dist/krispsdk.mjs')).default;

    if (!KrispSDK.isSupported()) {
      krispStatus.textContent = 'Krisp: Not supported';
      return false;
    }

    krispSDK = new KrispSDK({
      params: {
        debugLogs: false,
        models: {
          model8: '/dist/models/model_8.kef',
          model16: '/dist/models/model_16.kef',
          model32: '/dist/models/model_32.kef',
        }
      }
    });

    await krispSDK.init();
    krispStatus.textContent = 'Krisp: Ready';
    krispStatus.classList.add('active');
    krispToggle.disabled = false;
    return true;
  } catch (err) {
    console.warn('Krisp SDK not available:', err.message);
    krispStatus.textContent = 'Krisp: Not available (SDK not found)';
    return false;
  }
}

async function setupAudio() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    audioContext = new AudioContext();
    btnRecord.disabled = false;
    recordingStatus.textContent = 'Ready to record';
  } catch (err) {
    recordingStatus.textContent = 'Mic access denied';
    console.error('Failed to get microphone:', err);
  }
}

async function startRecording() {
  recordedChunks = [];

  let streamToRecord = mediaStream;

  // If Krisp is enabled, route through noise filter
  if (krispEnabled && krispSDK) {
    const source = audioContext.createMediaStreamSource(mediaStream);
    const destination = audioContext.createMediaStreamDestination();

    krispFilterNode = await krispSDK.createNoiseFilter(
      audioContext,
      () => {
        console.log('Krisp filter ready');
        krispFilterNode.enable();
      },
      () => {
        console.log('Krisp filter disposed');
      }
    );

    source.connect(krispFilterNode).connect(destination);
    streamToRecord = destination.stream;
  }

  mediaRecorder = new MediaRecorder(streamToRecord, {
    mimeType: 'audio/webm;codecs=opus'
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(recordedChunks, { type: 'audio/webm' });
    audioPlayer.src = URL.createObjectURL(recordedBlob);
    btnPlay.disabled = false;
    btnTranscribe.disabled = false;
    recordingStatus.textContent = 'Recording saved';
  };

  mediaRecorder.start(100);

  btnRecord.disabled = true;
  btnStop.disabled = false;
  recordingStatus.textContent = 'Recording...';
  recordingStatus.classList.add('recording');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  if (krispFilterNode) {
    krispFilterNode.disable();
    krispFilterNode = null;
  }

  btnRecord.disabled = false;
  btnStop.disabled = true;
  recordingStatus.classList.remove('recording');
}

function playRecording() {
  audioPlayer.play();
}

async function transcribe() {
  if (!recordedBlob) {
    transcriptBox.textContent = 'No recording available';
    return;
  }

  transcriptBox.innerHTML = '<em>Transcribing...</em>';
  btnTranscribe.disabled = true;

  try {
    const formData = new FormData();
    formData.append('audio', recordedBlob, 'recording.webm');

    const response = await fetch(`${BACKEND_URL}/transcribe`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    transcriptBox.textContent = result.text || '(No speech detected)';
  } catch (err) {
    transcriptBox.textContent = `Error: ${err.message}\n\nMake sure the backend is running:\ncd backend && uvicorn server:app --reload`;
  } finally {
    btnTranscribe.disabled = false;
  }
}

// Event listeners
btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);
btnPlay.addEventListener('click', playRecording);
btnTranscribe.addEventListener('click', transcribe);

krispToggle.addEventListener('change', (e) => {
  krispEnabled = e.target.checked;
  krispStatus.textContent = krispEnabled ? 'Krisp: Enabled' : 'Krisp: Ready';
});

// Initialize
(async () => {
  await initKrisp();
  await setupAudio();
})();
