# QuizMaster – Deployment Guide

> Step-by-step instructions for running the QuizMaster platform locally with **XAMPP + Node.js**.

---

## Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| **XAMPP** | 8.x+ | Provides MySQL (and optionally Apache) |
| **Node.js** | 18 LTS+ | Runs the Express backend |
| **npm** | 9+ (ships with Node) | Package manager |

---

## 1. Clone / Copy the Project

Place the entire `Online Quiz` folder anywhere on your machine.  
The expected structure is:

```
Online Quiz/
├── server/            ← Node.js backend
│   ├── app.js
│   ├── package.json
│   ├── .env.example
│   ├── config/
│   │   └── database.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── xss.js
│   └── routes/
│       ├── auth.js
│       └── quiz.js
├── assets/
│   ├── css/
│   ├── js/
│   │   ├── pages/
│   │   └── utils/     ← Shared frontend modules
│   └── images/
├── categories/        ← Quiz page
├── homepage.html      ← Main landing page
├── login.html
├── dashboard.html
├── leaderboard.html
└── ... (CSS, images)
```

---

## 2. Start MySQL via XAMPP

1. Open **XAMPP Control Panel**.
2. Click **Start** next to **MySQL**.
3. Open **phpMyAdmin** (`http://localhost/phpmyadmin`).
4. Create a new database named **`quizmaster`** (utf8mb4_general_ci).

> The server will auto-create all required tables on first launch.

---

## 3. Configure Environment

```bash
cd "Online Quiz/server"
copy .env.example .env        # Windows
# cp .env.example .env        # macOS / Linux
```

Edit `.env` and set at minimum:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=           # blank for default XAMPP
DB_NAME=quizmaster
SESSION_SECRET=replace_with_a_long_random_string
PORT=3000
```

Generate a random session secret (PowerShell):

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

Or use Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 4. Install Dependencies

```bash
cd server
npm install
```

This installs Express, mysql2, bcrypt, helmet, cors, and other packages listed in `package.json`.

---

## 5. Start the Server

**Development (auto-restart on changes):**

```bash
npm run dev
```

**Production:**

```bash
npm start
```

You should see:

```
QuizMaster server running on port 3000
Connected to MySQL database
Database tables initialized
```

---

## 6. Open the App

Navigate to **`http://localhost:3000`** in your browser.

The Express server serves all static files (HTML, CSS, JS, images) from the project root, so you do **not** need Apache.

| Page | URL |
|------|-----|
| Homepage | `http://localhost:3000/homepage.html` |
| Login | `http://localhost:3000/login.html` |
| Dashboard | `http://localhost:3000/dashboard.html` |
| Leaderboard | `http://localhost:3000/leaderboard.html` |
| Categories/Quiz | `http://localhost:3000/categories/index.html` |

---

## 7. Default Accounts

There are no seeded accounts. Register a new user through the sign-up form on the login page.

---

## Troubleshooting

### "ECONNREFUSED" or "Access denied"

- Make sure MySQL is running in XAMPP.
- Verify `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env`.
- Try connecting with the MySQL CLI to confirm credentials:  
  `mysql -u root -p -h localhost`

### "Port 3000 already in use"

- Change `PORT` in `.env` to another number (e.g., `3001`).
- Or kill the process using that port:  
  `npx kill-port 3000`

### bcrypt build errors on Windows

- Install **Visual Studio Build Tools** (`npm install -g windows-build-tools`).
- Or use the pure-JS fallback: `npm install bcryptjs` and change the import in `server/middleware/auth.js` from `bcrypt` to `bcryptjs`.

### Session cookie not working

- Make sure you access the app through `http://localhost:PORT`, not by opening the HTML file directly.
- Cookies require the page to be served by the Express server.

---

## Security Notes

- **Passwords** are hashed with bcrypt (12 salt rounds) and never stored in plaintext.
- **Sessions** use HTTP-only cookies that cannot be accessed by JavaScript.
- **All user input** is sanitised by the XSS middleware on the server.
- **Rate limiting** is applied to auth endpoints (20 requests / 15 min).
- **CORS** is restricted to the configured `FRONTEND_URL`.
- **Helmet** sets secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.).

---

## Optional: Using Apache (XAMPP) as Reverse Proxy

If you want Apache to handle port 80:

1. Enable `mod_proxy` and `mod_proxy_http` in `httpd.conf`.
2. Add a VirtualHost:

```apache
<VirtualHost *:80>
    ServerName quizmaster.local
    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

3. Add `127.0.0.1 quizmaster.local` to your `hosts` file.

---

*Happy quizzing!*
