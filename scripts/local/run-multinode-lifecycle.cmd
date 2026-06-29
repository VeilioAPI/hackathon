@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-multinode-lifecycle.ps1" %*
