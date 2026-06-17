# Stage 1: build React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Django application
FROM python:3.12-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# collectstatic needs SECRET_KEY and DB_PASSWORD defined; use throwaway values at build time
RUN SECRET_KEY=build-placeholder DB_PASSWORD=build-placeholder python manage.py collectstatic --no-input

EXPOSE 8000

CMD ["gunicorn", "nlol_wms.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120"]
