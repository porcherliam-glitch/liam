; NSIS customisations of the NOVA AI installer (included by electron-builder via nsis.include; written against the
; electron-builder 26.18 templates in node_modules/app-builder-lib/templates/nsis).
;
; Installation folder – program files and user data never share a folder:
; - The folder must not be (or lie inside) the data folders %LOCALAPPDATA%\NOVA AI (database, backups, logs) or
;   %APPDATA%\NOVA AI (window state), and it must be new/empty or already hold NOVA AI (update, reinstall).
;   customHeader adds .onVerifyInstDir: on the folder page "Installieren" stays disabled for such a folder and the page
;   text says why. customCheckAppRunning repeats the check before anything is changed (silent "/D=…" installs never
;   show the folder page) and aborts with a German message (exit code 2).
; - customRemoveFiles (uninstall, and the old uninstaller that electron-builder runs with --updated during an update)
;   removes only the files the installer put there, and the folder itself only when nothing else is left. Anything
;   the user stored there (e.g. a project folder) survives. electron-builder's default would delete the whole folder.
;
; Stopping NOVA – customCheckAppRunning replaces electron-builder's process check, so it runs where electron-builder
; checks for the running app: in the install/uninstall section after the user confirmed (cancelling the wizard
; changes nothing; the progress page shows what happens), and for a silent uninstall in un.onInit (still before
; anything is removed). First "NOVA AI.exe" --stop-daemon shuts the background service down gracefully (and asks a
; running UI to quit); only NOVA processes that are still running afterwards are ended the way electron-builder does.
;
; customInstall   (after the files were copied): offer the desktop shortcut. Default "Nein" (also in silent mode
;                 via /SD IDNO). An existing shortcut (update / reinstall) is refreshed without asking.
; customUnInstall (uninstall section, after the confirmation): the program file must be deletable (proof that no NOVA
;                 process runs any more), otherwise abort with nothing changed. On a real uninstall (not an update)
;                 also remove the autostart entry (HKCU Run value written by app.setLoginItemSettings, value name =
;                 AppUserModelId ai.nova.studio) and the desktop shortcut.
;
; Never deleted: %LOCALAPPDATA%\NOVA AI (database, logs, backups), %APPDATA%\NOVA AI and the user's project folders
; (deleteAppDataOnUninstall: false in electron-builder.yml).
; Only macros at the top level: unused Functions/Vars are NSIS warnings, and electron-builder treats warnings as
; errors. The Function and the Vars below live inside macros that electron-builder inserts exactly once.
; This file is UTF-8 with BOM so NSIS reads the German umlauts correctly.

; ${OUT} = "1" when the folder ${DIR} is ${BASE} or lies inside it (case-insensitive like Windows), else "0".
; Uses $R8 and $R9 (callers must not pass them).
!macro novaIsSameOrInside DIR BASE OUT
  StrCpy ${OUT} "0"
  StrLen $R9 "${BASE}"
  StrCpy $R8 "${DIR}" $R9
  ${If} $R8 == "${BASE}"
    StrCpy $R8 "${DIR}" 1 $R9
    ${If} $R8 == ""
    ${OrIf} $R8 == "\"
      StrCpy ${OUT} "1"
    ${EndIf}
  ${EndIf}
!macroend

; ${OUT} = "" when the folder ${DIR} may become the installation folder, else the German reason for the user.
; Uses $R6–$R9 (callers must not pass them).
!macro novaCheckInstallDir DIR OUT
  StrCpy ${OUT} ""
  !insertmacro novaIsSameOrInside "${DIR}" "$LOCALAPPDATA\${APP_FILENAME}" $R7
  ${If} $R7 != "1"
    !insertmacro novaIsSameOrInside "${DIR}" "$APPDATA\${APP_FILENAME}" $R7
  ${EndIf}
  ${If} $R7 == "1"
    StrCpy ${OUT} "In diesem Ordner speichert NOVA AI Ihre Daten (Datenbank, Sicherungen, Protokolle). Das Programm braucht einen eigenen Ordner. Bitte einen anderen Ordner wählen."
  ${ElseIf} ${FileExists} "${DIR}\${APP_EXECUTABLE_FILENAME}"
  ${OrIf} ${FileExists} "${DIR}\${UNINSTALL_FILENAME}"
    ; An existing NOVA AI installation (update or reinstall).
  ${Else}
    ; Otherwise only a new or empty folder.
    FindFirst $R6 $R7 "${DIR}\*.*"
    ${DoUntil} $R7 == ""
      ${If} $R7 != "."
      ${AndIf} $R7 != ".."
        StrCpy ${OUT} "Der Ordner „${DIR}“ enthält bereits andere Dateien. NOVA AI braucht einen eigenen, leeren Ordner, damit beim Aktualisieren oder Deinstallieren nichts anderes gelöscht wird. Bitte einen anderen Ordner wählen."
        ${ExitDo}
      ${EndIf}
      FindNext $R6 $R7
    ${Loop}
    FindClose $R6
  ${EndIf}
  ClearErrors
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    ; Folder page: keep "Installieren" disabled for a folder that must not be used and show the reason in the page
    ; text. Checks the folder that will really be used: electron-builder's instFilesPre appends "\NOVA AI" unless
    ; the path already contains it (same ${StrContains} test).
    Function .onVerifyInstDir
      ${IfNot} ${Silent}
        Push $R4
        Push $R5
        Push $R6
        Push $R7
        Push $R8
        Push $R9
        ${StrContains} $R5 "${APP_FILENAME}" $INSTDIR
        ${If} $R5 == ""
          StrCpy $R5 "$INSTDIR\${APP_FILENAME}"
        ${Else}
          StrCpy $R5 $INSTDIR
        ${EndIf}
        !insertmacro novaCheckInstallDir $R5 $R4
        FindWindow $R6 "#32770" "" $HWNDPARENT
        GetDlgItem $R6 $R6 1006
        ${If} $R4 == ""
          SendMessage $R6 ${WM_SETTEXT} 0 "STR:$(^DirText)"
          ClearErrors
        ${Else}
          SendMessage $R6 ${WM_SETTEXT} 0 "STR:$R4"
          SetErrors
        ${EndIf}
        Pop $R9
        Pop $R8
        Pop $R7
        Pop $R6
        Pop $R5
        Pop $R4
        ${If} ${Errors}
          Abort
        ${EndIf}
      ${EndIf}
    FunctionEnd
  !endif
!macroend

!macro customCheckAppRunning
  !ifndef BUILD_UNINSTALLER
    ; Last check of the installation folder, before anything is changed.
    !insertmacro novaCheckInstallDir $INSTDIR $R0
    ${If} $R0 != ""
      MessageBox MB_OK|MB_ICONSTOP "$R0" /SD IDOK
      Abort
    ${EndIf}
    ; installSection.nsh hides all detail texts of the assisted installer; show this step on the progress page.
    ${IfNot} ${Silent}
      SetDetailsPrint textonly
    ${EndIf}
  !endif
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    DetailPrint "NOVA AI wird beendet …"
    ; Graceful shutdown; waits until the service has ended (at most ~35 s). The exit code is informational only.
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --stop-daemon' $R0
  ${EndIf}
  ; Fallback for NOVA processes that are still running from the installation folder (a hanging window, a service
  ; that did not answer): end them like electron-builder's _CHECK_APP_RUNNING (FIND_PROCESS/KILL_PROCESS from
  ; allowOnlyOneInstallerInstance.nsh; KILL_PROCESS spares the process with the id in $pid, i.e. this one).
  Var /GLOBAL pid
  System::Call 'kernel32::GetCurrentProcessId()i.s'
  Pop $pid
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    DetailPrint "Laufende NOVA-Programmteile werden beendet …"
    !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 0
    Sleep 300
    StrCpy $R1 0
    ${Do}
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${If} $R0 != 0
        ${ExitDo}
      ${EndIf}
      Sleep 1000
      !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1
      !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
      ${If} $R0 != 0
        ${ExitDo}
      ${EndIf}
      DetailPrint "Warte, bis NOVA AI beendet ist …"
      Sleep 2000
      IntOp $R1 $R1 + 1
      ${If} $R1 > 1
        ; Probably started with other rights: the user has to close it.
        ${IfNot} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY`
          Quit
        ${EndIf}
      ${EndIf}
    ${Loop}
  ${EndIf}
  !ifndef BUILD_UNINSTALLER
    ${IfNot} ${Silent}
      SetDetailsPrint none
    ${EndIf}
  !endif
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

!macro customUnInstall
  ; Deleting the program file first proves that no NOVA process runs any more. If that fails, nothing has been
  ; changed yet and the installation keeps working (an update then retries or reports it).
  ClearErrors
  Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONSTOP "NOVA AI läuft noch und konnte nicht beendet werden. Bitte NOVA über das Symbol im Infobereich vollständig beenden und die Deinstallation erneut starten." /SD IDOK
    Abort "NOVA AI läuft noch."
  ${EndIf}
  ${IfNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ai.nova.studio"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "ai.nova.studio"
    ${If} ${FileExists} "$DESKTOP\${SHORTCUT_NAME}.lnk"
      WinShell::UninstShortcut "$DESKTOP\${SHORTCUT_NAME}.lnk"
      Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend

!macro customRemoveFiles
  ; Exactly what the installer put there: the Electron runtime, the app and the uninstaller ("NOVA AI.exe" is
  ; already gone, see customUnInstall). The uninstaller may still be running from here: then it simply stays.
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\uninstallerIcon.ico"
  Delete "$INSTDIR\debug.log"
  Delete "$INSTDIR\locales\*.pak"
  RMDir "$INSTDIR\locales"
  Delete "$INSTDIR\resources\app.asar"
  RMDir /r "$INSTDIR\resources\app.asar.unpacked"
  Delete "$INSTDIR\resources\elevate.exe"
  Delete "$INSTDIR\resources\icon.ico"
  Delete "$INSTDIR\resources\icon.png"
  RMDir "$INSTDIR\resources"
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  ; The folder itself only when it is empty now (RMDir without /r).
  SetOutPath $TEMP
  RMDir "$INSTDIR"
  ${If} ${FileExists} "$INSTDIR\*.*"
    DetailPrint "Der Installationsordner enthält eigene Dateien und bleibt erhalten: $INSTDIR"
  ${EndIf}
!macroend
