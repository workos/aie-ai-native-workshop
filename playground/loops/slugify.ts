// Starter version for the loop exercise. It is intentionally naive so the
// check runner can drive a few small, visible fixes.
export function slugify(input: string): string {
  return input
    .trim()
    .replace(/&/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .replace(/--+/g, '-');
}
