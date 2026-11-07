using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using CefSharp;
using CefSharp.OffScreen;

namespace BrowserHostCef;

internal static class PipeMode
{
    public static int Run(string url, int width, int height, int fps)
    {
        width = Math.Clamp(width, 320, 3840);
        height = Math.Clamp(height, 180, 2160);
        fps = Math.Clamp(fps, 5, 60);

        var cache = Path.Combine(Path.GetTempPath(), "castdeck-cef-pipe-" + Environment.ProcessId);
        var outDir = Path.GetTempPath();
        var settings = new CefSettings
        {
            WindowlessRenderingEnabled = true,
            CachePath = cache,
            LogFile = Path.Combine(outDir, "castdeck-cef-pipe.log"),
            LogSeverity = LogSeverity.Info,
            MultiThreadedMessageLoop = false,
        };
        settings.CefCommandLineArgs["disable-gpu"] = "1";
        settings.CefCommandLineArgs["no-sandbox"] = "1";
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

        var queue = new BlockingCollection<Frame>(3);
        var stdout = Console.OpenStandardOutput();
        var lastPaint = DateTime.MinValue;
        var minGap = TimeSpan.FromSeconds(1.0 / fps);
        var writer = Task.Run(() =>
        {
            foreach (var f in queue.GetConsumingEnumerable())
            {
                try
                {
                    using var bmp = new Bitmap(f.Width, f.Height, PixelFormat.Format32bppArgb);
                    var data = bmp.LockBits(new Rectangle(0, 0, f.Width, f.Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                    Marshal.Copy(f.Data, 0, data.Scan0, f.Data.Length);
                    bmp.UnlockBits(data);
                    using var ms = new MemoryStream();
                    bmp.Save(ms, ImageFormat.Jpeg);
                    var bytes = ms.ToArray();
                    stdout.Write(BitConverter.GetBytes(bytes.Length), 0, 4);
                    stdout.Write(bytes, 0, bytes.Length);
                    stdout.Flush();
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("frame: " + ex.Message);
                }
            }
        });

        var browser = new ChromiumWebBrowser(url) { Size = new Size(width, height) };
        browser.BrowserInitialized += (_, _) =>
        {
            try { browser.GetBrowserHost().WindowlessFrameRate = fps; }
            catch (Exception ex) { Console.Error.WriteLine("fps: " + ex.Message); }
        };
        browser.Paint += (_, e) =>
        {
            if (e.IsPopup || e.Width <= 0 || e.Height <= 0 || e.BufferHandle == IntPtr.Zero) return;
            var now = DateTime.UtcNow;
            if (now - lastPaint < minGap) return;
            lastPaint = now;
            var bytes = new byte[e.Width * e.Height * 4];
            Marshal.Copy(e.BufferHandle, bytes, 0, bytes.Length);
            queue.TryAdd(new Frame(bytes, e.Width, e.Height));
        };
        browser.LoadError += (_, e) => Console.Error.WriteLine($"load: {e.ErrorCode} {e.ErrorText}");
        browser.LoadingStateChanged += (_, e) =>
        {
            if (!e.IsLoading) Console.Error.WriteLine($"loaded: {url}");
        };

        var stop = false;
        var stdin = Task.Run(() =>
        {
            try
            {
                var input = Console.OpenStandardInput();
                var buf = new byte[1];
                while (input.Read(buf, 0, 1) > 0) { }
            }
            catch { }
            stop = true;
        });

        while (!stop)
        {
            Cef.DoMessageLoopWork();
            Thread.Sleep(1);
        }

        queue.CompleteAdding();
        writer.Wait(TimeSpan.FromSeconds(10));
        browser.Dispose();
        Cef.Shutdown();
        try { Directory.Delete(cache, true); } catch { }
        return 0;
    }

    private sealed record Frame(byte[] Data, int Width, int Height);
}
