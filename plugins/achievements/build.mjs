// Bakes the model into the plugin: node build.mjs  ->  achievements.js (the file to paste into Thymer; never commit it).
// Non-ASCII characters (the emoji icons) are written as \u{...} escapes: they have been mangled in transit when a chunk
// boundary fell inside one.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./achievements.src.js', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('./sonic.json', import.meta.url), 'utf8');
const out = src.replace('__SONIC__', () => model).replace(/[^\x00-\x7f]/gu, (c) => `\\u{${c.codePointAt(0).toString(16)}}`);
fs.writeFileSync(new URL('./achievements.js', import.meta.url), out);
console.log('built', out.length, 'chars');
