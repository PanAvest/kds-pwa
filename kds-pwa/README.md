# KDS PWA

This project is a Progressive Web App (PWA) designed for managing and generating certificates and ebooks. It utilizes Capacitor to provide native functionality for mobile devices, allowing users to download and share PDFs directly from the app.

## Project Structure

- **app/**: Contains the main application pages.
  - **dashboard/**: The dashboard page for the application.
  - **ebooks/**: Contains pages for ebook management, with dynamic routing based on the ebook slug.
  
- **components/**: Contains reusable React components.
  - **SimpleCertificate.tsx**: A component for generating and displaying certificates.

- **lib/**: Contains utility functions and helpers.
  - **nativePlatform.ts**: Functions to determine if the app is running natively.
  - **nativePdf.ts**: Helper functions for saving and sharing PDFs on native platforms.

- **package.json**: Lists project dependencies and scripts.

- **tsconfig.json**: TypeScript configuration file.

## Features

- Generate and download certificates in PDF format.
- Save and share PDFs on mobile devices using native functionality.
- Manage and download ebooks from secure URLs.

## Installation

To get started, clone the repository and install the dependencies:

```bash
npm install
```

## Commands

After implementing changes, run the following command to sync Capacitor with the native platforms:

```bash
npx cap sync
```

## Dependencies

Ensure that the following Capacitor plugins are included in your `package.json`:

- `@capacitor/filesystem`
- `@capacitor/share`

## Usage

- Use the dashboard to generate certificates and download them as PDFs.
- Access ebooks and download them directly from the app.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.