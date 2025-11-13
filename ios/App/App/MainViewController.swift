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
    private let bottomBar     = UIView()
    private let tabStack      = UIStackView()

    // 0 = Home, 1 = Programs, 2 = E-Books, 3 = Dashboard
    private var currentTab: Int = 0

    // Brand colors (match CSS)
    private let bgColor    = UIColor(red: 0xFE/255.0, green: 0xFD/255.0, blue: 0xFA/255.0, alpha: 1.0)
    private let textDark   = UIColor(red: 0x2C/255.0, green: 0x25/255.0, blue: 0x22/255.0, alpha: 1.0)
    private let accentRed  = UIColor(red: 0xB6/255.0, green: 0x54/255.0, blue: 0x37/255.0, alpha: 1.0)
    private let softBorder = UIColor(red: 0xD0/255.0, green: 0xC5/255.0, blue: 0xBE/255.0, alpha: 1.0)

    override func viewDidLoad() {
        super.viewDidLoad()

        // Force light mode so dark mode never makes top/bottom black
        if #available(iOS 13.0, *) {
            overrideUserInterfaceStyle = .light
        }

        view.backgroundColor = bgColor

        setupHeader()
        setupBottomBar()
        updateTabSelection()

        applyInsetsToWebView()
        injectViewportAndSelectionJS()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        injectViewportAndSelectionJS()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        applyInsetsToWebView()
    }

    // MARK: - Top overlay (status + header background, NO text)

    private func setupHeader() {
        let safe = view.safeAreaLayoutGuide

        // Covers notch/status area
        statusBarCover.translatesAutoresizingMaskIntoConstraints = false
        statusBarCover.backgroundColor = bgColor
        view.addSubview(statusBarCover)

        NSLayoutConstraint.activate([
            statusBarCover.topAnchor.constraint(equalTo: view.topAnchor),
            statusBarCover.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            statusBarCover.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            statusBarCover.bottomAnchor.constraint(equalTo: safe.topAnchor)
        ])

        // Simple color band under the notch – no text
        headerView.translatesAutoresizingMaskIntoConstraints = false
        headerView.backgroundColor = bgColor
        view.addSubview(headerView)

        NSLayoutConstraint.activate([
            headerView.topAnchor.constraint(equalTo: safe.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            // 44pt high band – just visual, does NOT push content
            headerView.heightAnchor.constraint(equalToConstant: 44)
        ])
    }

    // MARK: - Bottom Nav

    private func setupBottomBar() {
        bottomBar.translatesAutoresizingMaskIntoConstraints = false
        bottomBar.backgroundColor = .white
        bottomBar.layer.borderColor = softBorder.cgColor
        bottomBar.layer.borderWidth = 0.5

        view.addSubview(bottomBar)

        // Attach to the real bottom (covers home indicator / no black gap)
        NSLayoutConstraint.activate([
            bottomBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            bottomBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomBar.heightAnchor.constraint(equalToConstant: 80) // a bit taller so icons can sit higher
        ])

        tabStack.translatesAutoresizingMaskIntoConstraints = false
        tabStack.axis = .horizontal
        tabStack.distribution = .fillEqually
        // Padding so labels don’t touch the sides
        tabStack.isLayoutMarginsRelativeArrangement = true
        tabStack.layoutMargins = UIEdgeInsets(top: 0, left: 12, bottom: 0, right: 12)

        bottomBar.addSubview(tabStack)

        NSLayoutConstraint.activate([
            // Lift content up inside the bar so it sits above iPhone nav/home bar
            tabStack.topAnchor.constraint(equalTo: bottomBar.topAnchor, constant: 4),
            tabStack.bottomAnchor.constraint(equalTo: bottomBar.bottomAnchor, constant: -14),
            tabStack.leadingAnchor.constraint(equalTo: bottomBar.leadingAnchor),
            tabStack.trailingAnchor.constraint(equalTo: bottomBar.trailingAnchor)
        ])

        addTabButton(title: "Home",      imageName: "tab-home",      tag: 0)
        addTabButton(title: "Programs",  imageName: "tab-programs",  tag: 1)
        addTabButton(title: "E-Books",   imageName: "tab-ebooks",    tag: 2)
        addTabButton(title: "Dashboard", imageName: "tab-dashboard", tag: 3)
    }

    private func addTabButton(title: String, imageName: String, tag: Int) {
        let button = UIButton(type: .system)
        button.tag = tag

        // Try to load icon from Assets.xcassets (must be PNG/PDF, not raw SVG)
        if let icon = UIImage(named: imageName)?.withRenderingMode(.alwaysTemplate) {
            button.setImage(icon, for: .normal)
        }

        button.setTitle(title, for: .normal)
        button.titleLabel?.font = UIFont.systemFont(ofSize: 11, weight: .medium)

        button.tintColor = softBorder
        button.setTitleColor(UIColor.darkGray, for: .normal)

        button.contentHorizontalAlignment = .center
        button.imageView?.contentMode = .scaleAspectFit

        // Vertical layout: icon above, text below, lifted a bit up
        button.contentEdgeInsets = UIEdgeInsets(top: 2, left: 0, bottom: 2, right: 0)
        button.imageEdgeInsets = UIEdgeInsets(top: -4, left: 0, bottom: 2, right: 0)
        button.titleEdgeInsets = UIEdgeInsets(top: 26, left: -24, bottom: 0, right: 0)

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

    // MARK: - WebView Insets: don’t move content down for header

    private func applyInsetsToWebView() {
        guard let webView = bridge?.webView as? WKWebView else {
            return
        }

        // Keep overlays on top visually
        view.bringSubviewToFront(statusBarCover)
        view.bringSubviewToFront(headerView)
        view.bringSubviewToFront(bottomBar)

        // We only need bottom inset so content doesn’t go under the nav bar.
        // Top = 0 so header band doesn’t push content down.
        let bottomInset: CGFloat = 80 + view.safeAreaInsets.bottom
        let inset = UIEdgeInsets(top: 0, left: 0, bottom: bottomInset, right: 0)

        webView.scrollView.contentInset = inset
        webView.scrollView.scrollIndicatorInsets = inset
    }

    // MARK: - Disable zoom & text selection

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

            // Disable text selection / highlight globally
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
