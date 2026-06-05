const AUTH_SECRET = "omnicanalidad-dev-secret";
const token =
  process.argv[2] ||
  "eyJpZCI6IjIiLCJhZ2VudElkIjoiMiIsInVzdWFyaW8iOiJhZG1pbiIsIm5vbWJyZSI6IkFkbWluaXN0cmFkb3IiLCJyb2xlIjoiYWRtaW5pc3RyYWRvciIsImV4cCI6MTc4MDc0MjA0MjQwM30.R6o1qHEANKv_m-QN5GU-7Zr_wavxEwCk7-AUgWGf9ro";

function base64UrlDecode(data) {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const base64 = pad ? padded + "=".repeat(4 - pad) : padded;
  return atob(base64);
}

async function computeHmacBase64Url(secret, data) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

const [data, sig] = token.split(".");
const expected = await computeHmacBase64Url(AUTH_SECRET, data);
console.log({ sig, expected, match: sig === expected });
console.log(JSON.parse(base64UrlDecode(data)));
