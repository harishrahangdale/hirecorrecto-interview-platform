import axios from 'axios'

// API URL configuration:
// - Development: Uses Vite proxy '/api' (configured in vite.config.js)
// - Production with VITE_API_URL: Uses the provided backend URL (for separate deployment)
// - Production without VITE_API_URL: Falls back to '/api' (for Docker Compose with nginx proxy)
const getApiBaseUrl = () => {
  // In development, always use the Vite proxy
  if (import.meta.env.DEV) {
    return '/api'
  }
  
  // In production, use VITE_API_URL if set (required for separate deployment)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // Fallback for Docker Compose scenario (nginx proxies /api to backend)
  console.warn('VITE_API_URL not set in production. Using /api proxy. For separate deployment, set VITE_API_URL to your backend URL.')
  return '/api'
}

const API_BASE_URL = getApiBaseUrl()

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (userData) => api.post('/auth/register', userData),
  getMe: () => api.get('/auth/me'),
  seedAccounts: () => api.post('/auth/seed'),
}

// Interview API
export const interviewAPI = {
  create: (interviewData) => api.post('/interviews', interviewData),
  createWithFiles: (formData) => api.post('/interviews', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
  getAll: () => api.get('/interviews'),
  getById: (id) => api.get(`/interviews/${id}`),
  update: (id, interviewData) => {
    // Handle both JSON and FormData
    if (interviewData instanceof FormData) {
      return api.put(`/interviews/${id}`, interviewData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
    }
    return api.put(`/interviews/${id}`, interviewData)
  },
  delete: (id) => api.delete(`/interviews/${id}`),
  togglePublish: (id) => api.patch(`/interviews/${id}/publish`),
  inviteCandidate: (id, candidateEmail, firstName, lastName) => {
    const payload = { candidateEmail }
    if (firstName) payload.firstName = firstName
    if (lastName) payload.lastName = lastName
    return api.post(`/interviews/${id}/invite`, payload)
  },
  getInvitations: (id) => api.get(`/interviews/${id}/invitations`),
  revokeInvitation: (id, invitationId) => api.delete(`/interviews/${id}/invitations/${invitationId}`),
  startInterview: (id) => api.post(`/interviews/${id}/start`),
  submitAnswer: (id, questionId, answerData) => api.post(`/interviews/${id}/questions/${questionId}/answer`, answerData),
  completeInterview: (id, fullSessionVideoUrl) => {
    const payload = fullSessionVideoUrl ? { fullSessionVideoUrl } : {}
    return api.post(`/interviews/${id}/complete`, payload)
  },
}

// Upload API
export const uploadAPI = {
  getUploadUrl: (interviewId, questionId) => api.get(`/upload/url/${interviewId}/${questionId}`),
  uploadVideo: (interviewId, questionId, file, isFullSession = false) => {
    const formData = new FormData()
    formData.append('video', file)
    if (isFullSession) {
      formData.append('isFullSession', 'true')
    }
    return api.post(`/upload/${interviewId}/${questionId}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
}

// Reports API
export const reportsAPI = {
  getInterviewResults: (id) => api.get(`/reports/interviews/${id}/results`),
  getDashboardMetrics: (params = {}) => api.get('/reports/dashboard', { params }),
  exportCSV: (id) => api.get(`/reports/interviews/${id}/export/csv`, { responseType: 'blob' }),
  exportJSON: (id) => api.get(`/reports/interviews/${id}/export/json`, { responseType: 'blob' }),
}

export default api
