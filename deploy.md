# 🚀 Vercel Deployment Guide

## 📋 Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Vercel CLI**: Install globally
   ```bash
   npm i -g vercel
   ```
3. **Git Repository**: Push your code to GitHub/GitLab

## 🔧 Step-by-Step Deployment

### 1. Prepare Your Code
Make sure you have all the required files:
- ✅ `index.js` - Main server file
- ✅ `package.json` - Dependencies
- ✅ `vercel.json` - Vercel configuration
- ✅ `.gitignore` - Git ignore rules
- ✅ `env.example` - Environment variables example

### 2. Set Environment Variables
In your Vercel dashboard, go to **Settings > Environment Variables** and add:

```bash
CLIENT_API_KEY=your-secret-api-key-here
GOOGLE_AI_API_KEY=your-google-ai-api-key-here
```

### 3. Deploy via Vercel CLI

```bash
# Login to Vercel
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### 4. Deploy via GitHub (Recommended)

1. **Connect Repository**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository

2. **Configure Project**:
   - Framework Preset: **Other**
   - Build Command: Leave empty
   - Output Directory: Leave empty
   - Install Command: `npm install`

3. **Set Environment Variables**:
   - Go to Project Settings > Environment Variables
   - Add your API keys

4. **Deploy**:
   - Click "Deploy"
   - Wait for deployment to complete

## 🔍 Post-Deployment

### Test Your API
```bash
curl -X POST https://your-domain.vercel.app/translate \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{"url": "https://mgstatics.xyz/subtitle/9899615c5a641373376b086f66c9c236/eng-2.vtt", "targetLang": "ar"}'
```

### Check Logs
- Go to Vercel Dashboard > Your Project > Functions
- Click on your function to view logs

## 🛠️ Troubleshooting

### Common Issues

1. **Environment Variables Not Working**:
   - Make sure they're set in Vercel dashboard
   - Redeploy after adding new variables

2. **Function Timeout**:
   - Vercel has a 10-second timeout for Hobby plan
   - Consider upgrading to Pro plan for longer timeouts

3. **CORS Issues**:
   - Check your `allowedOrigins` in `index.js`
   - Add your domain to the list

4. **API Key Issues**:
   - Verify the key is set correctly
   - Check the header name: `x-api-key`

### Performance Optimization

1. **Enable Caching**:
   - Vercel automatically caches static files
   - Your cache directory will be preserved

2. **Monitor Usage**:
   - Check Vercel dashboard for usage stats
   - Monitor function execution time

## 📊 Vercel Plans

### Hobby (Free)
- ✅ 100GB bandwidth
- ✅ 100 serverless function executions
- ❌ 10-second function timeout
- ❌ No custom domains

### Pro ($20/month)
- ✅ 1TB bandwidth
- ✅ 1000 serverless function executions
- ✅ 60-second function timeout
- ✅ Custom domains
- ✅ Analytics

## 🔄 Auto-Deployment

Once connected to GitHub, Vercel will automatically deploy:
- ✅ Every push to main branch
- ✅ Pull request previews
- ✅ Branch deployments

## 📝 Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `CLIENT_API_KEY` | Your secret API key | ✅ Yes |
| `GOOGLE_AI_API_KEY` | Google AI API key | ✅ Yes |
| `PORT` | Server port | ❌ No (auto-set) |

## 🎯 Production Checklist

- [ ] Environment variables set
- [ ] API key authentication working
- [ ] CORS origins configured
- [ ] Rate limiting enabled
- [ ] Error handling tested
- [ ] Performance monitored
- [ ] Logs accessible

## 📞 Support

If you encounter issues:
1. Check Vercel documentation
2. Review function logs
3. Test locally first
4. Contact Vercel support if needed

---

**Happy Deploying! 🚀**
