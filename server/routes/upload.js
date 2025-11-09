const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const interviewId = req.params.interviewId;
    const questionId = req.params.questionId;
    
    if (!interviewId || !questionId) {
      return cb(new Error('Interview ID and Question ID are required'), null);
    }
    
    const uploadPath = path.join(uploadDir, interviewId, questionId);
    
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Allow video files (including webm with codecs)
    const allowedTypes = ['video/webm', 'video/mp4', 'video/avi', 'video/mov'];
    // Check if mimetype starts with any allowed type (to handle codecs like video/webm;codecs=vp9,opus)
    const isAllowed = allowedTypes.some(type => file.mimetype.startsWith(type));
    if (isAllowed) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'), false);
    }
  }
});

// Get signed upload URL (for client-side uploads)
router.get('/url/:interviewId/:questionId', (req, res) => {
  try {
    const { interviewId, questionId } = req.params;
    const uploadId = uuidv4();
    
    // In a real implementation, you might want to:
    // 1. Generate a signed URL for cloud storage (S3, Azure, etc.)
    // 2. Set expiration time
    // 3. Validate permissions
    
    const uploadUrl = `/api/upload/${interviewId}/${questionId}`;
    
    res.json({
      uploadUrl,
      uploadId,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedTypes: ['video/webm', 'video/mp4', 'video/avi', 'video/mov']
    });
  } catch (error) {
    console.error('Generate upload URL error:', error);
    res.status(500).json({ message: 'Server error generating upload URL' });
  }
});

// Upload video file (question-specific or full session)
router.post('/:interviewId/:questionId', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    const { interviewId, questionId } = req.params;
    const isFullSession = req.body.isFullSession === 'true' || req.body.isFullSession === true;
    
    // Return absolute URL for better compatibility with video players
    const baseUrl = process.env.API_URL || req.protocol + '://' + req.get('host');
    
    // For full session videos, store in a special directory
    if (isFullSession) {
      const fullSessionPath = path.join(uploadDir, interviewId, 'full-session');
      if (!fs.existsSync(fullSessionPath)) {
        fs.mkdirSync(fullSessionPath, { recursive: true });
      }
      
      // Move file to full-session directory
      const newPath = path.join(fullSessionPath, req.file.filename);
      fs.renameSync(req.file.path, newPath);
      
      const fileUrl = `${baseUrl}/uploads/${interviewId}/full-session/${req.file.filename}`;
      
      return res.json({
        message: 'Full session video uploaded successfully',
        fileUrl,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        isFullSession: true
      });
    }
    
    // Regular question-specific video
    const fileUrl = `${baseUrl}/uploads/${interviewId}/${questionId}/${req.file.filename}`;
    
    res.json({
      message: 'Video uploaded successfully',
      fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      isFullSession: false
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server error uploading file' });
  }
});

// Upload multiple files (for batch uploads)
router.post('/:interviewId/:questionId/batch', upload.array('videos', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No video files uploaded' });
    }

    const { interviewId, questionId } = req.params;
    const uploadedFiles = req.files.map(file => ({
      fileUrl: `/uploads/${interviewId}/${questionId}/${file.filename}`,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype
    }));
    
    res.json({
      message: 'Videos uploaded successfully',
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Batch upload error:', error);
    res.status(500).json({ message: 'Server error uploading files' });
  }
});

// Delete uploaded file
router.delete('/:interviewId/:questionId/:filename', (req, res) => {
  try {
    const { interviewId, questionId, filename } = req.params;
    const filePath = path.join(uploadDir, interviewId, questionId, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ message: 'File deleted successfully' });
    } else {
      res.status(404).json({ message: 'File not found' });
    }
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ message: 'Server error deleting file' });
  }
});

// Get file info
router.get('/:interviewId/:questionId/:filename', (req, res) => {
  try {
    const { interviewId, questionId, filename } = req.params;
    const filePath = path.join(uploadDir, interviewId, questionId, filename);
    
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      res.json({
        filename,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        fileUrl: `/uploads/${interviewId}/${questionId}/${filename}`
      });
    } else {
      res.status(404).json({ message: 'File not found' });
    }
  } catch (error) {
    console.error('Get file info error:', error);
    res.status(500).json({ message: 'Server error getting file info' });
  }
});

module.exports = router;
