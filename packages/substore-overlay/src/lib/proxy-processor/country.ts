export function normalizeCountryCode(value: unknown): string {
    const code = String(value || '').trim().toUpperCase();
    return code || 'ZZ';
}
