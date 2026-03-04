mod commands;

use commands::notifications::ReminderStore;
use std::collections::HashMap;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init());

    // Biometric plugin is mobile-only (Face ID / Touch ID / fingerprint)
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_biometric::init());

    builder
        .manage(ReminderStore(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::notifications::schedule_reminder,
            commands::notifications::cancel_reminder,
            commands::notifications::cancel_all_reminders,
            commands::biometric::check_biometric_availability,
            commands::biometric::store_encryption_key,
            commands::biometric::retrieve_encryption_key,
            commands::biometric::has_stored_key,
            commands::biometric::clear_encryption_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
