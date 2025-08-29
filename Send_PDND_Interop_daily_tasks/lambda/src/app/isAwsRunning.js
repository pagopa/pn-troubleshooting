// Determine environment (basic check: is AWS metadata endpoint accessible?)
async function isRunningOnAWS() {
  try {
    const metadata = await fetch('http://169.254.169.254/latest/meta-data/', { timeout: 1000 });
    return metadata.ok;
  } catch (err) {
    return false;
  }
}