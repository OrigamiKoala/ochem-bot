# CLAUDE.md

## System Overview

`ochem-bot` is an interactive AI-assisted web application designed to help students practice organic chemistry and chemistry olympiad (USNCO/IChO) problems. It features whiteboard drawing, mechanism verification, product prediction, step-by-step hints, and AI grading.

### Architecture

- **Frontend**: Vite + React 19 (`src/`).
  - `src/App.jsx`: Main application state management, question queueing, grading triggers, and canvas control.
  - `src/components/`: Modular React components including `ReactionPanel`, `WhiteboardPanel`, `MoleculeCanvas`, `SettingsModal`, `AboutModal`, and `MessageContainer`.
  - `src/utils/`: Utilities for API communication, MathJax rendering, SMILES chemical parsing, local storage state persistence, and SSE streaming.
- **Backend API**: Vercel Serverless Function (`api/chat.js`).
  - Connects to Google's Generative AI API (Gemini Interactions endpoint: `v1beta/interactions`).
  - Supports streaming SSE responses and fallback handling across rotating API keys and models.
  - `api/_keys.js`: Manages key pooling and rotation across multiple environment variable formats (`GEMINI_API_KEYS`, `api_1..api_N`, etc.).

### AI Model Hierarchy

- **Question Generation (`task === 'generate'`)**:
  1. `gemini-4-hydrogen` (Primary)
  2. `gemini-3.8-flash`
  3. `gemini-3.6-flash`
  4. `gemini-3.5-flash-lite`
  5. `gemini-3.1-flash-lite`
- **Grading & Feedback (`task === 'grade'`)**:
  1. `gemini-3.5-flash-lite`
  2. `gemini-3.1-flash-lite`

### Development Commands

- `npm run dev`: Starts the Vite local development server.
- `npm run build`: Builds production client assets to `dist/`.
- `npm run preview`: Previews the production build locally.
