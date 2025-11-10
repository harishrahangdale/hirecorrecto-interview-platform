import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { reportsAPI } from '../services/api'
import { ArrowLeft, Download, Play, Eye, AlertTriangle, CheckCircle, BarChart3, Clock, Video, FileText, Brain, Shield, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ReactPlayer from 'react-player'

export default function InterviewResults() {
  const { id } = useParams()
  const navigate = useNavigate()
  
  const [interview, setInterview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedQuestion, setSelectedQuestion] = useState(null)
  const [activeTab, setActiveTab] = useState('overview') // overview, questions, statistics

  useEffect(() => {
    fetchResults()
  }, [id])

  const fetchResults = async () => {
    try {
      const response = await reportsAPI.getInterviewResults(id)
      setInterview(response.data.interview)
    } catch (error) {
      console.error('Error fetching results:', error)
      
      // Provide more specific error messages
      if (error.response?.status === 400) {
        const message = error.response?.data?.message || 'Interview results not available'
        if (message.includes('not completed')) {
          toast.error('This interview is still in progress. Results will be available once completed.')
        } else {
          toast.error(message)
        }
      } else if (error.response?.status === 404) {
        toast.error('Interview not found')
      } else if (error.response?.status === 403) {
        toast.error('Access denied. You do not have permission to view these results.')
      } else {
        toast.error('Failed to load interview results. Please try again later.')
      }
    } finally {
      setLoading(false)
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

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 bg-green-50'
    if (score >= 60) return 'text-yellow-600 bg-yellow-50'
    if (score >= 40) return 'text-orange-600 bg-orange-50'
    return 'text-red-600 bg-red-50'
  }

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    if (score >= 40) return 'Fair'
    return 'Poor'
  }

  const getCheatRiskColor = (risk) => {
    if (risk < 0.3) return 'text-green-600 bg-green-50 border-green-200'
    if (risk < 0.7) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const getCheatRiskLabel = (risk) => {
    if (risk < 0.3) return 'Low Risk'
    if (risk < 0.7) return 'Medium Risk'
    return 'High Risk'
  }

  const formatFlagName = (flag) => {
    return flag.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="xl" />
      </div>
    )
  }

  if (!interview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md">
            <div className="bg-amber-100 rounded-full p-4 w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Clock className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Interview Not Available</h2>
            <p className="text-gray-600 mb-6">
              This interview may still be in progress or the results are not yet available.
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isInProgress = interview.status === 'in_progress'
  const stats = interview.statistics || {}
  const aggregateScores = interview.aggregateScores || {
    overallScore: 0,
    averageRelevance: 0,
    averageTechnicalAccuracy: 0,
    averageFluency: 0,
    overallCheatRisk: 0
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Modern Header */}
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
                <h1 className="text-xl font-bold text-white">{interview.title}</h1>
                <p className="text-sm text-indigo-100">
                  {interview.candidate ? 
                    `${interview.candidate.name} • ${interview.candidate.email}` :
                    interview.candidateEmail
                  }
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => handleExport('csv')}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-lg transition-all flex items-center space-x-2 text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                <span>CSV</span>
              </button>
              <button
                onClick={() => handleExport('json')}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-lg transition-all flex items-center space-x-2 text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                <span>JSON</span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 border-t border-white/20 bg-white/10 backdrop-blur-sm">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-3 text-sm font-semibold border-b-3 transition-all ${
                activeTab === 'overview'
                  ? 'border-white text-white bg-white/10'
                  : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('questions')}
              className={`px-6 py-3 text-sm font-semibold border-b-3 transition-all ${
                activeTab === 'questions'
                  ? 'border-white text-white bg-white/10'
                  : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Questions ({interview.questions.length})
            </button>
            <button
              onClick={() => setActiveTab('statistics')}
              className={`px-6 py-3 text-sm font-semibold border-b-3 transition-all ${
                activeTab === 'statistics'
                  ? 'border-white text-white bg-white/10'
                  : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Statistics
            </button>
            <button
              onClick={() => setActiveTab('skills')}
              className={`px-6 py-3 text-sm font-semibold border-b-3 transition-all ${
                activeTab === 'skills'
                  ? 'border-white text-white bg-white/10'
                  : 'border-transparent text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Skills Analysis
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* In Progress Banner */}
        {isInProgress && (
          <div className="mb-6 bg-amber-50 border-l-4 border-amber-400 p-4 rounded-lg">
            <div className="flex items-center">
              <Clock className="h-5 w-5 text-amber-600 mr-3" />
              <div>
                <h3 className="text-sm font-semibold text-amber-800">Interview In Progress</h3>
                <p className="text-sm text-amber-700 mt-1">
                  This interview is still ongoing. Results shown below are partial and will be updated when the interview is completed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Overall Performance Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Overall Score</p>
                    <p className={`text-3xl font-bold mt-1 ${getScoreColor(aggregateScores.overallScore || 0)}`}>
                      {aggregateScores.overallScore?.toFixed(1) || 'N/A'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {getScoreLabel(aggregateScores.overallScore || 0)}
                    </p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-primary-600 opacity-50" />
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Relevance</p>
                    <p className={`text-3xl font-bold mt-1 ${getScoreColor(aggregateScores.averageRelevance || 0)}`}>
                      {aggregateScores.averageRelevance?.toFixed(1) || 'N/A'}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-600 opacity-50" />
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Technical Accuracy</p>
                    <p className={`text-3xl font-bold mt-1 ${getScoreColor(aggregateScores.averageTechnicalAccuracy || 0)}`}>
                      {aggregateScores.averageTechnicalAccuracy?.toFixed(1) || 'N/A'}
                    </p>
                  </div>
                  <Brain className="h-8 w-8 text-blue-600 opacity-50" />
                </div>
              </div>

              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Cheat Risk</p>
                    <p className={`text-3xl font-bold mt-1 ${getCheatRiskColor(aggregateScores.overallCheatRisk || 0)}`}>
                      {aggregateScores.overallCheatRisk ? (aggregateScores.overallCheatRisk * 100).toFixed(1) : 'N/A'}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {getCheatRiskLabel(aggregateScores.overallCheatRisk || 0)}
                    </p>
                  </div>
                  <Shield className="h-8 w-8 text-yellow-600 opacity-50" />
                </div>
              </div>
            </div>

            {/* AI Hiring Recommendation - Only show for completed interviews */}
            {!isInProgress && interview.aiRecommendation && interview.aiRecommendation.fitStatus && (
              <div className="card border-2">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
                    <Brain className="h-6 w-6 text-primary-600" />
                    <span>AI Hiring Recommendation</span>
                  </h2>
                  <div className={`px-4 py-2 rounded-full font-semibold text-sm ${
                    interview.aiRecommendation.fitStatus === 'good_fit' 
                      ? 'bg-green-100 text-green-800' 
                      : interview.aiRecommendation.fitStatus === 'moderate_fit'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {interview.aiRecommendation.fitStatus === 'good_fit' 
                      ? '✓ Good Fit' 
                      : interview.aiRecommendation.fitStatus === 'moderate_fit'
                      ? '⚠ Moderate Fit'
                      : '✗ Not a Fit'}
                  </div>
                </div>
                
                {interview.aiRecommendation.recommendationSummary && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Overall Assessment</h3>
                    <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {interview.aiRecommendation.recommendationSummary}
                    </p>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {interview.aiRecommendation.strengths && interview.aiRecommendation.strengths.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-green-700 mb-3 flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4" />
                        <span>Key Strengths</span>
                      </h3>
                      <ul className="space-y-2">
                        {interview.aiRecommendation.strengths.map((strength, idx) => (
                          <li key={idx} className="flex items-start space-x-2 text-sm text-gray-700">
                            <span className="text-green-600 mt-1">•</span>
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {interview.aiRecommendation.weaknesses && interview.aiRecommendation.weaknesses.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center space-x-2">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Areas of Concern</span>
                      </h3>
                      <ul className="space-y-2">
                        {interview.aiRecommendation.weaknesses.map((weakness, idx) => (
                          <li key={idx} className="flex items-start space-x-2 text-sm text-gray-700">
                            <span className="text-red-600 mt-1">•</span>
                            <span>{weakness}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                
                {interview.aiRecommendation.generatedAt && (
                  <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                    Generated: {new Date(interview.aiRecommendation.generatedAt).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Skill Summary */}
            {stats.skillStatistics && Object.keys(stats.skillStatistics).length > 0 && (
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Skill-wise Performance Summary</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.values(stats.skillStatistics)
                    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
                    .slice(0, 6)
                    .map((skillStat) => (
                      <div key={skillStat.skillName} className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-bold text-gray-900">{skillStat.skillName}</h3>
                          <span className="text-xs text-gray-500">({skillStat.weight}%)</span>
                        </div>
                        {skillStat.questionsCount > 0 ? (
                          <>
                            <p className={`text-2xl font-bold mb-1 ${getScoreColor(skillStat.averageScores.overall)}`}>
                              {skillStat.averageScores.overall.toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-600">
                              {skillStat.questionsCount} question{skillStat.questionsCount !== 1 ? 's' : ''}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-amber-600">No questions asked</p>
                        )}
                      </div>
                    ))}
                </div>
                {Object.keys(stats.skillStatistics).length > 6 && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => setActiveTab('skills')}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      View all {Object.keys(stats.skillStatistics).length} skills →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Full Session Video */}
            {interview.fullSessionVideoUrl && (
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <Video className="h-5 w-5" />
                  <span>Complete Interview Session Recording</span>
                </h2>
                <div className="bg-black rounded-lg overflow-hidden aspect-video">
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
                <p className="text-xs text-gray-500 mt-2">
                  Full session video URL: <a href={interview.fullSessionVideoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{interview.fullSessionVideoUrl}</a>
                </p>
              </div>
            )}

            {/* Interview Information */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Interview Details</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Candidate:</span>
                    <span className="font-medium text-gray-900">
                      {interview.candidate ? 
                        `${interview.candidate.name} (${interview.candidate.email})` :
                        interview.candidateEmail
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className="font-medium text-gray-900 capitalize">{interview.status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Duration:</span>
                    <span className="font-medium text-gray-900">
                      {stats.timeAnalysis?.totalDurationMinutes || 
                        (interview.startedAt && interview.completedAt ? 
                          Math.round((new Date(interview.completedAt) - new Date(interview.startedAt)) / 60000) : 
                          'N/A'
                        )} minutes
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Questions Answered:</span>
                    <span className="font-medium text-gray-900">
                      {stats.answeredQuestions || 0} / {stats.totalQuestions || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Completion Rate:</span>
                    <span className="font-medium text-gray-900">
                      {stats.completionRate?.toFixed(1) || 0}%
                    </span>
                  </div>
                  {interview.startedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Started:</span>
                      <span className="font-medium text-gray-900">
                        {new Date(interview.startedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {interview.completedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Completed:</span>
                      <span className="font-medium text-gray-900">
                        {new Date(interview.completedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Token Usage & Cost */}
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Usage & Cost</h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Model:</span>
                    <span className="font-medium text-gray-900">{interview.geminiModel || 'gemini-2.5-pro'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Input Tokens:</span>
                    <span className="font-medium text-gray-900">
                      {(interview.totalTokenUsage?.input_tokens || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Output Tokens:</span>
                    <span className="font-medium text-gray-900">
                      {(interview.totalTokenUsage?.output_tokens || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Tokens:</span>
                    <span className="font-medium text-gray-900">
                      {stats.tokenAnalysis?.totalTokens?.toLocaleString() || 
                        ((interview.totalTokenUsage?.input_tokens || 0) + (interview.totalTokenUsage?.output_tokens || 0)).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg per Question:</span>
                    <span className="font-medium text-gray-900">
                      {stats.tokenAnalysis?.averageTokensPerQuestion?.toFixed(0) || 0}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 font-medium">Estimated Cost:</span>
                      <span className="text-2xl font-bold text-blue-600">
                        ₹{(interview.totalCostINR || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      (${(interview.totalCost || 0).toFixed(4)} USD)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Overall AI Analysis Summary */}
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                <Brain className="h-5 w-5 text-primary-600" />
                <span>Overall AI Analysis Summary</span>
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Performance Breakdown</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Average Relevance:</span>
                      <span className={`text-sm font-semibold ${getScoreColor(stats.averageScores?.relevance || 0)}`}>
                        {stats.averageScores?.relevance?.toFixed(1) || 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Average Technical Accuracy:</span>
                      <span className={`text-sm font-semibold ${getScoreColor(stats.averageScores?.technical_accuracy || 0)}`}>
                        {stats.averageScores?.technical_accuracy?.toFixed(1) || 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Average Fluency:</span>
                      <span className={`text-sm font-semibold ${getScoreColor(stats.averageScores?.fluency || 0)}`}>
                        {stats.averageScores?.fluency?.toFixed(1) || 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span className="text-sm font-medium text-gray-700">Score Range:</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {stats.averageScores?.minScore?.toFixed(1) || 0} - {stats.averageScores?.maxScore?.toFixed(1) || 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Score Distribution</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Excellent (≥80%):</span>
                      <span className="text-sm font-semibold text-green-600">
                        {stats.scoreDistribution?.excellent || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Good (60-79%):</span>
                      <span className="text-sm font-semibold text-yellow-600">
                        {stats.scoreDistribution?.good || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Fair (40-59%):</span>
                      <span className="text-sm font-semibold text-orange-600">
                        {stats.scoreDistribution?.fair || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Poor (&lt;40%):</span>
                      <span className="text-sm font-semibold text-red-600">
                        {stats.scoreDistribution?.poor || 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cheating Analysis Summary */}
              {stats.cheatingAnalysis && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center space-x-2">
                    <Shield className="h-4 w-4" />
                    <span>Cheating Detection Analysis</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600">Average Risk Score:</span>
                        <span className={`text-sm font-semibold ${getCheatRiskColor(stats.cheatingAnalysis.averageCheatScore || 0)}`}>
                          {(stats.cheatingAnalysis.averageCheatScore * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>High Risk: {stats.cheatingAnalysis.highRiskQuestions || 0}</span>
                        <span>Medium Risk: {stats.cheatingAnalysis.mediumRiskQuestions || 0}</span>
                        <span>Low Risk: {stats.cheatingAnalysis.lowRiskQuestions || 0}</span>
                      </div>
                    </div>
                    {stats.cheatingAnalysis.totalFlags > 0 && (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-sm text-gray-600 mb-2">Flag Breakdown:</div>
                        <div className="space-y-1 text-xs">
                          {Object.entries(stats.cheatingAnalysis.flagBreakdown || {}).map(([flag, count]) => (
                            count > 0 && (
                              <div key={flag} className="flex justify-between">
                                <span className="text-gray-600">{formatFlagName(flag)}:</span>
                                <span className="font-medium text-gray-900">{count}</span>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Questions Tab */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Question-by-Question Analysis</h2>
              <div className="space-y-4">
                {interview.questions.map((question, index) => (
                  <div
                    key={question.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => setSelectedQuestion(question)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-sm font-medium text-gray-500">Q{index + 1}</span>
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded-full capitalize">
                            {question.type}
                          </span>
                          {question.answeredAt && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                        <p className="text-gray-900 font-medium mb-2">{question.text}</p>
                        {question.skillsTargeted && question.skillsTargeted.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {question.skillsTargeted.map((skill, sIdx) => (
                              <span
                                key={sIdx}
                                className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full font-medium"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {question.evaluation && (
                          <div className="flex items-center space-x-4 text-sm mb-2">
                            <div>
                              <span className="text-gray-600">Score: </span>
                              <span className={`font-semibold ${getScoreColor(question.evaluation.overall_score || 0)}`}>
                                {question.evaluation.overall_score || 0}%
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Relevance: </span>
                              <span className="font-medium">{question.evaluation.relevance || 0}%</span>
                            </div>
                            {question.evaluation.technical_accuracy && (
                              <div>
                                <span className="text-gray-600">Technical: </span>
                                <span className="font-medium">{question.evaluation.technical_accuracy}%</span>
                              </div>
                            )}
                            <div>
                              <span className="text-gray-600">Fluency: </span>
                              <span className="font-medium">{question.evaluation.fluency || 0}%</span>
                            </div>
                          </div>
                        )}

                        {question.cheating && question.cheating.cheat_score > 0 && (
                          <div className="mt-2 flex items-center space-x-2">
                            <AlertTriangle className={`h-4 w-4 ${getCheatRiskColor(question.cheating.cheat_score)}`} />
                            <span className={`text-xs font-medium ${getCheatRiskColor(question.cheating.cheat_score)}`}>
                              Cheat Risk: {(question.cheating.cheat_score * 100).toFixed(1)}%
                              {question.cheating.cheat_flags?.length > 0 && (
                                <span className="ml-1">
                                  ({question.cheating.cheat_flags.length} flag{question.cheating.cheat_flags.length > 1 ? 's' : ''})
                                </span>
                              )}
                            </span>
                          </div>
                        )}

                        <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
                          {question.videoUrl && (
                            <div className="flex items-center space-x-1">
                              <Video className="h-3 w-3" />
                              <span>Video Available</span>
                            </div>
                          )}
                          {question.transcript && (
                            <div className="flex items-center space-x-1">
                              <FileText className="h-3 w-3" />
                              <span>Transcript Available</span>
                            </div>
                          )}
                          {question.token_usage && (
                            <div className="flex items-center space-x-1">
                              <Brain className="h-3 w-3" />
                              <span>
                                {(question.token_usage.input_tokens || 0) + (question.token_usage.output_tokens || 0)} tokens
                              </span>
                            </div>
                          )}
                          {question.answeredAt && (
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{new Date(question.answeredAt).toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <Eye className="h-5 w-5 text-gray-400 ml-4" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Statistics Tab */}
        {activeTab === 'statistics' && stats && (
          <div className="space-y-6">
            {/* Score Statistics */}
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Score Statistics</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Average Score</p>
                  <p className={`text-2xl font-bold ${getScoreColor(stats.averageScores?.overall || 0)}`}>
                    {stats.averageScores?.overall?.toFixed(1) || 0}%
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Minimum Score</p>
                  <p className={`text-2xl font-bold ${getScoreColor(stats.averageScores?.minScore || 0)}`}>
                    {stats.averageScores?.minScore?.toFixed(1) || 0}%
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Maximum Score</p>
                  <p className={`text-2xl font-bold ${getScoreColor(stats.averageScores?.maxScore || 0)}`}>
                    {stats.averageScores?.maxScore?.toFixed(1) || 0}%
                  </p>
                </div>
              </div>
            </div>

            {/* Token Usage Statistics */}
            {stats.tokenAnalysis && (
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-blue-600" />
                  <span>Token Usage Statistics</span>
                </h2>
                
                {/* Overall Interview Level */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Overall Interview Level</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-600 mb-1">Total Input Tokens</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {stats.tokenAnalysis.totalInputTokens?.toLocaleString() || interview.totalTokenUsage?.input_tokens?.toLocaleString() || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-600 mb-1">Total Output Tokens</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {stats.tokenAnalysis.totalOutputTokens?.toLocaleString() || interview.totalTokenUsage?.output_tokens?.toLocaleString() || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-blue-100 rounded-lg border-2 border-blue-300">
                      <p className="text-sm text-blue-700 mb-1 font-semibold">Total Tokens</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {stats.tokenAnalysis.totalTokens?.toLocaleString() || 0}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Per Question Level */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Per Question Level</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Average per Question</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {stats.tokenAnalysis.averageTokensPerQuestion?.toFixed(0) || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Min per Question</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {stats.tokenAnalysis.minTokensPerQuestion?.toLocaleString() || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1">Max per Question</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {stats.tokenAnalysis.maxTokensPerQuestion?.toLocaleString() || 0}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Question Type Breakdown */}
            {stats.questionTypeBreakdown && (
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Question Type Breakdown</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.entries(stats.questionTypeBreakdown).map(([type, count]) => (
                    <div key={type} className="p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600 mb-1 capitalize">{type} Questions</p>
                      <p className="text-2xl font-bold text-gray-900">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Video Analysis */}
            {stats.videoAnalysis && (
              <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Video Analysis</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="text-sm text-purple-600 mb-1">Total Videos</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {stats.videoAnalysis.totalVideos || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="text-sm text-purple-600 mb-1">With Transcripts</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {stats.videoAnalysis.videosWithTranscripts || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <p className="text-sm text-purple-600 mb-1">Coverage Rate</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {stats.videoAnalysis.videoCoverageRate?.toFixed(1) || 0}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Skills Analysis Tab */}
        {activeTab === 'skills' && (
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Skill-wise Performance Analysis</h2>
              
              {stats.skillStatistics && Object.keys(stats.skillStatistics).length > 0 ? (
                <div className="space-y-6">
                  {Object.values(stats.skillStatistics)
                    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
                    .map((skillStat) => (
                      <div key={skillStat.skillName} className="border border-gray-200 rounded-xl p-6 bg-gradient-to-br from-white to-gray-50">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="bg-indigo-500 p-2 rounded-lg">
                              <Brain className="h-5 w-5 text-white" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">{skillStat.skillName}</h3>
                              <p className="text-sm text-gray-500">Weight: {skillStat.weight}%</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500 mb-1">Questions Asked</p>
                            <p className="text-2xl font-bold text-indigo-600">{skillStat.questionsCount}</p>
                          </div>
                        </div>

                        {skillStat.questionsCount > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <div className="p-4 bg-white rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-600 mb-1">Average Overall</p>
                              <p className={`text-2xl font-bold ${getScoreColor(skillStat.averageScores.overall)}`}>
                                {skillStat.averageScores.overall.toFixed(1)}%
                              </p>
                            </div>
                            <div className="p-4 bg-white rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-600 mb-1">Average Relevance</p>
                              <p className={`text-xl font-bold ${getScoreColor(skillStat.averageScores.relevance)}`}>
                                {skillStat.averageScores.relevance.toFixed(1)}%
                              </p>
                            </div>
                            <div className="p-4 bg-white rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-600 mb-1">Technical Accuracy</p>
                              <p className={`text-xl font-bold ${getScoreColor(skillStat.averageScores.technical_accuracy)}`}>
                                {skillStat.averageScores.technical_accuracy.toFixed(1)}%
                              </p>
                            </div>
                            <div className="p-4 bg-white rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-600 mb-1">Average Fluency</p>
                              <p className={`text-xl font-bold ${getScoreColor(skillStat.averageScores.fluency)}`}>
                                {skillStat.averageScores.fluency.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-sm text-amber-700">No questions were asked for this skill.</p>
                          </div>
                        )}

                        {skillStat.questionsCount > 0 && (
                          <>
                            <div className="mb-4">
                              <p className="text-sm font-semibold text-gray-700 mb-2">Score Range</p>
                              <div className="flex items-center space-x-4 text-sm">
                                <div>
                                  <span className="text-gray-600">Min: </span>
                                  <span className="font-semibold text-gray-900">{skillStat.minScore.toFixed(1)}%</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Max: </span>
                                  <span className="font-semibold text-gray-900">{skillStat.maxScore.toFixed(1)}%</span>
                                </div>
                              </div>
                            </div>

                            <div className="mb-4">
                              <p className="text-sm font-semibold text-gray-700 mb-2">Score Distribution</p>
                              <div className="grid grid-cols-4 gap-2">
                                <div className="p-3 bg-green-50 rounded-lg text-center">
                                  <p className="text-xs text-green-600 mb-1">Excellent (≥80%)</p>
                                  <p className="text-lg font-bold text-green-700">{skillStat.scoreDistribution.excellent}</p>
                                </div>
                                <div className="p-3 bg-yellow-50 rounded-lg text-center">
                                  <p className="text-xs text-yellow-600 mb-1">Good (60-79%)</p>
                                  <p className="text-lg font-bold text-yellow-700">{skillStat.scoreDistribution.good}</p>
                                </div>
                                <div className="p-3 bg-orange-50 rounded-lg text-center">
                                  <p className="text-xs text-orange-600 mb-1">Fair (40-59%)</p>
                                  <p className="text-lg font-bold text-orange-700">{skillStat.scoreDistribution.fair}</p>
                                </div>
                                <div className="p-3 bg-red-50 rounded-lg text-center">
                                  <p className="text-xs text-red-600 mb-1">Poor (&lt;40%)</p>
                                  <p className="text-lg font-bold text-red-700">{skillStat.scoreDistribution.poor}</p>
                                </div>
                              </div>
                            </div>

                            {skillStat.questions && skillStat.questions.length > 0 && (
                              <div>
                                <p className="text-sm font-semibold text-gray-700 mb-2">Questions for this Skill</p>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {skillStat.questions.map((q, qIdx) => {
                                    const question = interview.questions.find(qu => qu.id === q.questionId);
                                    return (
                                      <div
                                        key={qIdx}
                                        className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-indigo-300 cursor-pointer transition-all"
                                        onClick={() => question && setSelectedQuestion(question)}
                                      >
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <p className="text-sm text-gray-900 font-medium mb-1">{q.questionText}</p>
                                            <div className="flex items-center space-x-3 text-xs text-gray-600">
                                              <span>Score: <span className={`font-semibold ${getScoreColor(q.overallScore)}`}>{q.overallScore.toFixed(1)}%</span></span>
                                              <span>Relevance: {q.relevance.toFixed(1)}%</span>
                                              <span>Technical: {q.technical_accuracy.toFixed(1)}%</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500">No skill statistics available. Skills may not have been assigned to questions.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Question Detail Modal */}
      {selectedQuestion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto my-8">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  Question {interview.questions.findIndex(q => q.id === selectedQuestion.id) + 1} - Detailed Analysis
                </h3>
                <button
                  onClick={() => setSelectedQuestion(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Question Text */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                    <FileText className="h-4 w-4" />
                    <span>Question</span>
                  </h4>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-gray-900">{selectedQuestion.text}</p>
                    <div className="mt-2 flex items-center space-x-2 text-xs text-gray-500">
                      <span className="px-2 py-1 bg-white rounded border border-gray-200 capitalize">
                        {selectedQuestion.type}
                      </span>
                      {selectedQuestion.answeredAt && (
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>Answered: {new Date(selectedQuestion.answeredAt).toLocaleString()}</span>
                        </span>
                      )}
                    </div>
                    {selectedQuestion.skillsTargeted && selectedQuestion.skillsTargeted.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Skills Targeted:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedQuestion.skillsTargeted.map((skill, sIdx) => (
                            <span
                              key={sIdx}
                              className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full font-medium"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Video Recording */}
                {selectedQuestion.videoUrl && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                      <Video className="h-4 w-4" />
                      <span>Video Recording</span>
                    </h4>
                    <div className="bg-black rounded-lg overflow-hidden aspect-video">
                      <ReactPlayer
                        url={selectedQuestion.videoUrl}
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
                    <p className="text-xs text-gray-500 mt-2">
                      Video URL: <a href={selectedQuestion.videoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{selectedQuestion.videoUrl}</a>
                    </p>
                  </div>
                )}

                {/* Transcript */}
                {selectedQuestion.transcript && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                      <FileText className="h-4 w-4" />
                      <span>Candidate Answer Transcript</span>
                    </h4>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-gray-900 whitespace-pre-wrap">{selectedQuestion.transcript}</p>
                    </div>
                  </div>
                )}

                {/* AI Analysis */}
                {selectedQuestion.evaluation && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                      <Brain className="h-4 w-4" />
                      <span>AI Analysis of Answer</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                      <div className="p-4 bg-gray-50 rounded-lg text-center">
                        <p className="text-xs text-gray-600 mb-1">Overall Score</p>
                        <p className={`text-2xl font-bold ${getScoreColor(selectedQuestion.evaluation.overall_score || 0)}`}>
                          {selectedQuestion.evaluation.overall_score || 0}%
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {getScoreLabel(selectedQuestion.evaluation.overall_score || 0)}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg text-center">
                        <p className="text-xs text-gray-600 mb-1">Relevance</p>
                        <p className={`text-2xl font-bold ${getScoreColor(selectedQuestion.evaluation.relevance || 0)}`}>
                          {selectedQuestion.evaluation.relevance || 0}%
                        </p>
                      </div>
                      {selectedQuestion.evaluation.technical_accuracy && (
                        <div className="p-4 bg-gray-50 rounded-lg text-center">
                          <p className="text-xs text-gray-600 mb-1">Technical Accuracy</p>
                          <p className={`text-2xl font-bold ${getScoreColor(selectedQuestion.evaluation.technical_accuracy)}`}>
                            {selectedQuestion.evaluation.technical_accuracy}%
                          </p>
                        </div>
                      )}
                      <div className="p-4 bg-gray-50 rounded-lg text-center">
                        <p className="text-xs text-gray-600 mb-1">Fluency</p>
                        <p className={`text-2xl font-bold ${getScoreColor(selectedQuestion.evaluation.fluency || 0)}`}>
                          {selectedQuestion.evaluation.fluency || 0}%
                        </p>
                      </div>
                    </div>
                    {selectedQuestion.evaluation.comment && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-medium text-blue-900 mb-1">AI Comment:</p>
                        <p className="text-sm text-blue-800 whitespace-pre-wrap">{selectedQuestion.evaluation.comment}</p>
                      </div>
                    )}
                    {selectedQuestion.evaluation.score_label && (
                      <div className="mt-2">
                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded-full">
                          Label: {selectedQuestion.evaluation.score_label}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Cheating Detection */}
                {selectedQuestion.cheating && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                      <Shield className="h-4 w-4" />
                      <span>Cheating Detection Analysis</span>
                    </h4>
                    <div className={`p-4 rounded-lg border ${getCheatRiskColor(selectedQuestion.cheating.cheat_score || 0)}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Risk Level:</p>
                        <p className={`text-lg font-bold ${getCheatRiskColor(selectedQuestion.cheating.cheat_score || 0)}`}>
                          {getCheatRiskLabel(selectedQuestion.cheating.cheat_score || 0)} 
                          ({(selectedQuestion.cheating.cheat_score * 100).toFixed(1)}%)
                        </p>
                      </div>
                      {selectedQuestion.cheating.cheat_flags && selectedQuestion.cheating.cheat_flags.length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm font-medium mb-2">Detection Flags:</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedQuestion.cheating.cheat_flags.map((flag, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium"
                              >
                                {formatFlagName(flag)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedQuestion.cheating.summary && (
                        <div className="mt-3 pt-3 border-t border-gray-300">
                          <p className="text-sm font-medium mb-1">Summary:</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedQuestion.cheating.summary}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Token Usage */}
                {selectedQuestion.token_usage && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center space-x-2">
                      <Brain className="h-4 w-4" />
                      <span>Token Usage</span>
                    </h4>
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Input Tokens</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {selectedQuestion.token_usage.input_tokens?.toLocaleString() || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Output Tokens</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {selectedQuestion.token_usage.output_tokens?.toLocaleString() || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">Total Tokens</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {((selectedQuestion.token_usage.input_tokens || 0) + (selectedQuestion.token_usage.output_tokens || 0)).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
