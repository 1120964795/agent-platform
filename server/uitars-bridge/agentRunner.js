const { GUIAgent } = require('@ui-tars/sdk')

const ACTION_SPACES = [
  "click(start_box='[x1, y1, x2, y2]')",
  "left_double(start_box='[x1, y1, x2, y2]')",
  "right_single(start_box='[x1, y1, x2, y2]')",
  "drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')",
  "hotkey(key='')",
  "type(content='')",
  "scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')",
  "wait()",
  "finished()",
  "call_user()"
]

function parseBox(str, screenW, screenH) {
  const match = String(str).match(/\[([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\]/)
  if (!match) return [0, 0, 0, 0]
  let vals = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])]
  if (vals.every(v => v <= 1 && v >= 0)) {
    vals = [vals[0] * screenW, vals[1] * screenH, vals[2] * screenW, vals[3] * screenH]
  }
  return vals
}

function resolveClickCoords(action_inputs, screenW, screenH) {
  const sc = action_inputs.start_coords
  if (sc && Array.isArray(sc) && sc.length >= 2) {
    return { x: Math.round(sc[0]), y: Math.round(sc[1]) }
  }
  const box = parseBox(action_inputs.start_box, screenW, screenH)
  return {
    x: Math.round((box[0] + box[2]) / 2),
    y: Math.round((box[1] + box[3]) / 2)
  }
}

function createAgentRunner(opts = {}) {
  const screenshotImpl = opts.screenshotImpl || (async () => {
    const screenshot = require('screenshot-desktop')
    return await screenshot()
  })
  const modelConfig = {
    baseURL: opts.modelEndpoint || 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey: opts.modelApiKey || '',
    model: opts.modelName || 'ep-20260509193331-bf5px'
  }
  const nutjs = opts.nutjs || require('@nut-tree-fork/nut-js')

  function createOperator(onAction) {
    return new (class {
      static MANUAL = { ACTION_SPACES }

      async screenshot() {
        const buf = await screenshotImpl()
        return {
          base64: Buffer.from(buf).toString('base64'),
          scaleFactor: 1.0
        }
      }

      async execute(params) {
        const { parsedPrediction, screenWidth, screenHeight } = params
        const { action_type, action_inputs } = parsedPrediction

        if (action_type === 'click' || action_type === 'left_single') {
          const { x, y } = resolveClickCoords(action_inputs, screenWidth, screenHeight)
          await nutjs.mouse.move(nutjs.straightTo(new nutjs.Point(x, y)))
          await nutjs.mouse.leftClick()
          onAction({ ok: true, x, y, action_type })
        } else if (action_type === 'left_double') {
          const { x, y } = resolveClickCoords(action_inputs, screenWidth, screenHeight)
          await nutjs.mouse.move(nutjs.straightTo(new nutjs.Point(x, y)))
          await nutjs.mouse.leftClick()
          await nutjs.mouse.leftClick()
          onAction({ ok: true, x, y, action_type })
        } else if (action_type === 'right_single') {
          const { x, y } = resolveClickCoords(action_inputs, screenWidth, screenHeight)
          await nutjs.mouse.move(nutjs.straightTo(new nutjs.Point(x, y)))
          await nutjs.mouse.rightClick()
          onAction({ ok: true, x, y, action_type })
        } else if (action_type === 'type') {
          await nutjs.keyboard.type(String(action_inputs.content || ''))
          onAction({ ok: true, typed: action_inputs.content })
        } else if (action_type === 'hotkey') {
          const keys = String(action_inputs.key || '').split('+')
          for (const key of keys) {
            await nutjs.keyboard.pressKey(key.trim())
          }
          for (const key of keys.reverse()) {
            await nutjs.keyboard.releaseKey(key.trim())
          }
          onAction({ ok: true, key: action_inputs.key })
        } else if (action_type === 'scroll') {
          const { x, y } = resolveClickCoords(action_inputs, screenWidth, screenHeight)
          const dir = action_inputs.direction || 'down'
          const amount = dir === 'up' ? 120 : dir === 'down' ? -120 : 0
          await nutjs.mouse.move(nutjs.straightTo(new nutjs.Point(x, y)))
          await nutjs.mouse.scroll(amount)
          onAction({ ok: true, x, y, direction: dir })
        }
      }
    })()
  }

  return {
    ready: () => Boolean(modelConfig.apiKey && modelConfig.model),

    async screenshot() {
      return await screenshotImpl()
    },

    async semanticClick(instruction) {
      let lastActionResult = null
      const controller = new AbortController()

      const operator = createOperator((result) => {
        lastActionResult = result
        controller.abort()
      })

      const agent = new GUIAgent({
        model: modelConfig,
        operator,
        maxLoopCount: 5,
        signal: controller.signal
      })

      try {
        await agent.run(instruction)
      } catch (e) {
        if (e?.name !== 'AbortError') throw e
      }

      if (lastActionResult && lastActionResult.ok) {
        return { ok: true, x: lastActionResult.x, y: lastActionResult.y, instruction }
      }
      return { ok: false, reason: 'model did not produce a click action', raw: lastActionResult }
    },

    async type(text) {
      await nutjs.keyboard.type(String(text))
      return { ok: true, typed: text }
    }
  }
}

module.exports = { createAgentRunner }
