# AI Studio

AI Studio is a local AI chat application with a Next.js frontend and a FastAPI backend. It supports OpenAI and OpenAI-compatible providers such as OpenRouter, Groq, Together, DeepSeek, Ollama, and LM Studio.

Chats, encrypted provider settings, attachments, and generated images persist locally. The application includes streaming chat, file analysis, chat-triggered image generation, browser actions, conversation history, and a storage manager.

## Application URLs

| Service               | URL                            |
| --------------------- | ------------------------------ |
| Next.js application   | `http://127.0.0.1:3000`        |
| FastAPI health check  | `http://127.0.0.1:8000/health` |
| FastAPI documentation | `http://127.0.0.1:8000/docs`   |
| Legacy backend UI     | `http://127.0.0.1:8000`        |

## New Windows Laptop Setup (Git Bash or PowerShell)

This is the recommended clean-install flow for a new Windows laptop. Every command is provided for both **Git Bash** and **PowerShell**. Choose one terminal and follow its blocks consistently; do not mix path syntax between the two shells. These instructions do not use Command Prompt.

### What this setup does

- Installs the frontend and backend locally inside the cloned project.
- Uses one command, `npm run dev`, to start Next.js and FastAPI together.
- Lets you configure the API provider and models from the browser Settings dialog.
- Creates a fresh local database and storage layout with the same schema and behavior as every other installation.
- Does **not** download private chats, saved API keys, attachments, or generated images from GitHub.

### 1. Install the required software

Install these applications first:

1. **Git for Windows (includes Git Bash):** <https://git-scm.com/download/win>
2. **Node.js 24:** <https://nodejs.org/>
3. **Python 3.13 (64-bit):** <https://www.python.org/downloads/windows/>
4. **Visual Studio Code (optional):** <https://code.visualstudio.com/>

During the Python installation, enable **Add python.exe to PATH** and install the Python Launcher when offered. After all installers finish, close and reopen Git Bash or PowerShell.

**Git Bash:**

```bash
git --version
node --version
npm --version
py -3.13 --version
```

**PowerShell:**

```powershell
git --version
node --version
npm --version
py -3.13 --version
```

Every command must print a version. This project requires Node.js 24 (`package.json` accepts `>=24 <25`), npm 11 or newer, and Python 3.13.

### 2. Clone the GitHub repository

On GitHub, open **Code > HTTPS** and copy the repository URL. Then replace `<REPOSITORY_URL>` below with that URL:

**Git Bash:**

```bash
mkdir -p ~/Projects
cd ~/Projects
git clone <REPOSITORY_URL>
cd openai-chat
```

**PowerShell:**

```powershell
New-Item -ItemType Directory -Force "$HOME\Projects" | Out-Null
Set-Location "$HOME\Projects"
git clone <REPOSITORY_URL>
Set-Location "openai-chat"
```

If Git creates a folder with another name, use that folder name in the last command. Confirm that you are in the project root:

**Git Bash:**

```bash
ls package.json requirements.txt app.py
```

**PowerShell:**

```powershell
Get-ChildItem package.json, requirements.txt, app.py
```

All three file names must be printed.

### 3. Create the Python virtual environment and install the backend

**Git Bash:**

```bash
py -3.13 -m venv .venv
./.venv/Scripts/python.exe -m pip install --upgrade pip
./.venv/Scripts/python.exe -m pip install -r requirements.txt
```

**PowerShell:**

```powershell
py -3.13 -m venv .venv
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
```

The packages are installed only in this project's `.venv`; no global Python package installation is needed. Do not delete `.venv` after setup. You also do not need to activate it: `scripts/dev.mjs` automatically uses `.venv/Scripts/python.exe` when it exists.

### 4. Install the frontend

Run the npm clean-install command from the same project root:

**Git Bash:**

```bash
npm ci
```

**PowerShell:**

```powershell
npm ci
```

The command is `npm ci` (lowercase `ci`). It installs the exact frontend versions recorded in `package-lock.json`. Use it for a fresh clone instead of `npm install`.

### 5. Do not create `.env` for the normal Settings-based flow

No `.env` file is required when you want to configure the provider in the browser. The application already has local defaults for its name, ports, API proxy, CORS origins, and provider base URLs. It starts successfully without `.env` and without an API key.

`.env.example` is only an optional template for advanced cases, such as changing origins or supplying provider credentials through environment variables for an unattended deployment. For the normal laptop setup, skip it and continue directly to `npm run dev`.

### 6. Start the complete application with one command

**Git Bash:**

```bash
npm run dev
```

**PowerShell:**

```powershell
npm run dev
```

This command starts both processes:

- Next.js frontend: <http://127.0.0.1:3000>
- FastAPI backend: <http://127.0.0.1:8000>
- Backend health check through Next.js: <http://127.0.0.1:3000/health>

Wait until both processes report that they are ready, then open <http://127.0.0.1:3000>. Next.js proxies API, attachment, and generated-image requests to FastAPI. Press `Ctrl+C` once in the terminal to stop both processes.

After the one-time installation, the normal daily startup is only:

**Git Bash:**

```bash
cd ~/Projects/openai-chat
npm run dev
```

**PowerShell:**

```powershell
Set-Location "$HOME\Projects\openai-chat"
npm run dev
```

### 7. Configure the provider and model in the browser

1. Open <http://127.0.0.1:3000> and enter the workspace.
2. Open **Settings**.
3. Select the provider.
4. Enter its API key.
5. Check the provider's base URL. Use the exact URL required by that provider; OpenAI-compatible services commonly expose an endpoint ending in `/v1`.
6. Enter the exact chat model name and, if supported, an image model name.
7. Click **Test & activate provider**.

Activation is not just a local save: the backend calls the provider's models endpoint first. The provider must be reachable and the credentials must be valid. After a successful test, the backend encrypts the API key and stores the provider configuration locally. The browser never receives the saved key back.

For a local provider, start it before activation. Ollama defaults to `http://localhost:11434/v1`; an OpenAI-compatible local server such as LM Studio may use a URL like `http://127.0.0.1:1234/v1`.

### 8. Understand what is and is not transferred to the new laptop

GitHub contains the application code, dependency lock files, and database-creation logic. The following private runtime files are excluded by `.gitignore`, so a fresh clone does not contain data from the old laptop:

| Local item                                    | Location               | Fresh clone behavior                                      |
| --------------------------------------------- | ---------------------- | --------------------------------------------------------- |
| Conversations and messages                    | `data/chat.db`         | Not transferred; a fresh database is created              |
| Provider settings and model selections        | `data/chat.db`         | Not transferred; configure them again in Settings         |
| General database preferences                  | `data/chat.db`         | Not transferred; defaults are created                     |
| API-key encryption key                        | `data/.secret.key`     | Not transferred; created when a key is first encrypted    |
| Uploaded attachments                          | `data/attachments/`    | Not transferred; an empty directory is created            |
| Generated images                              | `data/generated/`      | Not transferred; an empty directory is created            |
| Tool permissions and last active-chat pointer | Browser `localStorage` | Browser/device-local; defaults are used on the new laptop |

The new installation therefore uses the **same database schema and application behavior**, but not the old database contents. This is the correct flow when old chats, memory/storage, private files, and credentials must stay on the old laptop.

Do not copy the old `data/chat.db` if you want to exclude old chats. Provider settings, model selections, preferences, conversations, and messages share that one SQLite database, so copying it also copies chat history. Likewise, an old encrypted API key can be decrypted only with its matching `data/.secret.key`. For a clean setup, copy neither file and configure the provider again in Settings.

Settings includes a Storage Manager for usage reporting, individual file deletion, orphan cleanup, and database optimization. Storage warnings begin at 5 GB, but the application has no hard storage limit.

## Verify the Installation

With dependencies installed, run these checks from the project root:

**Git Bash:**

```bash
npm run lint
npm run typecheck
npm test
npm run build
./.venv/Scripts/python.exe -m pytest tests/test_backend.py
```

**PowerShell:**

```powershell
npm run lint
npm run typecheck
npm test
npm run build
& ".\.venv\Scripts\python.exe" -m pytest tests/test_backend.py
```

Install Playwright's Chromium browser once, then run the browser tests:

**Git Bash:**

```bash
npx playwright install chromium
npm run test:e2e
```

**PowerShell:**

```powershell
npx playwright install chromium
npm run test:e2e
```

The E2E command starts both development services automatically.

## Run with Docker

Docker is optional. Install Docker Desktop from <https://www.docker.com/products/docker-desktop/>, start it, and run the same command in either shell:

**Git Bash:**

```bash
docker compose up --build
```

**PowerShell:**

```powershell
docker compose up --build
```

Open `http://localhost:3000`. The API is available at `http://localhost:8000`, and SQLite data is stored in the Docker volume named `ai_data`.

Docker publishes both ports on `127.0.0.1` only, runs the containers as non-root users, and waits for health checks before considering the stack ready.

Stop the containers with:

**Git Bash:**

```bash
docker compose down
```

**PowerShell:**

```powershell
docker compose down
```

## Project Structure

```text
backend/              FastAPI routes, services, repositories, and SQLite access
src/app/              Next.js routes and global styles
src/components/       Chat workspace and settings interface
src/services/         Browser-to-backend API client
static/ + templates/  Legacy UI served by FastAPI at port 8000
tests/                Backend, unit, and Playwright browser tests
data/                 Private runtime database, keys, attachments, and images
app.py                FastAPI ASGI entry point
```

`app.py` creates the backend application. Next.js runs separately on port `3000`; FastAPI runs on port `8000`.

## Common Problems

**`py -3.13` is not recognized:** reinstall Python with the PATH option enabled, or use the Python Launcher installed by python.org.

**PowerShell blocks virtual-environment activation:** activation is not required by these instructions because every Python command calls `.venv\Scripts\python.exe` directly.

**Port 3000 or 8000 is already in use:** stop the existing process, or run the service on another port and update `NEXT_PUBLIC_API_URL` and `ALLOWED_ORIGINS` accordingly.

**Frontend cannot reach the API:** stop old development terminals with `Ctrl+C`, run `npm run dev`, and confirm that `http://127.0.0.1:3000/health` returns JSON. Do not start only `npm run dev:web` for normal use; that command intentionally starts only Next.js.

**Provider looks disconnected after a restart:** first check `http://127.0.0.1:3000/health`. A stopped backend prevents the UI from reading saved settings, but does not delete them. Restart with `npm run dev`. Never remove `data/chat.db` or `data/.secret.key` unless you intentionally want to erase local data.

**A provider connection fails:** verify the API key, exact model identifier, and a base URL ending in `/v1` where required by the provider.

## Security and private data

- API keys entered in Settings are encrypted before being written to SQLite.
- The browser never receives saved API keys.
- `.env`, SQLite files, encryption keys, attachments, and generated images are excluded from Git and Docker build contexts.
- Keep `data/chat.db` and `data/.secret.key` together when restoring a backup.
- The app is designed as a local single-user workspace. Do not expose the API directly to the public internet without adding authentication and a reverse proxy.

## GitHub publishing checklist

Before the first push:

**Git Bash:**

```bash
git status
git check-ignore .env data/chat.db data/.secret.key data/attachments data/generated
npm run lint
npm run typecheck
npm test
./.venv/Scripts/python.exe -m pytest tests/test_backend.py
npm run build
```

**PowerShell:**

```powershell
git status
git check-ignore .env data/chat.db data/.secret.key data/attachments data/generated
npm run lint
npm run typecheck
npm test
& ".\.venv\Scripts\python.exe" -m pytest tests/test_backend.py
npm run build
```

The included GitHub Actions workflow runs lint, TypeScript, frontend tests, backend tests, production build, and Playwright browser tests for pushes and pull requests.
