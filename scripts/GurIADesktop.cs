using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
class GurIADesktop {
  [STAThread] static void Main() {
    try {
      string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
      string node = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), @".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe");
      string script = Path.Combine(root, "scripts", "guria-desktop.mjs");
      var info = new ProcessStartInfo(node, "\"" + script + "\"");
      info.WorkingDirectory = root;
      info.UseShellExecute = false;
      info.CreateNoWindow = true;
      info.RedirectStandardError = true;
      info.RedirectStandardOutput = true;
      using (var process = Process.Start(info)) {
        string error = process.StandardError.ReadToEnd();
        process.StandardOutput.ReadToEnd();
        process.WaitForExit();
        if (process.ExitCode != 0) MessageBox.Show(error, "gurIA", MessageBoxButtons.OK, MessageBoxIcon.Error);
      }
    } catch (Exception e) { MessageBox.Show(e.Message, "gurIA", MessageBoxButtons.OK, MessageBoxIcon.Error); }
  }
}
