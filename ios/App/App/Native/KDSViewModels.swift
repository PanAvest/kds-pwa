import AVFoundation
import Foundation
import PDFKit
import SwiftUI

private enum KDSProgramDebugOverrides {
    static var activeSlideID: String? {
        #if DEBUG
        let value = ProcessInfo.processInfo.environment["KDS_DEBUG_ACTIVE_SLIDE_ID"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let value, !value.isEmpty {
            return value
        }
        #endif
        return nil
    }

    static var activeSlideTitle: String? {
        #if DEBUG
        let value = ProcessInfo.processInfo.environment["KDS_DEBUG_ACTIVE_SLIDE_TITLE"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let value, !value.isEmpty {
            return value
        }
        #endif
        return nil
    }
}

struct KDSCertificateItem: Identifiable, Hashable {
    enum Source: Hashable {
        case issued
        case provisional
    }

    let id: String
    let source: Source
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

struct KDSQuizSession: Identifiable {
    let id = UUID()
    let chapterId: String
    let chapterTitle: String
    let questions: [QuizQuestion]
    var answers: [String: Int]
    var timeRemaining: Int
}

struct KDSFinalExamSession: Identifiable {
    let id = UUID()
    let exam: Exam
    let questions: [ExamQuestion]
    var answers: [String: Int]
    var timeRemaining: Int
}

struct KDSFinalExamResult: Hashable {
    let scorePercent: Int
    let correctCount: Int
    let totalCount: Int
    let passed: Bool
}

@MainActor
final class KDSHomeViewModel: ObservableObject {
    @Published var loading = false
    @Published var errorMessage: String?
    @Published var continueLearning: KDSContinueLearningSummary?
    @Published var featuredPrograms: [CourseSummary] = []
    @Published var linkedEbooks: [EbookSummary] = []
    @Published var accessibleProgramCount = 0
    @Published var accessibleCourseIDs: Set<String> = []

    private var lastUserID: String?
    private var hasLoaded = false

    func load(appState: KDSAppState, force: Bool = false) async {
        guard let userId = appState.userId,
              let token = appState.session?.accessToken else {
            return
        }
        if !force, lastUserID == userId, hasLoaded {
            return
        }

        loading = true
        errorMessage = nil
        continueLearning = nil
        defer { loading = false }

        do {
            async let accessibleTask = appState.coursesService.fetchPrograms(userId: userId, token: token)
            async let catalogTask = appState.coursesService.fetchCatalog(token: token)
            async let ebooksTask = appState.ebooksService.fetchLinkedEbooks(token: token)
            let (accessible, catalog, ebooks) = try await (accessibleTask, catalogTask, ebooksTask)

            accessibleProgramCount = accessible.count
            accessibleCourseIDs = Set(accessible.map(\.id))
            linkedEbooks = Array(ebooks.prefix(8))

            var continueCandidates: [KDSContinueLearningSummary] = []
            for course in accessible {
                if let item = await makeContinueLearningSummary(
                    for: course,
                    userId: userId,
                    token: token,
                    appState: appState
                ) {
                    continueCandidates.append(item)
                }
            }

            let rankedContinue = continueCandidates.sorted { lhs, rhs in
                let lhsPriority = continueLearningPriority(for: lhs)
                let rhsPriority = continueLearningPriority(for: rhs)
                if lhsPriority != rhsPriority { return lhsPriority < rhsPriority }
                if lhs.course.progressPercent != rhs.course.progressPercent {
                    return lhs.course.progressPercent > rhs.course.progressPercent
                }
                return lhs.course.title.localizedCaseInsensitiveCompare(rhs.course.title) == .orderedAscending
            }
            continueLearning = rankedContinue.first

            let sorted = catalog.sorted { lhs, rhs in
                let lhsPriority = accessibleCourseIDs.contains(lhs.id) ? 0 : 1
                let rhsPriority = accessibleCourseIDs.contains(rhs.id) ? 0 : 1
                if lhsPriority != rhsPriority { return lhsPriority < rhsPriority }
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
            let trimmed: [CourseSummary]
            if let activeCourseID = continueLearning?.course.id {
                trimmed = sorted.filter { $0.id != activeCourseID }
            } else {
                trimmed = sorted
            }
            featuredPrograms = Array((trimmed.isEmpty ? sorted : trimmed).prefix(6))
            lastUserID = userId
            hasLoaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func continueLearningPriority(for item: KDSContinueLearningSummary) -> Int {
        switch item.course.progressPercent {
        case 1 ..< 100:
            return 0
        case 0:
            return 1
        default:
            return 2
        }
    }

    private func makeContinueLearningSummary(
        for course: CourseSummary,
        userId: String,
        token: String,
        appState: KDSAppState
    ) async -> KDSContinueLearningSummary? {
        do {
            async let structureTask = appState.coursesService.fetchCourseStructure(courseId: course.id, token: token)
            async let serverProgressTask = appState.coursesService.fetchProgress(userId: userId, courseId: course.id, token: token)
            let (structure, serverProgress) = try await (structureTask, serverProgressTask)

            let localProgress = appState.progressStore.loadCompletedSlideIDs(userId: userId, courseId: course.id)
            let mergedProgress = serverProgress.union(localProgress)
            appState.progressStore.saveCompletedSlideIDs(mergedProgress, userId: userId, courseId: course.id)

            let orderedChapters = structure.chapters.sorted { $0.orderIndex < $1.orderIndex }
            let chapterOrder = Dictionary(uniqueKeysWithValues: orderedChapters.enumerated().map { ($1.id, $0) })
            let orderedSlides = structure.slides.sorted { lhs, rhs in
                let lhsChapter = chapterOrder[lhs.chapterId] ?? 0
                let rhsChapter = chapterOrder[rhs.chapterId] ?? 0
                if lhsChapter != rhsChapter { return lhsChapter < rhsChapter }
                return lhs.orderIndex < rhs.orderIndex
            }

            let totalLessons = orderedSlides.count
            let completedLessons = orderedSlides.reduce(into: 0) { count, slide in
                if mergedProgress.contains(slide.id) { count += 1 }
            }
            let progressPercent = totalLessons == 0 ? 0 : Int(
                round((Double(completedLessons) / Double(totalLessons)) * 100)
            )

            let anchorSlide: Slide?
            let chapterTitle: String
            let lessonTitle: String

            if totalLessons == 0 {
                anchorSlide = nil
                chapterTitle = "Program overview"
                lessonTitle = "Open this program to see new lessons as they are published."
            } else if completedLessons >= totalLessons {
                anchorSlide = orderedSlides.last
                chapterTitle = "Completed program"
                lessonTitle = orderedSlides.last?.title ?? "Review this program at any time."
            } else {
                anchorSlide = orderedSlides.first(where: { !mergedProgress.contains($0.id) }) ?? orderedSlides.first
                chapterTitle = anchorSlide
                    .flatMap { slide in orderedChapters.first(where: { $0.id == slide.chapterId })?.title }
                    ?? "Current chapter"
                lessonTitle = anchorSlide?.title ?? "Continue learning from where you left off."
            }

            let enrolledCourse = EnrolledCourse(
                id: course.id,
                slug: course.slug,
                title: course.title,
                imageURL: course.imageURL,
                cpdPoints: course.cpdPoints,
                progressPercent: min(progressPercent, 100),
                isFreeAccess: course.freeForLoggedIn ?? false
            )

            return KDSContinueLearningSummary(
                id: course.id,
                course: enrolledCourse,
                currentChapterTitle: chapterTitle,
                currentLessonTitle: lessonTitle,
                completedLessons: completedLessons,
                totalLessons: totalLessons
            )
        } catch {
            let enrolledCourse = EnrolledCourse(
                id: course.id,
                slug: course.slug,
                title: course.title,
                imageURL: course.imageURL,
                cpdPoints: course.cpdPoints,
                progressPercent: 0,
                isFreeAccess: course.freeForLoggedIn ?? false
            )
            return KDSContinueLearningSummary(
                id: course.id,
                course: enrolledCourse,
                currentChapterTitle: "Program overview",
                currentLessonTitle: "Open this program to begin learning.",
                completedLessons: 0,
                totalLessons: 0
            )
        }
    }
}

@MainActor
final class KDSProgramsViewModel: ObservableObject {
    @Published var loading = false
    @Published var errorMessage: String?
    @Published var catalog: [CourseSummary] = []
    @Published var accessibleCourseIDs: Set<String> = []

    private var lastUserID: String?

    func load(appState: KDSAppState, force: Bool = false) async {
        guard let userId = appState.userId,
              let token = appState.session?.accessToken else {
            return
        }
        if !force, lastUserID == userId, !catalog.isEmpty {
            return
        }

        loading = true
        errorMessage = nil
        defer { loading = false }

        do {
            async let accessibleTask = appState.coursesService.fetchPrograms(userId: userId, token: token)
            async let catalogTask = appState.coursesService.fetchCatalog(token: token)
            let (accessible, catalog) = try await (accessibleTask, catalogTask)
            accessibleCourseIDs = Set(accessible.map(\.id))
            self.catalog = catalog.sorted { lhs, rhs in
                let lhsPriority = accessibleCourseIDs.contains(lhs.id) ? 0 : 1
                let rhsPriority = accessibleCourseIDs.contains(rhs.id) ? 0 : 1
                if lhsPriority != rhsPriority { return lhsPriority < rhsPriority }
                if (lhs.comingSoon ?? false) != (rhs.comingSoon ?? false) {
                    return !(lhs.comingSoon ?? false)
                }
                return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
            }
            lastUserID = userId
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
final class KDSProgramDashboardViewModel: ObservableObject {
    @Published var loading = false
    @Published var errorMessage: String?
    @Published var websiteAccessRequired = false
    @Published var course: CourseSummary?
    @Published var hasAccess = false
    @Published var chapters: [Chapter] = []
    @Published var slides: [Slide] = []
    @Published var completedSlideIDs: Set<String> = []
    @Published var chapterScores: [String: ChapterScore] = [:]
    @Published var completedQuizChapterIDs: Set<String> = []
    @Published var quizQuestionsByChapter: [String: [QuizQuestion]] = [:]
    @Published var quizSettingsByChapter: [String: QuizSetting] = [:]
    @Published var finalExam: Exam?
    @Published var finalAttempt: ExamAttempt?
    @Published var finalExamQuestions: [ExamQuestion] = []
    @Published var activeSlideID: String?
    @Published var notice: String?
    @Published var quizSession: KDSQuizSession?
    @Published var finalExamSession: KDSFinalExamSession?
    @Published var finalExamResult: KDSFinalExamResult?

    private var loadedSlug: String?
    private var quizTimer: Timer?
    private var finalExamTimer: Timer?

    deinit {
        quizTimer?.invalidate()
        finalExamTimer?.invalidate()
    }

    func load(slug: String, appState: KDSAppState, force: Bool = false) async {
        guard let userId = appState.userId,
              let token = appState.session?.accessToken else {
            return
        }
        if !force, loadedSlug == slug, course != nil {
            return
        }

        loading = true
        errorMessage = nil
        websiteAccessRequired = false
        notice = nil
        defer { loading = false }

        do {
            let course = try await appState.coursesService.fetchCourse(slug: slug, token: token)
            let hasAccess = try await appState.coursesService.userHasAccess(userId: userId, course: course, token: token)
            self.course = course
            self.hasAccess = hasAccess
            guard hasAccess else {
                chapters = []
                slides = []
                loadedSlug = slug
                return
            }

            async let structureTask = appState.coursesService.fetchCourseStructure(courseId: course.id, token: token)
            async let serverProgressTask = appState.coursesService.fetchProgress(userId: userId, courseId: course.id, token: token)
            async let rawScoresTask = appState.assessmentsService.fetchChapterScores(userId: userId, courseId: course.id, token: token)

            let structure = try await structureTask
            let orderedChapters = structure.chapters.sorted { $0.orderIndex < $1.orderIndex }
            let chapterIndex = Dictionary(uniqueKeysWithValues: orderedChapters.enumerated().map { ($1.id, $0) })
            let orderedSlides = structure.slides.sorted { lhs, rhs in
                let lhsChapterOrder = chapterIndex[lhs.chapterId] ?? 0
                let rhsChapterOrder = chapterIndex[rhs.chapterId] ?? 0
                if lhsChapterOrder != rhsChapterOrder { return lhsChapterOrder < rhsChapterOrder }
                return lhs.orderIndex < rhs.orderIndex
            }

            chapters = orderedChapters
            slides = orderedSlides

            let serverProgress = try await serverProgressTask
            let localProgress = appState.progressStore.loadCompletedSlideIDs(userId: userId, courseId: course.id)
            let mergedProgress = serverProgress.union(localProgress)
            completedSlideIDs = mergedProgress
            appState.progressStore.saveCompletedSlideIDs(mergedProgress, userId: userId, courseId: course.id)

            let unsyncedLocal = mergedProgress.subtracting(serverProgress)
            for slideID in unsyncedLocal {
                appState.enqueueProgressMutation(courseId: course.id, slideId: slideID)
            }
            if appState.networkMonitor.isConnected {
                await appState.flushPendingSync()
            }

            let chapterIDs = orderedChapters.map(\.id)
            async let questionsTask = appState.assessmentsService.fetchQuizQuestions(chapterIds: chapterIDs, token: token)
            async let settingsTask = appState.assessmentsService.fetchQuizSettings(chapterIds: chapterIDs, token: token)

            let questions = try await questionsTask
            var questionsByChapter: [String: [QuizQuestion]] = [:]
            for question in questions {
                questionsByChapter[question.chapterId, default: []].append(question)
            }
            quizQuestionsByChapter = questionsByChapter

            let settings = try await settingsTask
            quizSettingsByChapter = Dictionary(uniqueKeysWithValues: settings.map { ($0.chapterId, $0) })

            let rawScores = try await rawScoresTask
            var mappedScores: [String: ChapterScore] = [:]
            for score in rawScores {
                let title = orderedChapters.first(where: { $0.id == score.chapterId })?.title ?? "Chapter"
                if mappedScores[score.chapterId] == nil {
                    mappedScores[score.chapterId] = ChapterScore(
                        id: score.id,
                        chapterId: score.chapterId,
                        chapterTitle: title,
                        scorePercent: score.scorePercent,
                        correctCount: score.correctCount,
                        totalCount: score.totalCount,
                        completedAt: score.completedAt
                    )
                }
            }
            chapterScores = mappedScores
            completedQuizChapterIDs = Set(mappedScores.keys)

            if let exam = try await appState.assessmentsService.fetchExam(courseId: course.id, token: token) {
                finalExam = exam
                async let examQuestionsTask = appState.assessmentsService.fetchExamQuestions(examId: exam.id, token: token)
                async let finalAttemptTask = appState.assessmentsService.fetchFinalAttempt(userId: userId, examId: exam.id, token: token)
                finalExamQuestions = try await examQuestionsTask
                finalAttempt = try await finalAttemptTask
            } else {
                finalExam = nil
                finalExamQuestions = []
                finalAttempt = nil
            }

            activeSlideID = firstRecommendedSlideID
            if let debugSlideID = KDSProgramDebugOverrides.activeSlideID,
               orderedSlides.contains(where: { $0.id == debugSlideID }) {
                activeSlideID = debugSlideID
            } else if let debugSlideTitle = KDSProgramDebugOverrides.activeSlideTitle,
                      let debugSlide = orderedSlides.first(where: {
                          $0.title.compare(debugSlideTitle, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
                      }) {
                activeSlideID = debugSlide.id
            }
            loadedSlug = slug
        } catch {
            websiteAccessRequired = KDSIndicatesWebsiteManagedAccess(error)
            errorMessage = error.localizedDescription
        }
    }

    var orderedChapters: [Chapter] {
        chapters.sorted { $0.orderIndex < $1.orderIndex }
    }

    var orderedSlides: [Slide] {
        let chapterOrder = Dictionary(uniqueKeysWithValues: orderedChapters.enumerated().map { ($1.id, $0) })
        return slides.sorted { lhs, rhs in
            let lhsChapter = chapterOrder[lhs.chapterId] ?? 0
            let rhsChapter = chapterOrder[rhs.chapterId] ?? 0
            if lhsChapter != rhsChapter { return lhsChapter < rhsChapter }
            return lhs.orderIndex < rhs.orderIndex
        }
    }

    var slidesByChapter: [String: [Slide]] {
        Dictionary(grouping: orderedSlides, by: \.chapterId)
    }

    var activeSlide: Slide? {
        orderedSlides.first(where: { $0.id == activeSlideID }) ?? orderedSlides.first
    }

    var progressPercent: Int {
        guard !orderedSlides.isEmpty else { return 0 }
        let completedCount = orderedSlides.reduce(into: 0) { count, slide in
            if completedSlideIDs.contains(slide.id) { count += 1 }
        }
        return Int(round((Double(completedCount) / Double(orderedSlides.count)) * 100))
    }

    var canGoPrevious: Bool {
        guard let activeSlide,
              let index = orderedSlides.firstIndex(of: activeSlide) else {
            return false
        }
        return index > 0
    }

    var canGoNext: Bool {
        guard let activeSlide,
              let index = orderedSlides.firstIndex(of: activeSlide) else {
            return false
        }
        return index + 1 < orderedSlides.count
    }

    var allSlidesCompleted: Bool {
        !orderedSlides.isEmpty && orderedSlides.allSatisfy { completedSlideIDs.contains($0.id) }
    }

    var allChapterQuizzesCompleted: Bool {
        orderedChapters.allSatisfy { chapter in
            let hasQuiz = !(quizQuestionsByChapter[chapter.id] ?? []).isEmpty
            return !hasQuiz || completedQuizChapterIDs.contains(chapter.id)
        }
    }

    var canTakeFinalExam: Bool {
        guard finalExam != nil, !finalExamQuestions.isEmpty, finalAttempt == nil else { return false }
        return allSlidesCompleted && allChapterQuizzesCompleted
    }

    var activeChapter: Chapter? {
        guard let activeSlide else { return nil }
        return orderedChapters.first(where: { $0.id == activeSlide.chapterId })
    }

    var activeChapterNeedsQuiz: Bool {
        guard let activeSlide else { return false }
        let chapterId = activeSlide.chapterId
        let chapterSlides = slidesByChapter[chapterId] ?? []
        let allSlidesDone = chapterSlides.allSatisfy { completedSlideIDs.contains($0.id) }
        let hasQuiz = !(quizQuestionsByChapter[chapterId] ?? []).isEmpty
        return allSlidesDone && hasQuiz && !completedQuizChapterIDs.contains(chapterId)
    }

    var activeChapterScore: ChapterScore? {
        guard let activeSlide else { return nil }
        return chapterScores[activeSlide.chapterId]
    }

    var firstRecommendedSlideID: String? {
        if let firstIncomplete = orderedSlides.first(where: { !completedSlideIDs.contains($0.id) }) {
            return firstIncomplete.id
        }
        return orderedSlides.first?.id
    }

    func slideIsLocked(_ slide: Slide) -> Bool {
        orderedSlides.contains(slide) == false
    }

    func goToSlide(_ slide: Slide) {
        guard orderedSlides.contains(slide) else {
            notice = "This slide is no longer available."
            return
        }
        notice = nil
        activeSlideID = slide.id
    }

    func goToChapter(_ chapter: Chapter) {
        guard let slides = slidesByChapter[chapter.id], !slides.isEmpty else {
            notice = "This chapter does not have any slides yet."
            return
        }
        let preferredSlide = slides.first(where: { !completedSlideIDs.contains($0.id) }) ?? slides.first
        if let preferredSlide {
            goToSlide(preferredSlide)
        }
    }

    func goToNextSlide() {
        guard let activeSlide,
              let index = orderedSlides.firstIndex(of: activeSlide),
              index + 1 < orderedSlides.count else {
            return
        }
        notice = nil
        activeSlideID = orderedSlides[index + 1].id
    }

    func goToPreviousSlide() {
        guard let activeSlide,
              let index = orderedSlides.firstIndex(of: activeSlide),
              index > 0 else {
            return
        }
        notice = nil
        activeSlideID = orderedSlides[index - 1].id
    }

    func markActiveSlideDone(appState: KDSAppState) async {
        guard let course, let slide = activeSlide, let userId = appState.userId else { return }
        guard !completedSlideIDs.contains(slide.id) else {
            notice = "This slide is already complete."
            return
        }

        completedSlideIDs.insert(slide.id)
        appState.progressStore.saveCompletedSlideIDs(completedSlideIDs, userId: userId, courseId: course.id)
        appState.enqueueProgressMutation(courseId: course.id, slideId: slide.id)

        if appState.networkMonitor.isConnected {
            await appState.flushPendingSync()
        }

        if canGoNext {
            goToNextSlide()
        }
        notice = "Progress saved."
    }

    func beginQuiz(for chapter: Chapter) {
        let pool = quizQuestionsByChapter[chapter.id] ?? []
        guard !pool.isEmpty else {
            notice = "No quiz has been configured for this chapter yet."
            return
        }
        let settings = quizSettingsByChapter[chapter.id]
        let questionCount = max(1, min(pool.count, settings?.numQuestions ?? pool.count))
        let chosen = Array(pool.shuffled().prefix(questionCount))
        let answers = Dictionary(uniqueKeysWithValues: chosen.map { ($0.id, -1) })
        quizSession = KDSQuizSession(
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            questions: chosen,
            answers: answers,
            timeRemaining: max(10, settings?.timeLimitSeconds ?? 120)
        )
        startQuizTimer()
    }

    func updateQuizAnswer(questionID: String, answerIndex: Int) {
        quizSession?.answers[questionID] = answerIndex
    }

    func closeQuiz() {
        quizTimer?.invalidate()
        quizTimer = nil
        quizSession = nil
    }

    func submitActiveQuiz(appState: KDSAppState, autoSubmit: Bool = false) async {
        guard let session = quizSession,
              let course,
              let userId = appState.userId,
              let token = appState.session?.accessToken else {
            return
        }

        let totalCount = session.questions.count
        let correctCount = session.questions.reduce(into: 0) { count, question in
            if session.answers[question.id] == question.correctIndex {
                count += 1
            }
        }
        let scorePercent = Int(round((Double(correctCount) / Double(max(1, totalCount))) * 100))

        do {
            try await appState.assessmentsService.submitChapterQuiz(
                userId: userId,
                courseId: course.id,
                chapterId: session.chapterId,
                totalCount: totalCount,
                correctCount: correctCount,
                scorePercent: scorePercent,
                token: token,
                autoSubmit: autoSubmit
            )

            let chapterTitle = orderedChapters.first(where: { $0.id == session.chapterId })?.title ?? session.chapterTitle
            chapterScores[session.chapterId] = ChapterScore(
                id: UUID().uuidString,
                chapterId: session.chapterId,
                chapterTitle: chapterTitle,
                scorePercent: scorePercent,
                correctCount: correctCount,
                totalCount: totalCount,
                completedAt: Date()
            )
            completedQuizChapterIDs.insert(session.chapterId)
            notice = autoSubmit
                ? "Time expired. Quiz auto-submitted at \(scorePercent)%."
                : "Quiz submitted at \(scorePercent)%."
        } catch {
            notice = error.localizedDescription
        }

        closeQuiz()
    }

    func beginFinalExam() {
        guard let exam = finalExam else { return }
        guard canTakeFinalExam else {
            notice = finalAttempt == nil
                ? "Complete all slides and chapter quizzes before starting the final exam."
                : "This exam has already been taken."
            return
        }

        let randomized = finalExamQuestions.shuffled()
        let answers = Dictionary(uniqueKeysWithValues: randomized.map { ($0.id, -1) })
        finalExamSession = KDSFinalExamSession(
            exam: exam,
            questions: randomized,
            answers: answers,
            timeRemaining: max(60, (exam.timeLimitMinutes ?? 60) * 60)
        )
        finalExamResult = nil
        startFinalExamTimer()
    }

    func updateFinalExamAnswer(questionID: String, answerIndex: Int) {
        finalExamSession?.answers[questionID] = answerIndex
    }

    func closeFinalExam() {
        finalExamTimer?.invalidate()
        finalExamTimer = nil
        finalExamSession = nil
    }

    func submitFinalExam(appState: KDSAppState, autoSubmit: Bool = false) async {
        guard let session = finalExamSession,
              let userId = appState.userId,
              let token = appState.session?.accessToken else {
            return
        }

        let totalCount = session.questions.count
        let correctCount = session.questions.reduce(into: 0) { count, question in
            if session.answers[question.id] == question.correctIndex {
                count += 1
            }
        }
        let scorePercent = Int(round((Double(correctCount) / Double(max(1, totalCount))) * 100))
        let passMark = session.exam.passMark ?? 0
        let passed = scorePercent >= passMark

        do {
            try await appState.assessmentsService.submitFinalExam(
                userId: userId,
                examId: session.exam.id,
                score: scorePercent,
                passed: passed,
                totalCount: totalCount,
                correctCount: correctCount,
                token: token,
                autoSubmit: autoSubmit
            )
            finalAttempt = ExamAttempt(
                id: UUID().uuidString,
                examId: session.exam.id,
                score: scorePercent,
                passed: passed,
                createdAt: Date()
            )
            finalExamResult = KDSFinalExamResult(
                scorePercent: scorePercent,
                correctCount: correctCount,
                totalCount: totalCount,
                passed: passed
            )
            notice = autoSubmit
                ? "Final exam auto-submitted at \(scorePercent)%."
                : "Final exam submitted at \(scorePercent)%."
        } catch {
            notice = error.localizedDescription
        }

        closeFinalExam()
    }

    private func startQuizTimer() {
        quizTimer?.invalidate()
        quizTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { await self?.handleQuizTimerTick() }
        }
    }

    private func startFinalExamTimer() {
        finalExamTimer?.invalidate()
        finalExamTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { await self?.handleFinalExamTimerTick() }
        }
    }

    private func handleQuizTimerTick() async {
        guard var session = quizSession else { return }
        session.timeRemaining -= 1
        quizSession = session
        if session.timeRemaining <= 0 {
            quizTimer?.invalidate()
            quizTimer = nil
            await submitActiveQuiz(appState: KDSAppState.shared, autoSubmit: true)
        }
    }

    private func handleFinalExamTimerTick() async {
        guard var session = finalExamSession else { return }
        session.timeRemaining -= 1
        finalExamSession = session
        if session.timeRemaining <= 0 {
            finalExamTimer?.invalidate()
            finalExamTimer = nil
            await submitFinalExam(appState: KDSAppState.shared, autoSubmit: true)
        }
    }
}

@MainActor
final class KDSEbooksViewModel: ObservableObject {
    @Published var loading = false
    @Published var errorMessage: String?
    @Published var ebooks: [EbookSummary] = []

    private var lastUserID: String?

    func load(appState: KDSAppState, force: Bool = false) async {
        guard let userId = appState.userId,
              let token = appState.session?.accessToken else {
            return
        }
        if !force, lastUserID == userId, !ebooks.isEmpty {
            return
        }

        loading = true
        errorMessage = nil
        defer { loading = false }

        do {
            ebooks = try await appState.ebooksService.fetchLinkedEbooks(token: token)
            lastUserID = userId
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
final class KDSEbookDetailViewModel: ObservableObject {
    @Published var loading = false
    @Published var errorMessage: String?
    @Published var websiteAccessRequired = false
    @Published var ebookDetail: EbookDetail?
    @Published var lastSavedPage = 0
    @Published var taggedPageCount = 0

    private var loadedSlug: String?

    func load(summary: EbookSummary, appState: KDSAppState, force: Bool = false) async {
        guard let token = appState.session?.accessToken else { return }
        if !force, loadedSlug == summary.slug, ebookDetail != nil {
            refreshLocalState(summary: summary, appState: appState)
            return
        }

        loading = true
        errorMessage = nil
        websiteAccessRequired = false
        defer { loading = false }

        do {
            ebookDetail = try await appState.ebooksService.fetchEbook(slug: summary.slug, token: token)
            refreshLocalState(summary: summary, appState: appState)
            loadedSlug = summary.slug
        } catch {
            websiteAccessRequired = KDSIndicatesWebsiteManagedAccess(error)
            errorMessage = error.localizedDescription
            refreshLocalState(summary: summary, appState: appState)
        }
    }

    func refreshLocalState(summary: EbookSummary, appState: KDSAppState) {
        let progress = appState.readerStateStore.load(ebookId: summary.id)
        lastSavedPage = progress?.pageIndex ?? 0
        taggedPageCount = progress?.taggedPages.count ?? 0
    }
}

@MainActor
final class KDSEbookReaderViewModel: ObservableObject {
    @Published var loading = false
    @Published var errorMessage: String?
    @Published var websiteAccessRequired = false
    @Published var document: PDFDocument?
    @Published var pageIndex = 0
    @Published var pageCount = 0
    @Published var taggedPages: [ReaderTaggedPage] = []

    private var loadedEbookID: String?

    func load(summary: EbookSummary, appState: KDSAppState, force: Bool = false) async {
        guard let token = appState.session?.accessToken else { return }
        if !force, loadedEbookID == summary.id, document != nil {
            return
        }

        loading = true
        errorMessage = nil
        websiteAccessRequired = false
        defer { loading = false }

        let cacheName = "ebook-\(summary.id).pdf"
        var loadedCachedCopy = false

        if let cachedData = appState.diskStore.loadData(named: cacheName) {
            do {
                try prepareDocument(from: cachedData, summary: summary, appState: appState)
                loadedCachedCopy = true
            } catch {
                errorMessage = error.localizedDescription
            }
        }

        do {
            let remoteData = try await appState.ebooksService.fetchSecurePDF(ebookId: summary.id, token: token)
            appState.diskStore.saveData(remoteData, named: cacheName)
            try prepareDocument(from: remoteData, summary: summary, appState: appState)
            errorMessage = nil
            websiteAccessRequired = false
        } catch let remoteError {
            if loadedCachedCopy {
                errorMessage = "Using cached copy while the network request is unavailable."
            } else {
                if let cachedData = appState.diskStore.loadData(named: cacheName) {
                    do {
                        try prepareDocument(from: cachedData, summary: summary, appState: appState)
                        errorMessage = "Using cached copy while the network request is unavailable."
                    } catch {
                        websiteAccessRequired = KDSIndicatesWebsiteManagedAccess(remoteError)
                        errorMessage = remoteError.localizedDescription
                    }
                } else {
                    websiteAccessRequired = KDSIndicatesWebsiteManagedAccess(remoteError)
                    errorMessage = remoteError.localizedDescription
                }
            }
        }
    }

    func updatePage(_ newIndex: Int, ebookId: String, appState: KDSAppState) {
        let clampedIndex = max(0, min(newIndex, max(0, pageCount - 1)))
        pageIndex = clampedIndex
        persistReaderState(ebookId: ebookId, appState: appState)
    }

    func jumpToPage(_ newIndex: Int, ebookId: String, appState: KDSAppState) {
        updatePage(newIndex, ebookId: ebookId, appState: appState)
    }

    func saveTag(for pageIndex: Int, label: String, ebookId: String, appState: KDSAppState) {
        let clampedIndex = max(0, min(pageIndex, max(0, pageCount - 1)))
        let trimmedLabel = label.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalLabel = trimmedLabel.isEmpty ? defaultTagLabel(for: clampedIndex) : trimmedLabel

        if let existingIndex = taggedPages.firstIndex(where: { $0.pageIndex == clampedIndex }) {
            taggedPages[existingIndex].label = finalLabel
        } else {
            taggedPages.append(
                ReaderTaggedPage(pageIndex: clampedIndex, label: finalLabel)
            )
        }
        taggedPages.sort { lhs, rhs in
            if lhs.pageIndex != rhs.pageIndex {
                return lhs.pageIndex < rhs.pageIndex
            }
            return lhs.createdAt < rhs.createdAt
        }
        persistReaderState(ebookId: ebookId, appState: appState)
    }

    func removeTag(for pageIndex: Int, ebookId: String, appState: KDSAppState) {
        taggedPages.removeAll { $0.pageIndex == pageIndex }
        persistReaderState(ebookId: ebookId, appState: appState)
    }

    private func prepareDocument(from data: Data, summary: EbookSummary, appState: KDSAppState) throws {
        guard let pdf = PDFDocument(data: data) else {
            throw KDSAPIError.badResponse
        }
        let storedProgress = appState.readerStateStore.load(ebookId: summary.id)
        document = pdf
        pageCount = pdf.pageCount
        pageIndex = min(storedProgress?.pageIndex ?? 0, max(0, pdf.pageCount - 1))
        taggedPages = (storedProgress?.taggedPages ?? [])
            .filter { taggedPage in
                taggedPage.pageIndex >= 0 && taggedPage.pageIndex < pdf.pageCount
            }
            .sorted { lhs, rhs in
                if lhs.pageIndex != rhs.pageIndex {
                    return lhs.pageIndex < rhs.pageIndex
                }
                return lhs.createdAt < rhs.createdAt
            }
        loadedEbookID = summary.id
    }

    private func persistReaderState(ebookId: String, appState: KDSAppState) {
        appState.readerStateStore.save(
            ReaderProgress(
                ebookId: ebookId,
                pageIndex: pageIndex,
                updatedAt: Date(),
                taggedPages: taggedPages
            )
        )
    }

    private func defaultTagLabel(for pageIndex: Int) -> String {
        "Page \(pageIndex + 1)"
    }
}

@MainActor
final class KDSDashboardViewModel: ObservableObject {
    @Published var loading = false
    @Published var errorMessage: String?
    @Published var snapshot: DashboardSnapshot?

    private var lastUserID: String?

    func load(appState: KDSAppState, force: Bool = false) async {
        guard let userId = appState.userId,
              let token = appState.session?.accessToken else {
            return
        }
        if !force, lastUserID == userId, snapshot != nil {
            return
        }

        loading = true
        errorMessage = nil
        defer { loading = false }

        do {
            async let displayNameTask = appState.dashboardService.fetchDisplayName(userId: userId, token: token)
            async let coursesTask = appState.coursesService.fetchPrograms(userId: userId, token: token)
            async let ebooksTask = appState.ebooksService.fetchLinkedEbooks(token: token)
            let (displayName, courses, ebooks) = try await (displayNameTask, coursesTask, ebooksTask)

            var enrolledCourses: [EnrolledCourse] = []
            var scoresByCourse: [String: [ChapterScore]] = [:]

            for course in courses {
                async let structureTask = appState.coursesService.fetchCourseStructure(courseId: course.id, token: token)
                async let serverProgressTask = appState.coursesService.fetchProgress(userId: userId, courseId: course.id, token: token)
                async let chapterScoresTask = appState.assessmentsService.fetchChapterScores(userId: userId, courseId: course.id, token: token)
                let (structure, serverProgress, chapterScores) = try await (structureTask, serverProgressTask, chapterScoresTask)
                let localProgress = appState.progressStore.loadCompletedSlideIDs(userId: userId, courseId: course.id)
                let mergedProgress = serverProgress.union(localProgress)
                appState.progressStore.saveCompletedSlideIDs(mergedProgress, userId: userId, courseId: course.id)

                let totalSlides = structure.slides.count
                let completedCount = structure.slides.reduce(into: 0) { count, slide in
                    if mergedProgress.contains(slide.id) { count += 1 }
                }
                let progressPercent = totalSlides == 0 ? 0 : Int(round((Double(completedCount) / Double(totalSlides)) * 100))
                enrolledCourses.append(
                    EnrolledCourse(
                        id: course.id,
                        slug: course.slug,
                        title: course.title,
                        imageURL: course.imageURL,
                        cpdPoints: course.cpdPoints,
                        progressPercent: min(progressPercent, 100),
                        isFreeAccess: course.freeForLoggedIn ?? false
                    )
                )
                scoresByCourse[course.id] = chapterScores
            }

            enrolledCourses.sort {
                if $0.progressPercent != $1.progressPercent {
                    return $0.progressPercent > $1.progressPercent
                }
                return $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
            }

            let issuedCertificates = try await appState.dashboardService.fetchCertificates(userId: userId, token: token)
            let provisionalCertificates = try await appState.dashboardService.fetchProvisionalCertificates(
                userId: userId,
                token: token,
                enrolledCourses: enrolledCourses
            )

            snapshot = DashboardSnapshot(
                displayName: displayName,
                enrolledCourses: enrolledCourses,
                ebooks: ebooks,
                scoresByCourse: scoresByCourse,
                certificates: issuedCertificates,
                provisionalCertificates: provisionalCertificates
            )
            lastUserID = userId
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func saveDisplayName(_ name: String, appState: KDSAppState) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await appState.saveDisplayName(trimmed)
        guard let current = snapshot else { return }
        snapshot = DashboardSnapshot(
            displayName: trimmed,
            enrolledCourses: current.enrolledCourses,
            ebooks: current.ebooks,
            scoresByCourse: current.scoresByCourse,
            certificates: current.certificates,
            provisionalCertificates: current.provisionalCertificates
        )
    }

    var certificateItems: [KDSCertificateItem] {
        guard let snapshot else { return [] }
        let issued = snapshot.certificates.map {
            KDSCertificateItem(
                id: $0.id,
                source: .issued,
                courseId: $0.courseId,
                courseTitle: $0.courseTitle,
                courseSlug: $0.courseSlug,
                courseImageURL: $0.courseImageURL,
                cpdPoints: $0.cpdPoints,
                certificateNumber: $0.certificateNumber,
                issuedAt: $0.issuedAt,
                scorePercent: $0.scorePercent,
                verifyURL: $0.verifyURL
            )
        }
        let provisional = snapshot.provisionalCertificates.map {
            KDSCertificateItem(
                id: "prov-\($0.id)",
                source: .provisional,
                courseId: $0.courseId,
                courseTitle: $0.courseTitle,
                courseSlug: $0.courseSlug,
                courseImageURL: $0.courseImageURL,
                cpdPoints: $0.cpdPoints,
                certificateNumber: $0.certificateNumber,
                issuedAt: $0.issuedAt,
                scorePercent: $0.scorePercent,
                verifyURL: nil
            )
        }
        return issued + provisional
    }
}

@MainActor
final class KDSAIViewModel: NSObject, ObservableObject, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    @Published var loading = false
    @Published var errorMessage: String?
    @Published var dictionary: [AIEntry] = []
    @Published var suggestions: [AIEntry] = []
    @Published var selectedEntry: AIEntry?
    @Published var explanationHTML = ""
    @Published var imageURL: URL?
    @Published var messages: [AIMessage] = []
    @Published var autoReadEnabled = UserDefaults.standard.bool(forKey: "kds.ai.autoRead")
    @Published var selectedVoiceIdentifier = UserDefaults.standard.string(forKey: "kds.ai.voiceIdentifier") ?? ""
    @Published private(set) var availableVoices: [AVSpeechSynthesisVoice] = []
    @Published var isSpeaking = false

    private let synthesizer = AVSpeechSynthesizer()
    private var audioPlayer: AVAudioPlayer?
    private var loaded = false
    private var searchTask: Task<Void, Never>?

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func load(appState: KDSAppState, force: Bool = false) async {
        if loaded, !force { return }
        loading = true
        errorMessage = nil
        defer { loading = false }

        do {
            dictionary = try await appState.aiService.loadDictionary()
            refreshAvailableVoices()
            loaded = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func search(_ query: String, appState: KDSAppState) {
        searchTask?.cancel()

        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            suggestions = []
            return
        }

        let dictionary = self.dictionary
        searchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            let results = appState.aiService.search(trimmed, in: dictionary)
            guard !Task.isCancelled else { return }
            self?.suggestions = results
        }
    }

    func select(_ entry: AIEntry, appState: KDSAppState) async {
        stopSpeaking()
        selectedEntry = entry
        messages.append(AIMessage(id: UUID(), role: .user, text: entry.term, entry: entry))
        loading = true
        errorMessage = nil
        defer { loading = false }

        do {
            async let explanationTask = appState.aiService.explain(term: entry)
            async let imageTask = appState.aiService.fetchImage(for: entry.term)
            let explanation = try await explanationTask
            let image = try? await imageTask
            explanationHTML = explanation
            imageURL = image ?? nil
            messages.append(AIMessage(id: UUID(), role: .system, text: explanation.htmlStripped(), entry: entry))
            if autoReadEnabled {
                await speakCurrent(appState: appState)
            }
        } catch {
            let fallback = """
            <b>Concept:</b> \(entry.definition)
            <br/><br/>
            <b>Real-World Example:</b> \(entry.examples.isEmpty ? "\(entry.term) appears in practical supply chain decisions, operations, and coordination work." : entry.examples)
            """
            explanationHTML = fallback
            imageURL = nil
            messages.append(AIMessage(id: UUID(), role: .system, text: fallback.htmlStripped(), entry: entry))
            errorMessage = "AI explanation is unavailable. Showing the local dictionary entry instead."
        }
    }

    func speakCurrent(appState: KDSAppState) async {
        let text = explanationHTML.htmlStripped()
        guard !text.isEmpty else { return }
        stopSpeaking()

        do {
            let audio = try await appState.aiService.synthesize(text: text)
            audioPlayer = try AVAudioPlayer(data: audio)
            audioPlayer?.delegate = self
            audioPlayer?.prepareToPlay()
            audioPlayer?.play()
            isSpeaking = true
        } catch {
            let utterance = AVSpeechUtterance(string: text)
            utterance.rate = 0.48
            utterance.voice = availableVoices.first(where: { $0.identifier == selectedVoiceIdentifier })
                ?? AVSpeechSynthesisVoice(language: "en-US")
            synthesizer.speak(utterance)
            isSpeaking = true
        }
    }

    func stopSpeaking() {
        audioPlayer?.stop()
        audioPlayer = nil
        synthesizer.stopSpeaking(at: .immediate)
        isSpeaking = false
    }

    func updateAutoRead(_ enabled: Bool) {
        autoReadEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: "kds.ai.autoRead")
    }

    func updateVoice(identifier: String) {
        guard availableVoices.contains(where: { $0.identifier == identifier }) else { return }
        selectedVoiceIdentifier = identifier
        UserDefaults.standard.set(identifier, forKey: "kds.ai.voiceIdentifier")
    }

    private func refreshAvailableVoices() {
        let voices = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.lowercased().hasPrefix("en") }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        availableVoices = voices

        if voices.contains(where: { $0.identifier == selectedVoiceIdentifier }) {
            return
        }

        if let fallback = voices.first {
            selectedVoiceIdentifier = fallback.identifier
            UserDefaults.standard.set(fallback.identifier, forKey: "kds.ai.voiceIdentifier")
        } else {
            selectedVoiceIdentifier = ""
            UserDefaults.standard.removeObject(forKey: "kds.ai.voiceIdentifier")
        }
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            self?.isSpeaking = false
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in
            self?.isSpeaking = false
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in
            self?.isSpeaking = false
        }
    }

    deinit {
        searchTask?.cancel()
    }
}
