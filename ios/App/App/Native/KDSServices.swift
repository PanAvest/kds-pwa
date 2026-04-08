import Foundation
import UIKit
import UserNotifications

final class AuthService {
    private let client: KDSAPIClient
    private let keychain: KDSKeychain
    private let sessionKey = "kds.native.session"
    private let biometricCredentialsKey = "kds.native.biometric.credentials"
    private let biometricEmailKey = "kds.native.biometric.email"

    init(client: KDSAPIClient, keychain: KDSKeychain) {
        self.client = client
        self.keychain = keychain
    }

    var biometricKind: KDSBiometricKind {
        KDSBiometrics.currentKind()
    }

    var hasSavedBiometricCredentials: Bool {
        keychain.load(for: biometricEmailKey) != nil
    }

    var savedBiometricEmail: String? {
        guard let data = keychain.load(for: biometricEmailKey) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func restoreSession() async -> KDSSession? {
        guard let data = keychain.load(for: sessionKey),
              let session = try? KDSJSON.decoder.decode(KDSSession.self, from: data) else {
            return nil
        }

        do {
            if session.isExpired {
                return try await refreshSession(using: session.refreshToken)
            }
            let user = try await fetchUser(accessToken: session.accessToken)
            let refreshed = KDSSession(
                accessToken: session.accessToken,
                refreshToken: session.refreshToken,
                expiresAt: session.expiresAt,
                user: KDSUser(id: user.id, email: user.email ?? session.user.email, fullName: session.user.fullName)
            )
            save(session: refreshed)
            return refreshed
        } catch {
            clearSession()
            return nil
        }
    }

    func signIn(email: String, password: String) async throws -> KDSSession {
        let payload = ["email": email, "password": password]
        let request = try supabaseAuthRequest(
            path: "token",
            query: [URLQueryItem(name: "grant_type", value: "password")],
            method: "POST",
            body: try JSONSerialization.data(withJSONObject: payload)
        )
        let response: AuthPayload = try await client.send(request, as: AuthPayload.self)
        guard let session = response.optionalSession else {
            throw KDSAPIError.unauthorized
        }
        save(session: session)
        return session
    }

    func signInWithBiometrics() async throws -> KDSSession {
        let prompt = "Use \(biometricKind.displayName) to sign in to KDS Learning."
        let data = try keychain.loadBiometricProtected(for: biometricCredentialsKey, prompt: prompt)
        let credentials = try KDSJSON.decoder.decode(BiometricCredentials.self, from: data)
        let session = try await signIn(email: credentials.email, password: credentials.password)
        _ = saveBiometricCredentials(email: credentials.email, password: credentials.password)
        return session
    }

    func signUp(email: String, password: String, profile: KDSSignUpProfile) async throws -> KDSSession? {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var payload: [String: Any] = [
            "email": normalizedEmail,
            "password": password,
            "data": [
                "full_name": profile.fullName,
                "date_of_birth": profile.dateOfBirth,
                "age": profile.age as Any? ?? NSNull(),
                "highest_education": profile.highestEducation,
                "country_code": profile.countryCode,
                "country_name": profile.countryName
            ]
        ]
        if let redirectURL = client.config.appBaseURL?
            .appendingPathComponent("auth")
            .appendingPathComponent("sign-in") {
            payload["redirect_to"] = redirectURL.absoluteString
        }
        let request = try supabaseAuthRequest(
            path: "signup",
            method: "POST",
            body: try JSONSerialization.data(withJSONObject: payload)
        )
        let response: AuthPayload = try await client.send(request, as: AuthPayload.self)
        if let session = response.optionalSession {
            save(session: session)
            return session
        }
        return nil
    }

    func requestPasswordReset(email: String) async throws {
        guard let appBaseURL = client.config.appBaseURL else {
            throw KDSAPIError.misconfigured(client.config.missingKeys)
        }
        let payload: [String: String] = [
            "email": email,
            "redirect_to": appBaseURL
                .appendingPathComponent("auth")
                .appendingPathComponent("sign-in")
                .absoluteString
        ]
        let request = try supabaseAuthRequest(
            path: "recover",
            method: "POST",
            body: try JSONSerialization.data(withJSONObject: payload)
        )
        _ = try await client.sendData(request)
    }

    func refreshSession(using refreshToken: String) async throws -> KDSSession {
        let payload = ["refresh_token": refreshToken]
        let request = try supabaseAuthRequest(
            path: "token",
            query: [URLQueryItem(name: "grant_type", value: "refresh_token")],
            method: "POST",
            body: try JSONSerialization.data(withJSONObject: payload)
        )
        let response: AuthPayload = try await client.send(request, as: AuthPayload.self)
        guard let session = response.optionalSession else {
            throw KDSAPIError.unauthorized
        }
        save(session: session)
        return session
    }

    func signOut() {
        clearSession()
    }

    @discardableResult
    func saveBiometricCredentials(email: String, password: String) -> Bool {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard biometricKind != .none,
              !normalizedEmail.isEmpty,
              !password.isEmpty,
              let emailData = normalizedEmail.data(using: .utf8),
              let credentialsData = try? KDSJSON.encoder.encode(
                BiometricCredentials(email: normalizedEmail, password: password)
              ) else {
            return false
        }

        guard keychain.saveBiometricProtected(credentialsData, for: biometricCredentialsKey) else {
            clearBiometricCredentials()
            return false
        }

        keychain.save(emailData, for: biometricEmailKey)
        return true
    }

    func clearBiometricCredentials() {
        keychain.remove(for: biometricCredentialsKey)
        keychain.remove(for: biometricEmailKey)
    }

    private func fetchUser(accessToken: String) async throws -> AuthPayload.UserPayload {
        let request = try supabaseAuthRequest(path: "user", bearerToken: accessToken)
        return try await client.send(request, as: AuthPayload.UserPayload.self)
    }

    private func save(session: KDSSession) {
        guard let data = try? KDSJSON.encoder.encode(session) else { return }
        keychain.save(data, for: sessionKey)
    }

    private func clearSession() {
        keychain.remove(for: sessionKey)
    }

    private func supabaseAuthRequest(
        path: String,
        query: [URLQueryItem] = [],
        method: String = "GET",
        bearerToken: String? = nil,
        body: Data? = nil
    ) throws -> URLRequest {
        guard let supabaseURL = client.config.supabaseURL else {
            throw KDSAPIError.misconfigured(client.config.missingKeys)
        }

        var components = URLComponents(url: supabaseURL.appendingPathComponent("auth/v1/\(path)"), resolvingAgainstBaseURL: false)
        components?.queryItems = query
        guard let url = components?.url else { throw KDSAPIError.badResponse }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.timeoutInterval = 30
        request.setValue(client.config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearerToken {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private struct AuthPayload: Decodable {
        let accessToken: String?
        let refreshToken: String?
        let expiresAt: TimeInterval?
        let user: UserPayload

        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case refreshToken = "refresh_token"
            case expiresAt = "expires_at"
            case user
        }

        struct UserPayload: Decodable {
            let id: String
            let email: String?
        }

        var optionalSession: KDSSession? {
            guard let accessToken, let refreshToken else { return nil }
            return KDSSession(
                accessToken: accessToken,
                refreshToken: refreshToken,
                expiresAt: expiresAt.map(Date.init(timeIntervalSince1970:)),
                user: KDSUser(id: user.id, email: user.email ?? "", fullName: nil)
            )
        }

        var session: KDSSession {
            optionalSession ?? KDSSession(
                accessToken: "",
                refreshToken: "",
                expiresAt: nil,
                user: KDSUser(id: user.id, email: user.email ?? "", fullName: nil)
            )
        }
    }

    private struct BiometricCredentials: Codable {
        let email: String
        let password: String
    }
}

final class CoursesService {
    private let client: KDSAPIClient
    private let diskStore: KDSDiskStore

    init(client: KDSAPIClient, diskStore: KDSDiskStore) {
        self.client = client
        self.diskStore = diskStore
    }

    func fetchPrograms(userId: String, token: String) async throws -> [CourseSummary] {
        do {
            let request = try client.supabaseRequest(
                path: "rest/v1/enrollments",
                query: [
                    URLQueryItem(name: "user_id", value: "eq.\(userId)"),
                    URLQueryItem(name: "select", value: "course_id,paid,courses:course_id(id,slug,title,description,img,cpd_points,published,coming_soon,free_for_logged_in,delivery_mode,interactive_path)"),
                    URLQueryItem(name: "order", value: "updated_at.desc")
                ],
                bearerToken: token
            )
            let rows: [EnrollmentRow] = try await client.send(request, as: [EnrollmentRow].self)
            var courses = rows.compactMap { $0.courses.first }

            let freeRequest = try client.supabaseRequest(
                path: "rest/v1/courses",
                query: [
                    URLQueryItem(name: "published", value: "eq.true"),
                    URLQueryItem(name: "free_for_logged_in", value: "eq.true"),
                    URLQueryItem(name: "select", value: "id,slug,title,description,img,cpd_points,published,coming_soon,free_for_logged_in,delivery_mode,interactive_path"),
                    URLQueryItem(name: "order", value: "created_at.desc")
                ],
                bearerToken: token
            )
            let freeCourses: [CourseSummary] = try await client.send(freeRequest, as: [CourseSummary].self)
            for course in freeCourses where !courses.contains(where: { $0.id == course.id }) {
                courses.append(course)
            }
            diskStore.save(courses, named: "courses-linked.json")
            return courses
        } catch {
            if let cached = diskStore.load([CourseSummary].self, named: "courses-linked.json") {
                return cached
            }
            throw error
        }
    }

    func fetchCatalog(token: String) async throws -> [CourseSummary] {
        do {
            let request = try client.supabaseRequest(
                path: "rest/v1/courses",
                query: [
                    URLQueryItem(name: "published", value: "eq.true"),
                    URLQueryItem(name: "select", value: "id,slug,title,description,img,cpd_points,published,coming_soon,free_for_logged_in,delivery_mode,interactive_path"),
                    URLQueryItem(name: "order", value: "created_at.desc")
                ],
                bearerToken: token
            )
            let courses: [CourseSummary] = try await client.send(request, as: [CourseSummary].self)
            let deduped = Array(Dictionary(uniqueKeysWithValues: courses.map { ($0.id, $0) }).values)
                .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
            diskStore.save(deduped, named: "courses-catalog.json")
            return deduped
        } catch {
            if let cached = diskStore.load([CourseSummary].self, named: "courses-catalog.json") {
                return cached
            }
            throw error
        }
    }

    func fetchCourse(slug: String, token: String) async throws -> CourseSummary {
        let request = try client.supabaseRequest(
            path: "rest/v1/courses",
            query: [
                URLQueryItem(name: "slug", value: "eq.\(slug)"),
                URLQueryItem(name: "select", value: "id,slug,title,description,img,cpd_points,published,coming_soon,free_for_logged_in,delivery_mode,interactive_path"),
                URLQueryItem(name: "limit", value: "1")
            ],
            bearerToken: token
        )
        let rows: [CourseSummary] = try await client.send(request, as: [CourseSummary].self)
        guard let course = rows.first else { throw KDSAPIError.notFound }
        return course
    }

    func userHasAccess(userId: String, course: CourseSummary, token: String) async throws -> Bool {
        if course.freeForLoggedIn == true { return true }
        let request = try client.supabaseRequest(
            path: "rest/v1/enrollments",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userId)"),
                URLQueryItem(name: "course_id", value: "eq.\(course.id)"),
                URLQueryItem(name: "select", value: "course_id"),
                URLQueryItem(name: "limit", value: "1")
            ],
            bearerToken: token
        )
        let rows: [[String: String]] = try await client.send(request, as: [[String: String]].self)
        return !rows.isEmpty
    }

    func fetchCourseStructure(courseId: String, token: String) async throws -> (chapters: [Chapter], slides: [Slide]) {
        let chapterRequest = try client.supabaseRequest(
            path: "rest/v1/course_chapters",
            query: [
                URLQueryItem(name: "course_id", value: "eq.\(courseId)"),
                URLQueryItem(name: "select", value: "id,title,order_index,course_id,intro_video_url"),
                URLQueryItem(name: "order", value: "order_index.asc")
            ],
            bearerToken: token
        )
        let chapters: [Chapter] = try await client.send(chapterRequest, as: [Chapter].self)

        let chapterIds = chapters.map(\.id)
        guard !chapterIds.isEmpty else { return (chapters, []) }

        let slidesRequest = try client.supabaseRequest(
            path: "rest/v1/course_slides",
            query: [
                URLQueryItem(name: "chapter_id", value: "in.(\(chapterIds.joined(separator: ",")))"),
                URLQueryItem(name: "select", value: "id,chapter_id,title,order_index,intro_video_url,asset_url,body,video_url,content"),
                URLQueryItem(name: "order", value: "order_index.asc")
            ],
            bearerToken: token
        )
        let slides: [Slide] = try await client.send(slidesRequest, as: [Slide].self)
        return (chapters, slides)
    }

    func fetchProgress(userId: String, courseId: String, token: String) async throws -> Set<String> {
        let request = try client.supabaseRequest(
            path: "rest/v1/user_slide_progress",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userId)"),
                URLQueryItem(name: "course_id", value: "eq.\(courseId)"),
                URLQueryItem(name: "select", value: "slide_id")
            ],
            bearerToken: token
        )
        let rows: [SlideProgressRow] = try await client.send(request, as: [SlideProgressRow].self)
        return Set(rows.map(\.slideId))
    }

    func uploadProgressMutations(_ mutations: [PendingProgressMutation], token: String) async -> Set<String> {
        guard !mutations.isEmpty else { return [] }
        do {
            let payload = mutations.map { mutation in
                [
                    "user_id": mutation.userId,
                    "course_id": mutation.courseId,
                    "slide_id": mutation.slideId,
                    "completed_at": ISO8601DateFormatter.kdsFractional.string(from: mutation.completedAt)
                ]
            }
            let body = try JSONSerialization.data(withJSONObject: payload)
            let request = try client.supabaseRequest(
                path: "rest/v1/user_slide_progress",
                query: [URLQueryItem(name: "on_conflict", value: "user_id,course_id,slide_id")],
                method: "POST",
                bearerToken: token,
                body: body,
                prefer: "resolution=merge-duplicates,return=representation"
            )
            _ = try await client.sendData(request)
            return Set(mutations.map(\.id))
        } catch {
            return []
        }
    }

    private struct EnrollmentRow: Decodable {
        let courses: Embedded<CourseSummary>
    }

    private struct SlideProgressRow: Decodable {
        let slideId: String

        enum CodingKeys: String, CodingKey {
            case slideId = "slide_id"
        }
    }
}

final class EbooksService {
    private let client: KDSAPIClient
    private let diskStore: KDSDiskStore

    init(client: KDSAPIClient, diskStore: KDSDiskStore) {
        self.client = client
        self.diskStore = diskStore
    }

    func fetchLinkedEbooks(token: String) async throws -> [EbookSummary] {
        do {
            let request = try client.appRequest(path: "api/ebooks", bearerToken: token)
            let ebooks: [EbookSummary] = try await client.send(request, as: [EbookSummary].self)
            diskStore.save(ebooks, named: "ebooks-linked.json")
            return ebooks
        } catch {
            if let cached = diskStore.load([EbookSummary].self, named: "ebooks-linked.json") {
                return cached
            }
            throw error
        }
    }

    func fetchEbook(slug: String, token: String) async throws -> EbookDetail {
        let request = try client.appRequest(path: "api/ebooks/\(slug)", bearerToken: token)
        let response: EbookResponse = try await client.send(request, as: EbookResponse.self)
        return response.ebook
    }

    func fetchSecurePDF(ebookId: String, token: String) async throws -> Data {
        let request = try client.appRequest(
            path: "api/ebooks/secure-pdf",
            query: [URLQueryItem(name: "ebookId", value: ebookId)],
            bearerToken: token
        )
        return try await client.sendData(request)
    }

    private struct EbookResponse: Decodable {
        let ebook: EbookDetail
    }
}

final class AssessmentsService {
    private let client: KDSAPIClient

    init(client: KDSAPIClient) {
        self.client = client
    }

    func fetchQuizQuestions(chapterIds: [String], token: String) async throws -> [QuizQuestion] {
        guard !chapterIds.isEmpty else { return [] }
        let request = try client.supabaseRequest(
            path: "rest/v1/chapter_quiz_questions",
            query: [
                URLQueryItem(name: "chapter_id", value: "in.(\(chapterIds.joined(separator: ",")))"),
                URLQueryItem(name: "select", value: "id,chapter_id,question,options,correct_index")
            ],
            bearerToken: token
        )
        return try await client.send(request, as: [QuizQuestion].self)
    }

    func fetchQuizSettings(chapterIds: [String], token: String) async throws -> [QuizSetting] {
        guard !chapterIds.isEmpty else { return [] }
        let request = try client.supabaseRequest(
            path: "rest/v1/chapter_quiz_settings",
            query: [
                URLQueryItem(name: "chapter_id", value: "in.(\(chapterIds.joined(separator: ",")))"),
                URLQueryItem(name: "select", value: "chapter_id,time_limit_seconds,num_questions")
            ],
            bearerToken: token
        )
        return try await client.send(request, as: [QuizSetting].self)
    }

    func fetchChapterScores(userId: String, courseId: String, token: String) async throws -> [ChapterScore] {
        let request = try client.supabaseRequest(
            path: "rest/v1/user_chapter_quiz",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userId)"),
                URLQueryItem(name: "course_id", value: "eq.\(courseId)"),
                URLQueryItem(name: "select", value: "chapter_id,score_pct,total_count,correct_count,completed_at"),
                URLQueryItem(name: "order", value: "completed_at.desc")
            ],
            bearerToken: token
        )
        let rows: [ChapterScoreRow] = try await client.send(request, as: [ChapterScoreRow].self)
        return rows.map {
            ChapterScore(
                id: "\($0.chapterId)-\($0.completedAt?.timeIntervalSince1970 ?? 0)",
                chapterId: $0.chapterId,
                chapterTitle: "Chapter",
                scorePercent: $0.scorePct,
                correctCount: $0.correctCount,
                totalCount: $0.totalCount,
                completedAt: $0.completedAt
            )
        }
    }

    func submitChapterQuiz(
        userId: String,
        courseId: String,
        chapterId: String,
        totalCount: Int,
        correctCount: Int,
        scorePercent: Int,
        token: String,
        autoSubmit: Bool = false
    ) async throws {
        let payload: [[String: Any]] = [[
            "user_id": userId,
            "course_id": courseId,
            "chapter_id": chapterId,
            "total_count": totalCount,
            "correct_count": correctCount,
            "score_pct": scorePercent,
            "completed_at": ISO8601DateFormatter.kdsFractional.string(from: Date()),
            "meta": ["autoSubmit": autoSubmit]
        ]]
        let request = try client.supabaseRequest(
            path: "rest/v1/user_chapter_quiz",
            method: "POST",
            bearerToken: token,
            body: try JSONSerialization.data(withJSONObject: payload),
            prefer: "return=representation"
        )
        _ = try await client.sendData(request)
    }

    func fetchExam(courseId: String, token: String) async throws -> Exam? {
        let request = try client.supabaseRequest(
            path: "rest/v1/exams",
            query: [
                URLQueryItem(name: "course_id", value: "eq.\(courseId)"),
                URLQueryItem(name: "select", value: "id,course_id,title,pass_mark,time_limit_minutes"),
                URLQueryItem(name: "limit", value: "1")
            ],
            bearerToken: token
        )
        let exams: [Exam] = try await client.send(request, as: [Exam].self)
        return exams.first
    }

    func fetchExamQuestions(examId: String, token: String) async throws -> [ExamQuestion] {
        let request = try client.supabaseRequest(
            path: "rest/v1/questions",
            query: [
                URLQueryItem(name: "exam_id", value: "eq.\(examId)"),
                URLQueryItem(name: "select", value: "id,exam_id,prompt,options,correct_index")
            ],
            bearerToken: token
        )
        return try await client.send(request, as: [ExamQuestion].self)
    }

    func fetchFinalAttempt(userId: String, examId: String, token: String) async throws -> ExamAttempt? {
        let request = try client.supabaseRequest(
            path: "rest/v1/attempts",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userId)"),
                URLQueryItem(name: "exam_id", value: "eq.\(examId)"),
                URLQueryItem(name: "select", value: "id,exam_id,score,passed,created_at"),
                URLQueryItem(name: "order", value: "created_at.desc"),
                URLQueryItem(name: "limit", value: "1")
            ],
            bearerToken: token
        )
        let attempts: [ExamAttempt] = try await client.send(request, as: [ExamAttempt].self)
        return attempts.first
    }

    func submitFinalExam(
        userId: String,
        examId: String,
        score: Int,
        passed: Bool,
        totalCount: Int,
        correctCount: Int,
        token: String,
        autoSubmit: Bool = false
    ) async throws {
        let payload: [[String: Any]] = [[
            "user_id": userId,
            "exam_id": examId,
            "score": score,
            "passed": passed,
            "created_at": ISO8601DateFormatter.kdsFractional.string(from: Date()),
            "meta": ["autoSubmit": autoSubmit, "total": totalCount, "correctCount": correctCount]
        ]]
        let request = try client.supabaseRequest(
            path: "rest/v1/attempts",
            method: "POST",
            bearerToken: token,
            body: try JSONSerialization.data(withJSONObject: payload),
            prefer: "return=representation"
        )
        _ = try await client.sendData(request)
    }

    private struct ChapterScoreRow: Decodable {
        let chapterId: String
        let scorePct: Int
        let totalCount: Int
        let correctCount: Int
        let completedAt: Date?

        enum CodingKeys: String, CodingKey {
            case chapterId = "chapter_id"
            case scorePct = "score_pct"
            case totalCount = "total_count"
            case correctCount = "correct_count"
            case completedAt = "completed_at"
        }
    }
}

final class AIService {
    private let client: KDSAPIClient
    private let diskStore: KDSDiskStore

    init(client: KDSAPIClient, diskStore: KDSDiskStore) {
        self.client = client
        self.diskStore = diskStore
    }

    func loadDictionary() async throws -> [AIEntry] {
        do {
            let request = try client.appRequest(path: "scmpedia_full_UPDATED.csv", contentType: "text/csv")
            let data = try await client.sendData(request)
            guard let csv = String(data: data, encoding: .utf8) else { throw KDSAPIError.badResponse }
            let entries = KDSCSVParser.parse(csv)
            diskStore.save(entries, named: "ai-dictionary.json")
            return entries
        } catch {
            if let cached = diskStore.load([AIEntry].self, named: "ai-dictionary.json") {
                return cached
            }
            let fallbackRequest = try client.appRequest(path: "scmpedia_full.csv", contentType: "text/csv")
            let fallbackData = try await client.sendData(fallbackRequest)
            guard let csv = String(data: fallbackData, encoding: .utf8) else { throw error }
            let entries = KDSCSVParser.parse(csv)
            diskStore.save(entries, named: "ai-dictionary.json")
            return entries
        }
    }

    func search(_ query: String, in entries: [AIEntry]) -> [AIEntry] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !needle.isEmpty else { return [] }

        var exactMatches: [AIEntry] = []
        var prefixMatches: [AIEntry] = []
        var termMatches: [AIEntry] = []
        var metadataMatches: [AIEntry] = []

        for entry in entries {
            let term = entry.term.lowercased()
            if term == needle {
                exactMatches.append(entry)
                continue
            }
            if term.hasPrefix(needle) {
                prefixMatches.append(entry)
                continue
            }
            if term.contains(needle) {
                termMatches.append(entry)
                continue
            }

            let synonyms = entry.synonyms.lowercased()
            let tags = entry.tags.lowercased()
            let definition = entry.definition.lowercased()
            if synonyms.contains(needle) || tags.contains(needle) || definition.contains(needle) {
                metadataMatches.append(entry)
            }
        }

        return Array((exactMatches + prefixMatches + termMatches + metadataMatches).prefix(8))
    }

    func explain(term entry: AIEntry) async throws -> String {
        let prompt = """
        You are a Supply Chain Tutor.
        Term: "\(entry.term)"
        Definition: "\(entry.definition)"
        Tags: "\(entry.tags)"

        Task: Explain this concept simply to a professional. Provide a clear definition and a real-world supply chain example.

        Output Format:
        Return strictly HTML with <b> tags. No markdown.
        1. <b>Concept:</b> (Explanation)
        2. <b>Real-World Example:</b> (Example)
        """

        let request = try client.appRequest(
            path: "api/ai",
            method: "POST",
            body: try JSONSerialization.data(withJSONObject: ["prompt": prompt])
        )
        let response: AIResponse = try await client.send(request, as: AIResponse.self)
        return response.text
    }

    func fetchImage(for query: String) async throws -> URL? {
        let request = try client.appRequest(
            path: "api/image",
            query: [URLQueryItem(name: "q", value: query)]
        )
        let response: RemoteImagePayload = try await client.send(request, as: RemoteImagePayload.self)
        return URL(string: response.thumbnail ?? response.url ?? response.link ?? "")
    }

    func synthesize(text: String) async throws -> Data {
        let request = try client.appRequest(
            path: "api/tts",
            method: "POST",
            body: try JSONSerialization.data(withJSONObject: ["text": text])
        )
        return try await client.sendData(request)
    }
    private struct AIResponse: Decodable {
        let text: String
    }
}

final class DashboardService {
    private let client: KDSAPIClient

    init(client: KDSAPIClient) {
        self.client = client
    }

    func fetchDisplayName(userId: String, token: String) async throws -> String {
        let request = try client.supabaseRequest(
            path: "rest/v1/profiles",
            query: [
                URLQueryItem(name: "id", value: "eq.\(userId)"),
                URLQueryItem(name: "select", value: "full_name"),
                URLQueryItem(name: "limit", value: "1")
            ],
            bearerToken: token
        )
        let rows: [ProfileRow] = try await client.send(request, as: [ProfileRow].self)
        return rows.first?.fullName ?? ""
    }

    func saveDisplayName(userId: String, fullName: String, token: String) async throws {
        let payload: [[String: Any]] = [[
            "id": userId,
            "full_name": fullName,
            "updated_at": ISO8601DateFormatter.kdsFractional.string(from: Date())
        ]]
        let request = try client.supabaseRequest(
            path: "rest/v1/profiles",
            query: [URLQueryItem(name: "on_conflict", value: "id")],
            method: "POST",
            bearerToken: token,
            body: try JSONSerialization.data(withJSONObject: payload),
            prefer: "resolution=merge-duplicates,return=representation"
        )
        _ = try await client.sendData(request)
    }

    func fetchCertificates(userId: String, token: String) async throws -> [CertificateRecord] {
        let request = try client.supabaseRequest(
            path: "rest/v1/certificates",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userId)"),
                URLQueryItem(name: "select", value: "id,course_id,attempt_id,certificate_no,issued_at,courses:course_id(id,title,slug,img,cpd_points)"),
                URLQueryItem(name: "order", value: "issued_at.desc")
            ],
            bearerToken: token
        )
        let rows: [CertificateRow] = try await client.send(request, as: [CertificateRow].self)

        let attemptIds = rows.compactMap(\.attemptId)
        let attemptsById = try await fetchAttemptsMap(ids: attemptIds, token: token)
        let origin = client.config.appBaseURL

        return rows.map { row in
            let course = row.courses.first
            let attempt = row.attemptId.flatMap { attemptsById[$0] }
            return CertificateRecord(
                id: row.id,
                courseId: row.courseId,
                courseTitle: course?.title ?? "Course",
                courseSlug: course?.slug,
                courseImageURL: course?.imageURL,
                cpdPoints: course?.cpdPoints,
                certificateNumber: row.certificateNo?.isEmpty == false ? row.certificateNo! : "KDS-\(userId.prefix(8).uppercased())-\(row.courseId.prefix(6).uppercased())",
                issuedAt: row.issuedAt ?? attempt?.createdAt ?? Date(),
                scorePercent: attempt?.score,
                verifyURL: origin?.appendingPathComponent("verify").appending(queryItems: [URLQueryItem(name: "cert_id", value: row.id)])
            )
        }
    }

    func fetchProvisionalCertificates(
        userId: String,
        token: String,
        enrolledCourses: [EnrolledCourse]
    ) async throws -> [ProvisionalCertificate] {
        let completedCourses = enrolledCourses.filter { $0.progressPercent >= 100 }
        guard !completedCourses.isEmpty else { return [] }

        let courseIds = completedCourses.map(\.id)
        let examRequest = try client.supabaseRequest(
            path: "rest/v1/exams",
            query: [
                URLQueryItem(name: "course_id", value: "in.(\(courseIds.joined(separator: ",")))"),
                URLQueryItem(name: "select", value: "id,course_id,title,pass_mark,time_limit_minutes")
            ],
            bearerToken: token
        )
        let exams: [Exam] = try await client.send(examRequest, as: [Exam].self)
        guard !exams.isEmpty else { return [] }

        let examIds = exams.map(\.id)
        let attemptsRequest = try client.supabaseRequest(
            path: "rest/v1/attempts",
            query: [
                URLQueryItem(name: "user_id", value: "eq.\(userId)"),
                URLQueryItem(name: "exam_id", value: "in.(\(examIds.joined(separator: ",")))"),
                URLQueryItem(name: "select", value: "id,exam_id,score,passed,created_at"),
                URLQueryItem(name: "order", value: "created_at.desc")
            ],
            bearerToken: token
        )
        let attempts: [ExamAttempt] = try await client.send(attemptsRequest, as: [ExamAttempt].self)
        var latestByExam: [String: ExamAttempt] = [:]
        for attempt in attempts {
            guard let examId = attempt.examId, latestByExam[examId] == nil else { continue }
            latestByExam[examId] = attempt
        }

        let existingIDs = Set(try await fetchCertificates(userId: userId, token: token).map(\.courseId))

        return exams.compactMap { exam in
            guard !existingIDs.contains(exam.courseId),
                  let attempt = latestByExam[exam.id],
                  let score = attempt.score else { return nil }
            let passMark = exam.passMark ?? 0
            guard score >= passMark else { return nil }
            let course = completedCourses.first(where: { $0.id == exam.courseId })
            guard let course else { return nil }
            return ProvisionalCertificate(
                id: exam.courseId,
                courseId: exam.courseId,
                courseTitle: course.title,
                courseSlug: course.slug,
                courseImageURL: course.imageURL,
                cpdPoints: course.cpdPoints,
                certificateNumber: "KDS-\(userId.prefix(8).uppercased())-\(exam.courseId.prefix(6).uppercased())",
                issuedAt: attempt.createdAt ?? Date(),
                scorePercent: score
            )
        }
    }

    func verifyCertificate(certId: String, token: String?) async throws -> VerifySnapshot? {
        let request = try client.supabaseRequest(
            path: "rest/v1/certificates",
            query: [
                URLQueryItem(name: "id", value: "eq.\(certId)"),
                URLQueryItem(name: "select", value: "id,course_id,attempt_id,certificate_no,issued_at,courses:course_id(title,slug,img,cpd_points)"),
                URLQueryItem(name: "limit", value: "1")
            ],
            bearerToken: token
        )
        let rows: [CertificateRow] = try await client.send(request, as: [CertificateRow].self)
        guard let row = rows.first else { return nil }
        let attempt = try await fetchAttemptsMap(ids: row.attemptId.map { [$0] } ?? [], token: token).values.first
        return VerifySnapshot(
            certificateID: row.id,
            courseTitle: row.courses.first?.title ?? "Course",
            certificateNumber: row.certificateNo ?? row.id,
            issuedAt: row.issuedAt ?? attempt?.createdAt ?? Date(),
            scorePercent: attempt?.score,
            holderName: nil,
            statusText: "Verified from KDS Learning records"
        )
    }

    private func fetchAttemptsMap(ids: [String], token: String?) async throws -> [String: ExamAttempt] {
        guard !ids.isEmpty else { return [:] }
        let request = try client.supabaseRequest(
            path: "rest/v1/attempts",
            query: [
                URLQueryItem(name: "id", value: "in.(\(ids.joined(separator: ",")))"),
                URLQueryItem(name: "select", value: "id,exam_id,score,passed,created_at")
            ],
            bearerToken: token
        )
        let attempts: [ExamAttempt] = try await client.send(request, as: [ExamAttempt].self)
        return Dictionary(uniqueKeysWithValues: attempts.map { ($0.id, $0) })
    }

    private struct ProfileRow: Decodable {
        let fullName: String?

        enum CodingKeys: String, CodingKey {
            case fullName = "full_name"
        }
    }

    private struct CertificateRow: Decodable {
        let id: String
        let courseId: String
        let attemptId: String?
        let certificateNo: String?
        let issuedAt: Date?
        let courses: Embedded<CourseSummary>

        enum CodingKeys: String, CodingKey {
            case id
            case courseId = "course_id"
            case attemptId = "attempt_id"
            case certificateNo = "certificate_no"
            case issuedAt = "issued_at"
            case courses
        }
    }
}

@MainActor
final class NotificationsService {
    private let client: KDSAPIClient

    init(client: KDSAPIClient) {
        self.client = client
    }

    func requestAuthorization() async throws -> Bool {
        try await withCheckedThrowingContinuation { continuation in
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: granted)
                }
            }
        }
    }

    func registerForRemoteNotifications() {
        UIApplication.shared.registerForRemoteNotifications()
    }

    func registerToken(_ token: String, accessToken: String?) async throws {
        let request = try client.appRequest(
            path: "api/push/subscribe",
            method: "POST",
            bearerToken: accessToken,
            body: try JSONSerialization.data(withJSONObject: ["token": token])
        )
        _ = try await client.sendData(request)
    }
}

private extension URL {
    func appending(queryItems: [URLQueryItem]) -> URL {
        var components = URLComponents(url: self, resolvingAgainstBaseURL: false)
        components?.queryItems = queryItems
        return components?.url ?? self
    }
}
