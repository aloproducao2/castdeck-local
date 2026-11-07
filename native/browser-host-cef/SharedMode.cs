using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using CefSharp;
using CefSharp.OffScreen;
using CefSharp.Structs;
using Vortice.Direct3D;
using Vortice.Direct3D11;
using Vortice.DXGI;
using TurboJpegWrapper;

namespace BrowserHostCef;

// Experimento: CEF com textura compartilhada (D3D11), copiando a textura para
// staging e entregando BGRA ao mesmo encoder JPEG do modo de CPU.
internal static class SharedMode
{
    public static int Run(string url, int width, int height, int seconds, string outDir, int fps)
    {
        width = Math.Clamp(width, 320, 3840);
        height = Math.Clamp(height, 180, 2160);
        fps = Math.Clamp(fps, 5, 60);
        Directory.CreateDirectory(outDir);
        var cache = Path.Combine(Path.GetTempPath(), "castdeck-cef-shared-" + Environment.ProcessId);
        var settings = new CefSettings
        {
            WindowlessRenderingEnabled = true,
            CachePath = cache,
            LogFile = Path.Combine(outDir, "cef.log"),
            LogSeverity = LogSeverity.Info,
            MultiThreadedMessageLoop = false,
        };
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

        var d3d = D3D11.D3D11CreateDevice(null, DriverType.Hardware, DeviceCreationFlags.BgraSupport, null,
                out ID3D11Device device, out ID3D11DeviceContext context);
        if (d3d.Failure)
        {
            Console.Error.WriteLine("D3D11 device falhou");
            Cef.Shutdown();
            return 5;
        }
        Console.Error.WriteLine($"D3D11 {device.FeatureLevel}");

        var frames = 0;
        var paints = 0;
        long copyTicks = 0;
        long encodeTicks = 0;
        var encoded = 0;
        var started = DateTime.UtcNow;
        var queue = new BlockingCollection<Frame>(3);
        var writer = Task.Run(() =>
        {
            using var compressor = new TJCompressor();
            foreach (var f in queue.GetConsumingEnumerable())
            {
                var sw = System.Diagnostics.Stopwatch.StartNew();
                try
                {
                    var handle = GCHandle.Alloc(f.Data, GCHandleType.Pinned);
                    byte[] jpeg;
                    try { jpeg = compressor.Compress(handle.AddrOfPinnedObject(), f.Width * 4, f.Width, f.Height, TJPixelFormat.BGRA, TJSubsamplingOption.Chrominance420, 70, TJFlags.None); }
                    finally { handle.Free(); }
                    var n = Interlocked.Increment(ref frames);
                    File.WriteAllBytes(Path.Combine(outDir, $"frame-{n:00000}.jpg"), jpeg);
                    sw.Stop();
                    Interlocked.Add(ref encodeTicks, sw.ElapsedTicks);
                    Interlocked.Increment(ref encoded);
                    Console.WriteLine($"FRAME {n} {f.Width}x{f.Height}");
                }
                catch (Exception ex) { Console.Error.WriteLine("frame: " + ex.Message); }
            }
        });

        var browserSettings = new BrowserSettings { WindowlessFrameRate = 60 };
        var windowInfo = new WindowInfo();
        windowInfo.SetAsWindowless(IntPtr.Zero);
        windowInfo.SharedTextureEnabled = true;
        var browser = new ChromiumWebBrowser(url, browserSettings, null, false, null, false)
        {
            Size = new System.Drawing.Size(width, height),
        };
        var handler = new SharedRenderHandler(browser, device, context, queue, () => Interlocked.Increment(ref paints));
        browser.RenderHandler = handler;
        browser.LoadError += (_, e) => Console.Error.WriteLine($"LOADERR {e.ErrorCode} {e.ErrorText}");
        browser.LoadingStateChanged += (_, e) => { if (!e.IsLoading) Console.WriteLine($"LOADED {url}"); };
        browser.CreateBrowser(windowInfo, browserSettings);

        while ((DateTime.UtcNow - started).TotalSeconds < seconds)
        {
            Cef.DoMessageLoopWork();
            Thread.Sleep(1);
        }
        queue.CompleteAdding();
        writer.Wait(TimeSpan.FromSeconds(10));
        Console.WriteLine($"DONE frames={frames} paints={paints} encoded={encoded} copyMs={(copyTicks / (double)Math.Max(1, paints) / System.Diagnostics.Stopwatch.Frequency * 1000):F2} encodeMs={(encodeTicks / (double)Math.Max(1, encoded) / System.Diagnostics.Stopwatch.Frequency * 1000):F2} elapsed={(DateTime.UtcNow - started).TotalSeconds:F1}s");
        browser.Dispose();
        context.Dispose();
        device.Dispose();
        Cef.Shutdown();
        try { Directory.Delete(cache, true); } catch { }
        return frames > 0 ? 0 : 4;
    }

    private sealed class SharedRenderHandler : DefaultRenderHandler
    {
        private readonly ID3D11Device device;
        private readonly ID3D11DeviceContext context;
        private readonly BlockingCollection<Frame> queue;
        private readonly Action onPaint;
        private readonly Dictionary<(int, int), ID3D11Texture2D> staging = new();
        public SharedRenderHandler(ChromiumWebBrowser browser, ID3D11Device device, ID3D11DeviceContext context,
            BlockingCollection<Frame> queue, Action onPaint) : base(browser)
        {
            this.device = device;
            this.context = context;
            this.queue = queue;
            this.onPaint = onPaint;
        }

        public override void OnAcceleratedPaint(PaintElementType type, Rect dirtyRect, AcceleratedPaintInfo info)
        {
            if (type != PaintElementType.View || info.SharedTextureHandle == IntPtr.Zero) return;
            try
            {
                ID3D11Texture2D texture;
                try
                {
                    using var device1 = device.QueryInterface<ID3D11Device1>();
                    texture = device1.OpenSharedResource1<ID3D11Texture2D>(info.SharedTextureHandle);
                }
                catch
                {
                    texture = device.OpenSharedResource<ID3D11Texture2D>(info.SharedTextureHandle);
                }
                var desc = texture.Description;
                if (desc.Width <= 0 || desc.Height <= 0) return;
                var key = ((int)desc.Width, (int)desc.Height);
                if (!staging.TryGetValue(key, out var st))
                {
                    st = device.CreateTexture2D(new Texture2DDescription
                    {
                        Width = desc.Width,
                        Height = desc.Height,
                        MipLevels = 1,
                        ArraySize = 1,
                        Format = desc.Format,
                        SampleDescription = new SampleDescription(1, 0),
                        Usage = ResourceUsage.Staging,
                        BindFlags = BindFlags.None,
                        CPUAccessFlags = CpuAccessFlags.Read,
                        MiscFlags = ResourceOptionFlags.None,
                    });
                    staging[key] = st;
                }
                using var _texture = texture;
                context.CopyResource(st, texture);
                var map = context.Map(st, 0, MapMode.Read, Vortice.Direct3D11.MapFlags.None);
                try
                {
                    var w = (int)desc.Width;
                    var h = (int)desc.Height;
                    var row = w * 4;
                    var bytes = new byte[row * h];
                    for (var y = 0; y < h; y++)
                        Marshal.Copy(map.DataPointer + y * (int)map.RowPitch, bytes, y * row, row);
                    onPaint();
                    queue.TryAdd(new Frame(bytes, w, h));
                }
                finally { context.Unmap(st, 0); }
            }
            catch (Exception ex) { Console.Error.WriteLine("accelerated: " + ex.Message); }
        }

    }

    private static void SaveJpeg(Bitmap bmp, string path, long quality)
    {
        var enc = ImageCodecInfo.GetImageEncoders().First(x => x.FormatID == ImageFormat.Jpeg.Guid);
        using var p = new EncoderParameters(1);
        p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
        bmp.Save(path, enc, p);
    }

    private sealed record Frame(byte[] Data, int Width, int Height);
}
