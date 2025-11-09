import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { interviewAPI, reportsAPI } from '../services/api'
import { 
  Plus, Users, Calendar, TrendingUp, Eye, Download, BarChart3, 
  CheckCircle2, Clock, AlertCircle, FileText, Sparkles, 
  Zap, Target, Award, Activity, ArrowRight, ExternalLink
} from 'lucide-react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'

export default function RecruiterDashboard() {
  const { user, logout } = useAuth()
  const [interviews, setInterviews] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [interviewsRes, metricsRes] = await Promise.all([
        interviewAPI.getAll(),
        reportsAPI.getDashboardMetrics()
      ])
      
      setInterviews(interviewsRes.data.interviews)
      setMetrics(metricsRes.data.metrics)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (interviewId, format) => {
    try {
      let response
      if (format === 'csv') {
        response = await reportsAPI.exportCSV(interviewId)
      } else {
        response = await reportsAPI.exportJSON(interviewId)
      }
      
      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `interview-${interviewId}-results.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success(`Interview results exported as ${format.toUpperCase()}`)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Failed to export interview results')
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
      month: 'short',
      day: 'numeric'
    })
  }

  const completedInterviews = interviews.filter(i => i.status === 'completed')
  const inProgressInterviews = interviews.filter(i => i.status === 'in_progress')
  const averageScore = metrics?.averageScores?.overall || 0

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
                <span className="text-white text-sm font-medium">Recruiter Dashboard</span>
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
        {/* Enhanced Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Total Interviews Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition-transform duration-300">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full"></div>
              <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-white/5 rounded-full"></div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                    <Users className="h-6 w-6" />
                  </div>
                  <TrendingUp className="h-5 w-5 opacity-80" />
                </div>
                <p className="text-blue-100 text-sm font-medium mb-1">Total Interviews</p>
                <p className="text-4xl font-bold mb-2">{metrics.totalInterviews}</p>
                <div className="flex items-center space-x-2 text-sm">
                  <span className="bg-white/20 px-2 py-1 rounded-md">All Time</span>
                </div>
              </div>
            </div>

            {/* Completed Interviews Card */}
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
                <p className="text-4xl font-bold mb-2">{metrics.completedInterviews}</p>
                <div className="flex items-center space-x-2 text-sm">
                  <span className="bg-white/20 px-2 py-1 rounded-md">
                    {metrics.totalInterviews > 0 
                      ? ((metrics.completedInterviews / metrics.totalInterviews) * 100).toFixed(0) 
                      : 0}% Success
                  </span>
                </div>
              </div>
            </div>

            {/* In Progress Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition-transform duration-300">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full"></div>
              <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-white/5 rounded-full"></div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                    <Clock className="h-6 w-6" />
                  </div>
                  <Zap className="h-5 w-5 opacity-80" />
                </div>
                <p className="text-amber-100 text-sm font-medium mb-1">In Progress</p>
                <p className="text-4xl font-bold mb-2">{metrics.inProgressInterviews}</p>
                <div className="flex items-center space-x-2 text-sm">
                  <span className="bg-white/20 px-2 py-1 rounded-md">Active Now</span>
                </div>
              </div>
            </div>

            {/* Completion Rate Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl shadow-xl p-6 text-white transform hover:scale-105 transition-transform duration-300">
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full"></div>
              <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-32 h-32 bg-white/5 rounded-full"></div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl">
                    <Target className="h-6 w-6" />
                  </div>
                  <BarChart3 className="h-5 w-5 opacity-80" />
                </div>
                <p className="text-purple-100 text-sm font-medium mb-1">Completion Rate</p>
                <p className="text-4xl font-bold mb-2">{metrics.completionRate.toFixed(1)}%</p>
                <div className="w-full bg-white/20 rounded-full h-2 mt-3">
                  <div 
                    className="bg-white rounded-full h-2 transition-all duration-500"
                    style={{ width: `${Math.min(metrics.completionRate, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Additional Statistics Row */}
        {metrics && metrics.averageScores && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-indigo-100 p-3 rounded-xl">
                  <Award className="h-6 w-6 text-indigo-600" />
                </div>
                <span className="text-2xl font-bold text-indigo-600">
                  {metrics.averageScores.overall?.toFixed(1) || 0}%
                </span>
              </div>
              <p className="text-gray-600 font-medium mb-1">Average Overall Score</p>
              <p className="text-sm text-gray-500">Across all completed interviews</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-emerald-100 p-3 rounded-xl">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                </div>
                <span className="text-2xl font-bold text-emerald-600">
                  {metrics.averageScores.relevance?.toFixed(1) || 0}%
                </span>
              </div>
              <p className="text-gray-600 font-medium mb-1">Average Relevance</p>
              <p className="text-sm text-gray-500">Answer quality metric</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="bg-blue-100 p-3 rounded-xl">
                  <BarChart3 className="h-6 w-6 text-blue-600" />
                </div>
                <span className="text-2xl font-bold text-blue-600">
                  {metrics.tokenUsage?.averagePerInterview?.toFixed(0) || 0}
                </span>
              </div>
              <p className="text-gray-600 font-medium mb-1">Avg Tokens/Interview</p>
              <p className="text-sm text-gray-500">AI usage efficiency</p>
            </div>
          </div>
        )}

        {/* Quick Actions & Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Interview Management</h2>
            <p className="text-gray-600">Manage and analyze all your interviews</p>
          </div>
          <Link
            to="/create-interview"
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>Create New Interview</span>
          </Link>
        </div>

        {/* Quick Links for Completed Interviews */}
        {completedInterviews.length > 0 && (
          <div className="mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-200 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-emerald-500 p-3 rounded-xl">
                  <ExternalLink className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Quick Access to Results</h3>
                  <p className="text-sm text-gray-600">View detailed analysis for completed interviews</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {completedInterviews.slice(0, 3).map((interview) => (
                  <Link
                    key={interview.id}
                    to={`/interview/${interview.id}/results`}
                    className="bg-white hover:bg-emerald-50 text-emerald-700 font-medium py-2 px-4 rounded-lg border border-emerald-200 hover:border-emerald-300 transition-all flex items-center space-x-2 shadow-sm hover:shadow-md"
                  >
                    <Eye className="h-4 w-4" />
                    <span className="text-sm">{interview.title.substring(0, 20)}...</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                ))}
                {completedInterviews.length > 3 && (
                  <Link
                    to="#interviews-table"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-all flex items-center space-x-2 shadow-sm hover:shadow-md"
                  >
                    <span className="text-sm">+{completedInterviews.length - 3} more</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Interviews Table */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden" id="interviews-table">
          {interviews.length === 0 ? (
            <div className="text-center py-16">
              <div className="bg-gradient-to-br from-indigo-100 to-purple-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-10 w-10 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No interviews yet</h3>
              <p className="text-gray-600 mb-6">Get started by creating your first interview</p>
              <Link
                to="/create-interview"
                className="inline-flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
              >
                <Plus className="h-5 w-5" />
                <span>Create Your First Interview</span>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Interview Details
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Candidate
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {interviews.map((interview) => {
                    const StatusIcon = getStatusIcon(interview.status)
                    return (
                      <tr 
                        key={interview.id} 
                        className="hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-purple-50/50 transition-all duration-200"
                      >
                        <td className="px-6 py-5">
                          <div>
                            <div className="text-sm font-bold text-gray-900 mb-1">
                              {interview.title}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {interview.expectedSkills?.slice(0, 3).map((s, idx) => {
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
                              {interview.expectedSkills?.length > 3 && (
                                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-600">
                                  +{interview.expectedSkills.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          {interview.invitations && interview.invitations.length > 0 ? (
                            <div className="space-y-2">
                              {interview.invitations.slice(0, 2).map((invitation, idx) => {
                                const candidate = invitation.candidateId || {}
                                return (
                                  <div key={invitation._id || idx} className="flex items-center space-x-2">
                                    <div className="bg-gradient-to-br from-indigo-400 to-purple-400 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                      {candidate.firstName?.[0] || ''}{candidate.lastName?.[0] || ''}
                                      {!candidate.firstName && !candidate.lastName && (invitation.candidateEmail?.[0] || '?').toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-semibold text-gray-900 truncate">
                                        {candidate.firstName && candidate.lastName
                                          ? `${candidate.firstName} ${candidate.lastName}`
                                          : invitation.candidateEmail || 'Unknown'}
                                      </div>
                                      <div className="text-xs text-gray-500 truncate">
                                        {candidate.email || invitation.candidateEmail}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                              {interview.invitations.length > 2 && (
                                <div className="text-xs text-indigo-600 font-medium pt-1">
                                  +{interview.invitations.length - 2} more candidate{interview.invitations.length - 2 !== 1 ? 's' : ''}
                                </div>
                              )}
                            </div>
                          ) : interview.candidateId ? (
                            <div className="flex items-center space-x-3">
                              <div className="bg-gradient-to-br from-indigo-400 to-purple-400 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold">
                                {interview.candidateId.firstName?.[0] || ''}{interview.candidateId.lastName?.[0] || ''}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-900">
                                  {`${interview.candidateId.firstName || ''} ${interview.candidateId.lastName || ''}`.trim()}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {interview.candidateId.email}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 italic">
                              No candidates invited
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <span className={`inline-flex items-center space-x-2 px-3 py-2 text-xs font-bold rounded-lg border ${getStatusColor(interview.status)}`}>
                            <StatusIcon className="h-3 w-3" />
                            <span className="capitalize">{interview.status.replace('_', ' ')}</span>
                          </span>
                        </td>
                        <td className="px-6 py-5 text-sm text-gray-600">
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <span>{formatDate(interview.createdAt)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center space-x-2">
                            <Link
                              to={`/interview/${interview.id}`}
                              className="inline-flex items-center space-x-1 px-3 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors text-sm font-medium"
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                              <span>View</span>
                            </Link>
                            {interview.status === 'completed' && (
                              <>
                                <Link
                                  to={`/interview/${interview.id}/results`}
                                  className="inline-flex items-center space-x-1 px-3 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-lg transition-all shadow-sm hover:shadow-md text-sm font-medium"
                                  title="View Detailed Results"
                                >
                                  <BarChart3 className="h-4 w-4" />
                                  <span>Results</span>
                                </Link>
                                <div className="flex items-center space-x-1 ml-2">
                                  <button
                                    onClick={() => handleExport(interview.id, 'csv')}
                                    className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                                    title="Export CSV"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => handleExport(interview.id, 'json')}
                                    className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                                    title="Export JSON"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
