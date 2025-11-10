import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { reportsAPI } from '../services/api'
import { ArrowLeft, BarChart3, Users, CheckCircle2, Clock, TrendingUp, DollarSign, Brain, Shield, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'

export default function OverallMetrics() {
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState(null)
  const [interviewTemplates, setInterviewTemplates] = useState([])
  const [recentInterviews, setRecentInterviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' })

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const params = {}
      if (dateRange.startDate) params.startDate = dateRange.startDate
      if (dateRange.endDate) params.endDate = dateRange.endDate
      
      const response = await reportsAPI.getOverallMetrics(dateRange.startDate, dateRange.endDate)
      setMetrics(response.data.metrics)
      setInterviewTemplates(response.data.interviewTemplates || [])
      setRecentInterviews(response.data.recentInterviews || [])
    } catch (error) {
      console.error('Error fetching metrics:', error)
      toast.error('Failed to load overall metrics')
    } finally {
      setLoading(false)
    }
  }

  const handleDateFilter = () => {
    fetchMetrics()
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
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
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center space-x-2 text-white/90 hover:text-white transition-colors bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="text-sm font-medium">Back to Dashboard</span>
              </button>
              <div className="border-l border-white/20 pl-4">
                <h1 className="text-xl font-bold text-white">Overall Interview Metrics</h1>
                <p className="text-sm text-indigo-100">Aggregate metrics across all interviews</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Date Filter */}
        <div className="card mb-6">
          <div className="flex items-center space-x-4">
            <Calendar className="h-5 w-5 text-gray-600" />
            <div className="flex items-center space-x-2">
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <span className="text-gray-600">to</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={handleDateFilter}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
              >
                Apply Filter
              </button>
              {(dateRange.startDate || dateRange.endDate) && (
                <button
                  onClick={() => {
                    setDateRange({ startDate: '', endDate: '' })
                    setTimeout(fetchMetrics, 100)
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Interview Templates</p>
                <p className="text-3xl font-bold mt-1 text-indigo-600">
                  {metrics?.totalInterviewTemplates || 0}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-indigo-600 opacity-50" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Candidate Attempts</p>
                <p className="text-3xl font-bold mt-1 text-blue-600">
                  {metrics?.totalCandidateAttempts || 0}
                </p>
              </div>
              <Users className="h-8 w-8 text-blue-600 opacity-50" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed Interviews</p>
                <p className="text-3xl font-bold mt-1 text-green-600">
                  {metrics?.completedInterviews || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {metrics?.completionRate?.toFixed(1) || 0}% completion rate
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Average Overall Score</p>
                <p className={`text-3xl font-bold mt-1 ${getScoreColor(metrics?.averageScores?.overall || 0)}`}>
                  {metrics?.averageScores?.overall?.toFixed(1) || 'N/A'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600 opacity-50" />
            </div>
          </div>
        </div>

        {/* Detailed Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Performance Metrics */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <Brain className="h-5 w-5" />
              <span>Performance Metrics</span>
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Average Relevance:</span>
                <span className={`font-semibold ${getScoreColor(metrics?.averageScores?.relevance || 0)}`}>
                  {metrics?.averageScores?.relevance?.toFixed(1) || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Average Fluency:</span>
                <span className={`font-semibold ${getScoreColor(metrics?.averageScores?.fluency || 0)}`}>
                  {metrics?.averageScores?.fluency?.toFixed(1) || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Average Cheat Risk:</span>
                <span className={`font-semibold ${(metrics?.cheatingAnalysis?.averageCheatScore || 0) > 0.5 ? 'text-red-600' : 'text-green-600'}`}>
                  {((metrics?.cheatingAnalysis?.averageCheatScore || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">High Risk Interviews:</span>
                <span className="font-semibold text-red-600">
                  {metrics?.cheatingAnalysis?.highRiskInterviews || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Usage & Cost Metrics */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <DollarSign className="h-5 w-5" />
              <span>Usage & Cost</span>
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Input Tokens:</span>
                <span className="font-semibold text-gray-900">
                  {(metrics?.tokenUsage?.totalInputTokens || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Output Tokens:</span>
                <span className="font-semibold text-gray-900">
                  {(metrics?.tokenUsage?.totalOutputTokens || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Avg per Interview:</span>
                <span className="font-semibold text-gray-900">
                  {metrics?.tokenUsage?.averagePerInterview?.toFixed(0) || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Average Duration:</span>
                <span className="font-semibold text-gray-900">
                  {metrics?.timeAnalysis?.averageDuration 
                    ? `${Math.round(metrics.timeAnalysis.averageDuration / 60000)} min`
                    : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Interview Templates */}
        {interviewTemplates.length > 0 && (
          <div className="card mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Interview Templates</h2>
            <div className="space-y-2">
              {interviewTemplates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => navigate(`/interview/${template.id}/summary`)}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{template.title}</h3>
                      <p className="text-sm text-gray-500">
                        Created: {new Date(template.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-indigo-600 font-medium">View Summary →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Interviews */}
        {recentInterviews.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Interview Attempts</h2>
            <div className="space-y-2">
              {recentInterviews.map((interview) => (
                <div
                  key={interview.id}
                  onClick={() => {
                    // Only allow viewing completed interviews or in-progress with data
                    if (interview.status === 'completed' || interview.status === 'in_progress') {
                      navigate(`/interview/${interview.id}/results`)
                    } else {
                      toast.error('Interview results are only available for completed or in-progress interviews')
                    }
                  }}
                  className={`p-4 border border-gray-200 rounded-lg transition-all ${
                    interview.status === 'completed' || interview.status === 'in_progress'
                      ? 'hover:bg-indigo-50 hover:border-indigo-300 cursor-pointer'
                      : 'opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{interview.title}</h3>
                      <p className="text-sm text-gray-500">
                        {interview.candidate?.name || interview.candidate?.email} • 
                        {interview.status === 'completed' 
                          ? ' Completed' 
                          : interview.status === 'in_progress'
                          ? ' In Progress'
                          : ` ${interview.status}`}
                      </p>
                    </div>
                    <span className={`font-medium ${
                      interview.status === 'completed' || interview.status === 'in_progress'
                        ? 'text-indigo-600'
                        : 'text-gray-400'
                    }`}>
                      {interview.status === 'completed' || interview.status === 'in_progress'
                        ? 'View Details →'
                        : 'Not Available'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

