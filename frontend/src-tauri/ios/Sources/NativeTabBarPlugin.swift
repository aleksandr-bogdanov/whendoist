import Tauri
import UIKit
import WebKit

/// Native UITabBar plugin — replaces the CSS bottom nav with a real UITabBar.
/// On iOS 26+, UITabBar automatically gets Liquid Glass styling.
///
/// Architecture:
/// - `load(webview:)` reparents the WKWebView into a container VC with UITabBar
/// - Tab taps → `evaluateJavaScript("window.__nativeTabBarEvent(...)")` → JS routes
/// - Webview extends edge-to-edge under the translucent tab bar; CSS handles bottom padding
/// - Tab bar auto-hides on login/unauthenticated routes via URL observation (KVO)
/// - JS → Swift via WKScriptMessageHandler ("nativeTabBar" channel) for overlay hide/show
///
/// Communication uses `evaluateJavaScript` + `WKScriptMessageHandler` (not Tauri IPC)
/// because the Rust plugin shell doesn't route commands or channel events reliably.
class NativeTabBarPlugin: Plugin, UITabBarDelegate, WKScriptMessageHandler {
    private weak var tabBar: UITabBar?
    private weak var webView: WKWebView?
    private var urlObservation: NSKeyValueObservation?

    /// When true, an overlay (wizard/modal) has requested the tab bar hidden.
    /// The URL observer and keyboard handler respect this flag.
    private var overlayHidden = false

    /// Routes that should show the tab bar (authenticated routes).
    /// Everything else (login, index, privacy, terms) hides it.
    /// Note: /calendar is a virtual tab — it navigates to /dashboard with mobileTab="calendar"
    /// so the actual URL is always /dashboard, never /calendar.
    private let authenticatedPrefixes = ["/thoughts", "/dashboard", "/analytics", "/settings"]

    /// Tab configuration — 5 navigation tabs, no action buttons (per Apple HIG).
    /// Order and routes must match ROUTE_TO_INDEX in tauri-native-tabbar.ts.
    private struct Tab {
        let label: String
        let sfSymbol: String
        let route: String
    }

    private let tabs: [Tab] = [
        Tab(label: "Thoughts",  sfSymbol: "lightbulb",   route: "/thoughts"),
        Tab(label: "Tasks",     sfSymbol: "list.bullet",  route: "/dashboard"),
        Tab(label: "Calendar",  sfSymbol: "calendar",     route: "/calendar"),
        Tab(label: "Analytics", sfSymbol: "chart.bar",    route: "/analytics"),
        Tab(label: "Settings",  sfSymbol: "gearshape",    route: "/settings"),
    ]

    override func load(webview: WKWebView) {
        self.webView = webview

        // Register JS → Swift message handler for overlay show/hide.
        // JS calls: window.webkit.messageHandlers.nativeTabBar.postMessage({action: "hide"})
        webview.configuration.userContentController.add(self, name: "nativeTabBar")

        // Defer reparenting to the next run loop tick so that Wry finishes
        // its own setup first (avoids racing with Wry's layout pass).
        DispatchQueue.main.async { [weak self] in
            self?.setupTabBar(for: webview)
        }
    }

    // MARK: - WKScriptMessageHandler (JS → Swift)

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "nativeTabBar",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            switch action {
            case "hide":
                self.overlayHidden = true
                self.tabBar?.isHidden = true
            case "show":
                self.overlayHidden = false
                // Only restore if we're on an authenticated route
                if let path = self.webView?.url?.path,
                   self.authenticatedPrefixes.contains(where: { path.hasPrefix($0) }) {
                    self.tabBar?.isHidden = false
                }
            default:
                break
            }
        }
    }

    // MARK: - View Hierarchy Setup

    private func setupTabBar(for webview: WKWebView) {
        guard let window = webview.window else {
            print("[NativeTabBar] No window found — cannot reparent webview")
            return
        }

        // Create container view controller
        let containerVC = UIViewController()
        containerVC.view.backgroundColor = .systemBackground

        // Remove webview from its current superview and add to container
        webview.removeFromSuperview()
        webview.translatesAutoresizingMaskIntoConstraints = false
        containerVC.view.addSubview(webview)

        // Create and configure UITabBar
        let tabBar = UITabBar()
        tabBar.delegate = self
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        containerVC.view.addSubview(tabBar)
        self.tabBar = tabBar

        // Make tab bar translucent so content scrolls underneath (edge-to-edge).
        // CSS `pb-nav-safe` in the webview provides bottom padding so content
        // isn't hidden behind the tab bar at rest.
        tabBar.isTranslucent = true

        // Brand purple tint — adapts to light/dark mode for proper contrast.
        // Light: #6D5EF6 (brand purple), Dark: #8B7CF7 (brand-light, lifted for readability).
        // Matches the CSS design system: --color-brand vs --color-brand-light.
        tabBar.tintColor = UIColor { traitCollection in
            if traitCollection.userInterfaceStyle == .dark {
                return UIColor(red: 139.0/255.0, green: 124.0/255.0, blue: 247.0/255.0, alpha: 1.0)
            } else {
                return UIColor(red: 109.0/255.0, green: 94.0/255.0, blue: 246.0/255.0, alpha: 1.0)
            }
        }

        // Build tab bar items — all navigation, no actions (per Apple HIG)
        var items: [UITabBarItem] = []
        for (index, tab) in tabs.enumerated() {
            let image = UIImage(systemName: tab.sfSymbol)
            let item = UITabBarItem(title: tab.label, image: image, tag: index)
            items.append(item)
        }
        tabBar.items = items
        tabBar.selectedItem = items[1] // Default to Tasks tab

        // Auto Layout: webview extends edge-to-edge (under tab bar).
        // The tab bar overlays the bottom of the webview.
        NSLayoutConstraint.activate([
            webview.topAnchor.constraint(equalTo: containerVC.view.topAnchor),
            webview.leadingAnchor.constraint(equalTo: containerVC.view.leadingAnchor),
            webview.trailingAnchor.constraint(equalTo: containerVC.view.trailingAnchor),
            webview.bottomAnchor.constraint(equalTo: containerVC.view.bottomAnchor),

            tabBar.leadingAnchor.constraint(equalTo: containerVC.view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: containerVC.view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: containerVC.view.bottomAnchor),
        ])

        // Set as root view controller
        window.rootViewController = containerVC

        // Observe URL changes to auto-hide tab bar on login/unauthenticated routes.
        // TanStack Router uses hash-free URLs, so we check the path component.
        urlObservation = webview.observe(\.url, options: [.new, .initial]) { [weak self] webview, _ in
            guard let self = self, let tabBar = self.tabBar else { return }
            // Don't override overlay-driven hide
            if self.overlayHidden { return }

            let path = webview.url?.path ?? "/"
            let shouldShow = self.authenticatedPrefixes.contains(where: { path.hasPrefix($0) })
            if tabBar.isHidden == shouldShow {
                tabBar.isHidden = !shouldShow
                // Send ready event when tab bar becomes visible
                if shouldShow {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                        self.sendReadyEvent()
                    }
                }
            }
        }

        // Hide tab bar when keyboard is shown to avoid obstruction
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillShow),
            name: UIResponder.keyboardWillShowNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillHide),
            name: UIResponder.keyboardWillHideNotification,
            object: nil
        )
    }

    /// Send tab bar dimensions to JS via evaluateJavaScript.
    /// Called when the tab bar becomes visible (after layout computes the frame).
    private func sendReadyEvent() {
        guard let tabBar = self.tabBar, !tabBar.isHidden, let window = tabBar.window else { return }
        let tabBarHeight = tabBar.frame.height
        let safeBottom = window.safeAreaInsets.bottom

        let js = """
        window.__nativeTabBarEvent && window.__nativeTabBarEvent('ready', \
        {tabBarHeight: \(Int(tabBarHeight)), safeAreaBottom: \(Int(safeBottom))})
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - UITabBarDelegate

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        let index = item.tag
        guard index >= 0 && index < tabs.count else { return }
        let route = tabs[index].route

        let js = """
        window.__nativeTabBarEvent && window.__nativeTabBarEvent('navigate', \
        {route: '\(route)', index: \(index)})
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - Commands (kept for future use if Rust routing is fixed)

    @objc public func setActiveTab(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SetActiveTabArgs.self)
        DispatchQueue.main.async { [weak self] in
            guard let tabBar = self?.tabBar, let items = tabBar.items else { return }
            if args.index >= 0 && args.index < items.count {
                tabBar.selectedItem = items[args.index]
            }
        }
        invoke.resolve()
    }

    // MARK: - Keyboard Handling

    @objc private func keyboardWillShow(_ notification: Notification) {
        sendKeyboardEvent(notification: notification, visible: true)
        guard let tabBar = self.tabBar, !tabBar.isHidden else { return }
        UIView.animate(withDuration: 0.25) {
            tabBar.isHidden = true
        }
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        sendKeyboardEvent(notification: notification, visible: false)
        guard let tabBar = self.tabBar else { return }
        // Don't restore if overlay is hiding it
        if overlayHidden { return }
        // Only restore if we're on an authenticated route
        if let path = webView?.url?.path,
           authenticatedPrefixes.contains(where: { path.hasPrefix($0) }) {
            UIView.animate(withDuration: 0.25) {
                tabBar.isHidden = false
            }
        }
    }

    /// Send keyboard height and animation duration to JS so the webview
    /// can reposition sticky inputs and drawers above the keyboard.
    private func sendKeyboardEvent(notification: Notification, visible: Bool) {
        let userInfo = notification.userInfo
        let keyboardFrame = (userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue
        let animDuration = (userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
        let height = visible ? Int(keyboardFrame?.height ?? 0) : 0

        let js = """
        window.__keyboardEvent && window.__keyboardEvent(\(visible ? "true" : "false"), \
        {height: \(height), animationDuration: \(animDuration)})
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    deinit {
        urlObservation?.invalidate()
        NotificationCenter.default.removeObserver(self)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "nativeTabBar")
    }
}

// MARK: - Args

struct SetActiveTabArgs: Decodable {
    let index: Int
}

// MARK: - Plugin Registration

@_cdecl("init_plugin_native_tabbar")
func initPlugin() -> Plugin {
    return NativeTabBarPlugin()
}
