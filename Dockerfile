# Legacy Streamlit image.
# Docker Compose uses `api/Dockerfile` for FastAPI and `kpmg_ui/Dockerfile` for the web app.
# Keep this file only if you still intentionally run the old Streamlit app directly.
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

RUN install -d -m 755 /app/workbooks /app/temp_files

COPY streamlit_requirements.txt .
RUN pip install --progress-bar off --prefer-binary -r streamlit_requirements.txt

COPY app.py ./
COPY utils ./utils
COPY kpmg_logo.png ./
COPY .streamlit ./.streamlit

EXPOSE 8501

CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
