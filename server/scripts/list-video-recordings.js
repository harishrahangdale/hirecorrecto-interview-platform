const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, '../uploads');

function listVideos(dir, basePath = '') {
  const items = fs.readdirSync(dir);
  const videos = [];
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.join(basePath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Recursively search subdirectories
      videos.push(...listVideos(fullPath, relativePath));
    } else {
      // Skip .gitkeep and other hidden files
      if (item === '.gitkeep' || item.startsWith('.')) {
        continue;
      }
      
      // Check if it's a video file (by extension or by file type)
      const ext = path.extname(item).toLowerCase();
      const hasVideoExt = ['.webm', '.mp4', '.avi', '.mov', '.mkv'].includes(ext);
      const isLargeFile = stat.size > 100000; // Files > 100KB
      const noExtension = !ext;
      
      // Consider it a video if it has a video extension OR is a large file without extension
      const isVideo = hasVideoExt || (noExtension && isLargeFile);
      
      if (isVideo) {
        const fileSize = (stat.size / (1024 * 1024)).toFixed(2); // Size in MB
        videos.push({
          path: relativePath,
          fullPath: fullPath,
          size: fileSize + ' MB',
          sizeBytes: stat.size,
          modified: stat.mtime,
          interviewId: basePath.split(path.sep)[0] || 'unknown',
          questionId: basePath.split(path.sep)[1] || 'unknown'
        });
      }
    }
  }
  
  return videos;
}

console.log('🔍 Searching for video recordings in:', uploadDir);
console.log('');

if (!fs.existsSync(uploadDir)) {
  console.log('❌ Uploads directory does not exist:', uploadDir);
  process.exit(1);
}

const videos = listVideos(uploadDir);

if (videos.length === 0) {
  console.log('⚠️  No video recordings found in uploads directory.');
  console.log('');
  console.log('This could mean:');
  console.log('  1. No interviews have been completed yet');
  console.log('  2. Videos are being saved to a different location');
  console.log('  3. Videos failed to upload');
} else {
  console.log(`✅ Found ${videos.length} video recording(s):\n`);
  
  // Group by interview
  const byInterview = {};
  videos.forEach(video => {
    if (!byInterview[video.interviewId]) {
      byInterview[video.interviewId] = [];
    }
    byInterview[video.interviewId].push(video);
  });
  
  Object.entries(byInterview).forEach(([interviewId, interviewVideos]) => {
    console.log(`📁 Interview: ${interviewId}`);
    interviewVideos.forEach((video, idx) => {
      console.log(`   ${idx + 1}. Question: ${video.questionId}`);
      console.log(`      File: ${video.path}`);
      console.log(`      Size: ${video.size}`);
      console.log(`      Modified: ${video.modified.toLocaleString()}`);
      console.log(`      URL: http://localhost:5004/uploads/${video.path}`);
      console.log('');
    });
  });
  
  console.log('\n💡 To view videos:');
  console.log('   - Open the URL in a browser or video player');
  console.log('   - Or use: open http://localhost:5004/uploads/<path>');
}

