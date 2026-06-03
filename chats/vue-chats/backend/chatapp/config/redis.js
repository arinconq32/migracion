const redis = require("redis");

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const client = redis.createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: 2000,
    reconnectStrategy: (retries) => (retries > 2 ? false : Math.min(retries * 500, 1500)),
  },
});

let redisReady = false;
let connectPromise = null;

client.on("error", () => {
  redisReady = false;
});

async function ensureRedisConnected() {
  if (redisReady && client.isOpen) return true;
  if (!connectPromise) {
    connectPromise = client
      .connect()
      .then(() => {
        redisReady = true;
        console.log("✅ Conectado a Redis");
        return true;
      })
      .catch(() => {
        redisReady = false;
        return false;
      })
      .finally(() => {
        connectPromise = null;
      });
  }
  return connectPromise;
}

async function safeGet(key) {
  if (!(await ensureRedisConnected())) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

async function safeSet(key, value, options = {}) {
  if (!(await ensureRedisConnected())) return false;
  try {
    await client.set(key, value, options);
    return true;
  } catch {
    return false;
  }
}

async function safeDel(keys) {
  if (!(await ensureRedisConnected())) return false;
  try {
    await client.del(keys);
    return true;
  } catch {
    return false;
  }
}

async function safeKeys(pattern) {
  if (!(await ensureRedisConnected())) return [];
  try {
    return await client.keys(pattern);
  } catch {
    return [];
  }
}

module.exports = client;
module.exports.ensureRedisConnected = ensureRedisConnected;
module.exports.isRedisReady = () => redisReady && client.isOpen;
module.exports.safeGet = safeGet;
module.exports.safeSet = safeSet;
module.exports.safeDel = safeDel;
module.exports.safeKeys = safeKeys;
