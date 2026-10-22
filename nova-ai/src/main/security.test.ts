import { describe, expect, it } from 'vitest';
import {
  APP_ORIGIN,
  buildCsp,
  isAllowedMainFrameNavigation,
  isAllowedSubframeUrl,
  isAppUrl,
  isLoopbackHttpUrl,
  isPermissionAllowed,
  isTrustedSender,
  isValidRendererPath,
  originKey,
  parseDevRendererUrl,
  validateExternalUrl,
  validateLocalPath,
} from './security';

describe('origins', () => {
  it('compares custom-scheme origins by protocol + host', () => {
    expect(originKey('app://nova/index.html')).toBe('app://nova');
    expect(isAppUrl('app://nova/assets/x.js', APP_ORIGIN)).toBe(true);
    expect(isAppUrl('APP://NOVA/', APP_ORIGIN)).toBe(true);
    expect(isAppUrl('app://other/index.html', APP_ORIGIN)).toBe(false);
    expect(isAppUrl('https://nova/index.html', APP_ORIGIN)).toBe(false);
    expect(isAppUrl('file:///C:/x/index.html', APP_ORIGIN)).toBe(false);
    expect(isAppUrl('not a url', APP_ORIGIN)).toBe(false);
  });

  it('dev server origins include the port', () => {
    expect(isAppUrl('http://127.0.0.1:5173/src/main.tsx', 'http://127.0.0.1:5173')).toBe(true);
    expect(isAppUrl('http://127.0.0.1:5174/', 'http://127.0.0.1:5173')).toBe(false);
  });

  it('main frame navigation never leaves the app', () => {
    expect(isAllowedMainFrameNavigation('app://nova/index.html#/projects', APP_ORIGIN)).toBe(true);
    expect(isAllowedMainFrameNavigation('https://example.com/', APP_ORIGIN)).toBe(false);
    expect(isAllowedMainFrameNavigation('http://127.0.0.1:3000/', APP_ORIGIN)).toBe(false);
  });
});

describe('subframes (studio preview)', () => {
  it('allows loopback http only', () => {
    expect(isLoopbackHttpUrl('http://127.0.0.1:5173/')).toBe(true);
    expect(isLoopbackHttpUrl('http://localhost:8080/app')).toBe(true);
    expect(isLoopbackHttpUrl('http://[::1]:3000/')).toBe(true);
    expect(isLoopbackHttpUrl('https://127.0.0.1:5173/')).toBe(false);
    expect(isLoopbackHttpUrl('http://192.168.1.10:3000/')).toBe(false);
    expect(isLoopbackHttpUrl('http://user:pw@127.0.0.1:3000/')).toBe(false);
    expect(isLoopbackHttpUrl('http://localhost.evil.com/')).toBe(false);
    expect(isAllowedSubframeUrl('about:blank')).toBe(true);
    expect(isAllowedSubframeUrl('about:srcdoc')).toBe(true);
    expect(isAllowedSubframeUrl('https://example.com/')).toBe(false);
    expect(isAllowedSubframeUrl('file:///etc/passwd')).toBe(false);
    expect(isAllowedSubframeUrl('app://nova/index.html')).toBe(false);
  });
});

describe('validateExternalUrl', () => {
  it('accepts http/https with a host', () => {
    expect(validateExternalUrl('https://ollama.com/download')).toBe('https://ollama.com/download');
    expect(validateExternalUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000/');
  });

  it('rejects other schemes, credentials, control characters and huge input', () => {
    for (const bad of ['file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'ms-settings:privacy', 'smb://host/share', 'app://nova/', 'https://user:pass@example.com/', 'https://exa\nmple.com', `https://example.com/${'a'.repeat(3000)}`, '', 42, null]) {
      expect(validateExternalUrl(bad)).toBeNull();
    }
  });
});

describe('parseDevRendererUrl', () => {
  it('only accepts loopback http(s)', () => {
    expect(parseDevRendererUrl('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173/');
    expect(parseDevRendererUrl('http://localhost:5173')).toBe('http://localhost:5173/');
    expect(parseDevRendererUrl('https://example.com/')).toBeNull();
    expect(parseDevRendererUrl('file:///x/index.html')).toBeNull();
    expect(parseDevRendererUrl('')).toBeNull();
    expect(parseDevRendererUrl(undefined)).toBeNull();
  });
});

describe('buildCsp', () => {
  it('production policy matches UI-SPEC §5 exactly', () => {
    expect(buildCsp({ dev: false })).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; frame-src http://127.0.0.1:* http://localhost:* http://[::1]:*; object-src 'none'; base-uri 'none'",
    );
  });

  it('dev policy adds the dev server, its websocket and unsafe-eval', () => {
    const csp = buildCsp({ dev: true, devServerOrigin: 'http://127.0.0.1:5173/' });
    expect(csp).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline' http://127.0.0.1:5173");
    expect(csp).toContain("connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173");
    expect(buildCsp({ dev: false, devServerOrigin: 'http://127.0.0.1:5173' })).not.toContain('unsafe-eval');
  });
});

describe('validateLocalPath', () => {
  it('windows: drive-absolute paths only', () => {
    const w = { platform: 'win32' as const };
    expect(validateLocalPath('C:\\Users\\Ana\\NOVA Projekte\\web', w)).toBe('C:\\Users\\Ana\\NOVA Projekte\\web');
    expect(validateLocalPath('C:/Users/Ana/x', w)).toBe('C:\\Users\\Ana\\x');
    expect(validateLocalPath('C:\\a\\..\\b', w)).toBe('C:\\b');
    expect(validateLocalPath('\\\\server\\share\\x', w)).toBeNull();
    expect(validateLocalPath('\\\\?\\C:\\x', w)).toBeNull();
    expect(validateLocalPath('\\\\.\\pipe\\x', w)).toBeNull();
    expect(validateLocalPath('//server/share', w)).toBeNull();
    expect(validateLocalPath('C:relative', w)).toBeNull();
    expect(validateLocalPath('\\rooted', w)).toBeNull();
    expect(validateLocalPath('C:\\x\\file.txt:stream', w)).toBeNull();
    expect(validateLocalPath('relative\\x', w)).toBeNull();
  });

  it('posix: absolute paths, no NUL', () => {
    const p = { platform: 'linux' as const };
    expect(validateLocalPath('/home/ana/x/../y', p)).toBe('/home/ana/y');
    expect(validateLocalPath('home/ana', p)).toBeNull();
    expect(validateLocalPath('/a\0b', p)).toBeNull();
    expect(validateLocalPath(12, p)).toBeNull();
    expect(validateLocalPath('', p)).toBeNull();
  });
});

describe('isTrustedSender', () => {
  const expected = { webContentsId: 7, appOrigin: APP_ORIGIN };

  it('accepts only the main frame of the app window on the app origin', () => {
    expect(isTrustedSender({ webContentsId: 7, frameUrl: 'app://nova/index.html#/', isMainFrame: true }, expected)).toBe(true);
  });

  it('rejects subframes, other windows, other origins and missing frames', () => {
    expect(isTrustedSender({ webContentsId: 7, frameUrl: 'http://127.0.0.1:3000/', isMainFrame: false }, expected)).toBe(false);
    expect(isTrustedSender({ webContentsId: 7, frameUrl: 'app://nova/index.html', isMainFrame: false }, expected)).toBe(false);
    expect(isTrustedSender({ webContentsId: 8, frameUrl: 'app://nova/index.html', isMainFrame: true }, expected)).toBe(false);
    expect(isTrustedSender({ webContentsId: 7, frameUrl: 'https://evil.example/', isMainFrame: true }, expected)).toBe(false);
    expect(isTrustedSender({ webContentsId: 7, frameUrl: null, isMainFrame: true }, expected)).toBe(false);
    expect(isTrustedSender({ webContentsId: 7, frameUrl: 'app://nova/', isMainFrame: true }, { webContentsId: null, appOrigin: APP_ORIGIN })).toBe(false);
  });
});

describe('isPermissionAllowed', () => {
  it('denies everything except local network access for the app origin', () => {
    for (const p of ['media', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-sanitized-write', 'openExternal', 'fullscreen', 'unknown']) {
      expect(isPermissionAllowed(p, 'app://nova/index.html', APP_ORIGIN)).toBe(false);
    }
    expect(isPermissionAllowed('local-network-access', 'app://nova/index.html', APP_ORIGIN)).toBe(true);
    expect(isPermissionAllowed('local-network-access', 'http://127.0.0.1:3000/', APP_ORIGIN)).toBe(false);
    expect(isPermissionAllowed('loopback-network', undefined, APP_ORIGIN)).toBe(false);
  });
});

describe('isValidRendererPath', () => {
  it('accepts router paths only', () => {
    expect(isValidRendererPath('/approvals')).toBe(true);
    expect(isValidRendererPath('/projects/p1?tab=tasks&task=t1')).toBe(true);
    expect(isValidRendererPath('//evil.example')).toBe(false);
    expect(isValidRendererPath('https://x')).toBe(false);
    expect(isValidRendererPath('/a\nb')).toBe(false);
    expect(isValidRendererPath(`/${'a'.repeat(1001)}`)).toBe(false);
    expect(isValidRendererPath(5)).toBe(false);
  });
});
