# Copy ANSI VS Code Extension

This extension allows you to copy text from the VS Code terminal (including Remote SSH sessions) while preserving the ANSI color codes.

## Setup

1. Open this folder in VS Code.
2. Run `npm install` to install development dependencies (optional but recommended).
3. Press **F5** to start debugging. A new "Extension Development Host" window will open.

## Usage

### Method 1: Manual Shortcut
1. Select text in the VS Code Integrated Terminal.
2. Press `Ctrl+C` then `A` (Chord).
   - On macOS: `Cmd+C` then `A`.
3. The selected text is copied to your clipboard with standard ANSI color codes.

### Method 2: UI Context Menu
1. Select text in the terminal.
2. Right-click and choose **"Copy as ANSI Format (复制为ansi格式)"**.

### Method 3: ANSI Auto-Copy Mode (Automatic)
1. Press `Ctrl+Shift+0` to toggle **ANSI Auto-Copy Mode**.
   - A status bar item `$(terminal) ANSI Copy: ON` will appear.
2. Whenever you select and copy text in the terminal (e.g. via `Ctrl+C` or "Copy on Selection"), the extension automatically detects the clipboard change and upgrades the text to ANSI format.
3. This is useful for workflows where you want everything you copy to preserve colors.
4. The text with raw ANSI escape codes `\x1b[...]` is now on your clipboard!
5. Paste it into a text editor (like the one you are editing) to see the ANSI codes (e.g. `[38;2;...m`).

## How it works

1. It triggers VS Code's native "Copy Selection as HTML".
2. It reads the HTML from the system clipboard using PowerShell (Windows only).
3. It converts the HTML styles back to ANSI escape sequences.
4. It writes the ANSI text back to the clipboard.

## Requirements

- Windows (uses PowerShell for clipboard access).
- VS Code 1.74.0 or newer.
