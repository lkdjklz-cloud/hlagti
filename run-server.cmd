@echo off
cd /d "%~dp0server"
node src/index.js >> "%~dp0server-detach.log" 2>&1