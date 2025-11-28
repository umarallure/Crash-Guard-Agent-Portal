# Namecheap Shared Hosting Deployment Guide
## Crash Guard Agents Portal

### 📋 Prerequisites Checklist
- ✅ Namecheap Shared Hosting with cPanel access
- ✅ Domain configured and pointing to Namecheap
- ✅ SSL Certificate installed (recommended - can be free via Let's Encrypt in cPanel)
- ✅ Latest production build (dist folder)

---

## 🚀 Quick Deployment Steps

### Step 1: Build for Production

The app is already configured with Supabase credentials. Simply run:

```powershell
npm run build
```

This creates the `dist/` folder with optimized production files.

**Build output location:** `dist/`

---

### Step 2: Prepare Deployment Package

You have two options:

#### Option A: Upload via cPanel File Manager (Easiest)

1. **Create a ZIP file:**
   ```powershell
   # Navigate to project root
   cd "C:\Users\Z C\Desktop\Crash Guard\Agents-Portal"
   
   # Create deployment package
   Compress-Archive -Path dist\*, .htaccess -DestinationPath agents-portal-deploy.zip -Force
   ```

2. **Files to include:**
   - All contents of `dist/` folder
   - `.htaccess` file (for SPA routing)

#### Option B: FTP/SFTP Upload (For automation)

Use FileZilla or any FTP client with your cPanel credentials.

---

### Step 3: Upload to Namecheap

#### Using cPanel File Manager:

1. **Login to cPanel**
   - Go to: `https://yourdomain.com:2083`
   - Or use: Namecheap dashboard → Hosting List → Manage → cPanel

2. **Navigate to File Manager**
   - Click "File Manager" icon in cPanel
   - Navigate to `public_html` folder

3. **Choose deployment location:**
   
   **Option A - Root Domain** (yourdomain.com):
   - Stay in `public_html/`
   - Delete any existing `index.html` or default files
   
   **Option B - Subfolder** (yourdomain.com/app):
   - Create new folder: `public_html/app/`
   - Navigate into it
   - ⚠️ **IMPORTANT:** Update `.htaccess` before uploading:
     - Change `RewriteBase /` to `RewriteBase /app/`
   - ⚠️ **IMPORTANT:** Update `vite.config.ts` and rebuild:
     ```typescript
     export default defineConfig(({ mode }) => ({
       base: '/app/', // Add this line
       // ... rest of config
     }));
     ```

4. **Upload files:**
   - Click "Upload" button
   - Select `agents-portal-deploy.zip`
   - After upload completes, right-click zip → Extract
   - Select "Extract files"
   - Delete the zip file after extraction

5. **Set permissions (if needed):**
   - Select all files → Change Permissions
   - Ensure files: 644 (readable)
   - Ensure folders: 755 (readable/executable)

---

### Step 4: Configure Supabase CORS

Add your production domain to Supabase allowed origins:

1. Go to Supabase Dashboard
2. Navigate to: Project Settings → API
3. Under "Authentication" → "Site URL" add:
   ```
   https://yourdomain.com
   ```
4. Under "Auth" → "URL Configuration" → "Redirect URLs" add:
   ```
   https://yourdomain.com/*
   ```

---

### Step 5: Enable HTTPS (Strongly Recommended)

1. In cPanel, go to "SSL/TLS Status"
2. Install free Let's Encrypt certificate
3. After SSL is active, uncomment HTTPS redirect in `.htaccess`:
   
   Find these lines in `.htaccess`:
   ```apache
   # <IfModule mod_rewrite.c>
   #   RewriteCond %{HTTPS} !=on
   #   RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
   # </IfModule>
   ```
   
   Remove the `#` comments:
   ```apache
   <IfModule mod_rewrite.c>
     RewriteCond %{HTTPS} !=on
     RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
   </IfModule>
   ```

---

## ✅ Verify Deployment

### Test Checklist:

1. **Homepage loads:**
   - Visit `https://yourdomain.com`
   - Should show login page

2. **Client-side routing works:**
   - Navigate to different pages
   - Refresh browser (F5) - should not show 404
   - Test direct URL access (e.g., `/dashboard`)

3. **Authentication works:**
   - Login with test credentials
   - Session persists after refresh

4. **Supabase connectivity:**
   - Check browser console (F12) for errors
   - Verify API calls succeed

5. **Edge Functions work:**
   - Test features that use Slack notifications
   - Verify MCP functions execute

### Common Issues & Fixes:

#### 🔴 404 on page refresh
**Cause:** `.htaccess` not uploaded or Apache mod_rewrite disabled
**Fix:** 
- Verify `.htaccess` exists in root folder
- Contact Namecheap support to enable mod_rewrite

#### 🔴 CORS errors in console
**Cause:** Domain not added to Supabase allowed origins
**Fix:** Add domain in Supabase Dashboard → Authentication settings

#### 🔴 Blank white page
**Cause:** JavaScript errors or wrong base path
**Fix:**
- Check browser console for errors
- Verify `base` in `vite.config.ts` matches folder structure
- Rebuild and reupload

#### 🔴 Assets not loading (404 for .js/.css)
**Cause:** Incorrect base path in build
**Fix:**
- If in subfolder, rebuild with correct `base` setting
- Verify file paths in uploaded `index.html`

#### 🔴 Mixed content warnings
**Cause:** Site loads over HTTPS but some resources use HTTP
**Fix:** Ensure SSL is properly configured and all assets use relative paths

---

## 🔄 Updating the Application

When you make changes and need to deploy updates:

```powershell
# 1. Build new version
npm run build

# 2. Create deployment package
Compress-Archive -Path dist\*, .htaccess -DestinationPath agents-portal-deploy.zip -Force

# 3. Upload via cPanel File Manager:
#    - Delete old files in public_html (except .htaccess)
#    - Upload and extract new zip
```

---

## 🤖 Optional: Automate Deployments

### Using GitHub Actions for Auto-Deploy:

I can create a GitHub Actions workflow that:
- Builds on every push to `main` branch
- Automatically uploads to Namecheap via FTP/SFTP
- Requires: FTP credentials added as GitHub Secrets

**Let me know if you want this automation setup!**

---

## 📊 Performance Optimization

Your current build is ~1.76 MB (497 KB compressed). Consider:

1. **Enable Gzip/Brotli compression** (already in `.htaccess`)
2. **Use CDN** for static assets (optional)
3. **Enable browser caching** (already configured in `.htaccess`)

---

## 🔐 Security Recommendations

1. ✅ **HTTPS is mandatory** - Never run without SSL
2. ✅ **Keep Supabase keys** - Anon key is safe for public use
3. ⚠️ **Never commit service_role key** to client code
4. ✅ **Row Level Security** - Already configured in Supabase
5. ✅ **Security headers** - Already added to `.htaccess`

---

## 📞 Support & Troubleshooting

### Namecheap Support:
- Live Chat: Available 24/7
- Phone: Check your hosting dashboard
- Email: Submit ticket via cPanel

### Application Issues:
- Check browser console (F12 → Console)
- Verify Supabase logs in Supabase Dashboard
- Check Network tab for failed API requests

---

## 📝 Deployment Checklist

Before going live:

- [ ] Production build created (`npm run build`)
- [ ] `.htaccess` uploaded to correct folder
- [ ] SSL certificate installed and active
- [ ] HTTPS redirect enabled in `.htaccess`
- [ ] Supabase CORS configured with production domain
- [ ] Test login/authentication flow
- [ ] Test all major features (dashboard, claims, reports)
- [ ] Test client-side routing (page refresh on routes)
- [ ] Check browser console for errors
- [ ] Test on mobile devices
- [ ] Verify Edge Functions work correctly

---

## 🎉 You're Ready!

Your application is now deployed on Namecheap Shared Hosting with:
- ✅ SPA routing configured
- ✅ Browser caching optimized
- ✅ Security headers enabled
- ✅ Compression configured
- ✅ HTTPS ready (after SSL activation)

**Need help?** Let me know if you encounter any issues during deployment!
