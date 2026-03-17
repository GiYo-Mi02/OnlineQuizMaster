# QuizMaster - Online Quiz Platform

An interactive, gamified online learning and quiz platform designed for Filipino students, featuring multilingual support (English/Filipino), comprehensive assessment tools, and an engaging user experience.

---

## Table of Contents

1. [Project Description](#project-description)
2. [Purpose](#purpose)
3. [Objectives](#objectives)
4. [Features](#features)
5. [Technology Stack](#technology-stack)
6. [Project Structure](#project-structure)
7. [Installation & Setup](#installation--setup)
8. [Usage Guide](#usage-guide)
9. [Audit & Improvement Recommendations](#audit--improvement-recommendations)
10. [Contributing](#contributing)
11. [License](#license)

---

## Project Description

**QuizMaster** is a comprehensive web-based quiz and learning platform tailored specifically for Filipino Senior High School students. The platform provides an engaging environment where students can test their knowledge across various academic strands including STEM, ABM, HUMSS, TVL, TRM, CPG, CSS, HRS, and SPT.

The application offers a modern, responsive interface with support for both light and dark modes, bilingual content (English and Filipino), and gamification elements such as leaderboards, streaks, and performance tracking to motivate continuous learning.

### Key Highlights

- **Multi-strand Support**: Covers all major Senior High School academic tracks
- **Bilingual Interface**: Full English and Filipino language support
- **Gamification**: Leaderboards, streaks, achievements, and progress tracking
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Dark Mode**: Eye-friendly dark theme for comfortable studying
- **Interactive Dashboard**: Personal learning analytics and performance visualization

---

## Purpose

The primary purpose of QuizMaster is to:

1. **Democratize Education**: Provide free, accessible educational resources to Filipino students regardless of their socioeconomic background.

2. **Enhance Learning Through Engagement**: Transform traditional studying into an interactive and enjoyable experience using gamification techniques.

3. **Support K-12 Curriculum**: Align quiz content with the Philippine K-12 Senior High School curriculum across all academic and technical-vocational strands.

4. **Promote Self-Paced Learning**: Enable students to study at their own pace with practice modes, reviews, and immediate feedback.

5. **Bridge Language Barriers**: Offer bilingual support to ensure students can learn in the language they are most comfortable with.

---

## Objectives

### Primary Objectives

| # | Objective | Description |
|---|-----------|-------------|
| 1 | **Interactive Assessment** | Deliver quizzes with multiple question formats, instant feedback, and detailed explanations |
| 2 | **Progress Tracking** | Enable students to monitor their learning journey through dashboards, charts, and statistics |
| 3 | **Competitive Learning** | Foster healthy competition through leaderboards and achievement systems |
| 4 | **Accessibility** | Ensure the platform is accessible across devices and to users with varying technical capabilities |
| 5 | **Localization** | Provide complete English and Filipino language options throughout the platform |

### Secondary Objectives

- Create a visually appealing and intuitive user interface
- Implement secure user authentication and data management
- Support various quiz modes (timed quizzes, practice mode, review mode)
- Enable students to track and review their mistakes for effective learning
- Build a scalable architecture for future feature additions

---

## Features

### Authentication & User Management
- ✅ User registration with email validation
- ✅ Login/logout functionality
- ✅ Password strength validation (12+ characters, uppercase, numbers, symbols)
- ✅ reCAPTCHA integration for bot prevention
- ✅ Social login buttons (Google, Facebook - UI only)
- ✅ Session management via localStorage

### Quiz System
- ✅ Multiple academic strands (STEM, ABM, HUMSS, TVL, TRM, CPG, CSS, HRS, SPT)
- ✅ Subject-specific question banks
- ✅ Three quiz modes: Start Quiz, Practice, Review
- ✅ Timer functionality during quizzes
- ✅ Shuffled questions and answers for randomization
- ✅ Immediate scoring and results display
- ✅ Wrong answer tracking for review mode

### Dashboard
- ✅ Personalized welcome message
- ✅ Quizzes completed counter
- ✅ Day streak tracking
- ✅ Average score display
- ✅ Leaderboard ranking
- ✅ Performance bar chart by subject
- ✅ Weekly activity line chart
- ✅ Recent assessments list

### Leaderboard
- ✅ Top 10 players display
- ✅ Full leaderboard with sorting options
- ✅ Score, percentage, and streak display
- ✅ Detailed answer review modal
- ✅ Hot/cold streak indicators

### User Experience
- ✅ Dark/light mode toggle with persistence
- ✅ English/Filipino language switching
- ✅ Responsive mobile design
- ✅ Smooth animations and transitions
- ✅ Toast notifications for user feedback
- ✅ Help & support contact information

---

## Technology Stack

| Category | Technology |
|----------|------------|
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) |
| **Styling** | Custom CSS with CSS Variables, Flexbox, Grid |
| **Fonts** | Google Fonts (Lexend, Inter) |
| **Icons** | Image assets with emoji fallbacks |
| **Charts** | Custom SVG charts |
| **Security** | Google reCAPTCHA v2 |
| **Storage** | Browser localStorage |
| **Server** | XAMPP (Apache HTTP Server) |

---

## Project Structure

```
Online Quiz/
├── homepage.html           # Main landing page
├── login.html              # Authentication page (signup/login)
├── dashboard.html          # User dashboard
├── leaderboard.html        # Leaderboard page
├── assets/
│   ├── css/
│   │   ├── homepage.css    # Homepage styles
│   │   ├── login.css       # Auth page styles
│   │   ├── dashboard.css   # Dashboard styles
│   │   └── leaderboard.css # Leaderboard styles
│   ├── js/
│   │   ├── pages/
│   │   │   ├── homepage.js      # Homepage functionality
│   │   │   ├── login.js         # Auth logic & validation
│   │   │   ├── dashboard.js     # Dashboard functionality & charts
│   │   │   └── leaderboard.js   # Leaderboard logic
│   │   └── utils/
│   │       ├── api.js
│   │       ├── db.js
│   │       ├── language.js
│   │       └── toast.js
│   └── images/
│       ├── homepage/       # Homepage image assets
│       ├── dashboard/      # Dashboard image assets
│       └── leaderboard/    # Leaderboard image assets
│
├── categories/             # Quiz categories module
│   ├── index.html          # Category selection & quiz interface
│   ├── script.js           # Quiz logic & question banks
│   └── styles.css          # Category page styles
│
└── README.md               # This documentation file
```

---

## Installation & Setup

### Prerequisites
- XAMPP (or any local web server with Apache)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Steps

1. **Install XAMPP**
   - Download and install XAMPP from [apachefriends.org](https://www.apachefriends.org/)

2. **Clone/Copy Project**
   ```bash
   # Navigate to XAMPP htdocs folder
   cd C:\xampp\htdocs
   
   # Clone or copy the "Online Quiz" folder here
   ```

3. **Start Apache Server**
   - Open XAMPP Control Panel
   - Click "Start" next to Apache

4. **Access the Application**
   - Open your browser
   - Navigate to: `http://localhost/Online Quiz/homepage.html`

---

## Usage Guide

### Getting Started
1. Visit the homepage and click "Log In" or "Sign Up"
2. Create an account with a valid email and strong password
3. Complete the reCAPTCHA verification
4. You'll be redirected to the homepage upon successful registration

### Taking a Quiz
1. Click "Start Quiz" or navigate to "Categories"
2. Select your academic strand (e.g., STEM, ABM)
3. Choose a subject
4. Select quiz mode:
   - **Start Quiz**: Standard timed quiz
   - **Practice**: All questions, tracks mistakes
   - **Review**: Only questions you previously got wrong
5. Answer questions and submit
6. View your results and detailed breakdown

### Dashboard
1. Access via the "Dashboard" link (requires login)
2. View your statistics, charts, and recent assessments
3. Track your progress over time

### Leaderboard
1. View top performers and rankings
2. Switch between "Top 10" and "Full Leaderboard"
3. Click "Answer" to see a player's detailed quiz responses

---

## Audit & Improvement Recommendations

This section provides a comprehensive audit of the current codebase with prioritized recommendations for improvement.

### 🔴 Critical Issues

#### 1. Security Vulnerabilities

| Issue | Location | Risk Level | Description |
|-------|----------|------------|-------------|
| **Plaintext Password Storage** | `assets/js/pages/login.js` | 🔴 Critical | User passwords are stored in localStorage without encryption. This exposes all user credentials to XSS attacks and anyone with browser access. |
| **No Backend Authentication** | All JS files | 🔴 Critical | Authentication is entirely client-side. Anyone can bypass login by manipulating localStorage directly in the browser console. |
| **XSS Vulnerability Risk** | `assets/js/pages/homepage.js` | 🔴 High | User-generated content in reviews uses `innerHTML` with an `esc()` function, but the implementation should be audited for completeness. |
| **Non-functional OAuth** | `login.html` | 🟡 Medium | Google/Facebook login buttons redirect to actual OAuth endpoints without proper integration, potentially confusing users. |

**Recommendations:**
```
✓ Implement a backend server (Node.js, PHP, Python) for authentication
✓ Use bcrypt or Argon2 for password hashing
✓ Store sessions via HTTP-only cookies with CSRF tokens
✓ Implement proper OAuth 2.0 flow for social logins
✓ Add Content Security Policy (CSP) headers
```

#### 2. Broken Navigation Links

| Issue | Location | Current Link | Should Be |
|-------|----------|--------------|-----------|
| Dead link | `dashboard.html`, `leaderboard.html` | `quizmaster_final.html` | `homepage.html` |
| Missing categories link | `homepage.html` | `#categories` anchor | `categories/index.html` |

**Recommendation:** Audit all navigation links and create a consistent routing system.

---

### 🟠 High Priority Improvements

#### 3. Code Duplication & Architecture

| Issue | Description | Files Affected |
|-------|-------------|----------------|
| **Duplicate DB Object** | The `DB` helper object is duplicated across multiple files | `assets/js/pages/homepage.js`, `assets/js/pages/login.js`, `assets/js/pages/dashboard.js` |
| **Duplicate Language Logic** | Language switching code is repeated in each file | All JS files |
| **Inconsistent Naming** | Mixed naming conventions for JavaScript files | Standardized to `assets/js/pages/*.js` |

**Recommendations:**
```javascript
// Create a shared utilities module
// utils/db.js - Single source of truth for data operations
// utils/language.js - Centralized language handling
// utils/toast.js - Unified notification system

// Proposed file naming convention:
// homepage.js, login.js, dashboard.js, leaderboard.js
```

#### 4. Data Persistence

| Issue | Impact |
|-------|--------|
| localStorage only | Data is lost when clearing browser data or switching browsers |
| No data synchronization | User progress doesn't sync across devices |
| Size limitations | localStorage limited to ~5-10MB |

**Recommendations:**
- Implement backend API with database (MySQL, PostgreSQL, MongoDB)
- Add offline mode with service workers for progressive web app (PWA) capability
- Implement data export/import functionality

---

### 🟡 Medium Priority Improvements

#### 5. Accessibility (a11y)

| Issue | Location | WCAG Level |
|-------|----------|------------|
| Missing `alt` attributes on some images | Multiple HTML files | A |
| Inconsistent focus indicators | CSS files | AA |
| Insufficient color contrast in some areas | Dark mode theme | AA |
| Missing ARIA labels | Interactive elements | A |
| Keyboard navigation incomplete | Modal dialogs | A |

**Recommendations:**
```html
<!-- Add proper alt texts -->
<img src="trophy.png" alt="QuizMaster trophy logo">

<!-- Add ARIA labels -->
<button aria-label="Toggle dark mode" class="dark-toggle">

<!-- Add focus-visible styles -->
button:focus-visible {
  outline: 2px solid var(--focus-blue);
  outline-offset: 2px;
}
```

#### 6. Performance Optimization

| Issue | Current State | Recommendation |
|-------|---------------|----------------|
| **Multiple CSS files** | 5 separate CSS files | Bundle and minify into one file |
| **No caching strategy** | Resources reload each time | Implement cache headers and service worker |
| **Large JS files** | Monolithic scripts | Split into modules, use lazy loading |
| **Unoptimized images** | PNG format | Convert to WebP, add lazy loading |
| **No CDN usage** | Local hosting only | Use CDN for fonts, common libraries |

#### 7. Code Quality

| Issue | Files | Recommendation |
|-------|-------|----------------|
| Console.log statements | Multiple | Remove or replace with proper logging |
| Magic numbers | CSS, JS | Use CSS variables and constants |
| Long functions | `script.js` (1700+ lines) | Split into smaller, focused functions |
| Missing error handling | API-like operations | Add try-catch blocks, error boundaries |

---

### 🟢 Low Priority Enhancements

#### 8. User Experience Improvements

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| **Loading States** | Add skeleton screens and loading indicators | Low |
| **Form Auto-save** | Save quiz progress periodically | Low |
| **Animations** | Add micro-interactions for better feedback | Low |
| **Sound Effects** | Optional audio feedback for correct/wrong answers | Low |
| **Keyboard Shortcuts** | Power user features | Low |

#### 9. Feature Additions

| Feature | Description | Complexity |
|---------|-------------|------------|
| **Question Creation** | Allow teachers/admins to create quizzes | High |
| **Multiplayer Mode** | Real-time quiz battles | High |
| **Achievement System** | Badges and rewards | Medium |
| **Study Groups** | Collaborative learning features | High |
| **Mobile App** | PWA or native app | High |
| **Analytics Dashboard** | Admin insights on user performance | Medium |

---

### 📊 Technical Debt Summary

| Category | Issues Found | Critical | High | Medium | Low |
|----------|--------------|----------|------|--------|-----|
| Security | 4 | 2 | 1 | 1 | 0 |
| Architecture | 5 | 0 | 3 | 1 | 1 |
| Code Quality | 6 | 0 | 1 | 3 | 2 |
| Accessibility | 5 | 0 | 1 | 3 | 1 |
| Performance | 5 | 0 | 1 | 2 | 2 |
| **Total** | **25** | **2** | **7** | **10** | **6** |

---

### 🛠️ Recommended Improvement Roadmap

#### Phase 1: Critical Security Fixes (Week 1-2)
1. Set up backend server (Node.js + Express recommended)
2. Implement secure authentication with password hashing
3. Replace localStorage auth with HTTP-only sessions
4. Fix broken navigation links

#### Phase 2: Architecture Refactoring (Week 3-4)
1. Create shared utility modules
2. Standardize file naming conventions
3. Set up database for persistent storage
4. Implement proper API endpoints

#### Phase 3: Quality Improvements (Week 5-6)
1. Add comprehensive error handling
2. Implement accessibility improvements
3. Bundle and minify assets
4. Add proper loading states

#### Phase 4: Feature Enhancements (Week 7+)
1. Implement PWA functionality
2. Add advanced quiz features
3. Build admin dashboard
4. Mobile optimization

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Style Guidelines
- Use 4-space indentation
- Follow ES6+ JavaScript conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

---

## License

This project is developed for educational purposes.

---

## Contact

For support or inquiries:
- 📧 Email: support@quizmaster.com
- 📞 Phone: +1 (555) 123-4567
- 📍 Address: 123 Learning Street, Education City, EC 12345

---

**Made with ❤️ for Filipino Students**

*Last Updated: February 2026*
