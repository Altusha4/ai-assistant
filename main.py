from fastapi import FastAPI, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from services.file_parser import extract_text
from services.ai_service import generate_summary

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_index():
    return FileResponse("static/index.html")

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text = extract_text(content, file.filename)

        if not text.strip():
            return JSONResponse(
                status_code=400,
                content={"error": "File is empty or unreadable"}
            )

        text = text[:15000]

        analysis = generate_summary(text)

        return {"analysis": analysis}

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )