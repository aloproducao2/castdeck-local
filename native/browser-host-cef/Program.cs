using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using CefSharp;
using CefSharp.OffScreen;

// Spike local do BrowserHost CEF: renderiza uma URL offscreen e grava quadros JPEG.
// Uso: browser-host-cef <url> <width> <height> <segundos> <outdir> [fps]
// Pipe: browser-host-cef --pipe <url> <width> <height> [fps] (quadros no stdout)
if (args.Length >= 5 && args[0] == "--shared-pipe")
{
    return BrowserHostCef.SharedPipeMode.Run(args[1], int.Parse(args[2]), int.Parse(args[3]), args.Length > 4 ? int.Parse(args[4]) : 60, args.Length > 5 ? args[5] : "pt-BR", args.Length <= 6 || args[6] != "0");
}
if (args.Length >= 7 && args[0] == "--shared")
{
    return BrowserHostCef.SharedMode.Run(args[1], int.Parse(args[2]), int.Parse(args[3]), int.Parse(args[4]), args[5], args.Length > 6 ? int.Parse(args[6]) : 30);
}
if (args.Length >= 5 && args[0] == "--pipe")
{
    return BrowserHostCef.PipeMode.Run(args[1], int.Parse(args[2]), int.Parse(args[3]), args.Length > 4 ? int.Parse(args[4]) : 30);
}
if (args.Length < 5)
{
    Console.Error.WriteLine("uso: browser-host-cef <url> <width> <height> <segundos> <outdir> [fps]");
    return 2;
}

var url = args[0];
var width = Math.Clamp(int.Parse(args[1]), 320, 3840);
var height = Math.Clamp(int.Parse(args[2]), 180, 2160);
var seconds = Math.Clamp(double.Parse(args[3]), 1, 120);
var outDir = Path.GetFullPath(args[4]);
var fps = Math.Clamp(args.Length > 5 ? int.Parse(args[5]) : 30, 5, 60);
Directory.CreateDirectory(outDir);

var cache = Path.Combine(Path.GetTempPath(), "castdeck-cef-" + Environment.ProcessId);
Directory.CreateDirectory(cache);
var settings = new CefSettings
{
    WindowlessRenderingEnabled = true,
    CachePath = cache,
    LogSeverity = LogSeverity.Info,
    LogFile = Path.Combine(outDir, "cef.log"),
    MultiThreadedMessageLoop = false,
};
settings.CefCommandLineArgs["no-sandbox"] = "1";
settings.CefCommandLineArgs["disable-gpu"] = "1";
settings.CefCommandLineArgs["disable-frame-rate-limit"] = "1";
settings.CefCommandLineArgs["disable-gpu-vsync"] = "1";
settings.CefCommandLineArgs["disable-background-timer-throttling"] = "1";
settings.CefCommandLineArgs["disable-renderer-backgrounding"] = "1";
settings.CefCommandLineArgs["disable-backgrounding-occluded-windows"] = "1";
settings.CefCommandLineArgs["disable-features"] = "CalculateNativeWinOcclusion";
CefSharpSettings.ShutdownOnExit = false;
if (!Cef.Initialize(settings, performDependencyCheck: true, browserProcessHandler: null))
{
    Console.Error.WriteLine("CEF initialize falhou");
    return 3;
}

var frames = 0;
var paints = 0;
var drops = 0;
var started = DateTime.UtcNow;
var last = DateTime.MinValue;
var minGap = TimeSpan.FromSeconds(1.0 / fps);
var queue = new BlockingCollection<Frame>(2);
var encoder = Task.Run(() =>
{
    foreach (var f in queue.GetConsumingEnumerable())
    {
        try
        {
            using var bmp = new Bitmap(f.Width, f.Height, PixelFormat.Format32bppArgb);
            var data = bmp.LockBits(new Rectangle(0, 0, f.Width, f.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            Marshal.Copy(f.Data, 0, data.Scan0, f.Data.Length);
            bmp.UnlockBits(data);
            var n = Interlocked.Increment(ref frames);
            var path = Path.Combine(outDir, $"frame-{n:00000}.jpg");
            bmp.Save(path, ImageFormat.Jpeg);
            Console.WriteLine($"FRAME {n} {f.Width}x{f.Height} {path}");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("paint: " + ex.Message);
        }
    }
});

var browser = new ChromiumWebBrowser(url)
{
    Size = new Size(width, height),
};
browser.Paint += (_, e) =>
{
    if (e.IsPopup || e.Width <= 0 || e.Height <= 0 || e.BufferHandle == IntPtr.Zero) return;
    var now = DateTime.UtcNow;
    if (now - last < minGap) return;
    last = now;
    try
    {
        var bytes = new byte[e.Width * e.Height * 4];
        Marshal.Copy(e.BufferHandle, bytes, 0, bytes.Length);
        Interlocked.Increment(ref paints);
        if (!queue.TryAdd(new Frame(bytes, e.Width, e.Height))) Interlocked.Increment(ref drops); // lotado: descarta
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine("paint copy: " + ex.Message);
    }
};
browser.BrowserInitialized += (_, _) =>
{
    try { browser.GetBrowserHost().WindowlessFrameRate = fps; } catch (Exception ex) { Console.Error.WriteLine("fps: " + ex.Message); }
};
browser.LoadingStateChanged += (_, e) =>
{
    if (!e.IsLoading) Console.WriteLine($"LOADED {url}");
};
browser.LoadError += (_, e) => Console.Error.WriteLine($"LOADERR {e.ErrorCode} {e.ErrorText}");

while ((DateTime.UtcNow - started).TotalSeconds < seconds)
{
    Cef.DoMessageLoopWork();
    Thread.Sleep(1);
}
queue.CompleteAdding();
encoder.Wait();
Console.WriteLine($"DONE frames={frames} paints={paints} drops={drops} elapsed={(DateTime.UtcNow - started).TotalSeconds:F1}s");
browser.Dispose();
Cef.Shutdown();
try { Directory.Delete(cache, true); } catch { }
return frames > 0 ? 0 : 4;

record Frame(byte[] Data, int Width, int Height);
