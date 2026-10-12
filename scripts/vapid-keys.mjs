// Generates a VAPID key pair for Web Push. Run once per environment:
//
//   node scripts/vapid-keys.mjs            # prints both keys
//   node scripts/vapid-keys.mjs >> .dev.vars
//
// The public key is the raw uncompressed P-256 point, base64url; the private
// key is the JWK `d` parameter. That is the format every web-push library and
// browser expects, and what the Worker reads from VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY.

import { webcrypto } from 'node:crypto'

const b64url = (bytes) => Buffer.from(bytes).toString('base64url')

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const raw = await webcrypto.subtle.exportKey('raw', pair.publicKey)
const jwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey)

console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`)
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`)
