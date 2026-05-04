const DEFAULT_PROJECT_SETTINGS = {
  watchEnabled: true,
  embeddingEnabled: false,
  debounceMs: 3000,
  maxFileBytes: 524288,
  includeExtensions: [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.py',
    '.java',
    '.json',
    '.md',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.xml',
    '.gradle',
    '.html',
    '.css'
  ],
  includeFilenames: [
    'Dockerfile',
    '.env.example'
  ],
  excludeGlobs: [
    '.git/**',
    'node_modules/**',
    '.venv/**',
    'venv/**',
    '__pycache__/**',
    'dist/**',
    'build/**',
    'target/**',
    'coverage/**',
    '.next/**',
    '.cache/**',
    '.turbo/**',
    '.idea/**',
    '.vscode/**',
    '.env',
    '*.env',
    '*.pem',
    '*.key',
    '*.crt',
    '*.pfx',
    '*.sqlite',
    '*.db',
    '*.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'poetry.lock',
    'Pipfile.lock',
    '*.zip',
    '*.7z',
    '*.rar',
    '*.png',
    '*.jpg',
    '*.jpeg',
    '*.gif',
    '*.pdf',
    '*.docx',
    '*.pptx'
  ]
}

const EMPTY_PROJECT_PROFILE = {
  language: '',
  frameworks: [],
  packageManagers: [],
  dependencyFiles: [],
  entryFiles: [],
  startCommands: [],
  testCommands: [],
  evidence: [],
  updatedAt: ''
}

module.exports = {
  DEFAULT_PROJECT_SETTINGS,
  EMPTY_PROJECT_PROFILE
}
