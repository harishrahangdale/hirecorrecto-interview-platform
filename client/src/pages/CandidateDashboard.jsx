import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { interviewAPI } from '../services/api'
import { 
  Calendar, Clock, Play, CheckCircle2, Sparkles, 
  Users, Target, Award, TrendingUp, ArrowRight, 
  FileText, AlertCircle, Zap, Activity
} from 'lucide-react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'

export default function CandidateDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [interviews, setInterviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchInterviews()
  }, [])

  const fetchInterviews = async () => {
    try {
      const response = await interviewAPI.getAll()
      setInterviews(response.data.interviews)
    } catch (error) {
      console.error('Error fetching interviews:', error)
      toast.error('Failed to load interviews')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      invited: 'bg-blue-100 text-blue-700 border-blue-200',
      in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
      completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      cancelled: 'bg-red-100 text-red-700 border-red-200'
    }
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const getStatusIcon = (status) => {
    const icons = {
      invited: Calendar,
      in_progress: Clock,
      completed: CheckCircle2,
      cancelled: AlertCircle
    }
    return icons[status] || Calendar
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const isInterviewAvailable = (interview) => {
    // Check if dateWindow exists
    if (!interview.dateWindow || !interview.dateWindow.start || !interview.dateWindow.end) {
      return false
    }
    // Check if status exists and is 'invited'
    if (!interview.status || interview.status !== 'invited') {
      return false
    }
    const now = new Date()
    const startDate = new Date(interview.dateWindow.start)
    const endDate = new Date(interview.dateWindow.end)
    return now >= startDate && now <= endDate
  }

  const handleStartInterview = async (interviewId, currentStatus) => {
    try {
      // Only call startInterview API if status is 'invited'
      if (currentStatus === 'invited') {
        await interviewAPI.startInterview(interviewId)
        toast.success('Starting interview...')
      }
      // Navigate directly to the interview session page
      navigate(`/interview/${interviewId}/session`)
    } catch (error) {
      console.error('Error starting interview:', error)
      toast.error('Failed to start interview')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <LoadingSpinner size="xl" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Modern Header with Gradient */}
      <header className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">HireCorrecto</h1>
                <p className="text-indigo-100 text-sm mt-1">Welcome back, {user?.firstName} 👋</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                <span className="text-white text-sm font-medium">Candidate Dashboard</span>
              </div>
              <button
                onClick={logout}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-lg transition-all text-sm font-medium transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-indigo-500 via-purple-600 to-pink-600 rounded-2xl p-8 mb-8 text-white shadow-xl">
          <div className="flex items-center space-x-4 mb-4">
            <div className="bg-white/20 backdrop-blur-sm p-4 rounded-xl">
              <Target className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-2">Ready for your next interview?</h2>
              <p className="text-indigo-100 text-lg">
                AI-powered interviews that are fair, efficient, and insightful.
              </p>
            </div>
          </div>
        </div>

        {/* Enhanced Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Invitations Card */}
          <div className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition-transform duration-300">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full"></div>
            <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-white/5 rounded-full"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                  <Calendar className="h-6 w-6" />
                </div>
                <Users className="h-5 w-5 opacity-80" />
              </div>
              <p className="text-blue-100 text-sm font-medium mb-1">Total Invitations</p>
              <p className="text-4xl font-bold mb-2">{interviews.length}</p>
              <div className="flex items-center space-x-2 text-sm">
                <span className="bg-white/20 px-2 py-1 rounded-md">All Time</span>
              </div>
            </div>
          </div>

          {/* Available Now Card */}
          <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition-transform duration-300">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full"></div>
            <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-white/5 rounded-full"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                  <Play className="h-6 w-6" />
                </div>
                <Zap className="h-5 w-5 opacity-80" />
              </div>
              <p className="text-amber-100 text-sm font-medium mb-1">Available Now</p>
              <p className="text-4xl font-bold mb-2">
                {interviews.filter(i => isInterviewAvailable(i)).length}
              </p>
              <div className="flex items-center space-x-2 text-sm">
                <span className="bg-white/20 px-2 py-1 rounded-md">Ready to Start</span>
              </div>
            </div>
          </div>

          {/* Completed Card */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition-transform duration-300">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full"></div>
            <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-white/5 rounded-full"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <Activity className="h-5 w-5 opacity-80" />
              </div>
              <p className="text-emerald-100 text-sm font-medium mb-1">Completed</p>
              <p className="text-4xl font-bold mb-2">
                {interviews.filter(i => i.status === 'completed').length}
              </p>
              <div className="flex items-center space-x-2 text-sm">
                <span className="bg-white/20 px-2 py-1 rounded-md">
                  {interviews.length > 0 
                    ? ((interviews.filter(i => i.status === 'completed').length / interviews.length) * 100).toFixed(0) 
                    : 0}% Success
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Interviews List */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
                <FileText className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Your Interviews</h3>
            </div>
          </div>

          {interviews.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-gradient-to-br from-indigo-100 to-purple-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-10 w-10 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No interviews yet</h3>
              <p className="text-gray-600 mb-6">
                You'll receive email invitations when recruiters invite you to interviews.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {interviews.map((interview) => {
                const interviewStatus = interview.status || 'draft'
                const StatusIcon = getStatusIcon(interviewStatus)
                return (
                <div key={interview.id} className="p-6 hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-purple-50/50 transition-all duration-200">
                  <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header with Title and Status */}
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <h4 className="text-lg font-bold text-gray-900">
                          {interview.title}
                        </h4>
                        <span className={`inline-flex items-center space-x-2 px-3 py-2 text-xs font-bold rounded-lg border ${getStatusColor(interviewStatus)}`}>
                          <StatusIcon className="h-3 w-3" />
                          <span className="capitalize">{interviewStatus.replace('_', ' ')}</span>
                        </span>
                      </div>
                      
                      {/* Job Description */}
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Job Description:</p>
                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border-2 border-indigo-100">
                          <div 
                            className="text-sm text-gray-700 leading-relaxed break-words rich-text-content"
                            dangerouslySetInnerHTML={{ __html: interview.description || '' }}
                          />
                        </div>
                      </div>
                      
                      {/* Metadata */}
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        {interview.dateWindow && interview.dateWindow.start && interview.dateWindow.end && (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 rounded-lg border border-indigo-200">
                            <Calendar className="h-4 w-4 flex-shrink-0 text-indigo-600" />
                            <span className="text-gray-700 font-medium whitespace-nowrap">
                              {formatDate(interview.dateWindow.start)} - {formatDate(interview.dateWindow.end)}
                            </span>
                          </div>
                        )}
                        {interview.expectedSkills && interview.expectedSkills.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-700">Skills:</span>
                            {interview.expectedSkills.slice(0, 3).map((s, idx) => {
                              const skillName = typeof s === 'string' ? s : s.skill
                              return (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200"
                                >
                                  {skillName}
                                </span>
                              )
                            })}
                            {interview.expectedSkills.length > 3 && (
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600">
                                +{interview.expectedSkills.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Button */}
                    <div className="flex items-center lg:items-start lg:pt-0 pt-2 lg:pl-4">
                      <div className="flex-shrink-0">
                        {(interviewStatus === 'invited' && isInterviewAvailable(interview)) || interviewStatus === 'in_progress' ? (
                          <button
                            onClick={() => handleStartInterview(interview.id, interviewStatus)}
                            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center space-x-2 whitespace-nowrap"
                          >
                            <Play className="h-5 w-5" />
                            <span>{interviewStatus === 'in_progress' ? 'Continue Interview' : 'Start Interview'}</span>
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        ) : null}
                        
                        {interviewStatus === 'completed' && (
                          <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-200 shadow-md">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            <span className="text-sm text-emerald-700 font-bold whitespace-nowrap">
                              Completed
                            </span>
                          </div>
                        )}
                        
                        {interviewStatus === 'invited' && !isInterviewAvailable(interview) && (
                          <div className="px-4 py-2 rounded-xl bg-gray-50 border-2 border-gray-200">
                            <span className="text-sm text-gray-600 font-medium whitespace-nowrap">
                              {interview.dateWindow && interview.dateWindow.start 
                                ? (new Date(interview.dateWindow.start) > new Date() ? 'Not yet available' : 'Expired')
                                : 'Date window not set'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Tips Section */}
        <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border-2 border-blue-200 shadow-md">
          <div className="flex items-center space-x-3 mb-4">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-xl">
              <Award className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Interview Tips</h3>
          </div>
          <ul className="text-sm text-gray-700 space-y-3 ml-2">
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>Ensure you have a stable internet connection and good lighting</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>Find a quiet environment free from distractions</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>Test your camera and microphone before starting</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>Be yourself and answer questions thoughtfully</span>
            </li>
            <li className="flex items-start space-x-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <span>The AI will analyze your responses in real-time</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
