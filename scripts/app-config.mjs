// Sets capacitor.config.json for the admin chosen by EAB_APP, before "npx cap add android" (GitHub Actions).
// Each admin is its own Android app with its own package, so all of them install side by side on one phone.
// Prints the package name so the workflow can check the finished APK against it.
import { readFileSync, writeFileSync } from 'node:fs';

export const ADMINS = {
  all: { appId: 'com.jslproperties.adminhub', appName: 'Admin AI Buddy', file: 'AdminAIBuddy' },
  eab: { appId: 'com.jslproperties.admineab', appName: 'Admin EAB', file: 'AdminEAB' },
  pos: { appId: 'com.jslproperties.adminpos', appName: 'Admin POS', file: 'AdminPOS' },
  mm2h: { appId: 'com.jslproperties.adminmm2h', appName: 'Admin MM2H', file: 'AdminMM2H' },
  odw: { appId: 'com.jslproperties.adminodw', appName: 'Admin On Da Way', file: 'AdminOnDaWay' },
  biz: { appId: 'com.jslproperties.adminbiz', appName: 'Admin Biz', file: 'AdminBiz' },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = (process.env.EAB_APP || 'eab').toLowerCase();
  const a = ADMINS[app];
  if (!a) throw new Error(`Unknown EAB_APP "${app}"`);
  const cfg = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
  cfg.appId = a.appId;
  cfg.appName = a.appName;
  writeFileSync('capacitor.config.json', JSON.stringify(cfg, null, 2) + '\n');
  const field = process.argv[2];
  console.log(field ? a[field] : `${a.appName} (${a.appId})`);
}
