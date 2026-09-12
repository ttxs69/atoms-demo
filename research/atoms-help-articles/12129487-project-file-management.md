# Project File Management

- Source: https://help.atoms.dev/en/articles/12129487-project-file-management
- Summary: Guide to uploading assets, importing local projects, and downloading project source code
- Updated: Jul 29, 2026

---

Learn how to upload assets, import existing local projects, and download project source code to your local machine in Atoms.

## Uploading Files, Folders, and Images

Uploading code files, documents, or images provides essential context to your AI agent team so they can build your project accurately.

### How to Upload & Reference Assets

1. **Upload Files & Folders**:
   - Click the **+ Add** button at the bottom-left of the chat input box to pick files or folders (up to 100MB per file).
   - Once uploaded, the asset displays as `# FileName` in the prompt box.
   - To reference uploaded files during future chats, simply type `#` to pick from the auto-complete dropdown list.
2. **Upload & Paste Images**:
   - Upload images via file picker or paste directly into the chat input box using `Ctrl+V`.
   - Uploaded images display as `# ImageName`.

## Importing Local Projects

You can import an existing local codebase into Atoms for incremental development:

1. **Package & Upload**: Zip your local project code and drag it directly into the chat dialog box, or click the **Global Folder** icon in the upper-left corner → **Add New File**.
2. **Extract to Workspace**: Ask Alex to extract the archive to your active workspace.  
   *Example prompt*: `@Alex, please help extract this zip file #/data/chats/chatid/workspace/upload/project.zip to workspace/project_name`
3. **Read Project Specs**: Have your agents read the codebase and inspect `README.md` before initiating new feature requests.

## Downloading Project Files & Source Code

Atoms offers multiple convenient ways to export your code and project files to local storage:

### 3 Methods to Download

1. **Directory Download**:
   - Click **Editor** on the right navigation panel.
   - Right-click any directory or folder in the Files tree.
   - Click **Download**.
2. **Single File Download**:
   - Open the **Editor** panel.
   - Select a specific file and click the download icon in the bottom-right corner.
3. **Global Folder Download**:
   - Click the **Folder** icon in the top-left corner.
   - Locate your target file in the `chats` directory and click **Download**.
