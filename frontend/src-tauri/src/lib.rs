mod commands;

use commands::notifications::{PushTokenState, ReminderStore};
use std::collections::HashMap;
use std::sync::Mutex;

// Declare the Swift FFI binding for the native tab bar plugin.
// This expands to an extern "C" function declaration that calls
// the @_cdecl("init_plugin_native_tabbar") export from NativeTabBarPlugin.swift.
#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_native_tabbar);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notifications::init());

    // Biometric plugin is mobile-only (Face ID / Touch ID / fingerprint)
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    // STT plugin is mobile-only (native SFSpeechRecognizer / SpeechRecognizer)
    // Desktop uses Web Speech API via the Chromium-based WebView
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_stt::init());

    // Edge-to-edge: extend WebView under status bar and home indicator on mobile.
    // Injects --safe-area-inset-* CSS custom properties from native APIs.
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_edge_to_edge::init());

    // Native UITabBar — replaces the CSS bottom nav with a real UITabBar on iOS.
    // On iOS 26+, UITabBar gets Liquid Glass styling automatically.
    // The Rust side is a minimal shell; all logic lives in NativeTabBarPlugin.swift.
    #[cfg(target_os = "ios")]
    let builder = builder.plugin(
        tauri::plugin::Builder::<tauri::Wry, ()>::new("native_tabbar")
            .setup(|_app, api| {
                api.register_ios_plugin(init_plugin_native_tabbar)?;
                Ok(())
            })
            .build(),
    );

    builder
        .manage(ReminderStore(Mutex::new(HashMap::new())))
        .manage(PushTokenState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::notifications::schedule_reminder,
            commands::notifications::cancel_reminder,
            commands::notifications::cancel_all_reminders,
            commands::notifications::get_push_token,
            commands::biometric::check_biometric_availability,
            commands::biometric::store_encryption_key,
            commands::biometric::retrieve_encryption_key,
            commands::biometric::has_stored_key,
            commands::biometric::clear_encryption_key,
            commands::widgets::update_widget_data,
            commands::widgets::clear_widget_data,
        ])
        .setup(|app| {
            // On mobile, register for push notifications and listen for token
            #[cfg(mobile)]
            {
                use tauri_plugin_notifications::NotificationsExt;
                use tauri::{Emitter, Manager};

                let handle = app.handle().clone();

                // Register for push notifications — this triggers the OS push
                // registration flow. The resulting token is sent to the frontend
                // via a Tauri event so it can register with our backend.
                // Load previously persisted push token into memory
                {
                    use tauri_plugin_store::StoreExt;
                    use tauri::Manager;
                    if let Ok(store) = app.handle().store("push-token.json") {
                        if let Some(serde_json::Value::String(saved)) = store.get("token") {
                            if let Some(state) = app.handle().try_state::<PushTokenState>() {
                                if let Ok(mut stored) = state.0.lock() {
                                    *stored = Some(saved);
                                }
                            }
                        }
                    }
                }

                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let result = handle.notifications()
                        .register_for_push_notifications()
                        .await;
                    match result {
                        Ok(token) => {
                            log::info!("Push token received ({} chars)", token.len());
                            // Store in managed state for get_push_token command
                            if let Some(state) = handle.try_state::<PushTokenState>() {
                                if let Ok(mut stored) = state.0.lock() {
                                    *stored = Some(token.clone());
                                }
                            }
                            // Persist to store so token survives app restarts
                            {
                                use tauri_plugin_store::StoreExt;
                                if let Ok(store) = handle.store("push-token.json") {
                                    store.set("token", serde_json::json!(token));
                                    let _ = store.save();
                                }
                            }
                            // Emit to frontend so the hook can register with backend
                            let _ = handle.emit("push-token-received", token);
                        }
                        Err(e) => {
                            log::warn!("Push registration failed: {e}");
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
