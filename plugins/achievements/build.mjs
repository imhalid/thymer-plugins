// Bakes the mascot model (knight.json, see tools/costume2thymer) and the unlock sound into the plugin: node build.mjs  ->  achievements.js (the file
// to paste into Thymer; never commit it). Non-ASCII characters (such as the crown mark) are written as \u{...} escapes: they have been mangled in
// transit when a chunk boundary fell inside one.
import fs from 'node:fs';
const file = (name) => new URL(name, import.meta.url);
const src = fs.readFileSync(file('./achievements.src.js'), 'utf8');
const model = fs.readFileSync(file('./knight.json'), 'utf8');
const out = src.replace('__KNIGHT__', () => model).replace('__SOUND__', () => JSON.stringify('data:audio/mpeg;base64,' + fs.readFileSync(file('./sound/unlock.mp3')).toString('base64'))).replace(/[^\x00-\x7f]/gu, (c) => `\\u{${c.codePointAt(0).toString(16)}}`);
fs.writeFileSync(file(process.env.ACH_OUT || './achievements.js'), out);
console.log('built', out.length, 'chars');
