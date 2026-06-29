@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-canton.ps1" %*
