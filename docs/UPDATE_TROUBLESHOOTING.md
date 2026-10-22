# Recurring findstr terminals after an update

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
