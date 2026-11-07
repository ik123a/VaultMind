import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Sandbox } from '../packages/vm-sandbox/src/sandbox';

describe('Sandbox path policy', () => {
  let fixture: string;
  let allowed: string;
  let denied: string;
  let outside: string;
  let sandbox: Sandbox;

  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'vaultmind-path-test-'));
    allowed = path.join(fixture, 'workspace');
    denied = path.join(allowed, 'private');
    outside = path.join(fixture, 'workspace-other');
    for (const directory of [allowed, denied, outside]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    sandbox = new Sandbox({ allowedPaths: [allowed], deniedPaths: [denied] });
  });

  afterEach(() => {
    // Only remove this test's temporary fixture; rm does not follow its links.
    if (path.dirname(fixture) !== path.resolve(os.tmpdir()) ||
        !path.basename(fixture).startsWith('vaultmind-path-test-')) {
      throw new Error('Unexpected fixture path');
    }
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  for (const operation of ['read', 'write'] as const) {
    it(`allows the configured root and a missing descendant for ${operation}`, () => {
      expect(sandbox.checkPathAccess(allowed, operation)).toBe(true);
      expect(sandbox.checkPathAccess(path.join(allowed, 'new', 'file.txt'), operation)).toBe(true);
    });

    it(`rejects a sibling sharing the allowed root's prefix for ${operation}`, () => {
      expect(sandbox.checkPathAccess(outside, operation)).toBe(false);
    });

    it(`rejects traversal outside the allowed root for ${operation}`, () => {
      expect(sandbox.checkPathAccess(path.join(allowed, '..', 'workspace-other'), operation)).toBe(false);
    });

    it(`gives deny roots precedence for ${operation}`, () => {
      expect(sandbox.checkPathAccess(denied, operation)).toBe(false);
      expect(sandbox.checkPathAccess(path.join(denied, 'new.txt'), operation)).toBe(false);
    });

    it(`does not deny siblings sharing a deny root's prefix for ${operation}`, () => {
      expect(sandbox.checkPathAccess(path.join(allowed, 'private-notes', 'new.txt'), operation)).toBe(true);
    });
  }

  it('supports relative paths and a trailing separator on policy roots', () => {
    sandbox = new Sandbox({ allowedPaths: [allowed + path.sep] });
    expect(sandbox.checkPathAccess(path.relative(process.cwd(), allowed), 'read')).toBe(true);
    expect(sandbox.checkPathAccess(outside, 'read')).toBe(false);
  });

  it('keeps deny rules active when an empty allow list permits other paths', () => {
    sandbox = new Sandbox({ allowedPaths: [], deniedPaths: [denied] });
    expect(sandbox.checkPathAccess(outside, 'read')).toBe(true);
    expect(sandbox.checkPathAccess(denied, 'read')).toBe(false);
  });

  it('allows a filesystem root without treating its descendants as siblings', () => {
    sandbox = new Sandbox({ allowedPaths: [path.parse(fixture).root] });
    expect(sandbox.checkPathAccess(allowed, 'read')).toBe(true);
  });

  it.runIf(process.platform === 'win32')('accepts casing and separator variants of an existing Windows path', () => {
    expect(sandbox.checkPathAccess(allowed.toUpperCase().replace(/\\/g, '/'), 'read')).toBe(true);
  });

  it('rejects an existing directory link outside the allowed root', () => {
    const link = path.join(allowed, 'link');
    fs.symlinkSync(outside, link, 'junction');
    expect(sandbox.checkPathAccess(link, 'read')).toBe(false);
    expect(sandbox.checkPathAccess(path.join(link, 'new', 'file.txt'), 'write')).toBe(false);
  });

  it('allows a directory link whose destination stays inside the allowed root', () => {
    const target = path.join(allowed, 'docs');
    const link = path.join(allowed, 'link');
    fs.mkdirSync(target);
    fs.symlinkSync(target, link, 'junction');
    expect(sandbox.checkPathAccess(path.join(link, 'new.txt'), 'write')).toBe(true);
  });

  it('rejects a directory link to a denied destination', () => {
    const link = path.join(allowed, 'link');
    fs.symlinkSync(denied, link, 'junction');
    expect(sandbox.checkPathAccess(path.join(link, 'new.txt'), 'write')).toBe(false);
  });

  it('resolves configured directory links as policy roots', () => {
    const rootLink = path.join(fixture, 'root-link');
    fs.symlinkSync(allowed, rootLink, 'junction');
    sandbox = new Sandbox({ allowedPaths: [rootLink], deniedPaths: [path.join(rootLink, 'private')] });
    expect(sandbox.checkPathAccess(path.join(rootLink, 'new.txt'), 'write')).toBe(true);
    expect(sandbox.checkPathAccess(path.join(rootLink, 'private', 'new.txt'), 'write')).toBe(false);
  });

  it('fails closed for a dangling directory link', () => {
    const link = path.join(allowed, 'link');
    const target = path.join(fixture, 'missing');
    fs.mkdirSync(target);
    fs.symlinkSync(target, link, 'junction');
    fs.rmdirSync(target);
    expect(sandbox.checkPathAccess(path.join(link, 'new.txt'), 'write')).toBe(false);
  });

  it('fails closed when a file is used as a parent directory', () => {
    const file = path.join(allowed, 'file.txt');
    fs.writeFileSync(file, 'fixture');
    expect(sandbox.checkPathAccess(path.join(file, 'child.txt'), 'write')).toBe(false);
  });

  it('fails closed for a malformed path', () => {
    expect(sandbox.checkPathAccess(allowed + '\0', 'read')).toBe(false);
  });

  it('rejects an out-of-policy working directory before launching a command', async () => {
    await expect(sandbox.execute(process.execPath, ['--version'], outside)).rejects.toThrow('access denied');
  });
});
