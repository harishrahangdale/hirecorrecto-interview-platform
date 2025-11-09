# Deployment Guide: Separate Frontend & Backend

This guide will help you deploy the frontend to Netlify and backend to Render separately.

## Prerequisites

- GitHub repository with your code
- MongoDB Atlas account (or other MongoDB hosting)
- Netlify account
- Render account
- Google Gemini API key
- SMTP credentials for email

---

## Step 1: Deploy Backend to Render

Render supports two deployment methods for the backend:

### Option A: Direct Node.js Deployment (Recommended for simplicity)

This is the default method - Render builds and runs your Node.js application directly.

### Option B: Docker Deployment

Use Docker if you want containerized deployment, consistent environments, or need specific system dependencies.

**Choose your deployment method:**

---

### Option A: Direct Node.js Deployment

#### 1.1 Create a New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Render should auto-detect the `render.yaml` file (or configure manually)

#### 1.2 Configure Build Settings

If not using `render.yaml`, configure manually:
- **Root Directory:** `server`
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment:** `Node`

#### 1.3 Configure Environment Variables

In the Render dashboard, set these environment variables:

**Required:**
- `MONGODB_URI`: Your MongoDB connection string
- `CLIENT_URL`: Your Netlify frontend URL (e.g., `https://your-app.netlify.app`)
- `GEMINI_API_KEY`: Your Google Gemini API key
- `JWT_SECRET`: A strong random secret for JWT tokens
- `NODE_ENV`: `production`

**Email Configuration:**
- `SMTP_HOST`: `smtp.gmail.com` (or your SMTP host)
- `SMTP_PORT`: `587`
- `SMTP_USER`: Your email address
- `SMTP_PASS`: Your email app password

**Optional:**
- `GEMINI_MODEL`: `gemini-2.5-pro` (default)
- `JWT_EXPIRES_IN`: `7d` (default)
- `STORAGE_BACKEND`: `local` (consider cloud storage for production)
- `UPLOAD_DIR`: `./uploads`
- `USD_TO_INR_RATE`: `83.5`

**Note:** Render automatically sets `PORT`, so you don't need to set it manually.

#### 1.4 Deploy

1. Click "Create Web Service"
2. Wait for the build to complete
3. Copy your backend URL (e.g., `https://hirecorrecto-backend.onrender.com`)

---

### Option B: Docker Deployment

#### 1.1 Create a New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository

#### 1.2 Configure Docker Settings

**Method 1: Using render-docker.yaml**
- Rename `render-docker.yaml` to `render.yaml` (or use as-is)
- Render will auto-detect Docker deployment

**Method 2: Manual Configuration**
- **Dockerfile Path:** `server/Dockerfile`
- **Docker Context:** `server`
- **Build Command:** (leave empty - Docker handles it)
- **Start Command:** (leave empty - Docker handles it)

#### 1.3 Configure Environment Variables

Same as Option A (see above)

#### 1.4 Deploy

1. Click "Create Web Service"
2. Render will build the Docker image from `server/Dockerfile`
3. Wait for the build to complete
4. Copy your backend URL

---

### Which Deployment Method Should I Use?

**Use Direct Node.js (Option A) if:**
- ✅ You want simpler setup
- ✅ You don't need specific system dependencies
- ✅ You prefer faster builds
- ✅ You're just getting started

**Use Docker (Option B) if:**
- ✅ You need consistent environments across dev/staging/prod
- ✅ You have specific system dependencies
- ✅ You want to test locally with the same container
- ✅ You're already using Docker in development
- ✅ You need more control over the runtime environment

**Note:** Both methods work equally well. Docker adds a layer of consistency but requires Docker knowledge.

---

## Step 2: Deploy Frontend to Netlify

### 2.1 Create a New Site

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub repository
4. Netlify should auto-detect the `client/netlify.toml` file

### 2.2 Configure Build Settings

Netlify should auto-detect these from `netlify.toml`:
- **Base directory:** `client`
- **Build command:** `npm install && npm run build`
- **Publish directory:** `client/dist`

If not auto-detected, set them manually.

### 2.3 Set Environment Variables

In Netlify dashboard → Site settings → Environment variables, add:

- `VITE_API_URL`: Your Render backend URL with `/api` suffix
  - Example: `https://hirecorrecto-backend.onrender.com/api`

**Important:** 
- Vite requires the `VITE_` prefix for client-side environment variables
- This variable is baked into the build at build time
- You'll need to trigger a new build if you change this value

### 2.4 Deploy

1. Click "Deploy site"
2. Wait for the build to complete
3. Your site will be available at `https://your-site-name.netlify.app`

---

## Step 3: Update Backend CORS

After deploying the frontend, update the backend's `CLIENT_URL` environment variable in Render:

1. Go to Render dashboard → Your backend service → Environment
2. Update `CLIENT_URL` to match your Netlify URL:
   - Example: `https://your-site-name.netlify.app`
3. Save and redeploy (or Render will auto-redeploy)

---

## Step 4: Test Your Deployment

1. **Frontend:** Visit your Netlify URL
2. **Backend Health Check:** Visit `https://your-backend.onrender.com/api/health`
3. **Test Login:** Try logging in with test credentials
4. **Test Socket.IO:** Start an interview session to verify WebSocket connection

---

## Important Notes

### Docker on Render

Render fully supports Docker deployment:
- ✅ Automatic Docker image building from Dockerfile
- ✅ Support for multi-stage builds
- ✅ Environment variables work the same way
- ✅ Health checks work with Docker
- ✅ WebSocket support in Docker containers

**Dockerfile Location:**
- The `server/Dockerfile` is already configured
- Uses `node:18-alpine` for smaller image size
- Production dependencies only (`npm ci --only=production`)
- Exposes port 5004 (Render will map it automatically)

**Docker vs Direct Node.js:**
- **Build Time:** Docker builds are slightly slower (builds image)
- **Consistency:** Docker ensures same environment everywhere
- **Flexibility:** Direct Node.js is simpler, Docker is more flexible
- **Both work:** Choose based on your preference and needs

### File Storage

Render's filesystem is **ephemeral** - files uploaded to `./uploads` will be lost when the service restarts. For production, consider:

- **AWS S3** - Set `STORAGE_BACKEND=s3` and configure S3 credentials
- **Cloudinary** - For image/video storage
- **Google Cloud Storage** - Alternative cloud storage

### Socket.IO on Render

Render supports WebSockets, but ensure:
- Your Render service plan supports WebSockets (free tier does)
- CORS is properly configured with your frontend URL
- The Socket.IO connection uses the correct backend URL

### Environment Variables

- **Frontend (Netlify):** Only `VITE_` prefixed variables are available to the client
- **Backend (Render):** All environment variables are available
- **Security:** Never commit `.env` files or expose secrets

### CORS Configuration

The backend CORS is configured to allow requests from `CLIENT_URL`. Make sure:
- `CLIENT_URL` matches your Netlify domain exactly (including `https://`)
- No trailing slashes in the URL
- Both frontend and backend are using HTTPS in production

---

## Troubleshooting

### Frontend can't connect to backend

1. Check `VITE_API_URL` is set correctly in Netlify
2. Verify backend is running (check Render logs)
3. Check browser console for CORS errors
4. Verify `CLIENT_URL` in backend matches frontend URL exactly

### Socket.IO connection fails

1. Verify `VITE_API_URL` is set in frontend
2. Check backend logs for connection errors
3. Verify CORS allows your frontend domain
4. Check Render service supports WebSockets

### CORS errors

1. Ensure `CLIENT_URL` in backend matches frontend URL exactly
2. Include protocol (`https://`) in `CLIENT_URL`
3. No trailing slashes
4. Check browser console for specific CORS error messages

### Build failures

1. Check build logs in Netlify/Render
2. Verify all dependencies are in `package.json`
3. Check Node.js version compatibility
4. Verify environment variables are set correctly

---

## Development vs Production

### Development (Local)
- Frontend: `http://localhost:5173` (Vite dev server with proxy)
- Backend: `http://localhost:5004`
- Uses Vite proxy for API calls (no `VITE_API_URL` needed)

### Production (Separate Deployment)
- Frontend: `https://your-app.netlify.app`
- Backend: `https://your-backend.onrender.com`
- Requires `VITE_API_URL` to be set in frontend build
- Requires `CLIENT_URL` to be set in backend

### Production (Docker Compose)
- Frontend: Served via nginx (proxies `/api` to backend)
- Backend: `http://server:5004` (internal Docker network)
- No `VITE_API_URL` needed (nginx handles routing)
- `CLIENT_URL` should match your domain

---

## Next Steps

- Set up custom domains for both frontend and backend
- Configure SSL certificates (automatic with Netlify/Render)
- Set up monitoring and logging
- Configure CI/CD for automatic deployments
- Set up cloud storage for file uploads
- Configure email service for production

