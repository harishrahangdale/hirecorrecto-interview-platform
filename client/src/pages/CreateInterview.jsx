import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { interviewAPI } from '../services/api'
import { ArrowLeft, Plus, Trash2, X, ChevronDown, ChevronUp, Sparkles, Target, Settings, FileText, Zap, Upload, FileCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import RichTextEditor from '../components/RichTextEditor'

export default function CreateInterview() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    skills: true,
    questions: false,
    config: true
  })
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    expectedSkills: [{ skill: '', topics: [], weight: 20 }],
    experienceRange: 'mid',
    dateWindow: {
      start: '',
      end: ''
    },
    passPercentage: 70,
    duration: 30,
    maxQuestions: 5,
    mandatoryWeightage: 0,
    optionalWeightage: 0
  })
  const [mandatoryQuestionsFile, setMandatoryQuestionsFile] = useState(null)
  const [optionalQuestionsFile, setOptionalQuestionsFile] = useState(null)
  const [mandatoryQuestionsPreview, setMandatoryQuestionsPreview] = useState([]) // Array of {text, skills: []}
  const [optionalQuestionsPreview, setOptionalQuestionsPreview] = useState([]) // Array of {text, skills: []}

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const handleChange = (e) => {
    const { name, value, type } = e.target
    // Convert numeric fields to numbers
    const numericFields = ['mandatoryWeightage', 'optionalWeightage', 'passPercentage', 'duration', 'maxQuestions']
    const processedValue = numericFields.includes(name) ? (value === '' ? 0 : parseFloat(value) || 0) : value
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.')
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: processedValue
        }
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: processedValue
      }))
    }
  }

  const handleSkillChange = (index, field, value) => {
    const newSkills = [...formData.expectedSkills]
    newSkills[index] = {
      ...newSkills[index],
      [field]: field === 'weight' ? parseFloat(value) || 0 : value
    }
    setFormData(prev => ({
      ...prev,
      expectedSkills: newSkills
    }))
  }

  const addSkill = () => {
    if (formData.expectedSkills.length < 7) {
      setFormData(prev => ({
        ...prev,
        expectedSkills: [...prev.expectedSkills, { skill: '', topics: [], weight: 20 }]
      }))
    }
  }

  const removeSkill = (index) => {
    if (formData.expectedSkills.length > 1) {
      const newSkills = formData.expectedSkills.filter((_, i) => i !== index)
      setFormData(prev => ({
        ...prev,
        expectedSkills: newSkills
      }))
    }
  }

  const addTopic = (skillIndex) => {
    const newSkills = [...formData.expectedSkills]
    if (!newSkills[skillIndex].topics) {
      newSkills[skillIndex].topics = []
    }
    newSkills[skillIndex].topics.push('')
    setFormData(prev => ({
      ...prev,
      expectedSkills: newSkills
    }))
  }

  const removeTopic = (skillIndex, topicIndex) => {
    const newSkills = [...formData.expectedSkills]
    newSkills[skillIndex].topics = newSkills[skillIndex].topics.filter((_, i) => i !== topicIndex)
    setFormData(prev => ({
      ...prev,
      expectedSkills: newSkills
    }))
  }

  const handleTopicChange = (skillIndex, topicIndex, value) => {
    const newSkills = [...formData.expectedSkills]
    newSkills[skillIndex].topics[topicIndex] = value
    setFormData(prev => ({
      ...prev,
      expectedSkills: newSkills
    }))
  }

  const handleFileUpload = async (file, type) => {
    if (!file) return
    
    // Validate file type
    if (!file.name.endsWith('.txt')) {
      toast.error('Please upload a .txt file')
      return
    }

    try {
      const text = await file.text()
      const questionTexts = text
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0)
      
      if (questionTexts.length === 0) {
        toast.error('No questions found in the file')
        return
      }

      // Convert to objects with text and skills array
      const questions = questionTexts.map(q => ({
        text: q,
        skills: []
      }))

      if (type === 'mandatory') {
        setMandatoryQuestionsFile(file)
        setMandatoryQuestionsPreview(questions)
        toast.success(`Loaded ${questions.length} mandatory questions. Please assign skills to each question.`)
      } else {
        setOptionalQuestionsFile(file)
        setOptionalQuestionsPreview(questions)
        toast.success(`Loaded ${questions.length} optional questions. Please assign skills to each question.`)
      }
    } catch (error) {
      console.error('Error reading file:', error)
      toast.error('Failed to read file')
    }
  }

  const handleQuestionSkillChange = (questionIndex, skillName, checked, type) => {
    if (type === 'mandatory') {
      const updated = [...mandatoryQuestionsPreview]
      if (checked) {
        if (!updated[questionIndex].skills.includes(skillName)) {
          updated[questionIndex].skills.push(skillName)
        }
      } else {
        updated[questionIndex].skills = updated[questionIndex].skills.filter(s => s !== skillName)
      }
      setMandatoryQuestionsPreview(updated)
    } else {
      const updated = [...optionalQuestionsPreview]
      if (checked) {
        if (!updated[questionIndex].skills.includes(skillName)) {
          updated[questionIndex].skills.push(skillName)
        }
      } else {
        updated[questionIndex].skills = updated[questionIndex].skills.filter(s => s !== skillName)
      }
      setOptionalQuestionsPreview(updated)
    }
  }

  const removeFile = (type) => {
    if (type === 'mandatory') {
      setMandatoryQuestionsFile(null)
      setMandatoryQuestionsPreview([])
    } else {
      setOptionalQuestionsFile(null)
      setOptionalQuestionsPreview([])
    }
  }

  const normalizeWeights = () => {
    const totalWeight = formData.expectedSkills.reduce((sum, skill) => sum + skill.weight, 0)
    if (totalWeight > 0) {
      const normalizedSkills = formData.expectedSkills.map(skill => ({
        ...skill,
        weight: Math.round((skill.weight / totalWeight) * 100)
      }))
      setFormData(prev => ({
        ...prev,
        expectedSkills: normalizedSkills
      }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validation
    if (!formData.title.trim()) {
      toast.error('Interview title is required')
      return
    }
    
    // Check if description has actual content (strip HTML tags)
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = formData.description || ''
    const descriptionText = tempDiv.textContent || tempDiv.innerText || ''
    if (!descriptionText.trim()) {
      toast.error('Interview description is required')
      return
    }
    
    const validSkills = formData.expectedSkills.filter(skill => skill.skill.trim())
    if (validSkills.length === 0) {
      toast.error('At least one skill is required')
      return
    }
    
    if (validSkills.length > 7) {
      toast.error('Maximum 7 skills allowed')
      return
    }

    // Filter out empty topics
    const cleanedSkills = validSkills.map(skill => ({
      ...skill,
      topics: (skill.topics || []).filter(topic => topic.trim())
    }))

    // Validate skill weights
    const totalWeight = cleanedSkills.reduce((sum, skill) => sum + skill.weight, 0)
    if (Math.abs(totalWeight - 100) > 0.01) {
      toast.error('Skill weights must sum to 100%')
      return
    }
    
    if (!formData.dateWindow.start || !formData.dateWindow.end) {
      toast.error('Date window is required')
      return
    }
    
    if (new Date(formData.dateWindow.start) >= new Date(formData.dateWindow.end)) {
      toast.error('End date must be after start date')
      return
    }

    if (formData.passPercentage < 0 || formData.passPercentage > 100) {
      toast.error('Pass percentage must be between 0 and 100')
      return
    }

    if (formData.duration < 5) {
      toast.error('Duration must be at least 5 minutes')
      return
    }

    if (formData.maxQuestions < 1) {
      toast.error('Max questions must be at least 1')
      return
    }

    // Validate weightage if questions are uploaded
    if (mandatoryQuestionsPreview.length > 0 || optionalQuestionsPreview.length > 0) {
      const mandatoryWeight = Number(formData.mandatoryWeightage || 0)
      const optionalWeight = Number(formData.optionalWeightage || 0)
      const totalWeightage = mandatoryWeight + optionalWeight
      if (Math.abs(totalWeightage - 100) > 0.01) {
        toast.error(`Mandatory and optional question weightage must sum to 100%. Current total: ${totalWeightage.toFixed(1)}%`)
        return
      }
      
      // Validate that all questions have at least one skill assigned
      const mandatoryWithoutSkills = mandatoryQuestionsPreview.filter(q => q.skills.length === 0)
      const optionalWithoutSkills = optionalQuestionsPreview.filter(q => q.skills.length === 0)
      
      if (mandatoryWithoutSkills.length > 0) {
        toast.error(`${mandatoryWithoutSkills.length} mandatory question(s) have no skills assigned. Please assign skills to all questions.`)
        return
      }
      
      if (optionalWithoutSkills.length > 0) {
        toast.error(`${optionalWithoutSkills.length} optional question(s) have no skills assigned. Please assign skills to all questions.`)
        return
      }
    }

    setLoading(true)

    try {
      // Create FormData for file uploads
      const formDataToSend = new FormData()
      
      // Add text fields
      formDataToSend.append('title', formData.title)
      formDataToSend.append('description', formData.description)
      formDataToSend.append('experienceRange', formData.experienceRange)
      formDataToSend.append('dateWindow', JSON.stringify(formData.dateWindow))
      formDataToSend.append('passPercentage', formData.passPercentage)
      formDataToSend.append('duration', formData.duration)
      formDataToSend.append('maxQuestions', formData.maxQuestions)
      formDataToSend.append('expectedSkills', JSON.stringify(cleanedSkills))
      formDataToSend.append('mandatoryWeightage', formData.mandatoryWeightage)
      formDataToSend.append('optionalWeightage', formData.optionalWeightage)
      
      // Add questions with skills (send as JSON since we've already parsed them)
      if (mandatoryQuestionsPreview.length > 0) {
        formDataToSend.append('mandatoryQuestions', JSON.stringify(mandatoryQuestionsPreview))
      }
      if (optionalQuestionsPreview.length > 0) {
        formDataToSend.append('optionalQuestions', JSON.stringify(optionalQuestionsPreview))
      }
      
      const response = await interviewAPI.createWithFiles(formDataToSend)
      toast.success('Interview created successfully!')
      navigate(`/interview/${response.data.interview.id}`)
    } catch (error) {
      console.error('Error creating interview:', error)
      toast.error(error.response?.data?.message || 'Failed to create interview')
    } finally {
      setLoading(false)
    }
  }

  const totalWeight = formData.expectedSkills.reduce((sum, skill) => sum + skill.weight, 0)
  const weightError = Math.abs(totalWeight - 100) > 0.01

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Modern Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 shadow-lg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-6">
            <button
              onClick={() => navigate('/')}
              className="flex items-center space-x-2 text-white/90 hover:text-white transition-colors bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">Back to Dashboard</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-lg">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Create New Interview</h1>
              <p className="text-gray-600 text-lg">Set up a new interview template for candidates</p>
            </div>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('basic')}
              className="w-full px-6 py-5 flex items-center justify-between hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all bg-gradient-to-r from-indigo-50/50 to-purple-50/50"
            >
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-2 rounded-lg">
                  <FileText className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Basic Information</h2>
                  <p className="text-xs text-gray-500">Interview title, description, and experience level</p>
                </div>
              </div>
              {expandedSections.basic ? (
                <ChevronUp className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
            </button>
            
            {expandedSections.basic && (
              <div className="px-6 pb-6 space-y-5 border-t border-gray-100 pt-6">
                <div>
                  <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
                    Interview Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                    placeholder="e.g., Senior React Developer Interview"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <RichTextEditor
                    value={formData.description}
                    onChange={(html) => {
                      setFormData(prev => ({
                        ...prev,
                        description: html
                      }))
                    }}
                    placeholder="Describe the role and what you're looking for... You can use formatting options above to style your description."
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-2 flex items-center space-x-1">
                    <FileText className="h-3 w-3" />
                    <span>Use the toolbar above to format your description with bold, italic, lists, and more</span>
                  </p>
                </div>

                <div>
                  <label htmlFor="experienceRange" className="block text-sm font-semibold text-gray-700 mb-2">
                    Experience Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="experienceRange"
                    name="experienceRange"
                    value={formData.experienceRange}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                    required
                  >
                    <option value="entry">Entry Level (0-1 years)</option>
                    <option value="junior">Junior (1-3 years)</option>
                    <option value="mid">Mid Level (3-5 years)</option>
                    <option value="senior">Senior (5-8 years)</option>
                    <option value="lead">Lead (8+ years)</option>
                    <option value="principal">Principal/Staff (10+ years)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-2 flex items-center space-x-1">
                    <Zap className="h-3 w-3" />
                    <span>Questions will be tailored to this experience level</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Skills Section */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('skills')}
              className="w-full px-6 py-5 flex items-center justify-between hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all bg-gradient-to-r from-indigo-50/50 to-purple-50/50"
            >
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-2 rounded-lg">
                  <Target className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Expected Skills</h2>
                  <p className="text-xs text-gray-500">Add skills and their specific topics</p>
                </div>
              </div>
              {expandedSections.skills ? (
                <ChevronUp className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
            </button>
            
            {expandedSections.skills && (
              <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-6">
                {formData.expectedSkills.map((skill, skillIndex) => (
                  <div key={skillIndex} className="border-2 border-gray-200 rounded-xl p-5 bg-gradient-to-br from-gray-50 to-white hover:border-indigo-300 transition-all">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="flex-1">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Skill Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={skill.skill}
                          onChange={(e) => handleSkillChange(skillIndex, 'skill', e.target.value)}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                          placeholder="e.g., Java, React, Problem Solving"
                        />
                      </div>
                      <div className="w-32">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Weight <span className="text-red-500">*</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={skill.weight}
                            onChange={(e) => handleSkillChange(skillIndex, 'weight', e.target.value)}
                            min="0"
                            max="100"
                            step="1"
                            className="w-full px-3 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                          />
                          <span className="text-sm font-medium text-gray-600">%</span>
                        </div>
                      </div>
                      {formData.expectedSkills.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSkill(skillIndex)}
                          className="mt-7 p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Remove skill"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      )}
                    </div>

                    {/* Topics Section */}
                    <div className="mt-4 pl-4 border-l-4 border-indigo-300 bg-indigo-50/30 rounded-r-lg p-3">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-sm font-semibold text-gray-700">
                          Topics (Optional)
                        </label>
                        <button
                          type="button"
                          onClick={() => addTopic(skillIndex)}
                          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-100 hover:bg-indigo-200 px-3 py-1.5 rounded-lg transition-all"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Topic</span>
                        </button>
                      </div>
                      
                      {skill.topics && skill.topics.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {skill.topics.map((topic, topicIndex) => (
                            <div key={topicIndex} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={topic}
                                onChange={(e) => handleTopicChange(skillIndex, topicIndex, e.target.value)}
                                className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white text-sm"
                                placeholder="e.g., OOPs, Collections, Streams"
                              />
                              <button
                                type="button"
                                onClick={() => removeTopic(skillIndex, topicIndex)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Remove topic"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {(!skill.topics || skill.topics.length === 0) && (
                        <p className="text-xs text-gray-500 italic">
                          No topics added. Click "Add Topic" to specify sub-topics for this skill.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                
                <div className="flex items-center justify-between pt-4 border-t-2 border-gray-200">
                  <div className="flex items-center gap-4">
                    {formData.expectedSkills.length < 7 && (
                      <button
                        type="button"
                        onClick={addSkill}
                        className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-100 hover:bg-indigo-200 px-4 py-2 rounded-lg transition-all"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add Skill</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={normalizeWeights}
                      className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      Normalize Weights
                    </button>
                  </div>
                  <div className={`text-sm font-bold px-4 py-2 rounded-lg ${weightError ? 'text-red-600 bg-red-50 border-2 border-red-200' : 'text-emerald-600 bg-emerald-50 border-2 border-emerald-200'}`}>
                    Total Weight: {totalWeight}%
                    {weightError && (
                      <span className="ml-2 text-xs font-normal">(Must equal 100%)</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Questions Configuration */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('questions')}
              className="w-full px-6 py-5 flex items-center justify-between hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all bg-gradient-to-r from-indigo-50/50 to-purple-50/50"
            >
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-lg">
                  <FileCheck className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Questions Configuration</h2>
                  <p className="text-xs text-gray-500">Upload mandatory and optional questions (optional)</p>
                </div>
              </div>
              {expandedSections.questions ? (
                <ChevronUp className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
            </button>
            
            {expandedSections.questions && (
              <div className="px-6 pb-6 space-y-5 border-t border-gray-100 pt-6">
                {/* Mandatory Questions */}
                <div className="border-2 border-gray-200 rounded-xl p-5 bg-gradient-to-br from-gray-50 to-white">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Mandatory Questions (Optional)
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Upload a .txt file with one question per line. These questions will be asked to every candidate.
                  </p>
                  
                  {!mandatoryQuestionsFile ? (
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-all">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-8 h-8 mb-2 text-gray-400" />
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">.txt file only</p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept=".txt"
                          onChange={(e) => {
                            const file = e.target.files[0]
                            if (file) handleFileUpload(file, 'mandatory')
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-emerald-50 border-2 border-emerald-200 rounded-lg p-3">
                        <div className="flex items-center space-x-2">
                          <FileCheck className="h-5 w-5 text-emerald-600" />
                          <span className="text-sm font-medium text-emerald-700">
                            {mandatoryQuestionsFile.name} ({mandatoryQuestionsPreview.length} questions)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile('mandatory')}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1 rounded"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {mandatoryQuestionsPreview.length > 0 && (
                        <div className="border border-gray-200 rounded-lg p-4 bg-white">
                          <p className="text-sm font-semibold text-gray-700 mb-3">
                            Assign Skills to Questions ({mandatoryQuestionsPreview.length} questions)
                          </p>
                          <div className="max-h-96 overflow-y-auto space-y-4">
                            {mandatoryQuestionsPreview.map((question, qIdx) => (
                              <div key={qIdx} className="border-b border-gray-100 pb-3 last:border-b-0">
                                <p className="text-sm font-medium text-gray-800 mb-2">
                                  {qIdx + 1}. {question.text}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {formData.expectedSkills.filter(s => s.skill.trim()).map((skill, sIdx) => (
                                    <label
                                      key={sIdx}
                                      className="flex items-center space-x-1 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={question.skills.includes(skill.skill)}
                                        onChange={(e) => handleQuestionSkillChange(qIdx, skill.skill, e.target.checked, 'mandatory')}
                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                      />
                                      <span className="text-xs text-gray-600">{skill.skill}</span>
                                    </label>
                                  ))}
                                </div>
                                {question.skills.length === 0 && (
                                  <p className="text-xs text-amber-600 mt-1 italic">⚠️ No skills assigned</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Optional Questions */}
                <div className="border-2 border-gray-200 rounded-xl p-5 bg-gradient-to-br from-gray-50 to-white">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Optional/Sample Questions (Optional)
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Upload a .txt file with sample questions. AI will generate similar questions based on these.
                  </p>
                  
                  {!optionalQuestionsFile ? (
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-all">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <Upload className="w-8 h-8 mb-2 text-gray-400" />
                          <p className="mb-2 text-sm text-gray-500">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-gray-500">.txt file only</p>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept=".txt"
                          onChange={(e) => {
                            const file = e.target.files[0]
                            if (file) handleFileUpload(file, 'optional')
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
                        <div className="flex items-center space-x-2">
                          <FileCheck className="h-5 w-5 text-blue-600" />
                          <span className="text-sm font-medium text-blue-700">
                            {optionalQuestionsFile.name} ({optionalQuestionsPreview.length} questions)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile('optional')}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 p-1 rounded"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {optionalQuestionsPreview.length > 0 && (
                        <div className="border border-gray-200 rounded-lg p-4 bg-white">
                          <p className="text-sm font-semibold text-gray-700 mb-3">
                            Assign Skills to Questions ({optionalQuestionsPreview.length} questions)
                          </p>
                          <div className="max-h-96 overflow-y-auto space-y-4">
                            {optionalQuestionsPreview.map((question, qIdx) => (
                              <div key={qIdx} className="border-b border-gray-100 pb-3 last:border-b-0">
                                <p className="text-sm font-medium text-gray-800 mb-2">
                                  {qIdx + 1}. {question.text}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {formData.expectedSkills.filter(s => s.skill.trim()).map((skill, sIdx) => (
                                    <label
                                      key={sIdx}
                                      className="flex items-center space-x-1 cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={question.skills.includes(skill.skill)}
                                        onChange={(e) => handleQuestionSkillChange(qIdx, skill.skill, e.target.checked, 'optional')}
                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                      />
                                      <span className="text-xs text-gray-600">{skill.skill}</span>
                                    </label>
                                  ))}
                                </div>
                                {question.skills.length === 0 && (
                                  <p className="text-xs text-amber-600 mt-1 italic">⚠️ No skills assigned</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Weightage Configuration */}
                {(mandatoryQuestionsPreview.length > 0 || optionalQuestionsPreview.length > 0) && (
                  <div className="border-2 border-indigo-200 rounded-xl p-5 bg-indigo-50/30">
                    <label className="block text-sm font-semibold text-gray-700 mb-4">
                      Question Weightage <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-gray-500 mb-4">
                      Set the percentage of questions that should come from mandatory vs optional/sample questions. Must sum to 100%.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="mandatoryWeightage" className="block text-sm font-medium text-gray-700 mb-2">
                          Mandatory Questions Weightage
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            id="mandatoryWeightage"
                            name="mandatoryWeightage"
                            value={formData.mandatoryWeightage}
                            onChange={handleChange}
                            min="0"
                            max="100"
                            step="1"
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                          />
                          <span className="text-sm font-medium text-gray-600">%</span>
                        </div>
                        {mandatoryQuestionsPreview.length > 0 && formData.maxQuestions > 0 && (
                          <p className="text-xs text-gray-500 mt-2">
                            ≈ {Math.round((Number(formData.mandatoryWeightage || 0) / 100) * Number(formData.maxQuestions || 0))} questions from {mandatoryQuestionsPreview.length} mandatory questions
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <label htmlFor="optionalWeightage" className="block text-sm font-medium text-gray-700 mb-2">
                          Optional/Sample Questions Weightage
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            id="optionalWeightage"
                            name="optionalWeightage"
                            value={formData.optionalWeightage}
                            onChange={handleChange}
                            min="0"
                            max="100"
                            step="1"
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                          />
                          <span className="text-sm font-medium text-gray-600">%</span>
                        </div>
                        {optionalQuestionsPreview.length > 0 && formData.maxQuestions > 0 && (
                          <p className="text-xs text-gray-500 mt-2">
                            ≈ {Math.round((Number(formData.optionalWeightage || 0) / 100) * Number(formData.maxQuestions || 0))} questions generated based on {optionalQuestionsPreview.length} sample questions
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className={`mt-4 text-sm font-bold px-4 py-2 rounded-lg ${
                      Math.abs((Number(formData.mandatoryWeightage || 0) + Number(formData.optionalWeightage || 0)) - 100) > 0.01
                        ? 'text-red-600 bg-red-50 border-2 border-red-200'
                        : 'text-emerald-600 bg-emerald-50 border-2 border-emerald-200'
                    }`}>
                      Total Weightage: {(Number(formData.mandatoryWeightage || 0) + Number(formData.optionalWeightage || 0)).toFixed(1)}%
                      {Math.abs((Number(formData.mandatoryWeightage || 0) + Number(formData.optionalWeightage || 0)) - 100) > 0.01 && (
                        <span className="ml-2 text-xs font-normal">(Must equal 100%)</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Interview Configuration */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection('config')}
              className="w-full px-6 py-5 flex items-center justify-between hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all bg-gradient-to-r from-indigo-50/50 to-purple-50/50"
            >
              <div className="flex items-center space-x-3">
                <div className="bg-gradient-to-br from-pink-500 to-rose-600 p-2 rounded-lg">
                  <Settings className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Interview Configuration</h2>
                  <p className="text-xs text-gray-500">Dates, duration, and scoring settings</p>
                </div>
              </div>
              {expandedSections.config ? (
                <ChevronUp className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
            </button>
            
            {expandedSections.config && (
              <div className="px-6 pb-6 space-y-5 border-t border-gray-100 pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="dateWindow.start" className="block text-sm font-semibold text-gray-700 mb-2">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      id="dateWindow.start"
                      name="dateWindow.start"
                      value={formData.dateWindow.start}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                      required
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="dateWindow.end" className="block text-sm font-semibold text-gray-700 mb-2">
                      End Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="datetime-local"
                      id="dateWindow.end"
                      name="dateWindow.end"
                      value={formData.dateWindow.end}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label htmlFor="passPercentage" className="block text-sm font-semibold text-gray-700 mb-2">
                      Pass Percentage <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      id="passPercentage"
                      name="passPercentage"
                      value={formData.passPercentage}
                      onChange={handleChange}
                      min="0"
                      max="100"
                      step="1"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-2">Score required to pass (0-100%)</p>
                  </div>
                  
                  <div>
                    <label htmlFor="duration" className="block text-sm font-semibold text-gray-700 mb-2">
                      Duration (minutes) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      id="duration"
                      name="duration"
                      value={formData.duration}
                      onChange={handleChange}
                      min="5"
                      step="5"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-2">Interview duration (minimum 5 min)</p>
                  </div>
                  
                  <div>
                    <label htmlFor="maxQuestions" className="block text-sm font-semibold text-gray-700 mb-2">
                      Max Questions <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      id="maxQuestions"
                      name="maxQuestions"
                      value={formData.maxQuestions}
                      onChange={handleChange}
                      min="1"
                      step="1"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-2">Maximum questions to ask (minimum 1)</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-8 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || weightError}
              className="px-8 py-3 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? 'Creating...' : 'Create Interview'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
