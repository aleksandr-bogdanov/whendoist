//! Biometric authentication for encryption key access.
//!
//! Uses `tauri-plugin-biometric` (official) for Face ID / Touch ID / fingerprint
//! authentication, and `tauri-plugin-store` for key persistence in the app sandbox.
//!
//! The stored key is the base64-encoded AES-256-GCM derived key from Web Crypto.
//! Rust never performs encryption — it only stores/retrieves the key blob.
//!
//! ## Security note
//!
//! `tauri-plugin-store` writes a JSON file in the app's private data directory.
//! This is NOT hardware-backed (unlike iOS Keychain / Android Keystore). The file
//! is protected by the mobile OS sandbox and biometric gating in our Rust commands,
//! but is theoretically accessible on rooted/jailbroken devices or via ADB.
//!
//! The ideal solution is `tauri-plugin-keystore` (by impierce), which uses iOS
//! Keychain / Android Keystore with hardware-backed biometric protection. However,
//! its Rust API only exposes `ping()` — store/retrieve/remove only work via JS
//! bindings, which can't be called from Rust commands. A future upgrade could
//! either use the JS bindings directly or contribute Rust API methods upstream.

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
                // Explicit mapping — Debug format is fragile across versions.
                // Frontend expects exactly "FaceID", "TouchID", or "None".
                let biometry_type = match status.biometry_type {
                    tauri_plugin_biometric::BiometryType::FaceID => "FaceID",
                    tauri_plugin_biometric::BiometryType::TouchID => "TouchID",
                    _ => "None",
                };
                Ok(BiometricAvailability {
                    available: status.is_available,
                    biometry_type: biometry_type.to_string(),
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

/// Check if a biometric encryption key has been enrolled (without biometric prompt).
///
/// Used on app startup to determine whether to show the biometric unlock button.
/// Does NOT trigger biometric authentication — just checks if a key exists.
#[tauri::command]
pub fn has_stored_key(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_store::StoreExt;

    let store = app
        .store(BIOMETRIC_STORE_FILE)
        .map_err(|e| format!("Store error: {e}"))?;

    Ok(matches!(
        store.get(BIOMETRIC_KEY_ENTRY),
        Some(serde_json::Value::String(_))
    ))
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
