# Update recovery and diagnostics

## App closes on Restart & install, but remains on 1.5.1

This is a failed installation handoff. A verified download is not proof that Windows ran the installer or that the executable at the original location changed. Do not repeatedly press Restart & install when the same version returns.

1. Quit S2Teasy using the tray icon → **Quit**. Closing its window can leave it running.
2. Download the current **win-x64 installer** from [Releases](https://github.com/HighRyzchs/S2TEasy/releases/latest). Run that downloaded EXE itself; the in-app download/restart controls in 1.5.1 still use 1.5.1's updater.
3. Install over the existing app without uninstalling or deleting `%APPDATA%\s2teasy`. Open from the new Start-menu shortcut and verify the version in Settings.
4. If it is still old, compare the running executable/shortcut location with the installed location. Preserve `%APPDATA%\s2teasy\update-result.json` and, if present, `update-result.json.log`. “No receipt file” is useful evidence that the helper may not have reached its first write; it does not establish why.

Version 1.7.1 adds **Open update diagnostics** in Settings → Privacy & data, plus per-attempt `updates/attempt-*/helper.log`, `apply.ps1`, a pending receipt and an acknowledgment before shutdown. The receipt records target/payload paths, versions, stage and a local attempt ID. These files contain paths/Windows usernames but no API keys or transcripts by design; inspect/redact paths before sharing. Do not upload the entire app-data folder, which contains private History and recordings.

An incomplete receipt pauses automatic download on startup, keeping the error visible. A success receipt for a different running version is reported as a mismatch. For installed builds, the new helper checks the executable's ProductVersion after NSIS exits. A zero installer exit code alone cannot produce an “updated” result. The exact cause on a user's computer still requires its receipt/logs; CI success does not establish desktop behavior on that computer.

## View a report inside the app

Native Windows testing reproduced an unavailable `Get-FileHash` function in a helper process. The 1.7.1 helper uses .NET SHA-256 directly, avoiding that module-path dependency while retaining verification. This is a reproduced compatibility failure, not proof of the cause on every user's computer.

In 1.7.1, use **Settings → Privacy & data → View update report**, then **Copy update report**. The bounded report includes the running version, selected receipt fields and the last 12 KB of the latest helper log. It reads only update-owned files, not settings/history or paths suggested by receipt contents. Nothing is uploaded automatically. Review usernames and paths before sharing. **Open update diagnostics** remains available for inspecting the files directly.

## Recurring findstr terminals after an update

A window showing `findstr /I "11012"` (the number varies) is the **old 1.4.0 updater's process-exit polling command**. Clipboard insertion uses Electron's clipboard API and Windows native keystrokes; it does not launch FINDSTR or CMD.

The legacy helper runs:

```bat
tasklist /FI "PID eq <old-app-PID>" | findstr /I "<old-app-PID>" >nul
```

Its batch script repeats that pipeline while it finds the old PID. Closing only the child FINDSTR window does not stop its parent script, so another window can appear. The displayed PID is a search argument, not a reliable identity for a process to kill later: Windows can reuse PIDs. A visible window alone does not establish that an update completed; check the version in Settings.

## Stop an already-running legacy helper

1. Quit S2Teasy using the system-tray icon → **Quit**. Closing the main window hides it to the tray.
2. Open Task Manager → **Details**. Right-click a column header → **Select columns** → enable **Command line**.
3. Find the specific **cmd.exe** whose command line runs `s2teasy-apply-<PID>.cmd` in your temporary directory. For the `11012` report, the old helper filename is `s2teasy-apply-11012.cmd`.
4. Right-click that matching CMD process → **End process tree**. Do not terminate unrelated CMD, PowerShell or FINDSTR processes. If multiple matching S2Teasy helpers exist, stop each matching helper. Merely ending FINDSTR leaves the parent loop alive.
5. Open S2Teasy again and check the version under Settings → Privacy & data. If the update did not finish, install the current x64 installer over the existing installed app from [GitHub Releases](https://github.com/HighRyzchs/S2TEasy/releases/latest). Existing settings/history remain in the same user-data folder; no uninstall is needed.

If the command line does not match an S2Teasy helper, preserve that distinction and inspect its parent before ending anything. The cloud development environment cannot inspect or terminate processes on your PC.

## Prevention in current builds

Versions 1.4.1 and later replace that unbounded CMD pipeline with a PowerShell process wait capped at 120 seconds. Version 1.5.1 additionally makes the applying state exclusive across Settings, tray and IPC requests, explicitly hides the PowerShell window, and refuses Restart until an update has been downloaded and verified. A helper-launch failure keeps the app open and reports an error. These changes prevent new duplicate helpers; they cannot remove an old helper that is already running.

Portable 1.4.0 has a separate temporary-launcher-path problem; download a current portable EXE manually rather than relying on its old updater. This does not apply to the installed x64 package.
