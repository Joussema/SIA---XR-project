@echo off
setlocal

REM Always run from script folder
cd /d "%~dp0"

echo.
echo ==========================================
echo Checking Python installation...
echo ==========================================
python --version >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python is not installed.
    echo Please install Python from https://www.python.org and try again.
    pause
    exit /b 1
)

echo Python is installed.

echo.
echo ==========================================
echo Checking pip installation...
echo ==========================================
pip --version >nul 2>nul
if errorlevel 1 (
    echo pip not detected, trying: python -m ensurepip
    python -m ensurepip --default-pip
)

pip --version >nul 2>nul
if errorlevel 1 (
    echo [ERROR] pip could not be installed.
    pause
    exit /b 1
)

echo pip is installed.

echo.
echo ==========================================
echo Checking gdown installation...
echo ==========================================
where gdown >nul 2>nul

if errorlevel 1 (
    echo gdown not found. Installing gdown...
    pip install gdown

    REM Re-check
    where gdown >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] gdown installation failed.
        pause
        exit /b 1
    )
)

echo gdown is installed.

REM Create folders if they don't exist
if not exist "models" mkdir "models"
if not exist "sounds" mkdir "sounds"

echo.
echo ============================
echo Downloading MODELS folder...
echo ============================
gdown --folder "https://drive.google.com/drive/folders/1q-eyPBlRYaJlzrsrfpn7U7o0BMuCi0Ua" -O "models"

echo.
echo ============================
echo Downloading SOUNDS folder...
echo ============================
gdown --folder "https://drive.google.com/drive/folders/15AZmtXNT9z6PH-nI1gyZBijSBGaocLdd" -O "sounds"

echo.
echo All downloads finished.
pause
endlocal
