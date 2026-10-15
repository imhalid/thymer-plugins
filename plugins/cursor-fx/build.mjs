// Bakes the textures into the plugin: node build.mjs  ->  cursor-fx.js (the file to paste into Thymer's code tab).
// Non-ASCII characters (the icons) are written as \u{...} escapes: they have been mangled in transit when a chunk boundary
// fell inside one.
import fs from 'node:fs';
const file = (name) => new URL(name, import.meta.url);
const src = fs.readFileSync(file('./cursor-fx.src.js'), 'utf8');
const png = (name) => 'data:image/png;base64,' + fs.readFileSync(file(name)).toString('base64');
const fx = JSON.stringify({ atlas: png('./fx/atlas.png'), noise: png('./fx/noise.png') });
const out = src.replace('__FX__', () => fx).replace(/[^\x00-\x7f]/gu, (c) => `\\u{${c.codePointAt(0).toString(16)}}`);
fs.writeFileSync(file('./cursor-fx.js'), out);
console.log('built', out.length, 'chars');
