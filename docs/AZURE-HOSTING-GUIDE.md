# Azure Hosting Guide — BugSense Studio

This guide covers deploying the BugSense Studio Next.js application to Microsoft Azure.

## Application Overview

| Component | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions) |
| Runtime | Node.js ≥ 20 |
| Database | MongoDB (via MongoClient) |
| Authentication | NextAuth v4 (Credentials provider) |
| AI | Google Genai SDK / DHL GenAI Gateway |
| Python | Optional — `failure_analysis.py` script |

---

## Option 1: Azure App Service (Recommended)

### 1. Provision Azure Resources

| Resource | SKU | Purpose |
|---|---|---|
| Azure App Service (Linux) | B1 or higher | Hosts the Next.js server |
| Azure Cosmos DB for MongoDB | RU-based or vCore | Production database |
| Azure Key Vault | Standard | Secret management (optional) |

```bash
# Create a resource group
az group create --name bugsense-rg --location eastus

# Create an App Service plan
az appservice plan create --name bugsense-plan --resource-group bugsense-rg \
  --is-linux --sku B1

# Create the web app
az webapp create --name bugsense-studio --resource-group bugsense-rg \
  --plan bugsense-plan --runtime "NODE:20-lts"

# Create Cosmos DB with MongoDB API
az cosmosdb create --name bugsense-db --resource-group bugsense-rg \
  --kind MongoDB --server-version 6.0
```

### 2. Configure Environment Variables

Set these in **App Service → Configuration → Application Settings**:

| Variable | Value | Required |
|---|---|---|
| `NEXTAUTH_SECRET` | A cryptographically strong random string | **Yes** |
| `NEXTAUTH_URL` | `https://bugsense-studio.azurewebsites.net` | **Yes** |
| `WEBSITES_PORT` | `3000` | **Yes** |
| `GEMINI_API_KEY` | Your Google Gemini API key | If using Google AI provider |
| `DHL_API_KEY` | Your DHL GenAI Gateway key | If using DHL provider |
| `DHL_ENDPOINT` | DHL endpoint URL | If using DHL provider |
| `GITLAB_INSECURE_TLS` | `true` or `false` | If GitLab uses self-signed certs |

> **Security:** The default `NEXTAUTH_SECRET` in the codebase is `local-dev-nextauth-secret-change-me`. This **must** be replaced in production. Generate one with: `openssl rand -base64 32`

### 3. Configure MongoDB Connection

The app reads its MongoDB connection from `data/mongo-config.json`. You have two options:

**Option A — Update the file before deployment:**

Edit `data/mongo-config.json`:

```json
{
  "uri": "mongodb+srv://<user>:<password>@<cluster>.mongo.cosmos.azure.com/bugsense?tls=true&authMechanism=SCRAM-SHA-256&retrywrites=false",
  "dbName": "bugsense"
}
```

**Option B — Update via the Configuration UI after deployment:**

1. Deploy with the default localhost URI
2. Navigate to **Settings → Configuration** in the app
3. Update the MongoDB URI and database name
4. The app writes changes to `data/mongo-config.json` at runtime

> **Note:** Azure App Service persists files under `/home`. Ensure the `data/` directory is within the persistent storage path, or set the app setting `WEBSITE_RUN_FROM_PACKAGE=0` to allow file writes.

### 4. Build and Deploy

#### Option A: Azure CLI

```bash
# From the project root
npm ci
npm run build

# Deploy
az webapp up --name bugsense-studio --resource-group bugsense-rg \
  --runtime "NODE:20-lts"
```

Set the startup command:

```bash
az webapp config set --name bugsense-studio --resource-group bugsense-rg \
  --startup-file "npm run start"
```

#### Option B: GitHub Actions CI/CD

Create `.github/workflows/azure-deploy.yml`:

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

#### Option C: VS Code Azure Extension

1. Install the **Azure App Service** extension
2. Right-click the project folder → **Deploy to Web App**
3. Select your App Service instance
4. VS Code handles the zip deployment

### 5. Seed the Database

After deployment, create an initial admin user:

```bash
# Connect to your Cosmos DB / MongoDB instance and run:
npx tsx scripts/create-test-user.ts
```

Or use the MongoDB shell / Azure Data Explorer to insert a user document into the `users` collection.

---

## Option 2: Azure Container Apps (Docker)

Better for full runtime control, especially if you need Python for the failure analysis script.

### 1. Create a Dockerfile

Create `Dockerfile` in the project root:

```dockerfile
FROM node:20-alpine

# Install Python 3 for failure_analysis.py
RUN apk add --no-cache python3 py3-pip

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Build the Next.js app
RUN npm run build

# Expose the default Next.js port
EXPOSE 3000

# Start the production server
CMD ["npm", "start"]
```

Add a `.dockerignore`:

```
node_modules
.next
.git
*.md
```

### 2. Build and Deploy

```bash
# Create a Container Apps environment
az containerapp env create --name bugsense-env --resource-group bugsense-rg \
  --location eastus

# Build and deploy in one step
az containerapp up --name bugsense --resource-group bugsense-rg \
  --environment bugsense-env \
  --source . \
  --ingress external \
  --target-port 3000 \
  --env-vars \
    NEXTAUTH_SECRET="<your-secret>" \
    NEXTAUTH_URL="https://bugsense.<region>.azurecontainerapps.io" \
    WEBSITES_PORT=3000
```

### 3. Configure Custom Domain (Optional)

```bash
az containerapp hostname add --name bugsense --resource-group bugsense-rg \
  --hostname bugsense.yourdomain.com

az containerapp hostname bind --name bugsense --resource-group bugsense-rg \
  --hostname bugsense.yourdomain.com \
  --environment bugsense-env \
  --validation-method CNAME
```

---

## Option 3: Azure Static Web Apps

**Not recommended** for this application. BugSense Studio relies on:

- Server Actions (`'use server'` directives)
- API routes with server-side logic
- NextAuth session management
- `child_process.spawn` for Python scripts
- Runtime file system writes (`data/mongo-config.json`)

These require a full Node.js server and are not compatible with static hosting.

---

## Post-Deployment Checklist

- [ ] `NEXTAUTH_SECRET` is set to a strong, unique value
- [ ] `NEXTAUTH_URL` matches the actual deployment URL
- [ ] MongoDB / Cosmos DB connection is configured and reachable
- [ ] Initial admin user is created in the `users` collection
- [ ] AI provider credentials are configured (Gemini or DHL)
- [ ] TLS certificates are valid for all external endpoints
- [ ] App responds at the deployment URL with the login page
- [ ] Custom domain and HTTPS configured (if applicable)

---

## Important Considerations

### File System Persistence

The app writes to `data/mongo-config.json` when admins update MongoDB settings via the Configuration page. On Azure App Service, files outside `/home` are ephemeral and lost on restart.

**Mitigation:** Ensure the working directory is under `/home/site/wwwroot` (the default for App Service deployments), or refactor config to use environment variables instead.

### Scaling to Multiple Instances

- The MongoDB connection pool uses a Node.js global singleton — this works correctly per instance.
- `data/mongo-config.json` is file-based. With multiple instances, changes made on one instance won't propagate to others unless the file is on shared storage.
- **Recommendation:** For multi-instance deployments, move MongoDB config to environment variables or a shared config store (e.g., Azure App Configuration).

### TLS and Certificates

- **Cosmos DB** requires TLS — connection strings include `tls=true` by default.
- **DHL GenAI Gateway** — if the endpoint uses a self-signed or corporate certificate, enable **Insecure TLS** in the app's Configuration page. The app uses an undici `Agent` with `rejectUnauthorized: false` for this case.
- **GitLab integration** — set `GITLAB_INSECURE_TLS=true` if your GitLab instance uses self-signed certificates.

### Firebase / Firestore

The codebase contains `firestore.rules` and Firebase references, but Firebase is fully shimmed to MongoDB (`src/firebase/firestore-shim.ts`). **No Firebase project is needed** for the Azure deployment.

### Python Runtime

The failure analysis feature (`src/scripts/failure_analysis.py`) requires Python 3. On Azure App Service Linux (Node.js stack), Python 3 is typically available. On Container Apps, include it in your Dockerfile. Verify with:

```bash
# SSH into the App Service
az webapp ssh --name bugsense-studio --resource-group bugsense-rg

# Check Python availability
python3 --version
```

---

## Cost Estimation

| Resource | SKU | Approximate Monthly Cost |
|---|---|---|
| App Service | B1 (1 core, 1.75 GB) | ~$13 |
| App Service | P1v3 (2 cores, 8 GB) | ~$110 |
| Cosmos DB for MongoDB | 400 RU/s | ~$24 |
| Cosmos DB for MongoDB vCore | M25 (2 vCPU, 8 GB) | ~$125 |
| Container Apps | 0.5 vCPU, 1 GB | ~$15 |

> Prices are estimates and vary by region. Check the [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/) for current rates.
