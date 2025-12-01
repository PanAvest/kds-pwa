import UIKit
import WebKit
import Capacitor

@objcMembers
@objc(SplashViewController)
class SplashViewController: UIViewController {

    private let logoImageView: UIImageView = {
        let imageView = UIImageView(image: UIImage(named: "splash"))
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        return imageView
    }()

    private let titleLabel: UILabel = {
        let label = UILabel()
        label.text = "Knowledge Development Series"
        label.font = UIFont.systemFont(ofSize: 20, weight: .semibold)
        label.textColor = UIColor(red: 0x2C/255.0, green: 0x25/255.0, blue: 0x22/255.0, alpha: 1.0)
        label.textAlignment = .center
        label.numberOfLines = 2
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    private let subtitleLabel: UILabel = {
        let label = UILabel()
        label.text = "Powered by PanAvest International & Partners"
        label.font = UIFont.systemFont(ofSize: 14, weight: .regular)
        label.textColor = UIColor(red: 0x2C/255.0, green: 0x25/255.0, blue: 0x22/255.0, alpha: 0.8)
        label.textAlignment = .center
        label.numberOfLines = 2
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    private let progressView: UIProgressView = {
        let progress = UIProgressView(progressViewStyle: .default)
        progress.translatesAutoresizingMaskIntoConstraints = false
        progress.trackTintColor = UIColor(white: 0.9, alpha: 1.0)
        progress.progressTintColor = UIColor(red: 0xB6/255.0, green: 0x54/255.0, blue: 0x37/255.0, alpha: 1.0)
        progress.progress = 0.0
        return progress
    }()

    private var hasDismissed = false
    private var earliestHideDate = Date()
    private var pendingHideWorkItem: DispatchWorkItem?
    private var fallbackWorkItem: DispatchWorkItem?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        layoutViews()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        earliestHideDate = Date().addingTimeInterval(5.0)
        startProgressAnimation()
        scheduleFallbackDismiss()
    }

    private func layoutViews() {
        let stack = UIStackView(arrangedSubviews: [logoImageView, titleLabel, progressView, subtitleLabel])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),

            logoImageView.widthAnchor.constraint(equalToConstant: 140),
            logoImageView.heightAnchor.constraint(equalToConstant: 140),

            progressView.widthAnchor.constraint(equalToConstant: 200),
            progressView.heightAnchor.constraint(equalToConstant: 3)
        ])
    }

    private func startProgressAnimation() {
        progressView.setProgress(0.0, animated: false)
        UIView.animate(withDuration: 5.0, delay: 0, options: [.curveEaseInOut]) {
            self.progressView.setProgress(1.0, animated: true)
        }
    }

    private func scheduleFallbackDismiss() {
        fallbackWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            self?.fadeOutAndDismiss()
        }
        fallbackWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 5.0, execute: workItem)
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

        UIView.animate(withDuration: 0.35, animations: {
            self.view.alpha = 0.0
        }) { _ in
            self.dismiss(animated: false, completion: nil)
        }
    }
}
