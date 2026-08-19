FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# 1. Dependencies are cached separately from source for quick rebuilds.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. Run as a non-root user in production.
COPY . .
RUN useradd --create-home hirova && chown -R hirova:hirova /app
USER hirova
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
