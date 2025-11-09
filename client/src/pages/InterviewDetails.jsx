import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { interviewAPI, reportsAPI } from '../services/api'
import { 
  ArrowLeft, Mail, Calendar, Users, Play, Eye, Download, 
  CheckCircle2, Clock, AlertCircle, FileText, Sparkles, 
  BarChart3, Target, Award, Zap, Brain, ExternalLink, Settings, X, Video
} from 'lucide-react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ReactPlayer from 'react-player'

export default function InterviewDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [interview, setInterview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFirstName, setInviteFirstName] = useState('')
  const [inviteLastName, setInviteLastName] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [invitations, setInvitations] = useState([])
  const [loadingInvitations, setLoadingInvitations] = useState(false)

  useEffect(() => {
    fetchInterview()
    if (user?.role === 'recruiter') {
      fetchInvitations()
    }
  }, [id, user])

  const fetchInterview = async () => {
    try {
      const response = await interviewAPI.getById(id)
      setInterview(response.data.interview)
    } catch (error) {
      console.error('Error fetching interview:', error)
      toast.error('Failed to load interview details')
    } finally {
      setLoading(false)
    }
  }

  const fetchInvitations = async () => {
    setLoadingInvitations(true)
    try {
      const response = await interviewAPI.getInvitations(id)
      setInvitations(response.data.invitations || [])
    } catch (error) {
      console.error('Error fetching invitations:', error)
    } finally {
      setLoadingInvitations(false)
    }
  }

  const handleInviteCandidate = async (e) => {
    e.preventDefault()
    
    if (!inviteEmail.trim()) {
      toast.error('Please enter candidate email')
      return
    }

    setInviteLoading(true)

    try {
      const response = await interviewAPI.inviteCandidate(
        id, 
        inviteEmail,
        inviteFirstName || undefined,
        inviteLastName || undefined
      )
      
      // Check if email was sent successfully
      if (response.data.emailError) {
        toast.error(`Invitation created but email failed: ${response.data.emailError.message || 'Email service not configured'}`)
        if (response.data.emailError.hint) {
          toast.error(response.data.emailError.hint, { duration: 5000 })
        }
      } else {
        toast.success('Invitation sent successfully!')
      }
      
      setInviteEmail('')
      setInviteFirstName('')
      setInviteLastName('')
      fetchInterview()
      fetchInvitations()
    } catch (error) {
      console.error('Error sending invitation:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Failed to send invitation'
      
      if (error.response?.status === 404) {
        if (error.response?.data?.message === 'Route not found') {
          toast.error('API endpoint not found. Please ensure the backend server is running on port 5004.')
        } else if (error.response?.data?.message === 'Interview not found') {
          toast.error('Interview not found. Please refresh the page and try again.')
        } else if (error.response?.data?.message === 'Candidate not found') {
          toast.error('Candidate not found. Please ensure the candidate email is registered in the system.')
        } else {
          toast.error(`Endpoint not found (404). Please ensure the backend server is running on port 5004.`)
        }
      } else if (error.response?.status === 400) {
        toast.error(errorMessage)
      } else if (error.response?.status === 403) {
        toast.error('Access denied. You do not have permission to invite candidates to this interview.')
      } else if (!error.response) {
        toast.error('Network error. Please ensure the backend server is running on port 5004.')
      } else {
        toast.error(`Failed to send invitation: ${errorMessage}`)
      }
    } finally {
      setInviteLoading(false)
    }
  }

  const handleRevokeInvitation = async (invitationId, candidateEmail) => {
    if (!window.confirm(`Are you sure you want to revoke the invitation for ${candidateEmail}? This action cannot be undone.`)) {
      return
    }

    try {
      await interviewAPI.revokeInvitation(id, invitationId)
      toast.success('Invitation revoked successfully')
      fetchInterview()
      fetchInvitations()
    } catch (error) {
      console.error('Error revoking invitation:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Failed to revoke invitation'
      toast.error(errorMessage)
    }
  }

  const handleExport = async (format) => {
    try {
      let response
      if (format === 'csv') {
        response = await reportsAPI.exportCSV(id)
      } else {
        response = await reportsAPI.exportJSON(id)
      }
      
      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `interview-${id}-results.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success(`Results exported as ${format.toUpperCase()}`)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export results')
    }
  }

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-slate-100 text-slate-700 border-slate-200',
      invited: 'bg-blue-100 text-blue-700 border-blue-200',
      in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
      completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      cancelled: 'bg-red-100 text-red-700 border-red-200'
    }
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const getStatusIcon = (status) => {
    const icons = {
      draft: FileText,
      invited: Calendar,
      in_progress: Clock,
      completed: CheckCircle2,
      cancelled: AlertCircle
    }
    return icons[status] || FileText
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <LoadingSpinner size="xl" />
      </div>
    )
  }

  if (!interview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Interview Not Found</h2>
          <button
            onClick={() => navigate('/')}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const isRecruiter = user?.role === 'recruiter'
  const isCandidate = user?.role === 'candidate'
  const StatusIcon = getStatusIcon(interview.status)

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Modern Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <button
              onClick={() => navigate('/')}
              className="flex items-center space-x-2 text-white/90 hover:text-white transition-colors bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">Back to Dashboard</span>
            </button>
            <span className={`inline-flex items-center space-x-2 px-4 py-2 text-sm font-bold rounded-lg border ${getStatusColor(interview.status)}`}>
              <StatusIcon className="h-4 w-4" />
              <span className="capitalize">{interview.status.replace('_', ' ')}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Interview Info Card */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
              <div className="mb-6">
                <div className="flex items-start space-x-3 mb-6">
                  <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl flex-shrink-0">
                    <Sparkles className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">{interview.title}</h1>
                  </div>
                </div>
                
                {/* Job Description */}
                <div className="mb-6">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Job Description:</p>
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border-2 border-indigo-100">
                    <div 
                      className="text-sm text-gray-700 leading-relaxed break-words rich-text-content"
                      dangerouslySetInnerHTML={{ __html: interview.description || '' }}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3 p-3 bg-indigo-50 rounded-xl">
                  <Calendar className="h-5 w-5 text-indigo-600" />
                  <div>
                    <p className="text-xs text-gray-500">Created</p>
                    <p className="text-sm font-semibold text-gray-900">{formatDate(interview.createdAt)}</p>
                  </div>
                </div>
                
                {interview.startedAt && (
                  <div className="flex items-center space-x-3 p-3 bg-amber-50 rounded-xl">
                    <Play className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="text-xs text-gray-500">Started</p>
                      <p className="text-sm font-semibold text-gray-900">{formatDate(interview.startedAt)}</p>
                    </div>
                  </div>
                )}
                
                {interview.completedAt && (
                  <div className="flex items-center space-x-3 p-3 bg-emerald-50 rounded-xl">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="text-xs text-gray-500">Completed</p>
                      <p className="text-sm font-semibold text-gray-900">{formatDate(interview.completedAt)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Skills Card */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
              <div className="flex items-center space-x-3 mb-6">
                <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-3 rounded-xl">
                  <Target className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Expected Skills</h3>
              </div>
              <div className="space-y-4">
                {interview.expectedSkills.map((skill, index) => {
                  const skillName = typeof skill === 'string' ? skill : skill.skill
                  const skillWeight = typeof skill === 'string' ? '20' : skill.weight
                  const topics = typeof skill === 'object' && skill.topics ? skill.topics : []
                  
                  return (
                    <div
                      key={index}
                      className="p-5 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-100 hover:border-indigo-200 transition-all"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-bold text-gray-900 text-lg">
                          {skillName}
                        </span>
                        <span className="px-3 py-1 bg-indigo-600 text-white text-sm font-semibold rounded-lg">
                          {skillWeight}%
                        </span>
                      </div>
                      {topics.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-indigo-200">
                          <p className="text-xs font-semibold text-gray-600 mb-2">Topics:</p>
                          <div className="flex flex-wrap gap-2">
                            {topics.map((topic, topicIndex) => (
                              <span
                                key={topicIndex}
                                className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium bg-white border-2 border-indigo-200 text-indigo-700"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Questions Info Card */}
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-xl p-6 text-white">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold">Dynamic Question Generation</h3>
              </div>
              <p className="text-indigo-100 mb-4">Questions will be generated in real-time by Gemini Live during the interview based on:</p>
              <ul className="space-y-2 text-sm text-indigo-50">
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Candidate's responses and skill level</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Experience range: <strong className="text-white">{interview.experienceRange}</strong></span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Maximum <strong className="text-white">{interview.maxQuestions}</strong> questions in <strong className="text-white">{interview.duration}</strong> minutes</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions Card */}
            {isRecruiter && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="bg-gradient-to-br from-pink-500 to-rose-600 p-3 rounded-xl">
                    <Mail className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Actions</h3>
                </div>
                
                <form onSubmit={handleInviteCandidate} className="space-y-4 mb-6">
                  <div>
                    <label htmlFor="inviteEmail" className="block text-sm font-semibold text-gray-700 mb-2">
                      Invite Candidate <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="inviteEmail"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                      placeholder="candidate@example.com"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="inviteFirstName" className="block text-sm font-medium text-gray-700 mb-2">
                        First Name
                      </label>
                      <input
                        type="text"
                        id="inviteFirstName"
                        value={inviteFirstName}
                        onChange={(e) => setInviteFirstName(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        placeholder="John"
                      />
                    </div>
                    <div>
                      <label htmlFor="inviteLastName" className="block text-sm font-medium text-gray-700 mb-2">
                        Last Name
                      </label>
                      <input
                        type="text"
                        id="inviteLastName"
                        value={inviteLastName}
                        onChange={(e) => setInviteLastName(e.target.value)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                        placeholder="Doe"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-2"
                  >
                    <Mail className="h-4 w-4" />
                    <span>{inviteLoading ? 'Sending...' : 'Send Invitation'}</span>
                  </button>
                </form>

                {/* Invited Candidates */}
                {invitations.length > 0 && (
                  <div className="border-t-2 border-gray-200 pt-6">
                    <h4 className="text-sm font-bold text-gray-900 mb-4">Invited Candidates ({invitations.length})</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {invitations.map((invitation) => {
                        const candidate = invitation.candidateId || {}
                        const statusColors = {
                          pending: 'bg-amber-100 text-amber-700 border-amber-200',
                          accepted: 'bg-blue-100 text-blue-700 border-blue-200',
                          started: 'bg-purple-100 text-purple-700 border-purple-200',
                          completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                          expired: 'bg-red-100 text-red-700 border-red-200'
                        }
                        // Can revoke if invitation is pending/accepted and interview hasn't started
                        const canRevoke = (invitation.status === 'pending' || invitation.status === 'accepted') && 
                                         interview.status !== 'in_progress' && 
                                         interview.status !== 'completed'
                        return (
                          <div key={invitation._id} className="p-3 bg-gray-50 rounded-xl border-2 border-gray-200 hover:border-gray-300 transition-all">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {candidate.firstName && candidate.lastName 
                                    ? `${candidate.firstName} ${candidate.lastName}`
                                    : invitation.candidateEmail}
                                </p>
                                <p className="text-xs text-gray-500 truncate">{invitation.candidateEmail}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-xs px-2 py-1 rounded-lg font-bold border ${statusColors[invitation.status] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                                  {invitation.status}
                                </span>
                                {canRevoke && (
                                  <button
                                    onClick={() => handleRevokeInvitation(invitation._id, invitation.candidateEmail)}
                                    className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                                    title="Revoke invitation"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                
                {/* Results Actions */}
                {interview.status === 'completed' && (
                  <div className="border-t-2 border-gray-200 pt-6 space-y-3 mt-6">
                    <Link
                      to={`/interview/${interview.id}/results`}
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all flex items-center justify-center space-x-2"
                    >
                      <BarChart3 className="h-5 w-5" />
                      <span>View Detailed Results</span>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleExport('csv')}
                        className="bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-2 px-3 rounded-lg transition-all flex items-center justify-center space-x-1"
                      >
                        <Download className="h-4 w-4" />
                        <span className="text-sm">CSV</span>
                      </button>
                      
                      <button
                        onClick={() => handleExport('json')}
                        className="bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 font-medium py-2 px-3 rounded-lg transition-all flex items-center justify-center space-x-1"
                      >
                        <Download className="h-4 w-4" />
                        <span className="text-sm">JSON</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Interview Details Card */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
              <div className="flex items-center space-x-3 mb-6">
                <div className="bg-gradient-to-br from-blue-500 to-cyan-600 p-3 rounded-xl">
                  <Settings className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Details</h3>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-600">Experience Level</span>
                  <span className="font-bold text-gray-900 capitalize">{interview.experienceRange?.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-600">Pass Percentage</span>
                  <span className="font-bold text-gray-900">{interview.passPercentage}%</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-600">Duration</span>
                  <span className="font-bold text-gray-900">{interview.duration} min</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-600">Max Questions</span>
                  <span className="font-bold text-gray-900">{interview.maxQuestions}</span>
                </div>
              </div>
            </div>

            {/* Candidate Info Card */}
            {interview.candidate && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-3 rounded-xl">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Candidate</h3>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="bg-gradient-to-br from-indigo-400 to-purple-400 w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl">
                    {interview.candidate.firstName?.[0] || ''}{interview.candidate.lastName?.[0] || ''}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-lg">
                      {interview.candidate.firstName} {interview.candidate.lastName}
                    </p>
                    <p className="text-sm text-gray-600">{interview.candidate.email}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Full Session Video Card */}
            {interview.status === 'completed' && interview.fullSessionVideoUrl && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-3 rounded-xl">
                    <Video className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">Complete Session Recording</h3>
                </div>
                <div className="bg-black rounded-lg overflow-hidden aspect-video mb-3">
                  <ReactPlayer
                    url={interview.fullSessionVideoUrl}
                    controls
                    width="100%"
                    height="100%"
                    config={{
                      file: {
                        attributes: {
                          controlsList: 'nodownload'
                        }
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  <a href={interview.fullSessionVideoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{interview.fullSessionVideoUrl}</a>
                </p>
              </div>
            )}

            {/* Results Summary Card */}
            {interview.status === 'completed' && interview.aggregateScores && (
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-xl p-6 text-white">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                    <Award className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold">Results Summary</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-white/10 backdrop-blur-sm rounded-xl">
                    <span className="text-emerald-100">Overall Score</span>
                    <span className="text-2xl font-bold">{interview.aggregateScores.overallScore?.toFixed(1)}/10</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/10 backdrop-blur-sm rounded-xl">
                    <span className="text-emerald-100">Relevance</span>
                    <span className="text-xl font-bold">{interview.aggregateScores.averageRelevance?.toFixed(1)}/10</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-white/10 backdrop-blur-sm rounded-xl">
                    <span className="text-emerald-100">Fluency</span>
                    <span className="text-xl font-bold">{interview.aggregateScores.averageFluency?.toFixed(1)}/10</span>
                  </div>
                  {interview.aggregateScores.overallCheatRisk && (
                    <div className="flex justify-between items-center p-3 bg-white/10 backdrop-blur-sm rounded-xl">
                      <span className="text-emerald-100">Cheat Risk</span>
                      <span className="text-xl font-bold">
                        {(interview.aggregateScores.overallCheatRisk * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Token Usage Card */}
            {interview.status === 'completed' && interview.totalTokenUsage && (
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-xl">
                    <Brain className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">AI Usage</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl">
                    <span className="text-sm text-gray-600">Model</span>
                    <span className="font-bold text-gray-900">{interview.geminiModel || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl">
                    <span className="text-sm text-gray-600">Input Tokens</span>
                    <span className="font-bold text-gray-900">
                      {interview.totalTokenUsage.input_tokens?.toLocaleString() || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl">
                    <span className="text-sm text-gray-600">Output Tokens</span>
                    <span className="font-bold text-gray-900">
                      {interview.totalTokenUsage.output_tokens?.toLocaleString() || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl">
                    <span className="text-sm text-gray-600">Total Tokens</span>
                    <span className="font-bold text-gray-900">
                      {((interview.totalTokenUsage.input_tokens || 0) + (interview.totalTokenUsage.output_tokens || 0)).toLocaleString()}
                    </span>
                  </div>
                  {interview.totalCostINR !== undefined && interview.totalCostINR > 0 && (
                    <div className="pt-3 border-t-2 border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-700">Estimated Cost</span>
                        <span className="text-2xl font-bold text-blue-600">
                          ₹{interview.totalCostINR.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
