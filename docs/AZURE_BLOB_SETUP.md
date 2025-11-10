# Azure Blob Storage Setup Guide for File Storage

This guide will help you set up Azure Blob Storage for persistent file storage on Render, preventing data loss when the service restarts.

## Why Azure Blob Storage?

- ✅ **Persistent Storage**: Files survive service restarts
- ✅ **Scalable**: Handles any amount of data
- ✅ **Reliable**: 99.999999999% (11 9's) durability
- ✅ **Cost-Effective**: Pay only for what you use
- ✅ **CDN Support**: Can use Azure CDN for faster delivery
- ✅ **Global Availability**: Multiple regions worldwide
- ✅ **Integrated**: Works seamlessly with other Azure services

## Step 1: Create Azure Account

1. Go to [Azure Portal](https://portal.azure.com/)
2. Sign up or sign in
3. Complete account setup (credit card required, but free tier available)
4. You get $200 free credit for the first 30 days

## Step 2: Create Storage Account

1. Go to [Azure Portal](https://portal.azure.com/)
2. Click "Create a resource" → Search for "Storage account" → Click "Create"
3. Configure the **Basics** tab:
   - **Subscription**: Select your subscription
   - **Resource group**: Create new or use existing (e.g., `hirecorrecto-rg`)
   - **Storage account name**: `hirecorrectouploads` (must be globally unique, 3-24 chars, lowercase)
   - **Region**: Choose closest to your users (e.g., `East US`)
   - **Performance**: Standard (recommended for cost-effectiveness)
   - **Redundancy**: LRS (Locally Redundant Storage) for cost, or GRS (Geo-Redundant) for higher availability
4. Click "Review + create" → "Create"
5. Wait for deployment (1-2 minutes)

## Step 3: Create Blob Container

1. Go to your Storage Account in Azure Portal
2. In the left menu, click "Containers" under "Data storage"
3. Click "+ Container"
4. Configure:
   - **Name**: `interviews` (or your preferred name)
   - **Public access level**: Private (recommended for security)
5. Click "Create"

## Step 4: Get Access Credentials

You have two options for authentication:

### Option 1: Connection String (Recommended - Easier)

1. Go to your Storage Account in Azure Portal
2. In the left menu, click "Access keys" under "Security + networking"
3. Under "key1" or "key2", click "Show" next to "Connection string"
4. Click the copy icon to copy the connection string
5. This is your `AZURE_STORAGE_CONNECTION_STRING`

### Option 2: Account Name + Key (More Control)

1. Go to your Storage Account in Azure Portal
2. In the left menu, click "Access keys" under "Security + networking"
3. Copy:
   - **Storage account name**: This is your `AZURE_STORAGE_ACCOUNT_NAME`
   - **key1** or **key2**: Click "Show" and copy - This is your `AZURE_STORAGE_ACCOUNT_KEY`

**Security Note**: You can use either key1 or key2. If one is compromised, you can regenerate it without affecting the other.

## Step 5: Configure Environment Variables

In your Render dashboard (or `.env` file for local development), add these environment variables:

### Using Connection String (Option 1):

```env
STORAGE_BACKEND=azure
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=your_account;AccountKey=your_key;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER_NAME=interviews
```

### Using Account Name + Key (Option 2):

```env
STORAGE_BACKEND=azure
AZURE_STORAGE_ACCOUNT_NAME=your_storage_account_name
AZURE_STORAGE_ACCOUNT_KEY=your_storage_account_key
AZURE_STORAGE_CONTAINER_NAME=interviews
```

**Optional (for CDN):**
```env
AZURE_CDN_URL=https://your-cdn-domain.azureedge.net
```

## Step 6: Test the Setup

1. Deploy your service on Render (or run locally)
2. Upload a test video through your application
3. Check Azure Portal → Storage Account → Containers → Your container
4. You should see the file in:
   ```
   interviews/{interviewId}/questions/{questionId}/{filename}
   ```

## Step 7: (Optional) Set Up Azure CDN

For faster video delivery:

1. Go to [Azure Portal](https://portal.azure.com/)
2. Click "Create a resource" → Search for "CDN" → Click "Create"
3. Configure:
   - **Subscription**: Select your subscription
   - **Resource group**: Same as storage account
   - **CDN profile name**: `hirecorrecto-cdn`
   - **Pricing tier**: Standard Microsoft (or Premium Verizon for better performance)
   - **Create new CDN endpoint**: Yes
   - **Endpoint name**: `hirecorrecto-endpoint`
   - **Origin type**: Storage
   - **Origin hostname**: Select your storage account
   - **Origin path**: Leave empty (or specify container path)
   - **Origin host header**: Same as origin hostname
4. Click "Create"
5. Wait for deployment (10-15 minutes for CDN to propagate)
6. Copy the endpoint URL (e.g., `https://hirecorrecto-endpoint.azureedge.net`)
7. Add to Render: `AZURE_CDN_URL=https://your-endpoint.azureedge.net`

## Cost Estimation

### Azure Blob Storage Pricing (East US, as of 2024)

- **Hot Tier Storage**: $0.0184 per GB/month (first 50TB)
- **Cool Tier Storage**: $0.01 per GB/month (for infrequently accessed data)
- **Archive Tier Storage**: $0.00099 per GB/month (for long-term archival)
- **Write operations**: $0.05 per 10,000 transactions
- **Read operations**: $0.004 per 10,000 transactions
- **Data transfer out**: First 5GB free, then $0.087 per GB

### Example Monthly Cost

For 100 interviews with 5 videos each (avg 10MB):
- Storage (Hot tier): 5GB × $0.0184 = **$0.092/month**
- Write operations: 500 × $0.05/10,000 = **$0.0025**
- Read operations: 2000 × $0.004/10,000 = **$0.0008**
- Data transfer: 2GB × $0.087 = **$0.174** (if over free tier)

**Total: ~$0.27/month** (very affordable!)

### Free Tier

- **12 months free**: 5GB storage, 20,000 read operations, 10,000 write operations
- **Always free**: 5GB storage (after 12 months)

## Storage Tiers

Azure offers different storage tiers for cost optimization:

### Hot Tier (Default)
- Best for frequently accessed data
- Higher storage cost, lower access cost
- Use for: Active interview videos

### Cool Tier
- Best for infrequently accessed data (30+ days)
- Lower storage cost, higher access cost
- Use for: Old interview archives

### Archive Tier
- Best for rarely accessed data (180+ days)
- Lowest storage cost, highest access cost
- Use for: Long-term compliance storage

**Note**: You can set up lifecycle management policies to automatically move files between tiers.

## Security Best Practices

1. **Never commit credentials** to git
   - Use environment variables only
   - Add `.env` to `.gitignore`

2. **Use Managed Identity** in production (if using Azure services)
   - More secure than connection strings
   - No keys to manage

3. **Enable soft delete** for blob recovery
   - Go to Storage Account → Data protection
   - Enable "Soft delete for blobs"

4. **Set up lifecycle policies** to delete old files
   - Go to Storage Account → Lifecycle management
   - Create rules for automatic cleanup

5. **Use private containers** with SAS URLs
   - Containers are private by default
   - Generate SAS URLs for temporary access

6. **Enable access logging** for audit trails
   - Go to Storage Account → Insights
   - Enable logging

7. **Use Azure Key Vault** for production
   - Store connection strings securely
   - Rotate keys automatically

8. **Enable firewall rules** (if needed)
   - Restrict access to specific IPs
   - Go to Storage Account → Networking

## Troubleshooting

### "Container Not Found" Error

- Check container name matches `AZURE_STORAGE_CONTAINER_NAME`
- Container will be auto-created on first upload if it doesn't exist
- Verify container exists in Azure Portal

### "Authentication Failed" Error

- Verify connection string is complete and correct
- Check account name and key match (if using Option 2)
- Ensure you copied the entire connection string (it's long!)

### "Access Denied" Error

- Check storage account firewall settings
- Verify you're using the correct access key
- Ensure container access level allows your operations

### Files Not Appearing

- Check container name is correct
- Verify credentials are correct
- Check Render logs for detailed errors
- Ensure storage account region is accessible

### High Costs

- Set up lifecycle policies to move old files to Cool/Archive tier
- Enable blob versioning only if needed
- Use Azure Storage Explorer to identify large files
- Consider deleting old interview data

### Connection String Format Issues

The connection string should look like:
```
DefaultEndpointsProtocol=https;AccountName=your_account;AccountKey=your_key==;EndpointSuffix=core.windows.net
```

Make sure:
- No extra spaces
- All parts are present
- Account key includes `==` at the end (if present)

## Migration from Local to Azure

If you already have files in local storage:

1. Keep `STORAGE_BACKEND=local` temporarily
2. Write a migration script to upload existing files to Azure
3. Update database records with new Azure URLs
4. Switch to `STORAGE_BACKEND=azure`
5. Delete local files

### Sample Migration Script

```javascript
const storageService = require('./services/storage');
const fs = require('fs');
const path = require('path');

// Set STORAGE_BACKEND=azure in .env before running
async function migrateFiles() {
  const localDir = './uploads';
  // ... implement migration logic
}
```

## Comparison: Azure vs AWS S3

| Feature | Azure Blob Storage | AWS S3 |
|---------|-------------------|--------|
| Storage Cost (Hot) | $0.0184/GB/month | $0.023/GB/month |
| Free Tier | 5GB (12 months) | 5GB (12 months) |
| Regions | 60+ regions | 30+ regions |
| CDN Integration | Azure CDN | CloudFront |
| Lifecycle Management | Yes | Yes |
| Versioning | Yes | Yes |
| Encryption | Yes (default) | Yes (default) |

**Choose Azure if:**
- You're already using Azure services
- You prefer Microsoft ecosystem
- You need more global regions
- You want slightly lower storage costs

**Choose S3 if:**
- You're already using AWS services
- You prefer AWS ecosystem
- You need AWS-specific features

## Additional Resources

- [Azure Blob Storage Documentation](https://docs.microsoft.com/azure/storage/blobs/)
- [Azure Storage Pricing](https://azure.microsoft.com/pricing/details/storage/blobs/)
- [Azure CDN Documentation](https://docs.microsoft.com/azure/cdn/)
- [Azure Storage Explorer](https://azure.microsoft.com/features/storage-explorer/) (Desktop tool for managing blobs)

---

**Your files are now safe from Render restarts!** 🎉

