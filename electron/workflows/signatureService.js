const crypto = require('crypto')

function verifyEd25519({ payload, publicKeyPem, signatureBase64 }) {
  if (!publicKeyPem || !signatureBase64) return { state: 'unsigned', verified: false }
  try {
    const verified = crypto.verify(null, Buffer.from(payload), publicKeyPem, Buffer.from(signatureBase64, 'base64'))
    return { state: verified ? 'verified' : 'failed', verified }
  } catch (error) {
    return { state: 'failed', verified: false, error: error.message }
  }
}

function signatureState(signature, required = false) {
  if (!signature?.value) return required ? 'missing_required' : 'unsigned'
  return 'present'
}

module.exports = { verifyEd25519, signatureState }
