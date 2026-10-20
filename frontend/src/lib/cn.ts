/** Joins class names, dropping empty ones. Variants are designed not to conflict, so no merge step. */
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
