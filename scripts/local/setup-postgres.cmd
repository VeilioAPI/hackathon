@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-postgres.ps1" %*
