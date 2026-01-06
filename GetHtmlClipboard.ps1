$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class ClipboardHelper {
    [DllImport("user32.dll")]
    public static extern bool OpenClipboard(IntPtr hWndNewOwner);
    
    [DllImport("user32.dll")]
    public static extern bool CloseClipboard();
    
    [DllImport("user32.dll")]
    public static extern IntPtr GetClipboardData(uint uFormat);
    
    [DllImport("user32.dll")]
    public static extern uint RegisterClipboardFormat(string lpszFormat);
    
    [DllImport("kernel32.dll")]
    public static extern IntPtr GlobalLock(IntPtr hMem);
    
    [DllImport("kernel32.dll")]
    public static extern bool GlobalUnlock(IntPtr hMem);
    
    [DllImport("kernel32.dll")]
    public static extern int GlobalSize(IntPtr hMem);
}
"@

Add-Type -TypeDefinition $code

$formatId = [ClipboardHelper]::RegisterClipboardFormat("HTML Format")
if ($formatId -eq 0) {
    Write-Error "Could not register HTML Format"
    exit 1
}

if (-not [ClipboardHelper]::OpenClipboard([IntPtr]::Zero)) {
    Write-Error "Could not open clipboard"
    exit 1
}

try {
    $hMem = [ClipboardHelper]::GetClipboardData($formatId)
    if ($hMem -ne [IntPtr]::Zero) {
        $ptr = [ClipboardHelper]::GlobalLock($hMem)
        if ($ptr -ne [IntPtr]::Zero) {
            try {
                $size = [ClipboardHelper]::GlobalSize($hMem)
                $bytes = New-Object byte[] $size
                [System.Runtime.InteropServices.Marshal]::Copy($ptr, $bytes, 0, $size)
                
                # Output Base64 to stdout
                $base64 = [Convert]::ToBase64String($bytes)
                Write-Host $base64
            } finally {
                [ClipboardHelper]::GlobalUnlock($hMem) | Out-Null
            }
        }
    }
} finally {
    [ClipboardHelper]::CloseClipboard() | Out-Null
}
