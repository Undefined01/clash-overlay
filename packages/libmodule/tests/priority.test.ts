// tests/priority.test.ts — Tests for Nix-compatible priority system
import { describe, it, expect } from 'vitest';
import {
    mkOverride, mkDefault, mkForce,
    isOverride, getPriority, unwrapPriority,
    DEFAULT_PRIORITY, MKDEFAULT_PRIORITY, MKFORCE_PRIORITY,
} from '../src/index.js';

// ─── Constants ──────────────────────────────────────────────────────

describe('priority constants', () => {
    it('mkForce < DEFAULT < mkDefault (lower = higher precedence)', () => {
        expect(MKFORCE_PRIORITY).toBe(50);
        expect(DEFAULT_PRIORITY).toBe(100);
        expect(MKDEFAULT_PRIORITY).toBe(1000);
        expect(MKFORCE_PRIORITY).toBeLessThan(DEFAULT_PRIORITY);
        expect(DEFAULT_PRIORITY).toBeLessThan(MKDEFAULT_PRIORITY);
    });
});

// ─── mkOverride ─────────────────────────────────────────────────────

describe('mkOverride', () => {
    it('wraps with explicit numeric priority', () => {
        const w = mkOverride(200, 'hello');
        expect(w.__type).toBe('override');
        expect(w.priority).toBe(200);
        expect(w.value).toBe('hello');
    });

    it('supports any priority value', () => {
        expect(mkOverride(0, 'x').priority).toBe(0);
        expect(mkOverride(9999, 'x').priority).toBe(9999);
        expect(mkOverride(-1, 'x').priority).toBe(-1);
    });
});

// ─── mkDefault / mkForce ────────────────────────────────────────────

describe('mkDefault', () => {
    it('wraps with priority 1000', () => {
        const w = mkDefault(42);
        expect(w.__type).toBe('override');
        expect(w.priority).toBe(1000);
        expect(w.value).toBe(42);
    });

    it('can wrap falsy values', () => {
        expect(mkDefault(0).value).toBe(0);
        expect(mkDefault(null).value).toBe(null);
        expect(mkDefault('').value).toBe('');
        expect(mkDefault(false).value).toBe(false);
    });
});

describe('mkForce', () => {
    it('wraps with priority 50', () => {
        const w = mkForce('forced');
        expect(w.__type).toBe('override');
        expect(w.priority).toBe(50);
        expect(w.value).toBe('forced');
    });

    it('can wrap complex values', () => {
        const arr = [1, 2, 3];
        expect(mkForce(arr).value).toBe(arr);
    });
});

// ─── isOverride ─────────────────────────────────────────────────────

describe('isOverride', () => {
    it('detects Override wrappers', () => {
        expect(isOverride(mkDefault(1))).toBe(true);
        expect(isOverride(mkForce(1))).toBe(true);
        expect(isOverride(mkOverride(42, 1))).toBe(true);
    });

    it('rejects non-Override values', () => {
        expect(isOverride(null)).toBe(false);
        expect(isOverride(undefined)).toBe(false);
        expect(isOverride(42)).toBe(false);
        expect(isOverride('str')).toBe(false);
        expect(isOverride({})).toBe(false);
        expect(isOverride([])).toBe(false);
        expect(isOverride({ __type: 'other' })).toBe(false);
        expect(isOverride({ __type: 123 })).toBe(false);
    });

    it('rejects old-style __priority wrappers', () => {
        expect(isOverride({ __priority: 'default', value: 1 })).toBe(false);
    });
});

// ─── getPriority ────────────────────────────────────────────────────

describe('getPriority', () => {
    it('returns priority for Override wrappers', () => {
        expect(getPriority(mkDefault(1))).toBe(1000);
        expect(getPriority(mkForce(1))).toBe(50);
        expect(getPriority(mkOverride(200, 1))).toBe(200);
    });

    it('returns DEFAULT_PRIORITY for bare values', () => {
        expect(getPriority(42)).toBe(100);
        expect(getPriority('str')).toBe(100);
        expect(getPriority(null)).toBe(100);
        expect(getPriority(undefined)).toBe(100);
        expect(getPriority({})).toBe(100);
        expect(getPriority([])).toBe(100);
    });
});

// ─── unwrapPriority ─────────────────────────────────────────────────

describe('unwrapPriority', () => {
    it('unwraps Override values', () => {
        expect(unwrapPriority(mkDefault(42))).toBe(42);
        expect(unwrapPriority(mkForce('x'))).toBe('x');
        expect(unwrapPriority(mkOverride(200, false))).toBe(false);
    });

    it('returns bare values as-is', () => {
        expect(unwrapPriority(42)).toBe(42);
        expect(unwrapPriority(null)).toBe(null);
        expect(unwrapPriority('str')).toBe('str');
        expect(unwrapPriority(undefined)).toBe(undefined);
    });
});
