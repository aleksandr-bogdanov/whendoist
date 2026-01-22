# Security Documentation

This document describes the security measures implemented in Whendoist.

## Authentication

### Session Management
- Sessions stored in signed cookies using `itsdangerous`
- 30-day expiration with secure flags
- `HttpOnly`, `SameSite=Lax`, `Secure` (production)
- Session token rotation on privilege changes

### OAuth 2.0
- Todoist OAuth for account linking
- Google OAuth for calendar integration
- State parameter for CSRF protection
- Tokens stored encrypted in database

### WebAuthn (Passkeys)
- FIDO2/WebAuthn for passwordless authentication
- Hardware security key support
- Platform authenticator support (Touch ID, Face ID)
- PRF extension for encryption key derivation

## Encryption

> **For a complete guide** — including whether you need encryption, what it protects against, and its limitations — see [ENCRYPTION.md](ENCRYPTION.md).

### Client-Side E2E Encryption
- AES-256-GCM for task data encryption
- PBKDF2 with 600,000 iterations (OWASP 2024)
- 32-byte random salt per user
- 12-byte random IV per encryption
- Encryption key never leaves client

### Encrypted Fields
- Task titles
- Task descriptions
- Domain names
- (All other fields remain plaintext for server-side filtering)

### Key Management
- Encryption key derived from user passphrase
- Key cached in `sessionStorage` (cleared on tab close)
- Multiple passkeys can unlock same data via key wrapping

## Network Security

### TLS/HTTPS
- All production traffic over HTTPS
- HSTS header enforced
- TLS 1.2+ required

### Security Headers (via SecurityHeadersMiddleware)
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: [configured CSP]
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### Content Security Policy
- Default-src restricted to 'self'
- Script-src allows inline for templates (nonce-based in future)
- Connect-src allows required APIs (Google, Todoist)
- Frame-ancestors 'none' (prevent clickjacking)

## Rate Limiting

### Per-Endpoint Limits (via slowapi)
- Authentication endpoints: 5 requests/minute
- Encryption operations: 10 requests/minute
- General API: 60 requests/minute
- Configurable via `app/middleware/rate_limit.py`

## Input Validation

### Request Validation
- Pydantic models for all API inputs
- Strict type checking
- Size limits on text fields
- SQL injection prevented by SQLAlchemy ORM

### Output Encoding
- Jinja2 auto-escaping enabled
- JSON serialization via Pydantic
- No raw HTML interpolation

## Database Security

### Multitenancy Isolation
- All queries filtered by `user_id`
- Foreign key constraints enforce ownership
- Batch operations silently skip unowned records
- See `CLAUDE.md` Rule #2 for implementation pattern

### Connection Security
- TLS connections to PostgreSQL
- Connection pooling with asyncpg
- Prepared statements for query execution

## Logging & Monitoring

### Audit Trail
- Request ID tracking via X-Request-ID header
- User ID included in log context
- Structured JSON logging in production

### Sensitive Data Handling
- No passwords logged
- Session tokens redacted
- API keys never in logs
- Sentry scrubs sensitive headers

## Dependencies

### Security Updates
- Dependencies pinned to minimum versions
- Regular `uv sync` for security patches
- Automated vulnerability scanning via GitHub

### Key Dependencies
- `cryptography`: Cryptographic operations
- `webauthn`: WebAuthn/FIDO2 implementation
- `itsdangerous`: Signed cookie sessions
- `slowapi`: Rate limiting

## Incident Response

### Error Handling
- Generic error messages to users
- Detailed errors in logs only
- Sentry alerts for exceptions (when configured)

### Data Breach Response
1. Invalidate all sessions
2. Force encryption key reset
3. Notify affected users
4. Review audit logs

## Security Checklist

### Before Production
- [ ] Generate unique SECRET_KEY
- [ ] Enable HTTPS only
- [ ] Configure OAuth with production credentials
- [ ] Review rate limit settings
- [ ] Enable Sentry for error tracking
- [ ] Verify CSP headers

### Regular Audits
- [ ] Review access logs monthly
- [ ] Update dependencies quarterly
- [ ] Rotate OAuth secrets annually
- [ ] Test WebAuthn flow periodically

## Reporting Vulnerabilities

Found a security issue? Please report responsibly:
1. Do not disclose publicly
2. Contact the maintainer directly
3. Provide steps to reproduce
4. Allow time for fix before disclosure
