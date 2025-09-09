# GitHub Repository Analyzer Script

## 📝 Overview

This script is a command-line tool designed to analyze a list of GitHub repositories. It checks each repository for specific branch protection rules on the `main` and `develop` branches.

The script reads its list of target repositories from a central JSON configuration file located in a separate GitHub repository. After execution, it generates detailed reports identifying repositories that are empty, unprotected, or have specific security rules missing.

---

## 🛠️ Prerequisites

Before you can run this script, you need to have the following command-line tools installed on your client machine.

* **Bash**: The script is written in Bash. This is pre-installed on virtually all Linux and macOS systems.
* **cURL**: A tool for making HTTP requests. It is used to interact with the GitHub API.
* **jq**: A lightweight and flexible command-line JSON processor. It is used to parse the API responses.

---