# Zenith Restaurant - Backend Deployment Guide for Render

## Prerequisites
- GitHub account
- Render account
- MongoDB Atlas account (or MongoDB database)

## Step 1: Prepare Backend Repository

1. Create a new GitHub repository for the backend
2. Copy only the backend folder contents to the new repository
3. Make sure these files are included:
   - `index.js`
   - `package.json` (updated version)
   - `models/` folder
   - `utils/` folder
   - `env.example`

## Step 2: Deploy Backend to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub backend repository
4. Configure the service:
   - **Name**: `zenith-backend` (or your preferred name)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Choose Free or Starter plan

## Step 3: Environment Variables

In Render dashboard, go to your service → Environment tab and add:

```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/zenith?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random
PORT=3000
EMAIL_USER=your_gmail_address@gmail.com
EMAIL_PASS=your_gmail_app_password
FRONTEND_URL=https://your-frontend-domain.onrender.com
```

## Step 4: Deploy

1. Click "Create Web Service"
2. Wait for deployment to complete
3. Note your backend URL (e.g., `https://zenith-backend.onrender.com`)

## Step 5: Test Backend

Test your backend API endpoints:
- `GET https://your-backend-url.onrender.com/menu`
- `POST https://your-backend-url.onrender.com/signup`

## Troubleshooting

- Check Render logs if deployment fails
- Ensure all environment variables are set
- Verify MongoDB connection string
- Check that all dependencies are in package.json
