import UIKit

/// Native splash that mirrors the design: icon, title, progress bar, subtitle.
/// Animates the bar over 5 seconds, then swaps to the Capacitor root VC.
class SplashViewController: UIViewController {
    private let accentColor = UIColor(red: 0xB6/255.0, green: 0x54/255.0, blue: 0x37/255.0, alpha: 1.0)
    private let textDark = UIColor(red: 0x2C/255.0, green: 0x25/255.0, blue: 0x22/255.0, alpha: 1.0)
    private let textMuted = UIColor(red: 0x6D/255.0, green: 0x7D/255.0, blue: 0x6F/255.0, alpha: 1.0)
    private let trackColor = UIColor(red: 0xE0/255.0, green: 0xDB/255.0, blue: 0xD6/255.0, alpha: 1.0)

    private let stack = UIStackView()
    private let iconView = UIImageView()
    private let titleLabel = UILabel()
    private let poweredLabel = UILabel()
    private let progressTrack = UIView()
    private let progressFill = UIView()
    private var fillWidthConstraint: NSLayoutConstraint?

    private let animationDuration: TimeInterval = 5.0
    private var hasAnimated = false

    override func viewDidLoad() {
        super.viewDidLoad()

        if #available(iOS 13.0, *) {
            overrideUserInterfaceStyle = .light
        }
        view.backgroundColor = .white
        buildLayout()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startProgressIfNeeded()
    }

    private func buildLayout() {
        // Stack holding all content
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)
        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: guide.centerYAnchor)
        ])

        // Icon
        iconView.translatesAutoresizingMaskIntoConstraints = false
        iconView.contentMode = .scaleAspectFit
        // Use existing splash/app icon asset
        iconView.image = UIImage(named: "splash") ?? UIImage(named: "Splash") ?? UIImage(named: "AppIcon") ?? UIImage(named: "icon-512")
        NSLayoutConstraint.activate([
            iconView.widthAnchor.constraint(equalToConstant: 120),
            iconView.heightAnchor.constraint(equalTo: iconView.widthAnchor)
        ])

        // Title
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = "Knowledge Development Series"
        titleLabel.font = UIFont.systemFont(ofSize: 22, weight: .semibold)
        titleLabel.textColor = textDark
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0

        // Progress bar
        progressTrack.translatesAutoresizingMaskIntoConstraints = false
        progressTrack.backgroundColor = trackColor
        progressTrack.layer.cornerRadius = 3
        progressTrack.clipsToBounds = true

        progressFill.translatesAutoresizingMaskIntoConstraints = false
        progressFill.backgroundColor = accentColor
        progressFill.layer.cornerRadius = 3

        progressTrack.addSubview(progressFill)
        NSLayoutConstraint.activate([
            progressTrack.widthAnchor.constraint(equalToConstant: 320),
            progressTrack.heightAnchor.constraint(equalToConstant: 6),
            progressFill.leadingAnchor.constraint(equalTo: progressTrack.leadingAnchor),
            progressFill.topAnchor.constraint(equalTo: progressTrack.topAnchor),
            progressFill.bottomAnchor.constraint(equalTo: progressTrack.bottomAnchor)
        ])
        fillWidthConstraint = progressFill.widthAnchor.constraint(equalToConstant: 0)
        fillWidthConstraint?.isActive = true

        // Powered by
        poweredLabel.translatesAutoresizingMaskIntoConstraints = false
        poweredLabel.text = "Powered by PanAvest International & Partners"
        poweredLabel.font = UIFont.systemFont(ofSize: 15, weight: .regular)
        poweredLabel.textColor = textMuted
        poweredLabel.textAlignment = .center
        poweredLabel.numberOfLines = 0

        // Add arranged subviews
        stack.addArrangedSubview(iconView)
        stack.addArrangedSubview(titleLabel)
        stack.setCustomSpacing(12, after: titleLabel)
        stack.addArrangedSubview(progressTrack)
        stack.addArrangedSubview(poweredLabel)
    }

    private func startProgressIfNeeded() {
        guard !hasAnimated else { return }
        hasAnimated = true

        view.layoutIfNeeded()
        fillWidthConstraint?.constant = 320

        UIView.animate(withDuration: animationDuration, delay: 0, options: [.curveEaseInOut]) {
            self.view.layoutIfNeeded()
        } completion: { _ in
            self.transitionToMain()
        }
    }

    private func transitionToMain() {
        // Instantiate MainViewController from storyboard
        let storyboard = UIStoryboard(name: "Main", bundle: nil)
        let mainVC = storyboard.instantiateViewController(withIdentifier: "MainViewController") as? MainViewController ?? MainViewController()

        guard let window = view.window ?? UIApplication.shared.windows.first else {
            present(mainVC, animated: false, completion: nil)
            return
        }

        window.rootViewController = mainVC
        window.makeKeyAndVisible()
    }
}
