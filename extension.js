const vscode = require('vscode');
const cp = require('child_process');

let isAnsiMode = false;
let ansiStatusItem;
let lastClipboardText = '';
let lastWrittenByUs = '';

function activate(context) {
    // 1. Register "Copy ANSI" command
    let copyDisposable = vscode.commands.registerCommand('extension.copyAnsi', async function () {
        await runCopyAnsi();
    });
    context.subscriptions.push(copyDisposable);

    // 2. Register "Toggle ANSI Mode" command
    let toggleDisposable = vscode.commands.registerCommand('extension.toggleAnsiMode', function () {
        isAnsiMode = !isAnsiMode;
        updateStatusItem();
        vscode.window.showInformationMessage(`ANSI Auto-Copy Mode: ${isAnsiMode ? 'ON' : 'OFF'}`);
    });
    context.subscriptions.push(toggleDisposable);

    // 3. Status Bar Item
    ansiStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    ansiStatusItem.command = 'extension.toggleAnsiMode';
    context.subscriptions.push(ansiStatusItem);
    updateStatusItem();

    // 4. Polling for Clipboard (only active when enabled)
    setInterval(async () => {
        if (!isAnsiMode) return;

        // Check if vscode window is focused to avoid hogging clipboard 
        // when user is in another app (optional, but good practice)
        if (!vscode.window.state.focused) return;

        try {
            const text = await vscode.env.clipboard.readText();
            if (text && text !== lastClipboardText) {
                // If the text is exactly what we just wrote, ignore it (anti-loop)
                if (text === lastWrittenByUs) {
                    lastClipboardText = text;
                    return;
                }

                // New content detected!
                lastClipboardText = text;

                // Trigger ANSI copy
                // We assume the user has "selected" something in the terminal.
                // We run the logic which triggers 'workbench.action.terminal.copySelectionAsHtml'
                // This will overwrite the clipboard with HTML, then we overwrite with ANSI.
                // This effectively "upgrades" the plain text on the clipboard to ANSI.
                await runCopyAnsi();
            }
        } catch (e) {
            // console.error(e);
        }
    }, 500);
}

function updateStatusItem() {
    if (isAnsiMode) {
        ansiStatusItem.text = '$(terminal) ANSI Copy: ON';
        ansiStatusItem.tooltip = 'Click to turn OFF (Auto-convert terminal selection to ANSI)';
        ansiStatusItem.show();
    } else {
        ansiStatusItem.text = '$(terminal) ANSI Copy: OFF';
        ansiStatusItem.tooltip = 'Click to turn ON';
        ansiStatusItem.show(); // Or hide() if preferred
    }
}

async function runCopyAnsi() {
    try {
        // 1. Trigger VS Code's native Copy as HTML
        await vscode.commands.executeCommand('workbench.action.terminal.copySelectionAsHtml');

        // 2. Wait briefly
        await new Promise(r => setTimeout(r, 100));

        // 3. Read HTML
        const htmlRaw = await readClipboardHtml();
        if (!htmlRaw || !htmlRaw.trim()) return;

        // 4. Extract
        const htmlContent = extractHtmlFragment(htmlRaw);

        // 5. Convert
        const ansiText = convertHtmlToAnsi(htmlContent);

        // 6. Write ANSI
        lastWrittenByUs = ansiText; // Mark as ours
        await vscode.env.clipboard.writeText(ansiText);

        // Update tracker to avoid detecting our own write as a "new change" in next poll
        lastClipboardText = ansiText;

    } catch (err) {
        // Silent fail in auto-mode, or specific logic
        // vscode.window.showErrorMessage('Copy ANSI Failed: ' + err.message);
    }
}

function readClipboardHtml() {
    return new Promise((resolve, reject) => {
        if (process.platform === 'win32') {
            const path = require('path');
            const scriptPath = path.join(__dirname, 'GetHtmlClipboard.ps1');
            // Use -ExecutionPolicy Bypass to ensure we can run the script
            const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;

            cp.exec(cmd, { maxBuffer: 1024 * 1024 * 2 }, (err, stdout, stderr) => {
                if (err) {
                    return reject(err);
                }
                const base64Str = stdout.trim();
                if (!base64Str) {
                    resolve('');
                    return;
                }
                try {
                    // Decode Base64 UTF-8 bytes to JS String
                    const decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
                    resolve(decoded);
                } catch (e) {
                    reject(e);
                }
            });
        } else {
            reject(new Error('Platform not supported.'));
        }
    });
}

function extractHtmlFragment(raw) {
    // Windows CF_HTML format contains headers like "StartFragment:..."
    const startMarker = '<!--StartFragment-->';
    const endMarker = '<!--EndFragment-->';
    const startIndex = raw.indexOf(startMarker);
    const endIndex = raw.indexOf(endMarker);

    if (startIndex !== -1 && endIndex !== -1) {
        return raw.substring(startIndex + startMarker.length, endIndex);
    }
    // If no markers, assume raw is the content or markers are missing
    return raw;
}

function convertHtmlToAnsi(html) {
    let output = '';

    // Simple tokenizer
    // Format: <div>, <span>, <br>, text
    // VS Code export usually wraps lines in <div>.
    // We treat <div> start as nothing, </div> end as newline.
    // <br> as newline.
    // <span> as style start, </span> as style reset.

    // Regex to split tags and text
    const regex = /<[^>]+>|[^<]+/g;
    const tokens = html.match(regex) || [];

    for (const token of tokens) {
        if (token.startsWith('<')) {
            // Tag
            if (token.startsWith('</')) {
                // Closing tag
                const tagName = token.substring(2, token.indexOf('>')).toLowerCase();
                if (tagName === 'div') {
                    if (!shouldMergeWithNextLine(output)) {
                        output += '\n';
                    }
                } else if (tagName === 'br') {
                    output += '\n';
                } else if (tagName === 'span') {
                    output += '\x1b[0m'; // Reset
                }
            } else {
                // Opening tag
                const tagNameMatch = token.match(/<([^\s>]+)/);
                const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';

                if (tagName === 'br') {
                    output += '\n';
                } else if (tagName === 'div') {
                    // Maybe handle newlines if not the first div? 
                    // Usually VS Code puts everything in divs. 
                    // If we add \n at </div>, we don't need it at <div>.
                } else if (tagName === 'span') {
                    // Parse style
                    const styleMatch = token.match(/style=(["'])(.*?)\1/);
                    if (styleMatch) {
                        output += parseCssStyleToAnsi(styleMatch[2]);
                    }
                }
            }
        } else {
            // Text
            output += decodeHtmlEntities(token);
        }
    }

    // Trim final newline if necessary (as last div adds one)
    if (output.endsWith('\n')) {
        output = output.slice(0, -1);
    }

    return output;
}

function parseCssStyleToAnsi(styleStr) {
    let ansi = '';
    const styles = styleStr.split(';').map(s => s.trim()).filter(Boolean);

    for (const style of styles) {
        const [prop, val] = style.split(':').map(s => s.trim());
        if (!prop || !val) continue;

        const lowerProp = prop.toLowerCase();

        if (lowerProp === 'color') {
            const rgb = parseColor(val);
            if (rgb) ansi += nearestAnsi16(rgb[0], rgb[1], rgb[2], false);
        } else if (lowerProp === 'background-color') {
            const rgb = parseColor(val);
            if (rgb) ansi += nearestAnsi16(rgb[0], rgb[1], rgb[2], true);
        } else if (lowerProp === 'font-weight') {
            if (val === 'bold' || parseInt(val) >= 700) ansi += '\x1b[1m';
        } else if (lowerProp === 'font-style') {
            if (val === 'italic') ansi += '\x1b[3m';
        } else if (lowerProp === 'text-decoration') {
            if (val.includes('underline')) ansi += '\x1b[4m';
            if (val.includes('line-through')) ansi += '\x1b[9m';
        }
    }
    return ansi;
}

function nearestAnsi16(r, g, b, isBg) {
    // Basic 16-color palette approximation
    // 30-37: black, red, green, yellow, blue, magenta, cyan, white
    // 90-97: bright versions
    // Map RGB to closest index.

    const colors = [
        [0, 0, 0],       // 0: Black #000000
        [205, 49, 49],   // 1: Red #cd3131
        [13, 188, 121],  // 2: Green #0dbc79
        [229, 229, 16],  // 3: Yellow #e5e510
        [36, 114, 200],  // 4: Blue #2472c8
        [188, 63, 188],  // 5: Magenta #bc3fbc
        [17, 168, 205],  // 6: Cyan #11a8cd
        [229, 229, 229], // 7: White #e5e5e5

        [102, 102, 102], // 8: Bright Black #666666
        [241, 76, 76],   // 9: Bright Red #f14c4c
        [35, 209, 139],  // 10: Bright Green #23d18b
        [245, 245, 67],  // 11: Bright Yellow #f5f543
        [59, 142, 234],  // 12: Bright Blue #3b8eea
        [214, 112, 214], // 13: Bright Magenta #d670d6
        [41, 184, 219],  // 14: Bright Cyan #29b8db
        [229, 229, 229]  // 15: Bright White #e5e5e5
    ];

    let minDist = Infinity;
    let closestIdx = 7;

    for (let i = 0; i < colors.length; i++) {
        const [cr, cg, cb] = colors[i];
        // Euclidean distance
        const dist = Math.pow(r - cr, 2) + Math.pow(g - cg, 2) + Math.pow(b - cb, 2);
        if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
        }
    }

    if (closestIdx < 8) {
        return isBg ? `\x1b[${40 + closestIdx}m` : `\x1b[${30 + closestIdx}m`;
    } else {
        return isBg ? `\x1b[${100 + (closestIdx - 8)}m` : `\x1b[${90 + (closestIdx - 8)}m`;
    }
}

function parseColor(colorStr) {
    // #RRGGBB
    if (colorStr.startsWith('#')) {
        const hex = colorStr.substring(1);
        if (hex.length === 6) {
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return [r, g, b];
        } else if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            // return [r, g, b];
            // Wait, hex parse might need error check
            return [r, g, b];
        }
    }
    // rgb(r, g, b)
    const rgbMatch = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
        return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
    }
    // rgba - ignore alpha for now or treat as rgb
    const rgbaMatch = colorStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbaMatch) {
        return [parseInt(rgbaMatch[1]), parseInt(rgbaMatch[2]), parseInt(rgbaMatch[3])];
    }
    return null;
}

function decodeHtmlEntities(text) {
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

function shouldMergeWithNextLine(text) {
    if (!text) return false;
    // Strip ANSI codes to check the actual text content
    const content = text.replace(/\x1b\[[0-9;]*m/g, '');
    if (content.length === 0) return false;
    // If the last character is NOT whitespace, we assume it's a soft wrap (hit the edge) -> Merge
    // If it IS whitespace, it implies padding or explicit break -> Newline
    return !/\s/.test(content[content.length - 1]);
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
}
