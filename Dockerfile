FROM python:3.14-slim

# Create a non-root user and switch to it
RUN adduser --disabled-password --gecos '' appuser
WORKDIR /app

# Copy source code and requirements.txt separately for better layer caching
COPY source /app

# Install dependencies and clear apt cache before pip install
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl=8.14.1-2+deb13u2 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && pip install --no-cache-dir -r /app/requirements.txt \
    && mkdir /db \
    && chown -R appuser:appuser /db

ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/ || exit 1

USER appuser

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
