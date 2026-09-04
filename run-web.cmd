@echo off
cd /d "%~dp0web"
call node_modules\.bin\vite.cmd >> "%~dp0web-detach.log" 2>&1