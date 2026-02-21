import pdfplumber
from io import BytesIO
from docx import Document


def extract_text(file_bytes, filename):
    text = ""

    if filename.endswith(".pdf"):
        with pdfplumber.open(BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""

    elif filename.endswith(".docx"):
        doc = Document(BytesIO(file_bytes))
        for para in doc.paragraphs:
            text += para.text + "\n"

    elif filename.endswith(".txt"):
        text = file_bytes.decode("utf-8")

    return text