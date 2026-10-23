// GUI-subsystem launcher: detached Node children must survive Electron, but PowerShell itself
// cannot use that detached console mode reliably. .NET launches the script without libuv's job.
using System;
using System.Diagnostics;
using System.IO;
using System.Text;

internal static class UpdateBridge {
    private static readonly object LogLock = new object();
    private static string LogPath;
    private static void Log(string text) {
        if (String.IsNullOrEmpty(text)) return;
        lock (LogLock) File.AppendAllText(LogPath, text + Environment.NewLine, new UTF8Encoding(false));
    }
    [STAThread]
    private static int Main(string[] args) {
        if (args.Length != 2) return 2;
        try {
            string scriptPath = Path.GetFullPath(args[0]);
            LogPath = Path.GetFullPath(args[1]);
            string script = File.ReadAllText(scriptPath, Encoding.UTF8);
            Log("Windows update bridge started; launching the verified-apply script.");
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
            var info = new ProcessStartInfo(powershell,
                "-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand " + Convert.ToBase64String(Encoding.Unicode.GetBytes(script)));
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.RedirectStandardInput = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.WorkingDirectory = Path.GetDirectoryName(scriptPath);
            using (var child = new Process()) {
                child.StartInfo = info;
                child.OutputDataReceived += (sender, line) => { if (line.Data != null) Log(line.Data); };
                child.ErrorDataReceived += (sender, line) => { if (line.Data != null) Log(line.Data); };
                if (!child.Start()) throw new InvalidOperationException("PowerShell did not start.");
                Log("PowerShell PID: " + child.Id);
                child.BeginOutputReadLine();
                child.BeginErrorReadLine();
                // The script bounds app wait (120s) and installer wait (180s). Keep stdin valid
                // and the bridge alive until it finishes; no CMD, FINDSTR or unbounded retry loop.
                if (!child.WaitForExit(360000)) {
                    Log("PowerShell exceeded the bridge deadline. An installer, if running, has not been terminated.");
                    return 1;
                }
                child.WaitForExit(); // Drain asynchronous output after the bounded process wait.
                Log("PowerShell exited: " + child.ExitCode);
                return child.ExitCode;
            }
        } catch (Exception error) {
            try { Log("Windows update bridge failed: " + error.Message); } catch { }
            return 1;
        }
    }
}
