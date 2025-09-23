# 🎌 Anime Translation API

A smart subtitle translation API with live progress streaming that translates WebVTT files using Google's Gemini AI.

## ✨ Features

- 🌐 **Live Progress Streaming** - Real-time progress updates during translation
- 💾 **Smart Caching** - Avoids re-downloading and re-translating files
- 🔗 **Direct File Serving** - Serves translated VTT files directly
- 🎯 **ID-based URLs** - Clean URLs based on subtitle IDs
- 📱 **Multiple Languages** - Support for various target languages
- 🔐 **API Key Authentication** - Secure access control
- 🚀 **Vercel Ready** - Optimized for serverless deployment

## 🚀 Deployment on Vercel

### 1. Environment Variables
Set these environment variables in your Vercel dashboard:

```bash
CLIENT_API_KEY=your-secret-api-key-here
GOOGLE_AI_API_KEY=your-google-ai-api-key-here
```

### 2. Deploy
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# For production
vercel --prod
```

## 📦 Local Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd AnimeTransrateApi

# Install dependencies
npm install

# Create .env file
cp env.example .env
# Edit .env with your API keys

# Start the server
npm start
```

## 🌐 API Endpoints

### Translate VTT File with Live Progress
**POST** `/translate`

**Headers:**
```
Content-Type: application/json
x-api-key: your-api-key-here
```

**Request Body:**
```json
{
  "url": "https://mgstatics.xyz/subtitle/9899615c5a641373376b086f66c9c236/eng-2.vtt",
  "targetLang": "ar"
}
```

**Response (Streaming):**
```json
{"type": "progress", "status": "initializing", "progress": 0, "message": "Starting translation process..."}
{"type": "progress", "status": "downloading", "progress": 15, "message": "Downloading VTT file..."}
{"type": "progress", "status": "processing", "progress": 30, "message": "File downloaded, preparing for translation..."}
{"type": "progress", "status": "translating", "progress": 40, "message": "Translating content using AI (streaming)..."}
{"type": "progress", "status": "translating", "progress": 60, "message": "Receiving translation..."}
{"type": "progress", "status": "saving", "progress": 95, "message": "Saving translated file..."}
{"type": "completed", "success": true, "status": 200, "message": "Translation completed successfully!", "downloadUrl": "https://your-domain.vercel.app/serve/9899615c5a641373376b086f66c9c236/ar", "id": "9899615c5a641373376b086f66c9c236", "language": "ar"}
```

### Serve Translated File
**GET** `/serve/:id/:lang`

Example: `https://your-domain.vercel.app/serve/9899615c5a641373376b086f66c9c236/ar`

## 💻 Usage Examples

### JavaScript Client
```javascript
const response = await fetch('https://your-domain.vercel.app/translate', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key-here'
  },
  body: JSON.stringify({ 
    url: 'https://mgstatics.xyz/subtitle/9899615c5a641373376b086f66c9c236/eng-2.vtt',
    targetLang: 'ar'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const data = JSON.parse(line);
    
    if (data.type === 'progress') {
      console.log(`Progress: ${data.progress}% - ${data.message}`);
      // Update progress bar
    } else if (data.type === 'completed') {
      console.log('Translation completed!', data.downloadUrl);
      // Show download link
    }
  }
}
```

### cURL Example
```bash
curl -X POST https://your-domain.vercel.app/translate \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{"url": "https://mgstatics.xyz/subtitle/9899615c5a641373376b086f66c9c236/eng-2.vtt", "targetLang": "ar"}'
```

## 🔧 Configuration

### Environment Variables
- `CLIENT_API_KEY` - Your secret API key for authentication
- `GOOGLE_AI_API_KEY` - Your Google AI API key
- `PORT` - Server port (default: 3000)

### CORS Origins
The API allows requests from:
- `https://api-nuvexanime.vercel.app`
- `https://nuvexanime.vercel.app`
- `http://localhost:3000`
- `http://localhost:3001`

## 📁 File Structure

```
├── index.js              # Main server file
├── package.json          # Dependencies
├── vercel.json          # Vercel configuration
├── .gitignore           # Git ignore rules
├── env.example          # Environment variables example
├── cache/               # Cached translations (auto-created)
│   ├── {id}_ar.vtt
│   ├── {id}_en.vtt
│   └── ...
└── README.md
```

## 🌍 Supported Languages

Any language supported by Google's Gemini AI model:
- Arabic (ar)
- Spanish (es)
- French (fr)
- German (de)
- Japanese (ja)
- Chinese (zh)
- And many more...

## 🔒 Security Features

- **API Key Authentication** - Secure access control
- **Rate Limiting** - 100 requests per hour per IP
- **CORS Protection** - Restricted to allowed origins
- **Input Validation** - URL format validation

## 📊 Progress Stages

1. **Initializing** (0%) - Starting translation process
2. **Downloading** (15%) - Downloading VTT file
3. **Processing** (30%) - File downloaded, preparing for translation
4. **Translating** (40-90%) - AI translation with streaming progress
5. **Saving** (95%) - Saving translated file
6. **Completed** (100%) - Translation completed successfully

## 🚀 Performance

- **Smart Caching** - Avoids re-translation of same files
- **Streaming Translation** - Real-time progress updates
- **Serverless Ready** - Optimized for Vercel deployment
- **Fast Response** - Efficient file serving

## 📝 License

MIT License - Feel free to use and modify as needed.
