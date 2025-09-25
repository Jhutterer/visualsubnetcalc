import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";

const __dirname = dirname(fileURLToPath(import.meta.url));
const certDir = join(__dirname, "..", "certs");
const certPath = join(certDir, "cert.pem");
const keyPath = join(certDir, "cert.key");

mkdirSync(certDir, { recursive: true });

function tryMkcert() {
  const mkcert = spawnSync(
    "mkcert",
    ["-cert-file", certPath, "-key-file", keyPath, "localhost", "127.0.0.1"],
    { stdio: "inherit", shell: true }
  );
  return mkcert.status === 0;
}

if (tryMkcert()) {
  console.info("mkcert certificate generated at %s", certPath);
  process.exit(0);
}

console.warn(
  "mkcert not available. Generating self-signed certificate (untrusted)."
);

const attrs = [{ name: "commonName", value: "localhost" }];
const pems = selfsigned.generate(attrs, {
  days: 825,
  algorithm: "sha256",
  keySize: 2048,
  extensions: [
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" },
        { type: 7, ip: "127.0.0.1" }
      ]
    }
  ]
});

writeFileSync(certPath, pems.cert);
writeFileSync(keyPath, pems.private);

console.info("Self-signed certificate generated at %s", certPath);
console.info("Key stored at %s", keyPath);
