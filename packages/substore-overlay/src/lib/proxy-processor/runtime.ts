import type { SubStoreOpenAPI } from '../../types/substore.js';

export type DebugLogger = (message: string, detail?: object) => void;

export function createDebugLogger(prefix: string, enabled: boolean): DebugLogger {
    if (!enabled) {
        return () => {};
    }
    return (message: string, detail?: object): void => {
        if (typeof detail === 'undefined') {
            console.log(`[${prefix}][debug] ${message}`);
            return;
        }
        console.log(`[${prefix}][debug] ${message}`, detail);
    };
}

export async function withRetry<T>(
    run: () => Promise<T>,
    retries: number,
    retryDelayMs: number,
    logDebug?: DebugLogger,
    label = 'task',
): Promise<T> {
    let attempt = 0;
    let lastError: unknown = null;
    while (attempt <= retries) {
        try {
            const value = await run();
            if (attempt > 0 && logDebug) {
                logDebug('withRetry recovered', { label, attempt: attempt + 1 });
            }
            return value;
        } catch (error) {
            lastError = error;
            if (logDebug) {
                logDebug('withRetry failed', {
                    label,
                    attempt: attempt + 1,
                    maxAttempt: retries + 1,
                    error: toErrorMessage(error),
                });
            }
            if (attempt >= retries) break;
            await wait(retryDelayMs);
        }
        attempt += 1;
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function executeAsyncTasks<T>(
    tasks: Array<() => Promise<T>>,
    concurrency: number,
    logDebug?: DebugLogger,
): Promise<Array<T>> {
    if (!tasks.length) return [];

    const maxWorkers = Math.max(1, Math.min(concurrency, tasks.length));
    let cursor = 0;
    if (logDebug) {
        logDebug('executeAsyncTasks start', { taskCount: tasks.length, maxWorkers });
    }

    async function worker(): Promise<T | undefined> {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= tasks.length) return;
            return await tasks[index]();
        }
    }

    const results = await Promise.all(Array.from({ length: maxWorkers }, () => worker()));
    if (logDebug) {
        logDebug('executeAsyncTasks completed', { taskCount: tasks.length });
    }
    return results.filter((r) => r !== undefined);
}

export function safeJsonParse<T>(text: string): T | null {
    if (!text) return null;
    try {
        return JSON.parse(text) as T;
    } catch (_error) {
        return null;
    }
}

export async function wait(ms: number): Promise<void> {
    const runtime = (typeof $substore === 'undefined' ? undefined : $substore) as SubStoreOpenAPI | undefined;
    if (runtime && typeof runtime.wait === 'function') {
        await runtime.wait(ms);
        return;
    }
    await new Promise(resolve => setTimeout(resolve, ms));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isIp(value: string): boolean {
    const candidate = String(value || '').trim();
    if (!candidate) return false;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) {
        return candidate.split('.').every(part => {
            const num = Number(part);
            return Number.isInteger(num) && num >= 0 && num <= 255;
        });
    }
    return candidate.includes(':') && /^[a-fA-F0-9:]+$/.test(candidate);
}

export function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}
