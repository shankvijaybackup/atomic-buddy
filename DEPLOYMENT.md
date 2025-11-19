# Deploy Atomicwork Brain to Render

## Quick Deploy (5 minutes) - Manual Setup

### 1. Push to GitHub
```bash
git add .
git commit -m "Production-ready Atomicwork Brain"
git push origin main
```

### 2. Deploy Backend API

1. Go to [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Select your `atomic-buddy` repository
4. Configure:
   - **Name**: `atomicwork-brain-api`
   - **Environment**: `Node`
   - **Root Directory**: `./`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run backend`
5. Add Environment Variables:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `ANTHROPIC_API_KEY`: Your Anthropic API key  
   - `PERPLEXITY_API_KEY`: Your Perplexity API key
   - `NODE_ENV`: `production`
6. Click "Create Web Service"

### 3. Deploy Frontend

1. Click "New +" → "Static Site"
2. Select your `atomic-buddy` repository
3. Configure:
   - **Name**: `atomicwork-brain-ui`
   - **Root Directory**: `./`
   - **Build Command**: `npm install`
   - **Publish Directory**: `./public`
4. Click "Create Static Site"

### 4. Update Frontend API URL

Once deployed, you'll need to update the frontend to point to your backend URL:
- Backend URL: `https://atomicwork-brain-api.onrender.com`
- Frontend URL: `https://atomicwork-brain-ui.onrender.com`

The frontend is already configured to work with both localhost and production URLs automatically.

## Features Available Live

✅ **Knowledge Ingestion**
- Batch upload up to 10 files
- PDF, TXT, MD, MP3, M4A, WAV, MP4, MOV support
- Auto-classification and deduplication
- Source tracking (upload/manual/NotebookLM)

✅ **RAG Search**
- Semantic search across all knowledge
- Persona-aware filtering (CIO, VP_IT_Ops, etc.)
- Tier-based filtering (L1, L2, L3, Multi, Platform)

✅ **Admin Features**
- View all ingested documents
- Edit and manage knowledge
- See source information and file metadata

## Environment Variables Required

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API for classification | ✅ |
| `ANTHROPIC_API_KEY` | Anthropic API for research | ✅ |
| `PERPLEXITY_API_KEY` | Perplexity API for outreach | ✅ |

## Data Persistence

- **Free Tier**: Data resets on restart (good for testing)
- **Pro Tier**: $1/month Render Disk for persistent storage
- Knowledge stored in JSON files in `/data` directory

## Testing Live

1. **Upload Test Files**: Try uploading multiple call transcripts
2. **Test RAG**: Search for "Atomicwork" or specific topics
3. **Test Deduplication**: Upload the same file twice
4. **Test Source Tracking**: Check document metadata

## Troubleshooting

**Build Fails**: Check that all environment variables are set
**Upload Fails**: Verify file size is under 10MB limit
**Search Returns Empty**: Ensure documents are successfully ingested first
**CORS Errors**: Backend may take 30-60 seconds to start on first deploy

## Next Steps

- Add authentication for production use
- Migrate to PostgreSQL for enterprise scaling
- Add user management and permissions
- Implement backup/restore functionality
