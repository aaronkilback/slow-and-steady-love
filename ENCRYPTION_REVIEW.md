# AEGIS Mobile — Team Messaging Encryption Review

## TL;DR

The encryption is **strong by primitive** but **incomplete by protocol**. Concretely:

- Cipher choice is industry-standard (libsodium, X25519 + XSalsa20-Poly1305, Argon2id).
- It is **not** a Signal-equivalent protocol. There is no forward secrecy, no future-secrecy ratcheting, no out-of-band key verification, and no cryptographic group messaging.
- For 1:1 team chat between trusted operators, today's implementation is meaningfully better than plaintext-on-server. For an adversary that can compromise the server *or* a user's device once, prior messages are recoverable.

If team messaging is a competitive feature for the FIFA-tier pitch, plan to invest 1–3 weeks closing the gaps below before claiming "Signal-equivalent" externally.

---

## What is implemented (`src/lib/encryption.ts`)

| Concern | Choice | Notes |
|---|---|---|
| Key exchange | X25519 (Curve25519 ECDH) | Implemented via `crypto_box_seed_keypair`. Public keys live in `profiles.public_key` on the mobile Supabase. |
| Symmetric cipher | XSalsa20-Poly1305 (`crypto_box_easy`) | Authenticated encryption, 192-bit nonce, 128-bit auth tag. |
| Key derivation | Argon2id with `OPSLIMIT_MODERATE` + `MEMLIMIT_MODERATE` | Strong by 2026 standards. Salt is per-user, base64-encoded, stored in `profiles.key_salt` and mirrored to localStorage. |
| Private-key-at-rest | Encrypted with a separately derived Argon2id key, sealed with XSalsa20-Poly1305 (`crypto_secretbox_easy`) | Encrypted blob lives in `localStorage` under `fortress_e2e_key_<userId>`. |
| Recovery | Same password + salt re-derives the same keypair deterministically | If the user remembers their password, key recovery works on a new device. If they forget, history is unrecoverable. |

What this means: the **primitives** are appropriate for E2E messaging. A server compromise on the mobile Supabase does not directly reveal plaintext, since:
- Private keys are never sent to the server.
- Stored ciphertext + nonce in `messages` table cannot be decrypted without the recipient's private key.
- The salt being known to the server is fine — Argon2id with a known salt is still hard.

---

## What is NOT implemented (the protocol-level gaps)

### 1. No forward secrecy

The X25519 keypair is **long-lived** — derived from the user's password once and reused for every message they ever receive.

**Implication:** if any single message is decrypted (e.g., device seizure, password compromise, malware on the phone) the attacker can also decrypt **every past and future** message that user ever exchanged with that peer.

Signal protects against this with the **Double Ratchet**: every message uses a fresh ephemeral key, and old keys are deleted as soon as they're used. AEGIS Mobile does not.

**Closing the gap:** ~2 weeks of work. Use libsignal-protocol-javascript or olm/megolm. Major lift but well-trodden.

### 2. No out-of-band key verification

When operator A messages operator B, A's client trusts whatever public key the server hands back for B. If the mobile Supabase is compromised — or someone with database write access wants to read team comms — they substitute their own public key, intercept the message, decrypt it, re-encrypt to B's real key, and forward. Neither operator notices.

Signal calls this "safety numbers" — a fingerprint of the two public keys that operators verify in person, by QR code, or by reading 6 digits aloud over a separate channel.

**Implication for FIFA-tier ops:** if the server admin (or anyone with Supabase access) is your threat model, this messaging is currently MITM-able by design.

**Closing the gap:** ~2 days. Show a fingerprint pair in the operator profile screens, give a "verify" button, persist verified-state in localStorage, warn loudly when the peer's fingerprint changes mid-conversation.

### 3. No deniable authentication

Standard e2e protocols separate "I sent this" (authentication for the recipient) from "I publicly committed to sending this" (a signature anyone can verify forever). AEGIS Mobile uses `crypto_box`, which gives **deniable** authentication — that's actually the *correct* default.

This is not a gap; flagging it for completeness because the README copy ("Signal-style") is accurate here.

### 4. No cryptographic group messaging

`messages` table has `encrypted` and `nonce` columns implying per-message ciphertext. For 1:1 the model is clear. For groups (broadcasts, multi-operator threads) a sender would need to encrypt **N times**, once per recipient, and join them at the application layer. The schema does not appear to support that.

**Implication:** if "broadcasts" or group chat are listed as encrypted, they likely aren't. Verify before claiming.

**Closing the gap:** Signal uses **sender keys** for groups — one symmetric key shared with each member's session, ratcheted per-message. ~1 week of work, or cap groups at small fixed sizes and just encrypt N times.

### 5. localStorage exposure to XSS

The encrypted private key blob lives in `localStorage`. If an XSS vulnerability ever lands in the app, the attacker reads the encrypted blob and **brute-forces the password** offline against Argon2id. With `MEMLIMIT_MODERATE` that's slow but not impossible against weak passwords.

**Closing the gap:**
- Strict CSP on the deployed Cloudflare Pages site (you already get most of this from Vite + a default CSP — verify the exact policy in `_headers` or the worker).
- Move private key to IndexedDB with `WebCrypto` extractable=false where possible (limits even local code from extracting raw key material).
- Bump Argon2id to `OPSLIMIT_SENSITIVE` for storage encryption — users only enter password once per session, so the latency hit is acceptable.

### 6. No ratchet / no message expiry

Every message ever exchanged is permanently in the database, encrypted with the same long-term keys. There is no ephemeral / disappearing message mode.

**Closing the gap:** application-layer feature. ~1 day for a server-side cron sweep that deletes messages older than `expire_after`. Not crypto work.

---

## Recommendations, ordered

If you continue to claim "E2E encrypted" and you want the claim to survive a real adversary:

1. **Add fingerprint verification** (~2 days). Highest-value, lowest-effort fix. Closes the obvious server-side MITM hole.
2. **Stricten CSP** on the deployed site so XSS can't read localStorage (~half day of header config).
3. **Bump Argon2id storage parameter to SENSITIVE** (one-line change, but invalidates existing stored keys — users re-enter password).
4. **Document the scope honestly** — "1:1 messaging encrypted with X25519 + XSalsa20-Poly1305; group chat is server-side only." Don't say "Signal-style" in marketing without the protocol.
5. **Forward secrecy via Double Ratchet** (~2 weeks). Only worth it if a sophisticated adversary is in the threat model. For team comms among trusted operators with strong device hygiene, the current model is acceptable.

---

## Phased upgrade plan to genuinely meet/exceed Signal

### P0 — Group encryption fix (shipped 2026-05-01)
Previous behavior: group messages were encrypted only for the *first* non-self participant. Every other recipient saw ciphertext they could not decrypt; the sender of a 5-person chat effectively wrote into a void for 4/5 of the group.

Implemented: `ConversationView.tsx` now produces a per-recipient envelope when there are 2+ recipients:
```json
{ "v": 1, "e": { "<user_id_a>": { "c": "<ciphertext>", "n": "<nonce>" }, ... } }
```
Each recipient (including the sender, so the sender can read history) gets their own ciphertext encrypted with `crypto_box_easy(plaintext, nonce, recipientPubkey, senderPrivkey)`. 1:1 conversations preserve the legacy single-ciphertext format for backward compatibility.

This is a stop-gap encryption fan-out, not Signal's sender-keys protocol — every additional recipient adds one X25519 box op on send. Acceptable up to ~20-person groups; beyond that, sender keys become important.

### Phase 1 — Verifiable + hardened (~2–3 days)
1. **Safety numbers UI.** When two operators open a 1:1, show the hex / 60-digit fingerprint of `(sender_pubkey || recipient_pubkey)` sorted. "Verified" state persisted in localStorage. If a peer's pubkey ever changes mid-conversation, surface a red banner ("This person's safety number has changed — confirm out-of-band before continuing"). Closes the server-side MITM hole.
2. **CSP tightening.** Strict CSP headers on the Cloudflare Pages deploy (`default-src 'self'`, no `unsafe-inline`, no `unsafe-eval`, explicit allowlist for the few external endpoints). Defends localStorage-stored encrypted privkey from XSS exfiltration.
3. **Argon2id → SENSITIVE.** One-line change in `encryption.ts`. Invalidates existing stored keys, so users re-enter password once. Doubles the offline brute-force cost for an attacker who has the encrypted privkey blob.

### Phase 2 — Forward secrecy (~2–3 weeks)
Adopt **libsignal-protocol-javascript** or **olm/megolm**. Concretely:
1. **X3DH** prekey bundles for new conversations — replaces the single-round X25519 with a richer initial handshake (identity + signed prekey + one-time prekey). Operators publish prekey bundles to Fortress; receivers consume them on first contact.
2. **Double Ratchet** session state — every message advances both a Diffie-Hellman ratchet and a symmetric chain. Keys derived for message N are deleted as soon as N is decrypted. Compromise of today's device does not reveal yesterday's plaintext.
3. **Sender keys for groups** — sender derives a chain key, distributes it once via per-recipient X3DH, then encrypts each subsequent group message with a single ratcheting symmetric key. Cuts the fan-out cost and adds in-group forward secrecy.

This is the work that earns "Signal-grade" externally.

### Phase 3 — Metadata protection (~1 week)
**Sealed sender** envelope. Today the server sees `(sender_id, recipient_id, conversation_id, timestamp)` per message — encrypted content but plaintext metadata. Sealed sender wraps the sender identity inside an envelope that only the recipient can open, so the server only sees the recipient. Worth doing once Phase 2 lands.

### What you cannot ever match without dedicated infra
- **Anonymous routing** (Tor / mixnets). Signal doesn't even claim this.
- **Forward secrecy on attachments at rest**. Per-message keys are easier; attachment keys are typically derived once and reused.

### Honest external claim once Phase 2 ships
> "End-to-end encrypted using the Signal Protocol — X25519 with prekey bundles, Double Ratchet for per-message forward secrecy, sender keys for groups, with operator-verifiable safety numbers."

That sentence becomes truthful after the phased work above. Until then, stay with the more conservative claim already documented in the TL;DR.

---

## Bottom line for the FIFA pitch

If a CRT sales conversation references "encrypted team messaging," what you can say truthfully today:

> "1:1 messages between operators are end-to-end encrypted with libsodium — X25519 key exchange and XSalsa20-Poly1305 authenticated encryption. Private keys never leave the device. Server compromise alone does not reveal plaintext."

What you should **not** say without the work above:

> "Signal-equivalent" / "perfect forward secrecy" / "verified end-to-end" / "MITM-resistant against the server" — none of these are accurate as of today.
