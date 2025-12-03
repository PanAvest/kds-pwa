//
//  MainViewController.swift
//  App
//
//  Created by Prof Douglas on 13/11/2025.
//

import UIKit
import Capacitor
import WebKit

@objc(MainViewController)
class MainViewController: CAPBridgeViewController {

    private let statusBarCover = UIView()
    private let bottomBar     = UIView()
    private let bottomBorder  = UIView()
    private let tabStack      = UIStackView()

    // Simple loading overlay
    private let loadingOverlay = UIView()
    private let loadingSpinner = UIActivityIndicatorView(style: .medium)

    // Track if we've attached the webview observer
    private var observingWebViewProgress = false
    private var splashViewController: SplashViewController?
    private var hasHiddenSplash = false
    private var webReadyEventReceived = false
    private weak var originalNavigationDelegate: WKNavigationDelegate?
    private weak var originalUIDelegate: WKUIDelegate?
    private var hasSentNativeReadyEvent = false
    private let webReadyMessageHandlerName = "kdsWebReady"

    // 0 = Home, 1 = Courses, 2 = E-Books, 3 = Dashboard
    private var currentTab: Int = 0

    // Brand colors (match CSS)
    private let bgColor    = UIColor(red: 0xFE/255.0, green: 0xFD/255.0, blue: 0xFA/255.0, alpha: 1.0)
    private let textDark   = UIColor(red: 0x2C/255.0, green: 0x25/255.0, blue: 0x22/255.0, alpha: 1.0)
    private let accentRed  = UIColor(red: 0xB6/255.0, green: 0x54/255.0, blue: 0x37/255.0, alpha: 1.0)
    private let softBorder = UIColor(red: 0xD0/255.0, green: 0xC5/255.0, blue: 0xBE/255.0, alpha: 1.0)

    private let bottomBarHeight: CGFloat = 100.0
    private var hasLoadedInitialPath = false

    override func viewDidLoad() {
        super.viewDidLoad()

        // Force light mode so dark mode never makes top/bottom black
        if #available(iOS 13.0, *) {
            overrideUserInterfaceStyle = .light
        }

        view.backgroundColor = bgColor

        setupStatusBarBackground()
        setupBottomBar()
        setupLoadingOverlay()
        showSplashScreen()
        installWebReadyMessageHandler()
        attachNavigationDelegate()

        updateTabSelection()
        applyInsetsToWebView()
        injectViewportAndSelectionJS()
        loadInitialPathIfNeeded()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        injectViewportAndSelectionJS()
        setupWebViewProgressObserver()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        applyInsetsToWebView()
    }

    deinit {
        // Clean up observer
        if observingWebViewProgress, let webView = bridge?.webView as? WKWebView {
            webView.removeObserver(self, forKeyPath: "estimatedProgress")
        }
        if let webView = bridge?.webView as? WKWebView {
            webView.configuration.userContentController.removeScriptMessageHandler(forName: webReadyMessageHandlerName)
        }
    }

    // MARK: - Top background (only behind notch / status bar)

    private func setupStatusBarBackground() {
        let safe = view.safeAreaLayoutGuide

        statusBarCover.translatesAutoresizingMaskIntoConstraints = false
        statusBarCover.backgroundColor = bgColor
        view.addSubview(statusBarCover)

        NSLayoutConstraint.activate([
            statusBarCover.topAnchor.constraint(equalTo: view.topAnchor),
            statusBarCover.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            statusBarCover.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            statusBarCover.bottomAnchor.constraint(equalTo: safe.topAnchor)
        ])
    }

    // MARK: - Bottom Nav

    private func setupBottomBar() {
        let safe = view.safeAreaLayoutGuide

        bottomBar.translatesAutoresizingMaskIntoConstraints = false
        bottomBar.backgroundColor = .systemBackground
        bottomBar.clipsToBounds = true   // prevent icons bleeding out of the bar

        view.addSubview(bottomBar)

        NSLayoutConstraint.activate([
            bottomBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            bottomBar.heightAnchor.constraint(equalToConstant: bottomBarHeight)
        ])

        // Top divider line
        bottomBorder.translatesAutoresizingMaskIntoConstraints = false
        bottomBorder.backgroundColor = softBorder
        bottomBar.addSubview(bottomBorder)

        NSLayoutConstraint.activate([
            bottomBorder.topAnchor.constraint(equalTo: bottomBar.topAnchor),
            bottomBorder.leadingAnchor.constraint(equalTo: bottomBar.leadingAnchor),
            bottomBorder.trailingAnchor.constraint(equalTo: bottomBar.trailingAnchor),
            bottomBorder.heightAnchor.constraint(equalToConstant: 0.5)
        ])

        tabStack.translatesAutoresizingMaskIntoConstraints = false
        tabStack.axis = .horizontal
        tabStack.distribution = .fillEqually
        tabStack.alignment = .fill
        tabStack.isLayoutMarginsRelativeArrangement = true
        // little padding so content sits nicely inside the bar
        tabStack.layoutMargins = UIEdgeInsets(top: 4, left: 8, bottom: 6, right: 8)

        bottomBar.addSubview(tabStack)

        NSLayoutConstraint.activate([
            tabStack.topAnchor.constraint(equalTo: bottomBorder.bottomAnchor),
            tabStack.bottomAnchor.constraint(equalTo: bottomBar.bottomAnchor),
            tabStack.leadingAnchor.constraint(equalTo: bottomBar.leadingAnchor),
            tabStack.trailingAnchor.constraint(equalTo: bottomBar.trailingAnchor)
        ])

        addTab(title: "Home",      imageName: "tab-home",      tag: 0)
        addTab(title: "Programs",  imageName: "tab-programs",  tag: 1)
        addTab(title: "E-Books",   imageName: "tab-ebooks",    tag: 2)
        addTab(title: "Dashboard", imageName: "tab-dashboard", tag: 3)
    }

    /// Creates a tab item with icon above label, centered.
    /// Whole control is tappable; inner stack does not intercept touches.
    private func addTab(title: String, imageName: String, tag: Int) {
        let tabControl = UIControl()
        tabControl.tag = tag

        let vStack = UIStackView()
        vStack.axis = .vertical
        vStack.alignment = .center
        vStack.spacing = 2
        vStack.translatesAutoresizingMaskIntoConstraints = false
        vStack.isUserInteractionEnabled = false // let the UIControl handle all touches

        // Icon
        let imageView = UIImageView()
        if let icon = UIImage(named: imageName)?.withRenderingMode(.alwaysTemplate) {
            imageView.image = icon
        }
        imageView.tintColor = softBorder
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            imageView.widthAnchor.constraint(equalToConstant: 22),
            imageView.heightAnchor.constraint(equalToConstant: 22)
        ])

        // Label
        let label = UILabel()
        label.text = title
        label.font = UIFont.systemFont(ofSize: 11, weight: .medium)
        label.textColor = UIColor.darkGray
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        vStack.addArrangedSubview(imageView)
        vStack.addArrangedSubview(label)

        tabControl.addSubview(vStack)
        NSLayoutConstraint.activate([
            vStack.centerXAnchor.constraint(equalTo: tabControl.centerXAnchor),
            vStack.centerYAnchor.constraint(equalTo: tabControl.centerYAnchor)
        ])

        tabControl.addTarget(self, action: #selector(tabTapped(_:)), for: .touchUpInside)
        tabStack.addArrangedSubview(tabControl)
    }

    private func updateTabSelection() {
        for case let control as UIControl in tabStack.arrangedSubviews {
            let isActive = (control.tag == currentTab)
            let color = isActive ? accentRed : UIColor.darkGray

            if let stack = control.subviews.first as? UIStackView {
                if let imageView = stack.arrangedSubviews.first as? UIImageView {
                    imageView.tintColor = color
                }
                if stack.arrangedSubviews.count > 1,
                   let label = stack.arrangedSubviews[1] as? UILabel {
                    label.textColor = color
                }
            }
        }
    }

    private func path(forTab tag: Int) -> String {
        switch tag {
        case 0: return "/"          // Home
        case 1: return "/courses"   // Courses
        case 2: return "/ebooks"    // E-Books
        case 3: return "/dashboard" // Dashboard
        default: return "/"
        }
    }

    /// Navigate within the existing WKWebView to the provided path on the configured server.
    private func loadPath(_ path: String) {
        guard let webView = bridge?.webView as? WKWebView else { return }
        guard let baseURL = bridge?.config.serverURL else { return }

        let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
        let trimmedPathComponent = String(normalizedPath.drop(while: { $0 == "/" }))
        let destinationURL = baseURL.appendingPathComponent(trimmedPathComponent)
        let request = URLRequest(url: destinationURL)

        // Prefer in-app JS navigation to avoid recreating the webview.
        let js = "window.location.href = '\(normalizedPath)'"
        webView.evaluateJavaScript(js) { [weak webView] _, error in
            if error != nil {
                webView?.load(request)
            }
        }
    }

    private func loadInitialPathIfNeeded() {
        guard !hasLoadedInitialPath else { return }
        hasLoadedInitialPath = true
        loadPath("/")
    }

    @objc private func tabTapped(_ sender: UIControl) {
        currentTab = sender.tag
        updateTabSelection()
        showLoadingOverlay()  // show immediately on tab tap

        let path = path(forTab: sender.tag)
        loadPath(path)
    }

    // MARK: - Loading overlay

    private func setupLoadingOverlay() {
        loadingOverlay.translatesAutoresizingMaskIntoConstraints = false
        loadingOverlay.backgroundColor = UIColor(white: 1.0, alpha: 0.6)
        loadingOverlay.isHidden = true

        loadingSpinner.translatesAutoresizingMaskIntoConstraints = false
        loadingSpinner.hidesWhenStopped = true

        loadingOverlay.addSubview(loadingSpinner)
        view.addSubview(loadingOverlay)

        NSLayoutConstraint.activate([
            loadingOverlay.topAnchor.constraint(equalTo: view.topAnchor),
            loadingOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            loadingOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            loadingOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            loadingSpinner.centerXAnchor.constraint(equalTo: loadingOverlay.centerXAnchor),
            loadingSpinner.centerYAnchor.constraint(equalTo: loadingOverlay.centerYAnchor)
        ])
    }

    private func showLoadingOverlay() {
        loadingOverlay.isHidden = false
        loadingSpinner.startAnimating()
        view.bringSubviewToFront(loadingOverlay)
        view.bringSubviewToFront(bottomBar)  // keep nav above the overlay
    }

    private func hideLoadingOverlay() {
        loadingSpinner.stopAnimating()
        loadingOverlay.isHidden = true
    }

    // MARK: - WebView Insets: keep content above bottom nav, no extra top gap

    private func applyInsetsToWebView() {
        guard let webView = bridge?.webView as? WKWebView else {
            return
        }

        // Keep overlays on top visually
        view.bringSubviewToFront(statusBarCover)
        view.bringSubviewToFront(bottomBar)
        view.bringSubviewToFront(loadingOverlay)

        let safeBottom: CGFloat = view.safeAreaInsets.bottom
        let extraPadding: CGFloat = 4.0
        let bottomInset = safeBottom + extraPadding
        let inset = UIEdgeInsets(top: 0, left: 0, bottom: bottomInset, right: 0)

        webView.scrollView.contentInset = inset
        webView.scrollView.scrollIndicatorInsets = inset
    }

    // MARK: - Splash handling

    private func showSplashScreen() {
        guard splashViewController == nil else { return }

        let splashVC = SplashViewController()
        splashVC.modalPresentationStyle = .fullScreen
        splashVC.modalTransitionStyle = .crossDissolve
        splashViewController = splashVC

        DispatchQueue.main.async { [weak self] in
            self?.present(splashVC, animated: false, completion: nil)
        }
    }

    private func hideSplashScreenIfReady() {
        guard !hasHiddenSplash,
              webReadyEventReceived,
              let splashVC = splashViewController else { return }
        hasHiddenSplash = true
        splashVC.fadeOutAndDismiss()
        splashViewController = nil
    }

    // MARK: - Web ready bridge

    private func installWebReadyMessageHandler() {
        guard let webView = bridge?.webView as? WKWebView else { return }

        let controller = webView.configuration.userContentController
        controller.removeScriptMessageHandler(forName: webReadyMessageHandlerName)
        controller.add(self, name: webReadyMessageHandlerName)

        let listenerScript = """
        (function() {
          if (window.__kdsReadyBridgeInstalled) { return; }
          window.__kdsReadyBridgeInstalled = true;
          function notifyNative() {
            if (window.__KDS_WEB_READY !== true) { return; }
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(webReadyMessageHandlerName)) {
              window.webkit.messageHandlers.\(webReadyMessageHandlerName).postMessage('ready');
            }
          }
          window.addEventListener('kdsWebReady', function() { notifyNative(); });
          if (window.__KDS_WEB_READY === true) { notifyNative(); }
        })();
        """

        let userScript = WKUserScript(source: listenerScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        controller.addUserScript(userScript)
        webView.evaluateJavaScript(listenerScript, completionHandler: nil)
    }

    private func attachNavigationDelegate() {
        guard let webView = bridge?.webView as? WKWebView else { return }
        originalNavigationDelegate = webView.navigationDelegate
        originalUIDelegate = webView.uiDelegate
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsLinkPreview = false
    }

    private func sendNativeReadyEventToWebView() {
        guard !hasSentNativeReadyEvent else { return }
        hasSentNativeReadyEvent = true
        bridge?.webView?.evaluateJavaScript("window.dispatchEvent(new Event('kdsWebReady'))", completionHandler: nil)
    }

    private func notifyOffline() {
        bridge?.webView?.evaluateJavaScript("window.dispatchEvent(new Event('capacitorOffline'))", completionHandler: nil)
    }

    // MARK: - Observe WKWebView progress to show/hide loader for ALL navigations

    private func setupWebViewProgressObserver() {
        guard !observingWebViewProgress,
              let webView = bridge?.webView as? WKWebView else {
            return
        }

        observingWebViewProgress = true
        webView.addObserver(self, forKeyPath: "estimatedProgress", options: [.new], context: nil)
    }

    override func observeValue(
        forKeyPath keyPath: String?,
        of object: Any?,
        change: [NSKeyValueChangeKey : Any]?,
        context: UnsafeMutableRawPointer?
    ) {
        if keyPath == "estimatedProgress",
           let webView = object as? WKWebView {
            let progress = webView.estimatedProgress
            // When progress starts (<1) show loader, when it completes, hide
            if progress < 1.0 {
                showLoadingOverlay()
            } else {
                hideLoadingOverlay()
            }
        } else {
            super.observeValue(forKeyPath: keyPath, of: object, change: change, context: context)
        }
    }

    // MARK: - Disable zoom, tap highlight & text selection (except inputs)

    private func injectViewportAndSelectionJS() {
        guard let webView = bridge?.webView as? WKWebView else { return }

        let js = """
        (function(){
          try {
            // Lock viewport (no pinch / double-tap zoom, no keyboard zoom)
            var meta = document.querySelector('meta[name="viewport"]');
            var content = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no';
            if (meta) {
              meta.setAttribute('content', content);
            } else {
              meta = document.createElement('meta');
              meta.name = 'viewport';
              meta.content = content;
              document.head.appendChild(meta);
            }

            // Global "app-like" CSS: no highlight, no selection, no long-press menu
            var style = document.createElement('style');
            style.innerHTML = `
              html, body {
                overscroll-behavior: none;
                touch-action: manipulation;
              }
              * {
                -webkit-user-select: none !important;
                -webkit-touch-callout: none !important;
                user-select: none !important;
                -webkit-tap-highlight-color: rgba(0,0,0,0) !important;
              }
              input, textarea, [contenteditable="true"] {
                -webkit-user-select: auto !important;
                user-select: auto !important;
                -webkit-touch-callout: default !important;
              }
            `;
            document.head.appendChild(style);
          } catch (e) {
            console.log('KDS iOS inject error', e);
          }
        })();
        """

        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

// MARK: - WKNavigationDelegate & WKScriptMessageHandler

extension MainViewController: WKNavigationDelegate, WKScriptMessageHandler, WKUIDelegate {

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        originalNavigationDelegate?.webView?(webView, didStartProvisionalNavigation: navigation)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        originalNavigationDelegate?.webView?(webView, didCommit: navigation)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        originalNavigationDelegate?.webView?(webView, didFinish: navigation)
        sendNativeReadyEventToWebView()
        hideSplashScreenIfReady()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        originalNavigationDelegate?.webView?(webView, didFail: navigation, withError: error)
        notifyOffline()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        originalNavigationDelegate?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        notifyOffline()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        originalNavigationDelegate?.webViewWebContentProcessDidTerminate?(webView)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let delegate = originalNavigationDelegate,
           delegate.responds(to: Selector(("webView:decidePolicyForNavigationAction:decisionHandler:"))) {
            delegate.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let delegate = originalNavigationDelegate,
           delegate.responds(to: Selector(("webView:decidePolicyForNavigationResponse:decisionHandler:"))) {
            delegate.webView?(webView, decidePolicyFor: navigationResponse, decisionHandler: decisionHandler)
        } else {
            decisionHandler(.allow)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == webReadyMessageHandlerName {
            webReadyEventReceived = true
            hideSplashScreenIfReady()
        }
    }

    // MARK: - Context menu / link preview suppression

    func webView(_ webView: WKWebView, shouldPreviewElement elementInfo: WKPreviewElementInfo) -> Bool {
        return false
    }

    func webView(_ webView: WKWebView, previewingViewControllerForElement elementInfo: WKPreviewElementInfo, defaultActions previewActions: [WKPreviewActionItem]) -> UIViewController? {
        return nil
    }

    @available(iOS 13.0, *)
    func webView(_ webView: WKWebView, contextMenuConfigurationForElement elementInfo: WKContextMenuElementInfo, completionHandler: @escaping (UIContextMenuConfiguration?) -> Void) {
        completionHandler(nil)
    }

    @available(iOS 13.0, *)
    func webView(_ webView: WKWebView, contextMenuForElement elementInfo: WKContextMenuElementInfo) -> UIContextMenuConfiguration? {
        return nil
    }
}
