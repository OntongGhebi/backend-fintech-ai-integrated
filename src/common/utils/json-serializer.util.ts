export function serializeBigInt<T>(value: T): T {
  if (typeof value === 'bigint') {
    return value.toString() as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return (value as unknown[]).map((item: unknown) =>
      serializeBigInt(item),
    ) as T;
  }

  if (value !== null && typeof value === 'object') {
    const serialized: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      serialized[key] = serializeBigInt(nestedValue);
    }

    return serialized as T;
  }

  return value;
}
