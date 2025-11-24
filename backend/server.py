import tempfile
import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import whisper

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model once at startup (use "base" for speed, "small" or "medium" for accuracy)
print("Loading Whisper model...")
model = whisper.load_model("base")
print("Model loaded!")


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    # Save uploaded audio to temp file
    suffix = os.path.splitext(audio.filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = model.transcribe(tmp_path)
        return {
            "text": result["text"],
            "segments": result.get("segments", [])
        }
    finally:
        os.unlink(tmp_path)


@app.get("/health")
def health():
    return {"status": "ok"}
