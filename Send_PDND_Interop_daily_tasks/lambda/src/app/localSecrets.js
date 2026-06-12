const fs = require('fs');

// Get secret from local file
function getSecretFromLocal() {
  try {
    const raw = fs.readFileSync(LOCAL_SECRET_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read local secret file:', err.message);
    throw err;
  }
}