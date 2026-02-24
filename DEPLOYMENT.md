# Deployment Guide

This app runs on Azure App Service as a Docker container, deployed automatically via GitHub Actions on every push to `main`.

---

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed and logged in (`az login`)
- [GitHub CLI](https://cli.github.com/) (optional, for repo creation)
- An Azure subscription

---

## 1. Push to GitHub

If you don't have a remote yet:

```bash
gh repo create parking-coordinator --private --source=. --push
```

Or with an existing remote:

```bash
git add Dockerfile .dockerignore .github/
git commit -m "add Docker and CI/CD pipeline"
git push
```

---

## 2. Create Azure Resources

Run these commands once. Adjust the variable values at the top to your preference.

```bash
# Configuration — change these
RG=parking-coordinator-rg
LOCATION=westeurope
ACR=parkingcoordinatoracr         # must be globally unique, lowercase, alphanumeric
APP_PLAN=parking-coordinator-plan
APP_NAME=parking-coordinator-app  # must be globally unique

# Create resource group
az group create --name $RG --location $LOCATION

# Create Azure Container Registry
az acr create --name $ACR --resource-group $RG --sku Basic --admin-enabled true

# Create App Service plan (Linux, free tier)
az appservice plan create --name $APP_PLAN --resource-group $RG --is-linux --sku F1

# Create Web App (container — uses a placeholder image initially)
az webapp create --name $APP_NAME --resource-group $RG \
  --plan $APP_PLAN --deployment-container-image-name nginx

# Configure App Service to pull from ACR
az webapp config container set --name $APP_NAME --resource-group $RG \
  --docker-registry-server-url https://$ACR.azurecr.io \
  --docker-registry-server-user $(az acr credential show --name $ACR --query username -o tsv) \
  --docker-registry-server-password $(az acr credential show --name $ACR --query passwords[0].value -o tsv)

# Tell App Service which port the container listens on
az webapp config appsettings set --name $APP_NAME --resource-group $RG \
  --settings WEBSITES_PORT=3333
```

---

## 3. Set Application Environment Variables

Set all required secrets and config on the App Service. These are injected into the container at runtime.

```bash
az webapp config appsettings set --name $APP_NAME --resource-group $RG --settings \
  SLACK_BOT_TOKEN="xoxb-..." \
  SLACK_SIGNING_SECRET="..." \
  SLACK_APP_TOKEN="xapp-..." \
  NOTIFICATION_CHANNEL_ID="C..." \
  FIREBASE_PROJECT_ID="..." \
  FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n" \
  FIREBASE_CLIENT_EMAIL="...@....iam.gserviceaccount.com" \
  ADMIN_USER_IDS="..." \
  TIMEZONE="Europe/Zagreb" \
  NODE_ENV="production"
```

> **Note:** `FIREBASE_PRIVATE_KEY` must include literal `\n` characters, not actual newlines.

---

## 4. Create a Service Principal for GitHub Actions

GitHub Actions needs permission to push to ACR and deploy to App Service.

```bash
az ad sp create-for-rbac \
  --name parking-coordinator-deploy \
  --role contributor \
  --scopes /subscriptions/<YOUR_SUBSCRIPTION_ID>/resourceGroups/$RG \
  --sdk-auth
```

Copy the entire JSON output — you'll need it in the next step.

To find your subscription ID:

```bash
az account show --query id -o tsv
```

---

## 5. Add GitHub Secrets

Go to your repository → **Settings → Secrets and variables → Actions → New repository secret** and add the following:

| Secret | Value |
|---|---|
| `AZURE_CREDENTIALS` | Full JSON output from the service principal command |
| `REGISTRY_LOGIN_SERVER` | `<ACR_NAME>.azurecr.io` |
| `REGISTRY_USERNAME` | ACR admin username (see below) |
| `REGISTRY_PASSWORD` | ACR admin password (see below) |
| `AZURE_WEBAPP_NAME` | Your App Service name (value of `$APP_NAME`) |

Retrieve ACR credentials:

```bash
az acr credential show --name $ACR
```

---

## How the CI/CD Pipeline Works

The pipeline is defined in `.github/workflows/deploy.yml` and runs on every push to `main`.

**On pull requests to `main`:** runs lint and tests only.

**On push to `main`:**
1. **Lint & Test** — runs `npm run lint` and `npm test`
2. **Build** — builds a Docker image using the multi-stage `Dockerfile`
3. **Push** — pushes the image to Azure Container Registry, tagged with the Git commit SHA and `latest`
4. **Deploy** — deploys the commit-SHA-tagged image to Azure App Service

---

## Health Check

The app exposes a `/health` endpoint. Once deployed, verify it's running:

```
https://<APP_NAME>.azurewebsites.net/health
```

---

## F1 Plan Limitations

The free (F1) tier has some constraints to be aware of:

- **No always-on** — the app may sleep after inactivity and take a few seconds to wake
- **60 CPU minutes/day** limit
- **No custom domains with SSL** (requires B1 or higher)
- **Shared infrastructure** — no SLA guarantees

If the bot misses scheduled notifications due to cold starts or CPU limits, upgrade to the B1 paid tier:

```bash
az appservice plan update --name $APP_PLAN --resource-group $RG --sku B1
```
