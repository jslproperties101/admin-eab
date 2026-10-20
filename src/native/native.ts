// The one place that talks to the phone's own features when Admin EAB runs as the Android app (Capacitor).
// In a browser every function reports "not native" and the screens use their browser path.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNative = (): boolean => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
export const platform = (): 'android' | 'ios' | 'web' => { try { return Capacitor.getPlatform() as 'android' | 'ios' | 'web'; } catch { return 'web'; } };

/** Android package id, also the link Google sign-in returns to. Different from the main app's, so the two never clash. */
export const APP_ID = 'com.jslproperties.admineab';
export const AUTH_CALLBACK = `${APP_ID}://auth-callback`;

const cache = new Map<string, any>();
export function plugin<T = any>(name: string): T | undefined {
  if (!isNative()) return undefined;
  if (!cache.has(name)) cache.set(name, registerPlugin<T>(name));
  return cache.get(name) as T;
}
export function pluginMissing(name: string): boolean {
  if (!isNative()) return false;
  try { return !Capacitor.isPluginAvailable(name); } catch { return false; }
}

/** Opens a page in the phone's browser tab (Custom Tabs), or goes there in the web version. */
export async function openInBrowser(url: string): Promise<boolean> {
  const b = plugin('Browser');
  if (b) { try { await b.open({ url, presentationStyle: 'popover' }); return true; } catch { return false; } }
  window.location.assign(url);
  return true;
}
export async function closeBrowser(): Promise<void> {
  try { await plugin('Browser')?.close(); } catch { /* already closed */ }
}

export interface Listener { remove: () => Promise<void> | void }
export async function onAppUrlOpen(fn: (url: string) => void): Promise<Listener | null> {
  const app = plugin('App');
  if (!app) return null;
  try { return await app.addListener('appUrlOpen', (e: { url: string }) => fn(e.url)); } catch { return null; }
}
/** The app went to the background or came back (used by the idle sign-out). */
export async function onAppStateChange(fn: (active: boolean) => void): Promise<Listener | null> {
  const app = plugin('App');
  if (!app) return null;
  try { return await app.addListener('appStateChange', (e: { isActive: boolean }) => fn(e.isActive)); } catch { return null; }
}

export async function nativeLook(): Promise<void> {
  if (!isNative()) return;
  try { await plugin('StatusBar')?.setStyle({ style: 'DARK' }); } catch { /* not available */ }
  try { await plugin('StatusBar')?.setBackgroundColor({ color: '#08080A' }); } catch { /* not available */ }
}

/** A short description of this device for the access log (no identifiers, nothing personal). */
export function deviceLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const kind = isNative() ? 'app' : 'web';
  const wide = typeof window !== 'undefined' && window.innerWidth >= 900 ? 'wide' : 'narrow';
  return `${kind}/${platform()} ${os} ${browser} ${wide}`.slice(0, 120);
}
