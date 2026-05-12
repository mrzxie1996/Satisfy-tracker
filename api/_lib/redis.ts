import { Redis } from "@upstash/redis";

let _redis: Redis | null = null;

/** Same env names as Vercel “KV” / Upstash integration on the project. */
export function kvEnvReady(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function getRedis(): Redis {
  if (!kvEnvReady()) {
    throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
  }
  if (!_redis) {
    _redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return _redis;
}
