const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class StorageService {
  constructor() {
    this.backend = process.env.STORAGE_BACKEND || 'local';
    
    if (this.backend === 's3') {
      this.initializeS3();
    } else if (this.backend === 'azure') {
      this.initializeAzure();
    } else {
      this.initializeLocal();
    }
  }

  initializeS3() {
    // Lazy load AWS SDK only when S3 is used
    let AWS;
    try {
      AWS = require('aws-sdk');
    } catch (error) {
      console.error('aws-sdk not installed. Install it with: npm install aws-sdk');
      console.warn('Falling back to local storage.');
      this.backend = 'local';
      this.initializeLocal();
      return;
    }
    
    // Configure AWS S3
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    this.bucketName = process.env.AWS_S3_BUCKET;
    this.cdnUrl = process.env.AWS_CLOUDFRONT_URL || null; // Optional CloudFront CDN URL
    
    if (!this.bucketName) {
      console.warn('AWS_S3_BUCKET not set. Falling back to local storage.');
      this.backend = 'local';
      this.initializeLocal();
      return;
    }
    
    console.log(`Storage backend: S3 (bucket: ${this.bucketName})`);
  }

  initializeAzure() {
    // Lazy load Azure SDK only when Azure is used
    let AzureStorageBlob;
    try {
      AzureStorageBlob = require('@azure/storage-blob');
    } catch (error) {
      console.error('@azure/storage-blob not installed. Install it with: npm install @azure/storage-blob');
      console.warn('Falling back to local storage.');
      this.backend = 'local';
      this.initializeLocal();
      return;
    }
    
    // Get Azure configuration
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
    const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    
    // Azure requires either connection string OR account name + key
    if (!connectionString && (!accountName || !accountKey)) {
      console.warn('Azure storage credentials not set. Falling back to local storage.');
      console.warn('Provide either AZURE_STORAGE_CONNECTION_STRING or both AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY');
      this.backend = 'local';
      this.initializeLocal();
      return;
    }
    
    if (!containerName) {
      console.warn('AZURE_STORAGE_CONTAINER_NAME not set. Falling back to local storage.');
      this.backend = 'local';
      this.initializeLocal();
      return;
    }
    
    // Initialize Azure Blob Service Client
    let blobServiceClient;
    if (connectionString) {
      blobServiceClient = AzureStorageBlob.BlobServiceClient.fromConnectionString(connectionString);
    } else {
      const sharedKeyCredential = new AzureStorageBlob.StorageSharedKeyCredential(accountName, accountKey);
      const blobServiceUrl = `https://${accountName}.blob.core.windows.net`;
      blobServiceClient = new AzureStorageBlob.BlobServiceClient(blobServiceUrl, sharedKeyCredential);
    }
    
    this.blobServiceClient = blobServiceClient;
    this.containerName = containerName;
    this.containerClient = blobServiceClient.getContainerClient(containerName);
    this.cdnUrl = process.env.AZURE_CDN_URL || null; // Optional CDN URL
    
    // Ensure container exists (fire-and-forget, will be created on first use if it fails here)
    this.ensureContainerExists().catch(error => {
      console.warn('Could not ensure Azure container exists during initialization:', error.message);
      console.warn('Container will be created automatically on first upload if it does not exist.');
    });
    
    console.log(`Storage backend: Azure Blob Storage (container: ${this.containerName})`);
  }

  async ensureContainerExists() {
    try {
      // Omit access parameter for private container (default behavior)
      // Azure Blob Storage only accepts "container" or "blob" for public access
      // Private containers use SAS URLs for access
      await this.containerClient.createIfNotExists();
    } catch (error) {
      console.error('Error ensuring Azure container exists:', error);
      // Don't throw - let it be created on first upload if needed
    }
  }

  initializeLocal() {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    this.uploadDir = uploadDir;
    console.log(`Storage backend: Local (directory: ${this.uploadDir})`);
  }

  /**
   * Generate a file path/key for storage
   */
  generateFilePath(interviewId, questionId, filename, isFullSession = false) {
    if (isFullSession) {
      return `interviews/${interviewId}/full-session/${filename}`;
    }
    return `interviews/${interviewId}/questions/${questionId}/${filename}`;
  }

  /**
   * Upload file to storage
   */
  async uploadFile(fileBuffer, interviewId, questionId, originalFilename, isFullSession = false) {
    const fileExtension = path.extname(originalFilename);
    const uniqueFilename = `${uuidv4()}-${Date.now()}${fileExtension}`;
    const fileKey = this.generateFilePath(interviewId, questionId, uniqueFilename, isFullSession);

    if (this.backend === 's3') {
      return await this.uploadToS3(fileBuffer, fileKey, originalFilename);
    } else if (this.backend === 'azure') {
      return await this.uploadToAzure(fileBuffer, fileKey, originalFilename);
    } else {
      return await this.uploadToLocal(fileBuffer, interviewId, questionId, uniqueFilename, isFullSession);
    }
  }

  /**
   * Upload to AWS S3
   */
  async uploadToS3(fileBuffer, fileKey, originalFilename) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: fileKey,
        Body: fileBuffer,
        ContentType: 'video/webm', // Adjust based on file type
        ACL: 'private', // Private by default, use signed URLs for access
        Metadata: {
          originalFilename: originalFilename,
          uploadedAt: new Date().toISOString()
        }
      };

      const result = await this.s3.upload(params).promise();
      
      // Generate URL (use CloudFront if available, otherwise S3 URL)
      const fileUrl = this.cdnUrl 
        ? `${this.cdnUrl}/${fileKey}`
        : result.Location;

      return {
        filename: path.basename(fileKey),
        fileUrl: fileUrl,
        fileKey: fileKey,
        size: fileBuffer.length,
        storage: 's3',
        bucket: this.bucketName
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error(`Failed to upload to S3: ${error.message}`);
    }
  }

  /**
   * Upload to Azure Blob Storage
   */
  async uploadToAzure(fileBuffer, fileKey, originalFilename) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileKey);
      
      // Upload file to Azure Blob Storage
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: 'video/webm' // Adjust based on file type
        },
        metadata: {
          originalFilename: originalFilename,
          uploadedAt: new Date().toISOString()
        }
      });
      
      // Generate URL (use CDN if available, otherwise blob URL)
      const fileUrl = this.cdnUrl 
        ? `${this.cdnUrl}/${fileKey}`
        : blockBlobClient.url;

      return {
        filename: path.basename(fileKey),
        fileUrl: fileUrl,
        fileKey: fileKey,
        size: fileBuffer.length,
        storage: 'azure',
        container: this.containerName
      };
    } catch (error) {
      console.error('Azure upload error:', error);
      throw new Error(`Failed to upload to Azure: ${error.message}`);
    }
  }

  /**
   * Upload to local filesystem
   */
  async uploadToLocal(fileBuffer, interviewId, questionId, filename, isFullSession) {
    try {
      let uploadPath;
      
      if (isFullSession) {
        uploadPath = path.join(this.uploadDir, interviewId, 'full-session');
      } else {
        uploadPath = path.join(this.uploadDir, interviewId, questionId);
      }

      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      const filePath = path.join(uploadPath, filename);
      fs.writeFileSync(filePath, fileBuffer);

      const baseUrl = process.env.API_URL || 'http://localhost:5004';
      const relativePath = isFullSession
        ? `uploads/${interviewId}/full-session/${filename}`
        : `uploads/${interviewId}/${questionId}/${filename}`;
      
      const fileUrl = `${baseUrl}/${relativePath}`;

      return {
        filename: filename,
        fileUrl: fileUrl,
        filePath: filePath,
        size: fileBuffer.length,
        storage: 'local'
      };
    } catch (error) {
      console.error('Local upload error:', error);
      throw new Error(`Failed to upload to local storage: ${error.message}`);
    }
  }

  /**
   * Get signed URL for S3 or Azure file (for private files)
   */
  async getSignedUrl(fileKey, expiresIn = 3600) {
    if (this.backend === 's3') {
      try {
        const params = {
          Bucket: this.bucketName,
          Key: fileKey,
          Expires: expiresIn // URL expires in 1 hour by default
        };

        const url = await this.s3.getSignedUrlPromise('getObject', params);
        return url;
      } catch (error) {
        console.error('Error generating signed URL:', error);
        throw new Error(`Failed to generate signed URL: ${error.message}`);
      }
    } else if (this.backend === 'azure') {
      try {
        const AzureStorageBlob = require('@azure/storage-blob');
        const blockBlobClient = this.containerClient.getBlockBlobClient(fileKey);
        
        // Generate SAS URL (Shared Access Signature)
        const expiresOn = new Date();
        expiresOn.setSeconds(expiresOn.getSeconds() + expiresIn);
        
        const sasUrl = await blockBlobClient.generateSasUrl({
          permissions: AzureStorageBlob.BlobSASPermissions.parse('r'), // Read permission
          expiresOn: expiresOn
        });
        
        return sasUrl;
      } catch (error) {
        console.error('Error generating Azure signed URL:', error);
        throw new Error(`Failed to generate Azure signed URL: ${error.message}`);
      }
    } else {
      throw new Error('Signed URLs only available for S3 or Azure storage');
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(interviewId, questionId, filename, isFullSession = false) {
    const fileKey = this.generateFilePath(interviewId, questionId, filename, isFullSession);

    if (this.backend === 's3') {
      return await this.deleteFromS3(fileKey);
    } else if (this.backend === 'azure') {
      return await this.deleteFromAzure(fileKey);
    } else {
      return await this.deleteFromLocal(interviewId, questionId, filename, isFullSession);
    }
  }

  /**
   * Delete from S3
   */
  async deleteFromS3(fileKey) {
    try {
      await this.s3.deleteObject({
        Bucket: this.bucketName,
        Key: fileKey
      }).promise();
      return { success: true, storage: 's3' };
    } catch (error) {
      console.error('S3 delete error:', error);
      throw new Error(`Failed to delete from S3: ${error.message}`);
    }
  }

  /**
   * Delete from Azure Blob Storage
   */
  async deleteFromAzure(fileKey) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileKey);
      await blockBlobClient.delete();
      return { success: true, storage: 'azure' };
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error('File not found');
      }
      console.error('Azure delete error:', error);
      throw new Error(`Failed to delete from Azure: ${error.message}`);
    }
  }

  /**
   * Delete from local filesystem
   */
  async deleteFromLocal(interviewId, questionId, filename, isFullSession) {
    try {
      let filePath;
      
      if (isFullSession) {
        filePath = path.join(this.uploadDir, interviewId, 'full-session', filename);
      } else {
        filePath = path.join(this.uploadDir, interviewId, questionId, filename);
      }

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return { success: true, storage: 'local' };
      } else {
        throw new Error('File not found');
      }
    } catch (error) {
      console.error('Local delete error:', error);
      throw new Error(`Failed to delete from local storage: ${error.message}`);
    }
  }

  /**
   * Get file info
   */
  async getFileInfo(interviewId, questionId, filename, isFullSession = false) {
    const fileKey = this.generateFilePath(interviewId, questionId, filename, isFullSession);

    if (this.backend === 's3') {
      return await this.getS3FileInfo(fileKey);
    } else if (this.backend === 'azure') {
      return await this.getAzureFileInfo(fileKey);
    } else {
      return await this.getLocalFileInfo(interviewId, questionId, filename, isFullSession);
    }
  }

  /**
   * Get S3 file info
   */
  async getS3FileInfo(fileKey) {
    try {
      const result = await this.s3.headObject({
        Bucket: this.bucketName,
        Key: fileKey
      }).promise();

      return {
        filename: path.basename(fileKey),
        size: result.ContentLength,
        contentType: result.ContentType,
        lastModified: result.LastModified,
        storage: 's3'
      };
    } catch (error) {
      if (error.code === 'NotFound') {
        throw new Error('File not found');
      }
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * Get Azure file info
   */
  async getAzureFileInfo(fileKey) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileKey);
      const properties = await blockBlobClient.getProperties();

      return {
        filename: path.basename(fileKey),
        size: properties.contentLength,
        contentType: properties.contentType,
        lastModified: properties.lastModified,
        storage: 'azure',
        metadata: properties.metadata
      };
    } catch (error) {
      if (error.statusCode === 404) {
        throw new Error('File not found');
      }
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * Get local file info
   */
  async getLocalFileInfo(interviewId, questionId, filename, isFullSession) {
    try {
      let filePath;
      
      if (isFullSession) {
        filePath = path.join(this.uploadDir, interviewId, 'full-session', filename);
      } else {
        filePath = path.join(this.uploadDir, interviewId, questionId, filename);
      }

      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return {
          filename: filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          storage: 'local'
        };
      } else {
        throw new Error('File not found');
      }
    } catch (error) {
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }
}

// Export singleton instance
module.exports = new StorageService();

