import Foundation

enum KDSAuthState: Equatable {
    case bootstrapping
    case misconfigured
    case signedOut
    case signedIn
}

enum KDSTab: Int, CaseIterable, Identifiable {
    case home
    case programs
    case ebooks
    case dashboard
    case ai

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .home: return "Home"
        case .programs: return "Programs"
        case .ebooks: return "Ebooks"
        case .dashboard: return "Dashboard"
        case .ai: return "AI"
        }
    }

    var systemImage: String {
        switch self {
        case .home: return "house.fill"
        case .programs: return "books.vertical.fill"
        case .ebooks: return "book.closed.fill"
        case .dashboard: return "rectangle.grid.2x2.fill"
        case .ai: return "sparkles"
        }
    }
}

struct Embedded<T: Decodable>: Decodable {
    let items: [T]

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let many = try? container.decode([T].self) {
            items = many
        } else if let single = try? container.decode(T.self) {
            items = [single]
        } else if container.decodeNil() {
            items = []
        } else {
            items = []
        }
    }

    var first: T? { items.first }
}

struct KDSUser: Codable, Identifiable, Hashable {
    let id: String
    let email: String
    var fullName: String?
}

struct KDSSession: Codable, Hashable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date?
    var user: KDSUser

    var isExpired: Bool {
        guard let expiresAt else { return false }
        return expiresAt <= Date().addingTimeInterval(60)
    }
}

enum KDSSignUpResult: Equatable {
    case signedIn
    case verificationRequired(String)
}

struct KDSSignUpProfile: Hashable {
    let fullName: String
    let dateOfBirth: String
    let age: Int?
    let highestEducation: String
    let countryCode: String
    let countryName: String
}

struct CourseSummary: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let descriptionText: String?
    let imageURL: String?
    let cpdPoints: Int?
    let published: Bool?
    let comingSoon: Bool?
    let freeForLoggedIn: Bool?
    let deliveryMode: String?
    let interactivePath: String?

    enum CodingKeys: String, CodingKey {
        case id
        case slug
        case title
        case descriptionText = "description"
        case imageURL = "img"
        case cpdPoints = "cpd_points"
        case published
        case comingSoon = "coming_soon"
        case freeForLoggedIn = "free_for_logged_in"
        case deliveryMode = "delivery_mode"
        case interactivePath = "interactive_path"
    }

    var isInteractive: Bool {
        deliveryMode?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "interactive"
    }
}

struct EnrolledCourse: Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let imageURL: String?
    let cpdPoints: Int?
    let progressPercent: Int
    let isFreeAccess: Bool
}

struct Chapter: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let orderIndex: Int
    let courseId: String?
    let introVideoURL: String?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case orderIndex = "order_index"
        case courseId = "course_id"
        case introVideoURL = "intro_video_url"
    }
}

struct Slide: Codable, Identifiable, Hashable {
    let id: String
    let chapterId: String
    let title: String
    let orderIndex: Int
    let introVideoURL: String?
    let assetURL: String?
    let body: String?
    let videoURL: String?
    let content: String?

    enum CodingKeys: String, CodingKey {
        case id
        case chapterId = "chapter_id"
        case title
        case orderIndex = "order_index"
        case introVideoURL = "intro_video_url"
        case assetURL = "asset_url"
        case body
        case videoURL = "video_url"
        case content
    }

    var resolvedBody: String { body ?? content ?? "" }
    var resolvedVideoURL: String? { introVideoURL ?? videoURL }
}

struct QuizQuestion: Codable, Identifiable, Hashable {
    let id: String
    let chapterId: String
    let question: String
    let options: [String]
    let correctIndex: Int

    enum CodingKeys: String, CodingKey {
        case id
        case chapterId = "chapter_id"
        case question
        case options
        case correctIndex = "correct_index"
    }
}

struct QuizSetting: Codable, Hashable {
    let chapterId: String
    let timeLimitSeconds: Int?
    let numQuestions: Int?

    enum CodingKeys: String, CodingKey {
        case chapterId = "chapter_id"
        case timeLimitSeconds = "time_limit_seconds"
        case numQuestions = "num_questions"
    }
}

struct ChapterScore: Identifiable, Hashable {
    let id: String
    let chapterId: String
    let chapterTitle: String
    let scorePercent: Int
    let correctCount: Int
    let totalCount: Int
    let completedAt: Date?
}

struct Exam: Codable, Identifiable, Hashable {
    let id: String
    let courseId: String
    let title: String?
    let passMark: Int?
    let timeLimitMinutes: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case courseId = "course_id"
        case title
        case passMark = "pass_mark"
        case timeLimitMinutes = "time_limit_minutes"
    }
}

struct ExamQuestion: Codable, Identifiable, Hashable {
    let id: String
    let examId: String
    let prompt: String
    let options: [String]
    let correctIndex: Int

    enum CodingKeys: String, CodingKey {
        case id
        case examId = "exam_id"
        case prompt
        case options
        case correctIndex = "correct_index"
    }
}

struct ExamAttempt: Codable, Identifiable, Hashable {
    let id: String
    let examId: String?
    let score: Int?
    let passed: Bool?
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case examId = "exam_id"
        case score
        case passed
        case createdAt = "created_at"
    }
}

struct EbookSummary: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let descriptionText: String?
    let coverURL: String?
    let priceCents: Int
    let published: Bool
    let linkedStatus: String?

    enum CodingKeys: String, CodingKey {
        case id
        case slug
        case title
        case descriptionText = "description"
        case coverURL = "cover_url"
        case priceCents = "price_cents"
        case published
        case linkedStatus = "linked_status"
    }
}

struct EbookDetail: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let descriptionText: String?
    let coverURL: String?
    let sampleURL: String?
    let priceCents: Int?
    let published: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case slug
        case title
        case descriptionText = "description"
        case coverURL = "cover_url"
        case sampleURL = "sample_url"
        case priceCents = "price_cents"
        case published
    }
}

struct CertificateRecord: Identifiable, Hashable {
    let id: String
    let courseId: String
    let courseTitle: String
    let courseSlug: String?
    let courseImageURL: String?
    let cpdPoints: Int?
    let certificateNumber: String
    let issuedAt: Date
    let scorePercent: Int?
    let verifyURL: URL?
}

struct ProvisionalCertificate: Identifiable, Hashable {
    let id: String
    let courseId: String
    let courseTitle: String
    let courseSlug: String?
    let courseImageURL: String?
    let cpdPoints: Int?
    let certificateNumber: String
    let issuedAt: Date
    let scorePercent: Int?
}

struct DashboardSnapshot {
    let displayName: String
    let enrolledCourses: [EnrolledCourse]
    let ebooks: [EbookSummary]
    let scoresByCourse: [String: [ChapterScore]]
    let certificates: [CertificateRecord]
    let provisionalCertificates: [ProvisionalCertificate]
}

struct KDSContinueLearningSummary: Identifiable, Hashable {
    let id: String
    let course: EnrolledCourse
    let currentChapterTitle: String
    let currentLessonTitle: String
    let completedLessons: Int
    let totalLessons: Int

    var progressValue: Double {
        Double(course.progressPercent) / 100
    }

    var progressText: String {
        "\(course.progressPercent)%"
    }

    var lessonProgressDetail: String {
        guard totalLessons > 0 else { return "Ready to begin when lessons are available." }
        return "\(completedLessons) of \(totalLessons) lessons completed"
    }
}

struct VerifySnapshot: Hashable {
    let certificateID: String
    let courseTitle: String
    let certificateNumber: String
    let issuedAt: Date
    let scorePercent: Int?
    let holderName: String?
    let statusText: String
}

struct PendingProgressMutation: Codable, Identifiable, Hashable {
    let id: String
    let userId: String
    let courseId: String
    let slideId: String
    let completedAt: Date
}

struct ReaderTaggedPage: Codable, Hashable, Identifiable {
    let id: String
    var pageIndex: Int
    var label: String
    var createdAt: Date

    init(
        id: String = UUID().uuidString,
        pageIndex: Int,
        label: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.pageIndex = pageIndex
        self.label = label
        self.createdAt = createdAt
    }
}

struct ReaderProgress: Codable, Hashable {
    let ebookId: String
    var pageIndex: Int
    var updatedAt: Date
    var taggedPages: [ReaderTaggedPage]

    init(
        ebookId: String,
        pageIndex: Int,
        updatedAt: Date,
        taggedPages: [ReaderTaggedPage] = []
    ) {
        self.ebookId = ebookId
        self.pageIndex = pageIndex
        self.updatedAt = updatedAt
        self.taggedPages = taggedPages
    }

    enum CodingKeys: String, CodingKey {
        case ebookId
        case pageIndex
        case updatedAt
        case taggedPages
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ebookId = try container.decode(String.self, forKey: .ebookId)
        pageIndex = try container.decode(Int.self, forKey: .pageIndex)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        taggedPages = try container.decodeIfPresent([ReaderTaggedPage].self, forKey: .taggedPages) ?? []
    }
}

struct AIEntry: Codable, Identifiable, Hashable {
    let id: UUID
    let term: String
    let definition: String
    let synonyms: String
    let tags: String
    let pronunciation: String
    let partOfSpeech: String
    let examples: String

    init(
        id: UUID = UUID(),
        term: String,
        definition: String,
        synonyms: String = "",
        tags: String = "",
        pronunciation: String = "",
        partOfSpeech: String = "",
        examples: String = ""
    ) {
        self.id = id
        self.term = term
        self.definition = definition
        self.synonyms = synonyms
        self.tags = tags
        self.pronunciation = pronunciation
        self.partOfSpeech = partOfSpeech
        self.examples = examples
    }
}

struct AIExplanation: Hashable {
    let html: String
    let imageURL: URL?
}

struct AIMessage: Identifiable, Hashable {
    let id: UUID
    let role: Role
    let text: String
    let entry: AIEntry?

    enum Role: Hashable {
        case user
        case system
    }
}

struct RemoteImagePayload: Codable, Hashable {
    let url: String?
    let thumbnail: String?
    let link: String?
}
