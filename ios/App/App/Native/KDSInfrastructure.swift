import Foundation
import LocalAuthentication
import Network
import Security
import SwiftUI

struct KDSConfig {
    let appBaseURL: URL?
    let mainSiteURL: URL?
    let supabaseURL: URL?
    let supabaseAnonKey: String
    let pushNotificationsEnabled: Bool

    init(bundle: Bundle = .main) {
        appBaseURL = URL(string: bundle.object(forInfoDictionaryKey: "KDSAppBaseURL") as? String ?? "")
        mainSiteURL = URL(string: bundle.object(forInfoDictionaryKey: "KDSMainSiteURL") as? String ?? "")
        supabaseURL = URL(string: bundle.object(forInfoDictionaryKey: "KDSSupabaseURL") as? String ?? "")
        supabaseAnonKey = bundle.object(forInfoDictionaryKey: "KDSSupabaseAnonKey") as? String ?? ""
        pushNotificationsEnabled = bundle.object(forInfoDictionaryKey: "KDSPushNotificationsEnabled") as? Bool ?? false
    }

    static let current = KDSConfig()

    var isConfigured: Bool {
        appBaseURL != nil && supabaseURL != nil && !supabaseAnonKey.isEmpty
    }

    var missingKeys: [String] {
        var keys: [String] = []
        if appBaseURL == nil { keys.append("KDSAppBaseURL") }
        if supabaseURL == nil { keys.append("KDSSupabaseURL") }
        if supabaseAnonKey.isEmpty { keys.append("KDSSupabaseAnonKey") }
        return keys
    }
}

enum KDSContentOrigin {
    case app
    case mainSite
}

enum KDSURLResolver {
    static let interactiveProxyVersion = "20260217-2"

    static func resolve(
        _ raw: String?,
        origin: KDSContentOrigin = .mainSite,
        config: KDSConfig = .current
    ) -> URL? {
        guard var trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else {
            return nil
        }

        if trimmed.hasPrefix("//") {
            trimmed = "https:\(trimmed)"
        }

        if trimmed.lowercased().hasPrefix("http://") {
            trimmed = "https://" + String(trimmed.dropFirst("http://".count))
        }

        if let absolute = absoluteURL(from: trimmed) {
            return absolute
        }

        let normalizedPath = trimmed.hasPrefix("/") ? trimmed : "/\(trimmed)"
        let encodedPath = normalizedPath
            .split(separator: "/", omittingEmptySubsequences: false)
            .map { segment in
                String(segment).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String(segment)
            }
            .joined(separator: "/")
        let preferredBase: URL? = {
            switch origin {
            case .app:
                return config.appBaseURL ?? config.mainSiteURL
            case .mainSite:
                return config.mainSiteURL ?? config.appBaseURL
            }
        }()

        guard let preferredBase else { return nil }
        return URL(string: encodedPath, relativeTo: preferredBase)?.absoluteURL
    }

    static func resolveImage(
        _ raw: String?,
        origin: KDSContentOrigin = .mainSite,
        config: KDSConfig = .current
    ) -> URL? {
        guard var trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else {
            return nil
        }

        if trimmed.hasPrefix("//") {
            trimmed = "https:\(trimmed)"
        }

        if trimmed.lowercased().hasPrefix("http://") {
            trimmed = "https://" + String(trimmed.dropFirst("http://".count))
        }

        if let absolute = absoluteURL(from: trimmed) {
            return absolute
        }

        let lowercased = trimmed.lowercased()
        if lowercased.hasPrefix("storage/v1/") || lowercased.hasPrefix("/storage/v1/"),
           let supabaseURL = config.supabaseURL {
            let storagePath = trimmed.hasPrefix("/") ? String(trimmed.dropFirst()) : trimmed
            return URL(string: storagePath, relativeTo: supabaseURL)?.absoluteURL
        }

        if let supabaseURL = config.supabaseURL,
           lowercased.contains("course images/") || lowercased.contains("ebook covers/") || lowercased.contains("book covers/") {
            let normalizedPath = trimmed.hasPrefix("/") ? String(trimmed.dropFirst()) : trimmed
            let encodedPath = normalizedPath
                .split(separator: "/", omittingEmptySubsequences: false)
                .map { segment in
                    String(segment).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String(segment)
                }
                .joined(separator: "/")
            return URL(string: "storage/v1/object/public/\(encodedPath)", relativeTo: supabaseURL)?.absoluteURL
        }

        return resolve(trimmed, origin: origin, config: config)
    }

    static func interactiveProxyURL(
        path raw: String?,
        config: KDSConfig = .current
    ) -> URL? {
        guard let baseURL = config.appBaseURL,
              let targetPath = interactiveTargetPath(from: raw, config: config) else {
            return nil
        }

        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/interactive/proxy"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "path", value: targetPath),
            URLQueryItem(name: "v", value: interactiveProxyVersion)
        ]
        return components?.url
    }

    static func interactiveDirectURL(
        path raw: String?,
        config: KDSConfig = .current
    ) -> URL? {
        guard let targetPath = interactiveTargetPath(from: raw, config: config) else {
            return nil
        }
        if targetPath.lowercased().hasPrefix("http://") || targetPath.lowercased().hasPrefix("https://") {
            return absoluteURL(from: targetPath)
        }
        return resolve(targetPath, origin: .app, config: config)
    }

    static func interactiveCompatibilityURL(
        path raw: String?,
        config: KDSConfig = .current
    ) -> URL? {
        guard let targetPath = interactiveTargetPath(from: raw, config: config) else {
            return nil
        }
        return resolve(targetPath, origin: .mainSite, config: config)
    }

    private static func interactiveTargetPath(
        from raw: String?,
        config: KDSConfig
    ) -> String? {
        guard var trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else {
            return nil
        }

        if trimmed.hasPrefix("//") {
            trimmed = "https:\(trimmed)"
        }

        if trimmed.lowercased().hasPrefix("http://") {
            trimmed = "https://" + String(trimmed.dropFirst("http://".count))
        }

        if let absolute = URL(string: trimmed), absolute.scheme != nil {
            return absolute.absoluteString
        }

        if !trimmed.hasPrefix("/") {
            trimmed = "/\(trimmed)"
        }

        if !trimmed.lowercased().hasSuffix(".html"),
           !trimmed.lowercased().hasSuffix(".htm") {
            if !trimmed.hasSuffix("/") {
                trimmed += "/"
            }
            trimmed += "story_html5.html"
        }

        return trimmed
    }

    private static func absoluteURL(from raw: String) -> URL? {
        let normalized = raw.replacingOccurrences(of: " ", with: "%20")
        guard let components = URLComponents(string: normalized),
              let scheme = components.scheme,
              !scheme.isEmpty else {
            return nil
        }
        return components.url ?? URL(string: normalized)
    }
}

enum KDSAPIError: LocalizedError {
    case misconfigured([String])
    case badResponse
    case http(Int, String)
    case decoding(String)
    case notFound
    case unauthorized
    case forbidden
    case offline(String)

    var errorDescription: String? {
        switch self {
        case .misconfigured(let keys):
            return "Missing iOS config values: \(keys.joined(separator: ", "))"
        case .badResponse:
            return "The server returned an invalid response."
        case .http(_, let body):
            let message = Self.normalizedHTTPMessage(from: body)
            if message.localizedCaseInsensitiveContains("email not confirmed") ||
                message.localizedCaseInsensitiveContains("email_not_confirmed") {
                return "Confirm your email from your inbox before signing in to PanAvest KDS."
            }
            return message.isEmpty ? "The request failed." : message
        case .decoding(let reason):
            return "Response decoding failed: \(reason)"
        case .notFound:
            return "The requested item was not found."
        case .unauthorized:
            return "Your session has expired. Please sign in again."
        case .forbidden:
            return "This content is not linked to your account."
        case .offline(let reason):
            return reason
        }
    }

    private static func normalizedHTTPMessage(from body: String) -> String {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        guard let data = trimmed.data(using: .utf8),
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return trimmed
        }

        for key in ["msg", "message", "error_description", "error", "error_code"] {
            if let value = payload[key] as? String {
                let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !normalized.isEmpty {
                    return normalized
                }
            }
        }

        return trimmed
    }
}

enum KDSJSON {
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            if let date = ISO8601DateFormatter.kdsFractional.date(from: raw) {
                return date
            }
            if let date = ISO8601DateFormatter.kdsStandard.date(from: raw) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date \(raw)")
        }
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(ISO8601DateFormatter.kdsFractional.string(from: date))
        }
        return encoder
    }()
}

extension ISO8601DateFormatter {
    static let kdsFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let kdsStandard: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}

enum KDSBiometricKind: Equatable {
    case none
    case faceID
    case touchID

    var displayName: String {
        switch self {
        case .none:
            return "Biometrics"
        case .faceID:
            return "Face ID"
        case .touchID:
            return "Touch ID"
        }
    }

    var symbolName: String {
        switch self {
        case .none:
            return "lock"
        case .faceID:
            return "faceid"
        case .touchID:
            return "touchid"
        }
    }
}

enum KDSBiometricError: LocalizedError {
    case unavailable
    case cancelled
    case noCredentials
    case failed

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Biometric sign-in is not available on this device yet."
        case .cancelled:
            return nil
        case .noCredentials:
            return "No saved biometric sign-in is available yet. Sign in with your password once first."
        case .failed:
            return "Biometric sign-in failed. Please try again or use your password."
        }
    }
}

enum KDSBiometrics {
    static func currentKind() -> KDSBiometricKind {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return .none
        }
        switch context.biometryType {
        case .faceID:
            return .faceID
        case .touchID:
            return .touchID
        default:
            return .none
        }
    }

    static func error(from error: NSError?) -> KDSBiometricError {
        guard let error else { return .failed }
        guard error.domain == LAError.errorDomain,
              let laError = LAError.Code(rawValue: error.code) else {
            return .failed
        }

        switch laError {
        case .appCancel, .systemCancel, .userCancel, .userFallback:
            return .cancelled
        case .biometryLockout, .biometryNotAvailable, .biometryNotEnrolled, .passcodeNotSet:
            return .unavailable
        default:
            return .failed
        }
    }
}

final class KDSKeychain {
    func save(_ data: Data, for key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    func load(for key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else { return nil }
        return item as? Data
    }

    @discardableResult
    func saveBiometricProtected(_ data: Data, for key: String) -> Bool {
        remove(for: key)

        var accessControlError: Unmanaged<CFError>?
        guard let accessControl = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .biometryCurrentSet,
            &accessControlError
        ) else {
            return false
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrAccessControl as String: accessControl,
            kSecValueData as String: data
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    func loadBiometricProtected(for key: String, prompt: String) throws -> Data {
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"

        var authError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &authError) else {
            throw KDSBiometrics.error(from: authError)
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseAuthenticationContext as String: context,
            kSecUseOperationPrompt as String: prompt
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data else { throw KDSBiometricError.failed }
            return data
        case errSecItemNotFound:
            throw KDSBiometricError.noCredentials
        case errSecUserCanceled, errSecInteractionNotAllowed, errSecAuthFailed:
            throw KDSBiometricError.cancelled
        default:
            throw KDSBiometricError.failed
        }
    }

    func remove(for key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}

final class KDSDiskStore {
    private let baseURL: URL

    init(folderName: String = "KDSNativeCache") {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        baseURL = appSupport.appendingPathComponent(folderName, isDirectory: true)
        try? FileManager.default.createDirectory(at: baseURL, withIntermediateDirectories: true)
    }

    func save<T: Encodable>(_ value: T, named name: String) {
        let url = baseURL.appendingPathComponent(name)
        do {
            let data = try KDSJSON.encoder.encode(value)
            try data.write(to: url, options: [.atomic])
        } catch {
            print("Disk save failed for \(name): \(error)")
        }
    }

    func load<T: Decodable>(_ type: T.Type, named name: String) -> T? {
        let url = baseURL.appendingPathComponent(name)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? KDSJSON.decoder.decode(T.self, from: data)
    }

    func saveData(_ data: Data, named name: String) {
        let url = baseURL.appendingPathComponent(name)
        try? data.write(to: url, options: [.atomic])
    }

    func loadData(named name: String) -> Data? {
        let url = baseURL.appendingPathComponent(name)
        return try? Data(contentsOf: url)
    }
}

@MainActor
final class KDSNetworkMonitor: ObservableObject {
    @Published private(set) var isConnected = true

    var onReconnect: (() -> Void)?
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "kds.network.monitor")

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let connected = path.status == .satisfied
            DispatchQueue.main.async {
                let wasConnected = self.isConnected
                self.isConnected = connected
                if connected && !wasConnected {
                    self.onReconnect?()
                }
            }
        }
        monitor.start(queue: queue)
    }

    deinit {
        monitor.cancel()
    }
}

enum KDSRemoteAssetLoader {
    static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        configuration.urlCache = URLCache.shared
        configuration.waitsForConnectivity = true
        configuration.timeoutIntervalForRequest = 45
        configuration.timeoutIntervalForResource = 90
        return URLSession(configuration: configuration)
    }()

    static func makeRequest(
        url: URL,
        accept: String? = nil,
        cachePolicy: URLRequest.CachePolicy = .returnCacheDataElseLoad,
        timeout: TimeInterval = 45,
        config: KDSConfig = .current
    ) -> URLRequest {
        var request = URLRequest(url: url, cachePolicy: cachePolicy, timeoutInterval: timeout)
        if let accept {
            request.setValue(accept, forHTTPHeaderField: "Accept")
        }
        if isSupabaseAsset(url, config: config), !config.supabaseAnonKey.isEmpty {
            request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(config.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    static func fetchData(
        url: URL,
        accept: String? = nil,
        cachePolicy: URLRequest.CachePolicy = .returnCacheDataElseLoad,
        timeout: TimeInterval = 45,
        config: KDSConfig = .current
    ) async throws -> (Data, URLResponse) {
        let request = makeRequest(
            url: url,
            accept: accept,
            cachePolicy: cachePolicy,
            timeout: timeout,
            config: config
        )
        return try await session.data(for: request)
    }

    private static func isSupabaseAsset(_ url: URL, config: KDSConfig) -> Bool {
        guard let supabaseHost = config.supabaseURL?.host?.lowercased(),
              let urlHost = url.host?.lowercased() else {
            return false
        }
        return urlHost == supabaseHost || urlHost.hasSuffix(".supabase.co")
    }
}

final class KDSAPIClient {
    let config: KDSConfig

    init(config: KDSConfig = .current) {
        self.config = config
    }

    func supabaseRequest(
        path: String,
        query: [URLQueryItem] = [],
        method: String = "GET",
        bearerToken: String? = nil,
        body: Data? = nil,
        prefer: String? = nil,
        acceptObject: Bool = false
    ) throws -> URLRequest {
        guard let supabaseURL = config.supabaseURL else {
            throw KDSAPIError.misconfigured(config.missingKeys)
        }

        var components = URLComponents(url: supabaseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        components?.queryItems = query
        guard let url = components?.url else { throw KDSAPIError.badResponse }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.httpBody = body
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(bearerToken ?? config.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(
            acceptObject ? "application/vnd.pgrst.object+json" : "application/json",
            forHTTPHeaderField: "Accept"
        )
        if let prefer {
            request.setValue(prefer, forHTTPHeaderField: "Prefer")
        }
        return request
    }

    func appRequest(
        path: String,
        query: [URLQueryItem] = [],
        method: String = "GET",
        bearerToken: String? = nil,
        body: Data? = nil,
        contentType: String = "application/json"
    ) throws -> URLRequest {
        guard let baseURL = config.appBaseURL else {
            throw KDSAPIError.misconfigured(config.missingKeys)
        }

        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        components?.queryItems = query
        guard let url = components?.url else { throw KDSAPIError.badResponse }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 45
        request.httpBody = body
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        if let bearerToken, !bearerToken.isEmpty {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    func send<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let data = try await sendData(request)
        do {
            return try KDSJSON.decoder.decode(T.self, from: data)
        } catch {
            throw KDSAPIError.decoding(error.localizedDescription)
        }
    }

    func sendData(_ request: URLRequest) async throws -> Data {
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw KDSAPIError.badResponse
            }
            switch http.statusCode {
            case 200 ... 299:
                return data
            case 401:
                throw KDSAPIError.unauthorized
            case 403:
                throw KDSAPIError.forbidden
            case 404:
                throw KDSAPIError.notFound
            default:
                let body = String(data: data, encoding: .utf8) ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
                throw KDSAPIError.http(http.statusCode, body)
            }
        } catch let error as KDSAPIError {
            throw error
        } catch {
            throw KDSAPIError.offline(error.localizedDescription)
        }
    }
}

final class KDSProgressStore {
    private let diskStore: KDSDiskStore

    init(diskStore: KDSDiskStore) {
        self.diskStore = diskStore
    }

    func loadCompletedSlideIDs(userId: String, courseId: String) -> Set<String> {
        Set(diskStore.load([String].self, named: "progress-\(userId)-\(courseId).json") ?? [])
    }

    func saveCompletedSlideIDs(_ slideIDs: Set<String>, userId: String, courseId: String) {
        diskStore.save(Array(slideIDs).sorted(), named: "progress-\(userId)-\(courseId).json")
    }
}

final class KDSReaderStateStore {
    private let diskStore: KDSDiskStore

    init(diskStore: KDSDiskStore) {
        self.diskStore = diskStore
    }

    func load(ebookId: String) -> ReaderProgress? {
        diskStore.load(ReaderProgress.self, named: "reader-\(ebookId).json")
    }

    func save(_ progress: ReaderProgress) {
        diskStore.save(progress, named: "reader-\(progress.ebookId).json")
    }
}

@MainActor
final class KDSSyncCoordinator: ObservableObject {
    @Published private(set) var queue: [PendingProgressMutation]

    var flushHandler: (([PendingProgressMutation]) async -> Set<String>)?
    private let diskStore: KDSDiskStore

    init(diskStore: KDSDiskStore) {
        self.diskStore = diskStore
        self.queue = diskStore.load([PendingProgressMutation].self, named: "sync-queue.json") ?? []
    }

    func enqueue(_ mutation: PendingProgressMutation) {
        if !queue.contains(mutation) {
            queue.append(mutation)
            persist()
        }
    }

    func flushIfNeeded() async {
        guard !queue.isEmpty, let flushHandler else { return }
        let uploadedIDs = await flushHandler(queue)
        guard !uploadedIDs.isEmpty else { return }
        queue.removeAll { uploadedIDs.contains($0.id) }
        persist()
    }

    private func persist() {
        diskStore.save(queue, named: "sync-queue.json")
    }
}

enum KDSCSVParser {
    static func parse(_ csv: String) -> [AIEntry] {
        let rows = csv.split(whereSeparator: \.isNewline).map(String.init)
        guard let header = rows.first else { return [] }
        let columns = parseLine(header)
        var entries: [AIEntry] = []

        for row in rows.dropFirst() where !row.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let values = parseLine(row)
            guard !values.isEmpty else { continue }
            var mapped: [String: String] = [:]
            for (index, key) in columns.enumerated() where index < values.count {
                mapped[key.lowercased()] = values[index]
            }
            let term = mapped["term"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let definition = mapped["definition"]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !term.isEmpty, !definition.isEmpty else { continue }
            entries.append(
                AIEntry(
                    term: term,
                    definition: definition,
                    synonyms: mapped["synonyms"] ?? "",
                    tags: mapped["tags"] ?? "",
                    pronunciation: mapped["pronunciation"] ?? "",
                    partOfSpeech: mapped["pos"] ?? mapped["partofspeech"] ?? "",
                    examples: mapped["examples"] ?? ""
                )
            )
        }

        return entries
    }

    private static func parseLine(_ line: String) -> [String] {
        var result: [String] = []
        var current = ""
        var inQuotes = false

        for character in line {
            switch character {
            case "\"":
                inQuotes.toggle()
            case "," where !inQuotes:
                result.append(current)
                current = ""
            default:
                current.append(character)
            }
        }

        result.append(current)
        return result.map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: "\"", with: "")
        }
    }
}

extension String {
    func htmlStripped() -> String {
        replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
