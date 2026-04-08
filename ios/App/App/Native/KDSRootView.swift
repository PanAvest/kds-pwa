import Foundation
import SwiftUI
import UIKit

private enum KDSDebugLaunchRoute {
    static var programSlug: String? {
        #if DEBUG
        let value = ProcessInfo.processInfo.environment["KDS_DEBUG_PROGRAM_SLUG"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let value, !value.isEmpty {
            return value
        }
        #endif
        return nil
    }

    static var ebookSlug: String? {
        #if DEBUG
        let value = ProcessInfo.processInfo.environment["KDS_DEBUG_EBOOK_SLUG"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let value, !value.isEmpty {
            return value
        }
        #endif
        return nil
    }
}

struct KDSRootView: View {
    @EnvironmentObject private var appState: KDSAppState
    @State private var showingSettings = false

    var body: some View {
        ZStack(alignment: .top) {
            content

            KDSOfflineBanner(visible: !appState.networkMonitor.isConnected)

            if let banner = appState.banner {
                VStack {
                    Spacer()
                    Text(banner)
                        .font(.system(size: 14, weight: .medium))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .background(KDSTheme.ink.opacity(0.92))
                        .foregroundColor(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .padding(.horizontal, 16)
                        .padding(.bottom, 22)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .onAppear {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3.2) {
                        withAnimation { appState.banner = nil }
                    }
                }
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.9), value: appState.banner)
        .sheet(isPresented: $showingSettings) {
            NavigationView {
                KDSSettingsView()
                    .environmentObject(appState)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") { showingSettings = false }
                        }
                    }
            }
        }
        .sheet(item: Binding(
            get: { appState.pendingVerifyCertificateID.map(VerifyRoute.init(id:)) },
            set: { appState.pendingVerifyCertificateID = $0?.id }
        )) { route in
            NavigationView {
                KDSVerifyView(initialCertificateID: route.id)
                    .environmentObject(appState)
                    .toolbar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Button("Done") { appState.pendingVerifyCertificateID = nil }
                        }
                    }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch appState.authState {
        case .bootstrapping:
            KDSSplashLaunchView(
                title: appState.launchStatus,
                progress: appState.launchProgress
            )
        case .misconfigured:
            KDSErrorStateView(
                title: "Native App Needs Configuration",
                message: "Add the missing values in Info.plist before using the SwiftUI app:\n\(appState.config.missingKeys.joined(separator: ", "))",
                retry: nil
            )
        case .signedOut:
            KDSAuthView()
                .environmentObject(appState)
        case .signedIn:
            if let debugProgramSlug = KDSDebugLaunchRoute.programSlug {
                NavigationView {
                    KDSProgramDashboardView(slug: debugProgramSlug)
                        .environmentObject(appState)
                }
                .accentColor(KDSTheme.primary)
                .kdsScreenBackground()
            } else if let debugEbookSlug = KDSDebugLaunchRoute.ebookSlug {
                NavigationView {
                    KDSDebugEbookReaderLaunchView(slug: debugEbookSlug)
                        .environmentObject(appState)
                }
                .accentColor(KDSTheme.primary)
                .kdsScreenBackground()
            } else {
                TabView(selection: $appState.activeTab) {
                    NavigationView {
                        KDSHomeView(onOpenSettings: { showingSettings = true })
                            .environmentObject(appState)
                    }
                    .tabItem { Label(KDSTab.home.title, systemImage: KDSTab.home.systemImage) }
                    .tag(KDSTab.home)

                    NavigationView {
                        KDSProgramsTabView()
                            .environmentObject(appState)
                    }
                    .tabItem { Label(KDSTab.programs.title, systemImage: KDSTab.programs.systemImage) }
                    .tag(KDSTab.programs)

                    NavigationView {
                        KDSEbooksTabView()
                            .environmentObject(appState)
                    }
                    .tabItem { Label(KDSTab.ebooks.title, systemImage: KDSTab.ebooks.systemImage) }
                    .tag(KDSTab.ebooks)

                    NavigationView {
                        KDSDashboardTabView(onOpenSettings: { showingSettings = true })
                            .environmentObject(appState)
                    }
                    .tabItem { Label(KDSTab.dashboard.title, systemImage: KDSTab.dashboard.systemImage) }
                    .tag(KDSTab.dashboard)
                }
                .accentColor(KDSTheme.primary)
                .kdsScreenBackground()
            }
        }
    }
}

private struct VerifyRoute: Identifiable {
    let id: String
}

private struct KDSDebugEbookReaderLaunchView: View {
    @EnvironmentObject private var appState: KDSAppState

    let slug: String

    @State private var ebook: EbookSummary?
    @State private var errorMessage: String?
    @State private var websiteAccessRequired = false

    var body: some View {
        Group {
            if let ebook {
                KDSEbookReaderView(ebook: ebook)
                    .environmentObject(appState)
            } else if websiteAccessRequired {
                KDSWebsiteAccessStateView(item: .ebook, website: appState.config.mainSiteURL)
            } else if let errorMessage {
                KDSErrorStateView(title: "E-Book Launch Failed", message: errorMessage) {
                    Task { await loadEbook() }
                }
            } else {
                KDSLoadingStateView(title: "Opening e-book…")
            }
        }
        .task {
            await loadEbook()
        }
    }

    private func loadEbook() async {
        guard ebook == nil else { return }
        errorMessage = nil
        websiteAccessRequired = false

        if let cachedLinkedEbooks = appState.diskStore.load([EbookSummary].self, named: "ebooks-linked.json"),
           let cachedMatch = cachedLinkedEbooks.first(where: { $0.slug == slug }) {
            ebook = cachedMatch
            return
        }

        guard let token = appState.session?.accessToken else {
            errorMessage = "Sign in to open the requested e-book."
            return
        }

        do {
            let linkedEbooks = try await appState.ebooksService.fetchLinkedEbooks(token: token)
            if let linkedMatch = linkedEbooks.first(where: { $0.slug == slug }) {
                ebook = linkedMatch
                return
            }

            let detail = try await appState.ebooksService.fetchEbook(slug: slug, token: token)
            ebook = EbookSummary(
                id: detail.id,
                slug: detail.slug,
                title: detail.title,
                descriptionText: detail.descriptionText,
                coverURL: detail.coverURL,
                priceCents: detail.priceCents ?? 0,
                published: detail.published,
                linkedStatus: nil
            )
        } catch {
            websiteAccessRequired = KDSIndicatesWebsiteManagedAccess(error)
            errorMessage = error.localizedDescription
        }
    }
}

struct KDSAuthView: View {
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var appState: KDSAppState
    @FocusState private var focusedField: AuthFocusField?
    @State private var mode: AuthMode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var fullName = ""
    @State private var dateOfBirth: Date?
    @State private var draftDateOfBirth = Calendar.current.date(byAdding: .year, value: -18, to: Date()) ?? Date()
    @State private var education = ""
    @State private var countryCode = ""
    @State private var showingPassword = false
    @State private var showingConfirmPassword = false
    @State private var showingReset = false
    @State private var showingDateOfBirthPicker = false
    @State private var submitting = false
    @State private var signUpStep = 0
    @State private var formError: String?
    @State private var formMessage: String?

    enum AuthMode: String, CaseIterable, Identifiable {
        case signIn = "Sign In"
        case signUp = "Create Account"
        var id: String { rawValue }
    }

    private enum AuthFocusField: Hashable {
        case signInEmail
        case signInPassword
        case signUpFullName
        case signUpEmail
        case signUpPassword
        case signUpConfirmPassword
    }

    private static let signUpSteps = [
        "Full name",
        "Date of birth",
        "Education",
        "Country",
        "Account"
    ]
    private static let educationOptions = [
        "Junior High School (JHS)",
        "Senior High School (SHS)",
        "Technical and Vocational Education and Training (TVET)",
        "Teacher Education Colleges",
        "Nursing and Health Training Colleges",
        "Tertiary Education",
        "Diploma",
        "Higher National Diploma (HND)",
        "Bachelor's Degree",
        "Postgraduate Diploma",
        "Master's Degree",
        "Doctorate (PhD)"
    ]
    private static let minimumBirthDate =
        Calendar.current.date(from: DateComponents(year: 1900, month: 1, day: 1)) ??
        Date(timeIntervalSince1970: -2_208_988_800)
    private static let displayDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .none
        return formatter
    }()
    private static let isoDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private var biometricButtonTitle: String {
        "Sign in with \(appState.biometricKind.displayName)"
    }

    private var normalizedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var passwordStrength: KDSPasswordCheck {
        KDSEvaluatePassword(password: password, email: normalizedEmail, fullName: fullName)
    }

    private var selectedCountry: KDSCountryOption? {
        KDSCountryOption.all.first(where: { $0.code == countryCode })
    }

    private var webAuthURL: URL? {
        guard let baseURL = appState.config.appBaseURL ?? appState.config.mainSiteURL else {
            return nil
        }
        return baseURL
            .appendingPathComponent("auth")
            .appendingPathComponent(mode == .signIn ? "sign-in" : "sign-up")
    }

    private var maxBirthDate: Date {
        Calendar.current.date(byAdding: .year, value: -13, to: Date()) ?? Date()
    }

    private var currentIntroCopy: String {
        switch mode {
        case .signIn:
            return "Sign in to open your linked programmes, e-books, certificates, and learning records."
        case .signUp:
            return "Create your account to enroll in knowledge programmes, open e-books, and track learning records."
        }
    }

    private var emailSeparatorCopy: String {
        mode == .signUp ? "or create with email" : "or sign in with email"
    }

    private var primaryButtonTitle: String {
        if submitting {
            return mode == .signIn ? "Signing In…" : "Creating Account…"
        }
        if mode == .signUp, signUpStep < Self.signUpSteps.count - 1 {
            return "Next"
        }
        return mode == .signIn ? "Continue" : "Create Account"
    }

    private var dateOfBirthText: String {
        guard let dateOfBirth else { return "Select your date of birth" }
        return Self.displayDateFormatter.string(from: dateOfBirth)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("PanAvest KDS")
                        .font(.system(size: 34, weight: .heavy, design: .rounded))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [KDSTheme.accent, KDSTheme.primary],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                    Text(currentIntroCopy)
                        .font(.system(size: 16))
                        .foregroundColor(KDSTheme.muted)
                        .lineSpacing(5)
                }
                .padding(.top, 36)

                VStack(spacing: 18) {
                    Picker("Mode", selection: $mode) {
                        ForEach(AuthMode.allCases) { item in
                            Text(item.rawValue).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)
                    .disabled(submitting)

                    if let webAuthURL {
                        VStack(spacing: 12) {
                            Button {
                                openURL(webAuthURL)
                            } label: {
                                Text("Continue with Google")
                            }
                            .buttonStyle(KDSSecondaryButtonStyle())
                            .disabled(submitting)

                            Text("Google authentication opens on the PanAvest website.")
                                .font(.system(size: 12))
                                .foregroundColor(KDSTheme.muted)

                            HStack(spacing: 12) {
                                Rectangle()
                                    .fill(KDSTheme.border.opacity(0.9))
                                    .frame(height: 1)
                                Text(emailSeparatorCopy)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundColor(KDSTheme.muted)
                                Rectangle()
                                    .fill(KDSTheme.border.opacity(0.9))
                                    .frame(height: 1)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 16) {
                        if mode == .signUp {
                            KDSAuthStepHeader(
                                currentStep: signUpStep,
                                totalSteps: Self.signUpSteps.count,
                                label: Self.signUpSteps[signUpStep]
                            )

                            signUpStepContent
                        } else {
                            signInFields
                        }

                        if let formError {
                            KDSAuthFeedbackBanner(message: formError, tone: .error)
                        } else if let formMessage {
                            KDSAuthFeedbackBanner(message: formMessage, tone: .success)
                        }

                        if mode == .signUp, signUpStep > 0 {
                            HStack(spacing: 12) {
                                Button("Back") {
                                    clearFormFeedback()
                                    withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
                                        signUpStep = max(0, signUpStep - 1)
                                    }
                                }
                                .buttonStyle(KDSSecondaryButtonStyle())
                                .disabled(submitting)

                                primaryActionButton
                            }
                        } else {
                            primaryActionButton
                        }

                        if appState.pushNotificationsAvailable {
                            Button(appState.pushEnabled ? "Notifications Enabled" : "Enable Notifications") {
                                Task { await appState.requestPushNotifications() }
                            }
                            .buttonStyle(KDSSecondaryButtonStyle())
                            .disabled(submitting || appState.pushEnabled)
                        }

                        if mode == .signIn && appState.canUseBiometricLogin {
                            Button {
                                clearFormFeedback()
                                Task {
                                    guard !submitting else { return }
                                    submitting = true
                                    await appState.signInWithBiometrics()
                                    if appState.authState == .signedOut {
                                        submitting = false
                                        consumeBannerAsInlineError()
                                    }
                                }
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: appState.biometricKind.symbolName)
                                        .font(.system(size: 17, weight: .semibold))
                                    Text(biometricButtonTitle)
                                }
                            }
                            .buttonStyle(KDSSecondaryButtonStyle())
                            .disabled(submitting)
                        }

                        if mode == .signIn {
                            Button("Reset Password") { showingReset = true }
                                .buttonStyle(KDSSecondaryButtonStyle())
                                .disabled(submitting)
                        }
                    }
                }
                .kdsCard()

                VStack(alignment: .leading, spacing: 12) {
                    Text("What you can do")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(KDSTheme.ink)
                    Text("Open linked programmes, continue your reading, track progress, manage certificates, and stay ready for updates.")
                        .font(.system(size: 15))
                        .foregroundColor(KDSTheme.muted)
                        .lineSpacing(4)
                }
                .kdsCard()
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 24)
        }
        .sheet(isPresented: $showingReset) {
            NavigationView {
                KDSPasswordResetView(prefilledEmail: email)
                    .environmentObject(appState)
            }
        }
        .sheet(isPresented: $showingDateOfBirthPicker) {
            NavigationView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Choose the learner's date of birth. PanAvest KDS requires learners to be at least 13 years old.")
                        .font(.system(size: 15))
                        .foregroundColor(KDSTheme.muted)
                        .lineSpacing(4)

                    DatePicker(
                        "Date of birth",
                        selection: $draftDateOfBirth,
                        in: Self.minimumBirthDate...maxBirthDate,
                        displayedComponents: .date
                    )
                    .datePickerStyle(.graphical)
                    .tint(KDSTheme.primary)
                    .labelsHidden()

                    Spacer(minLength: 0)
                }
                .padding(20)
                .navigationTitle("Date of Birth")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Cancel") {
                            showingDateOfBirthPicker = false
                        }
                    }
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") {
                            dateOfBirth = draftDateOfBirth
                            showingDateOfBirthPicker = false
                            formError = nil
                        }
                    }
                }
            }
        }
        .onAppear {
            if email.isEmpty && !appState.savedBiometricEmail.isEmpty {
                email = appState.savedBiometricEmail
            }
            updateFocusedField()
        }
        .onChange(of: mode) { _ in
            clearFormFeedback()
            showingPassword = false
            showingConfirmPassword = false
            focusedField = nil
            withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
                signUpStep = 0
            }
            if mode == .signIn && email.isEmpty && !appState.savedBiometricEmail.isEmpty {
                email = appState.savedBiometricEmail
            }
            updateFocusedField()
        }
        .onChange(of: signUpStep) { _ in
            updateFocusedField()
        }
        .overlay {
            if submitting {
                ZStack {
                    Color.white.opacity(0.52)
                        .ignoresSafeArea()

                    VStack(spacing: 14) {
                        ProgressView()
                            .scaleEffect(1.1)
                            .tint(KDSTheme.primary)

                        Text(mode == .signIn ? "Signing you in…" : "Creating your account…")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(KDSTheme.ink)
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 20)
                    .background(KDSTheme.surface.opacity(0.96))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20, style: .continuous)
                            .stroke(KDSTheme.border.opacity(0.9), lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                    .shadow(color: .black.opacity(0.08), radius: 18, x: 0, y: 10)
                }
                .transition(.opacity)
            }
        }
        .kdsScreenBackground()
    }

    @ViewBuilder
    private var signInFields: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Email")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(KDSTheme.ink)

                TextField("you@example.com", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .textContentType(.username)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focusedField, equals: .signInEmail)
                    .disabled(submitting)
                    .padding()
                    .background(KDSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .onSubmit {
                        focusedField = .signInPassword
                    }
            }

            passwordField(
                title: "Password",
                text: $password,
                isVisible: $showingPassword,
                submitLabel: .go,
                textContentType: .password,
                focusedCase: .signInPassword,
                nextFocusedCase: nil
            )
        }
    }

    @ViewBuilder
    private var signUpStepContent: some View {
        switch signUpStep {
        case 0:
            VStack(alignment: .leading, spacing: 8) {
                Text("Full name")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(KDSTheme.ink)
                TextField("Ama Mensah", text: $fullName)
                    .textInputAutocapitalization(.words)
                    .textContentType(.name)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .focused($focusedField, equals: .signUpFullName)
                    .disabled(submitting)
                    .padding()
                    .background(KDSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        case 1:
            VStack(alignment: .leading, spacing: 8) {
                Text("Date of birth")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(KDSTheme.ink)

                Button {
                    clearFormFeedback()
                    draftDateOfBirth = dateOfBirth ?? draftDateOfBirth
                    showingDateOfBirthPicker = true
                } label: {
                    HStack(spacing: 12) {
                        Text(dateOfBirthText)
                            .font(.system(size: 16))
                            .foregroundColor(dateOfBirth == nil ? KDSTheme.muted : KDSTheme.ink)
                        Spacer()
                        Image(systemName: "calendar")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(KDSTheme.primary)
                    }
                    .padding()
                    .background(KDSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(submitting)

                Text("You must be at least 13 years old.")
                    .font(.system(size: 12))
                    .foregroundColor(KDSTheme.muted)
            }
        case 2:
            VStack(alignment: .leading, spacing: 12) {
                Text("Highest educational qualification")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(KDSTheme.ink)

                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Self.educationOptions, id: \.self) { option in
                        Button {
                            education = option
                            formError = nil
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: education == option ? "largecircle.fill.circle" : "circle")
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(education == option ? KDSTheme.primary : KDSTheme.muted)
                                Text(option)
                                    .font(.system(size: 14))
                                    .foregroundColor(KDSTheme.ink)
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
                .background(KDSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                Text("Doctorate (PhD) is optional. Select the level that best fits you.")
                    .font(.system(size: 12))
                    .foregroundColor(KDSTheme.muted)
            }
        case 3:
            VStack(alignment: .leading, spacing: 8) {
                Text("Country")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(KDSTheme.ink)

                Picker(
                    "Country",
                    selection: Binding(
                        get: { countryCode },
                        set: { newValue in
                            countryCode = newValue
                            formError = nil
                        }
                    )
                ) {
                    Text("Select your country").tag("")
                    ForEach(KDSCountryOption.all) { option in
                        Text(option.displayName).tag(option.code)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(KDSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .tint(KDSTheme.ink)
            }
        default:
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Email")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(KDSTheme.ink)

                    TextField("you@example.com", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .textContentType(.emailAddress)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .focused($focusedField, equals: .signUpEmail)
                        .disabled(submitting)
                        .padding()
                        .background(KDSTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .onSubmit {
                            focusedField = .signUpPassword
                        }
                }

                passwordField(
                    title: "Password",
                    text: $password,
                    isVisible: $showingPassword,
                    submitLabel: .next,
                    textContentType: .newPassword,
                    focusedCase: .signUpPassword,
                    nextFocusedCase: .signUpConfirmPassword
                )

                passwordField(
                    title: "Confirm Password",
                    text: $confirmPassword,
                    isVisible: $showingConfirmPassword,
                    submitLabel: .go,
                    textContentType: .newPassword,
                    focusedCase: .signUpConfirmPassword,
                    nextFocusedCase: nil
                )

                KDSPasswordRulesCard(strength: passwordStrength)
            }
        }
    }

    private var primaryActionButton: some View {
        Button {
            handlePrimaryAction()
        } label: {
            HStack(spacing: 10) {
                if submitting {
                    ProgressView()
                        .tint(.white)
                }
                Text(primaryButtonTitle)
            }
        }
        .buttonStyle(KDSPrimaryButtonStyle())
        .disabled(submitting)
        .opacity(submitting ? 0.88 : 1)
    }

    private func passwordField(
        title: String,
        text: Binding<String>,
        isVisible: Binding<Bool>,
        submitLabel: SubmitLabel,
        textContentType: UITextContentType?,
        focusedCase: AuthFocusField,
        nextFocusedCase: AuthFocusField?
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(KDSTheme.ink)

            HStack(spacing: 12) {
                Group {
                    if isVisible.wrappedValue {
                        TextField(title, text: text)
                    } else {
                        SecureField(title, text: text)
                    }
                }
                .textInputAutocapitalization(.never)
                .textContentType(textContentType)
                .autocorrectionDisabled()
                .submitLabel(submitLabel)
                .focused($focusedField, equals: focusedCase)
                .disabled(submitting)
                .onSubmit {
                    if let nextFocusedCase {
                        focusedField = nextFocusedCase
                    } else {
                        handlePrimaryAction()
                    }
                }

                Button(isVisible.wrappedValue ? "Hide" : "Show") {
                    isVisible.wrappedValue.toggle()
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(KDSTheme.primary)
                .disabled(submitting)
            }
            .padding()
            .background(KDSTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private func handlePrimaryAction() {
        clearFormFeedback()

        switch mode {
        case .signIn:
            if let validationError = validateSignIn() {
                formError = validationError
                return
            }

            Task {
                guard !submitting else { return }
                focusedField = nil
                submitting = true
                await appState.signIn(email: normalizedEmail, password: password)
                if appState.authState == .signedOut {
                    submitting = false
                    consumeBannerAsInlineError()
                }
            }
        case .signUp:
            if let validationError = validateSignUpStep(signUpStep) {
                formError = validationError
                return
            }

            if signUpStep < Self.signUpSteps.count - 1 {
                withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
                    signUpStep += 1
                }
                return
            }

            guard let profile = makeSignUpProfile() else {
                formError = "Complete all required fields before creating the account."
                return
            }

            Task {
                guard !submitting else { return }
                focusedField = nil
                submitting = true
                let result = await appState.signUp(email: normalizedEmail, password: password, profile: profile)
                if appState.authState == .signedOut {
                    submitting = false
                    switch result {
                    case .verificationRequired(let message):
                        password = ""
                        confirmPassword = ""
                        showingPassword = false
                        showingConfirmPassword = false
                        withAnimation(.spring(response: 0.32, dampingFraction: 0.88)) {
                            mode = .signIn
                            signUpStep = 0
                        }
                        formMessage = message
                        appState.banner = nil
                        updateFocusedField()
                    default:
                        consumeBannerAsInlineError()
                    }
                }
            }
        }
    }

    private func validateSignIn() -> String? {
        if normalizedEmail.isEmpty {
            return "Email is required."
        }
        if password.isEmpty {
            return "Password is required."
        }
        return nil
    }

    private func validateSignUpStep(_ stepIndex: Int) -> String? {
        switch stepIndex {
        case 0:
            if fullName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return "Full name is required."
            }
        case 1:
            guard let dateOfBirth else {
                return "Date of birth is required."
            }
            if KDSAge(from: dateOfBirth) < 13 {
                return "You must be at least 13 years old."
            }
        case 2:
            if education.isEmpty {
                return "Select your highest educational qualification."
            }
        case 3:
            if countryCode.isEmpty {
                return "Select your country."
            }
        case 4:
            if normalizedEmail.isEmpty {
                return "Email is required."
            }
            if password.isEmpty {
                return "Password is required."
            }
            if !passwordStrength.issues.isEmpty {
                return "Update your password to meet our strength rules: \(passwordStrength.issues.joined(separator: "; "))"
            }
            if password != confirmPassword {
                return "Passwords do not match."
            }
        default:
            break
        }

        return nil
    }

    private func makeSignUpProfile() -> KDSSignUpProfile? {
        guard let dateOfBirth, let selectedCountry else {
            return nil
        }

        return KDSSignUpProfile(
            fullName: fullName.trimmingCharacters(in: .whitespacesAndNewlines),
            dateOfBirth: Self.isoDateFormatter.string(from: dateOfBirth),
            age: KDSAge(from: dateOfBirth),
            highestEducation: education,
            countryCode: selectedCountry.code,
            countryName: selectedCountry.name
        )
    }

    private func clearFormFeedback() {
        formError = nil
        formMessage = nil
    }

    private func consumeBannerAsInlineError() {
        guard let banner = appState.banner?.trimmingCharacters(in: .whitespacesAndNewlines),
              !banner.isEmpty else {
            return
        }
        formError = banner
        appState.banner = nil
    }

    private func updateFocusedField() {
        guard !submitting else { return }
        DispatchQueue.main.async {
            switch mode {
            case .signIn:
                focusedField = password.isEmpty ? .signInEmail : .signInPassword
            case .signUp:
                switch signUpStep {
                case 0:
                    focusedField = .signUpFullName
                case 4:
                    if email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        focusedField = .signUpEmail
                    } else if password.isEmpty {
                        focusedField = .signUpPassword
                    } else {
                        focusedField = .signUpConfirmPassword
                    }
                default:
                    focusedField = nil
                }
            }
        }
    }
}

private struct KDSAuthFeedbackBanner: View {
    enum Tone {
        case error
        case success
    }

    let message: String
    let tone: Tone

    private var backgroundColor: Color {
        switch tone {
        case .error:
            return Color.red.opacity(0.1)
        case .success:
            return KDSTheme.success.opacity(0.14)
        }
    }

    private var foregroundColor: Color {
        switch tone {
        case .error:
            return Color.red.opacity(0.92)
        case .success:
            return KDSTheme.success
        }
    }

    var body: some View {
        Text(message)
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(foregroundColor)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(backgroundColor)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct KDSAuthStepHeader: View {
    let currentStep: Int
    let totalSteps: Int
    let label: String

    private var progress: CGFloat {
        guard totalSteps > 0 else { return 0 }
        return CGFloat(currentStep + 1) / CGFloat(totalSteps)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                Text("Step \(currentStep + 1) of \(totalSteps): \(label)")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(KDSTheme.ink)
                Spacer(minLength: 0)
                Text("\(Int(progress * 100))%")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(KDSTheme.primary)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(KDSTheme.border.opacity(0.55))
                    Capsule()
                        .fill(KDSTheme.primary)
                        .frame(width: max(18, geometry.size.width * progress))
                }
            }
            .frame(height: 8)
        }
        .padding(14)
        .background(KDSTheme.surfaceMuted.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct KDSPasswordRulesCard: View {
    let strength: KDSPasswordCheck

    private var strengthColor: Color {
        strength.issues.isEmpty ? KDSTheme.success : KDSTheme.warning
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                Text("Password strength: \(strength.label)")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(strengthColor)
                Spacer(minLength: 0)
                Text("Follow the rules below.")
                    .font(.system(size: 12))
                    .foregroundColor(KDSTheme.muted)
            }

            if strength.issues.isEmpty {
                Text("Looks strong. Best practice: use a password manager and enable 2FA after sign-up.")
                    .font(.system(size: 13))
                    .foregroundColor(KDSTheme.success)
                    .lineSpacing(3)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(strength.issues, id: \.self) { issue in
                        HStack(alignment: .top, spacing: 8) {
                            Text("•")
                                .foregroundColor(KDSTheme.warning)
                            Text(issue)
                                .font(.system(size: 13))
                                .foregroundColor(KDSTheme.ink)
                                .lineSpacing(2)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(KDSTheme.surfaceMuted.opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct KDSCountryOption: Identifiable, Hashable {
    let code: String
    let name: String

    var id: String { code }

    var flag: String {
        let base: UInt32 = 127397
        return code.uppercased().unicodeScalars
            .compactMap { UnicodeScalar(base + $0.value) }
            .map(String.init)
            .joined()
    }

    var displayName: String {
        let decorated = "\(flag) \(name)".trimmingCharacters(in: .whitespacesAndNewlines)
        return decorated.isEmpty ? name : decorated
    }

    static let all: [KDSCountryOption] = {
        let locale = Locale(identifier: "en_US")
        return Locale.isoRegionCodes
            .compactMap { code -> KDSCountryOption? in
                guard let name = locale.localizedString(forRegionCode: code) else { return nil }
                return KDSCountryOption(code: code, name: name)
            }
            .sorted { lhs, rhs in
                lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
            }
    }()
}

private struct KDSPasswordCheck {
    let label: String
    let issues: [String]
}

private func KDSEvaluatePassword(password: String, email: String, fullName: String) -> KDSPasswordCheck {
    if password.isEmpty {
        return KDSPasswordCheck(
            label: "Weak",
            issues: [
                "Use at least 6 characters",
                "Mix uppercase, lowercase, numbers, and special symbols",
                "Avoid names, email, or common words",
                "Avoid repeats or easy sequences like 123456 or qwerty"
            ]
        )
    }

    var issues: [String] = []
    let lowercasedPassword = password.lowercased()
    let localEmail = email.split(separator: "@").first.map(String.init)?.lowercased() ?? ""
    let nameParts = fullName
        .lowercased()
        .split(whereSeparator: { $0.isWhitespace })
        .map(String.init)
        .filter { !$0.isEmpty }
    let specialCharacterSet = CharacterSet(charactersIn: "!@#$%^&*()[]{};:'\"\\\\|,.<>/?`~_-+=")
    let commonWords = ["password", "passw0rd", "admin", "welcome", "letmein", "iloveyou", "qwerty"]

    if password.count < 6 { issues.append("Use at least 6 characters (12+ recommended)") }
    if password.rangeOfCharacter(from: .uppercaseLetters) == nil { issues.append("Add uppercase letters (A-Z)") }
    if password.rangeOfCharacter(from: .lowercaseLetters) == nil { issues.append("Add lowercase letters (a-z)") }
    if password.rangeOfCharacter(from: .decimalDigits) == nil { issues.append("Include numbers (0-9)") }
    if password.rangeOfCharacter(from: specialCharacterSet) == nil { issues.append("Include special characters (! @ # $ % ^ & *)") }
    if Set(password).count == 1 { issues.append("Avoid repeating a single character") }
    if KDSHasSequentialPattern(password) { issues.append("Avoid predictable sequences (123456, abcdef)") }
    if nameParts.contains(where: { $0.count > 2 && lowercasedPassword.contains($0) }) {
        issues.append("Remove personal info such as your name")
    }
    if !localEmail.isEmpty && lowercasedPassword.contains(localEmail) {
        issues.append("Do not reuse your email in the password")
    }
    if commonWords.contains(where: { lowercasedPassword.contains($0) }) {
        issues.append("Avoid common words or keyboard patterns")
    }

    let label: String
    if issues.isEmpty && password.count >= 16 {
        label = "Very strong"
    } else if issues.isEmpty {
        label = "Strong"
    } else {
        label = "Weak"
    }

    return KDSPasswordCheck(label: label, issues: issues)
}

private func KDSHasSequentialPattern(_ password: String) -> Bool {
    let sequences = [
        "0123456789",
        "abcdefghijklmnopqrstuvwxyz",
        "qwertyuiopasdfghjklzxcvbnm"
    ]
    let lowercasedPassword = password.lowercased()

    return sequences.contains { sequence in
        guard sequence.count >= 3 else { return false }
        for index in 0...(sequence.count - 3) {
            let start = sequence.index(sequence.startIndex, offsetBy: index)
            let end = sequence.index(start, offsetBy: 3)
            if lowercasedPassword.contains(sequence[start..<end]) {
                return true
            }
        }
        return false
    }
}

private func KDSAge(from birthDate: Date, relativeTo currentDate: Date = Date()) -> Int {
    let calendar = Calendar(identifier: .gregorian)
    let components = calendar.dateComponents([.year], from: birthDate, to: currentDate)
    return max(components.year ?? 0, 0)
}

struct KDSSettingsView: View {
    @EnvironmentObject private var appState: KDSAppState
    @State private var showingAbout = false
    @State private var showingVerify = false
    @State private var showingReset = false

    var body: some View {
        List {
            Section("Account") {
                VStack(alignment: .leading, spacing: 4) {
                    Text(appState.displayName.isEmpty ? appState.userEmail : appState.displayName)
                        .font(.headline)
                    Text(appState.userEmail)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                Button("Reset Password") { showingReset = true }
                Button(role: .destructive) {
                    Task { await appState.signOut() }
                } label: {
                    Text("Sign Out")
                }
            }

            if appState.pushNotificationsAvailable {
                Section("Notifications") {
                    Button(appState.pushEnabled ? "Notifications Enabled" : "Enable Notifications") {
                        Task { await appState.requestPushNotifications() }
                    }
                    .disabled(appState.pushEnabled)
                }
            }

            Section("Explore") {
                Button("About KDS") { showingAbout = true }
                Button("Verify Certificate") { showingVerify = true }
                Link("Open PanAvest Website", destination: appState.config.mainSiteURL ?? URL(string: "https://www.panavestkds.com")!)
            }
        }
        .navigationTitle("Settings")
        .sheet(isPresented: $showingAbout) {
            NavigationView { KDSAboutView() }
        }
        .sheet(isPresented: $showingVerify) {
            NavigationView { KDSVerifyView(initialCertificateID: nil).environmentObject(appState) }
        }
        .sheet(isPresented: $showingReset) {
            NavigationView { KDSPasswordResetView(prefilledEmail: appState.userEmail).environmentObject(appState) }
        }
    }
}

struct KDSAboutView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("About KDS")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundColor(KDSTheme.ink)
                Text("Knowledge Development Series by PanAvest International & Partners delivers structured professional learning, assessments, verifiable certificates, and reference tools for modern professionals.")
                    .font(.system(size: 16))
                    .foregroundColor(KDSTheme.muted)
                    .lineSpacing(5)
                Group {
                    Text("What’s inside the app")
                        .font(.headline)
                    Text("• Programme dashboards and progress tracking\n• E-book reading with saved place restoration\n• Certificate previews and sharing\n• Fullscreen interactive learning\n• Account settings")
                        .foregroundColor(KDSTheme.muted)
                }
                Group {
                    Text("Access-only model")
                        .font(.headline)
                    Text("This iOS app lets learners access programs and ebooks already linked to their PanAvest KDS account. Purchases stay outside the app.")
                        .foregroundColor(KDSTheme.muted)
                }
            }
            .padding(20)
        }
        .navigationTitle("About")
        .kdsScreenBackground()
    }
}

struct KDSPasswordResetView: View {
    @EnvironmentObject private var appState: KDSAppState
    @Environment(\.dismiss) private var dismiss
    @State private var email: String

    init(prefilledEmail: String) {
        _email = State(initialValue: prefilledEmail)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Reset Password")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(KDSTheme.ink)
            Text("Send a password reset link to your email address.")
                .foregroundColor(KDSTheme.muted)

            TextField("Email", text: $email)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding()
                .background(KDSTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            Button("Send Reset Link") {
                Task {
                    await appState.requestPasswordReset(email: email)
                    dismiss()
                }
            }
            .buttonStyle(KDSPrimaryButtonStyle())

            Spacer()
        }
        .padding(20)
        .navigationTitle("Password Reset")
        .kdsScreenBackground()
    }
}

struct KDSVerifyView: View {
    @EnvironmentObject private var appState: KDSAppState
    @State private var certificateID: String
    @State private var snapshot: VerifySnapshot?
    @State private var message = ""
    @State private var loading = false

    init(initialCertificateID: String?) {
        _certificateID = State(initialValue: initialCertificateID ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Verify Certificate")
                    .font(.system(size: 30, weight: .bold))
                Text("Check a certificate against the KDS learning records.")
                    .foregroundColor(KDSTheme.muted)
                    .lineSpacing(4)

                TextField("Certificate ID", text: $certificateID)
                    .padding()
                    .background(KDSTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                Button("Verify") {
                    Task { await verify() }
                }
                .buttonStyle(KDSPrimaryButtonStyle())

                if loading {
                    ProgressView()
                        .tint(KDSTheme.primary)
                }

                if !message.isEmpty {
                    Text(message)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(KDSTheme.muted)
                }

                if let snapshot {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(snapshot.statusText)
                            .font(.headline)
                            .foregroundColor(KDSTheme.success)
                        Text(snapshot.courseTitle)
                            .font(.system(size: 24, weight: .bold))
                        Text("Certificate No: \(snapshot.certificateNumber)")
                        Text("Record ID: \(snapshot.certificateID)")
                        Text("Issued: \(snapshot.issuedAt.formatted(date: .abbreviated, time: .shortened))")
                        if let score = snapshot.scorePercent {
                            Text("Score: \(score)%")
                        }
                    }
                    .foregroundColor(KDSTheme.ink)
                    .kdsCard()
                }
            }
            .padding(20)
        }
        .navigationTitle("Verify")
        .task {
            if !certificateID.isEmpty {
                await verify()
            }
        }
        .kdsScreenBackground()
    }

    private func verify() async {
        guard !certificateID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        loading = true
        defer { loading = false }
        do {
            snapshot = try await appState.dashboardService.verifyCertificate(
                certId: certificateID,
                token: appState.session?.accessToken
            )
            message = snapshot == nil ? "No matching certificate record was found." : ""
        } catch {
            message = error.localizedDescription
        }
    }
}
