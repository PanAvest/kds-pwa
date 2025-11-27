// app/privacy/page.tsx
export default function PrivacyPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-12 prose">
      <h1>KDS Learning – Privacy Policy</h1>
      <p><strong>Effective Date:</strong> 27 November 2025</p>

      <p>
        KDS Learning (“we”, “our”, “us”) is operated by PanAvest International &amp; Partners.
        We are committed to protecting your privacy and ensuring that your personal information
        is handled responsibly and transparently.
      </p>

      <h2>1. Information We Collect</h2>

      <h3>1.1 Account Information</h3>
      <ul>
        <li>Full name</li>
        <li>Email address</li>
        <li>Password (securely encrypted via Supabase Auth)</li>
        <li>Profile information you update</li>
      </ul>

      <h3>1.2 Course &amp; Learning Data</h3>
      <ul>
        <li>Courses you enrol in</li>
        <li>Exam attempts, scores, and progress</li>
        <li>E-book access history</li>
        <li>Certificates generated and downloaded</li>
      </ul>

      <h3>1.3 Payment Information</h3>
      <p>
        Payments are securely handled by Paystack. We do not store card details.
        We may receive payment references, transaction status, and timestamps.
      </p>

      <h3>1.4 Device &amp; Technical Data</h3>
      <ul>
        <li>Device type and operating system</li>
        <li>App version</li>
        <li>IP address (for security)</li>
        <li>Error logs and crash data</li>
      </ul>

      <h3>1.5 Optional Data</h3>
      <ul>
        <li>Push notification token (if enabled by the user)</li>
      </ul>

      <h2>2. How We Use Your Data</h2>
      <ul>
        <li>Account creation and management</li>
        <li>Delivering courses, exams, and e-books</li>
        <li>Processing payments securely</li>
        <li>Issuing certified CPPD certificates</li>
        <li>Improving app performance and content</li>
        <li>User support and communication</li>
        <li>Security, fraud prevention, and compliance</li>
      </ul>
      <p><strong>We do not sell your data.</strong></p>

      <h2>3. Data Sharing</h2>
      <h3>Supabase</h3>
      <p>Authentication, database storage, secure file delivery.</p>

      <h3>Paystack</h3>
      <p>Payment processing only.</p>

      <h3>Apple, Google &amp; Capacitor</h3>
      <p>Used solely for in-app navigation, security, and crash logs.</p>

      <h2>4. Data Protection &amp; Security</h2>
      <ul>
        <li>Encrypted authentication (Supabase Auth)</li>
        <li>RLS protections for user-specific data</li>
        <li>HTTPS for all communications</li>
        <li>Secure, PCI-DSS-compliant payments via Paystack</li>
        <li>Restricted access to authorised personnel only</li>
      </ul>

      <h2>5. Your Rights</h2>
      <p>You may:</p>
      <ul>
        <li>Access your data</li>
        <li>Update or correct your information</li>
        <li>Request deletion of your account</li>
        <li>Request a copy of your data</li>
        <li>Withdraw consent for optional features</li>
      </ul>
      <p>Contact us at: <strong>info@panavestinternational.com</strong></p>

      <h2>6. Data Retention</h2>
      <p>
        We retain your data only as long as necessary to provide learning services,
        fulfil legal obligations, and maintain certificate verification records.
      </p>

      <h2>7. Children's Privacy</h2>
      <p>
        KDS Learning is not intended for users under 13. We do not knowingly collect data from children.
      </p>

      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy periodically. The “Effective Date” above reflects the latest version.
      </p>

      <h2>9. Contact Us</h2>
      <p><strong>PanAvest International &amp; Partners</strong></p>
      <p>Email: info@panavestinternational.com</p>
      <p>Website: https://www.panavestkds.com</p>
    </main>
  );
}
