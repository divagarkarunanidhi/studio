# Azure Step-by-Step Hosting Guide — BugSense Studio

Step-by-step guide to deploy BugSense Studio on Microsoft Azure using the **Azure Portal** and **Azure CLI**.

---

## Prerequisites

Before you begin, ensure you have:

1. **An Azure Account** — Sign up at https://portal.azure.com (free tier available)
2. **Azure CLI installed** — Download from https://learn.microsoft.com/en-us/cli/azure/install-azure-cli
3. **Node.js ≥ 20** installed locally
4. **Git** installed locally
5. Your **AI provider credentials** (Gemini API key or DHL GenAI key + endpoint)

Log in to Azure CLI:

```bash
az login
```

This opens your browser at https://login.microsoftonline.com — sign in with your Azure account.

---

## Application Stack

| Component | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions) |
| Runtime | Node.js ≥ 20 |
| Database | MongoDB (via MongoClient) |
| Authentication | NextAuth v4 (Credentials provider) |
| AI | Google Genai SDK / DHL GenAI Gateway |
| Python | Optional — `failure_analysis.py` script |

---

## Step 1: Create a Resource Group

A Resource Group is a container for all your Azure resources.

**Portal:** https://portal.azure.com/#create/Microsoft.ResourceGroup

1. Go to https://portal.azure.com
2. Search **"Resource groups"** in the top search bar
3. Click **+ Create**
4. Fill in:
   - **Subscription:** Select your subscription
   - **Resource group:** `bugsense-rg`
   - **Region:** `East US` (or your preferred region)
5. Click **Review + create** → **Create**

**CLI alternative:**

```bash
az group create --name bugsense-rg --location eastus
```

---

## Step 2: Create a MongoDB Database (Azure Cosmos DB)

**Portal:** https://portal.azure.com/#create/Microsoft.DocumentDB

1. Go to https://portal.azure.com
2. Search **"Azure Cosmos DB"** in the top search bar
3. Click **+ Create** → Select **Azure Cosmos DB for MongoDB**
4. Choose **RU-based** (cheaper for small workloads) or **vCore** (for larger workloads)
5. Fill in:
   - **Subscription:** Select your subscription
   - **Resource group:** `bugsense-rg`
   - **Account name:** `bugsense-db`
   - **Region:** Same region as your resource group
   - **Capacity mode:** Provisioned (400 RU/s) or Serverless
6. Click **Review + create** → **Create**
7. Wait for deployment to complete (2–5 minutes)

**CLI alternative:**

```bash
az cosmosdb create --name bugsense-db --resource-group bugsense-rg \
  --kind MongoDB --server-version 6.0
```

### Get the Connection String

1. Go to https://portal.azure.com → open your **bugsense-db** Cosmos DB account
2. In the left menu, click **Settings → Connection strings**
3. Copy the **Primary connection string** — it looks like:
   ```
   mongodb+srv://bugsense-db:<password>@bugsense-db.mongo.cosmos.azure.com/?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false&maxIdleTimeMS=120000
   ```
4. Save this — you will need it in Step 6

---

## Step 3: Create an App Service Plan

The App Service Plan defines the compute resources (CPU/RAM) for your app.

**Portal:** https://portal.azure.com/#create/Microsoft.AppServicePlanCreate

1. Go to https://portal.azure.com
2. Search **"App Service plans"** in the top search bar
3. Click **+ Create**
4. Fill in:
   - **Subscription:** Select your subscription
   - **Resource group:** `bugsense-rg`
   - **Name:** `bugsense-plan`
   - **Operating System:** **Linux**
   - **Region:** Same region as your Cosmos DB
   - **Pricing plan:** **Basic B1** (~$13/month) for testing, or **P1v3** for production
5. Click **Review + create** → **Create**

**CLI alternative:**

```bash
az appservice plan create --name bugsense-plan --resource-group bugsense-rg \
  --is-linux --sku B1
```

---

## Step 4: Create the Web App (App Service)

**Portal:** https://portal.azure.com/#create/Microsoft.WebSite

1. Go to https://portal.azure.com
2. Search **"App Services"** in the top search bar
3. Click **+ Create** → **Web App**
4. Fill in the **Basics** tab:
   - **Subscription:** Select your subscription
   - **Resource group:** `bugsense-rg`
   - **Name:** `bugsense-studio` (this becomes your URL: `https://bugsense-studio.azurewebsites.net`)
   - **Publish:** **Code**
   - **Runtime stack:** **Node 20 LTS**
   - **Operating System:** **Linux**
   - **Region:** Same region
   - **App Service Plan:** Select `bugsense-plan` (created in Step 3)
5. Click **Review + create** → **Create**
6. Wait for deployment to complete (1–2 minutes)

**CLI alternative:**

```bash
az webapp create --name bugsense-studio --resource-group bugsense-rg \
  --plan bugsense-plan --runtime "NODE:20-lts"
```

### Your App URL

Once created, your app is available at:

```
https://bugsense-studio.azurewebsites.net
```

You can find this URL at: https://portal.azure.com → **App Services** → **bugsense-studio** → **Overview** → **Default domain**

---

## Step 5: Configure Environment Variables

**Portal:** https://portal.azure.com → **App Services** → **bugsense-studio** → **Settings** → **Environment variables**

1. Open your App Service in the Azure Portal
2. In the left menu, go to **Settings → Environment variables**
3. Under **App settings**, click **+ Add** for each variable below:

| Name | Value | Required |
|---|---|---|
| `NEXTAUTH_SECRET` | *(generate with `openssl rand -base64 32`)* | **Yes** |
| `NEXTAUTH_URL` | `https://bugsense-studio.azurewebsites.net` | **Yes** |
| `WEBSITES_PORT` | `3000` | **Yes** |
| `GEMINI_API_KEY` | Your Google Gemini API key | If using Google AI |
| `DHL_API_KEY` | Your DHL GenAI Gateway key | If using DHL |
| `DHL_ENDPOINT` | `https://apihub-sandbox.dhl.com/genai-test` | If using DHL |
| `GITLAB_INSECURE_TLS` | `true` | If GitLab uses self-signed certs |

4. Click **Apply** → **Confirm**

> **Security Warning:** The codebase default `NEXTAUTH_SECRET` is `local-dev-nextauth-secret-change-me`. You **must** replace this in production. Generate a secret:
> ```bash
> openssl rand -base64 32
> ```

**CLI alternative:**

```bash
az webapp config appsettings set --name bugsense-studio --resource-group bugsense-rg \
  --settings \
    NEXTAUTH_SECRET="$(openssl rand -base64 32)" \
    NEXTAUTH_URL="https://bugsense-studio.azurewebsites.net" \
    WEBSITES_PORT="3000" \
    GEMINI_API_KEY="your-gemini-key-here"
```

---

## Step 6: Configure MongoDB Connection

Update `data/mongo-config.json` in your project with the Cosmos DB connection string from Step 2:

```json
{
  "uri": "mongodb+srv://bugsense-db:<password>@bugsense-db.mongo.cosmos.azure.com/bugsense?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false",
  "dbName": "bugsense"
}
```

Replace `<password>` with the actual password from the Cosmos DB connection string.

> **Alternative:** You can skip this step now and use the app's **Settings → Configuration** page after deployment to enter the MongoDB URI at runtime.

---

## Step 7: Configure Startup Command

**Portal:** https://portal.azure.com → **App Services** → **bugsense-studio** → **Settings** → **Configuration**

1. In the left menu, go to **Settings → Configuration**
2. Click the **General settings** tab
3. Under **Startup Command**, enter:
   ```
   npm run start
   ```
4. Click **Save**

**CLI alternative:**

```bash
az webapp config set --name bugsense-studio --resource-group bugsense-rg \
  --startup-file "npm run start"
```

---

## Step 8: Build and Deploy the Application

### Option A: Deploy via Azure CLI (Simplest)

```bash
# 1. Navigate to your project folder
cd "C:\Code base\bugsense apr 24\studio"

# 2. Install dependencies
npm ci

# 3. Build the production bundle
npm run build

# 4. Deploy to Azure
az webapp up --name bugsense-studio --resource-group bugsense-rg \
  --runtime "NODE:20-lts"
```

The CLI zips your project and uploads it. Deployment takes 3–10 minutes.

### Option B: Deploy via Azure Portal (Deployment Center)

1. Push your code to a **GitHub** or **Azure DevOps** repository
2. Go to https://portal.azure.com → **App Services** → **bugsense-studio**
3. In the left menu, click **Deployment → Deployment Center**
4. Under **Source**, select:
   - **GitHub** → Authorize → Select your repo and branch
   - Or **Local Git** → Get the Git remote URL and push directly
5. Azure automatically builds and deploys on each push

### Option C: Deploy via VS Code

1. Install the **Azure App Service** extension from the VS Code marketplace
2. In VS Code, open the **Azure** sidebar (Shift+Alt+A)
3. Sign in to your Azure account
4. Under **App Services**, right-click **bugsense-studio**
5. Click **Deploy to Web App...**
6. Select your project folder
7. VS Code builds and deploys automatically

### Option D: Deploy via GitHub Actions (CI/CD)

1. Go to https://portal.azure.com → **App Services** → **bugsense-studio**
2. Go to **Deployment → Deployment Center**
3. Click **Manage publish profile** → **Download publish profile**
4. In your GitHub repo, go to **Settings → Secrets and variables → Actions**
5. Create a new secret: **Name:** `AZURE_WEBAPP_PUBLISH_PROFILE`, **Value:** paste the publish profile XML content
6. Create `.github/workflows/azure-deploy.yml` in your repo:

```yaml
name: Deploy to Azure App Service

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm run build

      - uses: azure/webapps-deploy@v3
        with:
          app-name: bugsense-studio
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: .
```

7. Push to `main` — GitHub Actions will build and deploy automatically

---

## Step 9: Seed the Database (Create Admin User)

After the app is deployed, you need to create the first admin user.

**Option A — Run the seed script locally** (pointing at Cosmos DB):

1. Update your local `data/mongo-config.json` with the Cosmos DB URI
2. Run:
   ```bash
   npx tsx scripts/create-test-user.ts
   ```

**Option B — Use Azure Portal Data Explorer:**

1. Go to https://portal.azure.com → **Azure Cosmos DB** → **bugsense-db**
2. In the left menu, click **Data Explorer**
3. Open the `bugsense` database → `users` collection
4. Click **New Document** and insert:
   ```json
   {
     "email": "admin@example.com",
     "username": "admin",
     "displayName": "Admin User",
     "role": "admin",
     "passwordHash": "<bcrypt hash of your password>",
     "createdAt": { "$date": "2026-01-01T00:00:00Z" }
   }
   ```

> Generate a bcrypt hash using:
> ```bash
> node -e "require('bcrypt').hash('YourPassword123', 10).then(h => console.log(h))"
> ```

---

## Step 10: Verify the Deployment

1. Open your browser and go to:
   ```
   https://bugsense-studio.azurewebsites.net
   ```
2. You should see the **BugSense login page**
3. Log in with the admin user created in Step 9
4. Go to **Settings → Configuration** and verify:
   - MongoDB connection is active
   - AI provider credentials are set
5. Test a defect prediction to confirm end-to-end functionality

### Troubleshooting

**Check application logs:**

Portal: https://portal.azure.com → **App Services** → **bugsense-studio** → **Monitoring → Log stream**

```bash
# Or via CLI:
az webapp log tail --name bugsense-studio --resource-group bugsense-rg
```

**SSH into the App Service:**

Portal: https://portal.azure.com → **App Services** → **bugsense-studio** → **Development Tools → SSH**

```bash
# Or via CLI:
az webapp ssh --name bugsense-studio --resource-group bugsense-rg
```

**Restart the app:**

```bash
az webapp restart --name bugsense-studio --resource-group bugsense-rg
```

---

## Step 11: Configure Custom Domain (Optional)

1. Go to https://portal.azure.com → **App Services** → **bugsense-studio**
2. In the left menu, click **Settings → Custom domains**
3. Click **+ Add custom domain**
4. Enter your domain: `bugsense.yourdomain.com`
5. Azure shows the **CNAME** or **A record** you need to add in your DNS provider
6. Add the DNS record with your domain registrar (GoDaddy, Cloudflare, etc.)
7. Click **Validate** → **Add**

### Enable HTTPS (Free Managed Certificate)

1. After adding the custom domain, click **Add binding**
2. Select **App Service Managed Certificate (free)**
3. Select **SNI SSL**
4. Click **Add**

Update your `NEXTAUTH_URL` environment variable to the custom domain:

```bash
az webapp config appsettings set --name bugsense-studio --resource-group bugsense-rg \
  --settings NEXTAUTH_URL="https://bugsense.yourdomain.com"
```

---

## Post-Deployment Checklist

- [ ] App loads at `https://bugsense-studio.azurewebsites.net`
- [ ] `NEXTAUTH_SECRET` is set to a strong, unique value (not the dev default)
- [ ] `NEXTAUTH_URL` matches the actual deployment URL
- [ ] MongoDB / Cosmos DB connection is configured and reachable
- [ ] Initial admin user is created and can log in
- [ ] AI provider credentials are configured (Gemini or DHL)
- [ ] TLS certificates are valid for all external endpoints
- [ ] Custom domain and HTTPS configured (if applicable)
- [ ] Log stream shows no critical errors

---

## Important Considerations

### File System Persistence

The app writes to `data/mongo-config.json` when admins update MongoDB settings via the Configuration page. On Azure App Service, files outside `/home` are ephemeral and lost on restart.

**Mitigation:** Ensure the working directory is under `/home/site/wwwroot` (the default for App Service deployments), or set `WEBSITE_RUN_FROM_PACKAGE=0` in app settings to allow file writes.

### Scaling to Multiple Instances

Portal: https://portal.azure.com → **App Services** → **bugsense-studio** → **Settings → Scale out**

- The MongoDB connection pool uses a Node.js global singleton — this works correctly per instance.
- `data/mongo-config.json` is file-based. With multiple instances, changes made on one instance won't propagate to others unless the file is on shared storage.
- **Recommendation:** For multi-instance deployments, move MongoDB config to environment variables or a shared config store (Azure App Configuration: https://portal.azure.com/#create/Microsoft.AppConfiguration).

### TLS and Certificates

- **Cosmos DB** requires TLS — connection strings include `tls=true` by default.
- **DHL GenAI Gateway** — if the endpoint uses a self-signed or corporate certificate, enable **Insecure TLS** in the app's Configuration page. The app uses an undici `Agent` with `rejectUnauthorized: false` for this case.
- **GitLab integration** — set `GITLAB_INSECURE_TLS=true` if your GitLab instance uses self-signed certificates.

### Firebase / Firestore

The codebase contains `firestore.rules` and Firebase references, but Firebase is fully shimmed to MongoDB (`src/firebase/firestore-shim.ts`). **No Firebase project is needed** for the Azure deployment.

### Python Runtime

The failure analysis feature (`src/scripts/failure_analysis.py`) requires Python 3. On Azure App Service Linux (Node.js stack), Python 3 is typically available. Verify via SSH:

```bash
az webapp ssh --name bugsense-studio --resource-group bugsense-rg
python3 --version
```

---

## Azure Portal Quick Links

| Action | URL |
|---|---|
| Azure Portal Home | https://portal.azure.com |
| Create Resource Group | https://portal.azure.com/#create/Microsoft.ResourceGroup |
| Create Cosmos DB | https://portal.azure.com/#create/Microsoft.DocumentDB |
| Create App Service | https://portal.azure.com/#create/Microsoft.WebSite |
| All App Services | https://portal.azure.com/#browse/Microsoft.Web%2Fsites |
| All Cosmos DB Accounts | https://portal.azure.com/#browse/Microsoft.DocumentDb%2FdatabaseAccounts |
| Azure Pricing Calculator | https://azure.microsoft.com/pricing/calculator/ |
| Azure CLI Install | https://learn.microsoft.com/en-us/cli/azure/install-azure-cli |

---

## Cost Estimation

| Resource | SKU | Approximate Monthly Cost |
|---|---|---|
| App Service | B1 (1 core, 1.75 GB) | ~$13 |
| App Service | P1v3 (2 cores, 8 GB) | ~$110 |
| Cosmos DB for MongoDB | 400 RU/s | ~$24 |
| Cosmos DB for MongoDB vCore | M25 (2 vCPU, 8 GB) | ~$125 |

> Prices vary by region. Check the [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/) for current rates.
