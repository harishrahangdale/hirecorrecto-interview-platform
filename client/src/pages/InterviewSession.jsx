import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { interviewAPI, uploadAPI } from '../services/api'
import { LogOut, CheckCircle2, AlertCircle, Sparkles, Clock, Video as VideoIcon, Mic, MicOff } from 'lucide-react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import io from 'socket.io-client'

export default function InterviewSession() {
  const { id, token } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [interview, setInterview] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [botGreeting, setBotGreeting] = useState('')
  const [socket, setSocket] = useState(null)
  const [geminiSession, setGeminiSession] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [sessionStatus, setSessionStatus] = useState('loading') // loading, ready, in_progress, completed
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [interviewStartTime, setInterviewStartTime] = useState(null)
  
  // Speech recognition and transcription
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [canStartAnswer, setCanStartAnswer] = useState(false) // New: controls when Start Answer button is shown
  
  // Phase 1: Real-time conversation state
  const [lastSpeechTime, setLastSpeechTime] = useState(null)
  const [silenceMonitorInterval, setSilenceMonitorInterval] = useState(null)
  const [botIntervention, setBotIntervention] = useState(null)
  const [botDeflection, setBotDeflection] = useState(null)
  const [botAcknowledgment, setBotAcknowledgment] = useState(null)
  const [followupQuestion, setFollowupQuestion] = useState(null)
  
  // Phase 2: Bi-directional conversation state
  const [candidateSpeaking, setCandidateSpeaking] = useState(false)
  const [conversationState, setConversationState] = useState('idle') // 'idle' | 'bot_speaking' | 'candidate_speaking' | 'listening'
  const [audioEnergy, setAudioEnergy] = useState(0) // For VAD visualization
  const [turnQueue, setTurnQueue] = useState([]) // Queue for turn management
  
  // Video+Audio recording for submission
  const [videoChunks, setVideoChunks] = useState([])
  const [mediaRecorder, setMediaRecorder] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const [capturedFrames, setCapturedFrames] = useState([]) // Store multiple frames for cheating detection
  const [isFullSessionRecording, setIsFullSessionRecording] = useState(false) // Track if full session is recording
  
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const intervalRef = useRef(null)
  const recognitionRef = useRef(null)
  const speechTimeoutRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioWorkletRef = useRef(null)
  const silenceStartTimeRef = useRef(null)
  // Phase 2: VAD and audio streaming refs
  const analyserNodeRef = useRef(null)
  const audioStreamRef = useRef(null)
  const vadIntervalRef = useRef(null)
  const audioChunkIntervalRef = useRef(null)
  const vadThresholdRef = useRef(0.01) // Adaptive threshold for VAD
  const lastVADStateRef = useRef(false) // Track previous VAD state
  const silenceDurationRef = useRef(0) // Track silence duration for turn-taking
  const candidateSpeakingStartTimeRef = useRef(null)
  const isAnsweringRef = useRef(false)
  const mediaRecorderRef = useRef(null) // Use ref for immediate access
  const processedResultsRef = useRef(new Set()) // Track processed result indices to prevent duplicates
  const finalTranscriptRef = useRef('') // Store final transcript separately
  const transcriptUpdateTimeoutRef = useRef(null) // Debounce transcript updates
  const lastFinalWordsRef = useRef([]) // Track last few words to detect duplicates
  const speakingRef = useRef(false) // Track if speech is currently in progress
  const currentUtteranceRef = useRef(null) // Track current utterance to prevent duplicates
  const conversationStartedRef = useRef(false) // Prevent multiple conversation starts
  const interviewDataRef = useRef(null) // Store interview data for event handlers
  const sessionTimeoutRef = useRef(null) // Track session initialization timeout
  const sessionInitializedRef = useRef(false) // Prevent duplicate session initialization
  const currentQuestionIdRef = useRef(null) // Store current question ID to prevent null reference issues
  const isHandlingResponseRef = useRef(false) // Prevent duplicate handling of gemini-response events
  const candidateInterviewIdRef = useRef(null) // Store candidate-specific interview ID (different from template ID)
  
  // Continuous recording and timestamp tracking for cheating detection
  const fullSessionRecorderRef = useRef(null) // Continuous recording for entire session
  const fullSessionChunksRef = useRef([]) // Chunks for full session recording
  const questionTimestampsRef = useRef({}) // Track timestamps for each question
  const sessionStartTimeRef = useRef(null) // When the interview session started
  const currentQuestionStartTimeRef = useRef(null) // When current question started being spoken
  const currentQuestionEndTimeRef = useRef(null) // When current question finished being spoken
  const currentAnswerStartTimeRef = useRef(null) // When candidate clicked start answer (or auto-detected)
  const currentAnswerEndTimeRef = useRef(null) // When candidate clicked stop answer

  useEffect(() => {
    // Prevent duplicate initialization
    if (sessionInitializedRef.current) {
      console.log('Session already initialized, skipping duplicate')
      return
    }
    sessionInitializedRef.current = true
    initializeSession()
    return () => {
      cleanup()
      sessionInitializedRef.current = false
    }
  }, [])

  // Ensure video element gets stream when it's available
  useEffect(() => {
    const checkVideo = () => {
      if (videoRef.current && streamRef.current) {
        if (!videoRef.current.srcObject || videoRef.current.srcObject !== streamRef.current) {
          videoRef.current.srcObject = streamRef.current
          videoRef.current.play().catch(err => {
            console.error('Error playing video:', err)
          })
        }
      }
    }
    
    // Check immediately
    checkVideo()
    
    // Also check after a short delay to ensure DOM is ready
    const timeout = setTimeout(checkVideo, 100)
    
    return () => clearTimeout(timeout)
  })

  const cleanup = () => {
    if (socket) socket.disconnect()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current)
    }
    if (transcriptUpdateTimeoutRef.current) {
      clearTimeout(transcriptUpdateTimeoutRef.current)
    }
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current)
      sessionTimeoutRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    
    // Phase 2: Stop VAD
    stopVAD()
    // Stop any ongoing speech
    window.speechSynthesis.cancel()
    speakingRef.current = false
    currentUtteranceRef.current = null
    
    // Stop media recorder if recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }

  // Timer effect
  useEffect(() => {
    if (sessionStatus === 'in_progress' && interviewStartTime && interview?.duration) {
      const durationMs = interview.duration * 60 * 1000
      const startTime = new Date(interviewStartTime).getTime()
      
      const updateTimer = () => {
        const now = Date.now()
        const elapsed = now - startTime
        const remaining = Math.max(0, durationMs - elapsed)
        
        setTimeRemaining(Math.ceil(remaining / 1000))
        
        if (remaining <= 0) {
          handleTimeUp()
        }
      }
      
      updateTimer()
      intervalRef.current = setInterval(updateTimer, 1000)
      
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
      }
    }
  }, [sessionStatus, interviewStartTime, interview?.duration])

  // Phase 1: Silence monitoring with debouncing to prevent duplicate emissions
  // IMPORTANT: Only monitor silence when candidate is actively answering (not after they've finished)
  useEffect(() => {
    if (sessionStatus === 'in_progress' && currentQuestion && socket && geminiSession && canStartAnswer && lastSpeechTime && !candidateSpeaking && isAnsweringRef.current) {
      let hasIntervened = false
      let lastCheckedDuration = 0
      let lastEmittedLevel = null // Track last emitted intervention level
      let interventionEmitted = false // Flag to prevent duplicate emissions
      
      const monitorSilence = setInterval(() => {
        // Don't monitor if:
        // - Candidate is currently speaking
        // - No question or lastSpeechTime
        // - Not actively answering (isAnsweringRef is false - means they've finished)
        if (!lastSpeechTime || !currentQuestion || candidateSpeaking || !isAnsweringRef.current) {
          return
        }
        
        const silenceDuration = Date.now() - lastSpeechTime
        
        // Only emit if we've crossed a threshold AND haven't already emitted for this level
        // This prevents duplicate emissions that cause multiple question jumps
        if (silenceDuration >= 7000 && silenceDuration < 15000 && !hasIntervened && lastCheckedDuration < 7000 && lastEmittedLevel !== 'thinking_check') {
          // First intervention: thinking check
          socket.emit('silence-detected', {
            sessionId: geminiSession,
            questionId: currentQuestion.id,
            silenceDuration: silenceDuration,
            interventionLevel: 'thinking_check'
          })
          hasIntervened = true
          lastEmittedLevel = 'thinking_check'
          interventionEmitted = true
        } else if (silenceDuration >= 15000 && silenceDuration < 30000 && lastCheckedDuration < 15000 && lastEmittedLevel !== 'suggest_move_on') {
          // Second intervention: suggest move on
          socket.emit('silence-detected', {
            sessionId: geminiSession,
            questionId: currentQuestion.id,
            silenceDuration: silenceDuration,
            interventionLevel: 'suggest_move_on'
          })
          lastEmittedLevel = 'suggest_move_on'
          interventionEmitted = true
        } else if (silenceDuration >= 30000 && lastCheckedDuration < 30000 && lastEmittedLevel !== 'force_move') {
          // Force move to next question - only emit once
          socket.emit('silence-detected', {
            sessionId: geminiSession,
            questionId: currentQuestion.id,
            silenceDuration: silenceDuration,
            interventionLevel: 'force_move'
          })
          lastEmittedLevel = 'force_move'
          interventionEmitted = true
          // Clear the interval after force move to prevent further emissions
          clearInterval(monitorSilence)
        }
        
        lastCheckedDuration = silenceDuration
      }, 2000) // Check every 2 seconds (reduced frequency to prevent rapid emissions)
      
      setSilenceMonitorInterval(monitorSilence)
      
      return () => {
        if (monitorSilence) {
          clearInterval(monitorSilence)
        }
      }
    } else {
      // Clear interval if conditions not met
      if (silenceMonitorInterval) {
        clearInterval(silenceMonitorInterval)
        setSilenceMonitorInterval(null)
      }
    }
  }, [sessionStatus, currentQuestion, socket, geminiSession, canStartAnswer, lastSpeechTime, candidateSpeaking])

  const handleTimeUp = () => {
    toast.error('Time\'s up! Interview will be submitted automatically.')
    completeInterview()
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const initializeSession = async () => {
    try {
      console.log('🚀 Initializing interview session...')
      // Load interview data
      const response = await interviewAPI.getById(id)
      const interviewData = response.data.interview
      setInterview(interviewData)
      interviewDataRef.current = interviewData
      
      // Ensure interview is started before initializing session
      let candidateInterviewId = id // Default to template ID
      let interviewToUse = interviewData
      
      if (interviewData.status === 'invited') {
        console.log('Interview not started yet, starting now...')
        try {
          const startResponse = await interviewAPI.startInterview(id)
          // The startInterview API now returns the candidate-specific interview ID
          candidateInterviewId = startResponse.data.interview.id
          candidateInterviewIdRef.current = candidateInterviewId
          console.log('✅ Candidate-specific interview ID:', candidateInterviewId)
          
          // Load the candidate-specific interview data
          const updatedResponse = await interviewAPI.getById(candidateInterviewId)
          interviewToUse = updatedResponse.data.interview
          setInterview(interviewToUse)
          interviewDataRef.current = interviewToUse
        } catch (startError) {
          console.error('Error starting interview:', startError)
          toast.error('Failed to start interview. Please try again.')
          setSessionStatus('error')
          return
        }
      } else if (interviewData.status === 'in_progress' || interviewData.status === 'completed') {
        // Check if this is a candidate-specific interview (has candidateId/candidateEmail)
        if (interviewData.candidateId || interviewData.candidateEmail) {
          // This is already a candidate-specific interview
          candidateInterviewId = interviewData.id || id
          candidateInterviewIdRef.current = candidateInterviewId
          console.log('✅ Using existing candidate interview ID:', candidateInterviewId)
        } else {
          // This is a template, need to find or create candidate-specific interview
          console.log('Template detected, finding candidate-specific interview...')
          // Try to find existing candidate interview attempt
          const allInterviews = await interviewAPI.getAll()
          const candidateAttempt = allInterviews.data.interviews.find(
            inv => inv.title === interviewData.title && 
                   (inv.candidateId || inv.candidateEmail) &&
                   inv.status === 'in_progress'
          )
          
          if (candidateAttempt) {
            candidateInterviewId = candidateAttempt.id
            candidateInterviewIdRef.current = candidateInterviewId
            interviewToUse = candidateAttempt
            setInterview(interviewToUse)
            interviewDataRef.current = interviewToUse
            console.log('✅ Found existing candidate interview:', candidateInterviewId)
          } else {
            // Start new attempt
            const startResponse = await interviewAPI.startInterview(id)
            candidateInterviewId = startResponse.data.interview.id
            candidateInterviewIdRef.current = candidateInterviewId
            const updatedResponse = await interviewAPI.getById(candidateInterviewId)
            interviewToUse = updatedResponse.data.interview
            setInterview(interviewToUse)
            interviewDataRef.current = interviewToUse
            console.log('✅ Created new candidate interview:', candidateInterviewId)
          }
        }
      } else {
        console.error(`Interview is in invalid status: ${interviewData.status}`)
        toast.error(`Interview cannot be started. Current status: ${interviewData.status}`)
        setSessionStatus('error')
        return
      }
      
      // Initialize Socket.IO connection (only if not already connected)
      if (socket && socket.connected) {
        console.log('Socket already connected, reusing existing connection')
        return
      }
      
      // Socket.IO URL configuration:
      // - Development: Use localhost:5004 (or from VITE_API_URL if set)
      // - Production with VITE_API_URL: Use the backend URL (remove /api suffix if present)
      // - Production without VITE_API_URL: Use relative path (for Docker Compose)
      const getSocketUrl = () => {
        if (import.meta.env.VITE_API_URL) {
          // Remove /api suffix if present, Socket.IO connects to the root
          return import.meta.env.VITE_API_URL.replace('/api', '')
        }
        
        // Development: use localhost
        if (import.meta.env.DEV) {
          return 'http://localhost:5004'
        }
        
        // Production fallback: use relative path (works with Docker Compose nginx proxy)
        console.warn('VITE_API_URL not set. Socket.IO may not work in separate deployment. Set VITE_API_URL to your backend URL.')
        return window.location.origin
      }
      
      const socketUrl = getSocketUrl()
      console.log('Connecting to socket at:', socketUrl)
      
      // Disconnect existing socket if any
      if (socket) {
        console.log('Disconnecting existing socket before creating new one')
        socket.disconnect()
      }
      
      const newSocket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      })
      setSocket(newSocket)
      
      // Set up timeout to detect if session doesn't start
      sessionTimeoutRef.current = setTimeout(() => {
        console.error('⏱️ Session initialization timeout - no response from server')
        // Try to use existing questions if available
        const currentInterview = interviewDataRef.current
        if (currentInterview?.questions?.length > 0) {
          console.log('Timeout: Using existing questions as fallback')
          setGeminiSession('fallback-session')
          setSessionStatus('ready')
          const firstQuestion = currentInterview.questions[0]
          // DON'T set conversationStartedRef here - let startNaturalConversation set it
          if (!conversationStartedRef.current) {
            setTimeout(() => {
              startNaturalConversation(firstQuestion)
            }, 500)
          }
        } else {
          toast.error('Session initialization timed out. Please refresh the page.')
          setSessionStatus('error')
        }
      }, 20000) // 20 second timeout
      
      newSocket.on('connect', () => {
        console.log('✅ Socket connected:', newSocket.id)
        if (sessionTimeoutRef.current) {
          clearTimeout(sessionTimeoutRef.current)
          sessionTimeoutRef.current = null
        }
        
        if (!newSocket.connected) {
          console.error('Socket not connected, retrying...')
          return
        }
        
        // Use candidate-specific interview ID for socket operations
        const interviewIdForSocket = candidateInterviewIdRef.current || id
        newSocket.emit('join-interview', { 
          interviewId: interviewIdForSocket, 
          userRole: user?.role || 'candidate' 
        })
        console.log('Emitted join-interview with interview ID:', interviewIdForSocket)
        
        // Phase 2: Start audio streaming if stream is available
        if (streamRef.current && geminiSession) {
          setTimeout(() => {
            startAudioStreaming(streamRef.current)
          }, 500) // Small delay to ensure everything is ready
        }
        
        // Emit start-gemini-session after socket is connected and interview is joined
        // Small delay to ensure join-interview is processed
        setTimeout(() => {
          if (newSocket.connected) {
            console.log('Starting Gemini session...')
            // Use candidate-specific interview ID for socket operations
            const interviewIdForSocket = candidateInterviewIdRef.current || id
            newSocket.emit('start-gemini-session', {
              interviewId: interviewIdForSocket,
              candidateId: user?.id || user?._id || 'anonymous'
            })
            console.log('Emitted start-gemini-session')
          } else {
            console.error('Socket disconnected before emitting start-gemini-session')
            toast.error('Connection lost. Please refresh the page.')
            setSessionStatus('error')
          }
        }, 200)
      })
      
      newSocket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error)
        if (sessionTimeoutRef.current) {
          clearTimeout(sessionTimeoutRef.current)
          sessionTimeoutRef.current = null
        }
        toast.error('Failed to connect to server. Please check your connection and refresh.')
        setSessionStatus('error')
      })
      
      newSocket.on('disconnect', (reason) => {
        console.warn('Socket disconnected:', reason)
        if (sessionStatus === 'loading') {
          toast.error('Connection lost during initialization. Please refresh.')
          setSessionStatus('error')
        }
      })
      
      newSocket.on('gemini-session-ready', (data) => {
        console.log('✅ Gemini session ready:', data)
        if (sessionTimeoutRef.current) {
          clearTimeout(sessionTimeoutRef.current)
          sessionTimeoutRef.current = null
        }
        setGeminiSession(data.sessionId)
        setSessionStatus('ready')
        
        // Phase 2: Start audio streaming if stream is available
        if (streamRef.current && newSocket.connected) {
          setTimeout(() => {
            startAudioStreaming(streamRef.current)
          }, 500)
        }
        
        // Set the first question if provided (but don't display it yet - wait for speech)
        if (data.firstQuestion) {
          console.log('Received first question:', data.firstQuestion.id)
          setInterview(prev => {
            // Check if question already exists
            const existingQuestion = prev?.questions?.find(q => q.id === data.firstQuestion.id)
            if (existingQuestion) {
              return prev
            }
            return {
              ...prev,
              questions: prev?.questions?.length > 0 ? prev.questions : [data.firstQuestion]
            }
          })
          // Start interview automatically (only once)
          // DON'T set conversationStartedRef here - let startNaturalConversation set it
          if (!conversationStartedRef.current) {
            console.log('Starting natural conversation with first question')
            // Don't set currentQuestion here - let startNaturalConversation handle it
            setTimeout(() => {
              startNaturalConversation(data.firstQuestion)
            }, 500)
          } else {
            console.log('Conversation already started, skipping duplicate call')
          }
        } else {
          // Check if interview already has questions (e.g., after refresh)
          const currentInterview = interviewDataRef.current
          if (currentInterview?.questions?.length > 0) {
            console.log('Using existing first question from interview')
            const firstQuestion = currentInterview.questions[0]
            // DON'T set conversationStartedRef here - let startNaturalConversation set it
            if (!conversationStartedRef.current) {
              setTimeout(() => {
                startNaturalConversation(firstQuestion)
              }, 500)
            } else {
              console.log('Conversation already started, skipping duplicate call')
            }
          } else {
            console.warn('❌ No first question received in gemini-session-ready event')
            toast.error('Failed to receive first question. Please try again.')
            setSessionStatus('error')
          }
        }
      })
      
      newSocket.on('gemini-response', (response) => {
        // Only handle response if we're not already processing an answer
        // This prevents duplicate handling when response comes from processAnswer
        if (!isHandlingResponseRef.current) {
          isHandlingResponseRef.current = true
          handleGeminiResponse(response).finally(() => {
            isHandlingResponseRef.current = false
          })
        }
      })
      
      newSocket.on('gemini-error', (error) => {
        console.error('❌ Gemini error:', error)
        if (sessionTimeoutRef.current) {
          clearTimeout(sessionTimeoutRef.current)
          sessionTimeoutRef.current = null
        }
        const errorMessage = error?.message || error?.toString() || 'Unknown error occurred'
        toast.error('AI processing error: ' + errorMessage)
        setIsProcessing(false)
        setSessionStatus('error')
        
        // Try to use existing questions as fallback
        const currentInterview = interviewDataRef.current
        if (currentInterview?.questions?.length > 0) {
          console.log('Error fallback: Using existing questions')
          setGeminiSession('fallback-session')
          setSessionStatus('ready')
          const firstQuestion = currentInterview.questions[0]
          // DON'T set conversationStartedRef here - let startNaturalConversation set it
          if (!conversationStartedRef.current) {
            setTimeout(() => {
              startNaturalConversation(firstQuestion)
            }, 500)
          }
        }
      })
      
      // Phase 1: Real-time conversation event handlers
      newSocket.on('bot-deflection', (data) => {
        console.log('Bot deflection:', data)
        setBotDeflection(data)
        // Speak the deflection message
        if (data.message) {
          speakText(data.message).catch(err => {
            console.error('Error speaking deflection:', err)
          })
        }
        // Clear after 5 seconds
        setTimeout(() => setBotDeflection(null), 5000)
      })
      
      newSocket.on('bot-intervention', (data) => {
        console.log('Bot intervention:', data)
        setBotIntervention(data)
        // Speak the intervention message
        if (data.message) {
          speakText(data.message).catch(err => {
            console.error('Error speaking intervention:', err)
          })
        }
        // Clear after 8 seconds
        setTimeout(() => setBotIntervention(null), 8000)
      })
      
      newSocket.on('bot-acknowledgment', (data) => {
        console.log('Bot acknowledgment:', data)
        setBotAcknowledgment(data)
        
        // Phase 2: For real-time acknowledgments, don't speak them (too interruptive)
        // Only speak if it's a significant acknowledgment (not realtime type)
        if (data.message && data.type !== 'realtime') {
          speakText(data.message).catch(err => {
            console.error('Error speaking acknowledgment:', err)
          })
        }
        
        // Clear after shorter time for real-time (2s) vs regular (3s)
        const clearTime = data.type === 'realtime' ? 2000 : 3000
        setTimeout(() => setBotAcknowledgment(null), clearTime)
      })
      
      newSocket.on('bot-clarification', (data) => {
        console.log('Bot clarification:', data)
        // Speak the clarification
        if (data.message) {
          speakText(data.message).catch(err => {
            console.error('Error speaking clarification:', err)
          })
        }
        toast.success('Clarification provided')
      })
      
      newSocket.on('followup-question-ready', async (data) => {
        console.log('Follow-up question ready:', data)
        const followupQ = data.followupQuestion
        
        // Add to interview questions
        setInterview(prev => {
          const exists = prev?.questions?.find(q => q.id === followupQ.id)
          if (!exists) {
            return {
              ...prev,
              questions: [...(prev?.questions || []), followupQ]
            }
          }
          return prev
        })
        
        // Ask the follow-up question after a brief pause (if candidate is still speaking, wait)
        // For now, we'll ask it after 2 seconds to allow candidate to finish current thought
        setTimeout(async () => {
          // Only ask if we're still on the same question
          if (currentQuestion && currentQuestion.id === data.questionId) {
            setCurrentQuestion(followupQ)
            currentQuestionIdRef.current = followupQ.id
            
            // Reset silence monitoring
            setLastSpeechTime(null)
            
            // Notify server
            if (socket && geminiSession) {
              socket.emit('question-started', {
                sessionId: geminiSession,
                questionId: followupQ.id,
                questionText: followupQ.text
              })
            }
            
            // Speak the follow-up question
            try {
              await speakQuestion(followupQ)
              setCanStartAnswer(true)
            } catch (error) {
              console.error('Error speaking follow-up question:', error)
              setCanStartAnswer(true)
            }
          }
        }, 2000) // Wait 2 seconds before asking follow-up
      })
      
      newSocket.on('next-question-generated', (data) => {
        console.log('Next question generated:', data)
        if (data.question) {
          // Prevent duplicate questions - check if this question already exists
          setInterview(prev => {
            const questionExists = prev?.questions?.some(q => q.id === data.question.id)
            if (questionExists) {
              console.log('Question already exists, skipping:', data.question.id)
              return prev
            }
            return {
              ...prev,
              questions: [...prev.questions, data.question]
            }
          })
          
          // IMPORTANT: Don't jump to next question if candidate is currently speaking
          // Wait until they finish speaking before moving to next question
          const checkAndProceed = () => {
            // Don't proceed if candidate is speaking
            if (candidateSpeaking) {
              console.log('Candidate is speaking, delaying question change')
              setTimeout(checkAndProceed, 1000) // Check again in 1 second
              return
            }
            
            // Only proceed if we're not already on a different question
            // This prevents jumping multiple questions
            const currentQId = currentQuestionIdRef.current
            if (currentQId && currentQId !== data.question.id) {
              // Check if we're already processing a question change
              setTimeout(() => {
                // Double-check we're still not on a different question and candidate isn't speaking
                if ((currentQuestionIdRef.current === currentQId || !currentQuestion) && !candidateSpeaking) {
                  setCurrentQuestion(data.question)
                  currentQuestionIdRef.current = data.question.id
                  speakQuestion(data.question).then(() => {
                    setCanStartAnswer(true)
                  }).catch(err => {
                    console.error('Error speaking next question:', err)
                    setCanStartAnswer(true)
                  })
                } else {
                  console.log('Skipping question - already moved to different question or candidate is speaking')
                }
              }, 1000)
            } else if (!currentQuestion || currentQuestion.id !== data.question.id) {
              // Only set if we don't have a current question or it's different
              setTimeout(() => {
                if (!candidateSpeaking) {
                  setCurrentQuestion(data.question)
                  currentQuestionIdRef.current = data.question.id
                  speakQuestion(data.question).then(() => {
                    setCanStartAnswer(true)
                  }).catch(err => {
                    console.error('Error speaking next question:', err)
                    setCanStartAnswer(true)
                  })
                } else {
                  console.log('Candidate is speaking, delaying question change')
                  setTimeout(checkAndProceed, 1000)
                }
              }, 1000)
            }
          }
          
          checkAndProceed()
        }
      })
      
      newSocket.on('interview-complete', (data) => {
        console.log('Interview complete:', data)
        completeInterview()
      })
      
      // Initialize camera and audio
      await initializeMedia()
      
    } catch (error) {
      console.error('Error initializing session:', error)
      toast.error('Failed to initialize interview session: ' + (error.message || 'Unknown error'))
      setSessionStatus('error')
    }
  }

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      
      streamRef.current = stream
      
      // Set video source when element is available
      // Use a small delay to ensure video element is rendered
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(err => {
            console.error('Error playing video:', err)
          })
        } else {
          // If video element not ready yet, try again
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.srcObject = stream
              videoRef.current.play().catch(err => {
                console.error('Error playing video (retry):', err)
              })
            }
          }, 500)
        }
      }, 100)
      
      // Initialize speech recognition
      initializeSpeechRecognition()
      
      // Initialize audio recording
      initializeAudioRecording(stream)
      
      // Phase 2: Initialize VAD and audio streaming
      initializeVAD(stream)
      
      console.log('Media initialized successfully')
    } catch (error) {
      console.error('Error accessing media:', error)
      toast.error('Camera/microphone access denied. Please allow access.')
      setSessionStatus('error')
    }
  }

  // Phase 2: Initialize Voice Activity Detection (VAD)
  const initializeVAD = (stream) => {
    try {
      // Create AudioContext for VAD
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) {
        console.warn('AudioContext not supported, VAD disabled')
        return
      }

      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      // Get audio track from stream
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        console.warn('No audio tracks available for VAD')
        return
      }

      // Create media stream source
      const source = audioContext.createMediaStreamSource(stream)
      audioStreamRef.current = source

      // Create analyser node for audio analysis
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
      analyserNodeRef.current = analyser

      // Connect source to analyser
      source.connect(analyser)

      // Start VAD monitoring
      startVADMonitoring()

      // Start audio chunk streaming (for bi-directional audio)
      // Will be started when socket is ready (see socket connect handler)
      if (socket && geminiSession) {
        startAudioStreaming(stream)
      }

      console.log('VAD initialized successfully')
    } catch (error) {
      console.error('Error initializing VAD:', error)
      // Don't fail the whole initialization if VAD fails
    }
  }

  // Phase 2: Start VAD monitoring
  const startVADMonitoring = () => {
    if (!analyserNodeRef.current) return

    const analyser = analyserNodeRef.current
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const checkVAD = () => {
      if (!analyserNodeRef.current || !socket || !geminiSession) return

      analyser.getByteFrequencyData(dataArray)

      // Calculate audio energy (RMS)
      let sum = 0
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / bufferLength) / 255 // Normalize to 0-1
      const energy = rms

      // Update audio energy for visualization
      setAudioEnergy(energy)

      // Adaptive threshold (adjusts based on environment)
      const threshold = vadThresholdRef.current
      const isSpeaking = energy > threshold

      // Update state if changed
      if (isSpeaking !== lastVADStateRef.current) {
        lastVADStateRef.current = isSpeaking
        setCandidateSpeaking(isSpeaking)

        if (isSpeaking) {
          // Candidate started speaking
          candidateSpeakingStartTimeRef.current = Date.now()
          silenceDurationRef.current = 0
          
          // Update lastSpeechTime when candidate starts speaking - prevents silence detection
          setLastSpeechTime(Date.now())
          
          // Update conversation state
          setConversationState(prevState => {
            if (prevState === 'listening' || prevState === 'idle') {
              // If bot is speaking, don't interrupt immediately - wait for natural pause
              // This is handled in the turn management logic
              return 'candidate_speaking'
            }
            return prevState
          })

          // Emit VAD event to server
          if (socket && geminiSession) {
            socket.emit('vad-detected', {
              sessionId: geminiSession,
              isSpeaking: true,
              energy: energy,
              timestamp: Date.now()
            })
          }
        } else {
          // Candidate stopped speaking
          const speakingDuration = candidateSpeakingStartTimeRef.current 
            ? Date.now() - candidateSpeakingStartTimeRef.current 
            : 0
          
          // Update conversation state
          setConversationState(prevState => {
            if (prevState === 'candidate_speaking') {
              return 'listening'
            }
            return prevState
          })

          // Emit VAD event to server
          if (socket && geminiSession) {
            socket.emit('vad-detected', {
              sessionId: geminiSession,
              isSpeaking: false,
              energy: energy,
              silenceDuration: silenceDurationRef.current,
              speakingDuration: speakingDuration,
              timestamp: Date.now()
            })
          }

          // Reset speaking start time
          candidateSpeakingStartTimeRef.current = null
        }
      }

      // Update silence duration
      if (!isSpeaking) {
        silenceDurationRef.current += 100 // Add 100ms (check interval)
      } else {
        silenceDurationRef.current = 0
      }

      // Adaptive threshold adjustment (learn from environment)
      if (energy > 0.001) {
        // Gradually adjust threshold based on actual audio levels
        vadThresholdRef.current = vadThresholdRef.current * 0.99 + energy * 0.01
      }
    }

    // Check VAD every 100ms for responsive detection
    vadIntervalRef.current = setInterval(checkVAD, 100)
  }

  // Phase 2: Start audio streaming for bi-directional communication
  const startAudioStreaming = (stream) => {
    // Check if already streaming
    if (audioChunkIntervalRef.current) {
      console.log('Audio streaming already started')
      return
    }

    // Wait for socket and session to be ready
    const checkAndStart = () => {
      if (!socket || !socket.connected || !geminiSession) {
        console.warn('Socket or session not ready for audio streaming, will retry')
        setTimeout(checkAndStart, 1000)
        return
      }

    try {
      // Create AudioContext for streaming
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      }

      const audioContext = audioContextRef.current
      const source = audioContext.createMediaStreamSource(stream)

      // Create script processor for audio chunks (4096 samples = ~250ms at 16kHz)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      
      processor.onaudioprocess = (e) => {
        if (!socket || !socket.connected || !geminiSession) return

        const inputData = e.inputBuffer.getChannelData(0)
        
        // Convert Float32Array to Int16Array for transmission
        const int16Array = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          // Clamp and convert to 16-bit PCM
          const s = Math.max(-1, Math.min(1, inputData[i]))
          int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        // Convert to base64 for transmission
        const base64 = btoa(String.fromCharCode(...new Uint8Array(int16Array.buffer)))

        // Emit audio chunk to server
        socket.emit('audio-chunk', {
          sessionId: geminiSession,
          audioData: base64,
          sampleRate: 16000,
          timestamp: Date.now()
        })
      }

      source.connect(processor)
      processor.connect(audioContext.destination) // Required for script processor to work

      // Mark as started
      audioChunkIntervalRef.current = true // Use as flag

      console.log('Audio streaming started')
    } catch (error) {
      console.error('Error starting audio streaming:', error)
      // Don't fail if audio streaming fails
    }
    }

    // Start the check loop
    checkAndStart()
  }

  // Phase 2: Stop VAD and audio streaming
  const stopVAD = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current)
      vadIntervalRef.current = null
    }

    if (audioChunkIntervalRef.current) {
      clearInterval(audioChunkIntervalRef.current)
      audioChunkIntervalRef.current = null
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(err => {
        console.error('Error closing audio context:', err)
      })
    }

    setCandidateSpeaking(false)
    setConversationState('idle')
  }

  const initializeSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser')
      toast.error('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      // Try Indian English first for better accent recognition, fallback to US English
      // Indian English (en-IN) is better at recognizing Indian accents and technical terms
      recognition.lang = 'en-IN' // Indian English for better accent recognition
      recognition.maxAlternatives = 3 // Increase alternatives for better technical term recognition

      recognition.onstart = () => {
        setIsListening(true)
        console.log('Speech recognition started')
      }

      recognition.onresult = (event) => {
        let currentInterimTranscript = ''

        // Common technical terms that might be misrecognized with Indian accents
        const technicalTerms = [
          'api', 'sql', 'json', 'rest', 'http', 'https', 'dom', 'css', 'html', 
          'javascript', 'typescript', 'react', 'node', 'python', 'java', 'database',
          'algorithm', 'asynchronous', 'callback', 'promise', 'framework', 'library',
          'dependency', 'package', 'module', 'component', 'function', 'variable',
          'array', 'object', 'class', 'interface', 'authentication', 'authorization',
          'encryption', 'token', 'session', 'cookie', 'cache', 'optimization',
          'performance', 'scalability', 'microservices', 'docker', 'kubernetes',
          'git', 'github', 'deployment', 'server', 'client', 'frontend', 'backend'
        ]

        // Helper function to check if a word might be a technical term
        const mightBeTechnicalTerm = (word) => {
          const lowerWord = word.toLowerCase().replace(/[^a-z]/g, '')
          return technicalTerms.some(term => 
            lowerWord.includes(term) || term.includes(lowerWord) ||
            lowerWord.length <= 4 && /^[a-z]+$/i.test(lowerWord) // Short acronyms
          )
        }

        // Process results starting from resultIndex
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          // Use the best alternative (first one) but consider others for technical terms
          let transcript = result[0].transcript.trim()
          
          // If we have multiple alternatives, check if any contain technical terms
          // This helps with technical terms that might be misrecognized
          if (result.length > 1) {
            const words = transcript.split(/\s+/)
            const hasUnclearTechnicalTerm = words.some(word => {
              const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '')
              // Check if word is very short (might be misrecognized acronym) or matches technical term pattern
              return (cleanWord.length <= 3 && /^[a-z]+$/i.test(cleanWord)) || 
                     mightBeTechnicalTerm(cleanWord)
            })
            
            // If we suspect a technical term might be misrecognized, check alternatives
            if (hasUnclearTechnicalTerm || transcript.length < 5) {
              for (let alt = 1; alt < Math.min(result.length, 3); alt++) {
                const altTranscript = result[alt].transcript.trim()
                // Prefer alternative if it's longer or contains more recognizable words
                if (altTranscript.length > transcript.length || 
                    (altTranscript.split(/\s+/).length > words.length && altTranscript.length > 3)) {
                  transcript = altTranscript
                  break
                }
              }
            }
          }
          
          if (!transcript) continue
          
          // Update lastSpeechTime for interim results to prevent silence detection during active speech
          if (!result.isFinal) {
            setLastSpeechTime(Date.now())
          }
          
          if (result.isFinal) {
            // Update lastSpeechTime for final results as well
            setLastSpeechTime(Date.now())
            
            // Check if candidate said they're done with their answer
            const transcriptLower = transcript.toLowerCase().trim()
            const completionPhrases = [
              "i'm done", "i am done", "that's all", "thats all", "that is all",
              "i'm finished", "i am finished", "i finished", "finished",
              "that's it", "thats it", "that is it", "done", "complete",
              "i'm complete", "i am complete", "i complete", "all done",
              "nothing more", "no more", "end of answer", "end of my answer"
            ]
            
            const isAnswerComplete = completionPhrases.some(phrase => 
              transcriptLower.includes(phrase) || 
              transcriptLower.endsWith(phrase) ||
              transcriptLower.startsWith(phrase)
            )
            
            if (isAnswerComplete && currentQuestion && isRecording) {
              console.log('✅ Candidate indicated answer is complete, processing answer...')
              // Stop answering and process the answer
              setTimeout(() => {
                stopAnswering().catch(err => {
                  console.error('Error stopping answer:', err)
                })
              }, 500) // Small delay to ensure final transcript is captured
            }
            
            // Create a unique key for this result
            const resultKey = `final-${i}-${Date.now()}`
            
            // Skip if we've already processed this exact result index
            if (processedResultsRef.current.has(i)) {
              continue
            }
            
            // Convert transcript to words for better duplicate detection
            const transcriptWords = transcript.toLowerCase().split(/\s+/).filter(w => w.length > 0)
            
            // Check if these words are already at the end of our transcript
            // Compare last 3-5 words to detect duplicates
            const overlapCount = Math.min(transcriptWords.length, lastFinalWordsRef.current.length, 5)
            if (overlapCount > 0) {
              const lastWords = lastFinalWordsRef.current.slice(-overlapCount)
              const newWords = transcriptWords.slice(0, overlapCount)
              
              // Check if the new words match the last words exactly
              const isDuplicate = lastWords.length === newWords.length && 
                lastWords.every((word, idx) => word === newWords[idx])
              
              if (isDuplicate && lastFinalWordsRef.current.length > 0) {
                // This is a duplicate, skip it
                processedResultsRef.current.add(i)
                continue
              }
            }
            
            // Add the transcript
            finalTranscriptRef.current += transcript + ' '
            
            // Update last words tracking (keep last 10 words)
            lastFinalWordsRef.current = [...lastFinalWordsRef.current, ...transcriptWords].slice(-10)
            
            // Mark this result index as processed
            processedResultsRef.current.add(i)
            
            // Phase 1: Send transcript chunk to server for real-time processing
            if (socket && geminiSession && currentQuestion) {
              socket.emit('transcript-chunk', {
                sessionId: geminiSession,
                questionId: currentQuestion.id,
                questionText: currentQuestion.text,
                transcriptChunk: transcript.trim(),
                isFinal: true,
                timestamp: Date.now()
              })
              
              // Update last speech time for silence monitoring
              setLastSpeechTime(Date.now())
              
              // Check if this is a response to bot intervention (e.g., "yes", "no", "I'm thinking")
              if (botIntervention || botDeflection) {
                // Send candidate response for intent detection
                socket.emit('candidate-response', {
                  sessionId: geminiSession,
                  questionId: currentQuestion.id,
                  transcript: transcript.trim()
                })
              }
            }
          } else {
            // For interim results, always show the latest one (they're temporary anyway)
            currentInterimTranscript = transcript
            
            // Update lastSpeechTime on interim results too - candidate is actively speaking
            // This prevents silence detection from triggering while they're speaking
            if (socket && geminiSession && currentQuestion) {
              setLastSpeechTime(Date.now())
            }
          }
        }

        // Debounce transcript updates to prevent rapid re-renders
        if (transcriptUpdateTimeoutRef.current) {
          clearTimeout(transcriptUpdateTimeoutRef.current)
        }

        transcriptUpdateTimeoutRef.current = setTimeout(() => {
          // Update transcript: final transcript + current interim
          const displayText = finalTranscriptRef.current.trim() + 
            (currentInterimTranscript ? ' ' + currentInterimTranscript : '')
          setTranscript(displayText)
        }, 100) // Debounce to batch updates
      }

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        // Don't auto-restart - user controls when to start/stop
        if (event.error === 'no-speech' || event.error === 'aborted') {
          // These are expected errors, ignore
          return
        }
        // If language not supported, try fallback to en-US
        if (event.error === 'language-not-supported' && recognition.lang === 'en-IN') {
          console.warn('Indian English not supported, falling back to US English')
          recognition.lang = 'en-US'
          // Don't set isListening to false, let it retry
          return
        }
        setIsListening(false)
      }

      recognition.onend = () => {
        setIsListening(false)
        // Don't auto-restart - user controls when to start/stop via buttons
      }

      recognitionRef.current = recognition
      console.log('Speech recognition initialized')
    } catch (error) {
      console.error('Error initializing speech recognition:', error)
      toast.error('Failed to initialize speech recognition')
    }
  }

  const initializeAudioRecording = (stream) => {
    try {
      const audioTracks = stream.getAudioTracks()
      const videoTracks = stream.getVideoTracks()
      
      if (audioTracks.length === 0) {
        console.warn('No audio tracks available')
        toast.error('No audio input detected. Please check your microphone.')
        return
      }

      if (videoTracks.length === 0) {
        console.warn('No video tracks available')
        toast.error('No video input detected. Please check your camera.')
        return
      }

      // Try different mime types in order of preference for video+audio
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
        '' // Let browser choose default
      ]

      let mediaRecorder = null
      let selectedMimeType = null

      for (const mimeType of mimeTypes) {
        try {
          if (!mimeType || MediaRecorder.isTypeSupported(mimeType)) {
            const options = mimeType ? { mimeType } : {}
            mediaRecorder = new MediaRecorder(stream, options)
            selectedMimeType = mimeType || mediaRecorder.mimeType
            console.log('MediaRecorder initialized with mimeType:', selectedMimeType)
            break
          }
        } catch (e) {
          console.warn(`Failed to create MediaRecorder with ${mimeType}:`, e)
          continue
        }
      }

      if (!mediaRecorder) {
        throw new Error('Failed to create MediaRecorder with any supported mime type')
      }

      const chunks = []
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data)
          console.log('Video chunk received:', event.data.size, 'bytes')
        }
      }

      mediaRecorder.onstop = () => {
        if (chunks.length > 0) {
          const videoBlob = new Blob(chunks, { type: selectedMimeType || 'video/webm' })
          setVideoChunks([videoBlob])
          console.log('Video recording stopped. Total size:', videoBlob.size, 'bytes')
        } else {
          console.warn('No video chunks recorded')
          setVideoChunks([])
        }
        chunks.length = 0
      }

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event.error)
        toast.error('Video recording error: ' + (event.error?.message || 'Unknown error'))
      }

      // Store in both ref and state
      mediaRecorderRef.current = mediaRecorder
      setMediaRecorder(mediaRecorder)
      console.log('Video+Audio recording initialized successfully')
      
      // Also create a full session recorder for continuous recording
      try {
        const fullSessionRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType || undefined })
        fullSessionChunksRef.current = []
        
        fullSessionRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            fullSessionChunksRef.current.push(event.data)
          }
        }
        
        fullSessionRecorder.onstop = () => {
          console.log('Full session recording stopped. Total chunks:', fullSessionChunksRef.current.length)
        }
        
        fullSessionRecorder.onerror = (event) => {
          console.error('Full session MediaRecorder error:', event.error)
        }
        
        fullSessionRecorderRef.current = fullSessionRecorder
        console.log('Full session recorder initialized successfully')
      } catch (fullSessionError) {
        console.warn('Failed to initialize full session recorder:', fullSessionError)
        // Don't fail the whole initialization if full session recorder fails
      }
    } catch (error) {
      console.error('Error initializing video recording:', error)
      toast.error('Failed to initialize video recording: ' + error.message)
    }
  }

  const startNaturalConversation = async (firstQuestion) => {
    // Prevent multiple starts - check ref first
    if (conversationStartedRef.current) {
      console.log('Conversation already started, skipping duplicate')
      return
    }
    
    conversationStartedRef.current = true
    setSessionStatus('in_progress')
    const startTime = new Date().toISOString()
    setInterviewStartTime(startTime)
    sessionStartTimeRef.current = Date.now() // Store timestamp for relative calculations
    
    // Start full session recording immediately
    if (fullSessionRecorderRef.current && fullSessionRecorderRef.current.state === 'inactive') {
      fullSessionChunksRef.current = []
      fullSessionRecorderRef.current.start(1000) // Request data every second
      setIsFullSessionRecording(true)
      console.log('Full session recording started')
    }
    
    // Reset answer button state
    setCanStartAnswer(false)
    
    // Greet the candidate
    const greeting = `Hello! Welcome to your interview for ${interview?.title || 'this position'}. I'm your AI interviewer, and I'll be asking you some questions today. Let's begin!`
    setBotGreeting(greeting)
    
    // Wait a moment to ensure everything is ready, then speak greeting
    await new Promise(resolve => setTimeout(resolve, 500))
    await speakText(greeting)
    
    // Wait a moment after greeting, then ask first question
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Clear greeting and set question
    setBotGreeting('')
    setCurrentQuestion(firstQuestion)
    currentQuestionIdRef.current = firstQuestion.id // Store question ID in ref
    
    // Speak the question and ONLY enable answer button after speech completes
    try {
      console.log('Starting to speak question:', firstQuestion.text?.substring(0, 50))
      await speakQuestion(firstQuestion)
      console.log('Question spoken successfully, enabling answer button')
      setCanStartAnswer(true)
    } catch (error) {
      console.error('Error speaking question:', error)
      // Fallback: Enable after 3 seconds if speech fails
      setTimeout(() => {
        console.log('Fallback: Enabling answer button after speech error')
        setCanStartAnswer(true)
      }, 3000)
    }
  }

  const speakText = (text) => {
    return new Promise((resolve, reject) => {
      // Check if speech synthesis is available
      if (!('speechSynthesis' in window)) {
        console.warn('Speech synthesis not supported in this browser')
        setIsSpeaking(false)
        speakingRef.current = false
        reject(new Error('Speech synthesis not supported'))
        return
      }

      // If already speaking the same text, don't restart
      if (speakingRef.current && currentUtteranceRef.current?.text === text) {
        console.log('Already speaking this text, skipping duplicate')
        resolve()
        return
      }

      // Cancel any ongoing speech to prevent overlap
      if (speakingRef.current) {
        window.speechSynthesis.cancel()
        // Wait for cancellation to complete before starting new speech
        setTimeout(() => {
          startSpeaking(text, resolve, reject)
        }, 300)
      } else {
        // Start speaking immediately
        startSpeaking(text, resolve, reject)
      }
    })
  }

  const startSpeaking = (text, resolve, reject) => {
    try {
      // Stop speech recognition while speaking
      if (recognitionRef.current && isListening) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          console.error('Error stopping recognition:', e)
        }
      }
      
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1
      utterance.volume = 1
      utterance.lang = 'en-US'
      
      // Store reference to current utterance
      currentUtteranceRef.current = utterance
      speakingRef.current = true
      setIsSpeaking(true)
      setConversationState('bot_speaking') // Phase 2: Update conversation state
      
      let resolved = false
      let speechStarted = false
      
      // Set a timeout fallback in case speech doesn't start
      const startTimeout = setTimeout(() => {
        if (!speechStarted) {
          console.warn('Speech did not start within 2 seconds')
          setIsSpeaking(false)
          speakingRef.current = false
          currentUtteranceRef.current = null
          if (!resolved) {
            resolved = true
            reject(new Error('Speech synthesis did not start'))
          }
        }
      }, 2000)
      
      // Set a timeout fallback in case speech doesn't end properly
      const endTimeout = setTimeout(() => {
        console.warn('Speech timeout - resolving anyway after 30 seconds')
        setIsSpeaking(false)
        speakingRef.current = false
        currentUtteranceRef.current = null
        if (!resolved) {
          resolved = true
          resolve()
        }
      }, 30000) // 30 second max
      
      utterance.onstart = () => {
        console.log('Speech started:', text.substring(0, 50))
        speechStarted = true
        clearTimeout(startTimeout)
      }
      
      utterance.onend = () => {
        console.log('Speech ended successfully')
        clearTimeout(startTimeout)
        clearTimeout(endTimeout)
        setIsSpeaking(false)
        speakingRef.current = false
        currentUtteranceRef.current = null
        setConversationState('listening') // Phase 2: Bot finished speaking, now listening
        if (!resolved) {
          resolved = true
          resolve()
        }
      }
      
      utterance.onerror = (error) => {
        clearTimeout(startTimeout)
        clearTimeout(endTimeout)
        // Don't log expected errors (interrupted, canceled, etc.)
        if (error.error !== 'interrupted' && error.error !== 'canceled') {
          console.error('Speech synthesis error:', error.error)
          toast.error('Speech error: ' + error.error)
        }
        setIsSpeaking(false)
        speakingRef.current = false
        currentUtteranceRef.current = null
        if (!resolved) {
          resolved = true
          // Reject on actual errors, resolve on expected ones
          if (error.error === 'interrupted' || error.error === 'canceled') {
            resolve()
          } else {
            reject(new Error('Speech synthesis error: ' + error.error))
          }
        }
      }
      
      // Try to speak, with error handling
      try {
        window.speechSynthesis.speak(utterance)
        console.log('speak() called for:', text.substring(0, 50))
      } catch (speakError) {
        clearTimeout(startTimeout)
        clearTimeout(endTimeout)
        console.error('Error calling speechSynthesis.speak():', speakError)
        setIsSpeaking(false)
        speakingRef.current = false
        currentUtteranceRef.current = null
        if (!resolved) {
          resolved = true
          reject(speakError)
        }
      }
    } catch (error) {
      console.error('Error creating speech utterance:', error)
      setIsSpeaking(false)
      speakingRef.current = false
      currentUtteranceRef.current = null
      reject(error)
    }
  }

  const speakQuestion = async (question) => {
    if (!question) {
      console.warn('speakQuestion called with no question')
      throw new Error('No question provided')
    }
    
    const questionText = question.text || question
    if (!questionText) {
      console.warn('Question has no text:', question)
      throw new Error('Question has no text')
    }
    
    // Track when question starts being spoken (for cheating detection)
    const questionId = question.id
    currentQuestionStartTimeRef.current = Date.now()
    currentQuestionEndTimeRef.current = null
    currentAnswerStartTimeRef.current = null
    currentAnswerEndTimeRef.current = null
    
    // Initialize timestamps for this question
    if (!questionTimestampsRef.current[questionId]) {
      questionTimestampsRef.current[questionId] = {}
    }
    questionTimestampsRef.current[questionId].questionStartTime = currentQuestionStartTimeRef.current
    
    // Start question-specific recording when question begins (not when candidate clicks button)
    const recorder = mediaRecorderRef.current || mediaRecorder
    if (recorder && recorder.state === 'inactive') {
      setVideoChunks([])
      recorder.start(100) // Request data every 100ms for responsive recording
      setIsRecording(true)
      console.log('Question recording started (when question began speaking)')
    }
    
    console.log('Speaking question:', questionText.substring(0, 50))
    // Speak the question text - this will throw if speech fails
    await speakText(questionText)
    
    // Track when question finishes being spoken
    currentQuestionEndTimeRef.current = Date.now()
    if (questionTimestampsRef.current[questionId]) {
      questionTimestampsRef.current[questionId].questionEndTime = currentQuestionEndTimeRef.current
    }
    console.log('Question finished speaking at:', currentQuestionEndTimeRef.current)
    
    // Phase 1: Initialize silence monitoring - set lastSpeechTime to question end
    // This starts the silence timer from when question finishes
    setLastSpeechTime(currentQuestionEndTimeRef.current)
    
    // Notify server that question has finished (for conversation state tracking)
    if (socket && geminiSession) {
      socket.emit('question-started', {
        sessionId: geminiSession,
        questionId: questionId,
        questionText: questionText
      })
    }
    
    // Automatically start speech recognition and answer tracking after question finishes
    // This allows the system to detect when candidate starts speaking
    try {
      // Reset transcript tracking for new answer
      setTranscript('')
      finalTranscriptRef.current = ''
      processedResultsRef.current.clear()
      lastFinalWordsRef.current = []
      
      // Clear captured frames for new answer
      setCapturedFrames([])
      
      // Clear any pending transcript updates
      if (transcriptUpdateTimeoutRef.current) {
        clearTimeout(transcriptUpdateTimeoutRef.current)
        transcriptUpdateTimeoutRef.current = null
      }
      
      // Start speech recognition automatically
      if (recognitionRef.current) {
        try {
          if (recognitionRef.current.state && recognitionRef.current.state !== 'running') {
            recognitionRef.current.start()
            console.log('Speech recognition started automatically after question')
          } else if (!recognitionRef.current.state) {
            // If state property doesn't exist, just try to start
            recognitionRef.current.start()
            console.log('Speech recognition started automatically after question')
          }
        } catch (startError) {
          // If already started, that's fine
          if (startError.message?.includes('already started') || startError.message?.includes('start')) {
            console.log('Speech recognition already running')
          } else {
            console.error('Error starting speech recognition automatically:', startError)
          }
        }
      }
      
      // Track when candidate can start answering (now - automatically)
      currentAnswerStartTimeRef.current = Date.now()
      if (questionId && questionTimestampsRef.current[questionId]) {
        questionTimestampsRef.current[questionId].answerStartTime = currentAnswerStartTimeRef.current
      }
      console.log('Answer start time tracked automatically:', currentAnswerStartTimeRef.current)
      
      // Set answering flag so system knows candidate is answering
      isAnsweringRef.current = true
      
      // Start frame capture for cheating detection
      startFrameCapture()
    } catch (error) {
      console.error('Error auto-starting answer tracking:', error)
      // Don't throw - this is not critical, just log it
    }
  }

  const startAnswering = () => {
    if (!recognitionRef.current) {
      console.warn('Speech recognition not initialized')
      toast.error('Speech recognition not available')
      return
    }
    
    // Use ref for immediate access (state might not be updated yet)
    const recorder = mediaRecorderRef.current || mediaRecorder
    if (!recorder) {
      console.warn('Media recorder not initialized')
      toast.error('Video recording not available. Please refresh the page.')
      return
    }
    
    try {
      // Reset transcript tracking for new answer
      setTranscript('')
      finalTranscriptRef.current = ''
      processedResultsRef.current.clear()
      lastFinalWordsRef.current = []
      
      // Clear captured frames for new answer
      setCapturedFrames([])
      
      // Clear any pending transcript updates
      if (transcriptUpdateTimeoutRef.current) {
        clearTimeout(transcriptUpdateTimeoutRef.current)
        transcriptUpdateTimeoutRef.current = null
      }
      
      // Start speech recognition
      try {
        if (recognitionRef.current.state && recognitionRef.current.state !== 'running') {
          recognitionRef.current.start()
          console.log('Speech recognition started')
        } else if (!recognitionRef.current.state) {
          // If state property doesn't exist, just try to start
          recognitionRef.current.start()
          console.log('Speech recognition started')
        }
      } catch (startError) {
        // If already started, that's fine
        if (startError.message?.includes('already started') || startError.message?.includes('start')) {
          console.log('Speech recognition already running')
        } else {
          throw startError
        }
      }
      
      // Track when candidate clicks "Start Answer" (recording should already be running from question start)
      const questionId = currentQuestionIdRef.current
      currentAnswerStartTimeRef.current = Date.now()
      if (questionId && questionTimestampsRef.current[questionId]) {
        questionTimestampsRef.current[questionId].answerStartTime = currentAnswerStartTimeRef.current
      }
      console.log('Answer start time tracked:', currentAnswerStartTimeRef.current)
      
      // Recording should already be running (started when question began)
      // But if it's not, start it now as fallback
      if (recorder.state === 'inactive') {
        setVideoChunks([])
        recorder.start(100) // Request data every 100ms for more responsive recording
        setIsRecording(true)
        console.log('Video recording started (fallback - should have started earlier)', recorder.state)
      } else if (recorder.state === 'recording') {
        console.log('Video recording already in progress (as expected)')
      } else {
        console.warn('MediaRecorder in unexpected state:', recorder.state)
      }
      
      isAnsweringRef.current = true
      setCanStartAnswer(false) // Hide Start Answer button
      
      // Start frame capture for cheating detection
      startFrameCapture()
    } catch (error) {
      console.error('Error starting answering:', error)
      // If recognition is already running, that's okay
      if (!error.message?.includes('already started') && !error.message?.includes('start')) {
        toast.error('Failed to start recording: ' + error.message)
      }
    }
  }

  const stopAnswering = async () => {
    if (!currentQuestion || !isRecording) return
    
    // Track when answer ends
    const questionId = currentQuestionIdRef.current
    currentAnswerEndTimeRef.current = Date.now()
    if (questionId && questionTimestampsRef.current[questionId]) {
      questionTimestampsRef.current[questionId].answerEndTime = currentAnswerEndTimeRef.current
    }
    console.log('Answer end time tracked:', currentAnswerEndTimeRef.current)
    
    isAnsweringRef.current = false
    
    // Stop speech recognition first
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        console.error('Error stopping recognition:', e)
      }
    }
    
    // Wait a moment for final transcript to be processed
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Stop question-specific recording (use ref for immediate access)
    const recorder = mediaRecorderRef.current || mediaRecorder
    if (recorder && recorder.state === 'recording') {
      recorder.stop()
      setIsRecording(false)
      console.log('Stopping question-specific video recording')
      
      // Wait for mediaRecorder to finish processing
      await new Promise(resolve => {
        if (recorder.state !== 'inactive') {
          const checkInterval = setInterval(() => {
            if (recorder.state === 'inactive') {
              clearInterval(checkInterval)
              console.log('Video recording stopped completely')
              resolve()
            }
          }, 100)
          setTimeout(() => {
            clearInterval(checkInterval)
            console.log('Video recording stop timeout')
            resolve()
          }, 2000)
        } else {
          resolve()
        }
      })
    } else if (recorder) {
      console.log('MediaRecorder not recording, state:', recorder.state)
    }
    
    // Stop frame capture
    stopFrameCapture()
    
    // Store the current question data in refs before clearing state
    // This ensures processAnswer can access them even after state is cleared
    const answeredQuestionId = currentQuestion.id
    const answeredQuestionText = currentQuestion.text
    currentQuestionIdRef.current = answeredQuestionId // Store in ref for processAnswer
    
    // IMPORTANT: Save transcript BEFORE clearing it, so processAnswer can use it
    const savedTranscript = finalTranscriptRef.current.trim() || transcript.trim()
    
    // Immediately clear transcript and prepare for next interaction
    setTranscript('')
    finalTranscriptRef.current = ''
    processedResultsRef.current.clear()
    lastFinalWordsRef.current = []
    if (transcriptUpdateTimeoutRef.current) {
      clearTimeout(transcriptUpdateTimeoutRef.current)
      transcriptUpdateTimeoutRef.current = null
    }
    
    // Show "preparing next question" state - don't re-enable button yet
    // This gives visual feedback that we're moving forward
    setCanStartAnswer(false)
    setCurrentQuestion(null) // Clear current question to show "preparing" state
    
    // Process the answer in background - don't await, let it run asynchronously
    // This allows the UI to continue naturally while processing happens
    // Pass question text and saved transcript via closure
    processAnswer(answeredQuestionText, savedTranscript).catch(error => {
      console.error('Error processing answer in background:', error)
      toast.error('Failed to process answer: ' + (error.message || 'Unknown error'))
      // Re-enable button on error so user can retry
      setCanStartAnswer(true)
    })
  }

  const processAnswer = async (questionTextOverride = null, savedTranscriptOverride = null) => {
    // Get questionId from ref (we may have cleared currentQuestion state)
    // This is set before we clear the question in stopAnswering
    const questionId = currentQuestionIdRef.current
    // Use override if provided, otherwise try to get from currentQuestion, otherwise empty
    const questionText = questionTextOverride || currentQuestion?.text || ''
    
    if (!questionId) {
      console.warn('No question ID available for processing')
      return
    }

    // If no video recorded but we have transcript, still process
    // Use saved transcript if provided (from stopAnswering), otherwise try ref/state
    const currentTranscript = savedTranscriptOverride || finalTranscriptRef.current.trim() || transcript.trim()
    if (videoChunks.length === 0 && !currentTranscript) {
      console.warn('No response recorded')
      toast.error('No response recorded')
      return
    }

    // Set a subtle background processing indicator (non-blocking)
    // This won't block the UI, just shows a small indicator
    setIsProcessing(true)

    try {
      let videoBase64 = null
      let videoBlob = null

      // Convert video blob to base64 if available
      if (videoChunks.length > 0) {
        videoBlob = videoChunks[0]
        videoBase64 = await blobToBase64(videoBlob)
      }

      // Use all captured frames for comprehensive cheating detection
      // Note: Browser transcript is NOT sent to Gemini - we rely on Gemini's own transcription
      // from the video/audio for accurate technical word recognition
      const framesToSend = capturedFrames.length > 0 ? capturedFrames : []
      
      // Limit to max 10 frames to avoid token limits (take evenly distributed frames)
      const maxFrames = 10
      let selectedFrames = framesToSend
      if (framesToSend.length > maxFrames) {
        // Select evenly distributed frames
        const step = Math.floor(framesToSend.length / maxFrames)
        selectedFrames = []
        for (let i = 0; i < framesToSend.length; i += step) {
          selectedFrames.push(framesToSend[i])
          if (selectedFrames.length >= maxFrames) break
        }
        // Always include the last frame
        if (selectedFrames[selectedFrames.length - 1] !== framesToSend[framesToSend.length - 1]) {
          selectedFrames[selectedFrames.length - 1] = framesToSend[framesToSend.length - 1]
        }
      }

      // Get timestamps for this question (for cheating detection analysis)
      const timestamps = questionTimestampsRef.current[questionId] || {}
      
      // Send to Gemini for processing
      if (socket && geminiSession) {
        socket.emit('gemini-audio', {
          sessionId: geminiSession,
          videoData: videoBase64, // Send full video (contains both video and audio tracks)
          questionId: questionId,
          questionText: questionText,
          imageFrames: selectedFrames, // Multiple frames for comprehensive cheating detection
          timestamps: {
            questionStartTime: timestamps.questionStartTime,
            questionEndTime: timestamps.questionEndTime,
            answerStartTime: timestamps.answerStartTime,
            answerEndTime: timestamps.answerEndTime,
            sessionStartTime: sessionStartTimeRef.current
          },
          // Note: transcript is NOT sent - Gemini will transcribe from video/audio for accuracy
          // The video includes the gap period (question end to answer start) for cheating detection
        })

        // Wait for Gemini response asynchronously
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.off('gemini-response', handleResponse)
            socket.off('gemini-error', handleError)
            setIsProcessing(false)
            reject(new Error('Gemini processing timeout'))
          }, 30000)

          const handleResponse = async (response) => {
            clearTimeout(timeout)
            socket.off('gemini-response', handleResponse)
            socket.off('gemini-error', handleError)

            try {
              // Use transcript from response if available, otherwise use current transcript
              const finalTranscript = response.transcript || currentTranscript
              
              // Get questionId from ref (it might have been cleared from currentQuestion state)
              // Use the questionId from the response if available, otherwise use stored one
              const questionIdToUse = response.question_id || currentQuestionIdRef.current || questionId
              
              if (!questionIdToUse) {
                console.error('Question ID is missing. Response:', response)
                throw new Error('Question ID is missing. Cannot submit answer.')
              }
              
              // Upload video if available and submit answer in background
              // Don't await - let it happen asynchronously
              if (videoBlob) {
                submitAnswerWithVideo(videoBlob, response, finalTranscript, questionIdToUse, questionText)
                  .catch(error => {
                    console.error('Error submitting answer with video:', error)
                    // Don't show toast for 403 - might be a race condition, just log it
                    if (error.response?.status === 403) {
                      console.warn('403 error submitting answer - this may be due to timing. Answer may have already been submitted.')
                    } else {
                      toast.error('Failed to submit answer: ' + (error.message || 'Unknown error'))
                    }
                  })
              } else {
                // Submit without video (just transcript)
                submitAnswerWithoutVideo(response, finalTranscript, questionIdToUse, questionText)
                  .catch(error => {
                    console.error('Error submitting answer without video:', error)
                    // Don't show toast for 403 - might be a race condition, just log it
                    if (error.response?.status === 403) {
                      console.warn('403 error submitting answer - this may be due to timing. Answer may have already been submitted.')
                    } else {
                      toast.error('Failed to submit answer: ' + (error.message || 'Unknown error'))
                    }
                  })
              }
              
              // Handle Gemini response to update UI (next question, follow-up, etc.)
              // This will move to the next question immediately
              handleGeminiResponse(response)
              
              setIsProcessing(false)
              resolve()
            } catch (submitError) {
              console.error('Error in response handler:', submitError)
              setIsProcessing(false)
              // Show user-friendly error message
              if (submitError.response?.status === 403) {
                toast.error('Access denied. Please refresh the page and try again.')
              } else {
                toast.error('Failed to process response: ' + (submitError.message || 'Unknown error'))
              }
              reject(submitError)
            }
          }

          const handleError = (error) => {
            clearTimeout(timeout)
            socket.off('gemini-response', handleResponse)
            socket.off('gemini-error', handleError)
            setIsProcessing(false)
            toast.error('Processing error: ' + (error.message || 'Unknown error'))
            reject(new Error(error.message))
          }

          socket.on('gemini-response', handleResponse)
          socket.on('gemini-error', handleError)
        })
      } else {
        setIsProcessing(false)
      }
    } catch (error) {
      console.error('Error processing answer:', error)
      toast.error('Failed to process answer: ' + error.message)
      setIsProcessing(false)
    }
  }

  const submitAnswerWithVideo = async (videoBlob, geminiResponse, finalTranscript, questionId, questionText) => {
    // Use provided questionId or fallback to currentQuestion
    const questionIdToUse = questionId || currentQuestion?.id || currentQuestionIdRef.current
    const questionTextToUse = questionText || currentQuestion?.text || ''
    
    if (!questionIdToUse) {
      throw new Error('Question ID is required to submit answer')
    }
    
    // Upload video with retry mechanism
    let videoUrl = ''
    const maxRetries = 3
    let retryCount = 0
    let uploadSuccess = false
    
    // Use candidate-specific interview ID, not template ID
    const interviewIdToUse = candidateInterviewIdRef.current || id
    
    while (retryCount < maxRetries && !uploadSuccess) {
      try {
        console.log(`Uploading video (attempt ${retryCount + 1}/${maxRetries})...`)
        const response = await uploadAPI.uploadVideo(interviewIdToUse, questionIdToUse, videoBlob)
        videoUrl = response.data.fileUrl
        uploadSuccess = true
        console.log('✅ Video uploaded successfully:', videoUrl)
      } catch (uploadError) {
        retryCount++
        console.error(`Video upload attempt ${retryCount} failed:`, uploadError)
        
        if (retryCount >= maxRetries) {
          console.error('❌ Video upload failed after all retries. Proceeding without video URL.')
          toast.error('Video upload failed after multiple attempts. Answer will be saved without video.')
          // Continue without video - don't block answer submission
        } else {
          // Wait before retrying (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000)
          console.log(`Retrying video upload in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    // Submit answer with Gemini response - always submit even if video upload failed
    // Use candidate-specific interview ID, not template ID
    try {
      await interviewAPI.submitAnswer(interviewIdToUse, questionIdToUse, {
        videoUrl: videoUrl, // Will be empty string if upload failed
        transcript: finalTranscript || geminiResponse.transcript || '',
        geminiResponse: {
          ...geminiResponse,
          questionText: questionTextToUse
        }
      })
      console.log('✅ Answer submitted successfully')
    } catch (submitError) {
      console.error('Error submitting answer:', submitError)
      throw submitError
    }
  }

  const submitAnswerWithoutVideo = async (geminiResponse, finalTranscript, questionId, questionText) => {
    try {
      // Use provided questionId or fallback to currentQuestion
      const questionIdToUse = questionId || currentQuestion?.id || currentQuestionIdRef.current
      const questionTextToUse = questionText || currentQuestion?.text || ''
      
      if (!questionIdToUse) {
        throw new Error('Question ID is required to submit answer')
      }
      
      // Submit answer without video (transcript only) - happens in background
      // Use candidate-specific interview ID, not template ID
      const interviewIdToUse = candidateInterviewIdRef.current || id
      await interviewAPI.submitAnswer(interviewIdToUse, questionIdToUse, {
        videoUrl: '', // No video URL
        transcript: finalTranscript || geminiResponse.transcript || '',
        geminiResponse: {
          ...geminiResponse,
          questionText: questionTextToUse
        }
      })
    } catch (error) {
      console.error('Error submitting answer:', error)
      throw error
    }
  }

  const handleGeminiResponse = async (response) => {
    console.log('Gemini response:', response)
    
    // Process immediately - we've already stopped recording and cleared the question
    // The UI is waiting for the next question
    processGeminiResponse(response)
  }
  
  const processGeminiResponse = async (response) => {
    // Disable answer button while processing next question
    setCanStartAnswer(false)
    
    if (response.next_action === 'end_interview') {
      completeInterview()
    } else if (response.next_action === 'ask_followup') {
      // Ask follow-up question
      // Check if currentQuestion exists, if not try to get it from interview state
      const question = currentQuestion || interview?.questions?.[interview.questions.length - 1]
      
      if (!question) {
        console.error('Cannot create follow-up question: currentQuestion is null')
        toast.error('Error: Unable to process follow-up question. Please try again.')
        setCanStartAnswer(true) // Re-enable button so user can continue
        return
      }
      
      const followUpQuestion = {
        id: question.id + '_followup_' + Date.now(),
        text: response.next_text || question.text,
        type: 'followup',
        order: question.order,
        parentQuestionId: question.id
      }
      
      // Add to interview questions if not already there
      setInterview(prev => {
        const exists = prev?.questions?.find(q => q.id === followUpQuestion.id)
        if (!exists) {
          return {
            ...prev,
            questions: [...(prev?.questions || []), followUpQuestion]
          }
        }
        return prev
      })
      
      setCurrentQuestion(followUpQuestion)
      currentQuestionIdRef.current = followUpQuestion.id // Update ref with follow-up question ID
      
      // Reset silence monitoring for new question
      setLastSpeechTime(null)
      
      // Notify server
      if (socket && geminiSession) {
        socket.emit('question-started', {
          sessionId: geminiSession,
          questionId: followUpQuestion.id,
          questionText: followUpQuestion.text
        })
      }
      
      // Wait a moment, then speak the follow-up question
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      try {
        await speakQuestion(followUpQuestion)
        console.log('Follow-up question spoken, enabling answer button')
        setCanStartAnswer(true)
      } catch (error) {
        console.error('Error speaking follow-up question:', error)
        // Fallback: Enable after 3 seconds if speech fails
        setTimeout(() => {
          console.log('Fallback: Enabling answer button after speech error')
          setCanStartAnswer(true)
        }, 3000)
      }
    } else if (response.next_action === 'next_question') {
      // Move to next question
      if (response.nextQuestion) {
        const newQuestion = response.nextQuestion
        setInterview(prev => ({
          ...prev,
          questions: [...prev.questions, newQuestion]
        }))
        
        // Wait a moment, then ask next question
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        setCurrentQuestion(newQuestion)
        currentQuestionIdRef.current = newQuestion.id // Update ref with new question ID
        
        // Reset silence monitoring for new question
        setLastSpeechTime(null)
        
        // Notify server
        if (socket && geminiSession) {
          socket.emit('question-started', {
            sessionId: geminiSession,
            questionId: newQuestion.id,
            questionText: newQuestion.text
          })
        }
        
        try {
          await speakQuestion(newQuestion)
          console.log('Next question spoken, enabling answer button')
          setCanStartAnswer(true)
        } catch (error) {
          console.error('Error speaking next question:', error)
          // Fallback: Enable after 3 seconds if speech fails
          setTimeout(() => {
            console.log('Fallback: Enabling answer button after speech error')
            setCanStartAnswer(true)
          }, 3000)
        }
      } else {
        // No more questions
        completeInterview()
      }
    }
  }

  const startFrameCapture = () => {
    // Clear any previous frames
    setCapturedFrames([])
    
    // Capture frame immediately at start
    captureFrame().then(frame => {
      if (frame) {
        setCapturedFrames(prev => [...prev, frame])
      }
    })
    
    // Then capture frames every 3 seconds during recording for better cheating detection
    intervalRef.current = setInterval(() => {
      captureFrame().then(frame => {
        if (frame) {
          setCapturedFrames(prev => [...prev, frame])
        }
      })
    }, 3000) // Capture every 3 seconds for more comprehensive analysis
  }

  const stopFrameCapture = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    
    // Capture one final frame at the end
    captureFrame().then(frame => {
      if (frame) {
        setCapturedFrames(prev => [...prev, frame])
      }
    })
  }

  const captureFrame = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const video = videoRef.current
      const ctx = canvas.getContext('2d')
      
      canvas.width = 160
      canvas.height = 120
      ctx.drawImage(video, 0, 0, 160, 120)
      
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            const reader = new FileReader()
            reader.onload = () => {
              const base64 = reader.result.split(',')[1]
              resolve(base64)
            }
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          } else {
            resolve(null)
          }
        }, 'image/jpeg', 0.7)
      })
    }
    return null
  }

  const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  const handleEndInterview = () => {
    if (sessionStatus !== 'in_progress') {
      completeInterview()
      return
    }

    // Check if interview has been going for less than 1 minute
    if (interviewStartTime) {
      const elapsed = (Date.now() - new Date(interviewStartTime).getTime()) / 1000
      if (elapsed < 60) {
        setShowEndConfirm(true)
        return
      }
    }

    // Otherwise ask for confirmation
    setShowEndConfirm(true)
  }

  const confirmEndInterview = async () => {
    setShowEndConfirm(false)
    
    // Stop all ongoing processes
    if (isRecording && mediaRecorder) {
      mediaRecorder.stop()
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    window.speechSynthesis.cancel()
    
    // Complete interview
    await completeInterview()
  }

  const completeInterview = async () => {
    try {
      console.log('🔄 Starting interview completion process...')
      
      // First, process any pending answer if candidate is currently answering
      if (currentQuestion && isRecording && isAnsweringRef.current) {
        console.log('📝 Processing pending answer before completion...')
        try {
          // Stop the current answer recording
          await stopAnswering()
          // Wait a bit for answer processing to complete
          await new Promise(resolve => setTimeout(resolve, 2000))
        } catch (answerError) {
          console.error('Error processing pending answer:', answerError)
          // Continue with completion even if answer processing fails
        }
      }
      
      // Stop all ongoing processes
      if (isRecording && mediaRecorderRef.current) {
        try {
          mediaRecorderRef.current.stop()
          setIsRecording(false)
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (e) {
          console.error('Error stopping recording:', e)
        }
      }
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (e) {
          console.error('Error stopping recognition:', e)
        }
      }
      
      // Stop full session recording if it's running
      if (fullSessionRecorderRef.current && fullSessionRecorderRef.current.state === 'recording') {
        fullSessionRecorderRef.current.stop()
        setIsFullSessionRecording(false)
        console.log('Full session recording stopped')
        
        // Wait for recorder to finish processing
        await new Promise(resolve => {
          if (fullSessionRecorderRef.current.state !== 'inactive') {
            const checkInterval = setInterval(() => {
              if (fullSessionRecorderRef.current.state === 'inactive') {
                clearInterval(checkInterval)
                resolve()
              }
            }, 100)
            setTimeout(() => {
              clearInterval(checkInterval)
              resolve()
            }, 3000)
          } else {
            resolve()
          }
        })
        
        // Create blob from full session chunks and upload
        if (fullSessionChunksRef.current.length > 0) {
          const fullSessionBlob = new Blob(fullSessionChunksRef.current, { type: 'video/webm' })
          console.log('📹 Uploading full session video, size:', fullSessionBlob.size)
          
          try {
            // Upload full session video (use a placeholder questionId since it's not question-specific)
            // Use candidate-specific interview ID, not template ID
            const interviewIdToUse = candidateInterviewIdRef.current || id
            const uploadResponse = await uploadAPI.uploadVideo(interviewIdToUse, 'full-session', fullSessionBlob, true)
            const fullSessionVideoUrl = uploadResponse.data.fileUrl
            console.log('✅ Full session video uploaded:', fullSessionVideoUrl)
            
            // Pass full session video URL to completeInterview
            await interviewAPI.completeInterview(interviewIdToUse, fullSessionVideoUrl)
            setSessionStatus('completed')
            toast.success('Interview completed successfully!')
            
            setTimeout(() => {
              navigate('/')
            }, 3000)
            return // Exit early since we already completed the interview
          } catch (uploadError) {
            console.error('Error uploading full session video:', uploadError)
            // Don't fail the interview completion if full session upload fails
            toast.error('Failed to upload full session video, but interview will be completed')
          }
        }
      }
      
      // Complete interview (without full session video if upload failed or wasn't available)
      // Use candidate-specific interview ID, not template ID
      const interviewIdToUse = candidateInterviewIdRef.current || id
      console.log('✅ Completing interview with ID:', interviewIdToUse)
      await interviewAPI.completeInterview(interviewIdToUse)
      setSessionStatus('completed')
      toast.success('Interview completed successfully!')
      
      setTimeout(() => {
        navigate('/')
      }, 3000)
    } catch (error) {
      console.error('Error completing interview:', error)
      if (error.response?.status === 403) {
        toast.error('Access denied. Please refresh the page and try again.')
      } else {
        toast.error('Failed to complete interview: ' + (error.message || 'Unknown error'))
      }
    }
  }

  // Note: start-gemini-session is now emitted from within the socket's connect handler
  // This ensures the socket is connected before emitting the event

  // Note: Removed auto-enable useEffect - answer button should only be enabled after speech completes
  // This prevents premature button enabling and ensures proper flow

  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-center">
          <LoadingSpinner size="xl" />
          <p className="text-gray-400 mt-4 text-lg">Initializing interview session...</p>
        </div>
      </div>
    )
  }

  if (sessionStatus === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-center text-white max-w-md mx-auto px-4">
          <div className="bg-red-500/20 backdrop-blur-sm p-6 rounded-2xl border border-red-500/30 mb-6">
            <AlertCircle className="mx-auto h-16 w-16 text-red-400 mb-4" />
            <h2 className="text-2xl font-bold mb-4">Session Error</h2>
            <p className="text-gray-300 mb-6">Failed to initialize interview session</p>
            <button
              onClick={() => navigate('/')}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (sessionStatus === 'completed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-center text-white max-w-md mx-auto px-4">
          <div className="bg-emerald-500/20 backdrop-blur-sm p-8 rounded-2xl border border-emerald-500/30">
            <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-400 mb-6" />
            <h2 className="text-3xl font-bold mb-4">Interview Completed!</h2>
            <p className="text-gray-300 mb-2 text-lg">Thank you for completing the interview.</p>
            <p className="text-sm text-gray-400">Redirecting to dashboard...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex flex-col">
      {/* Modern Header */}
      <div className="bg-gradient-to-r from-gray-800 via-gray-800 to-gray-800 border-b border-gray-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-5">
            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{interview?.title}</h1>
                <p className="text-sm text-gray-400">
                  {currentQuestion ? `Question ${interview.questions.findIndex(q => q.id === currentQuestion.id) + 1} of ${interview.maxQuestions || interview.questions.length}` : 'Preparing...'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {sessionStatus === 'in_progress' && timeRemaining > 0 && (
                <div className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold shadow-lg ${
                  timeRemaining < 300 ? 'bg-gradient-to-r from-red-600 to-red-700 text-white border-2 border-red-500' : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-2 border-blue-500'
                }`}>
                  <Clock className="h-4 w-4" />
                  <span>Time: {formatTime(timeRemaining)}</span>
                  {timeRemaining < 300 && (
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse ml-1"></div>
                  )}
                </div>
              )}
              <button
                onClick={handleEndInterview}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-105 font-semibold"
              >
                <LogOut className="h-4 w-4" />
                <span>End Interview</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
          {/* Left Panel - Bot */}
          <div className="flex flex-col space-y-4">
            {/* Bot Avatar - Enhanced */}
            <div className="flex items-center space-x-4 bg-gradient-to-r from-gray-800 to-gray-800 rounded-2xl p-5 border-2 border-gray-700 shadow-xl">
              <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-lg ring-4 ring-indigo-500/20">
                <div className="text-3xl">🤖</div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">AI Interviewer</h3>
                <p className="text-sm text-gray-400">Ready to help you succeed</p>
              </div>
              {/* Phase 2: Enhanced speaking state indicators */}
              {isSpeaking && (
                <div className="flex items-center space-x-2 bg-blue-500/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-blue-500/30">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-sm font-bold text-blue-300">Bot Speaking...</span>
                </div>
              )}
              {conversationState === 'listening' && !isSpeaking && (
                <div className="flex items-center space-x-2 bg-purple-500/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-purple-500/30">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                  <span className="text-sm font-bold text-purple-300">Listening...</span>
                </div>
              )}
            </div>
            
            {/* Bot Message - Enhanced */}
            <div className="flex-1 bg-gradient-to-br from-gray-800 to-gray-800 rounded-2xl p-6 border-2 border-gray-700 shadow-xl flex flex-col">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2 rounded-lg">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                </div>
                <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Question</h4>
              </div>
              <div className="flex-1 overflow-y-auto">
                {/* Phase 1: Show bot interventions and deflections */}
                {botIntervention && (
                  <div className="mb-4 p-4 bg-blue-500/20 backdrop-blur-sm rounded-xl border border-blue-500/30">
                    <p className="text-blue-200 text-base leading-relaxed font-medium">{botIntervention.message}</p>
                    <p className="text-blue-400 text-xs mt-2">Bot Intervention</p>
                  </div>
                )}
                {botDeflection && (
                  <div className="mb-4 p-4 bg-amber-500/20 backdrop-blur-sm rounded-xl border border-amber-500/30">
                    <p className="text-amber-200 text-base leading-relaxed font-medium">{botDeflection.message}</p>
                    <p className="text-amber-400 text-xs mt-2">Note: Please answer the question I asked</p>
                  </div>
                )}
                {botAcknowledgment && (
                  <div className="mb-4 p-4 bg-green-500/20 backdrop-blur-sm rounded-xl border border-green-500/30">
                    <p className="text-green-200 text-base leading-relaxed font-medium">{botAcknowledgment.message}</p>
                  </div>
                )}
                
                {/* Regular question display */}
                {botGreeting ? (
                  <p className="text-white text-lg leading-relaxed font-medium">{botGreeting}</p>
                ) : currentQuestion ? (
                  <p className="text-white text-lg leading-relaxed font-medium">{currentQuestion.text}</p>
                ) : isProcessing ? (
                  <div className="flex items-center space-x-3">
                    <LoadingSpinner size="sm" />
                    <p className="text-gray-300 text-lg leading-relaxed font-medium">Preparing next question...</p>
                  </div>
                ) : (
                  <p className="text-gray-400 italic">Preparing your interview...</p>
                )}
                
                {/* Follow-up question indicator */}
                {followupQuestion && (
                  <div className="mt-4 p-3 bg-purple-500/20 backdrop-blur-sm rounded-lg border border-purple-500/30">
                    <p className="text-purple-200 text-sm">Follow-up question available</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Candidate Video */}
          <div className="flex flex-col space-y-4">
            {/* Candidate Video - Enhanced */}
            <div className="bg-black rounded-2xl overflow-hidden aspect-video relative shadow-2xl border-2 border-gray-700 ring-4 ring-gray-800/50">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }} // Mirror effect for self-view
                onLoadedMetadata={() => {
                  console.log('Video metadata loaded')
                  if (videoRef.current) {
                    videoRef.current.play().catch(err => {
                      console.error('Error auto-playing video:', err)
                    })
                  }
                }}
              />
              {isRecording && (
                <div className="absolute top-4 right-4 flex items-center space-x-2 bg-gradient-to-r from-red-600 to-red-700 px-4 py-2 rounded-xl z-10 shadow-xl border-2 border-red-500">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                  <span className="text-white text-sm font-bold">Recording</span>
                </div>
              )}
              {/* Candidate Label - Enhanced with Phase 2 speaking indicator */}
              <div className="absolute bottom-4 left-4 flex items-center space-x-2 bg-gradient-to-r from-gray-900/90 to-gray-800/90 backdrop-blur-md px-4 py-2 rounded-xl border border-gray-700 shadow-lg">
                {candidateSpeaking ? (
                  <>
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-white text-sm font-bold">You (Speaking)</span>
                  </>
                ) : (
                  <>
                    <div className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse ring-2 ring-green-500/50"></div>
                    <span className="text-white text-sm font-bold">You</span>
                  </>
                )}
              </div>
              {/* Phase 2: Audio energy visualization (optional, can be hidden) */}
              {audioEnergy > 0 && candidateSpeaking && (
                <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-100"
                        style={{ width: `${Math.min(100, audioEnergy * 1000)}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-white font-mono">{Math.round(audioEnergy * 1000)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Real-time Transcript - Enhanced */}
            <div className="flex-1 bg-gradient-to-br from-gray-800 to-gray-800 rounded-2xl p-6 border-2 border-gray-700 shadow-xl flex flex-col min-h-[200px] max-h-[400px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-2 rounded-lg">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  </div>
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wide">Your Response</h4>
                </div>
                {/* Phase 2: Enhanced listening/speaking indicators */}
                {candidateSpeaking && (
                  <div className="flex items-center space-x-2 text-green-300 bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-green-500/30">
                    <Mic className="w-4 h-4" />
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-sm font-bold">Speaking...</span>
                  </div>
                )}
                {isListening && !isProcessing && !candidateSpeaking && (
                  <div className="flex items-center space-x-2 text-green-300 bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-green-500/30">
                    <Mic className="w-4 h-4" />
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span className="text-sm font-bold">Listening...</span>
                  </div>
                )}
                {conversationState === 'candidate_speaking' && !candidateSpeaking && (
                  <div className="flex items-center space-x-2 text-blue-300 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 backdrop-blur-sm px-4 py-2 rounded-xl border border-blue-500/30">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                    <span className="text-sm font-bold">Processing...</span>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="text-gray-200 text-base leading-relaxed whitespace-pre-wrap">
                  {transcript || (isSpeaking ? 'Bot is speaking...' : (canStartAnswer ? 'Click "Start Answer" to begin recording your response.' : (currentQuestion ? 'Question is ready. Click "Start Answer" when you\'re ready to respond.' : 'Waiting for question...')))}
                  {transcript && !isProcessing && isListening && (
                    <span className="inline-block w-2 h-5 bg-blue-400 ml-1 animate-pulse"></span>
                  )}
                </div>
              </div>
              {isProcessing && (
                <div className="mt-2 flex items-center space-x-2 text-gray-400 text-xs pt-2">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"></div>
                  <span className="text-xs">Processing in background...</span>
                </div>
              )}
            </div>

            {/* Start Answer Button - Only shown when not recording (conversational mode handles stopping automatically) */}
            {canStartAnswer && !isRecording && !isSpeaking && (
              <div className="flex justify-center">
                <button
                  onClick={startAnswering}
                  className="w-full px-6 py-4 bg-gradient-to-r from-green-600 via-emerald-600 to-green-500 hover:from-green-700 hover:via-emerald-700 hover:to-green-600 text-white rounded-2xl font-bold transition-all duration-200 flex items-center justify-center space-x-3 shadow-2xl hover:shadow-green-500/50 transform hover:scale-[1.02] border-2 border-green-500/30"
                >
                  <VideoIcon className="w-6 h-6" />
                  <span className="text-lg">Start Answer</span>
                </button>
              </div>
            )}
            {/* Recording indicator - conversational mode, no manual stop needed */}
            {isRecording && (
              <div className="flex justify-center">
                <div className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 via-blue-600 to-blue-500 text-white rounded-2xl font-bold flex items-center justify-center space-x-3 border-2 border-blue-500/30">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-lg">Recording Answer...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* End Interview Confirmation Modal - Enhanced */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 max-w-md w-full border-2 border-gray-700 shadow-2xl">
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-red-500/20 p-3 rounded-xl">
                <AlertCircle className="h-6 w-6 text-red-400" />
              </div>
              <h3 className="text-2xl font-bold text-white">End Interview?</h3>
            </div>
            <p className="text-gray-300 mb-8 text-lg leading-relaxed">
              Are you sure you want to end the interview? All progress will be saved, but you won't be able to continue.
            </p>
            <div className="flex space-x-4">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Cancel
              </button>
              <button
                onClick={confirmEndInterview}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl transition-all font-bold shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                End Interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}