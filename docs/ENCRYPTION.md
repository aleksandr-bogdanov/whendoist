# Encryption in Whendoist

> A plain-English guide to Whendoist's optional end-to-end encryption: what it does, what it doesn't do, whether you need it, and how it works under the hood.

---

## Table of Contents

1. [Do You Need Encryption?](#do-you-need-encryption)
2. [What Gets Encrypted](#what-gets-encrypted)
3. [How It Works](#how-it-works)
4. [Security Model](#security-model)
5. [Known Limitations](#known-limitations)
6. [Technical Details](#technical-details)

---

## Do You Need Encryption?

**Probably not.** Here's an honest assessment:

### When encryption makes sense

- You're a journalist, activist, or lawyer with genuinely sensitive task descriptions
- You don't trust cloud providers on principle
- Regulatory requirements (HIPAA, etc.) mandate client-side encryption
- You want the peace of mind, even if objectively unnecessary

### When encryption is overkill

- Your tasks are "Buy groceries" and "Call mom"
- You already trust Google with your calendar (which Whendoist reads)
- You'd rather not enter a passphrase every time you open a new tab
- You might forget your passphrase (there's no recovery — data is gone forever)

### What you're already protected by WITHOUT enabling encryption

| Threat | Protection |
|--------|------------|
| **Someone hacks the database** | Database is encrypted at rest (standard cloud provider feature) |
| **Data intercepted in transit** | HTTPS/TLS encrypts all traffic |
| **Whendoist employee reads your data** | We don't look at user data. But you have to trust us on that. |
| **Subpoena/legal request** | We'd have to comply. E2E encryption means we can't read it even if forced. |

**The honest trade-off:** E2E encryption protects you from *us* (the server operators) and anyone who compels us. If you trust us enough to use the app, you probably don't need it. If you don't trust us, enable it.

---

## What Gets Encrypted

When you enable encryption, **only three fields** are encrypted:

| Field | Encrypted | Why |
|-------|-----------|-----|
| Task title | Yes | Contains sensitive content |
| Task description | Yes | Contains sensitive content |
| Domain name | Yes | Could reveal projects/clients |
| Due date | No | Server needs this for filtering and reminders |
| Scheduled date/time | No | Server needs this for calendar display |
| Priority/Impact | No | Server needs this for sorting |
| Duration | No | Server needs this for time blocking |
| Completion status | No | Server needs this for filtering |
| Your email | No | Required for authentication |
| Google Calendar events | No | Fetched from Google, not stored |

**Why not encrypt everything?**

If we encrypted dates and priorities, the server couldn't:
- Show you "tasks due this week"
- Sort by priority
- Filter by status
- Send reminder notifications (future feature)

You'd have to download ALL tasks and filter client-side. That's slow and defeats the purpose of a web app.

**The design principle:** Encrypt the *content* (what you're doing), not the *metadata* (when you're doing it). The server knows you have a task due Tuesday at 2pm with high priority. It doesn't know that task is "Meet with divorce lawyer."

---

## How It Works

### Enabling encryption (one-time setup)

```
1. You enter a passphrase: "correct-horse-battery-staple"

2. Browser derives an encryption key using PBKDF2:
   - 600,000 iterations (takes ~1 second)
   - This slowness is intentional — it makes brute-force attacks impractical

3. Browser encrypts a test phrase with this key
   - Server stores the encrypted test phrase (not your passphrase!)
   - Used later to verify you entered the correct passphrase

4. Browser encrypts all your existing task titles/descriptions
   - Sends encrypted versions to server
   - Server can no longer read your content

5. Key is stored in browser's sessionStorage
   - Stays there while tab is open
   - Cleared when you close the tab
```

### Every subsequent session

```
1. You open Whendoist in a new tab

2. App detects encryption is enabled but key isn't available

3. You enter your passphrase

4. Browser derives the key again (PBKDF2, ~1 second)

5. Browser decrypts the test phrase to verify passphrase is correct
   - Wrong passphrase? Decryption fails. You're told to try again.
   - Right passphrase? Key is stored in sessionStorage, you proceed.

6. All task content is decrypted in your browser as you view it
```

### Creating/editing tasks

```
1. You type: "Call lawyer about custody hearing"

2. Before sending to server, browser encrypts it:
   → "7xK9mP2...base64...Qr8Y="

3. Server stores the encrypted blob
   - Server sees: "7xK9mP2...base64...Qr8Y="
   - Server has no idea what it says

4. When you view the task, browser decrypts it back
```

---

## Security Model

### What we're protecting against

| Threat | Protected? | How |
|--------|------------|-----|
| Database breach | ✅ Yes | Attacker gets encrypted blobs, not content |
| Malicious server admin | ✅ Yes | Server never sees plaintext or passphrase |
| Legal subpoena | ✅ Yes | We can only hand over encrypted data |
| Network eavesdropping | ✅ Yes | HTTPS + encryption = double protection |
| Someone steals your laptop (logged in) | ❌ No | They can see decrypted content in browser |
| Keylogger on your device | ❌ No | They capture your passphrase |
| XSS attack on Whendoist | ❌ No | Malicious script could read decrypted content |

### What we're NOT protecting against

**Compromised device:** If malware is on your computer, it can see everything you see. No browser-based encryption can protect against this. Use device encryption (FileVault, BitLocker) and don't install sketchy software.

**You forgetting your passphrase:** There is no recovery. We don't have your passphrase. We can't decrypt your data. If you forget it, your encrypted content is gone forever. Consider using a password manager.

**Metadata analysis:** An attacker who gets the database can still see:
- How many tasks you have
- When they're due
- How you prioritize things
- Your email address
- When you use the app

They just can't see *what* the tasks are about.

---

## Known Limitations

### The sessionStorage question

The encryption key is stored in `sessionStorage` while your tab is open. This is readable by JavaScript. People sometimes ask: "Isn't that insecure?"

**Short answer:** If malicious JavaScript is running on Whendoist, you have bigger problems than sessionStorage.

**Long answer:**

The concern is: what if an attacker injects malicious JavaScript (XSS attack)? That script could read `sessionStorage` and steal your key.

True. But that same script could also:
- Read the already-decrypted task content from the page
- Wait for you to type your passphrase and capture it
- Send your data directly to the attacker's server

**The key in sessionStorage isn't the weak point — the XSS vulnerability would be.** Our defenses are:

| Defense | What it does |
|---------|--------------|
| Content Security Policy (CSP) | Blocks unauthorized scripts from running |
| No user HTML rendering | Task content is never rendered as HTML |
| No `eval()` or `innerHTML` | User input can't become executable code |
| HTTPOnly cookies | Session tokens aren't accessible to JavaScript |

**Why not use a "more secure" storage?**

| Alternative | Problem |
|-------------|---------|
| IndexedDB | Still readable by JavaScript. Same XSS risk. |
| Non-extractable CryptoKey | Can't survive page refresh. You'd re-enter passphrase on every navigation. |
| WebAuthn PRF | Only works in Chrome 116+. Limited Safari/Firefox support. |
| Don't store it at all | Terrible UX. PBKDF2 takes 1 second. Every. Single. Click. |

**Our position:** sessionStorage with strong XSS prevention is the right trade-off for a browser-based app. The key is automatically cleared when you close the tab, limiting exposure.

### Browser-based encryption limitations

All browser-based E2E encryption shares these fundamental constraints:

1. **You must trust the code we serve.** If we wanted to steal your data, we could serve malicious JavaScript tomorrow. E2E encryption protects against passive threats (breaches, subpoenas), not active malicious developers.

2. **JavaScript crypto is slower than native.** PBKDF2 with 600k iterations takes ~1 second. Native apps could do it faster.

3. **No protection while tab is open.** The decrypted content is in memory and visible in the DOM.

These aren't bugs — they're inherent to the web platform. If you need protection against a malicious app developer, you need a native app you compile yourself from audited source code.

---

## Technical Details

For developers and security auditors.

### Algorithms

| Component | Algorithm | Parameters |
|-----------|-----------|------------|
| Key derivation | PBKDF2-HMAC-SHA256 | 600,000 iterations, 32-byte salt |
| Encryption | AES-256-GCM | 12-byte IV, 128-bit auth tag |
| Key storage | sessionStorage | Cleared on tab close |

### Encrypted data format

```
base64(IV || ciphertext || authTag)

Where:
- IV: 12 random bytes (unique per encryption)
- ciphertext: AES-256-GCM encrypted content
- authTag: 16-byte authentication tag (implicit in GCM)
```

### Key derivation

```javascript
// Pseudocode
salt = crypto.getRandomValues(32 bytes)  // Generated once, stored on server
key = PBKDF2(passphrase, salt, iterations=600000, hash=SHA-256, keyLength=256)
```

### What's stored where

| Data | Location | Encrypted? |
|------|----------|------------|
| Passphrase | Nowhere (never stored) | N/A |
| Salt | Server (UserPreferences) | No (not secret) |
| Test value | Server (UserPreferences) | Yes (verifies passphrase) |
| Derived key | Browser sessionStorage | No (it IS the encryption key) |
| Task content | Server (Task table) | Yes (when enabled) |

### Source code

- Client-side crypto: `static/js/crypto.js`
- Preferences storage: `app/models.py` (UserPreferences)
- Batch encrypt/decrypt: `app/routers/tasks.py` (/batch-update endpoint)

### Iteration count rationale

PBKDF2 with 600,000 iterations follows [OWASP 2024 recommendations](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). This makes brute-force attacks on stolen encrypted data impractical:

- 10-character random passphrase: ~10^18 guesses needed
- At 600k iterations: ~1 second per guess
- Time to crack: ~30 billion years

Even a weak 6-character passphrase would take years to crack at this iteration count.

---

## Summary

| Question | Answer |
|----------|--------|
| Should I enable encryption? | Only if you have genuinely sensitive tasks or don't trust cloud providers |
| What's encrypted? | Task titles, descriptions, domain names |
| What's NOT encrypted? | Dates, priorities, your email, calendar events |
| Can you recover my passphrase? | No. If you forget it, your data is gone. |
| Is sessionStorage secure? | Secure enough. XSS prevention is the real protection. |
| Is this "military grade"? | It's AES-256-GCM, which is as good as it gets. But browser-based crypto has inherent limits. |

---

*Last updated: January 2026 (v0.25.0)*
