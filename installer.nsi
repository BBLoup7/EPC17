; EPC17 Event Management System Installer
; NSIS Script for creating a professional installer

!define APP_NAME "EPC17 Event Management System"
!define APP_VERSION "1.0.0"
!define APP_PUBLISHER "EPC Technology"
!define APP_EXE "epc17.exe"
!define APP_ID "EPC17EventManagementSystem"

; Include modern UI
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

; General
Name "${APP_NAME}"
OutFile "EPC17Setup.exe"
InstallDir "$PROGRAMFILES\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_NAME}" ""

; Request application privileges
RequestExecutionLevel admin

; Set to 32-bit for maximum compatibility
SetCompressor /SOLID lzma
SetCompressorDictSize 64

; Interface Settings
!define MUI_ABORTWARNING

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstaller pages
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Languages
!insertmacro MUI_LANGUAGE "English"

; Version Information
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright © 2024 EPC Technology"
        VIAddVersionKey "FileDescription" "EPC17 Event Management System Installer"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"

; Installer Sections
Section "Main Application" SecMain
    SectionIn RO
    SetOutPath "$INSTDIR"
    
    ; Create application directory structure
    CreateDirectory "$INSTDIR\app"
    CreateDirectory "$INSTDIR\data"
    CreateDirectory "$INSTDIR\logs"
    CreateDirectory "$INSTDIR\backup"
    
    ; Copy application files
    File /r "*.html"
    File /r "*.css"
    File /r "*.js"
    File /r "js\*"
    File /r "modules\*"
    File /r "utils\*"
    File /r "components\*"
    File /r "styles\*"
    
    ; Copy Python files
    File "server.py"
    File "requirements.txt"
    
    ; Copy data files (if they exist, for initial setup)
    File /r "data\*.json"
    
    ; Create the main executable launcher
    FileOpen $0 "$INSTDIR\${APP_EXE}" w
    FileWrite $0 '@echo off$\r$\n'
    FileWrite $0 'title ${APP_NAME}$\r$\n'
    FileWrite $0 'cd /d "%~dp0"$\r$\n'
    FileWrite $0 'echo Starting ${APP_NAME}...$\r$\n'
    FileWrite $0 'echo.$\r$\n'
    FileWrite $0 'REM Check if Python is installed$\r$\n'
    FileWrite $0 'python --version >nul 2>&1$\r$\n'
    FileWrite $0 'if errorlevel 1 ($\r$\n'
    FileWrite $0 '    echo ERROR: Python is not installed or not in PATH$\r$\n'
    FileWrite $0 '    echo Please install Python 3.8 or higher from https://python.org$\r$\n'
    FileWrite $0 '    pause$\r$\n'
    FileWrite $0 '    exit /b 1$\r$\n'
    FileWrite $0 ')$\r$\n'
    FileWrite $0 'echo Python found. Installing dependencies...$\r$\n'
    FileWrite $0 'pip install -r requirements.txt --quiet --disable-pip-version-check$\r$\n'
    FileWrite $0 'if errorlevel 1 ($\r$\n'
    FileWrite $0 '    echo WARNING: Failed to install some dependencies$\r$\n'
    FileWrite $0 '    echo Continuing anyway...$\r$\n'
    FileWrite $0 ')$\r$\n'
    FileWrite $0 'echo.$\r$\n'
    FileWrite $0 'echo Starting server...$\r$\n'
    FileWrite $0 'echo Server will be available at:$\r$\n'
    FileWrite $0 'echo   - http://localhost:5000$\r$\n'
    FileWrite $0 'echo   - http://127.0.0.1:5000$\r$\n'
    FileWrite $0 'echo   - http://[your-ip]:5000 (for network access)$\r$\n'
    FileWrite $0 'echo.$\r$\n'
    FileWrite $0 'echo Press Ctrl+C to stop the server$\r$\n'
    FileWrite $0 'echo.$\r$\n'
    FileWrite $0 'python server.py$\r$\n'
    FileWrite $0 'pause$\r$\n'
    FileClose $0
    
    ; Create desktop shortcut
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "" 0
    
    ; Create start menu shortcut
    CreateDirectory "$SMPROGRAMS\${APP_NAME}"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "" 0
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe" "" "" 0
    
    ; Write registry keys
    WriteRegStr HKCU "Software\${APP_NAME}" "" $INSTDIR
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayName" "${APP_NAME}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "Publisher" "${APP_PUBLISHER}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "DisplayVersion" "${APP_VERSION}"
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" "NoRepair" 1
    
    ; Create uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Database Migration" SecDB
    ; Check if this is an update (data directory exists)
    ${If} ${FileExists} "$INSTDIR\data\participants.json"
        DetailPrint "Existing installation detected. Preserving database..."
        
        ; Create backup of existing data
        CreateDirectory "$INSTDIR\backup\$(^Date)"
        CopyFiles "$INSTDIR\data\*.json" "$INSTDIR\backup\$(^Date)\"
        
        ; Don't overwrite existing data files
        SetOverwrite off
        File "data\*.json"
        SetOverwrite on
        
        DetailPrint "Database preserved successfully."
    ${Else}
        DetailPrint "Fresh installation. Creating initial database..."
        SetOverwrite on
        File "data\*.json"
    ${EndIf}
SectionEnd

; Uninstaller Section
Section "Uninstall"
    ; Remove files and directories
    Delete "$INSTDIR\${APP_EXE}"
    Delete "$INSTDIR\server.py"
    Delete "$INSTDIR\requirements.txt"
    Delete "$INSTDIR\*.html"
    Delete "$INSTDIR\*.css"
    Delete "$INSTDIR\*.js"
    
    ; Remove directories (but preserve data)
    RMDir /r "$INSTDIR\js"
    RMDir /r "$INSTDIR\modules"
    RMDir /r "$INSTDIR\utils"
    RMDir /r "$INSTDIR\components"
    RMDir /r "$INSTDIR\styles"
    
    ; Remove shortcuts
    Delete "$DESKTOP\${APP_NAME}.lnk"
    Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
    Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
    RMDir "$SMPROGRAMS\${APP_NAME}"
    
    ; Remove registry keys
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
    DeleteRegKey HKCU "Software\${APP_NAME}"
    
    ; Remove uninstaller
    Delete "$INSTDIR\Uninstall.exe"
    
    ; Ask user if they want to remove data
    MessageBox MB_YESNO "Do you want to remove all saved data (participants, events, etc.)?$\r$\n$\r$\nThis action cannot be undone." IDNO SkipDataRemoval
    RMDir /r "$INSTDIR\data"
    RMDir /r "$INSTDIR\backup"
    SkipDataRemoval:
    
    ; Remove installation directory
    RMDir "$INSTDIR"
SectionEnd

; Function to handle installation completion
Function .onInstSuccess
    MessageBox MB_OK "Installation completed successfully!$\r$\n$\r$\n${APP_NAME} has been installed to:$\r$\n$INSTDIR$\r$\n$\r$\nA shortcut has been created on your desktop.$\r$\n$\r$\nTo start the application, double-click the desktop shortcut or run:$\r$\n$INSTDIR\${APP_EXE}"
FunctionEnd 