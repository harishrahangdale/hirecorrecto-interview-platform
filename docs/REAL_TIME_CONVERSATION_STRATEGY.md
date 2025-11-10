# Real-Time Interactive Conversation Strategy

## Executive Summary

This document outlines a comprehensive strategy to transform the HireCorrecto interview platform from a uni-directional Q&A system into a bi-directional, real-time conversational AI interview experience. The strategy addresses two critical issues:

1. **Real-time Follow-up Questions**: Enable the bot to ask contextual follow-up questions based on candidate responses in real-time
2. **Bi-directional Conversation**: Create a natural, interactive conversation flow where both bot and candidate can speak/listen simultaneously

## Current System Analysis

### Current Flow
```
1. Bot displays question → Bot speaks question
2. Candidate clicks "Start Answer" → Records video/audio
3. Candidate clicks "Stop Answer" → Stops recording
4. Video/audio uploaded → Sent to Gemini for processing (async)
5. Bot asks next question (NOT based on previous answer)
6. Background processing completes → Scoring + cheating analysis
```

### Current Limitations
- **No real-time context**: Bot cannot ask follow-up questions based on candidate's answer
- **Uni-directional**: Bot speaks OR candidate speaks, never both simultaneously
- **Delayed analysis**: Video/audio processing happens after next question is asked
- **No conversation flow**: Feels like a scripted interview, not a natural conversation

## Proposed Solution Architecture

### Phase 1: Real-Time Transcript Processing for Follow-ups

#### 1.1 Dual Processing Pipeline

**Fast Path (Real-time Follow-ups):**
```
Candidate speaks → Browser Speech Recognition → Transcript chunks → 
Server (via WebSocket) → Gemini Text API (fast) → Follow-up question → Bot speaks
```

**Slow Path (Detailed Analysis):**
```
Video/audio recording → Upload to server → Gemini Video/Audio API → 
Detailed scoring + cheating analysis → Store in database
```

#### 1.2 Implementation Strategy

**Frontend Changes:**
- **Continuous Speech Recognition**: Already implemented, but needs enhancement
  - Stream transcript chunks to server in real-time (every 2-3 seconds)
  - Use WebSocket for low-latency transmission
  - Buffer transcript locally for display

**Backend Changes:**
- **New WebSocket Event**: `transcript-chunk`
  ```javascript
  {
    sessionId: string,
    questionId: string,
    transcriptChunk: string,
    isFinal: boolean,
    timestamp: number
  }
  ```

- **Fast Gemini Text Processing**:
  - Use lightweight Gemini model (`gemini-1.5-flash`) for quick analysis
  - Process transcript chunks (not video) for follow-up generation
  - Response time target: < 2 seconds
  - Generate follow-up questions based on transcript content

- **Background Video Processing**:
  - Continue existing video/audio processing pipeline
  - Run in parallel with conversation
  - Store detailed analysis when complete

#### 1.3 Question Boundary Detection

**Strategy:**
- Use conversation markers and timestamps to track question boundaries
- Implement state machine for conversation flow

**Markers:**
```javascript
{
  questionStart: {
    questionId: string,
    timestamp: number,
    questionText: string
  },
  questionEnd: {
    questionId: string,
    timestamp: number,
    finalTranscript: string
  },
  followUpStart: {
    parentQuestionId: string,
    followUpId: string,
    timestamp: number
  }
}
```

**State Machine:**
```
IDLE → QUESTION_ASKED → CANDIDATE_SPEAKING → PROCESSING_TRANSCRIPT → 
FOLLOW_UP_READY → (FOLLOW_UP_ASKED | NEXT_QUESTION_READY)
```

### Phase 2: Bi-directional Conversation

#### 2.1 Voice Activity Detection (VAD)

**Implementation:**
- Use Web Audio API for real-time audio analysis
- Detect when candidate is speaking vs. silent
- Use energy threshold and silence detection

**Algorithm:**
```javascript
// Pseudo-code
const detectVoiceActivity = (audioBuffer) => {
  const energy = calculateEnergy(audioBuffer);
  const threshold = adaptiveThreshold(); // Adjusts based on environment
  
  if (energy > threshold && !isBotSpeaking) {
    return 'candidate_speaking';
  } else if (energy < threshold && silenceDuration > 500ms) {
    return 'candidate_silent';
  }
  return 'unknown';
};
```

#### 2.2 Conversation Turn Management

**Turn-Taking Rules:**
1. **Bot Priority**: Bot can interrupt if candidate has been speaking > 30 seconds
2. **Natural Pauses**: Bot waits for natural pauses (1-2 seconds of silence)
3. **Overlap Handling**: If both speak simultaneously:
   - Bot pauses if candidate just started speaking
   - Candidate pauses if bot is asking a question
   - Use visual indicators for who is speaking

**State Management:**
```javascript
const conversationState = {
  botSpeaking: boolean,
  candidateSpeaking: boolean,
  lastSpeaker: 'bot' | 'candidate',
  silenceDuration: number,
  turnQueue: Array<'bot' | 'candidate'>
};
```

#### 2.3 Real-time Audio Streaming

**Option A: WebRTC (Recommended for Production)**
- Use WebRTC for real-time bidirectional audio
- Lower latency than WebSocket
- Better quality
- More complex setup

**Option B: WebSocket Audio Chunks (Easier Implementation)**
- Stream audio chunks via WebSocket
- Simpler to implement
- Slightly higher latency
- Good for MVP

**Implementation (WebSocket Approach):**
```javascript
// Frontend: Stream audio chunks
const audioContext = new AudioContext();
const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
const processor = audioContext.createScriptProcessor(4096, 1, 1);

processor.onaudioprocess = (e) => {
  const audioData = e.inputBuffer.getChannelData(0);
  socket.emit('audio-chunk', {
    sessionId,
    audioData: Array.from(audioData),
    timestamp: Date.now()
  });
};
```

#### 2.4 Bot Response Generation

**Real-time Response Strategy:**
- Use transcript chunks to generate quick responses
- Bot can:
  - Ask clarifying questions
  - Provide encouragement ("That's interesting, tell me more...")
  - Request elaboration
  - Acknowledge understanding

**Response Types:**
1. **Immediate Acknowledgment**: "I see", "Interesting", "Go on"
2. **Clarifying Questions**: "Can you elaborate on...?"
3. **Follow-up Questions**: Based on transcript analysis
4. **Transition Questions**: Move to next topic

### Phase 2.5: Silence Handling & Conversation Recovery

#### 2.5.1 Silence Detection & Intervention

**Problem Statement:**
In real interviews, candidates often need time to think. Long silences (7-10+ seconds) can indicate:
- Candidate is thinking/processing the question
- Candidate doesn't know the answer
- Candidate is nervous or stuck
- Technical issues (mic not working, etc.)

**Solution: Proactive Bot Intervention**

**Silence Thresholds:**
```javascript
const SILENCE_THRESHOLDS = {
  THINKING_CHECK: 7000,      // 7 seconds - Check if still thinking
  EXTENDED_SILENCE: 15000,   // 15 seconds - Suggest moving on
  MAX_SILENCE: 30000         // 30 seconds - Force move to next question
};
```

**Intervention Flow:**
```
Question Asked → 7s silence → Bot: "Are you still thinking about this?"
  ├─ Candidate: "Yes" → Wait more → 15s total silence → Bot: "No worries, we can move on"
  ├─ Candidate: "No" → Bot: "That's okay, let's move to the next question"
  ├─ Candidate starts speaking → Bot: "Go ahead, take your time"
  └─ No response → 30s total → Auto move to next question
```

#### 2.5.2 Implementation Strategy

**State Machine Enhancement:**
```javascript
const conversationState = {
  currentQuestion: {...},
  questionStartTime: number,
  lastSpeechTime: number,
  silenceDuration: number,
  interventionLevel: 'none' | 'thinking_check' | 'suggest_move_on' | 'force_move',
  candidateResponse: 'thinking' | 'ready' | 'skip' | null,
  interventionHistory: [
    {
      timestamp: number,
      type: 'thinking_check' | 'suggest_move_on',
      candidateResponse: string | null
    }
  ]
};
```

**Silence Monitoring:**
```javascript
// Pseudo-code for silence monitoring
const monitorSilence = () => {
  const silenceDuration = Date.now() - lastSpeechTime;
  
  if (silenceDuration >= SILENCE_THRESHOLDS.THINKING_CHECK && 
      interventionLevel === 'none') {
    // First intervention: Check if thinking
    botIntervene('thinking_check');
    interventionLevel = 'thinking_check';
  } else if (silenceDuration >= SILENCE_THRESHOLDS.EXTENDED_SILENCE && 
             interventionLevel === 'thinking_check' && 
             candidateResponse === 'thinking') {
    // Second intervention: Suggest moving on
    botIntervene('suggest_move_on');
    interventionLevel = 'suggest_move_on';
  } else if (silenceDuration >= SILENCE_THRESHOLDS.MAX_SILENCE) {
    // Force move to next question
    botIntervene('force_move');
    moveToNextQuestion();
  }
};
```

#### 2.5.3 Bot Intervention Responses

**Intervention Type 1: Thinking Check (7 seconds)**
```javascript
const thinkingCheckResponses = [
  "Are you still thinking about this? Take your time.",
  "No rush, are you still working through this?",
  "I see you're thinking. Would you like more time?",
  "Feel free to take a moment. Are you still considering your answer?"
];
```

**Intervention Type 2: Suggest Move On (15 seconds after thinking check)**
```javascript
const suggestMoveOnResponses = [
  "That's perfectly fine. We can move on to the next question if you'd like.",
  "No worries at all. Would you like to move forward?",
  "It's okay if you're not sure. We can continue with the next question.",
  "That's alright. Shall we move on?"
];
```

**Intervention Type 3: Force Move (30 seconds)**
```javascript
const forceMoveResponses = [
  "Let's move on to the next question.",
  "We'll continue with the next question.",
  "Moving forward to the next question."
];
```

#### 2.5.4 Candidate Response Handling

**Response Detection:**
- Use speech recognition to detect candidate responses
- Parse common responses:
  - "Yes", "Yeah", "I'm thinking", "Give me a moment" → `candidateResponse = 'thinking'`
  - "No", "I don't know", "Skip", "Next" → `candidateResponse = 'skip'`
  - Candidate starts answering → `candidateResponse = 'ready'`

**Response Handling:**
```javascript
const handleCandidateResponse = (transcript) => {
  const lowerTranscript = transcript.toLowerCase();
  
  // Check for thinking/yes responses
  if (matches(lowerTranscript, ['yes', 'yeah', 'thinking', 'moment', 'time'])) {
    candidateResponse = 'thinking';
    // Reset silence timer, give more time
    lastSpeechTime = Date.now();
    botAcknowledge("Take your time, I'm here when you're ready.");
  }
  
  // Check for skip/no responses
  else if (matches(lowerTranscript, ['no', 'dont know', 'skip', 'next', 'move on'])) {
    candidateResponse = 'skip';
    botAcknowledge("No problem at all. Let's move to the next question.");
    moveToNextQuestion();
  }
  
  // Check if candidate started answering
  else if (isAnswerStart(lowerTranscript)) {
    candidateResponse = 'ready';
    botAcknowledge("Go ahead, I'm listening.");
    // Continue normal conversation flow
  }
};
```

#### 2.5.5 Mid-way Answer Recovery

**Scenario:** Candidate says "I need more time" but then starts answering mid-way.

**Implementation:**
```javascript
const handleMidwayAnswer = (transcript) => {
  // If candidate was in 'thinking' state but now speaking
  if (candidateResponse === 'thinking' && hasSubstantialContent(transcript)) {
    // Cancel any pending "move on" interventions
    cancelPendingInterventions();
    
    // Encourage candidate to continue
    botAcknowledge("I see you're ready. Please go ahead with your answer.");
    
    // Reset to normal answering state
    candidateResponse = 'ready';
    interventionLevel = 'none';
    lastSpeechTime = Date.now();
  }
};
```

**Visual Feedback:**
- Show "Bot is listening..." indicator when candidate is thinking
- Show "Take your time" message during extended silence
- Show "Go ahead" when candidate starts speaking after silence

#### 2.5.6 Graceful Question Skipping

**When to Skip:**
- Candidate explicitly says "I don't know" or "Skip"
- Candidate confirms they want to move on
- Maximum silence threshold reached (30 seconds)

**Skip Handling:**
```javascript
const skipQuestion = (questionId, reason) => {
  // Mark question as skipped
  markQuestionSkipped(questionId, {
    reason: reason, // 'candidate_requested' | 'timeout' | 'max_silence'
    skippedAt: Date.now(),
    interventionHistory: conversationState.interventionHistory
  });
  
  // Generate next question
  const nextQuestion = generateNextQuestion(sessionId, {
    previousQuestionSkipped: true,
    skipReason: reason
  });
  
  // Move to next question
  moveToNextQuestion(nextQuestion);
};
```

**Evaluation Impact:**
- Skipped questions should be marked in evaluation
- Consider partial credit if candidate attempted but couldn't complete
- Note in final report: "Question X was skipped - candidate requested / timeout"

#### 2.5.7 Natural Conversation Recovery

**Recovery Scenarios:**

1. **Candidate Recovers After Thinking:**
   ```
   Bot: "Are you still thinking?"
   Candidate: "Yes, just a moment..."
   [5 seconds pass]
   Candidate: "Actually, I think I can answer this..."
   Bot: "Great! Go ahead, I'm listening."
   ```

2. **Candidate Changes Mind:**
   ```
   Bot: "Would you like to move on?"
   Candidate: "Actually, let me try..."
   Bot: "Of course, take your time."
   ```

3. **Technical Recovery:**
   ```
   [Long silence detected]
   Bot: "I notice you haven't responded. Is everything working on your end?"
   Candidate: "Yes, I'm here"
   Bot: "Great! Would you like to answer this question or move on?"
   ```

#### 2.5.8 Implementation Details

**Frontend (`InterviewSession.jsx`):**
```javascript
// Silence monitoring
useEffect(() => {
  const silenceMonitor = setInterval(() => {
    const silenceDuration = Date.now() - lastSpeechTime;
    
    if (silenceDuration >= 7000 && !hasIntervened) {
      // Emit silence event to server
      socket.emit('silence-detected', {
        sessionId,
        questionId: currentQuestion.id,
        silenceDuration,
        interventionLevel: 'thinking_check'
      });
      setHasIntervened(true);
    }
  }, 1000);
  
  return () => clearInterval(silenceMonitor);
}, [lastSpeechTime, currentQuestion]);
```

**Backend (`server/index.js`):**
```javascript
socket.on('silence-detected', async (data) => {
  const { sessionId, questionId, silenceDuration, interventionLevel } = data;
  
  // Determine intervention type
  let interventionType = 'none';
  let response = '';
  
  if (silenceDuration >= 7000 && silenceDuration < 15000) {
    interventionType = 'thinking_check';
    response = getRandomResponse(thinkingCheckResponses);
  } else if (silenceDuration >= 15000 && silenceDuration < 30000) {
    interventionType = 'suggest_move_on';
    response = getRandomResponse(suggestMoveOnResponses);
  } else if (silenceDuration >= 30000) {
    interventionType = 'force_move';
    response = getRandomResponse(forceMoveResponses);
    // Move to next question
    await moveToNextQuestion(sessionId, questionId, 'timeout');
  }
  
  // Emit intervention to client
  socket.emit('bot-intervention', {
    type: interventionType,
    message: response,
    questionId
  });
});
```

**Gemini Service Enhancement:**
```javascript
// Add method to detect candidate response intent
async detectResponseIntent(transcript) {
  const prompt = `Analyze this candidate response and determine intent:
  
  Transcript: "${transcript}"
  
  Determine if the candidate is:
  1. Still thinking (wants more time)
  2. Ready to skip (doesn't know, wants to move on)
  3. Starting to answer (has begun their response)
  4. Asking for clarification
  
  Return JSON:
  {
    "intent": "thinking" | "skip" | "answering" | "clarification",
    "confidence": 0.0-1.0,
    "suggested_bot_response": "string"
  }`;
  
  // Use fast model for quick response
  const result = await model.generateContent(prompt);
  return parseResponse(result);
}
```

#### 2.5.9 User Experience Considerations

**Visual Indicators:**
- **Thinking State**: Show "Bot is waiting..." with subtle animation
- **Intervention Active**: Show bot's intervention message prominently
- **Recovery State**: Show "Go ahead" when candidate starts speaking
- **Silence Timer**: Optional visual countdown (can be hidden for less pressure)

**Audio Cues:**
- Subtle notification sound when bot intervenes (optional)
- Natural speech synthesis for interventions (not robotic)

**Pressure Management:**
- Don't make candidate feel rushed
- Use encouraging, supportive language
- Make it clear it's okay to skip questions
- Maintain professional but friendly tone

### Phase 2.6: Interview Integrity & Candidate Question Handling

#### 2.6.1 Problem Statement

**Security & Behavioral Concerns:**
Candidates may attempt to:
- Ask the bot questions to get hints or answers
- Request the bot to provide solutions
- Try to distract the bot from the interview flow
- Attempt to reverse the interview roles
- Ask for clarification that reveals answers

**Impact:**
- Compromises interview integrity
- Unfair advantage to candidates who try this
- Reduces assessment accuracy
- Wastes interview time

#### 2.6.2 Detection Strategy

**Question Detection Patterns:**
```javascript
const QUESTION_PATTERNS = {
  // Direct questions to bot
  directQuestions: [
    /^(what|how|why|when|where|can you|could you|would you|tell me|explain)/i,
    /^(what is|how do|why does|when should|where can)/i,
    /^(can you tell|could you explain|would you help)/i
  ],
  
  // Requests for answers/hints
  answerRequests: [
    /(give me|provide|show me|tell me) (the )?(answer|solution|hint|clue)/i,
    /(what is|what's) (the )?(answer|solution|correct|right)/i,
    /(help me|assist me) (with|to|in)/i,
    /(can|could|would) (you )?(give|provide|tell|show|explain)/i
  ],
  
  // Role reversal attempts
  roleReversal: [
    /(you should|you need to|you can|you could)/i,
    /(what would you do|how would you|your approach)/i,
    /(your answer|your solution|your opinion)/i
  ],
  
  // Clarification that might reveal answers
  revealingClarification: [
    /(is it|is this|does it|should it|must it)/i,
    /(is the answer|is the solution|does this mean)/i,
    /(confirm|verify|check) (if|that|whether)/i
  ]
};
```

**Intent Classification:**
```javascript
const classifyCandidateIntent = (transcript) => {
  // Check if candidate is asking a question (not answering)
  const isQuestion = QUESTION_PATTERNS.directQuestions.some(pattern => 
    pattern.test(transcript)
  );
  
  // Check if requesting answer/hint
  const isAnswerRequest = QUESTION_PATTERNS.answerRequests.some(pattern => 
    pattern.test(transcript)
  );
  
  // Check if trying to reverse roles
  const isRoleReversal = QUESTION_PATTERNS.roleReversal.some(pattern => 
    pattern.test(transcript)
  );
  
  // Check if clarification might reveal answer
  const isRevealingClarification = QUESTION_PATTERNS.revealingClarification.some(pattern => 
    pattern.test(transcript)
  );
  
  return {
    isQuestion,
    isAnswerRequest,
    isRoleReversal,
    isRevealingClarification,
    requiresDeflection: isQuestion || isAnswerRequest || isRoleReversal || isRevealingClarification
  };
};
```

#### 2.6.3 Bot Response Strategy

**Deflection Responses (Professional & Polite):**

**Category 1: Direct Question Deflection**
```javascript
const directQuestionResponses = [
  "I appreciate your question, but I'm here to assess your knowledge and skills. Could you share your thoughts on the question I asked?",
  "That's an interesting question, but let's focus on your response to the interview question. What are your thoughts?",
  "I understand you might have questions, but I'd like to hear your answer first. How would you approach this?",
  "I'm here to listen to your answers, not to provide them. Could you tell me how you would handle this?"
];
```

**Category 2: Answer Request Deflection**
```javascript
const answerRequestResponses = [
  "I can't provide the answer, but I'd love to hear your approach. What would you do?",
  "The purpose of this interview is to understand your thinking process. Could you walk me through how you would solve this?",
  "I'm not able to give hints or answers, but I'm interested in your perspective. How would you tackle this?",
  "Let's focus on your solution. What's your approach to this problem?"
];
```

**Category 3: Role Reversal Deflection**
```javascript
const roleReversalResponses = [
  "I appreciate the question, but I'm here to evaluate your skills. Could you share your own approach?",
  "That's an interesting perspective, but I'd like to understand how you would handle this. What's your approach?",
  "I'm here to assess your knowledge, not to provide solutions. How would you solve this?",
  "Let's focus on your answer. What would you do in this situation?"
];
```

**Category 4: Clarification Handling**
```javascript
const clarificationResponses = [
  "I understand you might need clarification. Could you tell me what part you'd like me to clarify, and I'll rephrase the question?",
  "If the question isn't clear, I can rephrase it. What aspect would you like me to clarify?",
  "I can help clarify the question, but I can't provide hints about the answer. What part needs clarification?",
  "Let me know what's unclear, and I'll rephrase the question for you."
];
```

**Safe Clarification Rules:**
- ✅ Can rephrase the question
- ✅ Can explain what the question is asking for
- ✅ Can provide context about the domain
- ❌ Cannot provide hints about the answer
- ❌ Cannot confirm if candidate's approach is correct
- ❌ Cannot give examples that reveal the solution

#### 2.6.4 Implementation Strategy

**Real-time Detection:**
```javascript
// In transcript chunk processing
const processTranscriptChunk = async (transcript, questionId) => {
  // Detect if candidate is asking questions
  const intent = classifyCandidateIntent(transcript);
  
  if (intent.requiresDeflection) {
    // Determine appropriate response
    let responseType = 'direct_question';
    if (intent.isAnswerRequest) responseType = 'answer_request';
    else if (intent.isRoleReversal) responseType = 'role_reversal';
    else if (intent.isRevealingClarification) responseType = 'clarification';
    
    // Generate appropriate deflection
    const deflectionResponse = getDeflectionResponse(responseType);
    
    // Emit to client
    socket.emit('bot-deflection', {
      type: responseType,
      message: deflectionResponse,
      questionId,
      candidateQuestion: transcript
    });
    
    // Log for security/analysis
    logSecurityEvent({
      type: 'candidate_question_attempt',
      questionId,
      candidateQuestion: transcript,
      intent: intent,
      timestamp: Date.now()
    });
  }
};
```

**Gemini-Based Detection (More Accurate):**
```javascript
// Enhanced detection using Gemini
async detectQuestionIntent(transcript, currentQuestion) {
  const prompt = `Analyze this candidate response during an interview:
  
  Current Interview Question: "${currentQuestion.text}"
  Candidate's Response: "${transcript}"
  
  Determine if the candidate is:
  1. Answering the question (normal response)
  2. Asking the interviewer a question (needs deflection)
  3. Requesting hints/answers (needs deflection)
  4. Trying to reverse roles (needs deflection)
  5. Asking for legitimate clarification (can help)
  
  Return JSON:
  {
    "intent": "answering" | "asking_question" | "requesting_answer" | "role_reversal" | "legitimate_clarification",
    "confidence": 0.0-1.0,
    "requires_deflection": boolean,
    "can_clarify": boolean, // Only true for legitimate clarification
    "suggested_bot_response": "string" // Appropriate deflection or clarification
  }`;
  
  const result = await model.generateContent(prompt);
  return parseResponse(result);
}
```

#### 2.6.5 Legitimate Clarification Handling

**When to Allow Clarification:**
- Candidate asks about question wording
- Candidate asks about scope/context
- Candidate asks about format expectations
- Candidate asks about time/constraints

**Safe Clarification Examples:**
```
Candidate: "When you say 'scalable', do you mean horizontal or vertical scaling?"
Bot: "Good question! I'm asking about scalability in general - you can discuss either approach or both."

Candidate: "Should I explain this conceptually or with code examples?"
Bot: "Either approach works - whatever helps you best explain your thinking."

Candidate: "Is this question about microservices or monolithic architecture?"
Bot: "The question is open-ended - you can discuss any architectural approach you think is relevant."
```

**Unsafe Clarification (Should Deflect):**
```
Candidate: "Is the answer using JWT tokens?"
Bot: "I can't confirm or deny specific approaches. What's your solution?"

Candidate: "Should I use Redis for caching?"
Bot: "I'm here to hear your approach, not to guide you. What would you choose?"

Candidate: "Is this the correct way to do it?"
Bot: "I can't validate your approach during the interview. Could you explain your reasoning?"
```

#### 2.6.6 Security Logging & Analysis

**Logging Strategy:**
```javascript
const logSecurityEvent = (event) => {
  // Store in database
  SecurityLog.create({
    interviewId: event.interviewId,
    questionId: event.questionId,
    type: event.type,
    candidateQuestion: event.candidateQuestion,
    intent: event.intent,
    botResponse: event.botResponse,
    timestamp: event.timestamp,
    severity: calculateSeverity(event) // 'low' | 'medium' | 'high'
  });
  
  // Alert if multiple attempts
  if (getAttemptCount(event.interviewId) > 3) {
    alertRecruiter(event.interviewId, 'Multiple question attempts detected');
  }
};
```

**Severity Levels:**
- **Low**: Single clarification request
- **Medium**: Multiple clarification requests, one answer request
- **High**: Repeated answer requests, persistent role reversal attempts

**Recruiter Alerts:**
- Flag interviews with high severity events
- Include in interview report
- Note in candidate evaluation

#### 2.6.7 Conversation Flow Management

**State Management:**
```javascript
const conversationState = {
  // ... existing state
  questionAttempts: 0, // Count of candidate questions
  lastQuestionAttempt: null,
  deflectionHistory: [],
  legitimateClarifications: 0
};
```

**Flow Control:**
```javascript
const handleCandidateQuestion = (transcript, questionId) => {
  conversationState.questionAttempts++;
  conversationState.lastQuestionAttempt = Date.now();
  
  // If too many attempts, be more direct
  if (conversationState.questionAttempts > 2) {
    return getStricterDeflection();
  }
  
  // Normal deflection
  return getDeflectionResponse(intent);
};

const getStricterDeflection = () => {
  return "I understand you have questions, but I need to assess your knowledge. Please provide your answer to the question I asked, or we can move on to the next question.";
};
```

#### 2.6.8 Redirection Strategy

**After Deflection:**
1. **Immediate Redirection**: Redirect back to original question
2. **Give Time**: Allow candidate to process and respond
3. **Follow-up**: If no response after 5 seconds, gently remind
4. **Escalation**: If persistent, offer to move to next question

**Redirection Flow:**
```
Candidate asks question
  ↓
Bot deflects politely
  ↓
[5 seconds silence]
  ↓
Bot: "Would you like to answer the question, or should we move on?"
  ↓
Candidate responds or moves on
```

#### 2.6.9 Implementation Details

**Frontend (`InterviewSession.jsx`):**
```javascript
// Listen for bot deflections
socket.on('bot-deflection', (data) => {
  const { type, message, candidateQuestion } = data;
  
  // Show deflection message
  setBotMessage(message);
  speakText(message);
  
  // Log for UI
  addToConversationHistory({
    type: 'bot_deflection',
    message,
    candidateQuestion,
    timestamp: Date.now()
  });
  
  // Show visual indicator
  showDeflectionIndicator(true);
});
```

**Backend (`server/index.js`):**
```javascript
// Enhanced transcript processing
socket.on('transcript-chunk', async (data) => {
  const { sessionId, questionId, transcriptChunk, isFinal } = data;
  
  // Check if candidate is asking questions
  const intent = await detectQuestionIntent(transcriptChunk, currentQuestion);
  
  if (intent.requires_deflection) {
    // Emit deflection
    socket.emit('bot-deflection', {
      type: intent.intent,
      message: intent.suggested_bot_response,
      questionId,
      candidateQuestion: transcriptChunk
    });
    
    // Log security event
    logSecurityEvent({
      interviewId: session.interviewId,
      questionId,
      type: 'candidate_question_attempt',
      candidateQuestion: transcriptChunk,
      intent: intent,
      botResponse: intent.suggested_bot_response,
      timestamp: Date.now()
    });
  }
});
```

**Gemini Service (`server/services/gemini.js`):**
```javascript
async detectQuestionIntent(transcript, currentQuestion) {
  const prompt = `You are an AI interviewer. A candidate just said: "${transcript}"
  
  Current interview question: "${currentQuestion.text}"
  
  Determine:
  1. Is the candidate answering the question? (normal)
  2. Is the candidate asking YOU a question? (deflect)
  3. Is the candidate requesting hints/answers? (deflect)
  4. Is the candidate trying to reverse roles? (deflect)
  5. Is the candidate asking for legitimate clarification? (can help)
  
  Rules:
  - Legitimate clarification: Questions about wording, scope, format, constraints
  - NOT legitimate: Questions that would reveal the answer or confirm approaches
  
  Return JSON:
  {
    "intent": "answering" | "asking_question" | "requesting_answer" | "role_reversal" | "legitimate_clarification",
    "confidence": 0.0-1.0,
    "requires_deflection": boolean,
    "can_clarify": boolean,
    "suggested_bot_response": "Professional, polite deflection or clarification"
  }`;
  
  const result = await model.generateContent(prompt);
  return parseResponse(result);
}
```

#### 2.6.10 Evaluation Impact

**Scoring Considerations:**
- Multiple question attempts should not directly penalize score
- But may indicate lack of confidence or knowledge
- Note in evaluation: "Candidate asked multiple clarifying questions"
- Consider in overall assessment context

**Report Inclusion:**
```javascript
{
  questionId: "q_123",
  evaluation: {...},
  integrity: {
    questionAttempts: 2,
    deflectionHistory: [
      {
        timestamp: 1000,
        candidateQuestion: "Can you give me a hint?",
        botResponse: "I can't provide hints, but I'd love to hear your approach."
      }
    ],
    severity: "low"
  }
}
```

### Phase 3: Question Segmentation & Storage

#### 3.1 Conversation Segmentation

**Segmentation Strategy:**
- Track each question's conversation as a separate segment
- Include all follow-ups within the same segment
- Store timestamps for each turn

**Data Structure:**
```javascript
{
  questionId: string,
  questionText: string,
  conversationTurns: [
    {
      speaker: 'bot' | 'candidate',
      text: string,
      timestamp: number,
      audioUrl?: string, // For candidate turns
      transcript?: string
    }
  ],
  videoSegment: {
    startTime: number, // Relative to session start
    endTime: number,
    videoUrl: string
  },
  finalTranscript: string, // Combined transcript
  evaluation: {...}, // From detailed analysis
  cheating: {...} // From detailed analysis
}
```

#### 3.2 Video Segmentation

**Strategy:**
- Record full session continuously (already implemented)
- Use timestamps to extract question-specific segments
- Store both:
  - Full session video (for overall review)
  - Question-specific segments (for detailed analysis)

**Implementation:**
```javascript
// Extract segment from full session
const extractQuestionSegment = (fullSessionVideo, startTime, endTime) => {
  // Use FFmpeg or similar to extract segment
  // Store as separate file
  return questionSegmentVideo;
};
```

#### 3.3 Transcript Aggregation

**Strategy:**
- Combine all transcript chunks for a question
- Include bot's questions in transcript
- Create conversation-style transcript

**Format:**
```
[Bot]: Can you explain how you would design a scalable authentication system?

[Candidate]: Well, I would start by considering the security requirements...

[Bot]: That's interesting. Can you elaborate on the token management aspect?

[Candidate]: Sure, for token management, I would use JWT tokens...
```

## Technical Implementation Plan

### Step 1: Real-time Transcript Streaming

**Frontend (`InterviewSession.jsx`):**
1. Enhance speech recognition to stream chunks
2. Add WebSocket event for transcript chunks
3. Implement transcript buffering

**Backend (`server/index.js`):**
1. Add `transcript-chunk` WebSocket handler
2. Implement transcript aggregation
3. Add fast Gemini text processing endpoint

**Gemini Service (`server/services/gemini.js`):**
1. Add `processTranscriptChunk()` method
2. Use lightweight model for quick analysis
3. Generate follow-up questions from transcript

### Step 2: Voice Activity Detection

**Frontend:**
1. Implement Web Audio API VAD
2. Add visual indicators for speaking state
3. Implement turn-taking logic

**Backend:**
1. Process VAD signals
2. Manage conversation state
3. Coordinate bot responses

### Step 2.5: Silence Handling & Intervention

**Frontend (`InterviewSession.jsx`):**
1. Implement silence monitoring (track last speech time)
2. Emit `silence-detected` events to server
3. Handle bot intervention responses
4. Detect candidate response intents (thinking/skip/answering)
5. Implement mid-way answer recovery
6. Add visual indicators for thinking/intervention states

**Backend (`server/index.js`):**
1. Add `silence-detected` WebSocket handler
2. Implement intervention logic with thresholds
3. Generate appropriate bot intervention responses
4. Handle candidate response parsing
5. Manage question skipping gracefully
6. Track intervention history

**Gemini Service (`server/services/gemini.js`):**
1. Add `detectResponseIntent()` method
2. Parse candidate responses (thinking/skip/answering)
3. Generate contextual intervention responses
4. Handle conversation recovery scenarios

### Step 2.6: Interview Integrity & Question Handling

**Frontend (`InterviewSession.jsx`):**
1. Listen for `bot-deflection` events
2. Display deflection messages
3. Show visual indicators for integrity events
4. Track deflection history in UI

**Backend (`server/index.js`):**
1. Add question intent detection to transcript processing
2. Implement pattern-based detection (regex)
3. Integrate Gemini-based detection for accuracy
4. Emit `bot-deflection` events
5. Log security events to database
6. Alert recruiters for high-severity events

**Gemini Service (`server/services/gemini.js`):**
1. Add `detectQuestionIntent()` method
2. Classify candidate intents (answering vs asking)
3. Generate appropriate deflection responses
4. Distinguish legitimate vs revealing clarifications
5. Provide context-aware responses

**Database:**
1. Create SecurityLog model/schema
2. Store question attempts and deflections
3. Track severity levels
4. Link to interview reports

### Step 3: Bi-directional Audio

**Option A (WebSocket - MVP):**
1. Stream audio chunks from client
2. Process on server
3. Stream bot audio back to client
4. Use Web Audio API for playback

**Option B (WebRTC - Production):**
1. Set up WebRTC peer connection
2. Implement signaling server
3. Stream bidirectional audio
4. Lower latency, better quality

### Step 4: Question Segmentation

**Backend:**
1. Implement conversation turn tracking
2. Store question boundaries
3. Extract video segments
4. Aggregate transcripts

**Database:**
1. Update Interview schema to store conversation turns
2. Add question segment references
3. Store full session + segments

## Data Flow Diagrams

### Real-time Follow-up Flow

```
┌─────────────┐
│  Candidate  │
│   Speaks    │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Browser Speech   │
│ Recognition      │
│ (Stream chunks)  │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐      ┌──────────────┐
│ WebSocket        │─────►│ Server       │
│ transcript-chunk │      │ (Aggregate)  │
└──────────────────┘      └──────┬───────┘
                                  │
                                  ▼
                          ┌──────────────────┐
                          │ Gemini Text API  │
                          │ (Fast Analysis)  │
                          └──────┬───────────┘
                                 │
                                 ▼
                          ┌──────────────────┐
                          │ Follow-up        │
                          │ Question Ready   │
                          └──────┬───────────┘
                                 │
                                 ▼
                          ┌──────────────────┐
                          │ Bot Speaks       │
                          │ Follow-up        │
                          └──────────────────┘
```

### Bi-directional Conversation Flow

```
┌──────────────┐                    ┌──────────────┐
│    Bot       │                    │  Candidate   │
│  (Always     │◄───Audio Stream───►│  (Always     │
│  Listening)  │                    │  Listening)  │
└──────┬───────┘                    └──────┬───────┘
       │                                   │
       │                                   │
       ▼                                   ▼
┌──────────────┐                    ┌──────────────┐
│ VAD: Bot     │                    │ VAD:        │
│ Speaking?    │                    │ Candidate   │
│              │                    │ Speaking?   │
└──────┬───────┘                    └──────┬───────┘
       │                                   │
       │                                   │
       ▼                                   ▼
┌──────────────────────────────────────────────┐
│         Turn Management System               │
│  - Detects who should speak                   │
│  - Manages overlaps                           │
│  - Coordinates responses                     │
└──────────────────────────────────────────────┘
```

### Silence Handling & Intervention Flow

```
┌──────────────────┐
│ Question Asked   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Silence Monitor  │
│ (Tracks time)    │
└──────┬───────────┘
       │
       ├─ 7s silence ──► ┌──────────────────┐
       │                 │ Bot Intervention │
       │                 │ "Still thinking?"│
       │                 └──────┬───────────┘
       │                        │
       │                        ├─ Candidate: "Yes" ──► Wait more
       │                        │
       │                        ├─ Candidate: "No" ──► Move to next
       │                        │
       │                        └─ Candidate starts answering ──► Continue
       │
       ├─ 15s total silence ──► ┌──────────────────┐
       │                          │ Bot: "Move on?"  │
       │                          └──────┬───────────┘
       │                                 │
       │                                 ├─ Candidate: "Yes" ──► Next question
       │                                 │
       │                                 └─ Candidate: "No, let me try" ──► Continue
       │
       └─ 30s total silence ──► ┌──────────────────┐
                                │ Force Move      │
                                │ Next Question   │
                                └──────────────────┘
```

**Mid-way Recovery Flow:**
```
Candidate: "I need more time..."
  │
  ├─ [5 seconds pass]
  │
  └─ Candidate: "Actually, I think I can answer..."
      │
      ▼
┌──────────────────┐
│ Cancel Pending   │
│ Interventions    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Bot: "Go ahead!" │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Normal Answer    │
│ Flow Resumes     │
└──────────────────┘
```

### Interview Integrity & Question Handling Flow

```
┌──────────────────┐
│ Candidate        │
│ Speaks           │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Transcript Chunk │
│ Received         │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐      ┌──────────────────┐
│ Pattern-Based    │      │ Gemini-Based     │
│ Detection        │─────►│ Detection        │
│ (Fast)           │      │ (Accurate)       │
└──────┬───────────┘      └──────┬───────────┘
       │                          │
       └──────────┬───────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │ Intent           │
         │ Classification   │
         └──────┬───────────┘
                │
                ├─ Answering ──► Continue normally
                │
                ├─ Asking Question ──► ┌──────────────────┐
                │                      │ Bot Deflection   │
                │                      │ (Polite)         │
                │                      └──────┬───────────┘
                │                             │
                ├─ Requesting Answer ──►     │
                │                             │
                ├─ Role Reversal ──►         │
                │                             │
                └─ Legitimate Clarification ──► ┌──────────────────┐
                                                 │ Safe             │
                                                 │ Clarification    │
                                                 └──────────────────┘
                │
                ▼
         ┌──────────────────┐
         │ Log Security     │
         │ Event            │
         └──────┬───────────┘
                │
                ├─ Low Severity ──► Store in log
                │
                ├─ Medium Severity ──► Store + Flag
                │
                └─ High Severity ──► Store + Alert Recruiter
```

## Question Boundary Detection Strategy

### Method 1: Explicit Markers (Recommended)

**Implementation:**
- Bot emits `question-start` event when asking question
- Bot emits `question-end` event when question complete
- Candidate emits `answer-start` when beginning response
- Candidate emits `answer-end` when finishing response

**Advantages:**
- Clear boundaries
- Easy to implement
- Reliable

**Disadvantages:**
- Requires explicit events
- May need UI changes

### Method 2: Silence-Based Detection

**Implementation:**
- Detect silence periods (> 2 seconds)
- Analyze transcript for question patterns
- Use NLP to identify question boundaries

**Advantages:**
- Automatic
- No UI changes needed

**Disadvantages:**
- Less reliable
- May miss boundaries
- Complex to implement

### Method 3: Hybrid Approach (Best)

**Implementation:**
- Use explicit markers as primary method
- Use silence detection as fallback
- Validate with transcript analysis

**Advantages:**
- Reliable
- Automatic fallback
- Best of both worlds

## Storage & Retrieval Strategy

### Question-Level Storage

```javascript
{
  questionId: "q_123",
  questionText: "How would you design...",
  conversationTurns: [
    {
      turnId: "t_1",
      speaker: "bot",
      text: "How would you design...",
      timestamp: 1000,
      audioUrl: null // Bot uses TTS
    },
    {
      turnId: "t_2",
      speaker: "candidate",
      text: "I would start by...",
      timestamp: 5000,
      audioUrl: "/uploads/q_123/t_2_audio.webm",
      transcript: "I would start by..."
    },
    {
      turnId: "t_3",
      speaker: "bot",
      text: "Can you elaborate on...",
      timestamp: 15000,
      audioUrl: null
    }
  ],
  videoSegment: {
    startTime: 1000,
    endTime: 30000,
    videoUrl: "/uploads/q_123/segment.webm"
  },
  fullTranscript: "[Bot]: ...\n[Candidate]: ...\n[Bot]: ...",
  evaluation: {...},
  cheating: {...},
  interventionHistory: [
    {
      timestamp: 7000,
      type: "thinking_check",
      botMessage: "Are you still thinking about this?",
      candidateResponse: "Yes, just a moment",
      responseTimestamp: 7500
    },
    {
      timestamp: 15000,
      type: "suggest_move_on",
      botMessage: "No worries, we can move on if you'd like",
      candidateResponse: null,
      responseTimestamp: null
    }
  ],
  skipped: false,
  skipReason: null, // 'candidate_requested' | 'timeout' | 'max_silence' | null
  skippedAt: null,
  integrity: {
    questionAttempts: 2,
    deflectionHistory: [
      {
        timestamp: 8000,
        type: "answer_request",
        candidateQuestion: "Can you give me a hint?",
        botResponse: "I can't provide hints, but I'd love to hear your approach.",
        intent: {
          detected: "requesting_answer",
          confidence: 0.95
        }
      },
      {
        timestamp: 12000,
        type: "legitimate_clarification",
        candidateQuestion: "When you say scalable, do you mean horizontal or vertical?",
        botResponse: "Good question! I'm asking about scalability in general - you can discuss either approach.",
        intent: {
          detected: "legitimate_clarification",
          confidence: 0.88
        }
      }
    ],
    severity: "low", // 'low' | 'medium' | 'high'
    legitimateClarifications: 1
  }
}
```

### Security Log Storage

```javascript
{
  _id: ObjectId,
  interviewId: ObjectId,
  questionId: String,
  type: String, // 'candidate_question_attempt' | 'answer_request' | 'role_reversal'
  candidateQuestion: String,
  intent: {
    detected: String,
    confidence: Number,
    method: String // 'pattern' | 'gemini'
  },
  botResponse: String,
  severity: String, // 'low' | 'medium' | 'high'
  timestamp: Date,
  createdAt: Date
}
```

### Full Session Storage

```javascript
{
  interviewId: "...",
  fullSessionVideo: "/uploads/interview_123/full_session.webm",
  fullSessionTranscript: "...",
  questions: [
    { questionId: "q_1", ... },
    { questionId: "q_2", ... }
  ],
  metadata: {
    startTime: "...",
    endTime: "...",
    duration: 1800
  }
}
```

## Performance Considerations

### Latency Targets

- **Transcript chunk processing**: < 2 seconds
- **Follow-up question generation**: < 3 seconds
- **Bot response time**: < 1 second (after question ready)
- **Audio streaming latency**: < 500ms
- **Silence detection**: Real-time (1 second polling)
- **Intervention response**: < 500ms (from silence detection to bot speaking)
- **Response intent detection**: < 1 second (candidate response parsing)

### Optimization Strategies

1. **Use lightweight models** for real-time processing
2. **Cache common responses** (acknowledgments, transitions)
3. **Pre-generate questions** where possible
4. **Batch transcript chunks** (process every 2-3 seconds, not every chunk)
5. **Use CDN** for audio/video delivery
6. **Compress audio** before streaming

### Scalability

- **Horizontal scaling**: Stateless backend (JWT auth)
- **Load balancing**: Distribute WebSocket connections
- **Queue system**: Use Redis/RabbitMQ for processing queues
- **Database indexing**: Index by interviewId, questionId, timestamps

## Security & Privacy

### Audio/Video Security

- **Encryption**: Encrypt audio/video in transit (TLS)
- **Access control**: Verify interview access before streaming
- **Storage**: Secure storage with proper permissions
- **Retention**: Implement data retention policies

### Privacy Considerations

- **Transcript storage**: Store only necessary data
- **Audio retention**: Configurable retention periods
- **Access logs**: Log who accesses recordings
- **GDPR compliance**: Allow data deletion requests

## Testing Strategy

### Unit Tests

- Transcript chunk processing
- Question boundary detection
- Turn-taking logic
- VAD algorithms

### Integration Tests

- WebSocket communication
- Real-time transcript streaming
- Follow-up question generation
- Video segmentation
- Silence detection and intervention
- Candidate response intent parsing
- Question skipping flow
- Question intent detection (pattern-based and Gemini-based)
- Bot deflection responses
- Security event logging

### End-to-End Tests

- Full interview flow
- Bi-directional conversation
- Question segmentation
- Storage and retrieval
- Silence handling scenarios (7s, 15s, 30s thresholds)
- Mid-way answer recovery
- Question skip and recovery
- Candidate question attempts (direct questions, answer requests, role reversal)
- Legitimate vs revealing clarification handling
- Multiple question attempt escalation
- Security logging and recruiter alerts

## Rollout Plan

### Phase 1: MVP (4-6 weeks)

1. **Week 1-2**: Real-time transcript streaming
   - Implement transcript chunk streaming
   - Add fast Gemini text processing
   - Generate follow-up questions

2. **Week 3-4**: Basic bi-directional conversation + Silence handling
   - Implement VAD
   - Add turn-taking logic
   - Basic overlap handling
   - Implement silence detection and monitoring
   - Add bot intervention system (thinking check, suggest move on)
   - Handle candidate response intents

3. **Week 5-6**: Question segmentation + Interview integrity
   - Implement boundary detection
   - Store conversation turns
   - Extract video segments
   - Store intervention history
   - Handle question skipping gracefully
   - Implement question intent detection (pattern-based)
   - Add bot deflection responses
   - Basic security logging

### Phase 2: Enhancement (4-6 weeks)

1. **Advanced VAD**: Improve accuracy
2. **Better turn-taking**: More natural conversation
3. **WebRTC integration**: Lower latency
4. **Advanced segmentation**: Automatic boundary detection
5. **Gemini-based question detection**: More accurate intent classification
6. **Enhanced security logging**: Recruiter alerts and reporting
7. **Legitimate clarification handling**: Better distinction between safe and unsafe clarifications

### Phase 3: Polish (2-4 weeks)

1. **Performance optimization**
2. **UI/UX improvements**
3. **Error handling**
4. **Documentation**

## Success Metrics

### Technical Metrics

- **Follow-up question latency**: < 3 seconds
- **Audio streaming latency**: < 500ms
- **Transcript accuracy**: > 95%
- **System uptime**: > 99.9%
- **Silence detection accuracy**: > 98%
- **Intervention response time**: < 500ms
- **Question skip rate**: Track % of questions skipped (target: < 10%)
- **Question intent detection accuracy**: > 95%
- **Deflection response time**: < 1 second
- **False positive rate**: < 5% (legitimate answers flagged as questions)

### User Experience Metrics

- **Conversation naturalness**: User surveys
- **Interview completion rate**: Track completion %
- **Candidate satisfaction**: Post-interview surveys
- **Recruiter satisfaction**: Feedback on reports

### Business Metrics

- **Interview quality**: Better candidate assessment
- **Time savings**: Faster interviews
- **Cost efficiency**: Reduced API costs (optimization)
- **Adoption rate**: % of interviews using new features

## Risk Mitigation

### Technical Risks

1. **Latency issues**: Use CDN, optimize models
2. **Audio quality**: Implement noise reduction
3. **Transcription errors**: Use multiple models, fallbacks
4. **Scalability**: Design for horizontal scaling

### User Experience Risks

1. **Confusion**: Clear UI indicators
2. **Interruptions**: Smart turn-taking
3. **Technical issues**: Graceful fallbacks
4. **Accessibility**: Support for different devices

## Conclusion

This strategy provides a comprehensive approach to transforming HireCorrecto into a real-time, bi-directional conversational AI interview platform. The phased approach allows for incremental development and testing, while the dual processing pipeline ensures both real-time responsiveness and detailed analysis.

Key benefits:
- **Real-time follow-ups**: More natural, contextual conversations
- **Bi-directional flow**: Feels like a real interview
- **Better segmentation**: Clear question boundaries
- **Improved UX**: More engaging for candidates
- **Better assessment**: More accurate evaluation through natural conversation
- **Intelligent silence handling**: Proactive bot interventions prevent awkward silences
- **Graceful recovery**: Candidates can recover mid-way, making interviews less stressful
- **Natural conversation flow**: Handles real-world scenarios like thinking time and question skipping
- **Interview integrity**: Protects assessment quality by gracefully handling candidate question attempts
- **Security & compliance**: Comprehensive logging and monitoring of integrity events

The implementation should be done incrementally, starting with real-time transcript processing, then adding bi-directional conversation, and finally polishing the segmentation and storage.

