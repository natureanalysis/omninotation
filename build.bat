@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===== OmniNotation: npm run build =====
echo.
call npm run build
if errorlevel 1 (
    echo.
    echo [FAILED] 构建失败，请检查上方错误信息。
) else (
    echo.
    echo [OK] 构建成功，产物位于 build\chrome-mv3 目录。
)
echo.
pause
