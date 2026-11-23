@echo off
chcp 65001 >nul
title 数理无限画布 · 网页版
cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel%==0 (
    python serve.py
    goto :end
)

where py >nul 2>nul
if %errorlevel%==0 (
    py serve.py
    goto :end
)

echo.
echo  [!] 未检测到 Python。
echo      请安装 Python 3（https://www.python.org/downloads/），
echo      或用任意静态服务器托管本目录，例如：
echo        npx serve .        /      nginx 指向本目录
echo.
pause

:end
