module.exports = Object.freeze({
  runtime: 'open-interpreter',
  sourcePolicy: 'external-only',
  upstream: 'https://github.com/OpenInterpreter/open-interpreter',
  license: 'AGPL-3.0',
  vendoredSource: false,
  notes: [
    'AionUi does not vendor Open Interpreter source.',
    'Use an external sidecar, local command, or maintained fork outside this repository.',
    'All actions must enter through the AionUi action broker before this adapter runs.'
  ]
})
