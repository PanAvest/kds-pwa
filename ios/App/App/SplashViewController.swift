import UIKit

@objcMembers
@objc(SplashViewController)
class SplashViewController: UIViewController {
    private let minimumVisibleDuration: TimeInterval = 5.0
    private let fallbackDismissDelay: TimeInterval = 7.0
    private let splashBackground = UIColor(red: 0xF7 / 255.0, green: 0xF2 / 255.0, blue: 0xEC / 255.0, alpha: 1.0)
    private let inkColor = UIColor(red: 0x2C / 255.0, green: 0x25 / 255.0, blue: 0x22 / 255.0, alpha: 1.0)
    private let mutedColor = UIColor(red: 0x6D / 255.0, green: 0x62 / 255.0, blue: 0x5D / 255.0, alpha: 1.0)
    private let accentColor = UIColor(red: 0xB6 / 255.0, green: 0x54 / 255.0, blue: 0x37 / 255.0, alpha: 1.0)
    private let trackColor = UIColor(red: 0xD8 / 255.0, green: 0xC8 / 255.0, blue: 0xB7 / 255.0, alpha: 1.0)
    private let progressTrackWidth: CGFloat = 188

    private let logoImageView: UIImageView = {
        let imageView = UIImageView(image: UIImage(named: "splash"))
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        return imageView
    }()

    private let titleLabel: UILabel = {
        let label = UILabel()
        label.text = "Knowledge Development Series"
        label.font = UIFont.systemFont(ofSize: 28, weight: .heavy)
        label.textColor = UIColor(red: 0x2C / 255.0, green: 0x25 / 255.0, blue: 0x22 / 255.0, alpha: 1.0)
        label.textAlignment = .center
        label.numberOfLines = 2
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    private let subtitleLabel: UILabel = {
        let label = UILabel()
        label.text = "Powered by PanAvest International & Partners"
        label.font = UIFont.systemFont(ofSize: 13, weight: .medium)
        label.textColor = UIColor(red: 0x6D / 255.0, green: 0x62 / 255.0, blue: 0x5D / 255.0, alpha: 1.0)
        label.textAlignment = .center
        label.numberOfLines = 2
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    private let progressTrackView: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }()

    private let progressFillView: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        return view
    }()

    private lazy var progressFillWidthConstraint = progressFillView.widthAnchor.constraint(equalToConstant: 0)

    private var hasDismissed = false
    private var earliestHideDate = Date()
    private var pendingHideWorkItem: DispatchWorkItem?
    private var fallbackWorkItem: DispatchWorkItem?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = splashBackground
        layoutViews()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        earliestHideDate = Date().addingTimeInterval(minimumVisibleDuration)
        animateIdentity()
        startProgressAnimation()
        scheduleFallbackDismiss()
    }

    private func layoutViews() {
        logoImageView.layer.shadowColor = accentColor.withAlphaComponent(0.15).cgColor
        logoImageView.layer.shadowOpacity = 1
        logoImageView.layer.shadowRadius = 18
        logoImageView.layer.shadowOffset = CGSize(width: 0, height: 10)

        progressTrackView.backgroundColor = trackColor.withAlphaComponent(0.45)
        progressTrackView.layer.cornerRadius = 2
        progressTrackView.clipsToBounds = true

        progressFillView.backgroundColor = accentColor
        progressFillView.layer.cornerRadius = 2

        progressTrackView.addSubview(progressFillView)

        NSLayoutConstraint.activate([
            progressFillView.leadingAnchor.constraint(equalTo: progressTrackView.leadingAnchor),
            progressFillView.topAnchor.constraint(equalTo: progressTrackView.topAnchor),
            progressFillView.bottomAnchor.constraint(equalTo: progressTrackView.bottomAnchor),
            progressFillWidthConstraint
        ])

        let stack = UIStackView(arrangedSubviews: [logoImageView, titleLabel, subtitleLabel, progressTrackView])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -28),

            logoImageView.widthAnchor.constraint(equalToConstant: 116),
            logoImageView.heightAnchor.constraint(equalToConstant: 116),

            progressTrackView.widthAnchor.constraint(equalToConstant: progressTrackWidth),
            progressTrackView.heightAnchor.constraint(equalToConstant: 4)
        ])
    }

    private func animateIdentity() {
        UIView.animate(
            withDuration: 1.35,
            delay: 0,
            options: [.autoreverse, .repeat, .curveEaseInOut, .allowUserInteraction]
        ) {
            self.logoImageView.transform = CGAffineTransform(translationX: 0, y: -6).scaledBy(x: 1.03, y: 1.03)
        }
    }

    private func startProgressAnimation() {
        progressFillWidthConstraint.constant = 0
        view.layoutIfNeeded()

        UIView.animate(withDuration: minimumVisibleDuration, delay: 0.08, options: [.curveEaseInOut, .allowUserInteraction]) {
            self.progressFillWidthConstraint.constant = self.progressTrackWidth
            self.view.layoutIfNeeded()
        }
    }

    private func scheduleFallbackDismiss() {
        fallbackWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            self?.fadeOutAndDismiss()
        }
        fallbackWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + fallbackDismissDelay, execute: workItem)
    }

    func fadeOutAndDismiss() {
        guard !hasDismissed else { return }
        let now = Date()

        if now < earliestHideDate {
            let delay = earliestHideDate.timeIntervalSince(now)
            pendingHideWorkItem?.cancel()
            let work = DispatchWorkItem { [weak self] in
                self?.fadeOutAndDismiss()
            }
            pendingHideWorkItem = work
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
            return
        }

        hasDismissed = true
        pendingHideWorkItem?.cancel()
        fallbackWorkItem?.cancel()

        progressFillWidthConstraint.constant = progressTrackWidth

        UIView.animate(withDuration: 0.2, animations: {
            self.view.layoutIfNeeded()
        }) { _ in
            UIView.animate(withDuration: 0.3, animations: {
                self.view.alpha = 0.0
            }) { _ in
                self.dismiss(animated: false, completion: nil)
            }
        }
    }
}
