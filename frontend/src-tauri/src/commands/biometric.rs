//! Biometric authentication for encryption key access.
//!
//! Uses `tauri-plugin-biometric` (official) for Face ID / Touch ID / fingerprint
//! authentication, and `tauri-plugin-store` for key persistence in the app sandbox.
//!
//! The stored key is the base64-encoded AES-256-GCM derived key from Web Crypto.
//! Rust never performs encryption — it only stores/retrieves the key blob.

use serde::Serialize;

/// File name for the biometric key store (inside app's private data dir).
const BIOMETRIC_STORE_FILE: &str = "biometric-keys.json";
/// Key under which the encryption key is stored.
const BIOMETRIC_KEY_ENTRY: &str = "encryption_key";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiometricAvailability {
    pub available: bool,
    pub biometry_type: String,
}

/// Check if biometric authentication is available on this device.
///
/// Returns availability status and the type of biometric (faceId, touchId, none).
/// On desktop, always returns unavailable.
#[tauri::command]
pub fn check_biometric_availability(
    app: tauri::AppHandle,
) -> Result<BiometricAvailability, String> {
    #[cfg(mobile)]
    {
        use tauri_plugin_biometric::BiometricExt;

        match app.biometric().status() {
            Ok(status) => {
                let biometry_type = format!("{:?}", status.biometry_type);
                Ok(BiometricAvailability {
                    available: status.is_available,
                    biometry_type,
                })
            }
            Err(e) => {
                log::warn!("Biometric status check failed: {e}");
                Ok(BiometricAvailability {
                    available: false,
                    biometry_type: "None".to_string(),
                })
            }
        }
    }

    #[cfg(not(mobile))]
    {
        let _ = app;
        Ok(BiometricAvailability {
            available: false,
            biometry_type: "None".to_string(),
        })
    }
}

/// Store the encryption key in the app's secure store after biometric authentication.
///
/// On mobile: prompts for biometric auth, then stores the key.
/// On desktop: stores the key without biometric (not available).
#[tauri::command]
pub fn store_encryption_key(app: tauri::AppHandle, key_data: String) -> Result<(), String> {
    // Gate with biometric authentication on mobile
    #[cfg(mobile)]
    {
        use tauri_plugin_biometric::{AuthOptions, BiometricExt};

        app.biometric()
            .authenticate(
                "Authenticate to enable biometric unlock".to_string(),
                AuthOptions {
                    allow_device_credential: false,
                    confirmation_required: Some(true),
                    ..Default::default()
                },
            )
            .map_err(|e| format!("Biometric authentication failed: {e}"))?;
    }

    // Store the key
    use tauri_plugin_store::StoreExt;

    let store = app
        .store(BIOMETRIC_STORE_FILE)
        .map_err(|e| format!("Store error: {e}"))?;
    store.set(BIOMETRIC_KEY_ENTRY, serde_json::json!(key_data));
    store.save().map_err(|e| format!("Store save error: {e}"))?;

    log::info!("Encryption key stored with biometric protection");
    Ok(())
}

/// Retrieve the encryption key from the store after biometric authentication.
///
/// On mobile: prompts for biometric auth, then returns the stored key.
/// On desktop: returns the key without biometric (not available).
///
/// Returns an error if no key is stored or if biometric authentication fails.
#[tauri::command]
pub fn retrieve_encryption_key(app: tauri::AppHandle) -> Result<String, String> {
    // Gate with biometric authentication on mobile
    #[cfg(mobile)]
    {
        use tauri_plugin_biometric::{AuthOptions, BiometricExt};

        app.biometric()
            .authenticate(
                "Authenticate to unlock encryption".to_string(),
                AuthOptions {
                    allow_device_credential: false,
                    confirmation_required: Some(true),
                    ..Default::default()
                },
            )
            .map_err(|e| format!("Biometric authentication failed: {e}"))?;
    }

    // Retrieve the key
    use tauri_plugin_store::StoreExt;

    let store = app
        .store(BIOMETRIC_STORE_FILE)
        .map_err(|e| format!("Store error: {e}"))?;

    match store.get(BIOMETRIC_KEY_ENTRY) {
        Some(serde_json::Value::String(key)) => Ok(key),
        Some(_) => Err("Stored encryption key has unexpected type".to_string()),
        None => Err("No encryption key stored — enroll biometric first".to_string()),
    }
}

/// Clear the stored encryption key (e.g. when disabling biometric unlock).
#[tauri::command]
pub fn clear_encryption_key(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let store = app
        .store(BIOMETRIC_STORE_FILE)
        .map_err(|e| format!("Store error: {e}"))?;
    store.delete(BIOMETRIC_KEY_ENTRY);
    store.save().map_err(|e| format!("Store save error: {e}"))?;

    log::info!("Stored encryption key cleared");
    Ok(())
}
