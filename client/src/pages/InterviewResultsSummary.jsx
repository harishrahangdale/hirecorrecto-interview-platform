import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { reportsAPI } from '../services/api'
import { ArrowLeft, Users, CheckCircle2, Clock, TrendingUp, BarChart3, Eye, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'

export default function InterviewResultsSummary() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSummary()
  }, [id])

  const fetchSummary = async () => {
    try {
      setLoading(true)
      const response = await reportsAPI.getInterviewSummary(id)
      setSummary(response.data)
    } catch (error) {
      console.error('Error fetching summary:', error)
      toast.error('Failed to load interview summary')
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getFitStatusColor = (fitStatus) => {
    if (fitStatus === 'good_fit') return 'bg-green-100 text-green-800'
    if (fitStatus === 'moderate_fit') return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const getFitStatusLabel = (fitStatus) => {
    if (fitStatus === 'good_fit') return 'Good Fit'
    if (fitStatus === 'moderate_fit') return 'Moderate Fit'
    return 'Not a Fit'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <LoadingSpinner size="xl" />
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <p className="text-gray-600">No data available</p>
        </div>
      </div>
    )
  }

  const { interviewTemplate, aggregateMetrics, candidateAttempts } = summary

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/reports/overall')}
                className="flex items-center space-x-2 text-white/90 hover:text-white transition-colors bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg"
              >
                <ArrowLeft className="h-5 w-5" />
                <span className="text-sm font-medium">Back to Overall Metrics</span>
              </button>
              <div className="border-l border-white/20 pl-4">
                <h1 className="text-xl font-bold text-white">{interviewTemplate.title}</h1>
                <p className="text-sm text-indigo-100">Interview Summary - All Candidates</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Aggregate Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Candidates</p>
                <p className="text-3xl font-bold mt-1 text-indigo-600">
                  {aggregateMetrics.totalCandidates}
                </p>
              </div>
              <Users className="h-8 w-8 text-indigo-600 opacity-50" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Completed</p>
                <p className="text-3xl font-bold mt-1 text-green-600">
                  {aggregateMetrics.completedCandidates}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {aggregateMetrics.totalCandidates > 0
                    ? ((aggregateMetrics.completedCandidates / aggregateMetrics.totalCandidates) * 100).toFixed(1)
                    : 0}% completion
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Average Score</p>
                <p className={`text-3xl font-bold mt-1 ${getScoreColor(aggregateMetrics.averageOverallScore)}`}>
                  {aggregateMetrics.averageOverallScore.toFixed(1)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600 opacity-50" />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Cheat Risk</p>
                <p className={`text-3xl font-bold mt-1 ${aggregateMetrics.averageCheatRisk > 0.5 ? 'text-red-600' : 'text-green-600'}`}>
                  {(aggregateMetrics.averageCheatRisk * 100).toFixed(1)}%
                </p>
              </div>
              <Shield className="h-8 w-8 text-yellow-600 opacity-50" />
            </div>
          </div>
        </div>

        {/* Detailed Aggregate Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <BarChart3 className="h-5 w-5" />
              <span>Performance Breakdown</span>
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Average Relevance:</span>
                <span className={`font-semibold ${getScoreColor(aggregateMetrics.averageRelevance)}`}>
                  {aggregateMetrics.averageRelevance.toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Average Technical Accuracy:</span>
                <span className={`font-semibold ${getScoreColor(aggregateMetrics.averageTechnicalAccuracy)}`}>
                  {aggregateMetrics.averageTechnicalAccuracy.toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Average Fluency:</span>
                <span className={`font-semibold ${getScoreColor(aggregateMetrics.averageFluency)}`}>
                  {aggregateMetrics.averageFluency.toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Usage Statistics</span>
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Tokens:</span>
                <span className="font-semibold text-gray-900">
                  {aggregateMetrics.totalTokenUsage.total_tokens.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Cost:</span>
                <span className="font-semibold text-blue-600">
                  ₹{aggregateMetrics.totalCostINR.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">In Progress:</span>
                <span className="font-semibold text-amber-600">
                  {aggregateMetrics.inProgressCandidates}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Candidate Attempts List */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Candidate Attempts ({candidateAttempts.length})</span>
          </h2>

          {candidateAttempts.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No candidate attempts found for this interview</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Candidate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Overall Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      AI Recommendation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Questions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Completed
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {candidateAttempts.map((attempt) => (
                    <tr key={attempt.interviewId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {attempt.candidate.name || attempt.candidate.email}
                          </div>
                          <div className="text-sm text-gray-500">
                            {attempt.candidate.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          attempt.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {attempt.status === 'completed' ? 'Completed' : 'In Progress'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-semibold ${getScoreColor(attempt.aggregateScores.overallScore || 0)}`}>
                          {attempt.aggregateScores.overallScore?.toFixed(1) || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {attempt.aiRecommendation.fitStatus ? (
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getFitStatusColor(attempt.aiRecommendation.fitStatus)}`}>
                            {getFitStatusLabel(attempt.aiRecommendation.fitStatus)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">Not available</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {attempt.questionsAnswered} / {attempt.totalQuestions}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {attempt.completedAt
                          ? new Date(attempt.completedAt).toLocaleDateString()
                          : attempt.startedAt
                          ? new Date(attempt.startedAt).toLocaleDateString()
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => navigate(`/interview/${attempt.interviewId}/results`)}
                          className="text-indigo-600 hover:text-indigo-900 flex items-center space-x-1"
                        >
                          <Eye className="h-4 w-4" />
                          <span>View Details</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

