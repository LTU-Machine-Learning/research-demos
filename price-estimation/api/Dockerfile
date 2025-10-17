FROM python:3.11-slim

WORKDIR /app

# System deps: OpenMP runtime for LightGBM + curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 curl \
 && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . /app/

ENV MODEL_DIR=/app/model
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
