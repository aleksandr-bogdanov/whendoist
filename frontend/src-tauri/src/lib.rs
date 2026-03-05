mod commands;

use commands::notifications::{PushTokenState, ReminderStore};
use std::collections::HashMap;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notifications::init());

    // Biometric plugin is mobile-only (Face ID / Touch ID / fingerprint)
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_biometric::init());

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
