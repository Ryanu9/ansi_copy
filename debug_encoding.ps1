$OutputEncoding = [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "PS Version:" $PSVersionTable.PSVersion

try {
    $clip = Get-Clipboard -TextFormatType Html
    if ($clip) {
        $clip | Set-Content -Encoding UTF8 -Path "debug_clip_string.txt"
        Write-Host "Clipboard content saved to debug_clip_string.txt"
    } else {
        Write-Host "Clipboard is empty or no HTML format found."
    }
} catch {
    Write-Host "Error getting clipboard: $_"
}
