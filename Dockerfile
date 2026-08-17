FROM python:3.12-slim-bookworm

# 1. Setup user and structure
RUN adduser --disabled-password --gecos '' appuser
WORKDIR /app

# 2. Setup the DB directory first (so it's owned by appuser)
RUN mkdir /db && chown appuser:appuser /db

# 3. Cache dependencies (The most important change)
# Only copy requirements.txt first to keep the 'pip install' layer cached
COPY source/requirements.txt /app/requirements.txt

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl=7.88.1-10+deb12u15 \
    build-essential=12.9 && \
    pip install --no-cache-dir -r /app/requirements.txt && \
    apt-get remove -y build-essential && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 4. Copy the rest of the source code
# Since this changes often, it goes at the end
COPY source /app

# 5. Runtime configuration
ENV PYTHONUNBUFFERED=1
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

USER appuser

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
