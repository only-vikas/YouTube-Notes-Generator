# NoteOS

NoteOS is the intelligence layer for YouTube. It transforms any lecture, podcast, or tutorial into high-fidelity knowledge assets instantly.

## Features

- **Instant Note Generation:** Paste any YouTube URL and generate comprehensive notes in seconds.
- **Multiple Formats:** Choose between Textbook Style, Bullet Points, or Short Notes depending on your needs.
- **Neural Knowledge Engine:** Powered by advanced LLMs (Gemini Pro with OpenRouter fallback) to ensure deep, accurate summarization.
- **Export Options:** Download your notes as PDF, DOCX, or TXT, or simply copy them to your clipboard.
- **Note History Dashboard:** Create an account to silently save your generated notes and access them anytime from your personal dashboard.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **Authentication & Database:** Firebase (Auth & Firestore)
- **AI Models:** Google Gemini API (Primary) & OpenRouter (Fallback)
- **Document Generation:** `jspdf` (PDF), `docx` (Word)

## Local Development Setup

Follow these steps to run NoteOS locally on your machine.

### 1. Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn
- A Firebase project (for Auth and Firestore)
- API Keys for Gemini, OpenRouter (optional), and YouTube Data API (optional)

### 2. Clone and Install Dependencies

```bash
# Clone your repository
git clone https://github.com/yourusername/noteos.git
cd noteos

# Install dependencies
npm install
```

### 3. Environment Variables

Create a `.env.local` file in the root of your project and add the following variables:

```env
# Required: Your Google Gemini API Key
NEXT_PUBLIC_GEMINI_API_KEY="your_gemini_api_key_here"

# Optional: OpenRouter API Key for fallback AI generation
NEXT_PUBLIC_OPENROUTER_API_KEY="your_openrouter_api_key_here"

# Optional: YouTube Data API v3 Key (helps fetch accurate video metadata and duration)
YOUTUBE_API_KEY="your_youtube_api_key_here"
```

### 4. Firebase Configuration

The project uses a `firebase-applet-config.json` file for Firebase initialization. Ensure this file exists in the root of your project with your Firebase project details:

```json
{
  "apiKey": "your_firebase_api_key",
  "authDomain": "your_project_id.firebaseapp.com",
  "projectId": "your_project_id",
  "storageBucket": "your_project_id.appspot.com",
  "messagingSenderId": "your_sender_id",
  "appId": "your_app_id",
  "firestoreDatabaseId": "(default)"
}
```

*Note: If you downloaded this codebase directly from your working environment, this file should already be populated.*

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deployment

This project is optimized for deployment on Vercel or any platform that supports Next.js.

1. Push your code to GitHub.
2. Import the repository into Vercel.
3. Add your Environment Variables (`NEXT_PUBLIC_GEMINI_API_KEY`, etc.) in the Vercel dashboard.
4. Deploy!

## License

MIT License
