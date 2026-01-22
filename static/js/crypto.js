/**
 * Client-side E2E encryption for Whendoist.
 *
 * Uses Web Crypto API for:
 * - PBKDF2 key derivation from passphrase
 * - AES-256-GCM encryption/decryption
 *
 * Architecture:
 * - One global toggle: window.WHENDOIST.encryptionEnabled
 * - If enabled, ALL task titles, descriptions, and domain names are encrypted
 * - If disabled, ALL are plaintext
 * - No per-record flags - encryption state is determined by user preference
 *
 * Encrypted data format: base64(IV || ciphertext || authTag)
 * IV is 12 bytes, authTag is implicit in AES-GCM
 */

const Crypto = (() => {
    // Constants
    const PBKDF2_ITERATIONS_V1 = 100000;  // Legacy (v0.8.0 - v0.11.x)
    const PBKDF2_ITERATIONS_V2 = 600000;  // Current - 2024 OWASP recommendation
    const IV_LENGTH = 12;  // 96 bits for AES-GCM
    const TEST_VALUE = 'WHENDOIST_ENCRYPTION_TEST';

    /**
     * Get iteration count based on encryption version.
     * @param {number} version - 1 for legacy, 2 for current
     * @returns {number} PBKDF2 iteration count
     */
    function getIterationCount(version) {
        return version >= 2 ? PBKDF2_ITERATIONS_V2 : PBKDF2_ITERATIONS_V1;
    }

    // Storage key for the derived encryption key (base64)
    const KEY_STORAGE_KEY = 'whendoist_encryption_key';

    // In-memory cache for CryptoKey object (avoids repeated importKey calls)
    // This is the main performance optimization - importKey is slow on mobile
    let cachedKey = null;

    // ==========================================================================
    // Low-level crypto utilities
    // ==========================================================================

    /**
     * Derive an AES-256-GCM key from a passphrase using PBKDF2.
     * @param {string} passphrase - User's encryption passphrase
     * @param {Uint8Array} salt - Random salt for key derivation
     * @param {number} iterations - PBKDF2 iteration count
     * @returns {Promise<CryptoKey>} Derived encryption key
     */
    async function deriveKey(passphrase, salt, iterations) {
        const encoder = new TextEncoder();

        // Import passphrase as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        // Derive AES-256-GCM key
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            true,  // extractable for storage
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Generate a random salt for key derivation.
     * @returns {Uint8Array} 32-byte random salt
     */
    function generateSalt() {
        return crypto.getRandomValues(new Uint8Array(32));
    }

    /**
     * Convert Uint8Array to base64 string.
     */
    function arrayToBase64(array) {
        return btoa(String.fromCharCode(...array));
    }

    /**
     * Convert base64 string to Uint8Array.
     */
    function base64ToArray(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Encrypt plaintext using AES-256-GCM.
     * @param {CryptoKey} key - AES encryption key
     * @param {string} plaintext - Text to encrypt
     * @returns {Promise<string>} Base64-encoded ciphertext with IV prepended
     */
    async function encrypt(key, plaintext) {
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoder.encode(plaintext)
        );

        // Combine IV + ciphertext
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), iv.length);

        return arrayToBase64(combined);
    }

    /**
     * Decrypt ciphertext using AES-256-GCM.
     * @param {CryptoKey} key - AES decryption key
     * @param {string} ciphertext - Base64-encoded ciphertext with IV prepended
     * @returns {Promise<string>} Decrypted plaintext
     */
    async function decrypt(key, ciphertext) {
        const combined = base64ToArray(ciphertext);
        const iv = combined.slice(0, IV_LENGTH);
        const data = combined.slice(IV_LENGTH);

        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data
        );

        const decoder = new TextDecoder();
        return decoder.decode(plaintext);
    }

    /**
     * Export a CryptoKey to a storable format.
     * @param {CryptoKey} key - Key to export
     * @returns {Promise<string>} Base64-encoded raw key bytes
     */
    async function exportKey(key) {
        const raw = await crypto.subtle.exportKey('raw', key);
        return arrayToBase64(new Uint8Array(raw));
    }

    /**
     * Import a key from storage format.
     * @param {string} keyData - Base64-encoded raw key bytes
     * @returns {Promise<CryptoKey>} Imported AES-GCM key
     */
    async function importKey(keyData) {
        const raw = base64ToArray(keyData);
        return await crypto.subtle.importKey(
            'raw',
            raw,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    // ==========================================================================
    // Key storage (sessionStorage - cleared on tab close)
    // ==========================================================================

    /**
     * Store derived key in sessionStorage and memory cache.
     * Key is cleared when browser tab closes.
     */
    async function storeKey(key) {
        cachedKey = key;  // Cache in memory for fast access
        const keyData = await exportKey(key);
        sessionStorage.setItem(KEY_STORAGE_KEY, keyData);
    }

    /**
     * Retrieve stored key from memory cache or sessionStorage.
     * Uses in-memory cache to avoid expensive importKey calls on every decrypt.
     * @returns {Promise<CryptoKey|null>} Stored key or null
     */
    async function getStoredKey() {
        // Return cached key if available (fast path)
        if (cachedKey) return cachedKey;

        // Fall back to sessionStorage (e.g., after page refresh)
        const keyData = sessionStorage.getItem(KEY_STORAGE_KEY);
        if (!keyData) return null;

        // Import and cache for subsequent calls
        cachedKey = await importKey(keyData);
        return cachedKey;
    }

    /**
     * Clear stored encryption key (on logout).
     */
    function clearStoredKey() {
        cachedKey = null;  // Clear memory cache
        sessionStorage.removeItem(KEY_STORAGE_KEY);
    }

    /**
     * Check if encryption key is currently available.
     */
    function hasStoredKey() {
        return sessionStorage.getItem(KEY_STORAGE_KEY) !== null;
    }

    // ==========================================================================
    // Global state helpers
    // ==========================================================================

    /**
     * Check if encryption is enabled for the current user.
     * @returns {boolean}
     */
    function isEncryptionEnabled() {
        return window.WHENDOIST?.encryptionEnabled === true;
    }

    /**
     * Check if we can perform encryption/decryption operations.
     * Requires both: encryption enabled AND key available in sessionStorage.
     * @returns {boolean}
     */
    function canCrypto() {
        return isEncryptionEnabled() && hasStoredKey();
    }

    /**
     * Get the encryption salt from window config.
     * @returns {string|null}
     */
    function getSalt() {
        return window.WHENDOIST?.encryptionSalt || null;
    }

    /**
     * Get the test value from window config.
     * @returns {string|null}
     */
    function getTestValue() {
        return window.WHENDOIST?.encryptionTestValue || null;
    }

    // ==========================================================================
    // Setup & unlock flows
    // ==========================================================================

    /**
     * Setup encryption with a new passphrase.
     * Generates salt, derives key, creates test value.
     * New setups use v2 (600k iterations) for stronger security.
     * @param {string} passphrase - User's chosen passphrase
     * @returns {Promise<{salt: string, testValue: string, version: number}>} Salt, encrypted test value, and version for server
     */
    async function setupEncryption(passphrase) {
        const salt = generateSalt();
        const version = 2;  // New setups always use v2 (600k iterations)
        const iterations = getIterationCount(version);
        const key = await deriveKey(passphrase, salt, iterations);

        // Create encrypted test value for verification
        const testValue = await encrypt(key, TEST_VALUE);

        // Store key in sessionStorage
        await storeKey(key);

        return {
            salt: arrayToBase64(salt),
            testValue: testValue,
            version: version
        };
    }

    /**
     * Get the encryption version from window config.
     * @returns {number} Encryption version (1 or 2, defaults to 1 for legacy)
     */
    function getEncryptionVersion() {
        return window.WHENDOIST?.encryptionVersion || 1;
    }

    /**
     * Unlock encryption with existing passphrase.
     * Verifies against stored test value before storing key.
     * Automatically uses correct iteration count based on encryption version.
     * @param {string} passphrase - User's passphrase
     * @returns {Promise<boolean>} True if unlock successful
     */
    async function unlockEncryption(passphrase) {
        const saltBase64 = getSalt();
        const testCiphertext = getTestValue();

        if (!saltBase64 || !testCiphertext) {
            throw new Error('Encryption salt or test value not available');
        }

        const salt = base64ToArray(saltBase64);
        const version = getEncryptionVersion();
        const iterations = getIterationCount(version);
        const key = await deriveKey(passphrase, salt, iterations);

        // Verify passphrase by decrypting test value
        try {
            const decrypted = await decrypt(key, testCiphertext);
            if (decrypted !== TEST_VALUE) {
                return false;  // Wrong passphrase
            }
        } catch (e) {
            return false;  // Decryption failed = wrong passphrase
        }

        // Passphrase is correct - store key
        await storeKey(key);
        return true;
    }

    /**
     * Test if a passphrase is correct without storing the key.
     * @param {string} passphrase - Passphrase to test
     * @param {string} saltBase64 - Base64-encoded salt
     * @param {string} testCiphertext - Encrypted test value
     * @param {number} version - Encryption version (1 or 2, defaults to 1)
     * @returns {Promise<boolean>} True if passphrase is correct
     */
    async function verifyPassphrase(passphrase, saltBase64, testCiphertext, version = 1) {
        try {
            const salt = base64ToArray(saltBase64);
            const iterations = getIterationCount(version);
            const key = await deriveKey(passphrase, salt, iterations);
            const decrypted = await decrypt(key, testCiphertext);
            return decrypted === TEST_VALUE;
        } catch {
            return false;
        }
    }

    // ==========================================================================
    // Field encryption/decryption
    // ==========================================================================

    /**
     * Encrypt a field value if encryption is enabled and key is available.
     * @param {string|null} value - Value to encrypt
     * @returns {Promise<string|null>} Encrypted value or original if can't encrypt
     */
    async function encryptField(value) {
        if (!value) return value;
        if (!canCrypto()) return value;

        const key = await getStoredKey();
        if (!key) return value;

        return await encrypt(key, value);
    }

    /**
     * Decrypt a field value if encryption is enabled and key is available.
     * @param {string|null} value - Value to decrypt
     * @returns {Promise<string|null>} Decrypted value or original if can't decrypt
     */
    async function decryptField(value) {
        if (!value) return value;
        if (!canCrypto()) return value;

        const key = await getStoredKey();
        if (!key) return value;

        try {
            return await decrypt(key, value);
        } catch (e) {
            console.error('Decryption failed:', e);
            return value;  // Return original if decryption fails
        }
    }

    // ==========================================================================
    // Batch operations (for enable/disable encryption)
    // ==========================================================================

    /**
     * Check if a value looks like encrypted data (base64 with min length).
     * AES-256-GCM: 12 bytes IV + ciphertext + 16 bytes tag = min 28 bytes = ~38 base64 chars
     * @param {string|null} value - Value to check
     * @returns {boolean} True if value appears to be encrypted
     */
    function looksEncrypted(value) {
        if (!value || value.length < 38) return false;
        return /^[A-Za-z0-9+/]+=*$/.test(value);
    }

    /**
     * Encrypt all tasks and domains for enabling encryption.
     * Skips values that are already encrypted to prevent double-encryption.
     * @param {Array<{id: number, title: string, description: string|null}>} tasks
     * @param {Array<{id: number, name: string}>} domains
     * @returns {Promise<{tasks: Array, domains: Array}>} Encrypted data
     */
    async function encryptAllData(tasks, domains) {
        const key = await getStoredKey();
        if (!key) throw new Error('No encryption key available');

        const encryptedTasks = await Promise.all(tasks.map(async (task) => ({
            id: task.id,
            // Skip if already encrypted
            title: looksEncrypted(task.title) ? task.title : await encrypt(key, task.title),
            description: task.description
                ? (looksEncrypted(task.description) ? task.description : await encrypt(key, task.description))
                : null
        })));

        const encryptedDomains = await Promise.all(domains.map(async (domain) => ({
            id: domain.id,
            // Skip if already encrypted
            name: looksEncrypted(domain.name) ? domain.name : await encrypt(key, domain.name)
        })));

        return { tasks: encryptedTasks, domains: encryptedDomains };
    }

    /**
     * Decrypt all tasks and domains for disabling encryption.
     * @param {Array<{id: number, title: string, description: string|null}>} tasks
     * @param {Array<{id: number, name: string}>} domains
     * @returns {Promise<{tasks: Array, domains: Array}>} Decrypted data
     */
    async function decryptAllData(tasks, domains) {
        const key = await getStoredKey();
        if (!key) throw new Error('No encryption key available');

        const decryptedTasks = await Promise.all(tasks.map(async (task) => {
            try {
                return {
                    id: task.id,
                    title: await decrypt(key, task.title),
                    description: task.description ? await decrypt(key, task.description) : null
                };
            } catch (e) {
                console.error(`Failed to decrypt task ${task.id}:`, e);
                // Return original if decryption fails (might already be plaintext)
                return task;
            }
        }));

        const decryptedDomains = await Promise.all(domains.map(async (domain) => {
            try {
                return {
                    id: domain.id,
                    name: await decrypt(key, domain.name)
                };
            } catch (e) {
                console.error(`Failed to decrypt domain ${domain.id}:`, e);
                return domain;
            }
        }));

        return { tasks: decryptedTasks, domains: decryptedDomains };
    }

    // ==========================================================================
    // Public API
    // ==========================================================================

    return {
        // State checks
        isEncryptionEnabled,
        canCrypto,
        hasStoredKey,

        // Key management
        getStoredKey,
        storeKey,
        clearStoredKey,

        // Setup & unlock
        setupEncryption,
        unlockEncryption,
        verifyPassphrase,

        // Field operations
        encryptField,
        decryptField,

        // Low-level (for advanced use)
        encrypt,
        decrypt,

        // Batch operations
        encryptAllData,
        decryptAllData,

        // Utilities
        arrayToBase64,
        base64ToArray
    };
})();

// Make available globally
window.Crypto = Crypto;
