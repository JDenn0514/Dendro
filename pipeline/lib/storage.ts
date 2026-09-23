export interface Storage {
  head(key: string): Promise<boolean>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// The fake records the key and the content type of every put, so a test reads
// what the bucket would have been told.
export function memoryStorage(): Storage & {
  objects: Map<string, Uint8Array>;
  puts: { key: string; contentType: string }[];
} {
  const objects = new Map<string, Uint8Array>();
  const puts: { key: string; contentType: string }[] = [];

  return {
    objects,
    puts,
    async head(key: string): Promise<boolean> {
      return objects.has(key);
    },
    async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
      objects.set(key, bytes);
      puts.push({ key, contentType });
    },
    async remove(key: string): Promise<void> {
      objects.delete(key);
    },
  };
}
