export function stableStringify(obj) {
    if (typeof obj !== 'object' || obj === null) return JSON.stringify(obj);

    if (Array.isArray(obj)) {
        return '[' + obj.map(stableStringify).join(',') + ']';
    }

    const keys = Object.keys(obj).sort();
    const parts = keys.map(k => `"${k}":${stableStringify(obj[k])}`);
    return '{' + parts.join(',') + '}';
}
