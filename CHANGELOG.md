# Changelog

This file records notable changes made after the initial GitHub release.

## [Unreleased] - 2026-07-22

> These changes are currently in the maintainer's local working tree. Existing
> clones can receive them only after the maintainer commits the changes and runs
> `git push origin main`.

### Added

- Added Designer and Coder agent modes. Both modes are implemented and validated
  by the backend; unsupported agent names are rejected.
- Added provider model discovery so available models can be selected from the chat
  header.
- Added application-themed model and agent menus.

### Changed

- Increased the per-file attachment limit from **8 MB to 205 MB**.
- Increased the Next.js proxy request limit to **280 MB** to accommodate Base64
  upload overhead.
- Limited each Coder request to a maximum of **8 tool steps**.
- Applied workspace tool limits: **2 MB** per read, **500,000 characters** per
  write, **100,000 characters** per result, **100 search matches**, and **500
  directory entries**.
- A new workspace visit now starts a fresh conversation. Previous conversations
  are opened explicitly from the sidebar.
- Added SQLite WAL mode, a 30-second busy timeout, and a targeted attachment
  migration.
- Removed the runtime Google Fonts request and changed the chat workspace to load
  dynamically.

### Security

- Coder access is restricted to the repository root. Absolute paths and `..` path
  escapes are blocked.
- Protected paths and sensitive files include `.git`, `.next`, `.env`, `data`,
  `node_modules`, secrets, private keys, and databases.
- The Coder agent must read an existing file during the current request before it
  can overwrite that file.

## Update an existing clone with Windows PowerShell

Use **PowerShell**, not Command Prompt, for the commands below. Replace the example
project path with the location of your clone.

### Option A: Your working tree is clean

1. Stop the running application by pressing `Ctrl+C` in its terminal.

////////////

3. Confirm that this is the correct repository, branch, and remote:

   ```powershell
   git branch --show-current
   git remote -v
   git status
   ```

   The branch should normally be `main`, the `origin` remote should point to this
   repository, and `git status` should report a clean working tree.

4. Download remote information and pull the latest `main` branch safely:

   ```powershell
   git fetch origin
   git pull --ff-only origin main
   ```

5. Install the exact frontend dependencies from `package-lock.json`:

   ```powershell
   npm ci
   ```

6. Create the local Python virtual environment if it does not already exist:

   ```powershell
   if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
       py -3 -m venv .venv
   }
   ```

7. Update `pip` and install the backend dependencies into that virtual
   environment:

   ```powershell
   & ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
   & ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
   ```

8. Verify the updated project:

   ```powershell
   npm run typecheck
   npm test
   & ".\.venv\Scripts\python.exe" -m pytest -q
   ```

9. Start the application:

   ```powershell
   npm run dev
   ```

10. Open `http://127.0.0.1:3000` in your browser. To let the Coder agent use
    repository tools, open **Settings > Tool permissions** and enable workspace
    access.

### Option B: You have uncommitted local changes

Do not pull directly over uncommitted work. Save it temporarily, update the clone,
and then restore it:

1. Move into the repository and inspect your changes:

   ```powershell
   Set-Location "C:\path\to\ALL-AI-Studio"
   git status
   git diff
   ```

2. Stash tracked and untracked files:

   ```powershell
   git stash push --include-untracked --message "before AI Studio update"
   git stash list
   ```

3. Pull the update and synchronize dependencies:

   ```powershell
   git fetch origin
   git pull --ff-only origin main
   npm ci

   if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
       py -3 -m venv .venv
   }

   & ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt
   ```

4. Restore your local changes:

   ```powershell
   git stash pop
   git status
   ```

5. If Git reports conflicts, open each conflicted file, resolve the
   `<<<<<<<`, `=======`, and `>>>>>>>` sections, and then stage the resolved files:

   ```powershell
   git add .
   git status
   ```

6. Run the verification commands and restart the app:

   ```powershell
   npm run typecheck
   npm test
   & ".\.venv\Scripts\python.exe" -m pytest -q
   npm run dev
   ```

For important local work, creating a backup branch and committing the work before
pulling is safer than relying only on a stash:

```powershell
git switch -c backup-before-update
git add .
git commit -m "Back up local work before update"
git switch main
git pull --ff-only origin main
```

## [1.0.0] - 2026-07-20

- Initial project publication at commit `71ebaad`.

[Unreleased]: https://github.com/malikmuhammadhuzaifaawan-tech/ALL-AI-Studio/compare/71ebaad...HEAD
