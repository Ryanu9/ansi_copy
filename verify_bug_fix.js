const assert = require('assert');

function convertHtmlToAnsi(html) {
    let output = '';
    const regex = /<[^>]+>|[^<]+/g;
    const tokens = html.match(regex) || [];

    for (const token of tokens) {
        if (token.startsWith('<')) {
            if (token.startsWith('</')) {
                const tagName = token.substring(2, token.indexOf('>')).toLowerCase();
                if (tagName === 'div') {
                    if (shouldMergeWithNextLine(output)) {
                        output = output.replace(/(\x1b\[0m)+$/, '');
                    } else {
                        output += '\n';
                    }
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

// --- Verify Fix ---

const htmlMergeColor = "<div><span style='color: yellow'>Built-in account fo</span></div><div><span>r guest access</span></div>";
const result = convertHtmlToAnsi(htmlMergeColor);

console.log("Result Hex escaped:");
console.log(JSON.stringify(result));

const indexFo = result.indexOf("fo");
const indexR = result.indexOf("r", indexFo);
const segment = result.substring(indexFo + 2, indexR);
// segment should be empty string if they touch directly, or definitely NOT contain [0m.

if (segment.includes("\\u001b[0m") || segment.includes("\x1b[0m")) {
    console.log("FAIL: Reset code found. Color lost.");
} else {
    console.log("PASS: No reset code found. Color preserved.");
}
