param(
    [string]$SearchTitle = "CastDeck",
    [int]$Top = 1
)

$code = @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class TopHelper {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    public static int Apply(string search, bool top) {
        IntPtr insertAfter = top ? new IntPtr(-1) : new IntPtr(-2); // -1 = HWND_TOPMOST, -2 = HWND_NOTOPMOST
        uint flags = 0x0001 | 0x0002; // SWP_NOSIZE | SWP_NOMOVE
        int count = 0;
        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                var sb = new StringBuilder(512);
                GetWindowText(hWnd, sb, 512);
                string t = sb.ToString();
                if (!string.IsNullOrEmpty(t) && t.IndexOf(search, StringComparison.OrdinalIgnoreCase) >= 0) {
                    SetWindowPos(hWnd, insertAfter, 0, 0, 0, 0, flags);
                    count++;
                }
            }
            return true;
        }, IntPtr.Zero);
        return count;
    }
}
"@

Add-Type -TypeDefinition $code
$isTop = ($Top -eq 1)
$affected = [TopHelper]::Apply($SearchTitle, $isTop)
Write-Output "OK: affected=$affected title=$SearchTitle top=$isTop"
