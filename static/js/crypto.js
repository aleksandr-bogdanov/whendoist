/**
 * Client-side encryption for Whendoist E2E encryption.
 *
 * Uses Web Crypto API for:
 * - PBKDF2 key derivation from passphrase
 * - AES-256-GCM encryption/decryption
 *
 * Encrypted data format: base64(IV || ciphertext || authTag)
 * IV is 12 bytes, authTag is implicit in AES-GCM
 */

const Crypto = (() => {
    // Constants
    const PBKDF2_ITERATIONS = 100000;
    const IV_LENGTH = 12;  // 96 bits for AES-GCM

    // Storage key for the derived encryption key (base64)
    const KEY_STORAGE_KEY = 'whendoist_encryption_key';
    const SALT_STORAGE_KEY = 'whendoist_encryption_salt';

    /**
     * Derive an AES-256-GCM key from a passphrase using PBKDF2.
     * @param {string} passphrase - User's encryption passphrase
     * @param {Uint8Array} salt - Random salt for key derivation
     * @returns {Promise<CryptoKey>} Derived encryption key
     */
    async function deriveKey(passphrase, salt) {
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
                iterations: PBKDF2_ITERATIONS,
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

    /**
     * Store derived key in sessionStorage.
     * Key is cleared when browser tab closes.
     */
    async function storeKey(key, salt) {
        const keyData = await exportKey(key);
        sessionStorage.setItem(KEY_STORAGE_KEY, keyData);
        sessionStorage.setItem(SALT_STORAGE_KEY, arrayToBase64(salt));
    }

    /**
     * Retrieve stored key from sessionStorage.
     * @returns {Promise<CryptoKey|null>} Stored key or null
     */
    async function getStoredKey() {
        const keyData = sessionStorage.getItem(KEY_STORAGE_KEY);
        if (!keyData) return null;
        return await importKey(keyData);
    }

    /**
     * Get stored salt from sessionStorage.
     * @returns {Uint8Array|null} Stored salt or null
     */
    function getStoredSalt() {
        const saltData = sessionStorage.getItem(SALT_STORAGE_KEY);
        if (!saltData) return null;
        return base64ToArray(saltData);
    }

    /**
     * Clear stored encryption key (on logout).
     */
    function clearStoredKey() {
        sessionStorage.removeItem(KEY_STORAGE_KEY);
        sessionStorage.removeItem(SALT_STORAGE_KEY);
    }

    /**
     * Check if encryption key is currently available.
     */
    function hasStoredKey() {
        return sessionStorage.getItem(KEY_STORAGE_KEY) !== null;
    }

    /**
     * Setup encryption with a new passphrase.
     * @param {string} passphrase - User's chosen passphrase
     * @returns {Promise<{key: CryptoKey, salt: string}>} Key and base64-encoded salt
     */
    async function setupEncryption(passphrase) {
        const salt = generateSalt();
        const key = await deriveKey(passphrase, salt);
        await storeKey(key, salt);
        return {
            key,
            salt: arrayToBase64(salt)
        };
    }

    /**
     * Unlock encryption with existing passphrase.
     * @param {string} passphrase - User's passphrase
     * @param {string} saltBase64 - Base64-encoded salt from server
     * @returns {Promise<CryptoKey>} Derived key
     */
    async function unlockEncryption(passphrase, saltBase64) {
        const salt = base64ToArray(saltBase64);
        const key = await deriveKey(passphrase, salt);
        await storeKey(key, salt);
        return key;
    }

    /**
     * Test if passphrase is correct by trying to decrypt a test value.
     * @param {string} passphrase - Passphrase to test
     * @param {string} saltBase64 - Base64-encoded salt
     * @param {string} testCiphertext - Encrypted test value
     * @param {string} expectedPlaintext - Expected decrypted value
     * @returns {Promise<boolean>} True if passphrase is correct
     */
    async function verifyPassphrase(passphrase, saltBase64, testCiphertext, expectedPlaintext) {
        try {
            const salt = base64ToArray(saltBase64);
            const key = await deriveKey(passphrase, salt);
            const decrypted = await decrypt(key, testCiphertext);
            return decrypted === expectedPlaintext;
        } catch {
            return false;
        }
    }

    /**
     * Encrypt task data for API submission.
     * @param {Object} task - Task object with title, description
     * @returns {Promise<Object>} Task with encrypted fields
     */
    async function encryptTask(task) {
        const key = await getStoredKey();
        if (!key) return task;  // Return unencrypted if no key

        const encrypted = { ...task };

        if (task.title) {
            encrypted.title = await encrypt(key, task.title);
            encrypted.title_encrypted = true;
        }

        if (task.description) {
            encrypted.description = await encrypt(key, task.description);
            encrypted.description_encrypted = true;
        }

        return encrypted;
    }

    /**
     * Decrypt task data received from API.
     * @param {Object} task - Task object with potentially encrypted fields
     * @returns {Promise<Object>} Task with decrypted fields
     */
    async function decryptTask(task) {
        const key = await getStoredKey();
        if (!key) return task;  // Return as-is if no key

        const decrypted = { ...task };

        try {
            if (task.title_encrypted && task.title) {
                decrypted.title = await decrypt(key, task.title);
            }
            if (task.description_encrypted && task.description) {
                decrypted.description = await decrypt(key, task.description);
            }
        } catch (e) {
            console.error('Failed to decrypt task:', e);
            // Return with encrypted values if decryption fails
        }

        return decrypted;
    }

    /**
     * Encrypt domain data for API submission.
     * @param {Object} domain - Domain object with name
     * @returns {Promise<Object>} Domain with encrypted fields
     */
    async function encryptDomain(domain) {
        const key = await getStoredKey();
        if (!key) return domain;

        const encrypted = { ...domain };

        if (domain.name) {
            encrypted.name = await encrypt(key, domain.name);
            encrypted.name_encrypted = true;
        }

        return encrypted;
    }

    /**
     * Decrypt domain data received from API.
     * @param {Object} domain - Domain object with potentially encrypted fields
     * @returns {Promise<Object>} Domain with decrypted fields
     */
    async function decryptDomain(domain) {
        const key = await getStoredKey();
        if (!key) return domain;

        const decrypted = { ...domain };

        try {
            if (domain.name_encrypted && domain.name) {
                decrypted.name = await decrypt(key, domain.name);
            }
        } catch (e) {
            console.error('Failed to decrypt domain:', e);
        }

        return decrypted;
    }

    /**
     * Decrypt a list of items (tasks or domains).
     * @param {Array} items - List of items to decrypt
     * @param {Function} decryptFn - Decryption function to use
     * @returns {Promise<Array>} Decrypted items
     */
    async function decryptList(items, decryptFn) {
        return Promise.all(items.map(item => decryptFn(item)));
    }

    // Public API
    return {
        // Setup & unlock
        setupEncryption,
        unlockEncryption,
        verifyPassphrase,

        // Key management
        hasStoredKey,
        getStoredKey,
        clearStoredKey,
        getStoredSalt,

        // Encryption/decryption
        encrypt,
        decrypt,

        // Task encryption
        encryptTask,
        decryptTask,

        // Domain encryption
        encryptDomain,
        decryptDomain,

        // Utility
        decryptList,
        arrayToBase64,
        base64ToArray
    };
})();

// Make available globally
window.Crypto = Crypto;
