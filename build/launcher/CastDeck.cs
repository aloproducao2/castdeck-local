// CastDeck.exe — lançador nativo do Windows (sem janela de console).
// Mostra a splash na hora, extrai e inicia o servidor embutido (oculto), abre a janela do estúdio
// e fica na bandeja do sistema (Abrir / Pasta das gravações / Log / Sair).
// Compilado por build/build-exe.mjs com o csc.exe do .NET Framework 4 (C# 5: sem $"" nem ?.).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("CastDeck")]
[assembly: AssemblyDescription("CastDeck Local - estúdio de transmissão ao vivo")]
[assembly: AssemblyProduct("CastDeck Local")]
[assembly: AssemblyCompany("CastDeck")]
[assembly: AssemblyCopyright("(C) 2026 Miguel Kallemback - AGPL-3.0")]
[assembly: AssemblyVersion(CastDeck.Info.Version)]
[assembly: AssemblyFileVersion(CastDeck.Info.Version)]

namespace CastDeck
{
    static partial class Info { }

    static class Program
    {
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main(string[] args)
        {
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            bool created;
            Mutex mutex = new Mutex(true, "Local\\CastDeckLocalApp", out created);
            if (!created)
            {
                // já está aberto: só traz a janela do estúdio
                if (Core.Healthy(1500)) Core.OpenWindow(false);
                return;
            }
            try { Application.Run(new AppContext()); }
            finally { GC.KeepAlive(mutex); }
        }
    }

    // "Job" do Windows com KILL_ON_JOB_CLOSE: o servidor e tudo que ele abrir (Edge do DSK, FFmpeg, MediaMTX,
    // cloudflared) entram no job; quando o lançador termina, de qualquer jeito (Sair, queda, Gerenciador de Tarefas),
    // o Windows fecha o handle e encerra a árvore inteira. Sem isso sobravam servidor e Edge órfãos segurando a
    // porta 3000 e o perfil do DSK ("O navegador do DSK fechou ao iniciar" e versão nova abrindo com o servidor antigo).
    static class KillJob
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attr, string name);
        [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int cls, IntPtr info, uint len);
        [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr proc);

        [StructLayout(LayoutKind.Sequential)]
        struct BASIC { public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags; public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass; }
        [StructLayout(LayoutKind.Sequential)]
        struct IO { public ulong a, b, c, d, e, f; }
        [StructLayout(LayoutKind.Sequential)]
        struct EXTENDED { public BASIC Basic; public IO Io; public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed; }

        static IntPtr job = IntPtr.Zero; // fica aberto até o processo do lançador acabar (de propósito)

        public static bool Add(Process p)
        {
            try
            {
                if (job == IntPtr.Zero)
                {
                    IntPtr j = CreateJobObject(IntPtr.Zero, null);
                    if (j == IntPtr.Zero) return false;
                    EXTENDED info = new EXTENDED();
                    info.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                    int len = Marshal.SizeOf(typeof(EXTENDED));
                    IntPtr ptr = Marshal.AllocHGlobal(len);
                    try
                    {
                        Marshal.StructureToPtr(info, ptr, false);
                        if (!SetInformationJobObject(j, 9, ptr, (uint)len)) return false; // 9 = ExtendedLimitInformation
                    }
                    finally { Marshal.FreeHGlobal(ptr); }
                    job = j;
                }
                return AssignProcessToJobObject(job, p.Handle);
            }
            catch { return false; }
        }
    }
    static class Core
    {
        // quem recebeu o clique (o lançador) pode liberar outro processo para trazer janela à frente (-1 = qualquer um)
        [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int pid);
        public const int Port = 3000;
        public static readonly string Url = "http://localhost:" + Port;
        public static readonly string Data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CastDeck");
        public static readonly string LogDir = Path.Combine(Data, "logs");
        public static readonly string LogFile = Path.Combine(LogDir, "castdeck.log");
        public static readonly string Profile = Path.Combine(Data, "window");
        static string browser;

        // idioma dos textos nativos: o mesmo escolhido no app (settings.lang no db.json), senão o do Windows
        public static string Lang = DetectLang();
        static string DetectLang()
        {
            try
            {
                string f = Path.Combine(Data, "db.json");
                if (File.Exists(f))
                {
                    Match m = Regex.Match(File.ReadAllText(f, Encoding.UTF8), "\"settings\"\\s*:\\s*\\{[^{}]*?\"lang\"\\s*:\\s*\"(pt|en|es)\"");
                    if (m.Success) return m.Groups[1].Value;
                }
            }
            catch { }
            string c = System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
            return c == "pt" ? "pt" : c == "es" ? "es" : "en";
        }
        public static string L(string pt, string en, string es) { return Lang == "en" ? en : Lang == "es" ? es : pt; }

        public static string Http(string method, string path, int timeout)
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(Url + path);
            req.Method = method;
            req.Timeout = timeout;
            req.ReadWriteTimeout = timeout;
            req.Proxy = null;
            if (method == "POST") { req.ContentType = "application/json"; byte[] b = Encoding.UTF8.GetBytes("{}"); req.ContentLength = b.Length; using (Stream s = req.GetRequestStream()) s.Write(b, 0, b.Length); }
            using (WebResponse res = req.GetResponse())
            using (StreamReader r = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                return r.ReadToEnd();
        }

        public static bool Healthy(int timeout)
        {
            try { return Http("GET", "/api/health", timeout).Contains("castdeck"); } catch { return false; }
        }

        static string FromAppPaths(string exe)
        {
            foreach (RegistryKey root in new RegistryKey[] { Registry.CurrentUser, Registry.LocalMachine })
            {
                try
                {
                    using (RegistryKey k = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exe))
                    {
                        if (k == null) continue;
                        string v = k.GetValue("") as string;
                        if (!string.IsNullOrEmpty(v) && File.Exists(v.Trim('"'))) return v.Trim('"');
                    }
                }
                catch { }
            }
            return null;
        }

        // Edge (vem no Windows) ou Chrome/Brave, em modo "app" (janela sem abas)
        public static string Browser()
        {
            if (browser != null) return browser;
            string pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "";
            string pf = Environment.GetEnvironmentVariable("ProgramFiles") ?? "";
            string lad = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            List<string> c = new List<string>();
            c.Add(Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"));
            c.Add(Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"));
            c.Add(Path.Combine(lad, @"Microsoft\Edge\Application\msedge.exe"));
            c.Add(FromAppPaths("msedge.exe"));
            c.Add(Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"));
            c.Add(Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"));
            c.Add(Path.Combine(lad, @"Google\Chrome\Application\chrome.exe"));
            c.Add(FromAppPaths("chrome.exe"));
            c.Add(Path.Combine(pf, @"BraveSoftware\Brave-Browser\Application\brave.exe"));
            foreach (string p in c) if (!string.IsNullOrEmpty(p) && File.Exists(p)) { browser = p; return p; }
            browser = "";
            return browser;
        }

        // abre a janela do estúdio; devolve o processo do navegador (ou null)
        public static Process OpenWindow(bool sized)
        {
            string b = Browser();
            if (b == "") { try { Process.Start(Url); } catch { } return null; }
            Directory.CreateDirectory(Profile);
            string a = "--app=" + Url + " --user-data-dir=\"" + Profile + "\" --no-first-run --no-default-browser-check --disable-background-mode --disable-features=Translate,msEdgeStartupBoost";
            if (sized) a += " --window-size=1440,900 --window-position=60,40";
            ProcessStartInfo si = new ProcessStartInfo(b, a);
            si.UseShellExecute = false;
            try { return Process.Start(si); } catch { try { Process.Start(Url); } catch { } return null; }
        }

        public static string OpenMode()
        {
            try
            {
                string sys = Http("GET", "/api/system", 4000);
                Match lm = Regex.Match(sys, "\"lang\"\\s*:\\s*\"(pt|en|es)\"");
                if (lm.Success) Lang = lm.Groups[1].Value;
                Match m = Regex.Match(sys, "\"openMode\"\\s*:\\s*\"(\\w+)\"");
                return m.Success ? m.Groups[1].Value : "app";
            }
            catch { return "app"; }
        }
    }

    // ---------------------------------------------------------------- splash
    class Splash : Form
    {
        readonly Image bg;
        readonly Image icon;
        string status = Core.L("Iniciando…", "Starting…", "Iniciando…");
        float phase;
        readonly System.Windows.Forms.Timer anim = new System.Windows.Forms.Timer();
        readonly Font fTitle = new Font("Segoe UI Semibold", 30f, FontStyle.Regular, GraphicsUnit.Point);
        readonly Font fSub = new Font("Segoe UI", 11f, FontStyle.Regular, GraphicsUnit.Point);
        readonly Font fStatus = new Font("Segoe UI", 9.5f, FontStyle.Regular, GraphicsUnit.Point);
        readonly Font fVer = new Font("Segoe UI", 8.5f, FontStyle.Regular, GraphicsUnit.Point);
        bool closing;

        [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int l, int t, int r, int b, int w, int h);

        public Splash()
        {
            Text = "CastDeck";
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterScreen;
            ShowInTaskbar = true;
            TopMost = true;
            DoubleBuffered = true;
            BackColor = Color.FromArgb(11, 11, 20);
            float s = ScreenDpi() / 96f;
            ClientSize = new Size((int)(640 * s), (int)(360 * s));
            try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            bg = Res.Image("splash.png");
            icon = Res.Image("icon.png");
            Region = Region.FromHrgn(CreateRoundRectRgn(0, 0, Width + 1, Height + 1, (int)(18 * s), (int)(18 * s)));
            Opacity = 0;
            anim.Interval = 16;
            anim.Tick += delegate
            {
                phase += 0.012f;
                if (phase > 1.6f) phase = -0.35f;
                if (closing) { Opacity = Math.Max(0, Opacity - 0.08); if (Opacity <= 0.01) { anim.Stop(); Close(); return; } }
                else if (Opacity < 1) Opacity = Math.Min(1, Opacity + 0.08);
                Invalidate();
            };
            anim.Start();
        }

        int ScreenDpi() { using (Graphics g = CreateGraphics()) return (int)g.DpiX; }

        public void SetStatus(string s)
        {
            if (IsDisposed) return;
            if (InvokeRequired) { try { BeginInvoke(new Action<string>(SetStatus), s); } catch { } return; }
            status = s;
            Invalidate();
        }

        public void FadeOut()
        {
            if (IsDisposed) return;
            if (InvokeRequired) { try { BeginInvoke(new Action(FadeOut)); } catch { } return; }
            TopMost = false;
            closing = true;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            float W = ClientSize.Width, H = ClientSize.Height, k = W / 640f;
            if (bg != null) g.DrawImage(bg, 0, 0, W, H);
            // véu à esquerda para o texto
            using (LinearGradientBrush veil = new LinearGradientBrush(new RectangleF(0, 0, W * 0.7f, H), Color.FromArgb(150, 8, 8, 16), Color.FromArgb(0, 8, 8, 16), 0f))
                g.FillRectangle(veil, 0, 0, W * 0.7f, H);
            if (icon != null) g.DrawImage(icon, 46 * k, 70 * k, 76 * k, 76 * k);
            using (SolidBrush white = new SolidBrush(Color.White))
                g.DrawString("CastDeck", fTitle, white, 40 * k, 156 * k);
            using (SolidBrush sub = new SolidBrush(Color.FromArgb(185, 185, 215)))
                g.DrawString(Core.L("Estúdio ao vivo · local", "Live studio · local", "Estudio en vivo · local"), fSub, sub, 46 * k, 212 * k);
            // barra de progresso indeterminada
            RectangleF track = new RectangleF(48 * k, 282 * k, 250 * k, 3 * k);
            using (SolidBrush tb = new SolidBrush(Color.FromArgb(40, 255, 255, 255))) g.FillRectangle(tb, track);
            float segW = track.Width * 0.38f;
            float x = track.X + phase * track.Width - segW / 2;
            RectangleF seg = RectangleF.Intersect(track, new RectangleF(x, track.Y, segW, track.Height));
            if (seg.Width > 1)
                using (LinearGradientBrush pb = new LinearGradientBrush(new RectangleF(x, track.Y, segW, track.Height), Color.FromArgb(139, 92, 246), Color.FromArgb(34, 211, 238), 0f))
                    g.FillRectangle(pb, seg);
            using (SolidBrush st = new SolidBrush(Color.FromArgb(205, 205, 230)))
                g.DrawString(status, fStatus, st, 46 * k, 294 * k);
            using (SolidBrush vb = new SolidBrush(Color.FromArgb(120, 255, 255, 255)))
            {
                string v = "v" + Info.Version.Substring(0, Info.Version.LastIndexOf('.'));
                SizeF sz = g.MeasureString(v, fVer);
                g.DrawString(v, fVer, vb, W - sz.Width - 14 * k, H - sz.Height - 10 * k);
            }
        }

        // arrastar a splash com o mouse
        protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); if (e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); } }
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
    }

    static class Res
    {
        public static Stream Open(string name) { return Assembly.GetExecutingAssembly().GetManifestResourceStream(name); }
        public static Image Image(string name) { try { Stream s = Open(name); return s == null ? null : System.Drawing.Image.FromStream(s); } catch { return null; } }
        public static string Text(string name) { Stream s = Open(name); if (s == null) return ""; using (StreamReader r = new StreamReader(s)) return r.ReadToEnd().Trim(); }
    }

    // ---------------------------------------------------------------- aplicativo (bandeja + ciclo de vida)
    class AppContext : ApplicationContext
    {
        readonly Splash splash = new Splash();
        NotifyIcon tray;
        Process server;
        Process window;
        DateTime windowStarted;
        StreamWriter log;
        readonly object logLock = new object();
        readonly Queue<string> tail = new Queue<string>();
        volatile bool quitting;
        readonly SynchronizationContext ui;

        public AppContext()
        {
            splash.FormClosed += delegate { };
            splash.Show();
            ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
            Thread t = new Thread(Boot);
            t.IsBackground = true;
            t.Start();
        }

        void Ui(Action a) { ui.Post(delegate { try { a(); } catch { } }, null); }

        void Log(string line)
        {
            lock (logLock)
            {
                tail.Enqueue(line);
                while (tail.Count > 18) tail.Dequeue();
                try { if (log != null) { log.WriteLine(line); log.Flush(); } } catch { }
            }
        }

        void OpenLog()
        {
            try
            {
                Directory.CreateDirectory(Core.LogDir);
                if (File.Exists(Core.LogFile)) File.Copy(Core.LogFile, Path.Combine(Core.LogDir, "castdeck.prev.log"), true);
                log = new StreamWriter(Core.LogFile, false, new UTF8Encoding(false));
                log.WriteLine("=== CastDeck " + Info.Version + " · " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " ===");
            }
            catch { }
        }

        static string BuildId()
        {
            string id = Res.Text("buildid");
            return id == "" ? Info.Version : id;
        }

        // extrai o servidor embutido para %LOCALAPPDATA%\CastDeck\app (só na 1ª vez de cada versão)
        string Extract()
        {
            string id = BuildId();
            string dir = Path.Combine(Core.Data, "app");
            Directory.CreateDirectory(dir);
            string target = Path.Combine(dir, "castdeck-server-" + id + ".exe");
            using (Stream s = Res.Open("server.bin"))
            {
                if (s == null) throw new Exception(Core.L("Servidor embutido não encontrado.", "Embedded server not found.", "No se encontró el servidor integrado."));
                if (File.Exists(target) && new FileInfo(target).Length == s.Length) return target;
                splash.SetStatus(Core.L("Preparando a primeira execução…", "Preparing first run…", "Preparando la primera ejecución…"));
                string tmp = target + ".tmp";
                using (FileStream f = File.Create(tmp)) s.CopyTo(f, 1 << 20);
                if (File.Exists(target)) File.Delete(target);
                File.Move(tmp, target);
            }
            // remove versões antigas
            foreach (string old in Directory.GetFiles(dir, "castdeck-server-*.exe"))
                if (!string.Equals(old, target, StringComparison.OrdinalIgnoreCase)) { try { File.Delete(old); } catch { } }
            return target;
        }

        static string Friendly(string line)
        {
            if (line.Contains("verificando FFmpeg")) return Core.L("Verificando FFmpeg e aceleração de vídeo…", "Checking FFmpeg and video acceleration…", "Verificando FFmpeg y aceleración de video…");
            if (line.Contains("[boot] FFmpeg")) return Core.L("Codificadores de vídeo prontos", "Video encoders ready", "Codificadores de video listos");
            if (line.Contains("baixando")) return Core.L("Baixando componentes…", "Downloading components…", "Descargando componentes…");
            if (line.Contains("CastDeck Local pronto")) return Core.L("Abrindo o estúdio…", "Opening the studio…", "Abriendo el estudio…");
            return null;
        }

        void Boot()
        {
            try
            {
                OpenLog();
                if (Core.Healthy(800))
                {
                    // servidor já rodando: só reaproveita se for deste mesmo build. Um servidor de outra versão que
                    // ficou aberto (janela fechada, processo órfão) faria a versão nova abrir com o código antigo.
                    string health = "";
                    try { health = Core.Http("GET", "/api/health", 1500); } catch { }
                    string mine = "castdeck-server-" + BuildId() + ".exe";
                    bool same = health.IndexOf("\"exe\":\"" + mine + "\"", StringComparison.OrdinalIgnoreCase) >= 0;
                    // servidor pelo terminal (node.exe) é reaproveitado; versão anterior à 1.2.20 não manda "exe" e
                    // por isso cai como "outra versão"
                    bool dev = health.IndexOf("\"exe\":\"node", StringComparison.OrdinalIgnoreCase) >= 0;
                    bool live = health.Length > 0 && !health.Contains("\"live\":0");
                    if (same || dev || live)
                    {
                        // live: nunca derruba uma transmissão em andamento só para trocar de versão
                        Log("[launcher] servidor já ativo em " + Core.Url + (same ? "" : dev ? " (terminal)" : " (outra versão, ao vivo: mantido)"));
                        StartWindow();
                        return;
                    }
                    Log("[launcher] servidor de outra versão em " + Core.Url + ": encerrando para abrir " + mine);
                    splash.SetStatus(Core.L("Fechando a versão anterior…", "Closing the previous version…", "Cerrando la versión anterior…"));
                    try { Core.Http("POST", "/api/quit", 2000); } catch { }
                    for (int i = 0; i < 40 && Core.Healthy(500); i++) Thread.Sleep(250);
                    if (Core.Healthy(500))
                    {
                        Log("[launcher] o servidor anterior não fechou; abrindo a janela com ele");
                        StartWindow();
                        return;
                    }
                }
                splash.SetStatus(Core.L("Carregando…", "Loading…", "Cargando…"));
                string exe = Extract();
                splash.SetStatus(Core.L("Iniciando o servidor local…", "Starting the local server…", "Iniciando el servidor local…"));
                ProcessStartInfo si = new ProcessStartInfo(exe);
                si.UseShellExecute = false;
                si.CreateNoWindow = true;
                si.WindowStyle = ProcessWindowStyle.Hidden;
                si.RedirectStandardOutput = true;
                si.RedirectStandardError = true;
                si.StandardOutputEncoding = Encoding.UTF8;
                si.StandardErrorEncoding = Encoding.UTF8;
                si.WorkingDirectory = Core.Data;
                si.EnvironmentVariables["NO_OPEN"] = "1";
                si.EnvironmentVariables["CASTDECK_LAUNCHER"] = "1";
                si.EnvironmentVariables["PORT"] = Core.Port.ToString();
                // atualização dentro do app: o servidor precisa saber qual arquivo substituir
                si.EnvironmentVariables["CASTDECK_EXE"] = Application.ExecutablePath;
                string b = Core.Browser();
                if (b != "") { si.EnvironmentVariables["CD_BROWSER"] = b; si.EnvironmentVariables["CD_PROFILE"] = Core.Profile; }
                server = new Process();
                server.StartInfo = si;
                server.EnableRaisingEvents = true;
                DataReceivedEventHandler onLine = delegate(object o, DataReceivedEventArgs e)
                {
                    if (e.Data == null) return;
                    Log(e.Data);
                    string f = Friendly(e.Data);
                    if (f != null) splash.SetStatus(f);
                };
                server.OutputDataReceived += onLine;
                server.ErrorDataReceived += onLine;
                server.Exited += delegate
                {
                    if (quitting) return;
                    int code = -1;
                    try { code = server.ExitCode; } catch { }
                    if (code == 0) Ui(delegate { Quit(false); }); // encerrou normalmente (ex.: /api/quit)
                    else Ui(ServerDied);
                };
                server.Start();
                bool inJob = KillJob.Add(server);
                server.BeginOutputReadLine();
                server.BeginErrorReadLine();
                Log("[launcher] servidor iniciado (pid " + server.Id + (inJob ? ", job" : ", sem job") + ")");

                DateTime limit = DateTime.Now.AddSeconds(90);
                while (!Core.Healthy(1000))
                {
                    if (quitting || server.HasExited) return;
                    if (DateTime.Now > limit) throw new Exception(Core.L("O servidor não respondeu em 90 s.", "The server did not respond within 90 s.", "El servidor no respondió en 90 s."));
                    Thread.Sleep(250);
                }
                StartWindow();
            }
            catch (Exception ex)
            {
                Log("[launcher] erro: " + ex);
                Ui(delegate { Fatal(Core.L("Não foi possível iniciar o CastDeck.", "Could not start CastDeck.", "No se pudo iniciar CastDeck.") + "\n\n" + ex.Message); });
            }
        }

        void StartWindow()
        {
            string mode = Core.OpenMode();
            Ui(CreateTray);
            if (mode == "none")
            {
                splash.FadeOut();
                Ui(delegate { Balloon(Core.L("O CastDeck está rodando na bandeja. Clique no ícone para abrir.", "CastDeck is running in the tray. Click the icon to open it.", "CastDeck se está ejecutando en la bandeja. Haz clic en el icono para abrirlo.")); });
                return;
            }
            if (mode == "browser")
            {
                try { Process.Start(Core.Url); } catch { }
                Thread.Sleep(1500);
                splash.FadeOut();
                return;
            }
            splash.SetStatus(Core.L("Abrindo o estúdio…", "Opening the studio…", "Abriendo el estudio…"));
            window = Core.OpenWindow(true);
            windowStarted = DateTime.Now;
            if (window != null)
            {
                window.EnableRaisingEvents = true;
                window.Exited += delegate { Ui(WindowClosed); };
                // espera a janela aparecer de verdade (até 12 s) antes de sumir com a splash
                DateTime lim = DateTime.Now.AddSeconds(12);
                while (DateTime.Now < lim)
                {
                    try { window.Refresh(); if (window.HasExited || window.MainWindowHandle != IntPtr.Zero) break; } catch { break; }
                    Thread.Sleep(150);
                }
                Thread.Sleep(600);
            }
            splash.FadeOut();
        }

        void WindowClosed()
        {
            // o Edge às vezes entrega a janela para uma instância já aberta e sai na hora: aí fica na bandeja
            if (quitting) return;
            if ((DateTime.Now - windowStarted).TotalSeconds < 4)
            {
                Balloon(Core.L("O CastDeck continua na bandeja. Use \"Sair\" para encerrar.", "CastDeck is still in the tray. Use \"Quit\" to close it.", "CastDeck sigue en la bandeja. Usa \"Salir\" para cerrarlo."));
                return;
            }
            Quit(false);
        }

        void CreateTray()
        {
            if (tray != null) return;
            tray = new NotifyIcon();
            try { tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { tray.Icon = SystemIcons.Application; }
            tray.Text = "CastDeck";
            ContextMenuStrip menu = new ContextMenuStrip();
            ToolStripMenuItem open = new ToolStripMenuItem(Core.L("Abrir estúdio", "Open studio", "Abrir estudio"), null, delegate { ReopenWindow(); });
            open.Font = new Font(open.Font, FontStyle.Bold);
            menu.Items.Add(open);
            menu.Items.Add(new ToolStripMenuItem(Core.L("Abrir no navegador", "Open in browser", "Abrir en el navegador"), null, delegate { try { Process.Start(Core.Url); } catch { } }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem(Core.L("Pasta das gravações", "Recordings folder", "Carpeta de grabaciones"), null, delegate { try { Core.AllowSetForegroundWindow(-1); } catch { } ThreadPool.QueueUserWorkItem(delegate { try { Core.Http("POST", "/api/recordings/open-folder", 4000); } catch { } }); }));
            menu.Items.Add(new ToolStripMenuItem(Core.L("Ver log", "View log", "Ver log"), null, delegate { try { Process.Start("notepad.exe", "\"" + Core.LogFile + "\""); } catch { } }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(new ToolStripMenuItem(Core.L("Sair do CastDeck", "Quit CastDeck", "Salir de CastDeck"), null, delegate { Quit(true); }));
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { ReopenWindow(); };
            tray.Visible = true;
        }

        void Balloon(string msg)
        {
            if (tray == null) return;
            try { tray.ShowBalloonTip(4000, "CastDeck", msg, ToolTipIcon.Info); } catch { }
        }

        void ReopenWindow()
        {
            Process p = Core.OpenWindow(false);
            if (p != null && (window == null || window.HasExited))
            {
                window = p;
                windowStarted = DateTime.Now;
                window.EnableRaisingEvents = true;
                window.Exited += delegate { Ui(WindowClosed); };
            }
        }

        void ServerDied()
        {
            string t;
            lock (logLock) t = string.Join("\n", tail.ToArray());
            Fatal(Core.L("O servidor do CastDeck parou inesperadamente.\n\nÚltimas linhas do log:\n", "The CastDeck server stopped unexpectedly.\n\nLast log lines:\n", "El servidor de CastDeck se detuvo inesperadamente.\n\nÚltimas líneas del log:\n") + t + Core.L("\n\nLog completo: ", "\n\nFull log: ", "\n\nLog completo: ") + Core.LogFile);
        }

        void Fatal(string msg)
        {
            splash.FadeOut();
            MessageBox.Show(msg, "CastDeck", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Quit(false);
        }

        void Quit(bool ask)
        {
            if (quitting) return;
            if (ask)
            {
                bool live = false;
                try { live = !Core.Http("GET", "/api/health", 1500).Contains("\"live\":0"); } catch { }
                if (live && MessageBox.Show(Core.L("Há uma transmissão ou gravação em andamento.\nEncerrar o CastDeck mesmo assim?", "A stream or recording is in progress.\nQuit CastDeck anyway?", "Hay una transmisión o grabación en curso.\n¿Cerrar CastDeck de todos modos?"), "CastDeck", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            }
            quitting = true;
            if (tray != null) { tray.Visible = false; tray.Dispose(); tray = null; }
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    if (server != null && !server.HasExited)
                    {
                        try { Core.Http("POST", "/api/quit", 2000); } catch { }
                        if (!server.WaitForExit(5000)) { try { server.Kill(); } catch { } }
                    }
                    if (window != null && !window.HasExited)
                    {
                        // fecha a janela do estúdio (perfil próprio do CastDeck: não afeta o Edge do usuário)
                        try { window.CloseMainWindow(); } catch { }
                        try { if (!window.WaitForExit(2500)) window.Kill(); } catch { }
                    }
                }
                catch { }
                Log("[launcher] encerrado");
                lock (logLock) { try { if (log != null) log.Dispose(); } catch { } log = null; }
                Ui(ExitThread);
            });
        }
    }
}
