// Builds Admin EAB into dist/ with esbuild. The same dist/ is the web version and goes inside the Android APK.
// Settings come from environment variables (or .env, which Git ignores), never from the code:
//   EAB_SUPABASE_URL       the Supabase project shared with Estate Agent AI Buddy (TEST project while building)
//   EAB_SUPABASE_ANON_KEY  its public (anon / publishable) key. NEVER the service-role key.
//   EAB_APP                which admin to build: all (combined) | eab (default) | pos | mm2h | odw | biz
// Both can also be typed on the sign-in screen (kept on that device only).
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { capacitorPlugin } from './capacitor-resolve.mjs';

const env = { ...process.env };
const noEnv = process.argv.includes('--no-env');
if (noEnv) for (const k of Object.keys(env)) if (k.startsWith('EAB_') && k !== 'EAB_APP') delete env[k];
if (!noEnv && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const config = { supabaseUrl: env.EAB_SUPABASE_URL ?? '', supabaseAnonKey: env.EAB_SUPABASE_ANON_KEY ?? '' };
// AdminBatch010: the AI Buddy Biz project (its own database). Public key only, same checks as above.
const biz = { supabaseUrl: env.EAB_BIZ_SUPABASE_URL ?? '', supabaseAnonKey: env.EAB_BIZ_SUPABASE_ANON_KEY ?? '' };
// A service-role key is a JWT whose payload says "service_role". Refuse to build one into the app.
if (/eyJ/.test(config.supabaseAnonKey)) {
  try {
    const payload = JSON.parse(Buffer.from(config.supabaseAnonKey.split('.')[1], 'base64url').toString());
    if (payload.role === 'service_role') throw new Error('EAB_SUPABASE_ANON_KEY is a SERVICE-ROLE key. Use the public anon key.');
  } catch (e) { if (String(e).includes('SERVICE-ROLE')) throw e; }
}
if (/^sb_secret_/.test(config.supabaseAnonKey)) throw new Error('EAB_SUPABASE_ANON_KEY is a SECRET key. Use the publishable key.');
for (const k of [biz.supabaseAnonKey]) {
  if (/^sb_secret_/.test(k)) throw new Error('EAB_BIZ_SUPABASE_ANON_KEY is a SECRET key. Use the publishable key.');
  if (/eyJ/.test(k)) { let role = ''; try { role = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role; } catch { /* not a JWT */ } if (role === 'service_role') throw new Error('EAB_BIZ_SUPABASE_ANON_KEY is a SERVICE-ROLE key. Use the public anon key.'); }
}

const APPS = ['all', 'eab', 'pos', 'mm2h', 'odw', 'biz'];
const app = (env.EAB_APP ?? 'eab').trim().toLowerCase() || 'eab';
if (!APPS.includes(app)) throw new Error(`EAB_APP must be one of ${APPS.join(', ')}`);
const TITLES = { all: 'Admin AI Buddy', eab: 'Admin EAB', pos: 'Admin POS', mm2h: 'Admin MM2H', odw: 'Admin On Da Way', biz: 'Admin Biz' };

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let sha = (env.GITHUB_SHA ?? '').slice(0, 7);
if (!sha) { try { sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { sha = 'dev'; } }
const buildInfo = { sha, version: pkg.version, release: pkg.releaseLabel ?? '', builtAt: new Date().toISOString() };

const OUT = process.env.EAB_OUTDIR || 'dist';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'esm',
  target: ['chrome110', 'safari16'],
  jsx: 'automatic',
  minify: !process.env.EAB_NOMINIFY,
  sourcemap: true,
  outdir: OUT,
  define: { 'process.env.NODE_ENV': '"production"', __EAB_CONFIG__: JSON.stringify(config), __EAB_BUILD__: JSON.stringify(buildInfo), __EAB_APP__: JSON.stringify(app), __EAB_BIZ__: JSON.stringify(biz) },
  loader: { '.webp': 'dataurl' },
  plugins: [capacitorPlugin()],
  logLevel: 'info',
});
writeFileSync(`${OUT}/index.html`, readFileSync('index.html', 'utf8').replace('<title>Admin EAB</title>', `<title>${TITLES[app]}</title>`));
const set = Object.entries(config).filter(([, v]) => v).map(([k]) => k);
console.log(`Build finished: ${TITLES[app]} in ${OUT}/ (configured: ${set.length ? set.join(', ') : 'none — type the connection on the sign-in screen'}; Capacitor: ${capacitorPlugin.real() ? 'real' : 'browser stand-in'})`);
