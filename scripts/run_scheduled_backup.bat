@echo off
cd /d "C:\NLOL WMS"
call .venv\Scripts\activate.bat
python manage.py backup_database --trigger=scheduled
