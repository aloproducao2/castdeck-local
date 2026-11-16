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
        browser.BrowserInitialized += (_, _) =>
        {
            try { browser.GetBrowserHost()?.SendFocusEvent(true); } catch { }
        };
        browser.LoadError += (_, e) => Console.Error.WriteLine($"LOADERR {e.ErrorCode} {e.ErrorText}");
        browser.LoadingStateChanged += (_, e) =>
        {
            if (!e.IsLoading)
            {
                Console.Error.WriteLine($"LOADED {url}");
                try { browser.GetBrowserHost()?.SendFocusEvent(true); } catch { }
            }
        };
        browser.CreateBrowser(windowInfo, browserSettings);

        var inputQueue = new ConcurrentQueue<string>();
        var stop = false;
        _ = Task.Run(async () =>
        {
            try
            {
                using var reader = new StreamReader(Console.OpenStandardInput());
                string? line;
                while ((line = await reader.ReadLineAsync()) != null)
                {
                    if (!string.IsNullOrWhiteSpace(line)) inputQueue.Enqueue(line);
                }
            }
            catch { }
            stop = true;
        });

        while (!stop)
        {
            while (inputQueue.TryDequeue(out var cmd)) HandleInput(browser, cmd);
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
            var host = browser.GetBrowserHost();
            var mods = ParseMods(e);
            if (kind == "mouse")
            {
                var type = e.TryGetProperty("type", out var t) ? t.GetString() : "";
                var x = (int)(e.TryGetProperty("x", out var xv) ? xv.GetDouble() : 0);
                var y = (int)(e.TryGetProperty("y", out var yv) ? yv.GetDouble() : 0);
                var btnName = e.TryGetProperty("button", out var bv) ? bv.GetString() : "left";
                var btn = btnName == "right" ? MouseButtonType.Right : btnName == "middle" ? MouseButtonType.Middle : MouseButtonType.Left;
                var clickCount = e.TryGetProperty("clickCount", out var ccv) && ccv.TryGetInt32(out var cc) ? Math.Clamp(cc, 1, 3) : 1;
                var me = new MouseEvent(x, y, mods);
                if (type == "mousePressed")
                {
                    host.SendFocusEvent(true);
                    host.SendMouseClickEvent(me, btn, false, clickCount);
                }
                else if (type == "mouseReleased")
                {
                    host.SendMouseClickEvent(me, btn, true, clickCount);
                }
                else if (type == "mouseMoved")
                {
                    host.SendMouseMoveEvent(me, false);
                }
                else if (type == "mouseWheel")
                {
                    var dx = (int)(e.TryGetProperty("deltaX", out var dxv) ? dxv.GetDouble() : 0);
                    var dy = (int)(e.TryGetProperty("deltaY", out var dyv) ? dyv.GetDouble() : 0);
                    try
                    {
                        var js = "(()=>{const t=document.elementFromPoint(" + x + "," + y + ");let n=t;while(n&&n!==document.body&&n!==document.documentElement){if(n.scrollHeight>n.clientHeight+1||n.scrollWidth>n.clientWidth+1){n.scrollBy(" + dx + "," + dy + ");return true;}n=n.parentElement;}window.scrollBy(" + dx + "," + dy + ");return true})()";
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
            else if (kind == "key")
            {
                var type = e.TryGetProperty("type", out var kt) ? kt.GetString() : "";
                var key = e.TryGetProperty("key", out var ky) ? (ky.GetString() ?? "") : "";
                var code = e.TryGetProperty("code", out var cd) ? (cd.GetString() ?? "") : "";
                var vk = e.TryGetProperty("keyCode", out var kcv) && kcv.TryGetInt32(out var kci) ? kci : 0;
                if (vk <= 0) vk = MapVirtualKey(key, code);
                var text = e.TryGetProperty("text", out var tv2) ? (tv2.GetString() ?? "") : "";

                if (type == "keyUp")
                {
                    if (vk > 0)
                    {
                        host.SendKeyEvent(new KeyEvent
                        {
                            Type = KeyEventType.KeyUp,
                            WindowsKeyCode = vk,
                            NativeKeyCode = BuildNativeKeyCode(vk, true),
                            Modifiers = mods,
                        });
                    }
                    return;
                }

                if (type != "keyDown" && type != "rawKeyDown") return;
                host.SendFocusEvent(true);

                // Teclas especiais (setas, Backspace, Delete, Enter, Home/End, PageUp/Down, Tab, Esc, atalhos Ctrl)
                // vão nativamente pelo SendKeyEvent para mover cursor, apagar, navegar e submeter formulários.
                var hasCtrlOrMeta = (mods & (CefEventFlags.ControlDown | CefEventFlags.CommandDown)) != 0;
                var hasAltOnly = (mods & CefEventFlags.AltDown) != 0 && !hasCtrlOrMeta;
                if (!string.IsNullOrEmpty(text) && text != "\r" && text != "\n" && !hasCtrlOrMeta && !hasAltOnly)
                {
                    // Caractere imprimível (inclui acentos PT-BR como ç, á, ã): despacha KeyDown + Char para acionar listeners e texto
                    var ch = text[0];
                    if (vk <= 0) vk = char.ToUpperInvariant(ch);
                    if (text.Length == 1 && ch <= 0xFFFF)
                    {
                        host.SendKeyEvent(new KeyEvent
                        {
                            Type = KeyEventType.RawKeyDown,
                            WindowsKeyCode = vk,
                            NativeKeyCode = BuildNativeKeyCode(vk, false),
                            Modifiers = mods,
                        });
                        host.SendKeyEvent(new KeyEvent
                        {
                            Type = KeyEventType.Char,
                            WindowsKeyCode = ch,
                            NativeKeyCode = ch,
                            Modifiers = mods,
                        });
                    }
                    else
                    {
                        InsertText(browser, text);
                    }
                    return;
                }

                if (vk > 0)
                {
                    host.SendKeyEvent(new KeyEvent
                    {
                        Type = KeyEventType.RawKeyDown,
                        WindowsKeyCode = vk,
                        NativeKeyCode = BuildNativeKeyCode(vk, false),
                        Modifiers = mods,
                    });
                    if (key == "Enter" || text == "\r" || text == "\n")
                    {
                        host.SendKeyEvent(new KeyEvent
                        {
                            Type = KeyEventType.Char,
                            WindowsKeyCode = '\r',
                            NativeKeyCode = '\r',
                            Modifiers = mods,
                        });
                    }
                    else if (key == "Tab" && !hasCtrlOrMeta)
                    {
                        // Tab já move o foco no RawKeyDown, não precisa de Char extra
                    }
                    else if (!string.IsNullOrEmpty(text) && text.Length == 1)
                    {
                        host.SendKeyEvent(new KeyEvent
                        {
                            Type = KeyEventType.Char,
                            WindowsKeyCode = text[0],
                            NativeKeyCode = text[0],
                            Modifiers = mods,
                        });
                    }
                }
                else if (!string.IsNullOrEmpty(text))
                {
                    InsertText(browser, text);
                }
            }
        }
        catch (Exception ex) { Console.Error.WriteLine("input: " + ex.Message); }
    }

    private static CefEventFlags ParseMods(JsonElement e)
    {
        var flags = CefEventFlags.None;
        if (!e.TryGetProperty("mods", out var m)) return flags;
        if (m.ValueKind == JsonValueKind.Number && m.TryGetInt32(out var mask))
        {
            if ((mask & 1) != 0) flags |= CefEventFlags.AltDown;
            if ((mask & 2) != 0) flags |= CefEventFlags.ControlDown;
            if ((mask & 4) != 0) flags |= CefEventFlags.CommandDown;
            if ((mask & 8) != 0) flags |= CefEventFlags.ShiftDown;
            return flags;
        }
        if (m.ValueKind == JsonValueKind.Object)
        {
            if (m.TryGetProperty("alt", out var av) && av.ValueKind == JsonValueKind.True) flags |= CefEventFlags.AltDown;
            if (m.TryGetProperty("ctrl", out var cv) && cv.ValueKind == JsonValueKind.True) flags |= CefEventFlags.ControlDown;
            if (m.TryGetProperty("meta", out var mv) && mv.ValueKind == JsonValueKind.True) flags |= CefEventFlags.CommandDown;
            if (m.TryGetProperty("shift", out var sv) && sv.ValueKind == JsonValueKind.True) flags |= CefEventFlags.ShiftDown;
        }
        return flags;
    }

    private static int BuildNativeKeyCode(int vk, bool isKeyUp)
    {
        // Marca bit extended (bit 24) para setas, Home/End, PageUp/Down e Insert/Delete como no Windows LPARAM
        var ext = vk is >= 33 and <= 40 or 45 or 46 ? (1 << 24) : 0;
        var up = isKeyUp ? ((1 << 30) | (1 << 31)) : 0;
        return 1 | ext | up;
    }

    private static int MapVirtualKey(string key, string code) => key switch
    {
        "Backspace" => 0x08,
        "Tab" => 0x09,
        "Enter" => 0x0D,
        "Shift" => 0x10,
        "Control" => 0x11,
        "Alt" => 0x12,
        "Escape" => 0x1B,
        " " or "Spacebar" => 0x20,
        "PageUp" => 0x21,
        "PageDown" => 0x22,
        "End" => 0x23,
        "Home" => 0x24,
        "ArrowLeft" => 0x25,
        "ArrowUp" => 0x26,
        "ArrowRight" => 0x27,
        "ArrowDown" => 0x28,
        "Insert" => 0x2D,
        "Delete" => 0x2E,
        _ when key.Length == 1 && key[0] is >= 'a' and <= 'z' => char.ToUpperInvariant(key[0]),
        _ when key.Length == 1 && key[0] is >= 'A' and <= 'Z' or >= '0' and <= '9' => key[0],
        _ when code.StartsWith("Key") && code.Length == 4 => code[3],
        _ when code.StartsWith("Digit") && code.Length == 6 => code[5],
        _ => 0,
    };

    private static void InsertText(ChromiumWebBrowser browser, string text)
    {
        var js = "document.execCommand(\"insertText\",false," + JsonSerializer.Serialize(text) + ")";
        browser.EvaluateScriptAsync(js);
    }

    private sealed record Frame(byte[] Data, int Width, int Height);
}
