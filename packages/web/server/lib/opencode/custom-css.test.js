import { afterEach, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { CUSTOM_CSS_MAX_BYTES, registerCustomCss } from './custom-css.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

const fixture = async (fsPromises = fs) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-css-'));
  cleanups.push(() => fs.rm(dataDir, { recursive: true, force: true }));
  const changes = [];
  const app = express();
  const watch = registerCustomCss({ app, fsPromises, path, dataDir, onChange: () => changes.push('changed') });
  cleanups.push(() => watch.stop());
  await watch.ready;
  return { app, watch, changes, dataDir, file: path.join(dataDir, 'custom.css') };
};

test('serves missing, edited and deleted CSS without interpreting markup or caching it', async () => {
  const { app, file } = await fixture();
  expect((await request(app).get('/api/config/custom-css').expect(200)).body).toEqual({ css: '' });
  const css = '/* </style><script>text only</script> */ :root { --label: "你好"; }';
  await fs.writeFile(file, css);
  const result = await request(app).get('/api/config/custom-css').expect(200);
  expect(result.body).toEqual({ css });
  expect(result.headers['cache-control']).toBe('no-store');
  await fs.rm(file);
  expect((await request(app).get('/api/config/custom-css').expect(200)).body).toEqual({ css: '' });
});

test('read failures and oversized files are explicit errors', async () => {
  const { app, file } = await fixture();
  await fs.writeFile(file, Buffer.alloc(CUSTOM_CSS_MAX_BYTES, 32));
  await request(app).get('/api/config/custom-css').expect(200);
  await fs.appendFile(file, 'x');
  await request(app).get('/api/config/custom-css').expect(413);
  await fs.rm(file);
  await fs.mkdir(file);
  await request(app).get('/api/config/custom-css').expect(400);
  const failed = await fixture({ ...fs, open: async () => { throw Object.assign(new Error('private path'), { code: 'EACCES' }); } });
  expect((await request(failed.app).get('/api/config/custom-css').expect(500)).body).toEqual({ error: 'Could not read custom.css' });
});

test('watches only custom.css and settles create, atomic replace, deletion and recreation', async () => {
  const { watch, changes, dataDir, file } = await fixture();
  const settle = async () => { await watch.check(); await watch.check(); };
  await fs.writeFile(path.join(dataDir, 'settings.json'), '{}');
  await settle();
  expect(changes).toHaveLength(0);
  await fs.writeFile(file, 'body { color: red }');
  await settle();
  await fs.writeFile(`${file}.tmp`, 'body { color: blue }');
  await fs.rename(`${file}.tmp`, file);
  await settle();
  await fs.rm(file);
  await settle();
  await fs.writeFile(file, 'body { color: green }');
  await settle();
  expect(changes).toHaveLength(4);
  watch.stop();
  await fs.writeFile(file, 'body {}');
  await settle();
  expect(changes).toHaveLength(4);
});
