import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

test('共享IP网关先保留LanSense入口，再声明Rice入口和兜底路由', () => {
  const deploy = read('scripts/deploy.sh');
  const lansenseLocation = deploy.indexOf('location ^~ $LANSENSE_PUBLIC_INGEST_PREFIX');
  const riceLocation = deploy.indexOf('location ^~ $RICE_PUBLIC_INGEST_PREFIX');
  const catchAllLocation = deploy.indexOf('$shared_ip_locations    location /');

  assert.ok(lansenseLocation >= 0, '缺少LanSense设备上报专用location');
  assert.ok(riceLocation > lansenseLocation, 'Rice专用location必须位于LanSense专用location之后');
  assert.ok(catchAllLocation > riceLocation, '两个设备入口必须位于Rice页面兜底路由之前');
  assert.match(deploy, /proxy_pass http:\/\/127\.0\.0\.1:\$LANSENSE_BACKEND_PORT\$LANSENSE_PUBLIC_INGEST_PREFIX/);
  assert.match(deploy, /proxy_pass http:\/\/127\.0\.0\.1:3201\/api\/device-ingest\//);
  assert.match(deploy, /LanSense后端未就绪，拒绝安装共享IP网关/);
  assert.match(deploy, /移除Rice旧Nginx配置，避免跳过模式遗留IP路由/);
});

test('生产文档和设置页只向Rice设备展示专属上报前缀', () => {
  for (const relativePath of [
    'README.md',
    'docs/deployment.md',
    'docs/api-contract.md',
    'docs/d100l-w0-water-soil-http.lua',
    'docs/d100l-w1-w2-tension-soil-http.lua',
    'frontend/src/pages/SettingsPage.jsx'
  ]) {
    assert.match(read(relativePath), /\/rice-api\/device-ingest\/d100l2/, `${relativePath} 未展示Rice专属入口`);
  }
});
