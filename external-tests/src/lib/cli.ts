export function positiveInt(value: string | undefined, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer (got ${value})`);
  return n;
}

export function intList(value: string | undefined, name: string): number[] {
  return (value ?? '').split(',').map((v) => positiveInt(v.trim(), name));
}
