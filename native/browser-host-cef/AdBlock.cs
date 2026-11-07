using CefSharp;
using CefSharp.Handler;

namespace BrowserHostCef;

// Adblock básico para o BrowserHost CEF. Bloqueia hosts de anúncios/trackers
// conhecidos sem interceptar o vídeo do YouTube (googlevideo.com).
internal sealed class AdBlockRequestHandler : RequestHandler
{
    protected override IResourceRequestHandler? GetResourceRequestHandler(
        IWebBrowser chromiumWebBrowser, IBrowser browser, IFrame frame, IRequest request,
        bool isNavigation, bool isDownload, string requestInitiator, ref bool disableDefaultHandling)
        => new AdBlockResourceRequestHandler();

    private sealed class AdBlockResourceRequestHandler : ResourceRequestHandler
    {
        protected override CefReturnValue OnBeforeResourceLoad(
            IWebBrowser chromiumWebBrowser, IBrowser browser, IFrame frame, IRequest request,
            IRequestCallback callback)
        {
            try
            {
                if (AdBlockRules.IsBlocked(request.Url)) return CefReturnValue.Cancel;
            }
            catch { }
            return CefReturnValue.Continue;
        }
    }
}

internal static class AdBlockRules
{
    // Sufixos de host usados por anúncios/trackers comuns.
    private static readonly string[] Hosts =
    {
        "doubleclick.net", "googlesyndication.com", "googleadservices.com",
        "adservice.google.com", "pagead2.googlesyndication.com", "tpc.googlesyndication.com",
        "amazon-adsystem.com", "adnxs.com", "rubiconproject.com", "pubmatic.com",
        "criteo.com", "criteo.net", "taboola.com", "outbrain.com", "revcontent.com",
        "scorecardresearch.com", "quantserve.com", "moatads.com", "adsrvr.org",
        "yieldmo.com", "sharethrough.com", "teads.tv", "smartadserver.com",
        "youtube.com/api/stats/ads", "youtube.com/pagead/", "youtube.com/ptracking",
        "googleads.g.doubleclick.net", "static.doubleclick.net",
    };

    public static bool IsBlocked(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return false;
        var host = u.Host.ToLowerInvariant();
        foreach (var rule in Hosts)
        {
            if (rule.Contains('/'))
            {
                if (url.IndexOf(rule, StringComparison.OrdinalIgnoreCase) >= 0) return true;
            }
            else if (host == rule || host.EndsWith("." + rule, StringComparison.Ordinal))
            {
                return true;
            }
        }
        return false;
    }
}
