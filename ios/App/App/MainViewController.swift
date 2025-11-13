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
    private let headerView    = UIView()
    private let titleLabel    = UILabel()
    private let bottomBar     = UIView()
    private let tabStack      = UIStackView()

    // 0 = Home, 1 = Programs, 2 = E-Books, 3 = Dashboard
    private var currentTab: Int = 0

    // Brand colors (match your CSS)
    private let bgColor    = UIColor(red: 0xFE/255.0, green: 0xFD/255.0, blue: 0xFA/255.0, alpha: 1.0)
    private let textDark   = UIColor(red: 0x2C/255.0, green: 0x25/255.0, blue: 0x22/255.0, alpha: 1.0)
    private let accentRed  = UIColor(red: 0xB6/255.0, green: 0x54/255.0, blue: 0x37/255.0, alpha: 1.0)
    private let softBorder = UIColor(red: 0xD0/255.0, green: 0xC5/255.0, blue: 0xBE/255.0, alpha: 1.0)

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()

        // Force light mode so dark mode doesn't make things black
        if #available(iOS 13.0, *) {
            overrideUserInterfaceStyle = .light
        }

        view.backgroundColor = bgColor

        setupHeader()
        setupBottomBar()
        updateTabSelection()

        // Initial insets + behavior
        applyInsetsToWebView()
        injectViewportAndSelectionJS()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Re-inject in case the webview reloaded
        injectViewportAndSelectionJS()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        applyInsetsToWebView()
    }

    // MARK: - Header + Status Area

    private func setupHeader() {
        let safe = view.safeAreaLayoutGuide

        // Cover the area ABOVE the safe area (notch/status bar) with brand color
        statusBarCover.translatesAutoresizingMaskIntoConstraints = false
        statusBarCover.backgroundColor = bgColor
        view.addSubview(statusBarCover)

        NSLayoutConstraint.activate([
            statusBarCover.topAnchor.constraint(equalTo: view.topAnchor),
            statusBarCover.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            statusBarCover.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            statusBarCover.bottomAnchor.constraint(equalTo: safe.topAnchor)
        ])

        // Actual header just under the safe area
        headerView.translatesAutoresizingMaskIntoConstraints = false
        headerView.backgroundColor = bgColor

        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = "KDS Learning"
        titleLabel.font = UIFont.systemFont(ofSize: 18, weight: .semibold)
        titleLabel.textColor = textDark

        headerView.addSubview(titleLabel)
        view.addSubview(headerView)

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: safe.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            headerView.heightAnchor.constraint(equalToConstant: 56),

            titleLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),
            titleLabel.leadingAnchor.constraint(equalTo: headerView.leadingAnchor, constant: 16)
        ])
    }

    // MARK: - Bottom Nav

    private func setupBottomBar() {
        bottomBar.translatesAutoresizingMaskIntoConstraints = false
        bottomBar.backgroundColor = .white
        bottomBar.layer.borderColor = softBorder.cgColor
        bottomBar.layer.borderWidth = 0.5

        view.addSubview(bottomBar)

        // Anchor to the REAL bottom so it covers the home indicator area as well
        NSLayoutConstraint.activate([
            bottomBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            bottomBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomBar.heightAnchor.constraint(equalToConstant: 64)
        ])

        tabStack.translatesAutoresizingMaskIntoConstraints = false
        tabStack.axis = .horizontal
        tabStack.distribution = .fillEqually
        bottomBar.addSubview(tabStack)

        NSLayoutConstraint.activate([
            tabStack.topAnchor.constraint(equalTo: bottomBar.topAnchor),
            tabStack.bottomAnchor.constraint(equalTo: bottomBar.bottomAnchor),
            tabStack.leadingAnchor.constraint(equalTo: bottomBar.leadingAnchor),
            tabStack.trailingAnchor.constraint(equalTo: bottomBar.trailingAnchor)
        ])

        // Buttons – icons must exist in Assets.xcassets
        addTabButton(title: "Home",      imageName: "tab-home",      tag: 0)
        addTabButton(title: "Programs",  imageName: "tab-programs",  tag: 1)
        addTabButton(title: "E-Books",   imageName: "tab-ebooks",    tag: 2)
        addTabButton(title: "Dashboard", imageName: "tab-dashboard", tag: 3)
    }

    private func addTabButton(title: String, imageName: String, tag: Int) {
        let button = UIButton(type: .system)
        button.tag = tag
        button.tintColor = softBorder

        // Icon from Assets.xcassets (PNG/SVG catalog as PDF or vector asset)
        if let icon = UIImage(named: imageName)?.withRenderingMode(.alwaysTemplate) {
            button.setImage(icon, for: .normal)
        }

        button.setTitle(title, for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 11, weight: .medium)

        button.contentHorizontalAlignment = .center
        button.imageView?.contentMode = .scaleAspectFit

        // Icon above, text below
        button.imageEdgeInsets = UIEdgeInsets(top: -4, left: 0, bottom: 4, right: 0)
        button.titleEdgeInsets = UIEdgeInsets(top: 24, left: -24, bottom: 0, right: 0)

        button.addTarget(self, action: #selector(tabTapped(_:)), for: .touchUpInside)
        tabStack.addArrangedSubview(button)
    }

    private func updateTabSelection() {
        for case let button as UIButton in tabStack.arrangedSubviews {
            let isActive = (button.tag == currentTab)
            let color = isActive ? accentRed : UIColor.darkGray
            button.setTitleColor(color, for: .normal)
            button.tintColor = color
        }
    }

    @objc private func tabTapped(_ sender: UIButton) {
        currentTab = sender.tag
        updateTabSelection()

        let path: String
        switch sender.tag {
        case 0: path = "/"          // Home
        case 1: path = "/courses"   // Programs
        case 2: path = "/ebooks"    // E-Books
        case 3: path = "/dashboard" // Dashboard
        default: path = "/"
        }

        let js = "window.location.href = '\(path)';"
        bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - WebView Insets (no subview re-parenting)

    private func applyInsetsToWebView() {
        guard let webView = bridge?.webView as? WKWebView else {
            print("⚠️ bridge.webView is nil or not WKWebView")
            return
        }

        // Keep our header + nav on top visually
        view.bringSubviewToFront(statusBarCover)
        view.bringSubviewToFront(headerView)
        view.bringSubviewToFront(bottomBar)

        // Header height + safe area top
        let headerHeight: CGFloat = 56 + view.safeAreaInsets.top
        // Bottom bar height + safe area bottom
        let bottomHeight: CGFloat = 64 + view.safeAreaInsets.bottom

        let inset = UIEdgeInsets(top: headerHeight, left: 0, bottom: bottomHeight, right: 0)
        webView.scrollView.contentInset = inset
        webView.scrollView.scrollIndicatorInsets = inset

        print("✅ Applied webView insets: \(inset)")
    }

    // MARK: - Disable zoom & selection (mobile-app feel)

    private func injectViewportAndSelectionJS() {
        guard let webView = bridge?.webView as? WKWebView else { return }

        let js = """
        (function(){
          try {
            // Disable zoom (pinch + double tap)
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

            // Disable text selection / callout
            var style = document.createElement('style');
            style.innerHTML = `
              * {
                -webkit-user-select: none !important;
                -webkit-touch-callout: none !important;
                user-select: none !important;
              }
              input, textarea, [contenteditable="true"] {
                -webkit-user-select: auto !important;
                user-select: auto !important;
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
