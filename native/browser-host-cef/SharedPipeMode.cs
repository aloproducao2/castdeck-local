using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text.Json;
using CefSharp;
using CefSharp.Enums;
using CefSharp.Handler;
using CefSharp.OffScreen;
using CefSharp.Structs;
using TurboJpegWrapper;
using Vortice.Direct3D;
using Vortice.Direct3D11;
using Vortice.DXGI;

namespace BrowserHostCef;

// CEF shared texture + TurboJPEG em modo pipe:
// stdout = [uint32 little-endian tamanho][JPEG] por quadro.
internal static class SharedPipeMode
{
    public static int Run(string url, int width, int height, int fps, string locale = "pt-BR", bool adblock = true)
    {
        width = Math.Clamp(width, 320, 3840);
        height = Math.Clamp(height, 180, 2160);
        fps = Math.Clamp(fps, 5, 60);
        var cache = Path.Combine(Path.GetTempPath(), "castdeck-cef-pipe-" + Environment.ProcessId);
        locale = System.Text.RegularExpressions.Regex.IsMatch(locale ?? "", "^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$") ? locale : "pt-BR";
        var settings = new CefSettings
        {
            WindowlessRenderingEnabled = true,
            CachePath = cache,
            LogFile = Path.Combine(Path.GetTempPath(), "castdeck-cef-pipe.log"),
            LogSeverity = LogSeverity.Info,
            Locale = locale,
            AcceptLanguageList = locale,
            MultiThreadedMessageLoop = false,
        };
        settings.CefCommandLineArgs["no-sandbox"] = "1";
        settings.CefCommandLineArgs["autoplay-policy"] = "no-user-gesture-required";
        settings.CefCommandLineArgs["disable-background-timer-throttling"] = "1";
        settings.CefCommandLineArgs["disable-renderer-backgrounding"] = "1";
        settings.CefCommandLineArgs["disable-backgrounding-occluded-windows"] = "1";
        settings.CefCommandLineArgs["disable-features"] = "CalculateNativeWinOcclusion";
        settings.EnableAudio();
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

        var queue = new BlockingCollection<Frame>(4);
        var stdout = Console.OpenStandardOutput();
        var outputLock = new object();
        var writer = Task.Run(() =>
        {
            using var compressor = new TJCompressor();
            foreach (var f in queue.GetConsumingEnumerable())
            {
                try
                {
                    var handle = GCHandle.Alloc(f.Data, GCHandleType.Pinned);
                    byte[] jpeg;
                    try
                    {
                        jpeg = compressor.Compress(handle.AddrOfPinnedObject(), f.Width * 4, f.Width, f.Height,
                            TJPixelFormat.BGRA, TJSubsamplingOption.Chrominance420, 70, TJFlags.None);
                    }
                    finally { handle.Free(); }
                    Write(stdout, outputLock, 1, jpeg);
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
            AudioHandler = new CefAudio(stdout, outputLock),
            RequestHandler = adblock ? new AdBlockRequestHandler() : null,
        };
        var paints = 0;
        var handler = new SharedRenderHandler(browser, device, context, queue, () => Interlocked.Increment(ref paints));
        browser.RenderHandler = handler;
        browser.LoadError += (_, e) => Console.Error.WriteLine($"LOADERR {e.ErrorCode} {e.ErrorText}");
        browser.LoadingStateChanged += (_, e) => { if (!e.IsLoading) Console.Error.WriteLine($"LOADED {url}"); };
        browser.CreateBrowser(windowInfo, browserSettings);

        var stop = false;
        _ = Task.Run(async () =>
        {
            try
            {
                using var reader = new StreamReader(Console.OpenStandardInput());
                string? line;
                while ((line = await reader.ReadLineAsync()) != null)
                {
                    if (!string.IsNullOrWhiteSpace(line)) HandleInput(browser, line);
                }
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
        Console.Error.WriteLine($"DONE paints={paints}");
        browser.Dispose();
        context.Dispose();
        device.Dispose();
        Cef.Shutdown();
        try { Directory.Delete(cache, true); } catch { }
        return 0;
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
                using var _texture = texture;
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

    private static void Write(Stream output, object lockObj, byte type, byte[] payload)
    {
        lock (lockObj)
        {
            output.WriteByte(type);
            output.Write(BitConverter.GetBytes(payload.Length), 0, 4);
            output.Write(payload, 0, payload.Length);
            output.Flush();
        }
    }

    private sealed class CefAudio : AudioHandler
    {
        private readonly Stream output;
        private readonly object lockObj;
        private int channels = 2;

        public CefAudio(Stream output, object lockObj) { this.output = output; this.lockObj = lockObj; }

        protected override bool GetAudioParameters(IWebBrowser browser, IBrowser browser2, ref AudioParameters parameters)
        {
            parameters = new AudioParameters(ChannelLayout.LayoutStereo, 48000, 480);
            return true;
        }

        protected override void OnAudioStreamStarted(IWebBrowser browser, IBrowser browser2, AudioParameters parameters, int channels)
        {
            this.channels = Math.Max(1, channels);
        }

        protected override void OnAudioStreamPacket(IWebBrowser browser, IBrowser browser2, IntPtr data, int noOfFrames, long pts)
        {
            if (data == IntPtr.Zero || noOfFrames <= 0) return;
            var ptrs = new IntPtr[channels];
            Marshal.Copy(data, ptrs, 0, channels);
            var channelData = new float[channels][];
            for (var c = 0; c < channels; c++)
            {
                channelData[c] = new float[noOfFrames];
                Marshal.Copy(ptrs[c], channelData[c], 0, noOfFrames);
            }
            var pcm = new byte[noOfFrames * 2 * 2];
            for (var i = 0; i < noOfFrames; i++)
            {
                for (var c = 0; c < 2; c++)
                {
                    var src = c < channels ? channelData[c][i] : 0f;
                    var v = Math.Clamp(src, -1f, 1f);
                    var sample = (short)Math.Round(v * 32767f);
                    var o = (i * 2 + c) * 2;
                    pcm[o] = (byte)(sample & 0xff);
                    pcm[o + 1] = (byte)((sample >> 8) & 0xff);
                }
            }
            Write(output, lockObj, 0, pcm);
        }
    }

    private static void HandleInput(ChromiumWebBrowser browser, string line)
    {
        try
        {
            if (!browser.IsBrowserInitialized) return;
            using var doc = JsonDocument.Parse(line);
            var e = doc.RootElement;
            var kind = e.TryGetProperty("kind", out var k) ? k.GetString() : "";
            if (kind == "mouse")
            {
                var type = e.TryGetProperty("type", out var t) ? t.GetString() : "";
                var x = (int)(e.TryGetProperty("x", out var xv) ? xv.GetDouble() : 0);
                var y = (int)(e.TryGetProperty("y", out var yv) ? yv.GetDouble() : 0);
                var me = new MouseEvent(x, y, CefEventFlags.None);
                var host = browser.GetBrowserHost();
                if (type == "mousePressed") host.SendMouseClickEvent(me, MouseButtonType.Left, false, 1);
                else if (type == "mouseReleased") host.SendMouseClickEvent(me, MouseButtonType.Left, true, 1);
                else if (type == "mouseMoved") host.SendMouseMoveEvent(me, false);
                else if (type == "mouseWheel")
                {
                    var dx = (int)(e.TryGetProperty("deltaX", out var dxv) ? dxv.GetDouble() : 0);
                    var dy = (int)(e.TryGetProperty("deltaY", out var dyv) ? dyv.GetDouble() : 0);
                    try
                    {
                        var js = "(()=>{const t=document.elementFromPoint(" + x + "," + y + ");let n=t;while(n&&n!==document.body&&n!==document.documentElement){if(n.scrollHeight>n.clientHeight+1){n.scrollBy(0," + dy + ");return true;}n=n.parentElement;}window.scrollBy(0," + dy + ");return true})()";
                        browser.ExecuteScriptAsync(js);
                    }
                    catch (Exception ex) { Console.Error.WriteLine("wheel js err: " + ex.Message); }
                }
            }
            else if (kind == "text")
            {
                var text = e.TryGetProperty("text", out var tv) ? tv.GetString() : "";
                if (!string.IsNullOrEmpty(text)) InsertText(browser, text);
            }
            else if (kind == "key" && e.TryGetProperty("type", out var kt) && kt.GetString() == "keyDown")
            {
                var text = e.TryGetProperty("text", out var tv2) ? tv2.GetString() : "";
                if (!string.IsNullOrEmpty(text)) InsertText(browser, text);
            }
        }
        catch (Exception ex) { Console.Error.WriteLine("input: " + ex.Message); }
    }

    private static void InsertText(ChromiumWebBrowser browser, string text)
    {
        var js = "document.execCommand(\"insertText\",false," + JsonSerializer.Serialize(text) + ")";
        browser.EvaluateScriptAsync(js);
    }

    private sealed record Frame(byte[] Data, int Width, int Height);
}
