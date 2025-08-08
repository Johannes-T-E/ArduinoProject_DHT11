@echo off
REM Arduino CLI Upload Script - Place this in any sketch folder
REM Double-click to upload the sketch in this folder

set ARDUINO_CLI=C:\Program Files\Arduino CLI\arduino-cli.exe

REM Get the current directory name (should match the .ino file name)
for %%i in (.) do set SKETCH_NAME=%%~ni
set SKETCH_PATH=%~dp0

REM Check if Arduino CLI exists
if not exist "%ARDUINO_CLI%" (
    echo Arduino CLI not found at: "%ARDUINO_CLI%"
    echo Please install Arduino CLI first: winget install --id ArduinoSA.CLI
    echo.
    pause
    exit /b 1
)

REM Check if .ino file exists in current directory
if not exist "%SKETCH_PATH%%SKETCH_NAME%.ino" (
    echo Error: %SKETCH_NAME%.ino not found in current directory
    echo Make sure this upload.bat file is in the same folder as your .ino file
    echo.
    pause
    exit /b 1
)

echo ========================================
echo Arduino Upload Script
echo ========================================
echo Sketch: %SKETCH_NAME%
echo Path: %SKETCH_PATH%
echo Board: arduino:avr:uno
echo.

REM Compile command - remove trailing backslash
set SKETCH_PATH_CLEAN=%SKETCH_PATH:~0,-1%
set COMPILE_CMD="%ARDUINO_CLI%" compile --fqbn arduino:avr:uno "%SKETCH_PATH_CLEAN%"

echo Compiling %SKETCH_NAME%...
%COMPILE_CMD%

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Compilation successful!
    
    REM Check for available ports (robust execution via cmd /c into temp file)
    echo Checking for Arduino boards...
    set PORT=
    if exist ports.txt del ports.txt >nul 2>&1
    cmd /c ""%ARDUINO_CLI%" board list > ports.txt"
    for /f "tokens=1" %%i in ('findstr /R /C:"^COM" ports.txt') do (
        set PORT=%%i
        goto :found_port
    )
    if exist ports.txt del ports.txt >nul 2>&1
    echo No Arduino boards found. Please connect your Arduino.
    echo.
    goto :end
    :found_port
    if exist ports.txt del ports.txt >nul 2>&1
    echo Found Arduino on: %PORT%
    
    REM Upload command
    set UPLOAD_CMD="%ARDUINO_CLI%" upload --fqbn arduino:avr:uno "%SKETCH_PATH_CLEAN%" --port %PORT%
    
    echo.
    echo Uploading to %PORT%...
    %UPLOAD_CMD%
    
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo ========================================
        echo Upload successful!
        echo ========================================
        echo Note: If any Serial Monitor or web app is connected, disconnect it first.
        goto :end
    ) else (
        echo.
        echo ========================================
        echo Upload failed!
        echo ========================================
        echo Possible causes:
        echo 1. Port is in use (close web app or Arduino IDE Serial Monitor)
        echo 2. Arduino not connected or wrong port
        echo 3. Board not in programming mode
        goto :end
    )
) else (
    echo.
    echo ========================================
    echo Compilation failed!
    echo ========================================
    goto :end
)

:end
echo.
pause


