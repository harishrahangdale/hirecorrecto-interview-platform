const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const storageService = require('../services/storage');

const router = express.Router();

// Configure multer based on storage backend
const storageBackend = process.env.STORAGE_BACKEND || 'local';

let multerStorage;
if (storageBackend === 's3') {
  // Use memory storage for S3 (upload to memory, then to S3)
  multerStorage = multer.memoryStorage();
} else {
  // Use disk storage for local filesystem
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  multerStorage = multer.diskStorage({
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
}

const upload = multer({
  storage: multerStorage,
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
    
    // For S3, you could generate a presigned URL here
    // For now, return the standard upload endpoint
    const uploadUrl = `/api/upload/${interviewId}/${questionId}`;
    
    res.json({
      uploadUrl,
      uploadId,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedTypes: ['video/webm', 'video/mp4', 'video/avi', 'video/mov'],
      storageBackend: storageBackend
    });
  } catch (error) {
    console.error('Generate upload URL error:', error);
    res.status(500).json({ message: 'Server error generating upload URL' });
  }
});

// Upload video file (question-specific or full session)
router.post('/:interviewId/:questionId', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    const { interviewId, questionId } = req.params;
    const isFullSession = req.body.isFullSession === 'true' || req.body.isFullSession === true;
    
    let uploadResult;
    
    if (storageBackend === 's3') {
      // Upload to S3 from memory buffer
      uploadResult = await storageService.uploadFile(
        req.file.buffer,
        interviewId,
        questionId,
        req.file.originalname,
        isFullSession
      );
    } else {
      // Local storage - file already saved by multer
      const baseUrl = process.env.API_URL || req.protocol + '://' + req.get('host');
      
      if (isFullSession) {
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        const fullSessionPath = path.join(uploadDir, interviewId, 'full-session');
        if (!fs.existsSync(fullSessionPath)) {
          fs.mkdirSync(fullSessionPath, { recursive: true });
        }
        
        // Move file to full-session directory
        const newPath = path.join(fullSessionPath, req.file.filename);
        fs.renameSync(req.file.path, newPath);
        
        uploadResult = {
          filename: req.file.filename,
          fileUrl: `${baseUrl}/uploads/${interviewId}/full-session/${req.file.filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype,
          isFullSession: true
        };
      } else {
        uploadResult = {
          filename: req.file.filename,
          fileUrl: `${baseUrl}/uploads/${interviewId}/${questionId}/${req.file.filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype,
          isFullSession: false
        };
      }
    }
    
    res.json({
      message: 'Video uploaded successfully',
      ...uploadResult
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      message: 'Server error uploading file',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete uploaded file
router.delete('/:interviewId/:questionId/:filename', async (req, res) => {
  try {
    const { interviewId, questionId, filename } = req.params;
    const isFullSession = req.query.isFullSession === 'true';
    
    await storageService.deleteFile(interviewId, questionId, filename, isFullSession);
    
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    if (error.message === 'File not found') {
      return res.status(404).json({ message: 'File not found' });
    }
    res.status(500).json({ message: 'Server error deleting file' });
  }
});

// Get file info
router.get('/:interviewId/:questionId/:filename', async (req, res) => {
  try {
    const { interviewId, questionId, filename } = req.params;
    const isFullSession = req.query.isFullSession === 'true';
    
    const fileInfo = await storageService.getFileInfo(interviewId, questionId, filename, isFullSession);
    
    // If S3 and file is private, generate signed URL
    if (storageBackend === 's3' && fileInfo.storage === 's3') {
      try {
        const fileKey = storageService.generateFilePath(interviewId, questionId, filename, isFullSession);
        fileInfo.signedUrl = await storageService.getSignedUrl(fileKey);
      } catch (error) {
        console.warn('Could not generate signed URL:', error.message);
      }
    }
    
    res.json(fileInfo);
  } catch (error) {
    console.error('Get file info error:', error);
    if (error.message === 'File not found') {
      return res.status(404).json({ message: 'File not found' });
    }
    res.status(500).json({ message: 'Server error getting file info' });
  }
});

module.exports = router;
