import express from 'express'
import { store } from '../store.js'

const router = express.Router()

router.get('/', (req, res) => {
  res.json({ ok: true, config: store.getMaskedConfig() })
})

router.post('/', (req, res) => {
  const { apiKey, baseUrl, model, temperature, permissionMode } = req.body || {}
  const patch = {}
  if (typeof apiKey === 'string' && apiKey && !apiKey.includes('***')) patch.apiKey = apiKey.trim()
  if (typeof baseUrl === 'string' && baseUrl) patch.baseUrl = baseUrl.trim()
  if (typeof model === 'string' && model) patch.model = model.trim()
  if (typeof temperature === 'number') patch.temperature = temperature
  if (permissionMode === 'default' || permissionMode === 'full') patch.permissionMode = permissionMode
  const next = store.setConfig(patch)
  res.json({ ok: true, config: { ...next, apiKey: next.apiKey ? '***' : '' } })
})

export default router
