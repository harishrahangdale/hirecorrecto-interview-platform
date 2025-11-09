import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import RecruiterDashboard from './pages/RecruiterDashboard'
import CandidateDashboard from './pages/CandidateDashboard'
import CreateInterview from './pages/CreateInterview'
import InterviewDetails from './pages/InterviewDetails'
import InterviewSession from './pages/InterviewSession'
import InterviewResults from './pages/InterviewResults'
import LoadingSpinner from './components/LoadingSpinner'

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingSpinner />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route path="/register" element={!user ? <Register /> : <Navigate to="/" replace />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          {user?.role === 'recruiter' ? <RecruiterDashboard /> : <CandidateDashboard />}
        </ProtectedRoute>
      } />
      
      <Route path="/create-interview" element={
        <ProtectedRoute allowedRoles={['recruiter']}>
          <CreateInterview />
        </ProtectedRoute>
      } />
      
      <Route path="/interview/:id" element={
        <ProtectedRoute>
          <InterviewDetails />
        </ProtectedRoute>
      } />
      
      <Route path="/interview/:id/session" element={
        <ProtectedRoute allowedRoles={['candidate']}>
          <InterviewSession />
        </ProtectedRoute>
      } />
      
      <Route path="/interview/:id/results" element={
        <ProtectedRoute allowedRoles={['recruiter']}>
          <InterviewResults />
        </ProtectedRoute>
      } />
      
      <Route path="/interview/invite/:token" element={<InterviewSession />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <AppRoutes />
          <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
            }}
          />
        </div>
      </Router>
    </AuthProvider>
  )
}

export default App
