mod commands;

use commands::notifications::ReminderStore;
use std::collections::HashMap;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(ReminderStore(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::notifications::schedule_reminder,
            commands::notifications::cancel_reminder,
            commands::notifications::cancel_all_reminders,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
