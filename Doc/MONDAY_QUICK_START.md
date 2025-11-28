# Quick Start: Monday.com Integration

## Step 1: Get Your API Token

1. Go to Monday.com and log in
2. Click your profile picture (top right)
3. Select **"Developers"**
4. Click **"My Access Tokens"** or **"API"**
5. Click **"Show"** next to your personal token
6. **Copy the token** (it starts with `eyJ...`)

## Step 2: Find Your Board ID

1. Open the board you want to connect in Monday.com
2. Look at the URL in your browser:
   ```
   https://yourcompany.monday.com/boards/1234567890
                                         ^^^^^^^^^^^
                                         This is your Board ID
   ```
3. Copy the numeric board ID

## Step 3: Configure the Application

1. Create a `.env` file in the project root:
   ```bash
   # Copy the example file
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```env
   VITE_MONDAY_API_TOKEN=eyJhbGciOiJIUzI1NiJ9...your_actual_token
   VITE_MONDAY_BOARD_ID=1234567890
   ```

## Step 4: Verify Your Board Structure

Your Monday.com board should have a **"Sales Agent"** column (or "Person" column type). The integration filters items by this column.

### Required Column:
- **Column Type**: People/Person
- **Column ID**: Usually `"person"` or similar
- **Value**: Should contain agent names like "Isaac Reed"

### To Check Column IDs:
1. Open your board in Monday.com
2. Click on any column header → **"Settings"**
3. The column ID is shown in the column settings

## Step 5: Start the Development Server

```bash
# Install dependencies (if not already done)
npm install

# Start the development server
npm run dev
```

## Step 6: Test the Integration

1. Navigate to the Commission Portal in your browser
2. You should see two tabs:
   - **Actual Placements** (from Monday.com)
   - **Writing Leads** (from Supabase)

3. Click on **"Actual Placements"** tab
4. If configured correctly, you'll see policy placements from Monday.com

### Troubleshooting:

**"Monday.com API Not Configured"**
- Check that `.env` file exists and has `VITE_MONDAY_API_TOKEN`
- Restart the dev server after creating `.env`

**"No placements found"**
- Verify the Board ID is correct
- Check that items exist with "Isaac Reed" in the Sales Agent column
- Open browser console (F12) to see detailed errors

**API Errors**
- Verify your API token is valid and not expired
- Check that you have permission to access the board
- Try regenerating your API token in Monday.com

## Step 7: Customize for Your Agents

Currently hardcoded for **Isaac Reed**. To change:

Edit `src/pages/CommissionPortal.tsx` around line 120:

```typescript
// Change this line:
const salesAgentName = displayName === 'Isaac Reed' ? 'Isaac Reed' : displayName;

// To match your agent's name in Monday.com:
const salesAgentName = 'Your Agent Name';
```

## Testing Your Connection

Open browser console (F12) on the Commission Portal page and run:

```javascript
// Test basic connection
await fetch('https://api.monday.com/v2', {
  method: 'POST',
  headers: {
    'Authorization': 'YOUR_TOKEN_HERE',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'query { me { id name } }'
  })
}).then(r => r.json()).then(console.log);
```

## What You Should See

### Actual Placements Tab:
- ✅ Total placement count
- ✅ List of policies from Monday.com
- ✅ Item names and IDs
- ✅ Group/category information
- ✅ All column values from the board

### Writing Leads Tab:
- ✅ All the original commission portal features
- ✅ Pending approval statistics
- ✅ Filters and charts
- ✅ Pagination

## Next Steps

Once working:
1. **Map all agents** - Create mapping from licensed agents to Monday.com sales agents
2. **Add date columns** - Include policy effective dates for time-based stats
3. **Customize columns** - Show carrier, premium, policy type, etc.
4. **Add pagination** - Handle large datasets with cursor pagination
5. **Real-time updates** - Use Monday.com webhooks for live data

## Need Help?

Check these resources:
- `Doc/MONDAY_INTEGRATION.md` - Full integration documentation
- `test-monday-api.js` - Test suite for debugging
- Monday.com API Docs: https://developer.monday.com/api-reference
- Browser console - Look for error messages

## Security Note

⚠️ **Never commit your `.env` file to Git!**

The `.env` file is already in `.gitignore`. Always use environment variables for sensitive data like API tokens.
