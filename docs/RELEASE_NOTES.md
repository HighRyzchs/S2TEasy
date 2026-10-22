## Update helper hotfix — v1.5.1

- Allow only one update helper per restart attempt. Repeated Restart clicks, tray actions and concurrent update checks cannot launch extra helpers or overwrite an installation in progress.
- Explicitly hide the PowerShell helper window, in addition to Windows process-window suppression.
- Require a downloaded, verified update before restarting; do not queue background install callbacks from premature Restart requests.

The `findstr /I "<PID>"` terminal loop belongs to the old 1.4.0 updater, not clipboard insertion. Its parent batch script can respawn `findstr` after that window is closed. Versions 1.4.1 and later use a bounded PowerShell wait instead; this release additionally prevents duplicate helper launches.

If an old loop is already running: quit S2Teasy from the tray, then open Task Manager → Details, enable the Command line column, and end the process tree of the specific `cmd.exe` running `%TEMP%\s2teasy-apply-<PID>.cmd`. Do not end unrelated terminals or processes solely by the displayed PID. Then open S2Teasy again. See docs/UPDATE_TROUBLESHOOTING.md in the repository for steps.

Installed x64 users can install this over the existing app; no uninstall or data reset is needed. This cannot terminate an old batch script already running on your computer. Native Windows update behavior still requires desktop verification. No changes to dictation, clipboard insertion or stored settings/history are included.
