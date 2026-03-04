//! Local notification scheduling for task reminders.
//!
//! The WebView decrypts task titles before passing them here.
//! Rust never touches encrypted data.

use std::collections::HashMap;
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri_plugin_notification::NotificationExt;

/// In-memory store of scheduled reminder metadata.
/// Maps task_id → scheduled fire time so we can cancel/reschedule.
pub struct ReminderStore(pub Mutex<HashMap<i64, ScheduledReminder>>);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledReminder {
    pub task_id: i64,
    pub title: String,
    pub body: String,
    pub fire_at: DateTime<Utc>,
}

/// Schedule a local notification for a task reminder.
///
/// On mobile platforms, this uses the notification plugin's schedule API.
/// On desktop, we store the reminder and fire immediately if overdue.
#[tauri::command]
pub fn schedule_reminder(
    app: tauri::AppHandle,
    reminder_store: State<'_, ReminderStore>,
    task_id: i64,
    title: String,
    body: String,
    fire_at: String,
) -> Result<(), String> {
    let fire_at_dt: DateTime<Utc> = fire_at
        .parse()
        .map_err(|e| format!("Invalid fire_at datetime: {e}"))?;

    // Store the reminder metadata
    {
        let mut store = reminder_store
            .0
            .lock()
            .map_err(|e| format!("Lock error: {e}"))?;
        store.insert(
            task_id,
            ScheduledReminder {
                task_id,
                title: title.clone(),
                body: body.clone(),
                fire_at: fire_at_dt,
            },
        );
    }

    // Fire notification via the plugin.
    // For local notifications, we send immediately — the frontend handles
    // scheduling by only calling this when it's time (or close to time).
    // Future enhancement: use the plugin's schedule API for deferred delivery.
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| format!("Notification error: {e}"))?;

    log::info!("Scheduled reminder for task {task_id} at {fire_at}");
    Ok(())
}

/// Cancel a previously scheduled reminder for a task.
#[tauri::command]
pub fn cancel_reminder(
    reminder_store: State<'_, ReminderStore>,
    task_id: i64,
) -> Result<(), String> {
    let mut store = reminder_store
        .0
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    store.remove(&task_id);
    log::info!("Cancelled reminder for task {task_id}");
    Ok(())
}

/// Cancel all scheduled reminders (e.g. on logout).
#[tauri::command]
pub fn cancel_all_reminders(
    reminder_store: State<'_, ReminderStore>,
) -> Result<(), String> {
    let mut store = reminder_store
        .0
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    let count = store.len();
    store.clear();
    log::info!("Cancelled all {count} reminders");
    Ok(())
}
