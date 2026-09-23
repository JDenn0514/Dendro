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

/**
 * Holds every put in memory until `flush`. `cli build` validates before it uploads, so a
 * build that fails sends nothing to the bucket. A remove drops the queued put for the
 * same key, so a flush never uploads an object a remove has already taken out.
 */
export function deferredStorage(
  inner: Storage,
): Storage & { flush(): Promise<void>; pending: string[] } {
  const queue: { key: string; bytes: Uint8Array; contentType: string }[] = [];
  const pending: string[] = [];

  const drop = (key: string): void => {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index].key === key) queue.splice(index, 1);
    }
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (pending[index] === key) pending.splice(index, 1);
    }
  };

  return {
    pending,
    async head(key: string): Promise<boolean> {
      if (await inner.head(key)) return true;
      // A second approval of the same bytes in one build must not queue a second put.
      return pending.includes(key);
    },
    async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
      queue.push({ key, bytes, contentType });
      pending.push(key);
    },
    async remove(key: string): Promise<void> {
      drop(key);
      await inner.remove(key);
    },
    async flush(): Promise<void> {
      for (const item of queue) await inner.put(item.key, item.bytes, item.contentType);
      queue.length = 0;
      pending.length = 0;
    },
  };
}
