const fs = require('fs')
const path = require('path')
const { store } = require('../../store')
const { EMPTY_PROJECT_PROFILE } = require('./defaults')
const { safeJoin } = require('./pathUtils')

function uniqueStrings(items = []) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))]
}

function fileExists(fsRef, filePath) {
  try {
    return fsRef.existsSync(filePath) && fsRef.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function dirExists(fsRef, dirPath) {
  try {
    return fsRef.existsSync(dirPath) && fsRef.statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

function readLines(fsRef, filePath) {
  try {
    return fsRef.readFileSync(filePath, 'utf-8').split(/\r?\n/)
  } catch {
    return []
  }
}

function citation(relativePath, lines, reason, extras = {}) {
  return {
    path: relativePath,
    lineStart: extras.lineStart || 1,
    lineEnd: extras.lineEnd || Math.max(1, lines.length),
    chunkType: extras.chunkType || 'config',
    reason
  }
}

function findLine(lines, pattern) {
  const matcher = pattern instanceof RegExp
    ? (line) => pattern.test(line)
    : (line) => String(line).includes(pattern)
  const index = lines.findIndex(matcher)
  return index === -1 ? 1 : index + 1
}

function parsePackageJson(lines) {
  try {
    return JSON.parse(lines.join('\n'))
  } catch {
    return null
  }
}

function getPackageManagers(rootPath, fsRef) {
  const managers = []
  if (fileExists(fsRef, safeJoin(rootPath, 'pnpm-lock.yaml'))) managers.push('pnpm')
  if (fileExists(fsRef, safeJoin(rootPath, 'yarn.lock'))) managers.push('yarn')
  if (fileExists(fsRef, safeJoin(rootPath, 'package-lock.json'))) managers.push('npm')
  if (fileExists(fsRef, safeJoin(rootPath, 'package.json'))) managers.push('npm')
  return uniqueStrings(managers)
}

function commandForScript(manager, scriptName) {
  if (manager === 'pnpm') return `pnpm ${scriptName}`
  if (manager === 'yarn') return `yarn ${scriptName}`
  if (scriptName === 'start') return 'npm start'
  if (scriptName === 'test') return 'npm test'
  return `npm run ${scriptName}`
}

class ProjectProfileService {
  constructor(options = {}) {
    this.store = options.storeRef || store
    this.fs = options.fsRef || fs
    this.now = options.now || (() => new Date())
  }

  get(projectId) {
    return this.store.getProjectProfile(projectId)
  }

  refresh(project) {
    const profile = this.inspect(project)
    return this.store.upsertProjectProfile(profile)
  }

  inspect(project) {
    const rootPath = project.rootPath
    const evidence = []
    const dependencyFiles = []
    const entryFiles = []
    const startCommands = []
    const testCommands = []
    const languages = []
    const frameworks = []
    const packageManagers = []

    this.inspectNode(rootPath, {
      evidence,
      dependencyFiles,
      entryFiles,
      startCommands,
      testCommands,
      languages,
      frameworks,
      packageManagers
    })

    this.inspectPython(rootPath, {
      evidence,
      dependencyFiles,
      entryFiles,
      startCommands,
      testCommands,
      languages,
      frameworks,
      packageManagers
    })

    this.inspectJava(rootPath, {
      evidence,
      dependencyFiles,
      entryFiles,
      startCommands,
      testCommands,
      languages,
      frameworks,
      packageManagers
    })

    const uniqueLanguages = uniqueStrings(languages)
    return {
      ...EMPTY_PROJECT_PROFILE,
      projectId: project.id,
      language: uniqueLanguages.length > 1 ? 'Mixed' : (uniqueLanguages[0] || ''),
      languages: uniqueLanguages,
      frameworks: uniqueStrings(frameworks),
      packageManagers: uniqueStrings(packageManagers),
      dependencyFiles,
      entryFiles,
      startCommands,
      testCommands,
      evidence,
      updatedAt: this.now().toISOString()
    }
  }

  inspectNode(rootPath, bucket) {
    const packagePath = safeJoin(rootPath, 'package.json')
    if (!fileExists(this.fs, packagePath)) return

    const lines = readLines(this.fs, packagePath)
    const pkg = parsePackageJson(lines)
    bucket.languages.push('JavaScript')
    bucket.packageManagers.push(...getPackageManagers(rootPath, this.fs))
    bucket.dependencyFiles.push(citation('package.json', lines, 'Declares Node package metadata and scripts.'))
    bucket.evidence.push(citation('package.json', lines, 'Found package.json.'))

    const deps = {
      ...(pkg?.dependencies || {}),
      ...(pkg?.devDependencies || {})
    }
    if (deps.vite || fileExists(this.fs, safeJoin(rootPath, 'vite.config.js')) || fileExists(this.fs, safeJoin(rootPath, 'vite.config.ts'))) bucket.frameworks.push('Vite')
    if (deps.next || fileExists(this.fs, safeJoin(rootPath, 'next.config.js')) || fileExists(this.fs, safeJoin(rootPath, 'next.config.mjs'))) bucket.frameworks.push('Next.js')
    if (deps.react) bucket.frameworks.push('React')
    if (deps.vue) bucket.frameworks.push('Vue')
    if (deps.express) bucket.frameworks.push('Express')

    const manager = bucket.packageManagers[0] || 'npm'
    const scripts = pkg?.scripts || {}
    for (const scriptName of ['dev', 'start', 'serve']) {
      if (!scripts[scriptName]) continue
      const line = findLine(lines, new RegExp(`"${scriptName}"\\s*:`))
      bucket.startCommands.push({
        command: commandForScript(manager, scriptName),
        sourcePath: 'package.json',
        lineStart: line,
        lineEnd: line,
        confidence: scriptName === 'dev' ? 0.86 : 0.78
      })
    }
    if (scripts.test) {
      const line = findLine(lines, /"test"\s*:/)
      bucket.testCommands.push({
        command: commandForScript(manager, 'test'),
        sourcePath: 'package.json',
        lineStart: line,
        lineEnd: line,
        confidence: 0.82
      })
    }

    for (const relativePath of ['src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/App.jsx', 'src/App.tsx']) {
      const fullPath = safeJoin(rootPath, relativePath)
      if (!fileExists(this.fs, fullPath)) continue
      const entryLines = readLines(this.fs, fullPath)
      bucket.entryFiles.push(citation(relativePath, entryLines, 'Common Node frontend entry file.', { chunkType: 'entry' }))
      break
    }
  }

  inspectPython(rootPath, bucket) {
    const candidates = ['requirements.txt', 'pyproject.toml', 'setup.py']
    const foundDependency = candidates.find((relativePath) => fileExists(this.fs, safeJoin(rootPath, relativePath)))
    if (!foundDependency && !fileExists(this.fs, safeJoin(rootPath, 'app.py')) && !fileExists(this.fs, safeJoin(rootPath, 'main.py'))) return

    bucket.languages.push('Python')
    if (foundDependency) {
      bucket.packageManagers.push(foundDependency === 'pyproject.toml' ? 'pip' : 'pip')
      const lines = readLines(this.fs, safeJoin(rootPath, foundDependency))
      bucket.dependencyFiles.push(citation(foundDependency, lines, 'Declares Python dependencies.'))
      bucket.evidence.push(citation(foundDependency, lines, `Found ${foundDependency}.`))
      const text = lines.join('\n').toLowerCase()
      if (text.includes('flask')) bucket.frameworks.push('Flask')
      if (text.includes('fastapi')) bucket.frameworks.push('FastAPI')
      if (text.includes('django')) bucket.frameworks.push('Django')
      if (text.includes('pytest')) {
        bucket.testCommands.push({
          command: 'pytest',
          sourcePath: foundDependency,
          lineStart: findLine(lines, /pytest/i),
          lineEnd: findLine(lines, /pytest/i),
          confidence: 0.72
        })
      }
    }

    for (const relativePath of ['app.py', 'main.py', 'manage.py']) {
      const fullPath = safeJoin(rootPath, relativePath)
      if (!fileExists(this.fs, fullPath)) continue
      const lines = readLines(this.fs, fullPath)
      const text = lines.join('\n').toLowerCase()
      bucket.entryFiles.push(citation(relativePath, lines, 'Common Python entry file.', { chunkType: 'entry' }))
      if (text.includes('flask')) bucket.frameworks.push('Flask')
      if (text.includes('fastapi')) bucket.frameworks.push('FastAPI')
      if (text.includes('django')) bucket.frameworks.push('Django')
      if (relativePath === 'manage.py') {
        bucket.startCommands.push({
          command: 'python manage.py runserver',
          sourcePath: relativePath,
          lineStart: 1,
          lineEnd: Math.max(1, lines.length),
          confidence: 0.78
        })
      } else if (text.includes('app.run(') || text.includes('uvicorn.run(') || text.includes('if __name__')) {
        const line = text.includes('app.run(') ? findLine(lines, /app\.run\(/) : findLine(lines, /if __name__/)
        bucket.startCommands.push({
          command: `python ${relativePath}`,
          sourcePath: relativePath,
          lineStart: line,
          lineEnd: line,
          confidence: text.includes('app.run(') ? 0.84 : 0.66
        })
      }
    }
  }

  inspectJava(rootPath, bucket) {
    const pomPath = safeJoin(rootPath, 'pom.xml')
    const gradlePath = safeJoin(rootPath, 'build.gradle')
    const gradleKtsPath = safeJoin(rootPath, 'build.gradle.kts')
    const hasPom = fileExists(this.fs, pomPath)
    const hasGradle = fileExists(this.fs, gradlePath) || fileExists(this.fs, gradleKtsPath)
    const hasJavaSource = dirExists(this.fs, safeJoin(rootPath, 'src/main/java'))
    if (!hasPom && !hasGradle && !hasJavaSource) return

    bucket.languages.push('Java')
    if (hasPom) {
      const lines = readLines(this.fs, pomPath)
      bucket.packageManagers.push('maven')
      bucket.dependencyFiles.push(citation('pom.xml', lines, 'Declares Maven project dependencies.'))
      bucket.evidence.push(citation('pom.xml', lines, 'Found Maven pom.xml.'))
      const text = lines.join('\n').toLowerCase()
      if (text.includes('spring-boot')) bucket.frameworks.push('Spring Boot')
      bucket.startCommands.push({
        command: 'mvn spring-boot:run',
        sourcePath: 'pom.xml',
        lineStart: findLine(lines, /spring-boot/i),
        lineEnd: findLine(lines, /spring-boot/i),
        confidence: text.includes('spring-boot') ? 0.74 : 0.45
      })
      bucket.testCommands.push({
        command: 'mvn test',
        sourcePath: 'pom.xml',
        lineStart: 1,
        lineEnd: Math.max(1, lines.length),
        confidence: 0.7
      })
    }
    if (hasGradle) {
      const relativePath = fileExists(this.fs, gradlePath) ? 'build.gradle' : 'build.gradle.kts'
      const lines = readLines(this.fs, safeJoin(rootPath, relativePath))
      bucket.packageManagers.push('gradle')
      bucket.dependencyFiles.push(citation(relativePath, lines, 'Declares Gradle project configuration.'))
      const text = lines.join('\n').toLowerCase()
      const hasSpringBoot = text.includes('spring-boot') || text.includes('org.springframework.boot')
      if (hasSpringBoot) bucket.frameworks.push('Spring Boot')
      bucket.startCommands.push({
        command: 'gradle bootRun',
        sourcePath: relativePath,
        lineStart: findLine(lines, /spring-boot|springframework\.boot|application/i),
        lineEnd: findLine(lines, /spring-boot|springframework\.boot|application/i),
        confidence: hasSpringBoot ? 0.7 : 0.42
      })
      bucket.testCommands.push({
        command: 'gradle test',
        sourcePath: relativePath,
        lineStart: 1,
        lineEnd: Math.max(1, lines.length),
        confidence: 0.7
      })
    }
    if (hasJavaSource) {
      bucket.entryFiles.push({
        path: 'src/main/java',
        lineStart: 1,
        lineEnd: 1,
        chunkType: 'entry',
        reason: 'Standard Java source root.'
      })
    }
  }
}

module.exports = {
  ProjectProfileService,
  uniqueStrings,
  readLines
}
