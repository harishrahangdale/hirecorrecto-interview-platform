# HireCorrecto - AI-Powered Interview Platform

A comprehensive MERN stack application that leverages Google's Gemini Live API for conducting intelligent, automated interviews with real-time analysis, cheating detection, and comprehensive reporting.

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Environment Setup](#-environment-setup)
- [Development](#-development)
- [Deployment](#-deployment)
- [API Documentation](#-api-documentation)
- [Documentation](#-documentation)
- [Contributing](#-contributing)

## 🚀 Features

### For Recruiters

- **Interview Template Creation**: Design custom interviews with skill-based questions, experience levels, and evaluation criteria
- **Candidate Invitation System**: Send email invitations with magic links and temporary credentials
- **Real-time Monitoring**: Track interview progress and candidate performance in real-time
- **Comprehensive Reports**: Detailed analytics with video recordings, transcripts, AI analysis, and cheating detection
- **Export Capabilities**: Export results as CSV, JSON with all interview data
- **Token Usage Tracking**: Monitor AI API usage and costs in real-time
- **Dashboard Analytics**: View metrics, completion rates, and performance insights
- **Question Management**: Upload mandatory and optional questions via text files or manual entry

### For Candidates

- **Seamless Experience**: Intuitive, user-friendly interview interface
- **Video Recording**: Automatic recording of responses for each question
- **Real-time Feedback**: Immediate AI-powered evaluation and scoring
- **Progress Tracking**: Visual progress indicators and question navigation
- **Fair Assessment**: Unbiased, consistent evaluation process
- **Magic Link Access**: Easy access via email invitation links

### AI-Powered Analysis

- **Gemini Live Integration**: Real-time conversation and analysis using Google's Gemini API
- **Intelligent Question Generation**: Dynamic question creation based on skills and candidate responses
- **Multi-dimensional Scoring**: Relevance, fluency, and overall performance metrics (0-10 scale)
- **Advanced Cheating Detection**: Visual and behavioral analysis with risk scoring (0-1 scale)
- **Adaptive Question Flow**: Dynamic follow-up questions based on previous answers
- **Token Cost Tracking**: Real-time monitoring of API costs in USD and INR
- **Model Selection**: Support for multiple Gemini models with automatic fallback

## 🛠️ Tech Stack

### Backend

- **Node.js** + **Express.js** - Server framework and REST API
- **MongoDB** + **Mongoose** - Database and ODM
- **Socket.IO** - Real-time WebSocket communication
- **JWT** - Stateless authentication
- **Multer** - File upload handling
- **Nodemailer** - Email service for invitations
- **Google Gemini AI** - AI analysis and conversation
- **bcryptjs** - Password hashing
- **express-validator** - Input validation
- **helmet** - Security headers
- **express-rate-limit** - Rate limiting

### Frontend

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TailwindCSS** - Utility-first CSS framework
- **React Router** - Client-side routing
- **Socket.IO Client** - Real-time communication
- **React Player** - Video playback component
- **Axios** - HTTP client
- **react-hot-toast** - Toast notifications
- **lucide-react** - Icon library
- **date-fns** - Date formatting

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **MongoDB** (local installation or MongoDB Atlas)
- **Google Gemini API Key** ([Get one here](https://makersuite.google.com/app/apikey))
- **SMTP Credentials** (for email invitations - Gmail App Password recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hirecorrecto_interview_platform
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Configure environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your configuration (see [Environment Setup](#-environment-setup))

4. **Start the application**
   ```bash
   # Start both frontend and backend
   npm run start:all
   
   # Or start separately
   npm run server  # Backend only
   npm run client  # Frontend only
   ```

5. **Access the application**
   - **Frontend**: http://localhost:5173
   - **Backend API**: http://localhost:5004
   - **Health Check**: http://localhost:5004/api/health

### Default Test Accounts

The system automatically creates these accounts on first run:

- **Recruiter**: `recruiter@hirecorrecto.com` / `Recruiter123`
- **Candidate**: `candidate@hirecorrecto.com` / `Candidate123`

## 📁 Project Structure

```
hirecorrecto_interview_platform/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── contexts/       # React contexts (Auth)
│   │   ├── pages/         # Page components
│   │   ├── services/       # API services
│   │   └── main.jsx       # Application entry point
│   ├── public/            # Static assets
│   ├── netlify.toml       # Netlify deployment config
│   └── package.json
│
├── server/                 # Node.js backend application
│   ├── models/            # MongoDB models (User, Interview, Invitation)
│   ├── routes/            # Express route handlers
│   ├── services/          # Business logic (Gemini, Email)
│   ├── middleware/        # Express middleware (Auth)
│   ├── uploads/           # File upload storage
│   └── index.js           # Server entry point
│
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md    # System architecture
│   ├── DEVELOPER_GUIDE.md # Developer onboarding
│   └── CODEBASE_GUIDE.md  # Codebase walkthrough
│
├── scripts/                # Utility scripts
├── docker-compose.yml      # Docker orchestration
├── render.yaml            # Render deployment config
├── env.example            # Environment variables template
└── package.json           # Root package configuration
```

## ⚙️ Environment Setup

Create a `.env` file in the root directory based on `env.example`:

### Required Variables

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/hirecorrecto

# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-pro  # Options: gemini-2.5-pro, gemini-1.5-pro, gemini-1.5-flash

# JWT Authentication
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Email Configuration (for invitations)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### Optional Variables

```env
# Server Configuration
PORT=5004
NODE_ENV=development

# Frontend/Backend URLs (for separate deployment)
CLIENT_URL=http://localhost:5173
VITE_API_URL=http://localhost:5004/api

# Storage
STORAGE_BACKEND=local
UPLOAD_DIR=./uploads

# Cost Calculation
USD_TO_INR_RATE=83.5
```

See `env.example` for detailed documentation of all variables.

## 💻 Development

### Available Scripts

```bash
# Install all dependencies
npm run install:all

# Start both frontend and backend
npm run start:all

# Start services separately
npm run server      # Backend only (port 5004)
npm run client      # Frontend only (port 5173)

# Build for production
npm run build       # Builds frontend to client/dist

# Run tests
npm test            # Run server tests
```

### Development Workflow

1. **Backend Development**
   - Server runs on `http://localhost:5004`
   - Uses nodemon for auto-reload
   - API endpoints under `/api/*`
   - Socket.IO for real-time communication

2. **Frontend Development**
   - Vite dev server on `http://localhost:5173`
   - Hot module replacement enabled
   - API calls proxied to backend via Vite config
   - React Router for client-side routing

3. **Database**
   - MongoDB connection via Mongoose
   - Models in `server/models/`
   - Seed accounts created automatically

## 🐳 Docker Deployment

### Using Docker Compose

```bash
# Build and start all services
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Individual Services

```bash
# Build server
docker build -t hirecorrecto-server ./server

# Build client
docker build -t hirecorrecto-client ./client
```

## 🌐 Separate Deployment

The application supports separate deployment of frontend and backend:

- **Frontend**: Deploy to Netlify, Vercel, or similar
- **Backend**: Deploy to Render, Railway, Heroku, or similar
  - Supports both **Direct Node.js** and **Docker** deployment on Render

See `DEPLOYMENT_GUIDE.md` for detailed instructions on both deployment methods.

## 📚 API Documentation

### Authentication Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/seed` - Create test accounts (dev only)

### Interview Endpoints

- `POST /api/interviews` - Create interview template
- `GET /api/interviews` - Get user's interviews
- `GET /api/interviews/:id` - Get specific interview
- `POST /api/interviews/:id/invite` - Invite candidate
- `GET /api/interviews/:id/invitations` - Get interview invitations
- `DELETE /api/interviews/:id/invitations/:invitationId` - Revoke invitation
- `POST /api/interviews/:id/start` - Start interview
- `POST /api/interviews/:id/questions/:questionId/answer` - Submit answer
- `POST /api/interviews/:id/complete` - Complete interview

### Upload Endpoints

- `GET /api/upload/url/:interviewId/:questionId` - Get upload URL
- `POST /api/upload/:interviewId/:questionId` - Upload video file

### Reports Endpoints

- `GET /api/reports/interviews/:id/results` - Get interview results
- `GET /api/reports/dashboard` - Get dashboard metrics
- `GET /api/reports/interviews/:id/export/csv` - Export CSV
- `GET /api/reports/interviews/:id/export/json` - Export JSON

### WebSocket Events (Socket.IO)

- `join-interview` - Join interview room
- `start-gemini-session` - Initialize AI session
- `gemini-audio` - Send audio/video data to AI
- `gemini-response` - Receive AI analysis
- `gemini-error` - Handle AI errors
- `gemini-session-ready` - Session initialized

## 📖 Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture, data flow, and design decisions
- **[DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)** - Onboarding guide for new developers
- **[CODEBASE_GUIDE.md](docs/CODEBASE_GUIDE.md)** - Detailed explanation of important codebases
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Deployment instructions for various platforms

## 📦 File Storage

The application supports two storage backends:

- **Local Storage** (default): Files stored on server filesystem
  - ⚠️ **Not recommended for production** on Render (ephemeral filesystem)
  - Files are lost when service restarts
  
- **AWS S3** (recommended for production): Persistent cloud storage
  - ✅ Files survive service restarts
  - ✅ Scalable and reliable
  - ✅ Cost-effective (~$0.12/month for typical usage)
  - See [docs/AWS_S3_SETUP.md](docs/AWS_S3_SETUP.md) for setup guide

Configure via `STORAGE_BACKEND` environment variable (`local` or `s3`).

## 🔒 Security Features

- JWT-based authentication with configurable expiration
- Role-based access control (Recruiter/Candidate)
- Input validation and sanitization
- Rate limiting on authentication endpoints
- CORS protection with configurable origins
- Helmet security headers
- Password hashing with bcrypt
- File upload restrictions (type and size)

## 🧪 Testing

```bash
# Run server tests
cd server && npm test

# Run with coverage
cd server && npm test -- --coverage
```

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Verify `MONGODB_URI` in `.env`
   - Ensure MongoDB is running (local) or connection string is correct (Atlas)
   - Check network connectivity

2. **Gemini API Errors**
   - Verify `GEMINI_API_KEY` is correct
   - Check API quota and limits
   - Review server logs for detailed errors
   - Model may not be available - system will auto-fallback

3. **Email Not Sending**
   - Verify SMTP credentials
   - For Gmail, use App Password (not regular password)
   - Check firewall/security settings
   - Test with `/api/test-email` endpoint (dev only)

4. **Socket.IO Connection Fails**
   - Verify `CLIENT_URL` matches frontend URL exactly
   - Check CORS configuration
   - Ensure WebSocket support on deployment platform

5. **Video Upload Issues**
   - Check file size limits (100MB max)
   - Verify upload directory permissions
   - Review network connectivity
   - Check browser console for errors

## 📈 Performance

- Client-side video compression (WebM format)
- Efficient database queries with proper indexing
- Token usage optimization
- Lazy loading of components
- CDN-ready static assets

## 🔄 Updates and Maintenance

- Regular dependency updates recommended
- Security patch management
- Database optimization
- API versioning for backward compatibility

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the documentation in `docs/` directory
- Review the troubleshooting section above

---

**HireCorrecto** - Revolutionizing recruitment with AI-powered interviews. 🚀
