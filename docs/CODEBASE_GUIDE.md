# Codebase Guide

This guide provides a detailed walkthrough of the important codebases in HireCorrecto, explaining how different parts of the system work together.

## Table of Contents

- [Frontend Codebase](#frontend-codebase)
- [Backend Codebase](#backend-codebase)
- [Key Services](#key-services)
- [Data Models](#data-models)
- [API Integration](#api-integration)
- [Real-time Communication](#real-time-communication)

## Frontend Codebase

### Entry Point: `client/src/main.jsx`

```javascript
// Application entry point
// - Renders App component
// - Sets up React Router
// - Provides AuthContext
```

**Key Responsibilities:**
- Initialize React application
- Set up routing
- Provide authentication context

### Main App: `client/src/App.jsx`

**Purpose:** Main application component with routing and layout

**Key Features:**
- Route definitions for all pages
- Protected routes (require authentication)
- Role-based route protection (recruiter vs candidate)
- Navigation structure

**Important Routes:**
- `/login` - Authentication
- `/register` - User registration
- `/dashboard` - Role-based dashboard
- `/interview/create` - Create interview (recruiter)
- `/interview/:id` - Interview details
- `/interview/:id/session` - Live interview session
- `/interview/:id/results` - Interview results

### Authentication Context: `client/src/contexts/AuthContext.jsx`

**Purpose:** Global authentication state management

**Key Features:**
- User state management
- Login/logout functions
- Token management (localStorage)
- Protected route logic

**Usage:**
```javascript
const { user, login, logout, isAuthenticated } = useAuth();
```

### API Service: `client/src/services/api.js`

**Purpose:** Centralized API communication layer

**Key Features:**
- Axios instance with base configuration
- Request interceptors (adds JWT token)
- Response interceptors (handles 401 errors)
- Environment-aware URL configuration

**API Modules:**
- `authAPI` - Authentication endpoints
- `interviewAPI` - Interview management
- `uploadAPI` - File uploads
- `reportsAPI` - Analytics and reports

**URL Configuration:**
- Development: Uses Vite proxy (`/api`)
- Production: Uses `VITE_API_URL` environment variable
- Fallback: `/api` for Docker Compose

### Key Pages

#### `client/src/pages/InterviewSession.jsx`

**Purpose:** Live interview interface for candidates

**Key Features:**
- Socket.IO connection management
- Video recording and playback
- Real-time AI interaction
- Question navigation
- Progress tracking

**Important Functions:**
- `initializeSocket()` - Sets up WebSocket connection
- `startNaturalConversation()` - Begins interview
- `handleVideoRecording()` - Records candidate responses
- `submitAnswer()` - Sends answer to server

**Socket.IO Events:**
- `start-gemini-session` - Initialize AI session
- `gemini-audio` - Send video/audio data
- `gemini-response` - Receive AI analysis
- `gemini-error` - Handle errors

#### `client/src/pages/CreateInterview.jsx`

**Purpose:** Interview template creation for recruiters

**Key Features:**
- Multi-step form with sections
- Skill-based question configuration
- Mandatory/optional question upload
- Date window and duration settings
- Pass percentage configuration

**Form Sections:**
- Basic Information (title, description)
- Expected Skills (with weights)
- Questions (mandatory/optional)
- Configuration (duration, max questions)

#### `client/src/pages/RecruiterDashboard.jsx`

**Purpose:** Main dashboard for recruiters

**Key Features:**
- Interview list with filters
- Status indicators
- Quick actions (view, invite, delete)
- Metrics display
- Token usage tracking

## Backend Codebase

### Server Entry: `server/index.js`

**Purpose:** Main server file that sets up Express and Socket.IO

**Key Responsibilities:**
- Express app configuration
- Middleware setup (CORS, helmet, rate limiting)
- Route registration
- Socket.IO server setup
- MongoDB connection
- Error handling

**Important Sections:**
```javascript
// CORS Configuration
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Socket.IO Event Handlers
io.on('connection', (socket) => {
  // Handle socket events
});
```

### Authentication Middleware: `server/middleware/auth.js`

**Purpose:** JWT authentication and authorization

**Key Functions:**
- `authenticateToken` - Validates JWT token
- `requireRole` - Checks user role (recruiter/candidate)

**Usage:**
```javascript
router.get('/protected', authenticateToken, handler);
router.post('/admin', requireRole(['recruiter']), handler);
```

### Routes

#### `server/routes/auth.js`

**Endpoints:**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login with rate limiting
- `GET /api/auth/me` - Get current user
- `POST /api/auth/seed` - Create test accounts (dev only)

**Key Features:**
- Input validation with express-validator
- Password hashing with bcrypt
- JWT token generation
- Rate limiting on login

#### `server/routes/interviews.js`

**Endpoints:**
- `POST /api/interviews` - Create interview
- `GET /api/interviews` - List interviews
- `GET /api/interviews/:id` - Get interview details
- `POST /api/interviews/:id/invite` - Invite candidate
- `POST /api/interviews/:id/start` - Start interview
- `POST /api/interviews/:id/complete` - Complete interview

**Key Features:**
- File upload for questions (multer)
- Text file parsing
- Invitation token generation
- Email sending integration

#### `server/routes/upload.js`

**Endpoints:**
- `GET /api/upload/url/:interviewId/:questionId` - Get upload URL
- `POST /api/upload/:interviewId/:questionId` - Upload video

**Key Features:**
- Multer configuration for video uploads
- File size limits (100MB)
- Secure file storage
- File path generation

#### `server/routes/reports.js`

**Endpoints:**
- `GET /api/reports/interviews/:id/results` - Get interview results
- `GET /api/reports/dashboard` - Dashboard metrics
- `GET /api/reports/interviews/:id/export/csv` - CSV export
- `GET /api/reports/interviews/:id/export/json` - JSON export

**Key Features:**
- Aggregate score calculation
- Dashboard metrics computation
- CSV/JSON export generation
- Cost calculation (USD/INR)

## Key Services

### Gemini Service: `server/services/gemini.js`

**Purpose:** Google Gemini AI integration

**Key Classes:**
- `GeminiService` - Main service class

**Key Functions:**
- `initializeGemini(interviewId, candidateId, interviewData)` - Initialize session
- `generateFirstQuestion(sessionId)` - Generate first question
- `generateNextQuestion(sessionId, previousAnswer)` - Generate follow-up
- `processGeminiAudio(sessionId, mediaData, ...)` - Process audio/video
- `getSessionSummary(sessionId)` - Get session summary
- `calculateCost(inputTokens, outputTokens, model)` - Calculate API cost

**Session Management:**
```javascript
// Sessions stored in Map
this.sessions = new Map();

// Session structure
{
  id: string,
  interviewId: string,
  candidateId: string,
  interviewData: object,
  model: string,
  answeredQuestions: array
}
```

**Model Support:**
- Primary: `gemini-2.5-pro`
- Fallbacks: `gemini-pro`, `gemini-1.5-flash`, `gemini-1.5-pro`
- Automatic fallback if primary unavailable

**Cost Calculation:**
- Per-model pricing (USD per 1M tokens)
- Input/output token tracking
- INR conversion (configurable rate)

### Email Service: `server/services/email.js`

**Purpose:** Email sending for invitations

**Key Functions:**
- `sendInviteEmailWithCredentials(email, inviteToken, ...)` - Send invitation
- `sendLoginCredentials(email, password, ...)` - Send login credentials

**Configuration:**
- Nodemailer with SMTP
- HTML email templates
- Magic link generation

## Data Models

### User Model: `server/models/User.js`

**Schema:**
```javascript
{
  email: String (unique, lowercase),
  password: String (hashed),
  role: String (enum: ['recruiter', 'candidate']),
  firstName: String,
  lastName: String,
  isActive: Boolean,
  isTemporary: Boolean,
  temporaryExpiresAt: Date,
  lastLogin: Date,
  createdAt: Date
}
```

**Methods:**
- `comparePassword(candidatePassword)` - Password comparison
- `fullName` (virtual) - Get full name

**Pre-save Hook:**
- Automatically hashes password before saving

### Interview Model: `server/models/Interview.js`

**Schema:** (See [ARCHITECTURE.md](ARCHITECTURE.md) for full schema)

**Key Fields:**
- `title`, `description` - Basic info
- `expectedSkills` - Array of skills with weights
- `questions` - Array of question objects with evaluations
- `status` - Interview lifecycle state
- `totalTokenUsage` - AI API usage tracking
- `totalCost` - Cost in USD
- `aggregateScores` - Overall performance metrics

**Question Structure:**
```javascript
{
  id: String (UUID),
  text: String,
  type: String,
  order: Number,
  videoUrl: String,
  transcript: String,
  evaluation: {
    relevance: Number (0-10),
    fluency: Number (0-10),
    overall_score: Number (0-10),
    score_label: String,
    comment: String
  },
  cheating: {
    cheat_score: Number (0-1),
    cheat_flags: [String],
    summary: String
  },
  token_usage: {
    input_tokens: Number,
    output_tokens: Number
  }
}
```

### Invitation Model: `server/models/Invitation.js`

**Schema:**
```javascript
{
  interviewId: ObjectId,
  candidateEmail: String,
  candidateId: ObjectId,
  inviteToken: String (unique),
  temporaryPassword: String,
  status: String (enum: ['pending', 'accepted', 'started', 'completed', 'expired']),
  expiresAt: Date,
  // ... timestamps
}
```

**Methods:**
- `isExpired()` - Check if invitation expired
- `canBeUsed()` - Check if invitation can be used

## API Integration

### Frontend API Calls

**Pattern:**
```javascript
// In component
import { interviewAPI } from '../services/api';

const interviews = await interviewAPI.getAll();
```

**Error Handling:**
- Automatic 401 handling (redirects to login)
- Toast notifications for errors
- Console logging for debugging

### Backend API Responses

**Success Response:**
```javascript
res.json({
  message: 'Success',
  data: { ... }
});
```

**Error Response:**
```javascript
res.status(400).json({
  message: 'Error message',
  errors: [ ... ] // Validation errors
});
```

## Real-time Communication

### Socket.IO Setup

**Server (`server/index.js`):**
```javascript
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"]
  }
});
```

**Client (`client/src/pages/InterviewSession.jsx`):**
```javascript
const socket = io(socketUrl, {
  transports: ['websocket', 'polling'],
  reconnection: true
});
```

### Event Flow

1. **Client connects** → Server emits `connection`
2. **Client joins interview** → `join-interview` event
3. **Client starts session** → `start-gemini-session` event
4. **Server initializes Gemini** → Creates session
5. **Server generates question** → Emits `gemini-session-ready`
6. **Client records answer** → `gemini-audio` event
7. **Server processes with Gemini** → Emits `gemini-response`
8. **Repeat** until interview complete

### Key Socket Events

**Client → Server:**
- `join-interview` - Join interview room
- `start-gemini-session` - Initialize AI session
- `gemini-audio` - Send video/audio data

**Server → Client:**
- `gemini-session-ready` - Session initialized
- `gemini-response` - AI analysis result
- `gemini-error` - Error occurred

## File Upload Flow

1. **Client requests upload URL**
   ```javascript
   const { uploadUrl } = await uploadAPI.getUploadUrl(interviewId, questionId);
   ```

2. **Client uploads video**
   ```javascript
   await uploadAPI.uploadVideo(interviewId, questionId, file);
   ```

3. **Server processes upload**
   - Multer handles file
   - Saves to `server/uploads/`
   - Returns file path

4. **File used in Gemini processing**
   - Video analyzed for cheating detection
   - Audio extracted for transcription

## Error Handling Patterns

### Frontend

```javascript
try {
  const result = await api.call();
  toast.success('Success');
} catch (error) {
  toast.error(error.response?.data?.message || 'Error occurred');
  console.error(error);
}
```

### Backend

```javascript
try {
  // Logic here
  res.json({ success: true });
} catch (error) {
  console.error('Error:', error);
  res.status(500).json({ 
    message: 'Server error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}
```

## Environment Configuration

### Development
- Frontend: Vite proxy to backend (`/api` → `http://localhost:5004`)
- Backend: CORS allows `http://localhost:5173`
- Socket.IO: Connects to `http://localhost:5004`

### Production (Separate Deployment)
- Frontend: Uses `VITE_API_URL` environment variable
- Backend: CORS allows `CLIENT_URL` environment variable
- Socket.IO: Uses `VITE_API_URL` (removes `/api` suffix)

### Docker Compose
- Frontend: Nginx proxies `/api` to backend service
- Backend: Internal Docker network
- Socket.IO: Uses relative path

---

This guide covers the most important parts of the codebase. For more details, refer to:
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) - Developer onboarding
- [README.md](../README.md) - Project overview

