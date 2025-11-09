# HireCorrecto Architecture Documentation

## Table of Contents

- [System Overview](#system-overview)
- [High-Level Architecture](#high-level-architecture)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Database Schema](#database-schema)
- [API Design](#api-design)
- [Security Architecture](#security-architecture)
- [AI Integration](#ai-integration)
- [Real-time Communication](#real-time-communication)
- [Deployment Architecture](#deployment-architecture)

## System Overview

HireCorrecto is a full-stack MERN (MongoDB, Express, React, Node.js) application that provides AI-powered interview capabilities using Google's Gemini Live API. The system enables recruiters to create interview templates, invite candidates, and conduct automated interviews with real-time analysis and cheating detection.

### Key Capabilities

- **Automated Interview Management**: Create, schedule, and manage interview templates
- **AI-Powered Analysis**: Real-time conversation analysis using Gemini Live API
- **Cheating Detection**: Visual and behavioral analysis for integrity
- **Real-time Communication**: WebSocket-based live interview sessions
- **Comprehensive Reporting**: Detailed analytics with video recordings and transcripts
- **Token Cost Tracking**: Monitor AI API usage and costs

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Browser                          │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  React Application (Port 5173)                            │ │
│  │  - React Router (Client-side routing)                     │ │
│  │  - Socket.IO Client (Real-time communication)             │ │
│  │  - Axios (HTTP requests)                                  │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTPS/WebSocket
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                    Express Server (Port 5004)                    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  REST API (Express)                                       │ │
│  │  - Authentication (JWT)                                   │ │
│  │  - Interview Management                                   │ │
│  │  - File Uploads                                           │ │
│  │  - Reports & Analytics                                    │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Socket.IO Server                                         │ │
│  │  - Real-time interview sessions                           │ │
│  │  - Gemini Live integration                                 │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────┬───────────────────────────────┬───────────────────┘
            │                                 │
    ┌───────▼───────┐              ┌─────────▼──────────┐
    │   MongoDB     │              │  Gemini Live API    │
    │   Database    │              │  (Google Cloud)      │
    └───────────────┘              └─────────────────────┘
```

## Component Architecture

### Frontend (React + Vite)

```
client/src/
├── components/              # Reusable UI components
│   ├── LoadingSpinner.jsx  # Loading indicator
│   └── RichTextEditor.jsx    # Rich text input component
│
├── contexts/               # React Context providers
│   └── AuthContext.jsx     # Authentication state management
│
├── pages/                  # Page components (routes)
│   ├── Login.jsx          # User login page
│   ├── Register.jsx       # User registration
│   ├── RecruiterDashboard.jsx  # Recruiter main dashboard
│   ├── CandidateDashboard.jsx # Candidate main dashboard
│   ├── CreateInterview.jsx     # Interview creation form
│   ├── InterviewDetails.jsx    # Interview details view
│   ├── InterviewSession.jsx    # Live interview interface
│   └── InterviewResults.jsx   # Results and analytics
│
├── services/               # API communication layer
│   └── api.js             # Axios-based API client with interceptors
│
├── App.jsx                # Main app component with routing
├── main.jsx               # Application entry point
└── index.css              # Global styles (TailwindCSS)
```

### Backend (Node.js + Express)

```
server/
├── models/                 # MongoDB data models (Mongoose)
│   ├── User.js            # User schema (recruiter/candidate)
│   ├── Interview.js       # Interview schema with questions
│   └── Invitation.js      # Invitation schema with tokens
│
├── routes/                 # Express route handlers
│   ├── auth.js            # Authentication endpoints
│   ├── interviews.js      # Interview CRUD operations
│   ├── upload.js          # File upload handling
│   └── reports.js         # Analytics and reporting
│
├── services/               # Business logic services
│   ├── gemini.js          # Gemini AI integration
│   │   ├── Session management
│   │   ├── Question generation
│   │   ├── Audio/video processing
│   │   ├── Cheating detection
│   │   └── Cost calculation
│   └── email.js           # Email service (Nodemailer)
│
├── middleware/             # Express middleware
│   └── auth.js            # JWT authentication & authorization
│
├── uploads/                # File storage (local)
├── index.js                # Server entry point
│   ├── Express app setup
│   ├── Socket.IO server
│   ├── MongoDB connection
│   └── Route registration
└── package.json
```

## Data Flow

### 1. User Authentication Flow

```
┌─────────┐      ┌──────────────┐      ┌─────────────┐      ┌──────────┐
│ Client  │─────►│ Auth Route   │─────►│ User Model  │─────►│ MongoDB  │
│ Browser │      │ (POST /login)│      │ (validate)  │      │ Database │
└─────────┘      └──────────────┘      └─────────────┘      └──────────┘
     │                  │                      │
     │                  ▼                      │
     │          ┌──────────────┐              │
     │          │ JWT Token    │              │
     │          │ Generation   │              │
     │          └──────────────┘              │
     │                  │                      │
     └──────────────────┼──────────────────────┘
                        │
                        ▼
                 ┌──────────────┐
                 │ LocalStorage │
                 │ (Client)     │
                 └──────────────┘
```

### 2. Interview Creation Flow

```
┌─────────────┐
│ Recruiter   │
│ Creates     │
│ Interview   │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ POST /interviews │
│ (with skills,    │
│  questions, etc) │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Interview Model  │
│ (Save to DB)     │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Generate         │
│ Invite Token     │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Send Email       │
│ Invitation       │
└──────────────────┘
```

### 3. Interview Session Flow

```
┌─────────────┐
│ Candidate   │
│ Starts      │
│ Interview   │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Socket.IO        │
│ Connection       │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Initialize       │
│ Gemini Session   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Generate First  │
│ Question        │
└──────┬──────────┘
       │
       ▼
┌──────────────────┐
│ Candidate        │
│ Records Video    │
│ Answer           │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Upload Video     │
│ to Server        │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Process with     │
│ Gemini API       │
│ (Analysis +      │
│  Cheating Det.)  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Save Results     │
│ to Database      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Generate Next    │
│ Question or      │
│ End Interview    │
└──────────────────┘
```

## Database Schema

### User Collection

```javascript
{
  _id: ObjectId,
  email: String (unique, lowercase),
  password: String (hashed with bcrypt),
  role: String (enum: ['recruiter', 'candidate']),
  firstName: String,
  lastName: String,
  isActive: Boolean (default: true),
  isTemporary: Boolean (default: false),
  temporaryExpiresAt: Date,
  lastLogin: Date,
  createdAt: Date
}
```

**Indexes:**
- `email` (unique)

**Methods:**
- `comparePassword(candidatePassword)` - Compare password with hash
- `fullName` (virtual) - Get full name

### Interview Collection

```javascript
{
  _id: ObjectId,
  title: String (required),
  description: String (required),
  expectedSkills: [{
    skill: String,
    topics: [String],
    weight: Number (0-100, default: 20)
  }],
  experienceRange: String (enum: ['entry', 'junior', 'mid', 'senior', 'lead', 'principal']),
  dateWindow: {
    start: Date,
    end: Date
  },
  passPercentage: Number (0-100, default: 70),
  duration: Number (minutes, default: 30),
  maxQuestions: Number (default: 5),
  mandatoryQuestions: [{
    text: String,
    skills: [String]
  }],
  optionalQuestions: [{
    text: String,
    skills: [String]
  }],
  mandatoryWeightage: Number (0-100),
  optionalWeightage: Number (0-100),
  questionHealth: [{
    questionId: String,
    questionText: String,
    candidateId: ObjectId,
    candidateEmail: String,
    askedAt: Date,
    questionType: String (enum: ['mandatory', 'optional', 'generated'])
  }],
  recruiterId: ObjectId (ref: 'User'),
  candidateId: ObjectId (ref: 'User'),
  candidateEmail: String,
  status: String (enum: ['draft', 'invited', 'in_progress', 'completed', 'cancelled']),
  questions: [{
    id: String (UUID),
    text: String,
    type: String,
    order: Number,
    skillsTargeted: [String],
    videoUrl: String,
    transcript: String,
    evaluation: {
      relevance: Number (0-10),
      fluency: Number (0-10),
      overall_score: Number (0-10),
      score_label: String (enum: ['pass', 'weak', 'fail']),
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
    },
    answeredAt: Date
  }],
  inviteToken: String (unique),
  inviteSentAt: Date,
  startedAt: Date,
  completedAt: Date,
  geminiModel: String,
  totalTokenUsage: {
    input_tokens: Number,
    output_tokens: Number,
    total_tokens: Number
  },
  totalCost: Number (USD),
  aggregateScores: {
    averageRelevance: Number,
    averageFluency: Number,
    overallScore: Number,
    overallCheatRisk: Number
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `recruiterId`
- `candidateId`
- `candidateEmail`
- `inviteToken` (unique)
- `status`

### Invitation Collection

```javascript
{
  _id: ObjectId,
  interviewId: ObjectId (ref: 'Interview'),
  candidateEmail: String (lowercase),
  candidateId: ObjectId (ref: 'User'),
  inviteToken: String (unique),
  temporaryPassword: String,
  status: String (enum: ['pending', 'accepted', 'started', 'completed', 'expired']),
  invitedBy: ObjectId (ref: 'User'),
  invitedAt: Date,
  acceptedAt: Date,
  startedAt: Date,
  completedAt: Date,
  expiresAt: Date,
  isTemporary: Boolean (default: true)
}
```

**Indexes:**
- `interviewId` + `candidateEmail` (compound)
- `inviteToken` (unique)
- `candidateId`

**Methods:**
- `isExpired()` - Check if invitation expired
- `canBeUsed()` - Check if invitation can be used

## API Design

### RESTful Endpoints

All endpoints follow RESTful conventions with JSON request/response:

**Base URL:** `/api`

**Authentication:**
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires auth)

**Interviews:**
- `POST /api/interviews` - Create interview (recruiter only)
- `GET /api/interviews` - List user's interviews
- `GET /api/interviews/:id` - Get interview details
- `POST /api/interviews/:id/invite` - Invite candidate
- `GET /api/interviews/:id/invitations` - List invitations
- `DELETE /api/interviews/:id/invitations/:invitationId` - Revoke invitation
- `POST /api/interviews/:id/start` - Start interview
- `POST /api/interviews/:id/questions/:questionId/answer` - Submit answer
- `POST /api/interviews/:id/complete` - Complete interview

**Uploads:**
- `GET /api/upload/url/:interviewId/:questionId` - Get upload URL
- `POST /api/upload/:interviewId/:questionId` - Upload video

**Reports:**
- `GET /api/reports/interviews/:id/results` - Get interview results
- `GET /api/reports/dashboard` - Get dashboard metrics
- `GET /api/reports/interviews/:id/export/csv` - Export CSV
- `GET /api/reports/interviews/:id/export/json` - Export JSON

### WebSocket Events (Socket.IO)

**Client → Server:**
- `join-interview` - Join interview room
  ```javascript
  { interviewId: string, userRole: string }
  ```
- `start-gemini-session` - Initialize AI session
  ```javascript
  { interviewId: string, candidateId: string }
  ```
- `gemini-audio` - Send audio/video data
  ```javascript
  {
    sessionId: string,
    videoData: string (base64),
    questionId: string,
    questionText: string,
    imageFrames: string[],
    timestamps: number[]
  }
  ```

**Server → Client:**
- `gemini-session-ready` - Session initialized
  ```javascript
  {
    sessionId: string,
    firstQuestion: { id, text, type, order }
  }
  ```
- `gemini-response` - AI analysis response
  ```javascript
  {
    question_id: string,
    transcript: string,
    evaluation: { relevance, fluency, overall_score, score_label, comment },
    cheating: { cheat_score, cheat_flags, summary },
    token_usage: { input_tokens, output_tokens },
    next_action: string,
    nextQuestion?: { id, text, type, order }
  }
  ```
- `gemini-error` - Error occurred
  ```javascript
  { message: string, error?: string }
  ```

## Security Architecture

### Authentication & Authorization

1. **JWT Tokens**
   - Stateless authentication
   - Configurable expiration (`JWT_EXPIRES_IN`)
   - Token stored in client localStorage
   - Token included in `Authorization: Bearer <token>` header

2. **Role-Based Access Control**
   - Two roles: `recruiter` and `candidate`
   - Middleware: `requireRole(['recruiter'])` for protected routes
   - Frontend route protection via `AuthContext`

3. **Password Security**
   - bcrypt hashing with salt rounds (10)
   - Minimum 6 characters
   - Hashed before saving to database

### Data Protection

1. **Input Validation**
   - `express-validator` middleware
   - Email normalization
   - Input sanitization
   - File type and size validation

2. **SQL Injection Prevention**
   - Mongoose ODM (parameterized queries)
   - No raw SQL queries

3. **XSS Protection**
   - Helmet.js security headers
   - Content Security Policy
   - Input sanitization

4. **CORS Configuration**
   - Restricted origins (`CLIENT_URL`)
   - Credentials enabled
   - Configurable per environment

5. **Rate Limiting**
   - General: 100 requests per 15 minutes (production)
   - Auth: 10 login attempts per 15 minutes
   - More lenient in development

### File Upload Security

1. **File Type Validation**
   - Video files only (WebM, MP4)
   - Text files for questions (.txt)

2. **Size Limits**
   - Videos: 100MB maximum
   - Text files: 5MB maximum

3. **Storage**
   - Local filesystem (configurable)
   - Secure file paths
   - Proper permissions

## AI Integration

### Gemini Live API Integration

The system uses Google's Gemini API for:

1. **Question Generation**
   - First question based on interview template
   - Follow-up questions based on previous answers
   - Skill-based question targeting

2. **Audio/Video Processing**
   - Real-time transcription
   - Multi-dimensional evaluation (relevance, fluency)
   - Cheating detection analysis

3. **Session Management**
   - Session initialization per interview
   - Context preservation across questions
   - Token usage tracking

### Model Support

- **Primary Model**: `gemini-2.5-pro` (best quality)
- **Fallback Models**: `gemini-pro`, `gemini-1.5-flash`, `gemini-1.5-pro`
- **Automatic Fallback**: If primary model unavailable, tries fallbacks in order

### Cost Tracking

- Real-time token counting (input/output)
- Cost calculation in USD (per model pricing)
- INR conversion (configurable rate)
- Per-interview and aggregate tracking

## Real-time Communication

### Socket.IO Architecture

```
Client                    Server                    Gemini API
  │                         │                           │
  │── join-interview ──────►│                           │
  │                         │                           │
  │◄── connected ───────────│                           │
  │                         │                           │
  │── start-gemini-session─►│                           │
  │                         │── Initialize Session ────►│
  │                         │◄── Session ID ────────────│
  │                         │                           │
  │◄── gemini-session-ready─│                           │
  │                         │                           │
  │── gemini-audio ────────►│                           │
  │                         │── Process Audio ────────►│
  │                         │◄── Analysis ──────────────│
  │◄── gemini-response ─────│                           │
  │                         │                           │
```

### Connection Management

- **Transport**: WebSocket with polling fallback
- **Reconnection**: Automatic with 5 attempts
- **Room-based**: Each interview has its own room
- **Error Handling**: Graceful error messages to client

## Deployment Architecture

### Development Environment

```
Local Machine
├── React Dev Server (Vite) - Port 5173
│   └── Proxy: /api → http://localhost:5004
├── Express Server (Nodemon) - Port 5004
├── MongoDB (Local or Atlas)
└── Environment Variables (.env)
```

### Production - Docker Compose

```
Docker Network
├── Nginx Container (Port 80)
│   ├── Serves React build (static files)
│   └── Proxies /api → server:5004
├── Express Container (Port 5004)
│   ├── API Server
│   └── Socket.IO Server
├── MongoDB Container (Port 27017)
└── Volumes
    └── uploads/ (persistent storage)
```

### Production - Separate Deployment

```
┌─────────────────┐         ┌─────────────────┐
│   Netlify       │         │     Render      │
│   (Frontend)    │──────────►│   (Backend)     │
│                 │  HTTPS  │                 │
│  - Static Files │         │  - Express API  │
│  - React SPA    │         │  - Socket.IO   │
└─────────────────┘         └─────────────────┘
                                      │
                                      ▼
                            ┌─────────────────┐
                            │  MongoDB Atlas  │
                            │   (Database)    │
                            └─────────────────┘
```

**Configuration:**
- Frontend: `VITE_API_URL` environment variable
- Backend: `CLIENT_URL` environment variable for CORS

## Performance Considerations

### Frontend Optimization

- Code splitting with React Router
- Lazy loading of components
- Video compression (WebM, VP9 codec)
- Browser caching for static assets
- Tree shaking and minification

### Backend Optimization

- Database indexing on frequently queried fields
- Connection pooling (Mongoose)
- Efficient queries with `.populate()`
- Response compression (future)
- Caching layer (future: Redis)

### Video Processing

- Client-side compression before upload
- Chunked upload for large files
- Progressive upload with progress tracking
- CDN integration (future)

## Scalability Design

### Horizontal Scaling

- **Stateless Backend**: JWT-based auth (no session storage)
- **Database Sharding**: MongoDB supports sharding
- **Load Balancing**: Nginx reverse proxy
- **Microservices**: Service separation (future)

### Vertical Scaling

- Resource monitoring (CPU, memory, disk)
- Auto-scaling with Docker Swarm/Kubernetes
- Database query optimization
- Multi-level caching strategy

---

This architecture provides a solid foundation for the HireCorrecto platform while maintaining flexibility for future enhancements and scalability requirements.

