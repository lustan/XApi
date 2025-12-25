# ⚡ XApi HTTP Client

> **Professional HTTP Debugging & Replay Tool for Chrome**

XApi is a high-performance, open-source Chrome Extension (Manifest V3) that brings a powerful, Postman-like experience directly into your browser's DevTools. It specializes in intercepting, debugging, editing, and replaying HTTP requests with unique support for modifying sensitive headers like `Cookie` and `Origin`.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-1.0.5-green)
![Manifest](https://img.shields.io/badge/Manifest-V3-orange)

---

## 📸 Overview

### Full Dashboard Workspace
*Manage collections and complex requests in a dedicated window.*
<img width="1919" height="1027" alt="2" src="https://github.com/user-attachments/assets/2a0be015-df7d-4375-9add-afbdc7762e62" />


### Integrated DevTools Panel
*Debug directly while you browse without switching tabs.*
<img width="1919" height="1029" alt="screenshot-20251225-200414" src="https://github.com/user-attachments/assets/440af990-be4b-49df-92c3-9469f74a962c" />


---

## ✨ Key Features

- **🚀 Real-time Interception**: Automatically capture Fetch and XHR traffic from the active tab.
- **🛡️ Sensitive Header Injection**: Industry-leading support for overriding `Cookie`, `Origin`, and `Referer` using `declarativeNetRequest` (DNR) to bypass standard browser security blocks.
- **📂 Collection Management**: Organize your workspace with nested collections and persistent storage.
- **🔄 Smart Replay**: One-click "Send" to replay captured requests with modified parameters or headers.
- **📥 cURL Integration**: Paste raw cURL commands to instantly generate fully editable request objects.
- **📑 Multi-Tab Workspace**: Handle multiple debugging sessions simultaneously with a familiar tab-based UI.
- **🔍 Advanced Inspection**: Pre-formatted JSON view, response timing, and size metrics.

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Core Engine**: Chrome Extensions API (Manifest V3 + DNR)

---

## 🚀 Getting Started

### Installation

1.  **Clone & Build**:
    ```bash
    git clone https://github.com/lustan/XApi.git
    cd XApi
    npm install
    npm run build
    ```
2.  **Load in Chrome**:
    - Go to `chrome://extensions/`
    - Enable **Developer mode** (top right)
    - Click **Load unpacked** and select the `dist` folder.

### How to Use

1.  Open **Chrome DevTools** (`F12` or `Ctrl+Shift+I`).
2.  Switch to the **XApi** tab.
3.  Interactions on the current page will appear in the **Captured** history.
4.  Select any request to edit its body, headers, or query params and hit **SEND**.

---

## 🤝 Contributing

We love contributions! Whether it's a bug report, a feature request, or a pull request, we value your input.

1.  **Fork** the project.
2.  **Create** your feature branch (`git checkout -b feature/CoolFeature`).
3.  **Commit** your changes (`git commit -m 'Add CoolFeature'`).
4.  **Push** to the branch (`git push origin feature/CoolFeature`).
5.  **Open** a Pull Request.

---

## 📄 License

Distributed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for details.

---
<p align="center">Made with ❤️ by the XApi Team</p>
