# Developer Onboarding Guide

Welcome to HireCorrecto! This guide will help you get started as a new developer on the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Environment Setup](#development-environment-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Key Concepts](#key-concepts)
- [Common Tasks](#common-tasks)
- [Debugging](#debugging)
- [Testing](#testing)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ installed ([Download](https://nodejs.org/))
- **npm** 8+ (comes with Node.js)
- **MongoDB** - Local installation or MongoDB Atlas account
- **Git** - Version control
- **Code Editor** - VS Code recommended
- **Google Gemini API Key** - [Get one here](https://makersuite.google.com/app/apikey)
- **SMTP Credentials** - For email functionality (Gmail App Password recommended)

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hirecorrecto_interview_platform
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```
   This installs dependencies for root, server, and client.

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   Edit `.env` with your configuration (see [Environment Setup](#environment-setup))

4. **Start the development servers**
   ```bash
   npm run start:all
   ```
   This starts both frontend (port 5173) and backend (port 5004).

5. **Verify setup**
   - Frontend: http://localhost:5173
   - Backend: http://localhost:5004/api/health
   - Login with test account: `recruiter@hirecorrecto.com` / `Recruiter123`

## Development Environment Setup

### Recommended VS Code Extensions

- **ESLint** - Code linting
- **Prettier** - Code formatting
- **MongoDB for VS Code** - Database management
- **Thunder Client** - API testing (alternative to Postman)
- **GitLens** - Git integration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database (Required)
MONGODB_URI=mongodb://localhost:27017/hirecorrecto
# OR for MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/hirecorrecto

# Gemini API (Required for AI features)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-pro

# JWT (Required)
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

# Email (Required for invitations)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Server (Optional)
PORT=5004
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

### MongoDB Setup

**Option 1: Local MongoDB**
```bash
# macOS
brew install mongodb-community
brew services start mongodb-community

# Ubuntu
sudo apt-get install mongodb
sudo systemctl start mongod
```

**Option 2: MongoDB Atlas (Recommended)**
1. Go to https://www.mongodb.com/atlas
2. Create free account
3. Create cluster
4. Get connection string
5. Update `MONGODB_URI` in `.env`

## Project Structure

```
hirecorrecto_interview_platform/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   ├── contexts/        # React contexts
│   │   ├── pages/           # Page components
│   │   ├── services/        # API services
│   │   └── main.jsx        # Entry point
│   └── package.json
│
├── server/                    # Node.js backend
│   ├── models/              # MongoDB models
│   ├── routes/              # API routes
│   ├── services/           # Business logic
│   ├── middleware/         # Express middleware
│   └── index.js            # Server entry
│
├── docs/                     # Documentation
├── scripts/                  # Utility scripts
└── package.json            # Root package
```

See [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md) for detailed codebase walkthrough.

## Development Workflow

### Starting Development

```bash
# Start both frontend and backend
npm run start:all

# Or start separately
npm run server  # Backend only
npm run client  # Frontend only
```

### Making Changes

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Frontend changes: Edit files in `client/src/`
   - Backend changes: Edit files in `server/`
   - Both auto-reload on save

3. **Test your changes**
   - Manual testing in browser
   - Check console for errors
   - Test API endpoints

4. **Commit and push**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push origin feature/your-feature-name
   ```

### Code Style

- **JavaScript/React**: Follow ESLint rules
- **Formatting**: Use Prettier (if configured)
- **Naming**: 
  - Components: PascalCase (`InterviewSession.jsx`)
  - Functions: camelCase (`getInterviewById`)
  - Constants: UPPER_SNAKE_CASE (`API_BASE_URL`)

## Key Concepts

### Authentication Flow

1. User logs in via `POST /api/auth/login`
2. Server validates credentials
3. Server generates JWT token
4. Token stored in `localStorage`
5. Token sent in `Authorization` header for protected routes
6. Middleware validates token on each request

### Interview Lifecycle

1. **Draft**: Recruiter creates interview template
2. **Invited**: Candidate receives invitation email
3. **In Progress**: Candidate starts interview
4. **Completed**: Interview finished, results generated
5. **Cancelled**: Interview cancelled (optional)

### Real-time Communication

- Uses Socket.IO for WebSocket communication
- Each interview has its own room
- Events: `join-interview`, `start-gemini-session`, `gemini-audio`, `gemini-response`
- See [ARCHITECTURE.md](ARCHITECTURE.md) for details

### AI Integration

- Gemini Live API for real-time analysis
- Session-based conversation
- Token usage tracked per interview
- Cost calculated in USD and INR

## Common Tasks

### Adding a New API Endpoint

1. **Create route in `server/routes/`**
   ```javascript
   // server/routes/example.js
   const express = require('express');
   const router = express.Router();
   const { authenticateToken } = require('../middleware/auth');
   
   router.get('/example', authenticateToken, async (req, res) => {
     try {
       // Your logic here
       res.json({ message: 'Success' });
     } catch (error) {
       res.status(500).json({ message: 'Error' });
     }
   });
   
   module.exports = router;
   ```

2. **Register route in `server/index.js`**
   ```javascript
   const exampleRoutes = require('./routes/example');
   app.use('/api/example', exampleRoutes);
   ```

3. **Add to frontend API service**
   ```javascript
   // client/src/services/api.js
   export const exampleAPI = {
     getExample: () => api.get('/example'),
   };
   ```

### Adding a New Page

1. **Create page component**
   ```javascript
   // client/src/pages/ExamplePage.jsx
   import React from 'react';
   
   export default function ExamplePage() {
     return <div>Example Page</div>;
   }
   ```

2. **Add route in `client/src/App.jsx`**
   ```javascript
   import ExamplePage from './pages/ExamplePage';
   
   <Route path="/example" element={<ExamplePage />} />
   ```

### Adding a New Database Model

1. **Create model in `server/models/`**
   ```javascript
   // server/models/Example.js
   const mongoose = require('mongoose');
   
   const exampleSchema = new mongoose.Schema({
     name: { type: String, required: true },
     // ... other fields
   });
   
   module.exports = mongoose.model('Example', exampleSchema);
   ```

2. **Use in routes**
   ```javascript
   const Example = require('../models/Example');
   const examples = await Example.find();
   ```

### Modifying Gemini Integration

1. **Edit `server/services/gemini.js`**
   - Session management
   - Question generation
   - Audio processing
   - Cost calculation

2. **Update Socket.IO handlers in `server/index.js`**
   - `start-gemini-session` event
   - `gemini-audio` event

## Debugging

### Frontend Debugging

1. **Browser DevTools**
   - Console: Check for errors
   - Network: Monitor API calls
   - Application: Check localStorage

2. **React DevTools**
   - Install browser extension
   - Inspect component state
   - Check props and hooks

3. **Vite DevTools**
   - Hot module replacement status
   - Build errors in terminal

### Backend Debugging

1. **Console Logs**
   ```javascript
   console.log('Debug:', variable);
   console.error('Error:', error);
   ```

2. **Node.js Debugger**
   ```bash
   node --inspect server/index.js
   ```
   Then attach debugger in VS Code

3. **MongoDB Queries**
   - Use MongoDB Compass
   - Or `mongosh` CLI
   - Check database directly

### Common Issues

**Port already in use:**
```bash
# Find process
lsof -i :5004
lsof -i :5173

# Kill process
kill -9 <PID>
```

**MongoDB connection error:**
- Check `MONGODB_URI` in `.env`
- Verify MongoDB is running
- Check network connectivity

**CORS errors:**
- Verify `CLIENT_URL` matches frontend URL
- Check CORS configuration in `server/index.js`

## Testing

### Running Tests

```bash
# Server tests
cd server && npm test

# With coverage
cd server && npm test -- --coverage
```

### Writing Tests

```javascript
// server/__tests__/example.test.js
const request = require('supertest');
const app = require('../index');

describe('Example API', () => {
  test('GET /api/example', async () => {
    const response = await request(app)
      .get('/api/example')
      .expect(200);
    
    expect(response.body).toHaveProperty('message');
  });
});
```

## Best Practices

### Code Organization

- **Separation of Concerns**: Keep business logic in services, not routes
- **Reusability**: Create reusable components and utilities
- **Naming**: Use descriptive names for variables and functions
- **Comments**: Document complex logic and business rules

### Security

- **Never commit `.env` files**
- **Validate all user input**
- **Use parameterized queries** (Mongoose handles this)
- **Sanitize data before storing**
- **Use environment variables for secrets**

### Performance

- **Database Indexing**: Add indexes for frequently queried fields
- **Lazy Loading**: Load components and data on demand
- **Caching**: Cache expensive operations when possible
- **Optimize Queries**: Use `.select()` to limit fields

### Git Workflow

- **Branch Naming**: `feature/`, `fix/`, `docs/`, `refactor/`
- **Commit Messages**: Clear, descriptive messages
- **Small Commits**: Commit logical units of work
- **Pull Requests**: Review before merging

## Troubleshooting

### Dependencies Issues

```bash
# Clean install
rm -rf node_modules server/node_modules client/node_modules
npm run install:all
```

### Environment Variables Not Loading

- Check `.env` file exists in root
- Verify variable names match code
- Restart server after changing `.env`

### Socket.IO Connection Issues

- Check `CLIENT_URL` matches frontend URL exactly
- Verify CORS configuration
- Check browser console for WebSocket errors
- Ensure backend is running

### Gemini API Errors

- Verify API key is correct
- Check API quota/limits
- Review server logs for detailed errors
- Model may not be available - check fallback

### Build Errors

- Check Node.js version (18+)
- Verify all dependencies installed
- Review error messages in terminal
- Clear build cache: `rm -rf client/dist`

## Next Steps

1. **Read Documentation**
   - [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
   - [CODEBASE_GUIDE.md](CODEBASE_GUIDE.md) - Codebase walkthrough
   - [README.md](../README.md) - Project overview

2. **Explore the Codebase**
   - Start with `server/index.js` and `client/src/main.jsx`
   - Follow the authentication flow
   - Understand the interview creation process

3. **Make Your First Contribution**
   - Fix a bug
   - Add a feature
   - Improve documentation
   - Write tests

4. **Ask Questions**
   - Check existing issues
   - Create a new issue
   - Reach out to the team

---

Welcome to the team! Happy coding! 🚀

