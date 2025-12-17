# Chrome HTTP Debugger & Client

A powerful, open-source Chrome Extension built with **Manifest V3** that acts as a lightweight Postman alternative directly inside your Chrome DevTools. Intercept, debug, edit, and replay HTTP requests without leaving the browser.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.1-green)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)

## ✨ Features

*   **⚡ Intercept & Record**: Automatically capture HTTP traffic (Fetch/XHR) from the current tab.
*   **🛠️ Postman-like Interface**: Full-featured request editor for Parameters, Headers, and Body (JSON, Form-Data, x-www-form-urlencoded, Raw).
*   **🔄 Replay Requests**: Modify and resend captured requests instantly.
*   **📂 Collections**: Organize your requests into folders/collections for better workflow management.
*   **📜 History Log**: Keep track of all captured requests with status codes, timing, and size metrics.
*   **📥 cURL Import**: Import requests via raw cURL commands.
*   **📑 Multi-Tab Interface**: Work on multiple requests simultaneously using a tabbed workspace.
*   **🎨 Syntax Highlighting**: JSON formatting and colored HTTP methods for better readability.

## 🚀 Tech Stack

*   **Core**: [React 19](https://react.dev/)
*   **Build Tool**: [Vite](https://vitejs.dev/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Platform**: Chrome Extension API (Manifest V3)

## 🛠️ Development Setup

1.  **Clone the repository**
    ```bash
    git clone https://github.com/lustan/chrome-http-debugger.git
    cd chrome-http-debugger
    ```

2.  **Install dependencies**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Run in development mode** (watch for changes)
    ```bash
    npm run dev
    ```

4.  **Build for production**
    ```bash
    npm run build
    ```

## 📦 Installation in Chrome

1.  Run the build command: `npm run build`. This will create a `dist` folder.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the `dist` folder generated in step 1.

## 📖 Usage

1.  Open the website you want to debug.
2.  Open Chrome DevTools (`F12` or `Right Click -> Inspect`).
3.  Navigate to the **"HTTP Tool"** tab in the DevTools panel.
4.  (Optional) Click the extension icon in the browser toolbar to toggle "Recording" mode or view a quick list of logs.
5.  Start interacting with the page; requests will appear in the **History** sidebar.
6.  Click a request to edit and replay it.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
