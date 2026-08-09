import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import luaparse from 'luaparse';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'docs/d100l-w0-water-soil-http.lua',
  'docs/d100l-w1-w2-tension-soil-http.lua',
  'docs/d100l-soil-only-http.lua'
];

for (const relativePath of files) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  // D100L's task editor uses a vendor wrapper consisting of a bare `function`
  // line and the matching final `end`. Normalize only that wrapper so a
  // standard Lua 5.1 parser can validate the task body.
  const normalized = source.replace(/^function\s*\n/, 'return function()\n');
  if (normalized === source) throw new Error(`缺少D100L任务function包装: ${relativePath}`);
  luaparse.parse(normalized, { luaVersion: '5.1' });
  console.log(`D100L wrapper and Lua 5.1 task body OK: ${relativePath}`);
}
