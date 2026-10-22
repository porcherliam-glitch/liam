; NSIS customisations of the NOVA AI installer (included by electron-builder via nsis.include).
;
; customInit     (installer start, before files are replaced): stop a running background service of an existing
;                installation gracefully ("NOVA AI.exe" --stop-daemon also asks a running UI to quit).
; customInstall  (after the files were copied): offer the desktop shortcut. Default "Nein" (also in silent mode
;                via /SD IDNO). An existing shortcut (update / reinstall) is refreshed without asking.
; customUnInit   (uninstaller start): stop the background service gracefully; on a real uninstall (not an update,
;                where electron-builder runs the old uninstaller with --updated) also remove the autostart entry
;                (HKCU Run value written by app.setLoginItemSettings, value name = AppUserModelId ai.nova.studio).
; customUnInstall (uninstall section): remove the desktop shortcut on a real uninstall.
;
; Never deleted: %LOCALAPPDATA%\NOVA AI (database, logs, backups) and the user's project folders
; (deleteAppDataOnUninstall: false in electron-builder.yml).
; Only macros, no Functions/Vars: unused functions/variables are NSIS warnings, and electron-builder treats
; warnings as errors.
; This file is UTF-8 with BOM so NSIS reads the German umlauts correctly.

!macro novaStopDaemon
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    DetailPrint "NOVA-Hintergrunddienst wird beendet …"
    ; Waits until the service has ended (at most ~25 s); the exit code is informational only.
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --stop-daemon' $0
    DetailPrint "NOVA-Hintergrunddienst: Ergebnis $0"
  ${EndIf}
!macroend

!macro customInit
  !insertmacro novaStopDaemon
!macroend

!macro customInstall
  ${If} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ; Keep the earlier choice: refresh the existing shortcut (the installation folder may have changed).
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
  ${ElseIfNot} ${isUpdated}
    ${If} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION "Desktop-Verknüpfung erstellen?" /SD IDNO IDYES`
      CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInit
  !insertmacro novaStopDaemon
  ${IfNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ai.nova.studio"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "ai.nova.studio"
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    ${If} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
      WinShell::UninstShortcut "$DESKTOP\${SHORTCUT_NAME}.lnk"
      Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend
