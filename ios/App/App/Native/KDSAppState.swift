import Foundation
import SwiftUI

@MainActor
final class KDSAppState: ObservableObject {
    static let shared = KDSAppState()
    private let minimumLaunchDuration: TimeInterval = 5.0

    let config = KDSConfig.current
    let diskStore = KDSDiskStore()
    let keychain = KDSKeychain()
    let networkMonitor = KDSNetworkMonitor()

    let apiClient: KDSAPIClient
    let authService: AuthService
    let coursesService: CoursesService
    let ebooksService: EbooksService
    let assessmentsService: AssessmentsService
    let aiService: AIService
    let dashboardService: DashboardService
    let notificationsService: NotificationsService
    let progressStore: KDSProgressStore
    let readerStateStore: KDSReaderStateStore
    let syncCoordinator: KDSSyncCoordinator

    @Published var authState: KDSAuthState = .bootstrapping
    @Published var session: KDSSession?
    @Published var activeTab: KDSTab = .home
    @Published var banner: String?
    @Published var pendingVerifyCertificateID: String?
    @Published var pendingAPNSToken: String?
    @Published var pushEnabled = false
    @Published var launchProgress = 0.08
    @Published var launchStatus = "Preparing your KDS workspace…"

    private init() {
        apiClient = KDSAPIClient(config: config)
        authService = AuthService(client: apiClient, keychain: keychain)
        coursesService = CoursesService(client: apiClient, diskStore: diskStore)
        ebooksService = EbooksService(client: apiClient, diskStore: diskStore)
        assessmentsService = AssessmentsService(client: apiClient)
        aiService = AIService(client: apiClient, diskStore: diskStore)
        dashboardService = DashboardService(client: apiClient)
        notificationsService = NotificationsService(client: apiClient)
        progressStore = KDSProgressStore(diskStore: diskStore)
        readerStateStore = KDSReaderStateStore(diskStore: diskStore)
        syncCoordinator = KDSSyncCoordinator(diskStore: diskStore)

        networkMonitor.onReconnect = { [weak self] in
            Task { await self?.flushPendingSync() }
        }
        syncCoordinator.flushHandler = { [weak self] queue in
            guard let self, let token = self.session?.accessToken else { return [] }
            return await self.coursesService.uploadProgressMutations(queue, token: token)
        }
    }

    var userId: String? { session?.user.id }
    var userEmail: String { session?.user.email ?? "" }
    var displayName: String { session?.user.fullName ?? "" }
    var biometricKind: KDSBiometricKind { authService.biometricKind }
    var canUseBiometricLogin: Bool {
        biometricKind != .none && authService.hasSavedBiometricCredentials
    }
    var savedBiometricEmail: String {
        authService.savedBiometricEmail ?? ""
    }
    var pushNotificationsAvailable: Bool { config.pushNotificationsEnabled }

    func bootstrap() async {
        let launchStartedAt = Date()

        guard config.isConfigured else {
            authState = .misconfigured
            return
        }
        launchProgress = 0.18
        launchStatus = "Restoring your secure session…"
        if let restored = await authService.restoreSession() {
            session = restored
            launchProgress = 0.46
            launchStatus = "Syncing your learner profile…"
            await refreshProfileName()
            launchProgress = 0.7
            launchStatus = "Checking downloads and progress…"
            await flushPendingSync()
            launchProgress = 0.86
            launchStatus = "Finishing setup…"
            await registerPendingPushTokenIfNeeded()
            await waitForMinimumLaunchDuration(since: launchStartedAt)
            launchProgress = 1
            launchStatus = "Ready"
            authState = .signedIn
        } else {
            launchProgress = 0.72
            launchStatus = "Preparing sign in…"
            await waitForMinimumLaunchDuration(since: launchStartedAt)
            launchProgress = 1
            launchStatus = "Ready"
            authState = .signedOut
        }
    }

    private func waitForMinimumLaunchDuration(since startDate: Date) async {
        let elapsed = Date().timeIntervalSince(startDate)
        let remaining = minimumLaunchDuration - elapsed
        guard remaining > 0 else { return }
        let nanoseconds = UInt64(remaining * 1_000_000_000)
        try? await Task.sleep(nanoseconds: nanoseconds)
    }

    func refreshSessionIfNeeded() async {
        guard let session else { return }
        if session.isExpired {
            do {
                let refreshed = try await authService.refreshSession(using: session.refreshToken)
                self.session = refreshed
                authState = .signedIn
                await refreshProfileName()
                await registerPendingPushTokenIfNeeded()
            } catch {
                self.session = nil
                authState = .signedOut
            }
        }
    }

    private func completeSignedInLaunch(with session: KDSSession, successBanner: String? = nil) async {
        self.session = session
        authState = .bootstrapping

        launchProgress = 0.34
        launchStatus = "Loading your KDS workspace…"
        await Task.yield()

        launchProgress = 0.56
        launchStatus = "Syncing your learner profile…"
        await refreshProfileName()

        launchProgress = 0.78
        launchStatus = "Checking downloads and progress…"
        await flushPendingSync()

        launchProgress = 0.92
        launchStatus = "Finishing setup…"
        await registerPendingPushTokenIfNeeded()

        launchProgress = 1
        launchStatus = "Ready"
        authState = .signedIn

        if let successBanner {
            banner = successBanner
        }
    }

    func signIn(email: String, password: String) async {
        do {
            launchProgress = 0.16
            launchStatus = "Signing you in…"
            let session = try await authService.signIn(email: email, password: password)
            guard !session.accessToken.isEmpty else {
                banner = "Sign in failed. Check your credentials and try again."
                return
            }
            _ = authService.saveBiometricCredentials(email: email, password: password)
            await completeSignedInLaunch(with: session)
        } catch {
            authState = .signedOut
            banner = error.localizedDescription
        }
    }

    func signInWithBiometrics() async {
        do {
            launchProgress = 0.12
            launchStatus = "Confirm \(biometricKind.displayName)…"
            let session = try await authService.signInWithBiometrics()
            await completeSignedInLaunch(with: session)
        } catch let error as KDSBiometricError {
            authState = .signedOut
            if let description = error.errorDescription {
                banner = description
            }
        } catch let error as KDSAPIError {
            authState = .signedOut
            if case .unauthorized = error {
                authService.clearBiometricCredentials()
                banner = "Saved \(biometricKind.displayName) credentials are out of date. Sign in with your password once to save them again."
            } else {
                banner = error.localizedDescription
            }
        } catch {
            authState = .signedOut
            banner = error.localizedDescription
        }
    }

    func signUp(email: String, password: String, profile: KDSSignUpProfile) async -> KDSSignUpResult? {
        do {
            launchProgress = 0.16
            launchStatus = "Creating your account…"
            _ = try await authService.signUp(email: email, password: password, profile: profile)
            _ = authService.saveBiometricCredentials(email: email, password: password)
            authService.signOut()
            session = nil
            authState = .signedOut
            activeTab = .home
            let message = "Account created. Confirm your email in your inbox before signing in."
            banner = message
            return .verificationRequired(message)
        } catch {
            authState = .signedOut
            banner = error.localizedDescription
            return nil
        }
    }

    func requestPasswordReset(email: String) async {
        do {
            try await authService.requestPasswordReset(email: email)
            banner = "Password reset email sent."
        } catch {
            banner = error.localizedDescription
        }
    }

    func signOut() async {
        authService.signOut()
        session = nil
        authState = .signedOut
        activeTab = .home
    }

    func saveDisplayName(_ name: String) async {
        guard let userId, let token = session?.accessToken else { return }
        do {
            try await dashboardService.saveDisplayName(userId: userId, fullName: name, token: token)
            session?.user.fullName = name
        } catch {
            banner = error.localizedDescription
        }
    }

    func refreshProfileName() async {
        guard let userId, let token = session?.accessToken else { return }
        do {
            let name = try await dashboardService.fetchDisplayName(userId: userId, token: token)
            session?.user.fullName = name
        } catch {
            // Non-fatal; dashboard will still work.
        }
    }

    func updateAPNSToken(_ deviceToken: Data) async {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        pendingAPNSToken = token
        await registerPendingPushTokenIfNeeded()
    }

    func requestPushNotifications() async {
        guard config.pushNotificationsEnabled else {
            pushEnabled = false
            banner = "Push notifications are disabled in this release."
            return
        }

        do {
            let granted = try await notificationsService.requestAuthorization()
            pushEnabled = granted
            if granted {
                notificationsService.registerForRemoteNotifications()
            }
        } catch {
            banner = error.localizedDescription
        }
    }

    func registerPendingPushTokenIfNeeded() async {
        guard config.pushNotificationsEnabled else {
            pendingAPNSToken = nil
            pushEnabled = false
            return
        }

        guard let token = pendingAPNSToken else { return }
        do {
            try await notificationsService.registerToken(token, accessToken: session?.accessToken)
            pendingAPNSToken = nil
            pushEnabled = true
        } catch {
            banner = "Push token saved locally; backend registration will retry."
        }
    }

    func flushPendingSync() async {
        guard networkMonitor.isConnected else { return }
        await syncCoordinator.flushIfNeeded()
    }

    func enqueueProgressMutation(courseId: String, slideId: String) {
        guard let userId else { return }
        syncCoordinator.enqueue(
            PendingProgressMutation(
                id: UUID().uuidString,
                userId: userId,
                courseId: courseId,
                slideId: slideId,
                completedAt: Date()
            )
        )
    }

    func handleNotification(_ userInfo: [AnyHashable: Any]) async {
        if let certId = userInfo["cert_id"] as? String {
            pendingVerifyCertificateID = certId
            activeTab = .dashboard
        }
        if let tabName = userInfo["tab"] as? String,
           let tab = KDSTab.allCases.first(where: { $0.title.lowercased() == tabName.lowercased() }),
           tab != .ai {
            activeTab = tab
        }
    }

    func handleIncomingURL(_ url: URL) async {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        if components.path.contains("verify"),
           let certId = components.queryItems?.first(where: { $0.name == "cert_id" })?.value {
            pendingVerifyCertificateID = certId
            activeTab = .dashboard
        }
    }
}
