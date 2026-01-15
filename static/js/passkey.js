/**
 * WebAuthn passkey handling for Whendoist E2E encryption.
 *
 * Architecture:
 * - Master key: the actual encryption key (from PBKDF2 passphrase or first passkey)
 * - Wrapping key: PRF-derived key used to wrap/unwrap the master key
 * - Each passkey stores: wrapped_key = encrypt(wrapping_key, master_key)
 *
 * Registration: Get master key from session → wrap with PRF key → store wrapped_key
 * Authentication: Get wrapped_key from server → unwrap with PRF key → verify → store
 *
 * This ensures all passkeys unlock the SAME master key.
 */

const Passkey = (() => {
    // PRF input prefix for consistent key derivation
    const PRF_SALT_PREFIX = 'whendoist-e2e-encryption-v1:';

    // IV size for AES-GCM wrapping
    const IV_SIZE = 12;

    // ==========================================================================
    // Browser Support Detection
    // ==========================================================================

    /**
     * Check if browser supports WebAuthn.
     * @returns {boolean}
     */
    function isSupported() {
        return window.PublicKeyCredential !== undefined;
    }

    /**
     * Check if browser supports conditional UI (autofill).
     * Not required for our use case, but nice to have.
     * @returns {Promise<boolean>}
     */
    async function isConditionalUISupported() {
        if (!isSupported()) return false;
        try {
            return await PublicKeyCredential.isConditionalMediationAvailable?.() ?? false;
        } catch {
            return false;
        }
    }

    /**
     * Check if PRF extension is likely supported.
     * Note: Full PRF support detection requires attempting a credential operation.
     * @returns {boolean}
     */
    function isPrfLikelySupported() {
        // PRF support: Chrome 116+, Safari 17+, Edge 116+
        // Best-effort check - actual support verified at credential creation
        return isSupported();
    }

    // ==========================================================================
    // Encoding Utilities
    // ==========================================================================

    /**
     * Encode string to Uint8Array.
     */
    function stringToArray(str) {
        return new TextEncoder().encode(str);
    }

    /**
     * Convert ArrayBuffer to base64url string.
     */
    function arrayBufferToBase64url(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Convert base64url string to Uint8Array.
     */
    function base64urlToArray(base64url) {
        // Add padding
        const base64 = base64url
            .replace(/-/g, '+')
            .replace(/_/g, '/')
            .padEnd(base64url.length + (4 - base64url.length % 4) % 4, '=');
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Generate random bytes as base64url string.
     */
    function generateRandomBase64url(length = 32) {
        const bytes = crypto.getRandomValues(new Uint8Array(length));
        return arrayBufferToBase64url(bytes);
    }

    // ==========================================================================
    // PRF Key Derivation
    // ==========================================================================

    /**
     * Encode PRF input for consistent key derivation.
     * @param {string} salt - Random salt for this passkey
     * @returns {Uint8Array} PRF input bytes
     */
    function encodePrfInput(salt) {
        return stringToArray(PRF_SALT_PREFIX + salt);
    }

    /**
     * Import PRF output as AES-256-GCM CryptoKey (for wrapping).
     * @param {ArrayBuffer} prfOutput - 32 bytes from PRF extension
     * @returns {Promise<CryptoKey>}
     */
    async function prfOutputToWrappingKey(prfOutput) {
        return await crypto.subtle.importKey(
            'raw',
            prfOutput,
            { name: 'AES-GCM', length: 256 },
            false,  // not extractable - only used for wrap/unwrap
            ['encrypt', 'decrypt']  // for wrapping/unwrapping
        );
    }

    /**
     * Get PRF extension results from a credential.
     * @param {PublicKeyCredential} credential
     * @returns {ArrayBuffer|null} PRF output or null if not available
     */
    function getPrfOutput(credential) {
        const results = credential.getClientExtensionResults();
        // Check for hmac-secret style (older) and prf style (newer)
        const prfResults = results.prf?.results;
        if (prfResults?.first) {
            return prfResults.first;
        }
        return null;
    }

    // ==========================================================================
    // Key Wrapping (for storing master key)
    // ==========================================================================

    /**
     * Wrap (encrypt) the master key with the PRF-derived wrapping key.
     * Format: base64url(IV + ciphertext)
     *
     * @param {CryptoKey} wrappingKey - PRF-derived key
     * @param {CryptoKey} masterKey - The actual encryption key to wrap
     * @returns {Promise<string>} Base64url encoded wrapped key
     */
    async function wrapMasterKey(wrappingKey, masterKey) {
        // Export master key to raw bytes
        const masterKeyRaw = await crypto.subtle.exportKey('raw', masterKey);

        // Generate random IV
        const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));

        // Encrypt the master key
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            wrappingKey,
            masterKeyRaw
        );

        // Combine IV + ciphertext
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);

        return arrayBufferToBase64url(combined.buffer);
    }

    /**
     * Unwrap (decrypt) the master key from wrapped format.
     *
     * @param {CryptoKey} wrappingKey - PRF-derived key
     * @param {string} wrappedKey - Base64url encoded wrapped key
     * @returns {Promise<CryptoKey>} The unwrapped master key
     */
    async function unwrapMasterKey(wrappingKey, wrappedKey) {
        // Decode wrapped key
        const combined = base64urlToArray(wrappedKey);

        // Split IV and ciphertext
        const iv = combined.slice(0, IV_SIZE);
        const ciphertext = combined.slice(IV_SIZE);

        // Decrypt the master key
        const masterKeyRaw = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            wrappingKey,
            ciphertext
        );

        // Import as CryptoKey
        return await crypto.subtle.importKey(
            'raw',
            masterKeyRaw,
            { name: 'AES-GCM', length: 256 },
            true,  // extractable (for Crypto.storeKey)
            ['encrypt', 'decrypt']
        );
    }

    // ==========================================================================
    // Credential Serialization
    // ==========================================================================

    /**
     * Convert PublicKeyCredential to JSON for server transmission.
     * @param {PublicKeyCredential} credential
     * @returns {object}
     */
    function credentialToJSON(credential) {
        const response = credential.response;

        const json = {
            id: credential.id,
            rawId: arrayBufferToBase64url(credential.rawId),
            type: credential.type,
            response: {},
        };

        // Registration response
        if (response.attestationObject) {
            json.response.attestationObject = arrayBufferToBase64url(response.attestationObject);
            json.response.clientDataJSON = arrayBufferToBase64url(response.clientDataJSON);
            if (response.getTransports) {
                json.response.transports = response.getTransports();
            }
        }

        // Authentication response
        if (response.authenticatorData) {
            json.response.authenticatorData = arrayBufferToBase64url(response.authenticatorData);
            json.response.clientDataJSON = arrayBufferToBase64url(response.clientDataJSON);
            json.response.signature = arrayBufferToBase64url(response.signature);
            if (response.userHandle) {
                json.response.userHandle = arrayBufferToBase64url(response.userHandle);
            }
        }

        return json;
    }

    /**
     * Parse server options for navigator.credentials.create().
     * @param {object} options - Options from server
     * @returns {object} Parsed options with ArrayBuffers
     */
    function parseCreationOptions(options) {
        return {
            ...options,
            challenge: base64urlToArray(options.challenge),
            user: {
                ...options.user,
                id: base64urlToArray(options.user.id),
            },
            excludeCredentials: (options.excludeCredentials || []).map(cred => ({
                ...cred,
                id: base64urlToArray(cred.id),
            })),
        };
    }

    /**
     * Parse server options for navigator.credentials.get().
     * @param {object} options - Options from server
     * @returns {object} Parsed options with ArrayBuffers
     */
    function parseRequestOptions(options) {
        return {
            ...options,
            challenge: base64urlToArray(options.challenge),
            allowCredentials: (options.allowCredentials || []).map(cred => ({
                ...cred,
                id: base64urlToArray(cred.id),
            })),
        };
    }

    // ==========================================================================
    // Registration Flow
    // ==========================================================================

    /**
     * Create a credential with PRF extension.
     * @param {object} serverOptions - Options from /api/passkeys/register/options
     * @param {string} prfSalt - Random salt for PRF key derivation
     * @returns {Promise<{credential: object, prfOutput: ArrayBuffer|null}>}
     */
    async function createCredential(serverOptions, prfSalt) {
        const publicKeyOptions = parseCreationOptions(serverOptions);

        // Add PRF extension
        const credentialOptions = {
            publicKey: {
                ...publicKeyOptions,
                extensions: {
                    prf: {
                        eval: {
                            first: encodePrfInput(prfSalt),
                        },
                    },
                },
            },
        };

        const credential = await navigator.credentials.create(credentialOptions);
        const prfOutput = getPrfOutput(credential);

        return {
            credential: credentialToJSON(credential),
            prfOutput,
        };
    }

    /**
     * Complete passkey registration flow.
     *
     * IMPORTANT: User must already be unlocked (have master key in session).
     *
     * 1. Get current master key from session
     * 2. Get registration options from server
     * 3. Create credential with PRF extension
     * 4. Derive wrapping key from PRF output
     * 5. Wrap master key with wrapping key
     * 6. Send credential + wrapped_key to server
     *
     * @param {string} name - User-provided name for this passkey
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function registerPasskey(name) {
        try {
            // 1. Check if we have the master key in session
            if (!Crypto.hasStoredKey()) {
                throw new Error('You must unlock encryption first before adding a passkey');
            }

            // Get the current master key
            const masterKey = await Crypto.getStoredKey();
            if (!masterKey) {
                throw new Error('Failed to retrieve encryption key from session');
            }

            // 2. Get registration options from server
            const optionsRes = await fetch('/api/passkeys/register/options', {
                method: 'POST',
                credentials: 'same-origin',
            });

            if (!optionsRes.ok) {
                throw new Error('Failed to get registration options');
            }

            const { options } = await optionsRes.json();

            // 3. Generate PRF salt
            const prfSalt = generateRandomBase64url(32);

            // 4. Create credential with PRF
            const { credential, prfOutput } = await createCredential(options, prfSalt);

            if (!prfOutput) {
                throw new Error('Passkey does not support PRF extension. Please try a different authenticator.');
            }

            // 5. Derive wrapping key from PRF output
            const wrappingKey = await prfOutputToWrappingKey(prfOutput);

            // 6. Wrap the master key
            const wrappedKey = await wrapMasterKey(wrappingKey, masterKey);

            // 7. Send to server for verification
            const verifyRes = await fetch('/api/passkeys/register/verify', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    credential,
                    name,
                    prf_salt: prfSalt,
                    wrapped_key: wrappedKey,
                }),
            });

            if (!verifyRes.ok) {
                const error = await verifyRes.json();
                throw new Error(error.detail || 'Registration verification failed');
            }

            return { success: true };
        } catch (error) {
            console.error('Passkey registration failed:', error);
            return {
                success: false,
                error: error.message || 'Registration failed',
            };
        }
    }

    // ==========================================================================
    // Authentication Flow
    // ==========================================================================

    /**
     * Authenticate with an existing passkey using PRF extension.
     * @param {object} serverOptions - Options from /api/passkeys/authenticate/options
     * @param {string} prfSalt - PRF salt for this passkey
     * @returns {Promise<{credential: object, prfOutput: ArrayBuffer|null, credentialId: string}>}
     */
    async function getCredential(serverOptions, prfSalt) {
        const publicKeyOptions = parseRequestOptions(serverOptions);

        // Add PRF extension
        const credentialOptions = {
            publicKey: {
                ...publicKeyOptions,
                extensions: {
                    prf: {
                        eval: {
                            first: encodePrfInput(prfSalt),
                        },
                    },
                },
            },
        };

        const credential = await navigator.credentials.get(credentialOptions);
        const prfOutput = getPrfOutput(credential);

        return {
            credential: credentialToJSON(credential),
            prfOutput,
            credentialId: credential.id,
        };
    }

    /**
     * Complete passkey authentication flow (unlock encryption).
     *
     * 1. Get authentication options from server (includes wrapped_key)
     * 2. Authenticate with passkey + PRF extension
     * 3. Derive wrapping key from PRF output
     * 4. Unwrap the wrapped_key to get master key
     * 5. Verify master key against test value (from WHENDOIST config)
     * 6. Store master key in sessionStorage
     * 7. Notify server of successful authentication
     *
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function unlockWithPasskey() {
        try {
            // 1. Get authentication options from server
            const optionsRes = await fetch('/api/passkeys/authenticate/options', {
                method: 'POST',
                credentials: 'same-origin',
            });

            if (!optionsRes.ok) {
                throw new Error('Failed to get authentication options');
            }

            const { options, prf_salt, wrapped_key, has_passkeys } = await optionsRes.json();

            if (!has_passkeys) {
                throw new Error('No passkeys registered');
            }

            // 2. Authenticate with PRF
            let { credential, prfOutput, credentialId } = await getCredential(options, prf_salt);

            if (!prfOutput) {
                throw new Error('PRF extension not supported by this authenticator');
            }

            // 3. Derive wrapping key from PRF output
            let wrappingKey = await prfOutputToWrappingKey(prfOutput);

            // 4. Try to unwrap the master key
            let masterKey;
            let usedCredentialData = { prf_salt, wrapped_key };

            try {
                masterKey = await unwrapMasterKey(wrappingKey, wrapped_key);
            } catch (unwrapError) {
                // The credential ID might be different than the first passkey
                // Look up the correct wrapped_key for this credential
                console.log('Initial unwrap failed, looking up credential-specific data...');

                const lookupRes = await fetch(`/api/passkeys/by-credential/${encodeURIComponent(credentialId)}`, {
                    credentials: 'same-origin',
                });

                if (!lookupRes.ok) {
                    throw new Error('Failed to look up passkey data');
                }

                const lookupData = await lookupRes.json();
                usedCredentialData = lookupData;

                // Re-authenticate with the correct PRF salt
                const retry = await getCredential(options, lookupData.prf_salt);
                if (!retry.prfOutput) {
                    throw new Error('PRF extension failed on retry');
                }

                // Update credential for server verification
                credential = retry.credential;

                // Derive wrapping key with correct salt
                wrappingKey = await prfOutputToWrappingKey(retry.prfOutput);

                // Unwrap with correct wrapped_key
                masterKey = await unwrapMasterKey(wrappingKey, lookupData.wrapped_key);
            }

            // 5. Verify master key by decrypting the global test value
            const testValue = window.WHENDOIST?.encryptionTestValue;
            if (!testValue) {
                throw new Error('Encryption test value not configured');
            }

            try {
                const decrypted = await Crypto.decrypt(masterKey, testValue);
                if (decrypted !== 'WHENDOIST_ENCRYPTION_TEST') {
                    throw new Error('Key verification failed - decrypted value mismatch');
                }
            } catch (verifyError) {
                console.error('Key verification failed:', verifyError);
                throw new Error('Invalid passkey - unable to decrypt data');
            }

            // 6. Store master key in sessionStorage
            await Crypto.storeKey(masterKey);

            // 7. Notify server of successful authentication (updates sign count)
            await fetch('/api/passkeys/authenticate/verify', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential }),
            });

            return { success: true };
        } catch (error) {
            console.error('Passkey authentication failed:', error);
            return {
                success: false,
                error: error.message || 'Authentication failed',
            };
        }
    }

    // ==========================================================================
    // Public API
    // ==========================================================================

    return {
        // Support detection
        isSupported,
        isConditionalUISupported,
        isPrfLikelySupported,

        // Registration
        registerPasskey,

        // Authentication
        unlockWithPasskey,

        // Low-level (for advanced use)
        createCredential,
        getCredential,
        credentialToJSON,
        wrapMasterKey,
        unwrapMasterKey,
    };
})();

// Make available globally
window.Passkey = Passkey;
