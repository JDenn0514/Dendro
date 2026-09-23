// This file needs node_modules, because s3_storage.ts imports the AWS client at the
// top level. Run it with npm run test:live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { s3ConfigFromEnv } from '../lib/s3_storage.ts';

const FULL_ENV: Record<string, string> = {
  DENDRO_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
  DENDRO_S3_REGION: 'auto',
  DENDRO_S3_BUCKET: 'dendro-images',
  DENDRO_S3_ACCESS_KEY_ID: 'key-id',
  DENDRO_S3_SECRET_ACCESS_KEY: 'secret',
};

test('s3ConfigFromEnv reads the five variables into the camelCase fields', () => {
  const config = s3ConfigFromEnv({ ...FULL_ENV, OTHER: 'ignored' });
  assert.deepEqual(config, {
    endpoint: 'https://account.r2.cloudflarestorage.com',
    region: 'auto',
    bucket: 'dendro-images',
    accessKeyId: 'key-id',
    secretAccessKey: 'secret',
  });
});

test('s3ConfigFromEnv names every missing variable and no other', () => {
  const env: Record<string, string | undefined> = { ...FULL_ENV };
  delete env.DENDRO_S3_BUCKET;
  delete env.DENDRO_S3_SECRET_ACCESS_KEY;
  assert.throws(
    () => s3ConfigFromEnv(env),
    (error: Error) => {
      assert.match(error.message, /DENDRO_S3_BUCKET/);
      assert.match(error.message, /DENDRO_S3_SECRET_ACCESS_KEY/);
      assert.doesNotMatch(error.message, /DENDRO_S3_REGION/);
      return true;
    },
  );
});

test('s3ConfigFromEnv counts a blank value as missing', () => {
  // An unset variable in a .env file reads as an empty string, which would
  // otherwise build a client that fails on the first request.
  assert.throws(
    () => s3ConfigFromEnv({ ...FULL_ENV, DENDRO_S3_ACCESS_KEY_ID: '   ' }),
    (error: Error) => error.message.includes('DENDRO_S3_ACCESS_KEY_ID'),
  );
});
