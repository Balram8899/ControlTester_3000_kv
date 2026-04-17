# syntax=docker/dockerfile:1.7
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY api/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --progress-bar off --prefer-binary -r requirements.txt

COPY utils ./utils
COPY api ./api

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
