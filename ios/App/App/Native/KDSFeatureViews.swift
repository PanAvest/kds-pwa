import AVKit
import CoreImage
import PDFKit
import SwiftUI
import UIKit
import WebKit

private enum KDSHomeMetrics {
    static let contentPadding: CGFloat = 20
    static let sectionSpacing: CGFloat = 24
    static let sectionContentSpacing: CGFloat = 16

    static let continueCardHeight: CGFloat = 384
    static let featuredProgramCardWidth: CGFloat = 300
    static let featuredProgramCardHeight: CGFloat = 352
    static let featuredProgramImageHeight: CGFloat = 168

    static let libraryCardWidth: CGFloat = 136
    static let libraryCoverHeight: CGFloat = 188
    static let libraryTitleHeight: CGFloat = 42
    static let libraryStatusHeight: CGFloat = 16
    static let libraryCardHeight: CGFloat = 266

    static let bottomBreathingRoom: CGFloat = 24
    static let minimumBottomClearance: CGFloat = 124
}

struct KDSHomeView: View {
    @EnvironmentObject private var appState: KDSAppState
    @StateObject private var viewModel = KDSHomeViewModel()
    @State private var tabBarHeight: CGFloat = 0

    let onOpenSettings: () -> Void

    private var homeBottomClearance: CGFloat {
        max(tabBarHeight + KDSHomeMetrics.bottomBreathingRoom, KDSHomeMetrics.minimumBottomClearance)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: KDSHomeMetrics.sectionSpacing) {
                topHeader

                if let error = viewModel.errorMessage {
                    KDSErrorBanner(message: error)
                }

                continueLearningSection
                featuredProgramsSection
                librarySection
                trustSection
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, KDSHomeMetrics.contentPadding)
            .padding(.top, 12)
            .padding(.bottom, 8)
        }
        .kdsScrollClipDisabledIfAvailable()
        .background(KDSTabBarHeightReader(height: $tabBarHeight))
        .safeAreaInset(edge: .bottom) {
            Color.clear
                .frame(height: homeBottomClearance)
                .allowsHitTesting(false)
        }
        .task {
            await viewModel.load(appState: appState)
        }
        .refreshable {
            await viewModel.load(appState: appState, force: true)
        }
        .navigationBarHidden(true)
        .kdsScreenBackground()
    }

    private var displayName: String {
        appState.displayName.isEmpty ? "Learner" : appState.displayName
    }

    private var topHeader: some View {
        VStack(alignment: .leading, spacing: KDSHomeMetrics.sectionContentSpacing) {
            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("PanAvest KDS")
                        .font(.system(size: 32, weight: .heavy, design: .rounded))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [KDSTheme.accent, KDSTheme.primary],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )

                    Text("Welcome back, \(displayName)")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(KDSTheme.ink)

                    Text("Your linked learning, reading, and certification progress in one refined workspace.")
                        .font(.system(size: 14))
                        .foregroundColor(KDSTheme.muted)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 12)

                Button(action: onOpenSettings) {
                    Image(systemName: "person.crop.circle.fill")
                        .font(.system(size: 19, weight: .semibold))
                        .foregroundColor(KDSTheme.accent)
                        .frame(width: 44, height: 44)
                        .background(KDSTheme.surface.opacity(0.94))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(KDSTheme.border.opacity(0.9), lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .shadow(color: .black.opacity(0.05), radius: 10, x: 0, y: 6)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Open settings")
            }

            HStack(spacing: 12) {
                Button {
                    appState.activeTab = .programs
                } label: {
                    KDSHomeQuickActionLabel(title: "Programs", systemImage: "books.vertical.fill")
                }
                .buttonStyle(.plain)

                Button {
                    appState.activeTab = .dashboard
                } label: {
                    KDSHomeQuickActionLabel(title: "Dashboard", systemImage: "rectangle.grid.2x2.fill")
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var continueLearningSection: some View {
        VStack(alignment: .leading, spacing: KDSHomeMetrics.sectionContentSpacing) {
            KDSHomeSectionHeader(
                title: "Continue Learning",
                subtitle: "Resume the most relevant program on this account."
            )

            if viewModel.loading && viewModel.continueLearning == nil {
                continueLearningLoadingCard
            } else if let item = viewModel.continueLearning {
                NavigationLink(destination: KDSProgramDashboardView(slug: item.course.slug).environmentObject(appState)) {
                    ContinueLearningCard(item: item)
                }
                .buttonStyle(.plain)
            } else {
                KDSHomeEmptyStateCard(
                    title: "No active program yet",
                    detail: "When programs are linked to this learner account, the next lesson to continue will appear here.",
                    systemImage: "books.vertical"
                ) {
                    appState.activeTab = .programs
                }
            }
        }
    }

    private var featuredProgramsSection: some View {
        VStack(alignment: .leading, spacing: KDSHomeMetrics.sectionContentSpacing) {
            KDSHomeSectionHeader(
                title: "Featured Programs",
                subtitle: "Explore linked learning paths, discover new programs, and jump back in quickly."
            )

            if viewModel.loading && viewModel.featuredPrograms.isEmpty {
                featuredProgramsLoadingShelf
            } else if viewModel.featuredPrograms.isEmpty {
                KDSHomeEmptyStateCard(
                    title: "Programs will appear here",
                    detail: "Linked and recommended programs show up here once they are available on this account.",
                    systemImage: "sparkles"
                ) {
                    appState.activeTab = .programs
                }
            } else {
                featuredProgramsShelf
            }
        }
    }

    private var librarySection: some View {
        VStack(alignment: .leading, spacing: KDSHomeMetrics.sectionContentSpacing) {
            KDSHomeSectionHeader(
                title: "Your Library",
                subtitle: "Linked e-books designed for quick reading and smooth return visits."
            )

            if viewModel.loading && viewModel.linkedEbooks.isEmpty {
                linkedEbooksLoadingShelf
            } else if viewModel.linkedEbooks.isEmpty {
                KDSHomeEmptyStateCard(
                    title: "No books linked yet",
                    detail: "Linked reading titles will appear here with clean covers and reader status.",
                    systemImage: "book.closed"
                )
            } else {
                linkedEbooksShelf
            }
        }
    }

    private var trustSection: some View {
        VStack(alignment: .leading, spacing: KDSHomeMetrics.sectionContentSpacing) {
            KDSHomeSectionHeader(
                title: "Trust & Certifications",
                subtitle: "Quality, security, and CPD readiness presented in a lighter, faster-scanning layout."
            )

            KDSHomeTrustLeadCard(linkedProgramCount: viewModel.accessibleProgramCount)

            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 12),
                    GridItem(.flexible(), spacing: 12)
                ],
                spacing: 12
            ) {
                ForEach(homeTrustHighlights) { item in
                    TrustCard(item: item)
                }
            }
        }
    }

    private var homeTrustHighlights: [KDSTrustHighlight] {
        [
            KDSTrustHighlight(
                title: "ISO 9001",
                detail: "Quality-led delivery and documented learning operations.",
                systemImage: "checkmark.seal.fill",
                tint: KDSTheme.primary
            ),
            KDSTrustHighlight(
                title: "ISO 21001",
                detail: "Education-management principles guiding learner support.",
                systemImage: "graduationcap.fill",
                tint: KDSTheme.accent
            ),
            KDSTrustHighlight(
                title: "CPD Structured",
                detail: "Professional learning designed for traceable development.",
                systemImage: "rosette",
                tint: KDSTheme.success
            ),
            KDSTrustHighlight(
                title: "Secure Platform",
                detail: "Protected access, stable reading, and secure learner records.",
                systemImage: "lock.shield.fill",
                tint: KDSTheme.accent
            ),
            KDSTrustHighlight(
                title: "SEO Alignment",
                detail: "Public trust pages and verification flows stay discoverable.",
                systemImage: "magnifyingglass.circle.fill",
                tint: KDSTheme.warning
            ),
            KDSTrustHighlight(
                title: "Programs Ready",
                detail: "\(viewModel.accessibleProgramCount) program\(viewModel.accessibleProgramCount == 1 ? "" : "s") linked for this learner.",
                systemImage: "books.vertical.fill",
                tint: KDSTheme.primaryDark
            )
        ]
    }

    private var featuredProgramsShelf: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 16) {
                ForEach(viewModel.featuredPrograms) { program in
                    NavigationLink(destination: KDSProgramDetailView(
                        course: program,
                        hasAccess: viewModel.accessibleCourseIDs.contains(program.id) || program.freeForLoggedIn == true
                    ).environmentObject(appState)) {
                        ProgramCard(
                            program: program,
                            isLinked: viewModel.accessibleCourseIDs.contains(program.id) || program.freeForLoggedIn == true
                        )
                        .frame(width: KDSHomeMetrics.featuredProgramCardWidth)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, KDSHomeMetrics.contentPadding)
        }
        .frame(height: KDSHomeMetrics.featuredProgramCardHeight + 4)
        .kdsScrollClipDisabledIfAvailable()
    }

    private var featuredProgramsLoadingShelf: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 16) {
                ForEach(0 ..< 3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .fill(KDSTheme.surface.opacity(0.94))
                        .frame(
                            width: KDSHomeMetrics.featuredProgramCardWidth,
                            height: KDSHomeMetrics.featuredProgramCardHeight
                        )
                        .overlay(KDSSkeletonBlock())
                        .shadow(color: .black.opacity(0.06), radius: 14, y: 10)
                }
            }
            .padding(.horizontal, KDSHomeMetrics.contentPadding)
        }
        .frame(height: KDSHomeMetrics.featuredProgramCardHeight + 4)
        .kdsScrollClipDisabledIfAvailable()
    }

    private var linkedEbooksShelf: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 16) {
                ForEach(viewModel.linkedEbooks) { ebook in
                    NavigationLink(destination: KDSEbookDetailView(ebook: ebook).environmentObject(appState)) {
                        LibraryBookCard(
                            ebook: ebook,
                            cardWidth: KDSHomeMetrics.libraryCardWidth,
                            coverHeight: KDSHomeMetrics.libraryCoverHeight
                        )
                        .frame(width: KDSHomeMetrics.libraryCardWidth)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, KDSHomeMetrics.contentPadding)
        }
        .frame(height: KDSHomeMetrics.libraryCardHeight)
        .kdsScrollClipDisabledIfAvailable()
    }

    private var linkedEbooksLoadingShelf: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 16) {
                ForEach(0 ..< 4, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 12) {
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(KDSTheme.surface.opacity(0.94))
                            .frame(
                                width: KDSHomeMetrics.libraryCardWidth,
                                height: KDSHomeMetrics.libraryCoverHeight
                            )
                            .overlay(KDSSkeletonBlock())
                            .shadow(color: .black.opacity(0.06), radius: 10, y: 6)

                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(KDSTheme.surface.opacity(0.88))
                            .frame(width: KDSHomeMetrics.libraryCardWidth, height: KDSHomeMetrics.libraryTitleHeight)

                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(KDSTheme.surface.opacity(0.72))
                            .frame(width: KDSHomeMetrics.libraryCardWidth * 0.62, height: KDSHomeMetrics.libraryStatusHeight)
                    }
                    .frame(width: KDSHomeMetrics.libraryCardWidth, height: KDSHomeMetrics.libraryCardHeight, alignment: .topLeading)
                }
            }
            .padding(.horizontal, KDSHomeMetrics.contentPadding)
        }
        .frame(height: KDSHomeMetrics.libraryCardHeight)
        .kdsScrollClipDisabledIfAvailable()
    }

    private var continueLearningLoadingCard: some View {
        RoundedRectangle(cornerRadius: 30, style: .continuous)
            .fill(KDSTheme.surface.opacity(0.94))
            .frame(maxWidth: .infinity)
            .frame(height: KDSHomeMetrics.continueCardHeight)
            .overlay(KDSSkeletonBlock())
            .shadow(color: .black.opacity(0.06), radius: 16, y: 10)
    }
}

struct KDSProgramsTabView: View {
    @EnvironmentObject private var appState: KDSAppState
    @StateObject private var viewModel = KDSProgramsViewModel()
    @State private var search = ""

    private var filteredCourses: [CourseSummary] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return viewModel.catalog }
        return viewModel.catalog.filter { course in
            course.title.localizedCaseInsensitiveContains(query) ||
            (course.descriptionText ?? "").localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                KDSDiscoveryHero(
                    eyebrow: "Programs",
                    title: "Explore programmes and continue learning.",
                    copy: "Browse the KDS catalogue, see access at a glance, and open each programme dashboard in one tap."
                )

                KDSSearchField(text: $search, placeholder: "Search programs")

                if let error = viewModel.errorMessage {
                    KDSErrorBanner(message: error)
                }

                if viewModel.loading && viewModel.catalog.isEmpty {
                    VStack(spacing: 14) {
                        KDSLoadingCardRow()
                        KDSLoadingCardRow()
                    }
                } else if filteredCourses.isEmpty {
                    KDSInfoCard(
                        title: "No programs matched",
                        detail: "Try a different keyword or refresh to reload the catalog."
                    )
                } else {
                    LazyVStack(spacing: 16) {
                        ForEach(filteredCourses) { course in
                            NavigationLink(destination: KDSProgramDetailView(
                                course: course,
                                hasAccess: viewModel.accessibleCourseIDs.contains(course.id)
                            ).environmentObject(appState)) {
                                KDSProgramListRow(
                                    course: course,
                                    accessible: viewModel.accessibleCourseIDs.contains(course.id)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.vertical, 18)
        }
        .navigationTitle("Programs")
        .task {
            await viewModel.load(appState: appState)
        }
        .refreshable {
            await viewModel.load(appState: appState, force: true)
        }
        .kdsScreenBackground()
    }
}

struct KDSProgramDetailView: View {
    @EnvironmentObject private var appState: KDSAppState

    let course: CourseSummary
    let hasAccess: Bool

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                KDSFullWidthRemoteImage(
                    urlString: course.imageURL,
                    height: 260,
                    cornerRadius: 28,
                    showsGradient: true
                )

                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 10) {
                        if hasAccess {
                            KDSBadge(text: "Linked", color: KDSTheme.success)
                        } else if course.freeForLoggedIn == true {
                            KDSBadge(text: "Free Access", color: KDSTheme.accent)
                        } else {
                            KDSBadge(text: "Website Managed", color: KDSTheme.warning)
                        }

                        if course.comingSoon == true {
                            KDSBadge(text: "Coming Soon", color: KDSTheme.warning)
                        }
                    }

                    Text(course.title)
                        .font(.system(size: 30, weight: .heavy))
                        .foregroundColor(KDSTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)

                    if let points = course.cpdPoints {
                        Text("\(points) CPD points")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(KDSTheme.primary)
                    }

                    Text(course.descriptionText ?? "This programme is available to linked learners through PanAvest KDS.")
                        .font(.system(size: 16))
                        .foregroundColor(KDSTheme.muted)
                        .lineSpacing(5)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .kdsCard()

                if course.comingSoon == true {
                    KDSInfoCard(
                        title: "Not live yet",
                        detail: "This programme is marked as coming soon. Keep the app installed and you will be able to open it once the learning content is ready."
                    )
                } else if hasAccess || course.freeForLoggedIn == true {
                    NavigationLink(destination: KDSProgramDashboardView(slug: course.slug).environmentObject(appState)) {
                        Text("Open Course Dashboard")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(KDSPrimaryButtonStyle())
                } else {
                    KDSWebsiteAccessCard(item: .program, website: appState.config.mainSiteURL)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 110)
        }
        .navigationTitle("Program")
        .navigationBarTitleDisplayMode(.inline)
        .kdsEnableSwipeBack()
        .kdsScreenBackground()
    }
}

struct KDSProgramDashboardView: View {
    @EnvironmentObject private var appState: KDSAppState
    @StateObject private var viewModel = KDSProgramDashboardViewModel()
    @State private var showingFinalExamPreflight = false
    @State private var finalExamPreflightAcknowledged = false

    let slug: String

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                KDSHiddenNavigationHeader(title: "Program")

                Group {
                    if viewModel.loading && viewModel.course == nil {
                        KDSLoadingStateView(title: "Loading course dashboard…")
                    } else if viewModel.websiteAccessRequired {
                        KDSWebsiteAccessStateView(item: .program, website: appState.config.mainSiteURL)
                    } else if let error = viewModel.errorMessage {
                        KDSErrorStateView(title: "Course Unavailable", message: error) {
                            Task { await viewModel.load(slug: slug, appState: appState, force: true) }
                        }
                    } else if viewModel.hasAccess == false, viewModel.course != nil {
                        KDSWebsiteAccessStateView(item: .program, website: appState.config.mainSiteURL)
                    } else {
                        content
                    }
                }
            }
            .navigationBarHidden(true)
            .sheet(item: $viewModel.quizSession) { session in
                KDSQuizSessionView(session: session, viewModel: viewModel)
                    .environmentObject(appState)
            }
            .fullScreenCover(item: $viewModel.finalExamSession) { session in
                KDSFinalExamSessionView(session: session, viewModel: viewModel)
                    .environmentObject(appState)
            }
            .task {
                await viewModel.load(slug: slug, appState: appState)
            }
            .kdsEnableSwipeBack()
            .kdsScreenBackground()

            if showingFinalExamPreflight,
               let exam = viewModel.finalExam {
                KDSFinalExamPreflightOverlay(
                    exam: exam,
                    isOnline: appState.networkMonitor.isConnected,
                    acknowledged: $finalExamPreflightAcknowledged,
                    onCancel: closeFinalExamPreflight,
                    onStart: startFinalExamFromPreflight
                )
            }
        }
    }

    private var content: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                if let course = viewModel.course {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(course.title)
                            .font(.system(size: 30, weight: .heavy))
                            .foregroundColor(.white)
                        Text("Track your progress, continue lessons, and prepare for quizzes and the final assessment.")
                            .font(.system(size: 15))
                            .foregroundColor(.white.opacity(0.92))
                            .lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(alignment: .center, spacing: 18) {
                            KDSCircularProgressView(progress: Double(viewModel.progressPercent) / 100)
                                .frame(width: 74, height: 74)
                            VStack(alignment: .leading, spacing: 6) {
                                Text("\(viewModel.progressPercent)% complete")
                                    .font(.system(size: 22, weight: .bold))
                                    .foregroundColor(.white)
                                Text("\(viewModel.completedSlideIDs.count) of \(viewModel.orderedSlides.count) slides complete")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundColor(.white.opacity(0.82))
                            }
                        }
                    }
                    .padding(22)
                    .background(
                        LinearGradient(
                            colors: [KDSTheme.primaryDark, KDSTheme.accent],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                }

                if let notice = viewModel.notice {
                    KDSInfoBanner(message: notice)
                }

                if let course = viewModel.course,
                   course.isInteractive {
                    KDSInteractiveModuleCard(
                        title: course.title,
                        primaryURL: KDSURLResolver.interactiveDirectURL(path: course.interactivePath, config: appState.config),
                        compatibilityURL: nil,
                        externalURL: KDSURLResolver.interactiveCompatibilityURL(path: course.interactivePath, config: appState.config)
                    )
                }

                if let activeChapter = viewModel.activeChapter {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Current Chapter")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(KDSTheme.muted)
                        VStack(alignment: .leading, spacing: 12) {
                            Text(activeChapter.title)
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(KDSTheme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                            if let score = viewModel.activeChapterScore {
                                Text("Latest quiz score: \(score.scorePercent)%")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(KDSTheme.success)
                            } else if viewModel.activeChapterNeedsQuiz {
                                Text("Chapter quiz unlocked")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(KDSTheme.warning)
                            } else {
                                Text("Review the slides in any order and complete the quiz when you are ready.")
                                    .font(.system(size: 14))
                                    .foregroundColor(KDSTheme.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            if viewModel.activeChapterNeedsQuiz {
                                Button("Take Quiz") {
                                    viewModel.beginQuiz(for: activeChapter)
                                }
                                .buttonStyle(KDSSecondaryButtonStyle())
                                .frame(maxWidth: 180)
                            }
                        }
                    }
                    .kdsCard()
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 10) {
                        ForEach(viewModel.orderedChapters) { chapter in
                            Button {
                                viewModel.goToChapter(chapter)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(chapter.title)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(KDSTheme.ink)
                                        .lineLimit(2)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Text(viewModel.completedQuizChapterIDs.contains(chapter.id) ? "Quiz complete" : "Learning")
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(viewModel.completedQuizChapterIDs.contains(chapter.id) ? KDSTheme.success : KDSTheme.muted)
                                }
                                .frame(width: 240, alignment: .leading)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                                .background(
                                    (viewModel.activeChapter?.id == chapter.id ? KDSTheme.surface : KDSTheme.surfaceMuted)
                                )
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                                        .stroke(viewModel.activeChapter?.id == chapter.id ? KDSTheme.primary : KDSTheme.border, lineWidth: 1)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if let slide = viewModel.activeSlide {
                    KDSSlideCard(slide: slide)
                        .id(slide.id)
                        .kdsCard()

                    HStack(spacing: 12) {
                        Button("Previous") {
                            viewModel.goToPreviousSlide()
                        }
                        .buttonStyle(KDSSecondaryButtonStyle())
                        .disabled(!viewModel.canGoPrevious)

                        Button(viewModel.completedSlideIDs.contains(slide.id) ? "Completed" : "Mark Done") {
                            Task { await viewModel.markActiveSlideDone(appState: appState) }
                        }
                        .buttonStyle(KDSPrimaryButtonStyle())
                        .disabled(viewModel.completedSlideIDs.contains(slide.id))

                        Button("Next") {
                            viewModel.goToNextSlide()
                        }
                        .buttonStyle(KDSSecondaryButtonStyle())
                        .disabled(!viewModel.canGoNext)
                    }
                }

                if let result = viewModel.finalExamResult {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Final Exam Result")
                            .font(.system(size: 18, weight: .bold))
                        Text(result.passed ? "Passed at \(result.scorePercent)%" : "Scored \(result.scorePercent)%")
                            .font(.system(size: 24, weight: .heavy))
                            .foregroundColor(result.passed ? KDSTheme.success : KDSTheme.warning)
                        Text("\(result.correctCount) correct out of \(result.totalCount) questions.")
                            .foregroundColor(KDSTheme.muted)
                    }
                    .kdsCard()
                }

                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Course Outline")
                            .font(.system(size: 22, weight: .bold))
                        if viewModel.canTakeFinalExam {
                            Button("Start Final Exam") {
                                presentFinalExamPreflight()
                            }
                            .buttonStyle(KDSPrimaryButtonStyle())
                            .frame(maxWidth: 200)
                        } else if viewModel.finalAttempt != nil {
                            KDSBadge(text: "Final exam completed", color: KDSTheme.success)
                        }
                    }

                    ForEach(viewModel.orderedChapters) { chapter in
                        VStack(alignment: .leading, spacing: 10) {
                            VStack(alignment: .leading, spacing: 10) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(chapter.title)
                                        .font(.system(size: 17, weight: .bold))
                                        .fixedSize(horizontal: false, vertical: true)
                                    if let score = viewModel.chapterScores[chapter.id] {
                                        Text("Quiz score: \(score.scorePercent)%")
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundColor(KDSTheme.success)
                                    }
                                }
                                if let slides = viewModel.slidesByChapter[chapter.id],
                                   slides.allSatisfy({ viewModel.completedSlideIDs.contains($0.id) }),
                                   !(viewModel.quizQuestionsByChapter[chapter.id] ?? []).isEmpty,
                                   !viewModel.completedQuizChapterIDs.contains(chapter.id) {
                                    Button("Start Quiz") {
                                        viewModel.beginQuiz(for: chapter)
                                    }
                                    .buttonStyle(KDSSecondaryButtonStyle())
                                    .frame(maxWidth: 160)
                                }
                            }

                            ForEach(viewModel.slidesByChapter[chapter.id] ?? []) { slide in
                                Button {
                                    viewModel.goToSlide(slide)
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: viewModel.completedSlideIDs.contains(slide.id) ? "checkmark.circle.fill" : (viewModel.slideIsLocked(slide) ? "lock.circle.fill" : "play.circle.fill"))
                                            .font(.system(size: 18))
                                            .foregroundColor(
                                                viewModel.completedSlideIDs.contains(slide.id)
                                                ? KDSTheme.success
                                                : (viewModel.slideIsLocked(slide) ? KDSTheme.muted : KDSTheme.primary)
                                            )
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(slide.title)
                                                .font(.system(size: 15, weight: .medium))
                                                .foregroundColor(KDSTheme.ink)
                                                .lineLimit(3)
                                                .fixedSize(horizontal: false, vertical: true)
                                            Text(viewModel.activeSlideID == slide.id ? "Current slide" : (viewModel.slideIsLocked(slide) ? "Locked" : "Available"))
                                                .font(.system(size: 11, weight: .medium))
                                                .foregroundColor(KDSTheme.muted)
                                        }
                                        Spacer()
                                    }
                                    .padding(14)
                                    .background(KDSTheme.surfaceMuted.opacity(viewModel.activeSlideID == slide.id ? 1 : 0.6))
                                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(16)
                        .background(KDSTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .stroke(KDSTheme.border, lineWidth: 1)
                        )
                    }
                }
                .kdsCard()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 110)
        }
    }

    private func presentFinalExamPreflight() {
        finalExamPreflightAcknowledged = false
        showingFinalExamPreflight = true
    }

    private func closeFinalExamPreflight() {
        finalExamPreflightAcknowledged = false
        showingFinalExamPreflight = false
    }

    private func startFinalExamFromPreflight() {
        guard finalExamPreflightAcknowledged else { return }
        guard appState.networkMonitor.isConnected else {
            closeFinalExamPreflight()
            viewModel.notice = "Reconnect to a stable internet connection before starting the final exam."
            return
        }

        showingFinalExamPreflight = false
        finalExamPreflightAcknowledged = false
        DispatchQueue.main.async {
            viewModel.beginFinalExam()
        }
    }
}

struct KDSEbooksTabView: View {
    @EnvironmentObject private var appState: KDSAppState
    @StateObject private var viewModel = KDSEbooksViewModel()
    @State private var search = ""

    private var filteredEbooks: [EbookSummary] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return viewModel.ebooks }
        return viewModel.ebooks.filter { ebook in
            ebook.title.localizedCaseInsensitiveContains(query) ||
            (ebook.descriptionText ?? "").localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                KDSDiscoveryHero(
                    eyebrow: "E-Books",
                    title: "Open your linked e-books.",
                    copy: "Your books open securely here and return to the page where you stopped reading."
                )

                KDSSearchField(text: $search, placeholder: "Search linked e-books")

                if let error = viewModel.errorMessage {
                    KDSErrorBanner(message: error)
                }

                if viewModel.loading && viewModel.ebooks.isEmpty {
                    KDSLoadingCardRow()
                } else if filteredEbooks.isEmpty {
                    KDSInfoCard(title: "No linked e-books", detail: "Linked titles will appear here as soon as they are available to this account.")
                } else {
                    LazyVStack(spacing: 16) {
                        ForEach(filteredEbooks) { ebook in
                            NavigationLink(destination: KDSEbookDetailView(ebook: ebook).environmentObject(appState)) {
                                KDSEbookListRow(ebook: ebook)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 110)
        }
        .navigationTitle("E-Books")
        .task {
            await viewModel.load(appState: appState)
        }
        .refreshable {
            await viewModel.load(appState: appState, force: true)
        }
        .kdsScreenBackground()
    }
}

struct KDSEbookDetailView: View {
    @EnvironmentObject private var appState: KDSAppState
    @StateObject private var viewModel = KDSEbookDetailViewModel()

    let ebook: EbookSummary

    private var usesVerticalDetailLayout: Bool {
        UIScreen.main.bounds.width < 390
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                Group {
                    if usesVerticalDetailLayout {
                        VStack(alignment: .leading, spacing: 18) {
                            KDSRemoteImage(
                                urlString: ebook.coverURL,
                                width: min(UIScreen.main.bounds.width - 72, 210),
                                height: 220,
                                cornerRadius: 24
                            )
                            ebookDetailCopy
                        }
                    } else {
                        HStack(alignment: .top, spacing: 18) {
                            KDSRemoteImage(
                                urlString: ebook.coverURL,
                                width: 150,
                                height: 220,
                                cornerRadius: 24
                            )

                            ebookDetailCopy
                        }
                    }
                }
                .kdsCard()

                if viewModel.websiteAccessRequired {
                    KDSWebsiteAccessCard(item: .ebook, website: appState.config.mainSiteURL)
                } else if let error = viewModel.errorMessage {
                    KDSErrorBanner(message: error)
                }

                if !viewModel.websiteAccessRequired {
                    NavigationLink(destination: KDSEbookReaderView(ebook: ebook).environmentObject(appState)) {
                        Text("Open Reader")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(KDSPrimaryButtonStyle())

                    KDSInfoCard(
                        title: "Reader behavior",
                        detail: "The reader opens your book securely, keeps it ready for smoother reading, and restores your last page when you return."
                    )
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 110)
        }
        .navigationTitle("E-Book")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.load(summary: ebook, appState: appState)
        }
        .onAppear {
            viewModel.refreshLocalState(summary: ebook, appState: appState)
        }
        .kdsEnableSwipeBack()
        .kdsScreenBackground()
    }

    private var ebookDetailCopy: some View {
        VStack(alignment: .leading, spacing: 12) {
            KDSBadge(text: ebook.linkedStatus == "free" ? "Free Access" : "Linked", color: ebook.linkedStatus == "free" ? KDSTheme.accent : KDSTheme.success)
            Text(ebook.title)
                .font(.system(size: 28, weight: .heavy))
                .foregroundColor(KDSTheme.ink)
                .lineLimit(3)
                .truncationMode(.tail)
                .fixedSize(horizontal: false, vertical: true)
            Text(viewModel.ebookDetail?.descriptionText ?? ebook.descriptionText ?? "This title is available through your PanAvest KDS account and opens here for reading.")
                .foregroundColor(KDSTheme.muted)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            if viewModel.lastSavedPage > 0 {
                Text("Resume from page \(viewModel.lastSavedPage + 1)")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(KDSTheme.primary)
            }
            if viewModel.taggedPageCount > 0 {
                Text("\(viewModel.taggedPageCount) tagged page\(viewModel.taggedPageCount == 1 ? "" : "s") saved for quick access")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(KDSTheme.accent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct KDSEbookReaderView: View {
    @EnvironmentObject private var appState: KDSAppState
    @StateObject private var viewModel = KDSEbookReaderViewModel()
    @StateObject private var pdfController = KDSPDFViewController()
    @State private var showingTagEditor = false
    @State private var showingTaggedPages = false

    let ebook: EbookSummary

    private var usesVerticalReaderHeader: Bool {
        UIScreen.main.bounds.width < 390
    }

    private var currentPageTag: ReaderTaggedPage? {
        viewModel.taggedPages.first(where: { $0.pageIndex == viewModel.pageIndex })
    }

    private var tagEditorTitle: String {
        currentPageTag == nil ? "Tag page" : "Edit page tag"
    }

    var body: some View {
        Group {
            if viewModel.loading && viewModel.document == nil {
                KDSLoadingStateView(title: "Opening secure PDF…")
            } else if let document = viewModel.document {
                VStack(spacing: 0) {
                    Group {
                        if usesVerticalReaderHeader {
                            VStack(alignment: .leading, spacing: 8) {
                                readerHeaderCopy
                                if let message = viewModel.errorMessage {
                                    Text(message)
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(KDSTheme.warning)
                                }
                            }
                        } else {
                            HStack {
                                readerHeaderCopy
                                Spacer()
                                if let message = viewModel.errorMessage {
                                    Text(message)
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(KDSTheme.warning)
                                        .multilineTextAlignment(.trailing)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 14)
                    .background(KDSTheme.surface)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            Button {
                                pdfController.zoomOut()
                            } label: {
                                KDSReaderActionChip(
                                    title: "Zoom Out",
                                    systemImage: "minus.magnifyingglass"
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                pdfController.resetZoom()
                            } label: {
                                KDSReaderActionChip(
                                    title: "\(pdfController.zoomPercent)%",
                                    systemImage: "arrow.up.left.and.down.right.magnifyingglass",
                                    highlighted: pdfController.zoomPercent != 100
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                pdfController.zoomIn()
                            } label: {
                                KDSReaderActionChip(
                                    title: "Zoom In",
                                    systemImage: "plus.magnifyingglass"
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                showingTagEditor = true
                            } label: {
                                KDSReaderActionChip(
                                    title: currentPageTag == nil ? "Tag Page" : "Edit Tag",
                                    systemImage: currentPageTag == nil ? "tag" : "tag.fill",
                                    highlighted: currentPageTag != nil
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                showingTaggedPages = true
                            } label: {
                                KDSReaderActionChip(
                                    title: viewModel.taggedPages.isEmpty ? "Tagged Pages" : "Tagged (\(viewModel.taggedPages.count))",
                                    systemImage: "bookmark"
                                )
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 12)
                    }
                    .background(KDSTheme.surface)

                    KDSPDFDocumentView(
                        document: document,
                        pageIndex: viewModel.pageIndex,
                        controller: pdfController
                    ) { newPage in
                        viewModel.updatePage(newPage, ebookId: ebook.id, appState: appState)
                    }
                }
                .background(KDSTheme.background.ignoresSafeArea())
            } else if viewModel.websiteAccessRequired {
                KDSWebsiteAccessStateView(item: .ebook, website: appState.config.mainSiteURL)
            } else if let error = viewModel.errorMessage {
                KDSErrorStateView(title: "Reader Failed", message: error) {
                    Task { await viewModel.load(summary: ebook, appState: appState, force: true) }
                }
            } else {
                KDSLoadingStateView(title: "Preparing reader…")
            }
        }
        .navigationTitle("Reader")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await viewModel.load(summary: ebook, appState: appState)
        }
        .sheet(isPresented: $showingTagEditor) {
            KDSReaderTagEditorSheet(
                title: tagEditorTitle,
                pageNumber: viewModel.pageIndex + 1,
                initialLabel: currentPageTag?.label ?? "Page \(viewModel.pageIndex + 1)",
                canRemove: currentPageTag != nil,
                onSave: { label in
                    viewModel.saveTag(
                        for: viewModel.pageIndex,
                        label: label,
                        ebookId: ebook.id,
                        appState: appState
                    )
                },
                onRemove: {
                    viewModel.removeTag(
                        for: viewModel.pageIndex,
                        ebookId: ebook.id,
                        appState: appState
                    )
                }
            )
        }
        .sheet(isPresented: $showingTaggedPages) {
            KDSReaderTaggedPagesSheet(
                tags: viewModel.taggedPages,
                currentPageIndex: viewModel.pageIndex,
                onSelect: { taggedPage in
                    viewModel.jumpToPage(
                        taggedPage.pageIndex,
                        ebookId: ebook.id,
                        appState: appState
                    )
                    showingTaggedPages = false
                },
                onDelete: { taggedPage in
                    viewModel.removeTag(
                        for: taggedPage.pageIndex,
                        ebookId: ebook.id,
                        appState: appState
                    )
                }
            )
        }
        .kdsEnableSwipeBack()
    }

    private var readerHeaderCopy: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(ebook.title)
                .font(.system(size: 17, weight: .bold))
                .lineLimit(2)
                .truncationMode(.tail)
            Text("Page \(viewModel.pageIndex + 1) of \(max(1, viewModel.pageCount))")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(KDSTheme.muted)
        }
    }
}

private struct KDSReaderActionChip: View {
    let title: String
    let systemImage: String
    var highlighted = false

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.system(size: 13, weight: .semibold))
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
        }
        .foregroundColor(highlighted ? KDSTheme.primary : KDSTheme.ink)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(highlighted ? KDSTheme.primary.opacity(0.12) : KDSTheme.surfaceMuted.opacity(0.82))
        .overlay(
            Capsule()
                .stroke(highlighted ? KDSTheme.primary.opacity(0.35) : KDSTheme.border, lineWidth: 1)
        )
        .clipShape(Capsule())
    }
}

private struct KDSReaderTagEditorSheet: View {
    @Environment(\.dismiss) private var dismiss

    let title: String
    let pageNumber: Int
    let initialLabel: String
    let canRemove: Bool
    let onSave: (String) -> Void
    let onRemove: () -> Void

    @State private var label: String

    init(
        title: String,
        pageNumber: Int,
        initialLabel: String,
        canRemove: Bool,
        onSave: @escaping (String) -> Void,
        onRemove: @escaping () -> Void
    ) {
        self.title = title
        self.pageNumber = pageNumber
        self.initialLabel = initialLabel
        self.canRemove = canRemove
        self.onSave = onSave
        self.onRemove = onRemove
        _label = State(initialValue: initialLabel)
    }

    var body: some View {
        NavigationView {
            VStack(alignment: .leading, spacing: 18) {
                KDSBadge(text: "Page \(pageNumber)", color: KDSTheme.primary)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Label")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(KDSTheme.ink)
                    TextField("Page label", text: $label)
                        .textInputAutocapitalization(.words)
                        .padding(14)
                        .background(KDSTheme.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(KDSTheme.border, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }

                KDSInfoCard(
                    title: "Quick access",
                    detail: "Tagged pages appear in a quick-access list inside the reader so you can jump back to important sections."
                )

                Spacer()

                if canRemove {
                    Button("Remove Tag") {
                        onRemove()
                        dismiss()
                    }
                    .buttonStyle(KDSSecondaryButtonStyle())
                }
            }
            .padding(18)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        onSave(label)
                        dismiss()
                    }
                }
            }
            .kdsScreenBackground()
        }
    }
}

private struct KDSReaderTaggedPagesSheet: View {
    @Environment(\.dismiss) private var dismiss

    let tags: [ReaderTaggedPage]
    let currentPageIndex: Int
    let onSelect: (ReaderTaggedPage) -> Void
    let onDelete: (ReaderTaggedPage) -> Void

    var body: some View {
        NavigationView {
            Group {
                if tags.isEmpty {
                    KDSInfoCard(
                        title: "No tagged pages yet",
                        detail: "Tag the pages you want to revisit quickly. They will appear here in reading order."
                    )
                    .padding(18)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                } else {
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 14) {
                            ForEach(tags) { taggedPage in
                                HStack(spacing: 12) {
                                    Button {
                                        onSelect(taggedPage)
                                        dismiss()
                                    } label: {
                                        VStack(alignment: .leading, spacing: 8) {
                                            HStack(spacing: 8) {
                                                KDSBadge(
                                                    text: "Page \(taggedPage.pageIndex + 1)",
                                                    color: currentPageIndex == taggedPage.pageIndex ? KDSTheme.primary : KDSTheme.accent
                                                )
                                                if currentPageIndex == taggedPage.pageIndex {
                                                    KDSBadge(text: "Current", color: KDSTheme.success)
                                                }
                                            }
                                            Text(taggedPage.label)
                                                .font(.system(size: 16, weight: .semibold))
                                                .foregroundColor(KDSTheme.ink)
                                                .multilineTextAlignment(.leading)
                                            Text("Jump back to this section in one tap.")
                                                .font(.system(size: 13))
                                                .foregroundColor(KDSTheme.muted)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(16)
                                        .background(KDSTheme.surface)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                                .stroke(KDSTheme.border, lineWidth: 1)
                                        )
                                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                                    }
                                    .buttonStyle(.plain)

                                    Button {
                                        onDelete(taggedPage)
                                    } label: {
                                        Image(systemName: "trash")
                                            .font(.system(size: 14, weight: .bold))
                                            .foregroundColor(KDSTheme.primary)
                                            .frame(width: 42, height: 42)
                                            .background(KDSTheme.surfaceMuted)
                                            .clipShape(Circle())
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .padding(18)
                    }
                }
            }
            .navigationTitle("Tagged Pages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .kdsScreenBackground()
        }
    }
}

struct KDSDashboardTabView: View {
    @EnvironmentObject private var appState: KDSAppState
    @StateObject private var viewModel = KDSDashboardViewModel()
    @State private var editingName = false
    @State private var nameDraft = ""

    let onOpenSettings: () -> Void

    private var usesVerticalStats: Bool {
        UIScreen.main.bounds.width < 390
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(viewModel.snapshot?.displayName.isEmpty == false ? (viewModel.snapshot?.displayName ?? "") : "Your Dashboard")
                            .font(.system(size: 32, weight: .heavy))
                            .foregroundColor(KDSTheme.ink)
                            .lineLimit(2)
                            .truncationMode(.tail)
                        Text("Track your progress, scores, certificates, and linked books.")
                            .font(.system(size: 15))
                            .foregroundColor(KDSTheme.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .layoutPriority(1)
                    Spacer()
                    Button(action: onOpenSettings) {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(12)
                            .background(KDSTheme.accent)
                            .clipShape(Circle())
                    }
                }

                if let error = viewModel.errorMessage {
                    KDSErrorBanner(message: error)
                }

                if let snapshot = viewModel.snapshot {
                    Group {
                        if usesVerticalStats {
                            VStack(spacing: 14) {
                                KDSStatCard(title: "Programs", value: "\(snapshot.enrolledCourses.count)", detail: "Programmes available on this account.")
                                KDSStatCard(title: "Certificates", value: "\(viewModel.certificateItems.count)", detail: "Issued and upcoming certificates.")
                            }
                        } else {
                            HStack(spacing: 14) {
                                KDSStatCard(title: "Programs", value: "\(snapshot.enrolledCourses.count)", detail: "Programmes available on this account.")
                                KDSStatCard(title: "Certificates", value: "\(viewModel.certificateItems.count)", detail: "Issued and upcoming certificates.")
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Text("Certificate Name")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(KDSTheme.ink)
                            Spacer()
                            Button(editingName ? "Done" : "Edit") {
                                editingName.toggle()
                                nameDraft = snapshot.displayName
                            }
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(KDSTheme.primary)
                        }
                        if editingName {
                            TextField("Full name", text: $nameDraft)
                                .padding()
                                .background(KDSTheme.surfaceMuted)
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            Button("Save Display Name") {
                                Task {
                                    await viewModel.saveDisplayName(nameDraft, appState: appState)
                                    editingName = false
                                }
                            }
                            .buttonStyle(KDSPrimaryButtonStyle())
                        } else {
                            Text(snapshot.displayName.isEmpty ? "Add your full name for certificates." : snapshot.displayName)
                                .foregroundColor(KDSTheme.muted)
                        }
                    }
                    .kdsCard()

                    KDSSectionHeader(title: "Continue Learning", subtitle: "Pick up your learning where you left off.")
                    if snapshot.enrolledCourses.isEmpty {
                        KDSInfoCard(title: "No linked programs yet", detail: "When programmes are linked to this account they will appear here with progress updates.")
                    } else {
                        KDSHorizontalShelf {
                            ForEach(snapshot.enrolledCourses) { course in
                                NavigationLink(destination: KDSProgramDashboardView(slug: course.slug).environmentObject(appState)) {
                                    KDSLearningProgressCard(course: course)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    KDSSectionHeader(title: "Linked E-Books", subtitle: "Open linked e-books and continue where you stopped.")
                    if snapshot.ebooks.isEmpty {
                        KDSInfoCard(title: "No linked e-books", detail: "Linked purchases will appear here.")
                    } else {
                        KDSHorizontalShelf {
                            ForEach(snapshot.ebooks) { ebook in
                                NavigationLink(destination: KDSEbookDetailView(ebook: ebook).environmentObject(appState)) {
                                    KDSEbookShelfCard(ebook: ebook)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    KDSSectionHeader(title: "Certificates", subtitle: "Issued certificates include verification links. Upcoming certificates appear as previews.")
                    if viewModel.certificateItems.isEmpty {
                        KDSInfoCard(title: "No certificates yet", detail: "Complete learning and assessments to unlock certificates.")
                    } else {
                        LazyVStack(spacing: 16) {
                            ForEach(viewModel.certificateItems) { item in
                                NavigationLink(destination: KDSCertificatePreviewView(
                                    item: item,
                                    recipientName: snapshot.displayName.isEmpty ? appState.userEmail : snapshot.displayName
                                )) {
                                    KDSCertificateListRow(item: item)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    KDSSectionHeader(title: "Score History", subtitle: "Latest chapter quiz records grouped by course.")
                    if snapshot.scoresByCourse.isEmpty {
                        KDSInfoCard(title: "No scores yet", detail: "Take chapter quizzes and final exams to populate your learner record.")
                    } else {
                        VStack(spacing: 16) {
                            ForEach(snapshot.enrolledCourses) { course in
                                let rows = snapshot.scoresByCourse[course.id] ?? []
                                if !rows.isEmpty {
                                    VStack(alignment: .leading, spacing: 12) {
                                        Text(course.title)
                                            .font(.system(size: 18, weight: .bold))
                                            .foregroundColor(KDSTheme.ink)
                                        ForEach(rows, id: \.id) { row in
                                            HStack {
                                                VStack(alignment: .leading, spacing: 4) {
                                                    Text(row.chapterTitle)
                                                        .font(.system(size: 15, weight: .medium))
                                                        .foregroundColor(KDSTheme.ink)
                                                    if let completedAt = row.completedAt {
                                                        Text(completedAt.formatted(date: .abbreviated, time: .shortened))
                                                            .font(.system(size: 11, weight: .medium))
                                                            .foregroundColor(KDSTheme.muted)
                                                    }
                                                }
                                                Spacer()
                                                Text("\(row.scorePercent)%")
                                                    .font(.system(size: 22, weight: .heavy))
                                                    .foregroundColor(KDSTheme.success)
                                            }
                                            .padding(14)
                                            .background(KDSTheme.surfaceMuted)
                                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                        }
                                    }
                                    .kdsCard()
                                }
                            }
                        }
                    }
                } else if viewModel.loading {
                    KDSLoadingStateView(title: "Loading dashboard…")
                        .frame(height: 280)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 110)
        }
        .navigationBarHidden(true)
        .task {
            await viewModel.load(appState: appState)
        }
        .refreshable {
            await viewModel.load(appState: appState, force: true)
        }
        .kdsScreenBackground()
    }
}

struct KDSCertificatePreviewView: View {
    let item: KDSCertificateItem
    let recipientName: String

    @State private var shareFile: KDSShareFile?
    @State private var shareError = ""

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                KDSCertificateCard(item: item, recipientName: recipientName)

                if !shareError.isEmpty {
                    KDSErrorBanner(message: shareError)
                }

                Button("Download / Share PDF") {
                    do {
                        let url = try KDSCertificateRenderer.render(item: item, recipientName: recipientName)
                        shareFile = KDSShareFile(url: url)
                    } catch {
                        shareError = error.localizedDescription
                    }
                }
                .buttonStyle(KDSPrimaryButtonStyle())

                if let verifyURL = item.verifyURL {
                    Link("Open Verification URL", destination: verifyURL)
                        .frame(maxWidth: .infinity)
                        .buttonStyle(KDSSecondaryButtonStyle())
                } else {
                    KDSInfoCard(
                        title: "Provisional certificate",
                        detail: "This preview is based on completed progress plus a passing exam result. Verification becomes available after an issued certificate record exists."
                    )
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 18)
        }
        .navigationTitle("Certificate")
        .sheet(item: $shareFile) { file in
            KDSActivitySheet(items: [file.url])
        }
        .kdsEnableSwipeBack()
        .kdsScreenBackground()
    }
}

struct KDSAITabView: View {
    @EnvironmentObject private var appState: KDSAppState
    @StateObject private var viewModel = KDSAIViewModel()
    @State private var query = ""

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                KDSDiscoveryHero(
                    eyebrow: "PanAvest AI",
                    title: "Supply-chain dictionary, AI explainer, and native voice playback.",
                    copy: "Dictionary data stays local after caching, while explanations, images, and TTS continue to use the existing Next.js API routes."
                )

                KDSSearchField(text: $query, placeholder: "Search supply chain terms")
                    .onChange(of: query) { newValue in
                        viewModel.search(newValue, appState: appState)
                    }

                if let error = viewModel.errorMessage {
                    KDSErrorBanner(message: error)
                }

                if !viewModel.suggestions.isEmpty {
                    VStack(spacing: 10) {
                        ForEach(viewModel.suggestions) { entry in
                            Button {
                                query = entry.term
                                Task { await viewModel.select(entry, appState: appState) }
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(entry.term)
                                        .font(.system(size: 16, weight: .bold))
                                        .foregroundColor(KDSTheme.ink)
                                    Text(entry.definition)
                                        .font(.system(size: 13))
                                        .foregroundColor(KDSTheme.muted)
                                        .lineLimit(2)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(14)
                                .background(KDSTheme.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                                        .stroke(KDSTheme.border, lineWidth: 1)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } else if viewModel.loading && viewModel.selectedEntry == nil {
                    KDSLoadingStateView(title: "Loading PanAvest AI data…")
                        .frame(height: 180)
                }

                if let entry = viewModel.selectedEntry {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(entry.term)
                                    .font(.system(size: 28, weight: .heavy))
                                if !entry.partOfSpeech.isEmpty {
                                    Text(entry.partOfSpeech)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(KDSTheme.primary)
                                }
                            }
                            Spacer()
                            if !entry.tags.isEmpty {
                                KDSBadge(text: entry.tags, color: KDSTheme.accent)
                            }
                        }
                        Text(entry.definition)
                            .font(.system(size: 16))
                            .foregroundColor(KDSTheme.muted)
                            .lineSpacing(4)
                        if !entry.synonyms.isEmpty {
                            Text("Synonyms: \(entry.synonyms)")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(KDSTheme.ink)
                        }
                        if !entry.examples.isEmpty {
                            Text("Example: \(entry.examples)")
                                .font(.system(size: 13))
                                .foregroundColor(KDSTheme.muted)
                        }
                        HStack(spacing: 12) {
                            Button("Explain With AI") {
                                Task { await viewModel.select(entry, appState: appState) }
                            }
                            .buttonStyle(KDSPrimaryButtonStyle())

                            Button(viewModel.isSpeaking ? "Stop Audio" : "Play Audio") {
                                Task {
                                    if viewModel.isSpeaking {
                                        viewModel.stopSpeaking()
                                    } else {
                                        await viewModel.speakCurrent(appState: appState)
                                    }
                                }
                            }
                            .buttonStyle(KDSSecondaryButtonStyle())
                        }
                    }
                    .kdsCard()
                }

                if let imageURL = viewModel.imageURL {
                    KDSFullWidthRemoteImage(
                        urlString: imageURL.absoluteString,
                        height: 220,
                        cornerRadius: 24
                    )
                }

                if !viewModel.explanationHTML.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("AI Explanation")
                            .font(.system(size: 20, weight: .bold))
                        KDSHTMLTextView(html: viewModel.explanationHTML)
                            .frame(minHeight: 180)
                    }
                    .kdsCard()
                }

                VStack(alignment: .leading, spacing: 14) {
                    Text("Voice Settings")
                        .font(.system(size: 20, weight: .bold))
                    Toggle(isOn: Binding(
                        get: { viewModel.autoReadEnabled },
                        set: { viewModel.updateAutoRead($0) }
                    )) {
                        Text("Auto-read AI responses")
                    }
                    if !viewModel.availableVoices.isEmpty {
                        Picker("Voice", selection: Binding(
                            get: { viewModel.selectedVoiceIdentifier },
                            set: { viewModel.updateVoice(identifier: $0) }
                        )) {
                            ForEach(viewModel.availableVoices, id: \.identifier) { voice in
                                Text(voice.name).tag(voice.identifier)
                            }
                        }
                        .pickerStyle(.menu)
                    }
                }
                .kdsCard()

                if !viewModel.messages.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("History")
                            .font(.system(size: 20, weight: .bold))
                        ForEach(viewModel.messages) { message in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(message.role == .user ? "You" : "PanAvest AI")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(KDSTheme.muted)
                                Text(message.text)
                                    .font(.system(size: 15))
                                    .foregroundColor(KDSTheme.ink)
                                    .lineSpacing(3)
                            }
                            .padding(14)
                            .background(message.role == .user ? KDSTheme.surfaceMuted : KDSTheme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                    }
                    .kdsCard()
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 18)
        }
        .navigationTitle("AI")
        .task {
            await viewModel.load(appState: appState)
        }
        .kdsScreenBackground()
    }
}

private struct KDSSlideCard: View {
    let slide: Slide

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(slide.title)
                .font(.system(size: 24, weight: .heavy))
                .foregroundColor(KDSTheme.ink)
                .fixedSize(horizontal: false, vertical: true)

            if let videoURL = slide.resolvedVideoURL,
               let url = KDSURLResolver.resolve(videoURL, origin: .mainSite) {
                KDSVideoSlideView(url: url)
            }

            if let assetURL = slide.assetURL,
               !assetURL.isEmpty {
                if assetURL.lowercased().contains(".pdf") {
                    KDSRemotePDFSlideView(urlString: assetURL)
                        .frame(height: 320)
                } else if assetURL.lowercased().contains(".png") || assetURL.lowercased().contains(".jpg") || assetURL.lowercased().contains(".jpeg") || assetURL.lowercased().contains(".webp") {
                    KDSFullWidthRemoteImage(
                        urlString: assetURL,
                        height: 240,
                        cornerRadius: 20
                    )
                } else if let url = KDSURLResolver.resolve(assetURL, origin: .mainSite) {
                    Link("Open external learning resource", destination: url)
                        .frame(maxWidth: .infinity)
                        .buttonStyle(KDSSecondaryButtonStyle())
                }
            }

            if !slide.resolvedBody.isEmpty {
                KDSHTMLTextView(html: slide.resolvedBody)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

private struct KDSVideoSlideView: View {
    let url: URL

    @State private var player: AVPlayer?
    @State private var showFullScreen = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Group {
                if let player {
                    VideoPlayer(player: player)
                } else {
                    ProgressView()
                        .tint(KDSTheme.primary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(KDSTheme.surfaceMuted)
                }
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

            Button("Watch Full Screen") {
                showFullScreen = true
            }
            .buttonStyle(KDSSecondaryButtonStyle())
        }
        .task(id: url.absoluteString) {
            player?.pause()
            player = nil
            let player = AVPlayer(url: url)
            player.allowsExternalPlayback = true
            self.player = player
        }
        .onDisappear {
            player?.pause()
        }
        .fullScreenCover(isPresented: $showFullScreen) {
            KDSFullScreenVideoView(url: url)
        }
    }
}

private struct KDSInteractiveModuleCard: View {
    let title: String
    let primaryURL: URL?
    let compatibilityURL: URL?
    let externalURL: URL?

    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showFullScreen = false
    @State private var usingCompatibilityMode = false

    private var playerHeight: CGFloat {
        min(max(UIScreen.main.bounds.height * 0.54, 360), 560)
    }

    private var activeURL: URL? {
        if usingCompatibilityMode {
            return compatibilityURL ?? primaryURL
        }
        return primaryURL ?? compatibilityURL
    }

    private var browserURL: URL? {
        externalURL ?? activeURL
    }

    private var canToggleCompatibility: Bool {
        primaryURL != nil && compatibilityURL != nil && primaryURL != compatibilityURL
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Interactive Module")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(KDSTheme.ink)
                    Text("Open the lesson inline or switch to fullscreen to use the complete interactive controls in portrait or landscape.")
                        .font(.system(size: 14))
                        .foregroundColor(KDSTheme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 12)
                if activeURL != nil {
                    Button("Full Screen") {
                        showFullScreen = true
                    }
                    .buttonStyle(KDSSecondaryButtonStyle())
                    .frame(width: 124)
                }
            }

            if let activeURL {
                ZStack {
                    KDSInteractiveWebView(
                        url: activeURL,
                        isLoading: $isLoading,
                        errorMessage: $errorMessage
                    )
                    .frame(height: playerHeight)
                    .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(KDSTheme.border, lineWidth: 1)
                    )

                    if isLoading {
                        VStack(spacing: 10) {
                            ProgressView()
                                .tint(.white)
                            Text("Loading \(title)…")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.white)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.black.opacity(0.18))
                    }
                }

                HStack(spacing: 12) {
                    Button("Open Full Screen") {
                        showFullScreen = true
                    }
                    .buttonStyle(KDSPrimaryButtonStyle())

                    if canToggleCompatibility {
                        Button(usingCompatibilityMode ? "Standard Player" : "Compatibility Mode") {
                            usingCompatibilityMode.toggle()
                            errorMessage = nil
                            isLoading = true
                        }
                        .buttonStyle(KDSSecondaryButtonStyle())
                    }
                }

                if let errorMessage {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("The interactive module did not finish loading in-app.")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(KDSTheme.warning)
                        Text(errorMessage)
                            .font(.system(size: 13))
                            .foregroundColor(KDSTheme.muted)
                        if canToggleCompatibility {
                            Button(usingCompatibilityMode ? "Return to Standard Player" : "Retry in Compatibility Mode") {
                                usingCompatibilityMode.toggle()
                                self.errorMessage = nil
                                isLoading = true
                            }
                            .buttonStyle(KDSSecondaryButtonStyle())
                        }
                    }
                    .padding(16)
                    .background(KDSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
            } else {
                KDSInfoCard(
                    title: "Interactive module not configured",
                    detail: "This course is marked as interactive, but the lesson file is not configured yet."
                )
            }
        }
        .kdsCard()
        .fullScreenCover(isPresented: $showFullScreen) {
            KDSInteractiveModuleFullScreenView(
                title: title,
                primaryURL: primaryURL,
                compatibilityURL: compatibilityURL,
                externalURL: externalURL
            )
        }
    }
}

private struct KDSInteractiveWebView: UIViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool
    @Binding var errorMessage: String?

    func makeCoordinator() -> Coordinator {
        Coordinator(isLoading: $isLoading, errorMessage: $errorMessage)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        context.coordinator.webView = webView
        context.coordinator.load(url: url, in: webView, force: true)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.load(url: url, in: uiView)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        @Binding private var isLoading: Bool
        @Binding private var errorMessage: String?
        weak var webView: WKWebView?
        private var lastRequestedURL: URL?
        private var terminationCount = 0

        init(isLoading: Binding<Bool>, errorMessage: Binding<String?>) {
            _isLoading = isLoading
            _errorMessage = errorMessage
        }

        func load(url: URL, in webView: WKWebView, force: Bool = false) {
            // Track the requested URL instead of WKWebView.url because the site
            // canonically redirects `www` to the apex domain, which otherwise
            // causes an endless reload loop on every SwiftUI update.
            if !force, lastRequestedURL == url {
                return
            }
            lastRequestedURL = url
            terminationCount = 0
            update(isLoading: true, errorMessage: nil)
            webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy))
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            update(isLoading: true, errorMessage: nil)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            terminationCount = 0
            update(isLoading: false, errorMessage: nil)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handle(error: error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            handle(error: error)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            terminationCount += 1
            if terminationCount <= 1 {
                update(isLoading: true, errorMessage: nil)
                webView.reload()
            } else {
                update(
                    isLoading: false,
                    errorMessage: "The interactive module became unresponsive. Retry loading the lesson."
                )
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            if navigationResponse.isForMainFrame,
               let httpResponse = navigationResponse.response as? HTTPURLResponse,
               httpResponse.statusCode >= 400 {
                update(
                    isLoading: false,
                    errorMessage: "The interactive module could not be loaded right now. Please try again."
                )
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            if navigationAction.targetFrame == nil,
               let requestURL = navigationAction.request.url {
                webView.load(URLRequest(url: requestURL, cachePolicy: .useProtocolCachePolicy))
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        private func handle(error: Error) {
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain, nsError.code == NSURLErrorCancelled {
                return
            }
            update(isLoading: false, errorMessage: error.localizedDescription)
        }

        private func update(isLoading: Bool, errorMessage: String?) {
            DispatchQueue.main.async {
                if self.isLoading != isLoading {
                    self.isLoading = isLoading
                }
                if self.errorMessage != errorMessage {
                    self.errorMessage = errorMessage
                }
            }
        }
    }
}

private struct KDSInteractiveModuleFullScreenView: View {
    @Environment(\.dismiss) private var dismiss

    let title: String
    let primaryURL: URL?
    let compatibilityURL: URL?
    let externalURL: URL?

    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var usingCompatibilityMode = false

    private var activeURL: URL? {
        if usingCompatibilityMode {
            return compatibilityURL ?? primaryURL
        }
        return primaryURL ?? compatibilityURL
    }

    private var browserURL: URL? {
        externalURL ?? activeURL
    }

    private var canToggleCompatibility: Bool {
        primaryURL != nil && compatibilityURL != nil && primaryURL != compatibilityURL
    }

    var body: some View {
        NavigationView {
            ZStack {
                KDSTheme.background.ignoresSafeArea()

                if let activeURL {
                    ZStack {
                        KDSInteractiveWebView(
                            url: activeURL,
                            isLoading: $isLoading,
                            errorMessage: $errorMessage
                        )
                        .ignoresSafeArea(edges: .bottom)

                        if isLoading {
                            VStack(spacing: 12) {
                                ProgressView()
                                    .tint(.white)
                                Text("Loading \(title)…")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.white)
                            }
                            .padding(.horizontal, 22)
                            .padding(.vertical, 16)
                            .background(.black.opacity(0.58))
                            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                        }
                    }
                } else {
                    KDSInfoCard(
                        title: "Interactive module unavailable",
                        detail: "No interactive player URL is configured for this course yet."
                    )
                    .padding(24)
                }
            }
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(usingCompatibilityMode ? "Standard" : "Compat") {
                        guard canToggleCompatibility else { return }
                        usingCompatibilityMode.toggle()
                        errorMessage = nil
                        isLoading = true
                    }
                    .opacity(canToggleCompatibility ? 1 : 0)
                    .disabled(!canToggleCompatibility)
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Fullscreen interactive mode")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(KDSTheme.ink)
                        Spacer()
                        Text("Rotate for landscape")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(KDSTheme.muted)
                    }
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(KDSTheme.warning)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
                .background(.ultraThinMaterial)
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct KDSQuizSessionView: View {
    @EnvironmentObject private var appState: KDSAppState
    @Environment(\.dismiss) private var dismiss

    let session: KDSQuizSession
    @ObservedObject var viewModel: KDSProgramDashboardViewModel

    var body: some View {
        NavigationView {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(session.chapterTitle)
                                .font(.system(size: 28, weight: .heavy))
                            Text("Time left: \(formatDuration(viewModel.quizSession?.timeRemaining ?? session.timeRemaining))")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(KDSTheme.warning)
                        }
                        Spacer()
                    }

                    ForEach(viewModel.quizSession?.questions ?? session.questions) { question in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(question.question)
                                .font(.system(size: 17, weight: .bold))
                            VStack(spacing: 10) {
                                ForEach(Array(question.options.enumerated()), id: \.offset) { optionIndex, option in
                                    Button {
                                        viewModel.updateQuizAnswer(questionID: question.id, answerIndex: optionIndex)
                                    } label: {
                                        HStack {
                                            Image(systemName: (viewModel.quizSession?.answers[question.id] ?? -1) == optionIndex ? "largecircle.fill.circle" : "circle")
                                            Text(option)
                                                .multilineTextAlignment(.leading)
                                            Spacer()
                                        }
                                        .padding(14)
                                        .background(KDSTheme.surfaceMuted)
                                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .kdsCard()
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 18)
            }
            .navigationTitle("Chapter Quiz")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") {
                        viewModel.closeQuiz()
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Submit") {
                        Task {
                            await viewModel.submitActiveQuiz(appState: appState)
                            dismiss()
                        }
                    }
                }
            }
            .kdsScreenBackground()
        }
    }
}

private struct KDSFinalExamSessionView: View {
    @EnvironmentObject private var appState: KDSAppState

    let session: KDSFinalExamSession
    @ObservedObject var viewModel: KDSProgramDashboardViewModel

    var body: some View {
        NavigationView {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(session.exam.title ?? "Final Exam")
                            .font(.system(size: 30, weight: .heavy))
                        Text("Time left: \(formatDuration(viewModel.finalExamSession?.timeRemaining ?? session.timeRemaining))")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundColor(KDSTheme.warning)
                        Text("This final exam follows the course timer and single-attempt policy.")
                            .foregroundColor(KDSTheme.muted)
                    }
                    .kdsCard()

                    ForEach(viewModel.finalExamSession?.questions ?? session.questions) { question in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(question.prompt)
                                .font(.system(size: 17, weight: .bold))
                            VStack(spacing: 10) {
                                ForEach(Array(question.options.enumerated()), id: \.offset) { optionIndex, option in
                                    Button {
                                        viewModel.updateFinalExamAnswer(questionID: question.id, answerIndex: optionIndex)
                                    } label: {
                                        HStack {
                                            Image(systemName: (viewModel.finalExamSession?.answers[question.id] ?? -1) == optionIndex ? "checkmark.circle.fill" : "circle")
                                            Text(option)
                                                .multilineTextAlignment(.leading)
                                            Spacer()
                                        }
                                        .padding(14)
                                        .background(KDSTheme.surfaceMuted)
                                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .kdsCard()
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 18)
            }
            .navigationTitle("Final Exam")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Submit") {
                        Task { await viewModel.submitFinalExam(appState: appState) }
                    }
                }
            }
            .kdsScreenBackground()
        }
    }
}

private struct KDSFinalExamPreflightOverlay: View {
    let exam: Exam
    let isOnline: Bool
    @Binding var acknowledged: Bool
    let onCancel: () -> Void
    let onStart: () -> Void

    private var canStart: Bool {
        acknowledged && isOnline
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.46)
                .ignoresSafeArea()
                .onTapGesture(perform: onCancel)

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Before you start the final exam")
                        .font(.system(size: 24, weight: .heavy))
                        .foregroundColor(KDSTheme.ink)

                    VStack(alignment: .leading, spacing: 10) {
                        KDSFinalExamChecklistRow(
                            text: "Use a stable internet connection. Status: \(isOnline ? "Online" : "Offline")."
                        )
                        KDSFinalExamChecklistRow(
                            text: "Close other heavy apps and avoid VPNs that may interrupt the exam."
                        )
                        KDSFinalExamChecklistRow(
                            text: "Once you start, you cannot pause. The timer runs continuously."
                        )
                        KDSFinalExamChecklistRow(
                            text: "Do not close the app or switch away while taking the exam."
                        )
                        KDSFinalExamChecklistRow(
                            text: "Copying and printing are disabled during the exam."
                        )
                        KDSFinalExamChecklistRow(
                            text: "One attempt only. Contact admin if a retry needs to be unlocked."
                        )
                    }

                    Text("Time limit: \(exam.timeLimitMinutes ?? 60) minutes • Pass mark: \(exam.passMark ?? 0)%")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(KDSTheme.accent)

                    Button {
                        acknowledged.toggle()
                    } label: {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: acknowledged ? "checkmark.square.fill" : "square")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(acknowledged ? KDSTheme.primary : KDSTheme.muted)
                                .padding(.top, 1)
                            Text("I have read the rules and understand that the timer cannot be paused during the final exam.")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(KDSTheme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)

                    if !isOnline {
                        Text("You are offline. Reconnect before starting the final exam.")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(KDSTheme.warning)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: 12) {
                        Button("Cancel", action: onCancel)
                            .buttonStyle(KDSSecondaryButtonStyle())

                        Button("I Agree — Start Exam", action: onStart)
                            .buttonStyle(KDSPrimaryButtonStyle())
                            .opacity(canStart ? 1 : 0.55)
                            .disabled(!canStart)
                    }
                }
                .padding(22)
                .background(KDSTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(KDSTheme.border, lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.16), radius: 24, x: 0, y: 16)
                .padding(.horizontal, 20)
                .padding(.vertical, 36)
            }
        }
    }
}

private struct KDSFinalExamChecklistRow: View {
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(KDSTheme.warning)
                .padding(.top, 2)
            Text(text)
                .font(.system(size: 14))
                .foregroundColor(KDSTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private enum KDSMediaCardMetrics {
    static let rowSpacing: CGFloat = 16
    static let rowImageWidth: CGFloat = 120
    static let rowImageHeight: CGFloat = 112
    static let rowMinHeight: CGFloat = 144
    static let ebookRowImageWidth: CGFloat = 110
    static let ebookRowImageHeight: CGFloat = 110
    static let shelfSpacing: CGFloat = 16
    static let shelfPadding: CGFloat = 2
    static let shelfCardHeight: CGFloat = 304
    static let ebookShelfWidth: CGFloat = 168
    static let ebookShelfHeight: CGFloat = 258
    static let progressShelfHeight: CGFloat = 252

    static var programShelfWidth: CGFloat {
        min(max(UIScreen.main.bounds.width * 0.58, 212), 232)
    }

    static var progressShelfWidth: CGFloat {
        min(max(UIScreen.main.bounds.width * 0.56, 208), 228)
    }
}

private struct KDSHorizontalShelf<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: KDSMediaCardMetrics.shelfSpacing) {
                content()
            }
            .padding(.horizontal, KDSMediaCardMetrics.shelfPadding)
            .padding(.vertical, 2)
        }
    }
}

private struct KDSFullWidthRemoteImage: View {
    let urlString: String?
    let height: CGFloat
    var origin: KDSContentOrigin = .mainSite
    var cornerRadius: CGFloat = 24
    var showsGradient = false

    var body: some View {
        GeometryReader { proxy in
            KDSRemoteImage(
                urlString: urlString,
                width: max(proxy.size.width, 1),
                height: height,
                origin: origin,
                cornerRadius: cornerRadius,
                showsGradient: showsGradient
            )
        }
        .frame(height: height)
    }
}

private struct KDSListMediaCard<Badges: View>: View {
    let imageURL: String?
    let imageWidth: CGFloat
    let imageHeight: CGFloat
    let title: String
    let description: String
    let minHeight: CGFloat
    let cornerRadius: CGFloat
    @ViewBuilder let badges: () -> Badges

    var body: some View {
        HStack(alignment: .top, spacing: KDSMediaCardMetrics.rowSpacing) {
            KDSRemoteImage(
                urlString: imageURL,
                width: imageWidth,
                height: imageHeight,
                cornerRadius: 20
            )

            VStack(alignment: .leading, spacing: 10) {
                badges()
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text(title)
                    .font(.system(size: 19, weight: .bold))
                    .foregroundColor(KDSTheme.ink)
                    .lineLimit(3)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text(description)
                    .font(.system(size: 14))
                    .foregroundColor(KDSTheme.muted)
                    .lineLimit(2)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: imageHeight, alignment: .topLeading)
            .layoutPriority(1)
        }
        .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .leading)
        .padding(16)
        .kdsCardSurface(cornerRadius: cornerRadius)
        .contentShape(Rectangle())
    }
}

private struct KDSShelfMediaCard<Header: View, Footer: View>: View {
    let imageURL: String?
    let cardWidth: CGFloat
    let cardHeight: CGFloat
    let imageHeight: CGFloat
    let title: String
    let description: String?
    var showsGradient = false
    var cornerRadius: CGFloat = 26
    var descriptionLineLimit = 2
    @ViewBuilder let header: () -> Header
    @ViewBuilder let footer: () -> Footer

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            KDSRemoteImage(
                urlString: imageURL,
                width: cardWidth,
                height: imageHeight,
                cornerRadius: cornerRadius,
                showsGradient: showsGradient
            )

            VStack(alignment: .leading, spacing: 12) {
                header()

                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(KDSTheme.ink)
                    .lineLimit(2)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)

                if let description, !description.isEmpty {
                    Text(description)
                        .font(.system(size: 13))
                        .foregroundColor(KDSTheme.muted)
                        .lineLimit(descriptionLineLimit)
                        .truncationMode(.tail)
                        .frame(maxWidth: .infinity, minHeight: 38, alignment: .topLeading)
                }

                footer()
                Spacer(minLength: 0)
            }
            .padding(16)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(width: cardWidth, height: cardHeight, alignment: .topLeading)
        .kdsCardSurface(cornerRadius: cornerRadius)
        .contentShape(Rectangle())
    }
}

typealias Program = CourseSummary

private struct ContinueLearningCard: View {
    let item: KDSContinueLearningSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            KDSFullWidthRemoteImage(
                urlString: item.course.imageURL,
                height: 176,
                cornerRadius: 28,
                showsGradient: true
            )

            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(item.currentChapterTitle)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(KDSTheme.primary)
                            .lineLimit(1)

                        Text(item.course.title)
                            .font(.system(size: 26, weight: .bold, design: .rounded))
                            .foregroundColor(KDSTheme.ink)
                            .lineLimit(2)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        Text(item.currentLessonTitle)
                            .font(.system(size: 14))
                            .foregroundColor(KDSTheme.muted)
                            .lineLimit(2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    VStack(alignment: .trailing, spacing: 4) {
                        Text(item.progressText)
                            .font(.system(size: 30, weight: .heavy, design: .rounded))
                            .foregroundColor(KDSTheme.accent)
                        Text("complete")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(KDSTheme.muted)
                    }
                    .frame(minWidth: 74, alignment: .trailing)
                }

                VStack(alignment: .leading, spacing: 8) {
                    KDSProgressBar(value: item.progressValue)
                    Text(item.lessonProgressDetail)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(KDSTheme.muted)
                        .lineLimit(1)
                }

                HStack(spacing: 10) {
                    KDSBadge(
                        text: item.course.isFreeAccess ? "Open Access" : "Linked Program",
                        color: item.course.isFreeAccess ? KDSTheme.accent : KDSTheme.success
                    )
                    Spacer()
                    HStack(spacing: 8) {
                        Text(item.totalLessons == 0 ? "Open Program" : "Continue")
                        Image(systemName: "arrow.right")
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        LinearGradient(
                            colors: [KDSTheme.primary, KDSTheme.primaryDark],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .foregroundColor(.white)
                    .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 18)
        }
        .frame(
            maxWidth: .infinity,
            minHeight: KDSHomeMetrics.continueCardHeight,
            maxHeight: KDSHomeMetrics.continueCardHeight,
            alignment: .topLeading
        )
        .background(KDSTheme.surface.opacity(0.98))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(KDSTheme.border.opacity(0.82), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .shadow(color: .black.opacity(0.08), radius: 22, x: 0, y: 14)
    }
}

struct ProgramCard: View {
    let program: Program
    let isLinked: Bool

    private let cardPadding: CGFloat = 14
    private let badgeRowHeight: CGFloat = 24
    private let titleHeight: CGFloat = 52
    private let descriptionHeight: CGFloat = 42

    private var hasBadges: Bool {
        isLinked || program.comingSoon == true
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            KDSRemoteImage(
                urlString: program.imageURL,
                width: KDSHomeMetrics.featuredProgramCardWidth - (cardPadding * 2),
                height: KDSHomeMetrics.featuredProgramImageHeight,
                cornerRadius: 24
            )
            .frame(height: KDSHomeMetrics.featuredProgramImageHeight)
            .clipped()

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    if isLinked {
                        KDSBadge(text: "Linked", color: KDSTheme.success)
                    }
                    if program.comingSoon == true {
                        KDSBadge(text: "Coming Soon", color: KDSTheme.warning)
                    }
                }
                .frame(height: badgeRowHeight, alignment: .leading)
                .opacity(hasBadges ? 1 : 0)

                Text(program.title)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundColor(KDSTheme.ink)
                    .lineLimit(2)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, minHeight: titleHeight, maxHeight: titleHeight, alignment: .topLeading)

                Text(program.descriptionText ?? "Structured learning designed for confident professional growth.")
                    .font(.system(size: 14))
                    .foregroundColor(KDSTheme.muted)
                    .lineLimit(2)
                    .truncationMode(.tail)
                    .frame(
                        maxWidth: .infinity,
                        minHeight: descriptionHeight,
                        maxHeight: descriptionHeight,
                        alignment: .topLeading
                    )
            }
            .frame(maxWidth: .infinity, minHeight: 142, alignment: .topLeading)
        }
        .padding(cardPadding)
        .frame(width: KDSHomeMetrics.featuredProgramCardWidth)
        .frame(
            minHeight: KDSHomeMetrics.featuredProgramCardHeight,
            maxHeight: KDSHomeMetrics.featuredProgramCardHeight,
            alignment: .topLeading
        )
        .background(KDSTheme.surface.opacity(0.98))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(KDSTheme.border.opacity(0.82), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.07), radius: 16, x: 0, y: 12)
    }
}

private struct LibraryBookCard: View {
    let ebook: EbookSummary
    let cardWidth: CGFloat
    let coverHeight: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            KDSRemoteImage(
                urlString: ebook.coverURL,
                width: cardWidth,
                height: coverHeight,
                cornerRadius: 22,
                contentMode: .fit
            )
            .frame(width: cardWidth, height: coverHeight)
            .background(KDSTheme.surface.opacity(0.95))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 10, x: 0, y: 6)

            Text(ebook.title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(KDSTheme.ink)
                .lineLimit(2)
                .truncationMode(.tail)
                .frame(width: cardWidth, alignment: .leading)
                .frame(
                    minHeight: KDSHomeMetrics.libraryTitleHeight,
                    maxHeight: KDSHomeMetrics.libraryTitleHeight,
                    alignment: .topLeading
                )

            Text(ebook.linkedStatus == "free" ? "Free access" : "Account linked")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(KDSTheme.muted)
                .lineLimit(1)
                .frame(width: cardWidth, alignment: .leading)
                .frame(
                    minHeight: KDSHomeMetrics.libraryStatusHeight,
                    maxHeight: KDSHomeMetrics.libraryStatusHeight,
                    alignment: .topLeading
                )
        }
        .frame(width: cardWidth)
        .frame(
            minHeight: KDSHomeMetrics.libraryCardHeight,
            maxHeight: KDSHomeMetrics.libraryCardHeight,
            alignment: .topLeading
        )
    }
}

private struct KDSProgramListRow: View {
    let course: CourseSummary
    let accessible: Bool

    var body: some View {
        KDSListMediaCard(
            imageURL: course.imageURL,
            imageWidth: KDSMediaCardMetrics.rowImageWidth,
            imageHeight: KDSMediaCardMetrics.rowImageHeight,
            title: course.title,
            description: course.descriptionText ?? "Open this programme and continue learning.",
            minHeight: KDSMediaCardMetrics.rowMinHeight,
            cornerRadius: 24
        ) {
            HStack(spacing: 8) {
                KDSBadge(text: accessible || course.freeForLoggedIn == true ? "Open" : "Website Link", color: accessible || course.freeForLoggedIn == true ? KDSTheme.success : KDSTheme.warning)
                if course.comingSoon == true {
                    KDSBadge(text: "Coming Soon", color: KDSTheme.warning)
                }
            }
        }
    }
}

private struct KDSEbookShelfCard: View {
    let ebook: EbookSummary
    var cardWidth: CGFloat = KDSMediaCardMetrics.ebookShelfWidth
    var cardHeight: CGFloat = KDSMediaCardMetrics.ebookShelfHeight

    var body: some View {
        KDSShelfMediaCard(
            imageURL: ebook.coverURL,
            cardWidth: cardWidth,
            cardHeight: cardHeight,
            imageHeight: 188,
            title: ebook.title,
            description: nil,
            cornerRadius: 24
        ) {
            EmptyView()
        } footer: {
            Text(ebook.linkedStatus == "free" ? "Free link" : "Account linked")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(KDSTheme.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct KDSEbookListRow: View {
    let ebook: EbookSummary

    var body: some View {
        KDSListMediaCard(
            imageURL: ebook.coverURL,
            imageWidth: KDSMediaCardMetrics.ebookRowImageWidth,
            imageHeight: KDSMediaCardMetrics.ebookRowImageHeight,
            title: ebook.title,
            description: ebook.descriptionText ?? "Open this title and continue reading.",
            minHeight: KDSMediaCardMetrics.rowMinHeight,
            cornerRadius: 24
        ) {
            KDSBadge(text: ebook.linkedStatus == "free" ? "Free Access" : "Linked", color: ebook.linkedStatus == "free" ? KDSTheme.accent : KDSTheme.success)
        }
    }
}

private struct KDSLearningProgressCard: View {
    let course: EnrolledCourse

    private let cardWidth = KDSMediaCardMetrics.progressShelfWidth
    private let cardHeight = KDSMediaCardMetrics.progressShelfHeight

    var body: some View {
        KDSShelfMediaCard(
            imageURL: course.imageURL,
            cardWidth: cardWidth,
            cardHeight: cardHeight,
            imageHeight: 134,
            title: course.title,
            description: nil,
            showsGradient: true,
            cornerRadius: 26
        ) {
            EmptyView()
        } footer: {
            VStack(alignment: .leading, spacing: 10) {
                KDSProgressBar(value: Double(course.progressPercent) / 100)
                Text("\(course.progressPercent)% complete")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(KDSTheme.primary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct KDSCertificateListRow: View {
    let item: KDSCertificateItem

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    KDSBadge(text: item.source == .issued ? "Issued" : "Provisional", color: item.source == .issued ? KDSTheme.success : KDSTheme.warning)
                    if let score = item.scorePercent {
                        KDSBadge(text: "\(score)%", color: KDSTheme.accent)
                    }
                }
                Text(item.courseTitle)
                    .font(.system(size: 18, weight: .bold))
                    .lineLimit(2)
                    .truncationMode(.tail)
                    .foregroundColor(KDSTheme.ink)
                Text(item.certificateNumber)
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .foregroundColor(KDSTheme.muted)
                Text(item.issuedAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(KDSTheme.primary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(KDSTheme.muted)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .kdsCardSurface(cornerRadius: 24)
    }
}

private struct KDSCertificateCard: View {
    let item: KDSCertificateItem
    let recipientName: String

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("CERTIFICATE OF COMPLETION")
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundColor(KDSTheme.muted)
                .tracking(2)

            Text("Knowledge Development Series")
                .font(.system(size: 32, weight: .heavy, design: .rounded))
                .foregroundColor(KDSTheme.accent)

            Text(recipientName.isEmpty ? "Learner Name" : recipientName)
                .font(.system(size: 30, weight: .bold))
                .foregroundColor(KDSTheme.ink)

            Text("For successfully completing the prescribed curriculum and assessments in \(item.courseTitle).")
                .font(.system(size: 16))
                .foregroundColor(KDSTheme.muted)
                .lineSpacing(5)

            HStack {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Certificate Number")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(KDSTheme.muted)
                    Text(item.certificateNumber)
                        .font(.system(size: 15, weight: .bold, design: .monospaced))
                        .foregroundColor(KDSTheme.ink)

                    Text("Issued")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(KDSTheme.muted)
                    Text(item.issuedAt.formatted(date: .long, time: .omitted))
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(KDSTheme.ink)
                }

                Spacer()

                if let verifyURL = item.verifyURL,
                   let qrImage = KDSCertificateRenderer.makeQRCode(from: verifyURL.absoluteString, size: 110) {
                    VStack(spacing: 6) {
                        Image(uiImage: qrImage)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 88, height: 88)
                            .clipped()
                            .cornerRadius(10)
                            .background(.white)
                        Text("Scan to verify")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(KDSTheme.muted)
                    }
                }
            }

            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Rectangle()
                        .fill(KDSTheme.border)
                        .frame(width: 150, height: 2)
                    Text("Authorized Signatory")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(KDSTheme.muted)
                    Text("Prof. Douglas Boateng")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(KDSTheme.ink)
                }
                Spacer()
                if let score = item.scorePercent {
                    Text("Score \(score)%")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(KDSTheme.success)
                }
            }
        }
        .padding(24)
        .background(
            LinearGradient(
                colors: [Color.white, KDSTheme.background],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(KDSTheme.accent, lineWidth: 2)
        )
        .shadow(color: .black.opacity(0.08), radius: 20, x: 0, y: 14)
    }
}

private struct KDSRemotePDFSlideView: View {
    let urlString: String

    @State private var document: PDFDocument?
    @State private var errorMessage: String?
    @State private var showFullScreen = false

    var body: some View {
        Group {
            if let document {
                KDSPDFDocumentView(document: document, pageIndex: 0) { _ in }
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .overlay(alignment: .topTrailing) {
                        Button("Full Screen") {
                            showFullScreen = true
                        }
                        .buttonStyle(KDSSecondaryButtonStyle())
                        .padding(14)
                    }
                    .onTapGesture {
                        showFullScreen = true
                    }
            } else if let errorMessage {
                VStack(spacing: 10) {
                    Text("PDF preview unavailable")
                        .font(.system(size: 15, weight: .bold))
                    Text(errorMessage)
                        .font(.system(size: 13))
                        .foregroundColor(KDSTheme.muted)
                        .multilineTextAlignment(.center)
                    if let url = KDSURLResolver.resolve(urlString, origin: .mainSite) {
                        Link("Open PDF", destination: url)
                            .buttonStyle(KDSSecondaryButtonStyle())
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(KDSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(KDSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
            }
        }
        .task(id: urlString) {
            document = nil
            errorMessage = nil
            do {
                guard let url = KDSURLResolver.resolve(urlString, origin: .mainSite) else {
                    throw KDSAPIError.badResponse
                }
                let (data, _) = try await KDSRemoteAssetLoader.fetchData(
                    url: url,
                    accept: "application/pdf,*/*;q=0.8"
                )
                guard let pdf = PDFDocument(data: data) else {
                    throw KDSAPIError.badResponse
                }
                document = pdf
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        .fullScreenCover(isPresented: $showFullScreen) {
            if let document {
                KDSFullScreenPDFView(document: document, title: "Course PDF")
            }
        }
    }
}

private struct KDSDiscoveryHero: View {
    let eyebrow: String
    let title: String
    let copy: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(eyebrow.uppercased())
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(KDSTheme.primary)
                .tracking(2)
            Text(title)
                .font(.system(size: 30, weight: .heavy))
                .foregroundColor(KDSTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(copy)
                .font(.system(size: 15))
                .foregroundColor(KDSTheme.muted)
                .lineSpacing(5)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(KDSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(KDSTheme.border, lineWidth: 1)
        )
    }
}

private struct KDSFullScreenVideoView: View {
    @Environment(\.dismiss) private var dismiss

    let url: URL

    @State private var player: AVPlayer?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()

            if let player {
                KDSAVPlayerControllerView(player: player)
                    .ignoresSafeArea()
            } else {
                ProgressView()
                    .tint(.white)
            }

            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .padding(12)
                    .background(.black.opacity(0.5))
                    .clipShape(Circle())
            }
            .padding(.top, 18)
            .padding(.leading, 18)
        }
        .task(id: url.absoluteString) {
            let player = AVPlayer(url: url)
            player.allowsExternalPlayback = true
            self.player = player
            player.play()
        }
        .onDisappear {
            player?.pause()
        }
    }
}

private struct KDSAVPlayerControllerView: UIViewControllerRepresentable {
    let player: AVPlayer

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        controller.player = player
        controller.showsPlaybackControls = true
        controller.entersFullScreenWhenPlaybackBegins = false
        controller.exitsFullScreenWhenPlaybackEnds = false
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        return controller
    }

    func updateUIViewController(_ uiViewController: AVPlayerViewController, context: Context) {
        uiViewController.player = player
    }
}

private struct KDSFullScreenPDFView: View {
    @Environment(\.dismiss) private var dismiss

    let document: PDFDocument
    let title: String

    @State private var pageIndex = 0

    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(title)
                            .font(.system(size: 17, weight: .bold))
                        Text("Page \(pageIndex + 1) of \(max(1, document.pageCount))")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(KDSTheme.muted)
                    }
                    Spacer()
                    Text("Pinch to zoom")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(KDSTheme.primary)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
                .background(KDSTheme.surface)

                KDSPDFDocumentView(document: document, pageIndex: pageIndex) { newPage in
                    pageIndex = newPage
                }
            }
            .background(KDSTheme.background.ignoresSafeArea())
            .navigationTitle("PDF")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}

private struct KDSCertificationsShowcase: View {
    let linkedProgramCount: Int

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    private var highlights: [KDSCertificationHighlight] {
        [
            KDSCertificationHighlight(
                title: "ISO 9001",
                detail: "Quality-principles aligned learning operations and delivery controls.",
                icon: "checkmark.seal.fill"
            ),
            KDSCertificationHighlight(
                title: "ISO 21001",
                detail: "Education-framework informed course design and learner support.",
                icon: "graduationcap.fill"
            ),
            KDSCertificationHighlight(
                title: "CPD Structured",
                detail: "Professional learning built for auditable continuing development.",
                icon: "rosette"
            ),
            KDSCertificationHighlight(
                title: "Secure Platform",
                detail: "Protected digital access, secure reading, and verified certificates.",
                icon: "lock.shield.fill"
            ),
            KDSCertificationHighlight(
                title: "SEO Alignment",
                detail: "Course, verification, and public trust pages remain web-discoverable.",
                icon: "magnifyingglass.circle.fill"
            ),
            KDSCertificationHighlight(
                title: "Programs Ready",
                detail: "\(linkedProgramCount) programs are already linked to this signed-in learner account.",
                icon: "books.vertical.fill"
            )
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Image("certifications-hero")
                .resizable()
                .scaledToFill()
                .frame(maxWidth: .infinity)
                .frame(height: 210)
                .clipped()
                .cornerRadius(24)
                .overlay(alignment: .bottomLeading) {
                    LinearGradient(
                        colors: [.clear, .black.opacity(0.38)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .cornerRadius(24)
                    .overlay(alignment: .bottomLeading) {
                        Text("Quality, education, security, and CPD trust signals.")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(.white)
                            .padding(18)
                    }
                }

            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(highlights) { item in
                    KDSCertificationTile(item: item)
                }
            }
        }
        .kdsCard()
    }
}

private struct KDSCertificationHighlight: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let icon: String
}

private struct KDSCertificationTile: View {
    let item: KDSCertificationHighlight

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: item.icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(KDSTheme.primary)
            Text(item.title)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(KDSTheme.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(item.detail)
                .font(.system(size: 13))
                .foregroundColor(KDSTheme.muted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(KDSTheme.surfaceMuted.opacity(0.86))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct KDSTrustHighlight: Identifiable {
    let id = UUID()
    let title: String
    let detail: String
    let systemImage: String
    let tint: Color
}

private struct KDSHomeQuickActionLabel: View {
    let title: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(.system(size: 15, weight: .semibold))
            Text(title)
                .font(.system(size: 15, weight: .semibold))
        }
        .foregroundColor(KDSTheme.ink)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(KDSTheme.surface.opacity(0.96))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(KDSTheme.border.opacity(0.88), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 8, x: 0, y: 4)
    }
}

private struct KDSHomeSectionHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundColor(KDSTheme.ink)
            Text(subtitle)
                .font(.system(size: 14))
                .foregroundColor(KDSTheme.muted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct KDSHomeEmptyStateCard: View {
    let title: String
    let detail: String
    let systemImage: String
    var actionTitle: String = "Open"
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(KDSTheme.primary)
                .frame(width: 42, height: 42)
                .background(KDSTheme.surfaceMuted.opacity(0.84))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(KDSTheme.ink)
                Text(detail)
                    .font(.system(size: 14))
                    .foregroundColor(KDSTheme.muted)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let action {
                Button(actionTitle, action: action)
                    .buttonStyle(KDSSecondaryButtonStyle())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(KDSTheme.surface.opacity(0.97))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(KDSTheme.border.opacity(0.82), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 14, x: 0, y: 8)
    }
}

private struct KDSHomeTrustLeadCard: View {
    let linkedProgramCount: Int

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Verified learning delivery")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundColor(KDSTheme.ink)

                Text("PanAvest KDS keeps quality, education, security, and CPD readiness in a lighter trust layer that is easy to scan.")
                    .font(.system(size: 14))
                    .foregroundColor(KDSTheme.muted)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)

                KDSBadge(
                    text: "\(linkedProgramCount) linked program\(linkedProgramCount == 1 ? "" : "s")",
                    color: KDSTheme.success
                )
            }

            Image("certifications-hero")
                .resizable()
                .scaledToFill()
                .frame(width: 118, height: 98)
                .clipped()
                .cornerRadius(22)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(KDSTheme.surface.opacity(0.97))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .stroke(KDSTheme.border.opacity(0.82), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.06), radius: 16, x: 0, y: 10)
    }
}

private struct TrustCard: View {
    let item: KDSTrustHighlight

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: item.systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(item.tint)
                .frame(width: 36, height: 36)
                .background(item.tint.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            Text(item.title)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(KDSTheme.ink)
                .lineLimit(1)

            Text(item.detail)
                .font(.system(size: 13))
                .foregroundColor(KDSTheme.muted)
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 128, alignment: .topLeading)
        .padding(16)
        .background(KDSTheme.surface.opacity(0.97))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(KDSTheme.border.opacity(0.8), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 12, x: 0, y: 8)
    }
}

private struct KDSTabBarHeightReader: UIViewRepresentable {
    @Binding var height: CGFloat

    func makeUIView(context: Context) -> KDSTabBarHeightReportingView {
        let view = KDSTabBarHeightReportingView()
        view.onHeightChange = { reportedHeight in
            let roundedHeight = ceil(reportedHeight)
            guard roundedHeight > 0 else { return }
            if abs(roundedHeight - height) > 0.5 {
                height = roundedHeight
            }
        }
        return view
    }

    func updateUIView(_ uiView: KDSTabBarHeightReportingView, context: Context) {
        uiView.onHeightChange = { reportedHeight in
            let roundedHeight = ceil(reportedHeight)
            guard roundedHeight > 0 else { return }
            if abs(roundedHeight - height) > 0.5 {
                height = roundedHeight
            }
        }
        uiView.reportHeightIfNeeded()
    }
}

private final class KDSTabBarHeightReportingView: UIView {
    var onHeightChange: ((CGFloat) -> Void)?

    override func didMoveToWindow() {
        super.didMoveToWindow()
        reportHeightIfNeeded()
    }

    override func didMoveToSuperview() {
        super.didMoveToSuperview()
        reportHeightIfNeeded()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        reportHeightIfNeeded()
    }

    func reportHeightIfNeeded() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if let tabBarHeight = self.enclosingTabBarController?.tabBar.frame.height {
                self.onHeightChange?(tabBarHeight)
            }
        }
    }

    private var enclosingTabBarController: UITabBarController? {
        var responder: UIResponder? = self
        while let current = responder {
            if let tabBarController = current as? UITabBarController {
                return tabBarController
            }
            if let viewController = current as? UIViewController,
               let tabBarController = viewController.tabBarController {
                return tabBarController
            }
            responder = current.next
        }
        return nil
    }
}

private struct KDSSectionHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 24, weight: .heavy))
                .foregroundColor(KDSTheme.ink)
            Text(subtitle)
                .font(.system(size: 14))
                .foregroundColor(KDSTheme.muted)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct KDSSearchField: View {
    @Binding var text: String
    let placeholder: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(KDSTheme.muted)
            TextField(placeholder, text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(KDSTheme.muted)
                }
            }
        }
        .padding(14)
        .background(KDSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(KDSTheme.border, lineWidth: 1)
        )
    }
}

private struct KDSInfoCard: View {
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(KDSTheme.ink)
            Text(detail)
                .font(.system(size: 14))
                .foregroundColor(KDSTheme.muted)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .kdsCard()
    }
}

private struct KDSStatCard: View {
    let title: String
    let value: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(KDSTheme.muted)
                .tracking(1.4)
            Text(value)
                .font(.system(size: 28, weight: .heavy))
                .foregroundColor(KDSTheme.accent)
            Text(detail)
                .font(.system(size: 13))
                .foregroundColor(KDSTheme.muted)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .kdsCard()
    }
}

private struct KDSErrorBanner: View {
    let message: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundColor(KDSTheme.warning)
            Text(message)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(KDSTheme.ink)
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(KDSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(KDSTheme.warning.opacity(0.4), lineWidth: 1)
        )
    }
}

private struct KDSInfoBanner: View {
    let message: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles")
                .foregroundColor(KDSTheme.primary)
            Text(message)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(KDSTheme.ink)
            Spacer()
        }
        .padding(14)
        .background(KDSTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(KDSTheme.border, lineWidth: 1)
        )
    }
}

private struct KDSCircularProgressView: View {
    let progress: Double

    var body: some View {
        ZStack {
            Circle()
                .stroke(.white.opacity(0.16), lineWidth: 10)
            Circle()
                .trim(from: 0, to: max(0, min(progress, 1)))
                .stroke(Color.white, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int(progress * 100))%")
                .font(.system(size: 16, weight: .heavy))
                .foregroundColor(.white)
        }
    }
}

private struct KDSLoadingCardRow: View {
    let height: CGFloat

    init(height: CGFloat = 144) {
        self.height = height
    }

    var body: some View {
        RoundedRectangle(cornerRadius: 26, style: .continuous)
            .fill(KDSTheme.surface.opacity(0.9))
            .frame(height: height)
            .overlay(KDSSkeletonBlock())
            .kdsCardSurface(cornerRadius: 26)
    }
}

private struct KDSLoadingShelfRow: View {
    let cardWidth: CGFloat
    let cardHeight: CGFloat
    var count = 3

    var body: some View {
        KDSHorizontalShelf {
            ForEach(0 ..< count, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .fill(KDSTheme.surface.opacity(0.94))
                    .frame(width: cardWidth, height: cardHeight)
                    .overlay(KDSSkeletonBlock())
                    .kdsCardSurface(cornerRadius: 26)
            }
        }
    }
}

private struct KDSGlassButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 14, weight: .semibold))
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.white.opacity(configuration.isPressed ? 0.16 : 0.2))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

private extension View {
    @ViewBuilder
    func kdsScrollClipDisabledIfAvailable() -> some View {
        if #available(iOS 17.0, *) {
            self.scrollClipDisabled()
        } else {
            self
        }
    }
}

private struct KDSShareFile: Identifiable {
    let id = UUID()
    let url: URL
}

private enum KDSCertificateRenderer {
    static func render(item: KDSCertificateItem, recipientName: String) throws -> URL {
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("kds-certificate-\(UUID().uuidString).pdf")
        let bounds = CGRect(x: 0, y: 0, width: 612, height: 792)
        let renderer = UIGraphicsPDFRenderer(bounds: bounds)

        try renderer.writePDF(to: fileURL) { context in
            context.beginPage()
            let cg = context.cgContext

            UIColor.white.setFill()
            cg.fill(bounds)

            let headerRect = CGRect(x: 36, y: 36, width: bounds.width - 72, height: 140)
            let colors = [UIColor(KDSTheme.accent).cgColor, UIColor(KDSTheme.primary).cgColor] as CFArray
            let colorSpace = CGColorSpaceCreateDeviceRGB()
            let gradient = CGGradient(colorsSpace: colorSpace, colors: colors, locations: [0, 1])!
            cg.saveGState()
            let path = UIBezierPath(roundedRect: headerRect, cornerRadius: 30)
            cg.addPath(path.cgPath)
            cg.clip()
            cg.drawLinearGradient(gradient, start: CGPoint(x: headerRect.minX, y: headerRect.minY), end: CGPoint(x: headerRect.maxX, y: headerRect.maxY), options: [])
            cg.restoreGState()

            let titleStyle = NSMutableParagraphStyle()
            titleStyle.alignment = .center

            let titleAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 15, weight: .bold),
                .foregroundColor: UIColor.white.withAlphaComponent(0.9),
                .paragraphStyle: titleStyle
            ]
            let headlineAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 30, weight: .heavy),
                .foregroundColor: UIColor.white,
                .paragraphStyle: titleStyle
            ]
            let bodyCenterAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 16, weight: .regular),
                .foregroundColor: UIColor(KDSTheme.muted),
                .paragraphStyle: titleStyle
            ]
            let nameAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 28, weight: .bold),
                .foregroundColor: UIColor(KDSTheme.ink),
                .paragraphStyle: titleStyle
            ]
            let strongAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 22, weight: .bold),
                .foregroundColor: UIColor(KDSTheme.accent),
                .paragraphStyle: titleStyle
            ]

            NSString(string: "CERTIFICATE OF COMPLETION").draw(in: CGRect(x: 70, y: 64, width: 472, height: 24), withAttributes: titleAttrs)
            NSString(string: "Knowledge Development Series").draw(in: CGRect(x: 70, y: 96, width: 472, height: 38), withAttributes: headlineAttrs)

            let centerY: CGFloat = 230
            NSString(string: recipientName.isEmpty ? "Learner Name" : recipientName).draw(in: CGRect(x: 60, y: centerY, width: 492, height: 40), withAttributes: nameAttrs)
            NSString(string: "For successfully completing the prescribed curriculum and assessments in").draw(in: CGRect(x: 60, y: centerY + 52, width: 492, height: 26), withAttributes: bodyCenterAttrs)
            NSString(string: item.courseTitle).draw(in: CGRect(x: 60, y: centerY + 84, width: 492, height: 34), withAttributes: strongAttrs)

            let infoLeft: CGFloat = 72
            let infoTop: CGFloat = 420
            let labelAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 11, weight: .semibold),
                .foregroundColor: UIColor(KDSTheme.muted)
            ]
            let valueAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.monospacedSystemFont(ofSize: 15, weight: .bold),
                .foregroundColor: UIColor(KDSTheme.ink)
            ]

            NSString(string: "Certificate Number").draw(in: CGRect(x: infoLeft, y: infoTop, width: 180, height: 16), withAttributes: labelAttrs)
            NSString(string: item.certificateNumber).draw(in: CGRect(x: infoLeft, y: infoTop + 20, width: 250, height: 20), withAttributes: valueAttrs)

            NSString(string: "Issued").draw(in: CGRect(x: infoLeft, y: infoTop + 58, width: 180, height: 16), withAttributes: labelAttrs)
            NSString(string: item.issuedAt.formatted(date: .long, time: .omitted)).draw(
                in: CGRect(x: infoLeft, y: infoTop + 78, width: 250, height: 20),
                withAttributes: [
                    .font: UIFont.systemFont(ofSize: 15, weight: .medium),
                    .foregroundColor: UIColor(KDSTheme.ink)
                ]
            )

            if let score = item.scorePercent {
                NSString(string: "Score").draw(in: CGRect(x: infoLeft, y: infoTop + 116, width: 180, height: 16), withAttributes: labelAttrs)
                NSString(string: "\(score)%").draw(
                    in: CGRect(x: infoLeft, y: infoTop + 136, width: 180, height: 20),
                    withAttributes: [
                        .font: UIFont.systemFont(ofSize: 15, weight: .bold),
                        .foregroundColor: UIColor(KDSTheme.success)
                    ]
                )
            }

            cg.setStrokeColor(UIColor(KDSTheme.border).cgColor)
            cg.setLineWidth(2)
            cg.move(to: CGPoint(x: 72, y: 670))
            cg.addLine(to: CGPoint(x: 230, y: 670))
            cg.strokePath()

            NSString(string: "Authorized Signatory").draw(in: CGRect(x: 72, y: 676, width: 160, height: 16), withAttributes: labelAttrs)
            NSString(string: "Prof. Douglas Boateng").draw(
                in: CGRect(x: 72, y: 692, width: 220, height: 20),
                withAttributes: [
                    .font: UIFont.systemFont(ofSize: 15, weight: .bold),
                    .foregroundColor: UIColor(KDSTheme.ink)
                ]
            )

            if let verifyURL = item.verifyURL,
               let qr = makeQRCode(from: verifyURL.absoluteString, size: 120) {
                qr.draw(in: CGRect(x: 428, y: 560, width: 110, height: 110))
                NSString(string: "Scan to verify").draw(
                    in: CGRect(x: 420, y: 678, width: 128, height: 16),
                    withAttributes: [
                        .font: UIFont.systemFont(ofSize: 10, weight: .medium),
                        .foregroundColor: UIColor(KDSTheme.muted),
                        .paragraphStyle: titleStyle
                    ]
                )
            }
        }

        return fileURL
    }

    static func makeQRCode(from string: String, size: CGFloat) -> UIImage? {
        guard let data = string.data(using: .utf8),
              let filter = CIFilter(name: "CIQRCodeGenerator") else {
            return nil
        }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }

        let scaleX = size / output.extent.size.width
        let scaleY = size / output.extent.size.height
        let transformed = output.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
        let context = CIContext()
        guard let cgImage = context.createCGImage(transformed, from: transformed.extent) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }
}

private func formatDuration(_ totalSeconds: Int) -> String {
    let minutes = max(0, totalSeconds) / 60
    let seconds = max(0, totalSeconds) % 60
    return String(format: "%02d:%02d", minutes, seconds)
}
