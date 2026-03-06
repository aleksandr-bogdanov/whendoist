//! Home screen widget data bridge.
//!
//! Pushes task summary data from the WebView to native widget surfaces:
//! - **iOS:** Writes JSON to App Group `NSUserDefaults` + reloads WidgetKit timelines
//! - **Android:** Writes `widget-data.json` to the app data directory
//! - **Desktop:** No-op (no widget support)
//!
//! The frontend calls `update_widget_data` whenever the task list changes.
//! Native widget extensions read the shared data independently.
//!
//! When `encryption_enabled` is true, the `tasks` array is empty — widget
//! extensions can't access WebCrypto keys, so they show counts only.

use serde::{Deserialize, Serialize};

/// A single task entry for widget display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetTask {
    pub title: String,
    pub domain_name: Option<String>,
    pub scheduled_time: Option<String>,
    pub completed: bool,
}

/// Summary data shared with native home screen widgets.
///
/// JSON schema consumed by both iOS (WidgetKit) and Android (AppWidgetProvider).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetData {
    pub updated_at: String,
    pub encryption_enabled: bool,
    pub total_today: u32,
    pub overdue_count: u32,
    pub completed_today: u32,
    pub tasks: Vec<WidgetTask>,
}

/// Push widget data to the native widget surface.
///
/// On iOS: writes to App Group NSUserDefaults and reloads WidgetKit timelines.
/// On Android: writes widget-data.json to the app data directory.
/// On desktop: no-op.
#[tauri::command]
pub fn update_widget_data(app: tauri::AppHandle, data: WidgetData) -> Result<(), String> {
    let json =
        serde_json::to_string(&data).map_err(|e| format!("JSON serialization failed: {e}"))?;

    #[cfg(target_os = "ios")]
    ios::write_and_reload(&json)?;

    #[cfg(target_os = "android")]
    android::write_widget_file(&app, &json)?;

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        let _ = (&app, &json);
        log::debug!("Widget update skipped (desktop)");
    }

    Ok(())
}

/// Clear widget data (called on logout).
///
/// Writes zeroed-out data so widgets show "Open Whendoist" instead of stale tasks.
#[tauri::command]
pub fn clear_widget_data(app: tauri::AppHandle) -> Result<(), String> {
    let empty = WidgetData {
        updated_at: String::new(),
        encryption_enabled: false,
        total_today: 0,
        overdue_count: 0,
        completed_today: 0,
        tasks: Vec::new(),
    };
    let json =
        serde_json::to_string(&empty).map_err(|e| format!("JSON serialization failed: {e}"))?;

    #[cfg(target_os = "ios")]
    ios::write_and_reload(&json)?;

    #[cfg(target_os = "android")]
    android::write_widget_file(&app, &json)?;

    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        let _ = (&app, &json);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// iOS: App Group NSUserDefaults + WidgetKit reload
// ---------------------------------------------------------------------------

#[cfg(target_os = "ios")]
mod ios {
    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, AnyObject};
    use objc2::{msg_send, msg_send_id, ClassType};
    use objc2_foundation::{NSString, NSUserDefaults};

    /// Must match the App Group configured in both the main app and widget
    /// extension entitlements.
    const APP_GROUP: &str = "group.com.whendoist.app";
    const WIDGET_DATA_KEY: &str = "widget_data";

    pub fn write_and_reload(json: &str) -> Result<(), String> {
        unsafe {
            // Write JSON to App Group UserDefaults (shared with widget extension)
            let suite = NSString::from_str(APP_GROUP);
            let defaults: Option<Retained<NSUserDefaults>> =
                msg_send_id![NSUserDefaults::alloc(), initWithSuiteName: &*suite];
            let defaults =
                defaults.ok_or("Failed to init NSUserDefaults with App Group suite")?;

            let key = NSString::from_str(WIDGET_DATA_KEY);
            let value = NSString::from_str(json);
            let _: () = msg_send![&defaults, setObject: &*value, forKey: &*key];

            // Force WidgetKit to refresh all widget timelines.
            // Uses runtime class lookup — gracefully skips if WidgetKit isn't linked.
            if let Some(cls) = AnyClass::get("WidgetCenter") {
                let center: *mut AnyObject = msg_send![cls, shared];
                if !center.is_null() {
                    let _: () = msg_send![center, reloadAllTimelines];
                    log::info!("Widget timelines reloaded");
                }
            } else {
                log::debug!("WidgetCenter class not available");
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Android: JSON file in app data directory
// ---------------------------------------------------------------------------

#[cfg(target_os = "android")]
mod android {
    use tauri::Manager;

    const WIDGET_DATA_FILE: &str = "widget-data.json";

    pub fn write_widget_file(app: &tauri::AppHandle, json: &str) -> Result<(), String> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {e}"))?;
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create data dir: {e}"))?;
        let path = data_dir.join(WIDGET_DATA_FILE);
        std::fs::write(&path, json)
            .map_err(|e| format!("Failed to write widget data: {e}"))?;
        log::info!("Widget data written to {}", path.display());
        Ok(())
    }
}
