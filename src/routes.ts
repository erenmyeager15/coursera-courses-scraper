// Pure parsing/export helpers. No source request, proxy, URL lookup or formula evaluation.
export function redactText(value: string): string {
    return value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
        .replace(/(?<!\w)(?:\+?\d[\s().-]*){9,}(?!\w)/g, '[redacted]')
        .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function numeric(value: unknown, max: number, integer = false): number | null {
    if (typeof value === 'string') {
        const clean = value.trim();
        if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(clean)) return null;
        value = Number(clean);
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) return null;
    return value;
}
export function safeCourseUrl(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 1000 || !/^https:\/\//i.test(value) || /[\u0000-\u0020\\]/.test(value)) return null;
    try {
        const url = new URL(value);
        if (!['www.coursera.org', 'coursera.org'].includes(url.hostname) || url.username || url.password || url.port
            || !/^\/(?:learn|specializations|professional-certificates|degrees|mastertrack|projects|guided-project)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return null;
        return 'https://www.coursera.org' + url.pathname.replace(/\/$/, '');
    } catch { return null; }
}
export function csvCell(value: unknown): string {
    const raw = value === null || value === undefined ? '' : Array.isArray(value) ? value.join(' | ') : String(value);
    const safe = /^[\s\uFEFF]*[=+\-@]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replace(/"/g, '""') + '"';
}
export function csv(headers: string[], rows: unknown[][]): string {
    return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function markdown(value: unknown): string {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&').replace(/[\r\n]/g, ' ');
}
export const round = (value: number): number => Math.round(value * 100) / 100;
export const skillKey = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
