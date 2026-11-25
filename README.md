# XApi HTTP Client

A high-performance, open-source Chrome extension (Manifest V3) that brings a Postman-like workflow directly into your browser's DevTools. XApi intercepts, debugs, edits, and replays HTTP requests — with first-class support for modifying sensitive headers such as `Cookie`, `Origin`, and `Referer`, mocking responses, and injecting request headers globally.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-3.2.0-green)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)

## Overview

Debug directly while you browse without switching tabs, and manage collections and complex requests in a dedicated window.

https://github.com/user-attachments/assets/490f58f6-b000-49de-80e1-702669052b55

## Features

### Request interception and replay
- Automatically capture Fetch and XHR traffic from the active tab.
- Edit any captured request's body, headers, or query parameters and replay it with one click.
- Paste raw cURL commands to instantly generate fully editable request objects.
- Organize requests into nested collections with persistent storage.

### Modify Header (global request headers)
Inject or override request headers across all network requests, without editing individual requests.

- Managed from the **Header** tab in the extension popup, backed by Chrome's `declarativeNetRequest` (DNR) engine.
- Each header row has an enable checkbox, a key, and a value; toggle rows individually and flip the global master switch to activate all enabled headers at once.
- Headers are applied as `SET` operations, so they add the header when absent and override it when present.
- The rule applies to every resource type covered by the extension's host permissions, including navigations, API calls, and static assets, and is rebuilt automatically whenever you change a header or toggle the switch.
- Because it runs through DNR, it can set headers the browser normally protects — including `Cookie`, `Origin`, and `Referer` — that page scripts cannot change on their own.
- Global header rules use a dedicated DNR rule and a lower priority than one-off replay rules, so replaying a single request can still override a global header of the same name for that call.

### Sensitive header injection on replay
When replaying a single request, XApi can override restricted headers (`Cookie`, `Origin`, `Referer`) that standard page scripts are blocked from setting, so replayed requests faithfully reproduce the original call.

### Mock and response override
Intercept live requests and serve custom responses without touching the backend — useful for front-end development, edge-case testing, and reproducing bugs.

- **URL matching**: rules match by URL prefix (`startsWith`) and HTTP method (`GET` / `POST` / `PUT` / `DELETE` / `ANY`).
- **Replace mode**: fully override the response with a custom status code, `Content-Type`, and body (JSON, text, HTML, etc.).
- **JSON Patch mode**: keep the original response and surgically modify specific fields via JSON paths (e.g. `data.user.name`, `data.list[0].id`). Use the `::raw::` prefix to inject numbers, booleans, `null`, or nested JSON.
- **One-click mock from capture**: right-click any captured response and choose *"Mock this response"* to auto-generate a rule pre-filled with the current payload.
- **Per-rule toggle and global switch**: enable or disable individual rules, or flip the global mock master switch. Hit counters and last-hit timestamps confirm rules are firing.

## Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Build tool**: [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Core engine**: Chrome Extensions API (Manifest V3 + declarativeNetRequest)

## Getting Started

### Installation

#### Via Chrome Web Store (recommended)
XApi is available on the Chrome Web Store. Search for **XApi** or use the link below:
- [XApi - HTTP Client & API Test](https://chromewebstore.google.com/detail/xapi-http-client-api-test/ilcnglohbiokfdcokfceihebobkpeaij?authuser=0&hl=en)

#### Manual installation (from source)
1. Clone and build:
   ```bash
   git clone https://github.com/lustan/XApi.git
   cd XApi
   npm install
   npm run build
   ```
2. Load in Chrome:
   - Go to `chrome://extensions/`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** and select the `dist` folder.

### Usage

1. Open **Chrome DevTools** (`F12` or `Ctrl+Shift+I`).
2. Switch to the **XApi** tab.
3. Interactions on the current page appear in the **Captured** history.
4. Select any request to edit its body, headers, or query params, then hit **Send**.

#### Injecting global headers

1. Open the extension popup and switch to the **Header** tab.
2. Add a header with **+ Add Header**, fill in the key and value, and tick its checkbox to enable it.
3. Turn on the global header switch. Every network request from then on carries the enabled headers.
4. Disable a single row or flip the global switch off to stop injection at any time.

#### Mocking a response

1. Open the **Mock** tab in the sidebar and make sure the global mock switch is on.
2. Click **New Rule** to define one from scratch, or right-click a captured response and pick **"Mock this response"** to seed a rule from the live payload.
3. Set the **URL pattern** (prefix match) and **method**, then choose a mode:
   - **Replace** — write the full status / `Content-Type` / body you want returned.
   - **JSON Patch** — add patch rows like `data.user.name = Alice`. Prefix with `::raw::` to inject non-string JSON values, e.g. `::raw::42`, `::raw::true`, `::raw::{"k":1}`.
4. Reload the page or trigger the request — the rule's hit counter confirms it fired.

## Contributing

Bug reports, feature requests, and pull requests are welcome.

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/CoolFeature`).
3. Commit your changes (`git commit -m 'Add CoolFeature'`).
4. Push to the branch (`git push origin feature/CoolFeature`).
5. Open a pull request.

## License

Distributed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for details.
