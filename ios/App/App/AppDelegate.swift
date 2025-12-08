// File: ios/App/App/AppDelegate.swift
import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Standard Capacitor startup
        let result = true

        // Try locking zoom shortly after launch (window may not be ready immediately)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.lockWebViewZoom()
        }

        return result
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Handle background transition if needed.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Ensure zoom is still locked when coming back from background
        lockWebViewZoom()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate.
    }

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        // Keep Capacitor URL handling
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        // Keep Capacitor Universal Links handling
        return ApplicationDelegateProxy.shared.application(
            application,
            continue: userActivity,
            restorationHandler: restorationHandler
        )
    }

    // MARK: - Zoom Lock Helper

    /// Recursively search for the WKWebView scroll view and disable zooming.
    private func lockWebViewZoom() {
        guard let window = self.window else { return }

        func crawl(_ view: UIView) {
            if let scroll = view as? UIScrollView {
                scroll.pinchGestureRecognizer?.isEnabled = false
                scroll.maximumZoomScale = 1.0
                scroll.minimumZoomScale = 1.0
            }
            for sub in view.subviews {
                crawl(sub)
            }
        }

        crawl(window)
    }
}

