import SwiftUI

enum KDSTheme {
    static let background = Color(hex: "F7F2EC")
    static let surface = Color.white
    static let surfaceMuted = Color(hex: "F1E7DB")
    static let primary = Color(hex: "B65437")
    static let primaryDark = Color(hex: "8F3E26")
    static let accent = Color(hex: "0A1156")
    static let ink = Color(hex: "2C2522")
    static let muted = Color(hex: "6D625D")
    static let border = Color(hex: "D8C8B7")
    static let success = Color(hex: "2D7A5C")
    static let warning = Color(hex: "A86917")
}

extension Color {
    init(hex: String) {
        let trimmed = hex.replacingOccurrences(of: "#", with: "")
        var value: UInt64 = 0
        Scanner(string: trimmed).scanHexInt64(&value)

        let r, g, b: Double
        switch trimmed.count {
        case 6:
            r = Double((value & 0xFF0000) >> 16) / 255
            g = Double((value & 0x00FF00) >> 8) / 255
            b = Double(value & 0x0000FF) / 255
        default:
            r = 1
            g = 1
            b = 1
        }

        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}

struct KDSPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                LinearGradient(
                    colors: [KDSTheme.primary, KDSTheme.primaryDark],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .shadow(color: KDSTheme.primary.opacity(0.25), radius: 16, x: 0, y: 10)
    }
}

struct KDSSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(KDSTheme.surface)
            .foregroundColor(KDSTheme.ink)
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(KDSTheme.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
    }
}

extension View {
    func kdsScreenBackground() -> some View {
        self.background(
            LinearGradient(
                colors: [KDSTheme.background, Color.white],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
    }

    func kdsCardSurface(cornerRadius: CGFloat = 24) -> some View {
        self
            .background(KDSTheme.surface.opacity(0.96))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(KDSTheme.border.opacity(0.75), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .contentShape(Rectangle())
            .shadow(color: .black.opacity(0.08), radius: 18, x: 0, y: 12)
    }

    func kdsCard() -> some View {
        self
            .padding(18)
            .kdsCardSurface()
    }
}
