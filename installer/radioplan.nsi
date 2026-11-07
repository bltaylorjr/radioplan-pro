; RadioPlan Pro Windows installer (per-user, no administrator rights needed).
; Build: makensis -DVERSION=x.y.z -DSRC=<folder with radioplan.exe + WebView2Loader.dll> radioplan.nsi
Unicode true
!include "MUI2.nsh"
!ifndef VERSION
  !define VERSION "0.1.0"
!endif
!define APP "RadioPlan Pro"
!define EXE "RadioPlan Pro.exe"
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\RadioPlanPro"
Name "${APP}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\RadioPlan Pro"
InstallDirRegKey HKCU "Software\RadioPlanPro" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "FileDescription" "${APP} installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" ""
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
; One-click: no questions. Shows progress, then starts the app.
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "RadioPlan Pro is installed"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "It will open now. Next time, use the RadioPlan Pro icon on your desktop."
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ; Microsoft Edge WebView2 runtime ships with Windows 11 and current Windows 10. Check for it.
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 ok
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 ok
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 ok
  MessageBox MB_YESNO|MB_ICONEXCLAMATION "${APP} needs the Microsoft Edge WebView2 Runtime, which was not found on this PC.$\r$\n$\r$\nOpen the Microsoft download page now? (Choose the Evergreen Bootstrapper, install it, then run this installer again.)" IDNO ok
  ExecShell "open" "https://developer.microsoft.com/microsoft-edge/webview2/"
  Abort
  ok:
FunctionEnd

AutoCloseWindow true
Function .onInstSuccess
  Exec '"$INSTDIR\${EXE}"'
FunctionEnd

Section "Install"
  ; Close a running copy so an update can replace it (projects are saved continuously).
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  Sleep 500
  SetOutPath "$INSTDIR"
  File "/oname=${EXE}" "${SRC}\radioplan.exe"
  File "${SRC}\WebView2Loader.dll"
  File "/oname=RadioPlan.ico" "${ICON}"
  File "${SRC}\README.md"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortcut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\RadioPlan.ico"
  CreateShortcut "$SMPROGRAMS\${APP}\Uninstall ${APP}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\${APP}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\RadioPlan.ico"
  WriteRegStr HKCU "Software\RadioPlanPro" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "${APP}"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\RadioPlan.ico"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ; Projects are kept (they live in %LOCALAPPDATA%\com.radioplan.pro) so a reinstall finds them again.
  Delete "$INSTDIR\${EXE}"
  Delete "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\RadioPlan.ico"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\${APP}\${APP}.lnk"
  Delete "$SMPROGRAMS\${APP}\Uninstall ${APP}.lnk"
  RMDir "$SMPROGRAMS\${APP}"
  Delete "$DESKTOP\${APP}.lnk"
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\RadioPlanPro"
SectionEnd
