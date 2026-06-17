#!/bin/bash
set -e
python manage.py migrate --no-input
exec gunicorn nlol_wms.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers 2 --timeout 120
