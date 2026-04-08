// File: ios/App/App/AppDelegate.swift
import SwiftUI
import UIKit
import UserNotifications

@UIApplicationMain
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    private let appState = KDSAppState.shared

    private func configureSystemAppearance() {
        let ink = UIColor(KDSTheme.ink)
        let surface = UIColor(KDSTheme.surface)
        let muted = UIColor(KDSTheme.muted)
        let primary = UIColor(KDSTheme.primary)

        let navigationAppearance = UINavigationBarAppearance()
        navigationAppearance.configureWithOpaqueBackground()
        navigationAppearance.backgroundColor = surface
        navigationAppearance.titleTextAttributes = [.foregroundColor: ink]
        navigationAppearance.largeTitleTextAttributes = [.foregroundColor: ink]

        UINavigationBar.appearance().standardAppearance = navigationAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navigationAppearance
        UINavigationBar.appearance().compactAppearance = navigationAppearance
        UINavigationBar.appearance().tintColor = primary

        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = surface

        let normalItemColorAttributes: [NSAttributedString.Key: Any] = [.foregroundColor: muted]
        let selectedItemColorAttributes: [NSAttributedString.Key: Any] = [.foregroundColor: primary]
        tabAppearance.stackedLayoutAppearance.normal.iconColor = muted
        tabAppearance.stackedLayoutAppearance.normal.titleTextAttributes = normalItemColorAttributes
        tabAppearance.stackedLayoutAppearance.selected.iconColor = primary
        tabAppearance.stackedLayoutAppearance.selected.titleTextAttributes = selectedItemColorAttributes
        tabAppearance.inlineLayoutAppearance.normal.iconColor = muted
        tabAppearance.inlineLayoutAppearance.normal.titleTextAttributes = normalItemColorAttributes
        tabAppearance.inlineLayoutAppearance.selected.iconColor = primary
        tabAppearance.inlineLayoutAppearance.selected.titleTextAttributes = selectedItemColorAttributes
        tabAppearance.compactInlineLayoutAppearance.normal.iconColor = muted
        tabAppearance.compactInlineLayoutAppearance.normal.titleTextAttributes = normalItemColorAttributes
        tabAppearance.compactInlineLayoutAppearance.selected.iconColor = primary
        tabAppearance.compactInlineLayoutAppearance.selected.titleTextAttributes = selectedItemColorAttributes

        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance
        UITabBar.appearance().tintColor = primary
        UITabBar.appearance().unselectedItemTintColor = muted
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        configureSystemAppearance()
        UNUserNotificationCenter.current().delegate = self
        URLCache.shared = URLCache(
            memoryCapacity: 96 * 1_024 * 1_024,
            diskCapacity: 512 * 1_024 * 1_024,
            diskPath: "kds-native-url-cache"
        )

        Task { await appState.bootstrap() }
        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { await appState.updateAPNSToken(deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            appState.banner = "Push registration failed: \(error.localizedDescription)"
        }
    }

    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        Task { await appState.handleIncomingURL(url) }
        return true
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        Task { await appState.handleNotification(notification.request.content.userInfo) }
        completionHandler([.banner, .sound, .list])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        Task { await appState.handleNotification(response.notification.request.content.userInfo) }
        completionHandler()
    }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let appState = KDSAppState.shared

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.overrideUserInterfaceStyle = .light
        window.rootViewController = UIHostingController(
            rootView: KDSRootView()
                .environmentObject(appState)
        )
        window.makeKeyAndVisible()
        self.window = window

        if let url = connectionOptions.urlContexts.first?.url {
            Task { await appState.handleIncomingURL(url) }
        }

        if let notification = connectionOptions.notificationResponse {
            Task { await appState.handleNotification(notification.notification.request.content.userInfo) }
        }
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        Task { await appState.refreshSessionIfNeeded() }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        Task { await appState.handleIncomingURL(url) }
    }
}
