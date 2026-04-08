import ImageIO
import PDFKit
import SwiftUI
import UIKit

struct KDSRemoteImage: View {
    let urlString: String?
    let width: CGFloat
    let height: CGFloat
    var origin: KDSContentOrigin = .mainSite
    var cornerRadius: CGFloat = 24
    var showsGradient = false
    var contentMode: ContentMode = .fill

    @StateObject private var loader = KDSImageLoader()
    @State private var retrySeed = 0

    private var resolvedURL: URL? {
        KDSURLResolver.resolveImage(urlString, origin: origin)
    }

    var body: some View {
        ZStack {
            if let image = loader.image {
                loadedBackground
                    .frame(width: width, height: height)
                resolvedImageView(for: image)
            } else if loader.failed {
                placeholder
                    .frame(width: width, height: height)
                    .overlay(alignment: .bottomLeading) {
                        failureLabel
                            .padding(14)
                    }
            } else {
                placeholder
                    .frame(width: width, height: height)
                    .overlay {
                        ProgressView()
                            .tint(KDSTheme.primary)
                    }
            }
        }
        .frame(width: width, height: height)
        .clipped()
        .cornerRadius(cornerRadius)
        .overlay {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .stroke(KDSTheme.border.opacity(0.55), lineWidth: 1)
        }
        .overlay(alignment: .bottomLeading) {
            if showsGradient {
                LinearGradient(
                    colors: [.clear, .black.opacity(0.42)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .cornerRadius(cornerRadius)
            }
        }
        .task(id: "\(resolvedURL?.absoluteString ?? "none")-\(retrySeed)") {
            await loader.load(from: resolvedURL)
        }
    }

    private var loadedBackground: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(contentMode == .fit ? KDSTheme.surface : KDSTheme.surfaceMuted)
    }

    @ViewBuilder
    private func resolvedImageView(for image: UIImage) -> some View {
        if contentMode == .fit {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: width, height: height)
                .clipped()
                .transition(.opacity)
        } else {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: width, height: height)
                .clipped()
                .transition(.opacity)
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(KDSTheme.surfaceMuted)
            .overlay(KDSSkeletonBlock())
            .overlay {
                Image(systemName: "photo")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(KDSTheme.muted.opacity(0.7))
            }
    }

    private var failureLabel: some View {
        Button {
            retrySeed += 1
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 10, weight: .bold))
                Text("Retry image")
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.black.opacity(0.45))
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

@MainActor
final class KDSImageLoader: ObservableObject {
    @Published private(set) var image: UIImage?
    @Published private(set) var failed = false

    private var loadedURL: URL?

    func load(from url: URL?) async {
        guard let url else {
            image = nil
            failed = false
            loadedURL = nil
            return
        }

        if loadedURL == url, image != nil {
            return
        }

        if loadedURL != url {
            image = nil
        }
        failed = false
        loadedURL = url

        do {
            image = try await KDSImageRepository.shared.fetch(url: url)
            failed = false
        } catch {
            if loadedURL == url {
                image = nil
                failed = true
            }
        }
    }
}

final class KDSImageRepository {
    static let shared = KDSImageRepository()

    private let memoryCache = NSCache<NSURL, UIImage>()
    private let cacheQueue = DispatchQueue(label: "kds.image.cache")
    private let config: KDSConfig

    private init(config: KDSConfig = .current) {
        self.config = config
    }

    func fetch(url: URL) async throws -> UIImage {
        let key = url as NSURL
        let cached = cacheQueue.sync { memoryCache.object(forKey: key) }
        if let cached {
            return cached
        }

        let image = try await fetchImage(url: url, cachePolicy: .returnCacheDataElseLoad)
        cacheQueue.sync {
            memoryCache.setObject(image, forKey: key)
        }
        return image
    }

    private func fetchImage(url: URL, cachePolicy: URLRequest.CachePolicy) async throws -> UIImage {
        let request = KDSRemoteAssetLoader.makeRequest(
            url: url,
            accept: "image/*,*/*;q=0.8",
            cachePolicy: cachePolicy,
            config: config
        )

        if let cachedResponse = URLCache.shared.cachedResponse(for: request),
           let cachedImage = decodeImage(from: cachedResponse.data) {
            return cachedImage
        }

        do {
            let (data, response) = try await KDSRemoteAssetLoader.fetchData(
                url: url,
                accept: "image/*,*/*;q=0.8",
                cachePolicy: cachePolicy,
                config: config
            )
            guard let http = response as? HTTPURLResponse,
                  (200 ... 299).contains(http.statusCode),
                  let image = decodeImage(from: data) else {
                throw KDSAPIError.badResponse
            }

            URLCache.shared.storeCachedResponse(CachedURLResponse(response: response, data: data), for: request)
            return image
        } catch {
            guard cachePolicy != .reloadIgnoringLocalCacheData else { throw error }
            return try await fetchImage(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        }
    }

    private func decodeImage(from data: Data) -> UIImage? {
        if let image = UIImage(data: data) {
            return image
        }

        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            return nil
        }

        return UIImage(cgImage: cgImage)
    }
}

struct KDSBadge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(color.opacity(0.12))
            .foregroundColor(color)
            .clipShape(Capsule())
    }
}

struct KDSProgressBar: View {
    let value: Double

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(KDSTheme.surfaceMuted)
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [KDSTheme.accent, KDSTheme.primary],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: proxy.size.width * min(max(value, 0), 1))
            }
        }
        .frame(height: 10)
    }
}

struct KDSLoadingStateView: View {
    let title: String

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(.circular)
                .tint(KDSTheme.primary)
            Text(title)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(KDSTheme.muted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .kdsScreenBackground()
    }
}

struct KDSHiddenNavigationHeader: View {
    @Environment(\.dismiss) private var dismiss

    let title: String
    var subtitle: String? = nil

    var body: some View {
        ZStack {
            VStack(spacing: 3) {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(KDSTheme.ink)

                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(KDSTheme.muted)
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 64)

            HStack {
                Button(action: dismiss.callAsFunction) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(KDSTheme.ink)
                        .frame(width: 42, height: 42)
                        .background(KDSTheme.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(KDSTheme.border, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back")

                Spacer()
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(KDSTheme.background)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(KDSTheme.border.opacity(0.45))
                .frame(height: 1)
        }
    }
}

struct KDSSlimProgressBar: View {
    let value: Double

    @State private var animateMarker = false

    private var clampedValue: Double {
        min(max(value, 0), 1)
    }

    var body: some View {
        GeometryReader { proxy in
            let totalWidth = proxy.size.width
            let fillWidth = max(totalWidth * clampedValue, clampedValue > 0 ? 12 : 0)

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(KDSTheme.border.opacity(0.45))

                Capsule()
                    .fill(KDSTheme.primary)
                    .frame(width: fillWidth)
                    .overlay(alignment: .trailing) {
                        Circle()
                            .fill(KDSTheme.surface.opacity(0.95))
                            .frame(width: 8, height: 8)
                            .overlay(
                                Circle()
                                    .stroke(KDSTheme.primary.opacity(0.18), lineWidth: 5)
                            )
                            .scaleEffect(animateMarker ? 1.06 : 0.92)
                            .opacity(clampedValue > 0.01 ? 1 : 0)
                    }
            }
        }
        .frame(height: 4)
        .task {
            withAnimation(.easeInOut(duration: 1.05).repeatForever(autoreverses: true)) {
                animateMarker = true
            }
        }
    }
}

struct KDSSplashLaunchView: View {
    let title: String
    let progress: Double

    @State private var animateLogo = false
    @State private var displayedProgress = 0.04

    private var clampedProgress: Double {
        min(max(progress, 0), 1)
    }

    var body: some View {
        ZStack {
            KDSTheme.background
                .ignoresSafeArea()

            VStack(spacing: 26) {
                Spacer(minLength: 0)

                Image("splash")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 122, height: 122)
                    .shadow(color: KDSTheme.primary.opacity(0.12), radius: 18, x: 0, y: 10)
                    .scaleEffect(animateLogo ? 1.03 : 0.97)
                    .offset(y: animateLogo ? -6 : 0)

                VStack(spacing: 8) {
                    Text("Knowledge Development Series")
                        .font(.system(size: 28, weight: .heavy, design: .rounded))
                        .foregroundColor(KDSTheme.ink)
                        .multilineTextAlignment(.center)

                    Text("Powered by PanAvest International & Partners")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(KDSTheme.muted)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 28)

                VStack(spacing: 12) {
                    Text(title)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(KDSTheme.muted)
                        .multilineTextAlignment(.center)

                    KDSSlimProgressBar(value: displayedProgress)
                        .frame(width: min(UIScreen.main.bounds.width - 96, 220))
                }
                .padding(.horizontal, 28)

                Spacer(minLength: 0)
            }
            .padding(.vertical, 56)
        }
        .task {
            withAnimation(.easeInOut(duration: 1.3).repeatForever(autoreverses: true)) {
                animateLogo = true
            }

            withAnimation(.easeOut(duration: 0.35)) {
                displayedProgress = max(displayedProgress, min(clampedProgress, 0.08))
            }
        }
        .onChange(of: clampedProgress) { newValue in
            let delta = abs(newValue - displayedProgress)
            let duration = min(max(delta * 2.6, 0.3), 1.2)
            withAnimation(.easeInOut(duration: duration)) {
                displayedProgress = newValue
            }
        }
    }
}

struct KDSErrorStateView: View {
    let title: String
    let message: String
    let retry: (() -> Void)?

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 34))
                .foregroundColor(KDSTheme.warning)
            Text(title)
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(KDSTheme.ink)
            Text(message)
                .font(.system(size: 15))
                .foregroundColor(KDSTheme.muted)
                .multilineTextAlignment(.center)
            if let retry {
                Button("Try Again", action: retry)
                    .buttonStyle(KDSPrimaryButtonStyle())
                    .frame(maxWidth: 220)
            }
        }
        .padding(28)
        .kdsCard()
        .padding(24)
        .kdsScreenBackground()
    }
}

enum KDSWebsiteAccessItem {
    case ebook
    case program

    var title: String {
        "Access is managed on the website"
    }

    var detail: String {
        switch self {
        case .ebook:
            return "Purchase this e-book on the PanAvest KDS website, then return to the app to read it."
        case .program:
            return "Purchase or link this program on the PanAvest KDS website, then return to the app to continue learning."
        }
    }

    var actionTitle: String {
        switch self {
        case .ebook:
            return "Purchase on PanAvest KDS"
        case .program:
            return "Manage access on PanAvest KDS"
        }
    }
}

func KDSIndicatesWebsiteManagedAccess(_ error: Error) -> Bool {
    if let apiError = error as? KDSAPIError {
        switch apiError {
        case .forbidden, .decoding:
            return true
        case .http(_, let body):
            let normalized = body.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return normalized.contains("not linked")
                || normalized.contains("not purchased")
                || normalized.contains("not owned")
        default:
            break
        }
    }

    let normalized = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return normalized.contains("response decoding failed")
        || normalized.contains("not linked")
        || normalized.contains("not purchased")
        || normalized.contains("not owned")
}

struct KDSWebsiteAccessCard: View {
    let item: KDSWebsiteAccessItem
    let website: URL?

    private var destination: URL? {
        website ?? URL(string: "https://www.panavestkds.com")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(item.title)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(KDSTheme.ink)
            Text(item.detail)
                .font(.system(size: 15))
                .foregroundColor(KDSTheme.muted)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            if let destination {
                Link(item.actionTitle, destination: destination)
                    .frame(maxWidth: .infinity)
                    .buttonStyle(KDSSecondaryButtonStyle())
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .kdsCard()
    }
}

struct KDSWebsiteAccessStateView: View {
    let item: KDSWebsiteAccessItem
    let website: URL?

    var body: some View {
        KDSWebsiteAccessCard(item: item, website: website)
            .padding(24)
            .kdsScreenBackground()
    }
}

struct KDSOfflineBanner: View {
    let visible: Bool

    var body: some View {
        if visible {
            HStack(spacing: 12) {
                Image(systemName: "wifi.slash")
                    .foregroundColor(KDSTheme.warning)
                Text("Offline mode. Cached content is shown; progress will sync when you reconnect.")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(KDSTheme.ink)
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(KDSTheme.surface)
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(KDSTheme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .padding(.horizontal)
            .padding(.top, 8)
        }
    }
}

struct KDSSkeletonBlock: View {
    @State private var shimmerOffset: CGFloat = -1

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Rectangle()
                    .fill(KDSTheme.surfaceMuted.opacity(0.88))

                LinearGradient(
                    colors: [
                        .clear,
                        .white.opacity(0.44),
                        .clear
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                .rotationEffect(.degrees(12))
                .offset(x: shimmerOffset * max(proxy.size.width, 1) * 1.6)
            }
            .onAppear {
                withAnimation(.linear(duration: 1.05).repeatForever(autoreverses: false)) {
                    shimmerOffset = 1.2
                }
            }
        }
        .clipped()
    }
}

struct KDSHTMLTextView: View {
    let html: String

    var body: some View {
        Group {
            if let attributedText = attributedText {
                Text(attributedText)
            } else {
                Text(html.htmlStripped())
            }
        }
        .font(.system(size: 16))
        .foregroundColor(KDSTheme.ink)
        .lineSpacing(5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var attributedText: AttributedString? {
        if let data = html.data(using: .utf8),
           let attributed = try? NSMutableAttributedString(
                data: data,
                options: [
                    .documentType: NSAttributedString.DocumentType.html,
                    .characterEncoding: String.Encoding.utf8.rawValue
                ],
                documentAttributes: nil
           ) {
            attributed.addAttributes([
                .foregroundColor: UIColor(KDSTheme.ink),
                .font: UIFont.systemFont(ofSize: 16)
            ], range: NSRange(location: 0, length: attributed.length))
            return try? AttributedString(attributed, including: \.uiKit)
        }
        return nil
    }
}

final class KDSPDFViewController: ObservableObject {
    weak var pdfView: PDFView?
    @Published private(set) var zoomPercent = 100

    func attach(_ view: PDFView) {
        pdfView = view
        queueZoomPercentRefresh()
    }

    func goToPage(_ pageIndex: Int) {
        guard let pdfView,
              let document = pdfView.document else { return }
        let clampedIndex = max(0, min(pageIndex, max(0, document.pageCount - 1)))
        guard let page = document.page(at: clampedIndex) else { return }
        pdfView.go(to: page)
        queueZoomPercentRefresh()
    }

    func zoomIn() {
        adjustZoom(multiplier: 1.2)
    }

    func zoomOut() {
        adjustZoom(multiplier: 1 / 1.2)
    }

    func resetZoom() {
        guard let pdfView else { return }
        let fitScale = pdfView.scaleFactorForSizeToFit
        pdfView.scaleFactor = fitScale
        queueZoomPercentRefresh()
    }

    func refreshZoomPercent() {
        publishZoomPercent(currentZoomPercent())
    }

    func queueZoomPercentRefresh() {
        let nextZoomPercent = currentZoomPercent()
        DispatchQueue.main.async { [weak self] in
            self?.publishZoomPercent(nextZoomPercent)
        }
    }

    private func currentZoomPercent() -> Int {
        guard let pdfView else {
            return 100
        }
        let fitScale = max(pdfView.scaleFactorForSizeToFit, 0.01)
        let normalizedZoom = Int(round((pdfView.scaleFactor / fitScale) * 100))
        return max(25, normalizedZoom)
    }

    private func publishZoomPercent(_ nextZoomPercent: Int) {
        guard zoomPercent != nextZoomPercent else { return }
        zoomPercent = nextZoomPercent
    }

    private func adjustZoom(multiplier: CGFloat) {
        guard let pdfView else { return }
        let nextScale = min(max(pdfView.scaleFactor * multiplier, pdfView.minScaleFactor), pdfView.maxScaleFactor)
        pdfView.scaleFactor = nextScale
        queueZoomPercentRefresh()
    }
}

struct KDSPDFDocumentView: UIViewRepresentable {
    let document: PDFDocument
    let pageIndex: Int
    var controller: KDSPDFViewController? = nil
    let onPageChange: (Int) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onPageChange: onPageChange, controller: controller)
    }

    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayBox = .cropBox
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.displaysAsBook = false
        view.displaysPageBreaks = true
        view.backgroundColor = .clear
        view.usePageViewController(false, withViewOptions: nil)
        context.coordinator.configure(view: view, document: document, pageIndex: pageIndex)
        return view
    }

    func updateUIView(_ uiView: PDFView, context: Context) {
        context.coordinator.configure(view: uiView, document: document, pageIndex: pageIndex)
    }

    final class Coordinator: NSObject {
        private weak var pdfView: PDFView?
        private let onPageChange: (Int) -> Void
        private weak var controller: KDSPDFViewController?
        private var requestedPageIndex: Int?
        private var requestedPageDeadline: Date?
        private var lastReportedPageIndex: Int?

        init(onPageChange: @escaping (Int) -> Void, controller: KDSPDFViewController?) {
            self.onPageChange = onPageChange
            self.controller = controller
        }

        func configure(view: PDFView, document: PDFDocument, pageIndex: Int) {
            let isNewView = pdfView !== view
            if isNewView {
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(pageChanged(_:)),
                    name: Notification.Name.PDFViewPageChanged,
                    object: view
                )
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(scaleChanged(_:)),
                    name: Notification.Name.PDFViewScaleChanged,
                    object: view
                )
                pdfView = view
            }

            if view.document !== document {
                requestedPageIndex = max(0, pageIndex)
                requestedPageDeadline = Date().addingTimeInterval(0.75)
                lastReportedPageIndex = nil
                view.document = document
            }

            applyScaleBounds(to: view, resetScale: isNewView)
            goToPage(pageIndex, in: view)
            if isNewView || controller?.pdfView !== view {
                controller?.attach(view)
            } else {
                controller?.queueZoomPercentRefresh()
            }
        }

        @objc func pageChanged(_ note: Notification) {
            guard let view = pdfView,
                  let document = view.document,
                  let currentPage = view.currentPage else { return }
            let currentIndex = document.index(for: currentPage)
            expireRequestedPageIfNeeded()

            if let requestedPageIndex {
                if currentIndex != requestedPageIndex {
                    if requestedPageDeadline != nil {
                        scheduleNavigation(to: requestedPageIndex, in: view)
                    }
                    return
                }
            }

            guard lastReportedPageIndex != currentIndex else {
                controller?.queueZoomPercentRefresh()
                return
            }

            lastReportedPageIndex = currentIndex
            onPageChange(currentIndex)
            controller?.queueZoomPercentRefresh()
        }

        @objc func scaleChanged(_ note: Notification) {
            controller?.queueZoomPercentRefresh()
        }

        private func goToPage(_ pageIndex: Int, in view: PDFView) {
            guard let document = view.document else { return }
            let clampedIndex = max(0, min(pageIndex, max(0, document.pageCount - 1)))
            guard document.page(at: clampedIndex) != nil else { return }
            let currentPageIndex = view.currentPage.map { document.index(for: $0) }
            requestedPageIndex = clampedIndex
            requestedPageDeadline = Date().addingTimeInterval(0.75)
            if currentPageIndex == clampedIndex {
                lastReportedPageIndex = clampedIndex
            } else {
                scheduleNavigation(to: clampedIndex, in: view)
            }
        }

        private func scheduleNavigation(to pageIndex: Int, in view: PDFView) {
            DispatchQueue.main.async { [weak self, weak view] in
                guard let self,
                      let view,
                      let document = view.document,
                      let refreshedPage = document.page(at: pageIndex),
                      self.requestedPageIndex == pageIndex else { return }
                view.go(to: refreshedPage)
            }
        }

        private func expireRequestedPageIfNeeded() {
            guard let requestedPageDeadline, Date() >= requestedPageDeadline else { return }
            requestedPageIndex = nil
            self.requestedPageDeadline = nil
        }

        private func applyScaleBounds(to view: PDFView, resetScale: Bool) {
            let fitScale = max(view.scaleFactorForSizeToFit, 0.25)
            view.minScaleFactor = fitScale
            view.maxScaleFactor = max(5, fitScale * 6)
            if resetScale || view.scaleFactor < fitScale {
                view.scaleFactor = fitScale
            }
            controller?.queueZoomPercentRefresh()
        }

        deinit {
            NotificationCenter.default.removeObserver(self)
        }
    }
}

struct KDSActivitySheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct KDSInteractivePopGestureEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController {
        PopGestureViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        guard let controller = uiViewController as? PopGestureViewController else { return }
        controller.enableInteractivePopIfNeeded()
    }

    private final class PopGestureViewController: UIViewController {
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            enableInteractivePopIfNeeded()
        }

        func enableInteractivePopIfNeeded() {
            guard let navigationController else { return }
            navigationController.interactivePopGestureRecognizer?.isEnabled = navigationController.viewControllers.count > 1
            navigationController.interactivePopGestureRecognizer?.delegate = nil
        }
    }
}

extension View {
    func kdsEnableSwipeBack() -> some View {
        background(
            KDSInteractivePopGestureEnabler()
                .frame(width: 0, height: 0)
        )
    }
}
