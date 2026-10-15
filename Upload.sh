#!/bin/bash
set -e

# =======================================================
#  Dorm-3D: GitHub Automatic Repository Creator & Uploader
# =======================================================

echo ""
echo "=========================================================="
echo "       🎮 DORM-3D: GITHUB REPO CREATOR & UPLOADER 🎮"
echo "=========================================================="
echo ""

# Check for git
if ! command -v git &> /dev/null; then
    echo "❌ Error: git is not installed."
    exit 1
fi

# Check for curl
if ! command -v curl &> /dev/null; then
    echo "❌ Error: curl is not installed."
    exit 1
fi

# Step 1: Prompt for Personal Access Token (PAT)
echo "To create a repository and upload your code, GitHub requires"
echo "a Personal Access Token (PAT) with 'repo' scope."
echo "(Generate one at: https://github.com/settings/tokens)"
echo ""
echo -n "🔑 Enter your GitHub Personal Access Token (PAT): "
read -s GITHUB_TOKEN
echo ""

if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Error: Personal Access Token cannot be empty."
    exit 1
fi

# Step 2: Validate Token & Retrieve GitHub Username
echo "🔍 Validating token with GitHub API..."
USER_RESPONSE=$(curl -k -s -w "\n%{http_code}" -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github.v3+json" https://api.github.com/user)

HTTP_STATUS=$(echo "$USER_RESPONSE" | tail -n1)
USER_JSON=$(echo "$USER_RESPONSE" | sed '$d')

if [ "$HTTP_STATUS" -ne 200 ]; then
    echo "❌ Error: Failed to authenticate with GitHub (HTTP $HTTP_STATUS)."
    echo "Please ensure your token is valid and has 'repo' permissions."
    exit 1
fi

# Extract username
GITHUB_USERNAME=$(echo "$USER_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin).get('login', ''))" 2>/dev/null || true)

if [ -z "$GITHUB_USERNAME" ]; then
    echo "❌ Error: Could not determine GitHub username from token."
    exit 1
fi

echo "✅ Authenticated as GitHub user: @$GITHUB_USERNAME"
echo ""

# Step 3: Ask for Repository Visibility (Public/Private)
echo -n "🔒 Should the repository be public or private? (public/private) [default: public]: "
read REPO_VISIBILITY
REPO_VISIBILITY=$(echo "$REPO_VISIBILITY" | tr '[:upper:]' '[:lower:]')

IS_PRIVATE="false"
if [ "$REPO_VISIBILITY" = "private" ]; then
    IS_PRIVATE="true"
fi

REPO_NAME="Dorm-3d"
echo ""
echo "📦 Checking repository '$REPO_NAME' on GitHub..."

CREATE_PAYLOAD=$(cat <<EOF
{
  "name": "$REPO_NAME",
  "description": "3D Survival Simulator for Web with custom Ghost Monster, House, CCTV, and P2P Multiplayer",
  "private": $IS_PRIVATE,
  "auto_init": false
}
EOF
)

CREATE_RESPONSE=$(curl -k -s -w "\n%{http_code}" -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -d "$CREATE_PAYLOAD" \
  https://api.github.com/user/repos)

CREATE_STATUS=$(echo "$CREATE_RESPONSE" | tail -n1)
CREATE_JSON=$(echo "$CREATE_RESPONSE" | sed '$d')

if [ "$CREATE_STATUS" -eq 201 ]; then
    echo "✅ Successfully created repository: https://github.com/$GITHUB_USERNAME/$REPO_NAME"
elif [ "$CREATE_STATUS" -eq 422 ]; then
    echo "ℹ️ Repository '$REPO_NAME' already exists on your GitHub account. Proceeding with existing repo..."
else
    echo "⚠️ GitHub API returned status $CREATE_STATUS:"
    echo "$CREATE_JSON"
    echo "Attempting to proceed anyway..."
fi

# Step 4: Configure Local Git Repository
echo ""
echo "📂 Preparing local git repository..."

cd "$(dirname "$0")"

# Configure user info if not set
if [ -z "$(git config user.name)" ]; then
    git config user.name "$GITHUB_USERNAME"
fi
if [ -z "$(git config user.email)" ]; then
    git config user.email "${GITHUB_USERNAME}@users.noreply.github.com"
fi

# Initialize git if needed
if [ ! -d ".git" ]; then
    git init
    echo "✅ Initialized empty Git repository."
fi

# Build project to ensure dist/ is fresh
echo "🔨 Building production bundle..."
npx vite build

# Add all files to staging
echo "➕ Staging project files..."
git add .

# Check if there are changes to commit
if git diff --staged --quiet; then
    echo "ℹ️ No new changes to commit."
else
    git commit -m "Update Dorm-3d with GitHub Pages deployment support"
    echo "✅ Committed project files."
fi

# Set branch to main now that commit exists
git branch -M main

# Step 5: Configure Remote & Push Main Branch
echo "🚀 Pushing main branch to https://github.com/$GITHUB_USERNAME/$REPO_NAME..."

# Set authenticated remote URL for push
AUTHENTICATED_REMOTE="https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"
CLEAN_REMOTE="https://github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

git remote remove origin 2>/dev/null || true
git remote add origin "$AUTHENTICATED_REMOTE"

# Push to main branch
git push -u origin main --force

# Step 6: Deploy directly to gh-pages branch for instant live play!
echo "🌐 Deploying built files directly to 'gh-pages' branch..."
GH_PAGES_COMMIT=$(git subtree split --prefix dist main 2>/dev/null || true)
if [ -n "$GH_PAGES_COMMIT" ]; then
    git push "$AUTHENTICATED_REMOTE" "$GH_PAGES_COMMIT:refs/heads/gh-pages" --force
    echo "✅ 'gh-pages' branch updated successfully!"
fi

# Remove sensitive token from .git/config after successful push
git remote set-url origin "$CLEAN_REMOTE"

echo ""
echo "=========================================================="
echo "🎉 SUCCESS! All files have been uploaded to GitHub!"
echo "🔗 Repository: https://github.com/$GITHUB_USERNAME/$REPO_NAME"
echo "🎮 Live Game URL: https://$GITHUB_USERNAME.github.io/$REPO_NAME/"
echo ""
echo "👉 If GitHub Pages is not live yet, go to:"
echo "   https://github.com/$GITHUB_USERNAME/$REPO_NAME/settings/pages"
echo "   and ensure Source is set to 'Deploy from a branch' -> 'gh-pages' / '(root)'"
echo "=========================================================="
echo ""
