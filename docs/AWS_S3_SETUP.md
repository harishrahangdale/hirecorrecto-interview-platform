# AWS S3 Setup Guide for File Storage

This guide will help you set up AWS S3 for persistent file storage on Render, preventing data loss when the service restarts.

## Why S3?

- ✅ **Persistent Storage**: Files survive service restarts
- ✅ **Scalable**: Handles any amount of data
- ✅ **Reliable**: 99.999999999% (11 9's) durability
- ✅ **Cost-Effective**: Pay only for what you use
- ✅ **CDN Support**: Can use CloudFront for faster delivery

## Step 1: Create AWS Account

1. Go to [AWS Console](https://aws.amazon.com/console/)
2. Sign up or sign in
3. Complete account setup (credit card required, but free tier available)

## Step 2: Create S3 Bucket

1. Go to [S3 Console](https://console.aws.amazon.com/s3/)
2. Click "Create bucket"
3. Configure:
   - **Bucket name**: `hirecorrecto-uploads` (must be globally unique)
   - **Region**: Choose closest to your users (e.g., `us-east-1`)
   - **Block Public Access**: Keep enabled (we'll use private buckets)
   - **Versioning**: Optional (recommended for production)
   - **Encryption**: Enable (SSE-S3 is fine)
4. Click "Create bucket"

## Step 3: Create IAM User for S3 Access

1. Go to [IAM Console](https://console.aws.amazon.com/iam/)
2. Click "Users" → "Create user"
3. **User name**: `hirecorrecto-s3-user`
4. **Access type**: "Programmatic access"
5. Click "Next: Permissions"

### Create Policy

1. Click "Attach policies directly"
2. Click "Create policy"
3. Click "JSON" tab and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name/*",
        "arn:aws:s3:::your-bucket-name"
      ]
    }
  ]
}
```

4. Replace `your-bucket-name` with your actual bucket name
5. Click "Next" → Name it `HireCorrectoS3Policy` → "Create policy"
6. Go back to user creation, refresh, and attach the policy
7. Click "Next" → "Create user"

### Save Credentials

1. **IMPORTANT**: Copy the Access Key ID and Secret Access Key
2. Store them securely (you won't see the secret again)
3. These are your `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

## Step 4: Configure Environment Variables

In your Render dashboard, add these environment variables:

```env
STORAGE_BACKEND=s3
AWS_ACCESS_KEY_ID=your_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

**Optional (for CDN):**
```env
AWS_CLOUDFRONT_URL=https://your-cloudfront-domain.cloudfront.net
```

## Step 5: Test the Setup

1. Deploy your service on Render
2. Upload a test video through your application
3. Check S3 bucket - you should see the file in:
   ```
   interviews/{interviewId}/questions/{questionId}/{filename}
   ```

## Step 6: (Optional) Set Up CloudFront CDN

For faster video delivery:

1. Go to [CloudFront Console](https://console.aws.amazon.com/cloudfront/)
2. Click "Create distribution"
3. **Origin domain**: Select your S3 bucket
4. **Origin access**: "Origin access control settings"
5. **Viewer protocol policy**: "Redirect HTTP to HTTPS"
6. Click "Create distribution"
7. Wait for deployment (5-10 minutes)
8. Copy the distribution domain name
9. Add to Render: `AWS_CLOUDFRONT_URL=https://your-distribution.cloudfront.net`

## Cost Estimation

### S3 Pricing (us-east-1, as of 2024)

- **Storage**: $0.023 per GB/month (first 50TB)
- **PUT requests**: $0.005 per 1,000 requests
- **GET requests**: $0.0004 per 1,000 requests

### Example Monthly Cost

For 100 interviews with 5 videos each (avg 10MB):
- Storage: 5GB × $0.023 = **$0.12/month**
- PUT requests: 500 × $0.005/1000 = **$0.003**
- GET requests: 2000 × $0.0004/1000 = **$0.0008**

**Total: ~$0.12/month** (very affordable!)

### Free Tier

- 5GB storage for 12 months
- 20,000 GET requests
- 2,000 PUT requests

## Security Best Practices

1. **Never commit credentials** to git
2. **Use IAM roles** in production (if using EC2/ECS)
3. **Enable bucket versioning** for recovery
4. **Set up lifecycle policies** to delete old files
5. **Use CloudFront** for public access (if needed)
6. **Enable access logging** for audit trails

## Troubleshooting

### "Access Denied" Error

- Check IAM policy includes your bucket name
- Verify bucket name matches `AWS_S3_BUCKET`
- Ensure IAM user has correct permissions

### Files Not Appearing

- Check bucket region matches `AWS_REGION`
- Verify credentials are correct
- Check Render logs for errors

### High Costs

- Set up lifecycle policies to delete old files
- Use S3 Intelligent-Tiering for automatic optimization
- Consider S3 Glacier for archival

## Alternative: Other Cloud Storage Options

### Google Cloud Storage
- Similar to S3
- Use `@google-cloud/storage` package
- Similar pricing

### Cloudinary
- Great for media (images/videos)
- Has free tier
- Built-in transformations
- Use `cloudinary` package

### Azure Blob Storage
- Microsoft's equivalent
- Use `@azure/storage-blob` package

## Migration from Local to S3

If you already have files in local storage:

1. Keep `STORAGE_BACKEND=local` temporarily
2. Write a migration script to upload existing files to S3
3. Update database records with new S3 URLs
4. Switch to `STORAGE_BACKEND=s3`
5. Delete local files

---

**Your files are now safe from Render restarts!** 🎉

