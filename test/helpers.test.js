import { describe, it, expect, beforeEach } from 'vitest';
import { getURLValues, generatePeerCode } from '../src/helpers.js';

describe('getURLValues', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('returns an empty object when there is no query string', () => {
    expect(getURLValues()).toEqual({});
  });

  it('parses a plain string value', () => {
    window.history.replaceState({}, '', '/?peer-id=abc123');
    expect(getURLValues()).toEqual({ 'peer-id': 'abc123' });
  });

  it('parses JSON-encoded values', () => {
    window.history.replaceState({}, '', '/?count=42&flag=true');
    expect(getURLValues()).toEqual({ count: 42, flag: true });
  });

  it('decodes URI-encoded characters', () => {
    window.history.replaceState({}, '', '/?name=hello%20world');
    expect(getURLValues()).toEqual({ name: 'hello world' });
  });

  it('parses multiple mixed values', () => {
    window.history.replaceState({}, '', '/?peer-id=peer-1&retries=3');
    expect(getURLValues()).toEqual({ 'peer-id': 'peer-1', retries: 3 });
  });
});

describe('generatePeerCode', () => {
  it('returns an 8-character uppercase code from the unambiguous alphabet', () => {
    const code = generatePeerCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/);
  });

  it('produces varying codes across calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generatePeerCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
