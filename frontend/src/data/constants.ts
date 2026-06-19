import { Credentials } from './credentials';

export const BASE_URL = `${Credentials.LOCAL.replace(/\/$/, '')}/v1`;

export const MAX_RECORDING_DURATION_DEFAULT = 60; // in seconds

export const BACKOFF = {
  BASE_MS: 2000, // 2 seconds in ms
  MAX_MS: 64000, // 64 seconds in ms
};

export const MAX_RETRIES = 5;
