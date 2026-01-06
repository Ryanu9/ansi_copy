const assert = require('assert');

// --- Mocking the logic from extension.js with the current 'merge' logic ---

function convertHtmlToAnsi(html) {
    let output = '';
    const regex = /<[^>]+>|[^<]+/g;
    const tokens = html.match(regex) || [];

    for (const token of tokens) {
        if (token.startsWith('<')) {
            if (token.startsWith('</')) {
                const tagName = token.substring(2, token.indexOf('>')).toLowerCase();
                if (tagName === 'div') {
                    if (!shouldMergeWithNextLine(output)) {
                        output += '\n';
                    }
                    // Current Code: does nothing else. 
                } else if (tagName === 'br') {
                    output += '\n';
                } else if (tagName === 'span') {
                    output += '\x1b[0m';
                }
            } else {
                const tagNameMatch = token.match(/<([^\s>]+)/);
                const tagName = tagNameMatch ? tagNameMatch[1].toLowerCase() : '';

                if (tagName === 'br') {
                    output += '\n';
                } else if (tagName === 'span') {
                    // Simple mock for style parsing
                    const styleMatch = token.match(/style=(["'])(.*?)\1/);
                    if (styleMatch) {
                        if (styleMatch[2].includes('color: yellow')) output += '\x1b[33m';
                    }
                }
            }
        } else {
            output += decodeHtmlEntities(token);
        }
    }

    if (output.endsWith('\n')) {
        output = output.slice(0, -1);
    }
    return output;
}

function shouldMergeWithNextLine(text) {
    if (!text) return false;
    const content = text.replace(/\x1b\[[0-9;]*m/g, '');
    if (content.length === 0) return false;
    return !/\s/.test(content[content.length - 1]);
}

function decodeHtmlEntities(text) {
    return text.replace(/&nbsp;/g, ' ');
}

// --- Reproduce Issue ---

const htmlMergeColor = "<div><span style='color: yellow'>Built-in account fo</span></div><div><span>r guest access</span></div>";
const result = convertHtmlToAnsi(htmlMergeColor);

console.log("Result Hex escaped:");
console.log(JSON.stringify(result));

// We expect the 'r' to be yellow. In my mock, that implies NO [0m between 'fo' and 'r'.
// Or if there is a [0m, it must be followed by [33m.
// But in the "continuation" case, the second span often has NO style in the HTML if VS Code just wrapped it? 
// Actually if I look at the mock: <div><span>...</span></div>. The second span has no style.
// So: [33m...fo[0m...r...
// result should NOT contain [0m between fo and r.

const indexFo = result.indexOf("fo");
const indexR = result.indexOf("r", indexFo);
const segment = result.substring(indexFo + 2, indexR);
console.log("Segment between 'fo' and 'r':", JSON.stringify(segment));

if (segment.includes("\\u001b[0m") || segment.includes("\x1b[0m")) {
    console.log("FAIL: Reset code found between merged segments. Color will be lost.");
} else {
    console.log("PASS: No reset code found. Color preserved.");
}
