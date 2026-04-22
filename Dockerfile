FROM python:3.11-slim

# System deps for ReportLab + PDF font rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    libfreetype6 \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifest first so the pip layer caches across code changes
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy code + supporting modules
# (Excludes local dev files via .dockerignore — see that file for the list)
COPY generate_report.py server.py report_loaders.py ./
COPY report_design.py report_charts.py report_sections.py report_llm.py ./
COPY external_benchmarks.py main.py ./

# Fonts are auto-downloaded on first use by report_design.register_fonts(),
# but we pre-bake them at build time to avoid the first-request penalty in
# production. Download failures during build are non-fatal (fallback to
# Helvetica/Courier works per register_fonts).
RUN python -c "from report_design import register_fonts; register_fonts()" || \
    echo "Font pre-bake failed; runtime fallback will handle it"

# FastAPI / uvicorn defaults
ENV PYTHONUNBUFFERED=1 \
    ABOL_LOG_LEVEL=INFO \
    PORT=8080

EXPOSE 8080

# Run via uvicorn (async-safe, single-worker matches fly.toml concurrency=1).
# --no-server-header strips the default "server: uvicorn" header for minor
# fingerprint reduction.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--no-server-header"]
