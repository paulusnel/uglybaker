# Ugly Baker Bread Co PWA

A local-first Progressive Web App for customer records, order tracking, WhatsApp Click-to-Chat messages, and manual backups.

## What it does

- Stores customers, orders, message templates and bakery settings in IndexedDB on the current browser/device.
- Opens WhatsApp with a pre-filled message using `https://wa.me/`.
- Supports customer import through the browser Contact Picker API where available, and `.vcf` (vCard) import as a fallback.
- Exports/imports full JSON backups and exports customer/order CSV files.
- Caches the app shell for offline use after the first successful load.

## Deploy to GitHub Pages

1. Create a new GitHub repository, for example `ugly-baker-pwa`.
2. Upload all files in this folder to the repository root (not the ZIP file itself).
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`, then Save.
6. Wait for GitHub Pages to publish. Open the URL it provides.
7. On Android Chrome, use the browser menu → **Install app** or **Add to Home screen**.

No build step, server, database subscription or API key is required.

## Important storage and backup notes

- GitHub Pages hosts only the static app files. Customer/order data is not uploaded to GitHub.
- IndexedDB is local to the browser profile on the device. It does not synchronise between devices.
- Export a JSON backup regularly and store it somewhere separate, such as Google Drive or a computer.
- Import a backup on another device to copy records there. It is a manual restore, not live sync.
- Avoid private/incognito mode. Clearing site data can delete the local database.
- The first app load needs an internet connection. After the service worker has cached the app, the app shell can load offline. WhatsApp sending still needs internet.

## Contact import compatibility

The native Contact Picker API is experimental and is not supported by every browser/platform. It normally requires a secure context (HTTPS) and a user gesture. If unavailable, export contacts from your phone as a `.vcf` file and import it using **Customers → Import .vcf**.

The app imports name, phone and email where present. Existing customers with the same normalised phone number are skipped to avoid duplicating them. South African numbers beginning with `0` are converted to the `+27` international format when opening WhatsApp.

## Limitations of this first version

- No live synchronisation between devices.
- No automatic WhatsApp sending; you review and press Send in WhatsApp.
- No automatic recurring backup. You must export backups yourself.
- Contact Picker availability depends on the browser. VCF import is the fallback.
- This is an initial working version. Test with sample records and make a backup before relying on it for live bakery operations.

## Privacy

All customer and order records remain in the browser's local IndexedDB unless you manually export them. Do not publish backup JSON or CSV files in the GitHub repository.
