import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { Storage } from './storage.ts';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// The field names are camelCase, as every TypeScript identifier in this repo is.
// The variable names are the five the owner sets in .env.
const ENV_NAMES: Record<keyof S3Config, string> = {
  endpoint: 'DENDRO_S3_ENDPOINT',
  region: 'DENDRO_S3_REGION',
  bucket: 'DENDRO_S3_BUCKET',
  accessKeyId: 'DENDRO_S3_ACCESS_KEY_ID',
  secretAccessKey: 'DENDRO_S3_SECRET_ACCESS_KEY',
};

export function s3ConfigFromEnv(env: Record<string, string | undefined>): S3Config {
  const missing: string[] = [];
  const read = (name: string): string => {
    const value = env[name];
    if (value === undefined || value.trim() === '') {
      missing.push(name);
      return '';
    }
    return value;
  };
  // Built field by field, in this order, so the message names the variables in
  // the order the owner set them and no cast is needed.
  const config: S3Config = {
    endpoint: read(ENV_NAMES.endpoint),
    region: read(ENV_NAMES.region),
    bucket: read(ENV_NAMES.bucket),
    accessKeyId: read(ENV_NAMES.accessKeyId),
    secretAccessKey: read(ENV_NAMES.secretAccessKey),
  };
  if (missing.length > 0) {
    throw new Error(`missing environment variables: ${missing.join(', ')}`);
  }
  return config;
}

function isNotFound(error: unknown): boolean {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
}

export function s3Storage(config: S3Config): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return {
    async head(key: string): Promise<boolean> {
      try {
        await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
      // No ACL: R2 serves the bucket through a public custom domain, not per-object ACLs.
      await client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }));
    },
    async remove(key: string): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
