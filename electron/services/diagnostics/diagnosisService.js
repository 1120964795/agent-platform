const crypto = require('crypto')
const { buildExecutionPlan } = require('./executionPlanService')
const { matchExperiences } = require('./experienceMatcher')

function uniqueStrings(items = []) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))]
}

function createId(prefix, seed) {
  return `${prefix}${crypto.createHash('md5').update(String(seed || Math.random())).digest('hex').slice(0, 12)}`
}

function citationToEvidence(source, reason) {
  if (!source?.path) return null
  return {
    path: source.path,
    lineStart: source.lineStart || 1,
    lineEnd: source.lineEnd || source.lineStart || 1,
    chunkType: source.chunkType || 'config',
    reason: reason || source.reason || 'Project evidence'
  }
}

function buildTemplate(errorEvent) {
  const packageName = errorEvent.signature.split('.').pop()
  switch (errorEvent.type) {
    case 'ModuleNotFoundError':
      return {
        meaning: `当前 Python 环境缺少 ${packageName} 包，或解释器选错了。`,
        possibleCauses: [
          `当前环境没有安装 ${packageName}`,
          '虚拟环境未激活',
          'VS Code 或终端使用了错误的 Python 解释器'
        ],
        fixes: [
          { label: '安装缺失依赖', command: `pip install ${packageName}`, cwd: errorEvent.projectDir || '' }
        ],
        experienceTitle: `${packageName} 依赖缺失处理方法`,
        cause: `当前 Python 环境缺少 ${packageName} 包，或解释器选择错误。`,
        steps: [
          '确认当前项目目录',
          '检查虚拟环境是否激活',
          `执行 pip install ${packageName}`,
          '重新运行项目'
        ]
      }
    case 'NodeModuleNotFound':
      return {
        meaning: `当前 Node 项目缺少 ${packageName} 模块，通常是依赖未安装或锁文件与 node_modules 不一致。`,
        possibleCauses: [
          `未安装 ${packageName}`,
          'node_modules 缺失或损坏',
          '切换分支后没有重新安装依赖'
        ],
        fixes: [
          { label: '安装缺失模块', command: `npm install ${packageName}`, cwd: errorEvent.projectDir || '' }
        ],
        experienceTitle: `${packageName} 模块缺失处理方法`,
        cause: `当前 Node 项目缺少 ${packageName} 模块。`,
        steps: [
          '确认当前项目根目录',
          '检查 package.json 中是否声明该依赖',
          `执行 npm install ${packageName}`,
          '重新运行项目'
        ]
      }
    case 'NpmError':
      return {
        meaning: 'npm 在解析依赖或执行脚本时失败，通常与依赖版本冲突或锁文件状态有关。',
        possibleCauses: [
          '依赖版本冲突',
          'package-lock.json 与 node_modules 不一致',
          '镜像源或网络异常'
        ],
        fixes: [
          { label: '重新安装依赖', command: 'npm install', cwd: errorEvent.projectDir || '' }
        ],
        experienceTitle: 'npm 执行错误处理方法',
        cause: 'npm 依赖解析或安装过程失败。',
        steps: [
          '检查报错码和冲突依赖',
          '执行 npm install',
          '必要时清理 lockfile 后再重试'
        ]
      }
    case 'PortInUse':
      return {
        meaning: '要监听的端口已经被其他进程占用。',
        possibleCauses: [
          '上一个开发服务还在运行',
          '另一个项目占用了同一个端口'
        ],
        fixes: [],
        experienceTitle: '端口占用处理方法',
        cause: '开发端口被其他进程占用。',
        steps: [
          '确认哪个进程占用了端口',
          '关闭旧服务或切换端口',
          '重新启动当前项目'
        ]
      }
    case 'GitMergeConflict':
      return {
        meaning: 'Git 无法自动合并同一处改动，需要人工处理冲突。',
        possibleCauses: [
          '当前分支和目标分支修改了同一段内容',
          '本地改动与远程改动冲突'
        ],
        fixes: [
          { label: '查看冲突状态', command: 'git status', cwd: errorEvent.projectDir || '' }
        ],
        experienceTitle: 'Git 合并冲突处理方法',
        cause: '多个分支在同一文件或同一位置产生冲突。',
        steps: [
          '运行 git status 查看冲突文件',
          '打开冲突文件并处理标记',
          '解决后重新 add/commit'
        ]
      }
    case 'JavaCommandNotFound': {
      const tool = errorEvent.signature.split('.').pop()
      const packageMap = {
        javac: 'EclipseAdoptium.Temurin.17.JDK',
        java: 'EclipseAdoptium.Temurin.17.JDK',
        mvn: 'Apache.Maven',
        gradle: 'Gradle.Gradle'
      }
      return {
        meaning: `${tool} 命令在当前环境中不可用，通常是工具未安装或 PATH 未配置。`,
        possibleCauses: [
          `${tool} 未安装`,
          'PATH 环境变量未配置正确'
        ],
        fixes: [
          { label: `安装 ${tool}`, command: `winget install ${packageMap[tool] || 'EclipseAdoptium.Temurin.17.JDK'}`, cwd: errorEvent.projectDir || '' }
        ],
        experienceTitle: `Java 工具 ${tool} 缺失处理方法`,
        cause: `${tool} 未安装或 PATH 配置不正确。`,
        steps: [
          `安装 ${tool} 对应工具`,
          '确认 PATH 生效',
          '重新打开终端后再试'
        ]
      }
    }
    case 'JavaClassNotFound':
    case 'JavaMainClassNotFound':
      return {
        meaning: 'Java 运行时找不到指定类，通常是编译输出、类路径或主类配置有问题。',
        possibleCauses: [
          '类没有编译成功',
          'classpath 配置错误',
          '运行目录不正确'
        ],
        fixes: [],
        experienceTitle: 'Java 类找不到处理方法',
        cause: 'Java 运行时无法定位类路径中的目标类。',
        steps: [
          '确认源码已编译',
          '检查 classpath 和运行目录',
          '确认主类名称拼写正确'
        ]
      }
    case 'UnsupportedClassVersionError':
      return {
        meaning: '当前运行时 Java 版本低于编译该类文件所需的版本。',
        possibleCauses: [
          'JDK 版本不一致',
          '运行时 Java 版本过低'
        ],
        fixes: [
          { label: '检查 Java 版本', command: 'java -version', cwd: errorEvent.projectDir || '' }
        ],
        experienceTitle: 'Java 版本不兼容处理方法',
        cause: '运行时和编译时使用的 Java 版本不一致。',
        steps: [
          '查看 java -version',
          '升级运行时或降低编译目标版本'
        ]
      }
    case 'MavenBuildFailure':
      return {
        meaning: 'Maven 构建失败，需要查看具体失败阶段和依赖信息。',
        possibleCauses: [
          '依赖下载失败',
          '测试失败',
          '插件配置错误'
        ],
        fixes: [
          { label: '查看 Maven 版本', command: 'mvn -version', cwd: errorEvent.projectDir || '' }
        ],
        experienceTitle: 'Maven 构建失败处理方法',
        cause: 'Maven 构建过程中的某一阶段失败。',
        steps: [
          '查看具体失败阶段',
          '确认 Maven 与 JDK 可用',
          '检查依赖与插件配置'
        ]
      }
    case 'GradleBuildFailure':
      return {
        meaning: 'Gradle 构建失败，需要定位失败任务和对应插件或依赖。',
        possibleCauses: [
          'Gradle 任务执行失败',
          '依赖或插件异常',
          'JDK 版本不匹配'
        ],
        fixes: [
          { label: '查看 Gradle 版本', command: 'gradle -version', cwd: errorEvent.projectDir || '' }
        ],
        experienceTitle: 'Gradle 构建失败处理方法',
        cause: 'Gradle 构建流程失败。',
        steps: [
          '查看失败任务名称',
          '确认 Gradle 与 JDK 可用',
          '检查依赖、插件和缓存'
        ]
      }
    case 'ShellCommandNotFound': {
      const commandName = errorEvent.signature.split('.').pop()
      return {
        meaning: `系统找不到 ${commandName} 命令，通常是未安装或 PATH 没配置。`,
        possibleCauses: [
          `${commandName} 未安装`,
          'PATH 环境变量中没有该命令'
        ],
        fixes: [],
        experienceTitle: `${commandName} 命令缺失处理方法`,
        cause: `${commandName} 命令不存在或不可达。`,
        steps: [
          `确认 ${commandName} 是否已安装`,
          '检查 PATH 配置',
          '重新打开终端后再试'
        ]
      }
    }
    case 'ENOENT':
      return {
        meaning: '代码访问了不存在的文件或目录。',
        possibleCauses: [
          '路径写错',
          '工作目录不正确',
          '生成步骤未执行'
        ],
        fixes: [],
        experienceTitle: '文件路径不存在处理方法',
        cause: '访问的文件或目录不存在。',
        steps: [
          '检查路径拼写',
          '确认工作目录',
          '确认相关文件是否已生成'
        ]
      }
    default:
      return {
        meaning: '检测到开发过程中的常见错误，需要结合当前终端上下文继续确认。',
        possibleCauses: ['依赖、环境或工作目录异常'],
        fixes: [],
        experienceTitle: '开发错误处理方法',
        cause: '开发场景中的常见错误。',
        steps: ['查看原始报错并确认项目环境']
      }
  }
}

function createDiagnosisFromError(errorEvent, options = {}) {
  const username = options.username || 'guest'
  const experiences = Array.isArray(options.experiences) ? options.experiences : []
  const now = options.now || new Date()
  const template = buildTemplate(errorEvent)
  const projectEvidenceKeys = []
  const projectEvidence = []
  for (const source of options.projectEvidence || []) {
    const evidence = citationToEvidence(source)
    if (!evidence) continue
    const key = `${evidence.path}:${evidence.lineStart}:${evidence.lineEnd}`
    if (projectEvidenceKeys.includes(key)) continue
    projectEvidenceKeys.push(key)
    projectEvidence.push(evidence)
  }

  const dependencyFiles = options.projectProfile?.dependencyFiles || []
  const packageManagers = options.projectProfile?.packageManagers || []
  const projectFixes = []
  if (errorEvent.type === 'ModuleNotFoundError' && dependencyFiles.some((item) => item.path === 'requirements.txt')) {
    projectFixes.push({
      id: 'fix_project_requirements',
      label: '按项目依赖文件安装',
      command: 'pip install -r requirements.txt',
      cwd: errorEvent.projectDir || options.project?.rootPath || '',
      evidence: dependencyFiles
        .filter((item) => item.path === 'requirements.txt')
        .map((item) => citationToEvidence(item, 'Project declares Python dependencies.'))
        .filter(Boolean)
    })
  }
  if (errorEvent.type === 'NodeModuleNotFound' && dependencyFiles.some((item) => item.path === 'package.json')) {
    const manager = packageManagers.includes('pnpm') ? 'pnpm' : packageManagers.includes('yarn') ? 'yarn' : 'npm'
    projectFixes.push({
      id: 'fix_project_install',
      label: '按项目依赖文件安装',
      command: manager === 'yarn' ? 'yarn install' : `${manager} install`,
      cwd: errorEvent.projectDir || options.project?.rootPath || '',
      evidence: dependencyFiles
        .filter((item) => item.path === 'package.json')
        .map((item) => citationToEvidence(item, 'Project declares Node dependencies.'))
        .filter(Boolean)
    })
  }
  for (const fix of projectFixes) {
    for (const evidence of fix.evidence || []) {
      const key = `${evidence.path}:${evidence.lineStart}:${evidence.lineEnd}`
      if (projectEvidenceKeys.includes(key)) continue
      projectEvidenceKeys.push(key)
      projectEvidence.push(evidence)
    }
  }

  const experienceMatches = matchExperiences(errorEvent, experiences).map((item) => ({
    experienceId: item.experienceId,
    title: item.title,
    similarity: item.similarity,
    matchedKeywords: item.matchedKeywords
  }))

  const recommendedFixes = [...projectFixes, ...(template.fixes || [])].map((fix, index) => ({
    ...buildExecutionPlan({
      id: fix.id || `fix_${index + 1}`,
      label: fix.label,
      command: fix.command,
      cwd: fix.cwd || errorEvent.projectDir || ''
    }, options),
    id: fix.id || `fix_${index + 1}`,
    label: fix.label,
    evidence: fix.evidence || []
  }))

  return {
    id: options.id || createId('diag_', `${username}:${errorEvent.id}:${now.toISOString()}`),
    username,
    errorId: errorEvent.id,
    experienceId: options.experienceId || '',
    title: errorEvent.title,
    errorType: errorEvent.type,
    errorSignature: errorEvent.signature,
    appName: errorEvent.appName || '',
    windowTitle: errorEvent.windowTitle || '',
    projectDir: errorEvent.projectDir || '',
    rawSnippet: errorEvent.rawSnippet,
    meaning: template.meaning,
    possibleCauses: template.possibleCauses || [],
    recommendedFixes,
    projectId: options.project?.id || '',
    projectEvidence,
    experienceMatches,
    modelExplanation: options.modelExplanation || '',
    status: 'ready',
    createdAt: now.toISOString()
  }
}

function upsertExperienceFromDiagnosis(storeRef, diagnosis, errorEvent, options = {}) {
  const existing = storeRef.findExperienceBySignature(diagnosis.username, errorEvent.signature)
  const template = buildTemplate(errorEvent)
  const projectDirs = uniqueStrings([...(existing?.projectDirs || []), diagnosis.projectDir].filter(Boolean))
  const experience = storeRef.upsertExperience({
    ...(existing || {}),
    id: existing?.id,
    username: diagnosis.username,
    title: existing?.title || template.experienceTitle,
    status: existing?.status || 'draft',
    sceneType: 'development',
    appName: diagnosis.appName,
    windowTitle: diagnosis.windowTitle,
    projectType: options.projectType || existing?.projectType || '',
    projectDirs,
    errorKeywords: uniqueStrings([...(existing?.errorKeywords || []), ...(errorEvent.keywords || []), errorEvent.rawSnippet]),
    errorSignature: errorEvent.signature,
    originalError: diagnosis.rawSnippet,
    cause: existing?.cause || template.cause,
    steps: template.steps || [],
    commands: existing?.commands || [],
    notes: uniqueStrings([...(existing?.notes || []), ...(template.possibleCauses || [])]),
    source: {
      diagnosisId: diagnosis.id,
      captureSource: errorEvent.captureSource,
      autoSaved: true
    },
    pinned: Boolean(existing?.pinned),
    successCount: existing?.successCount || 0
  })

  if (!diagnosis.experienceId && experience.id) {
    diagnosis.experienceId = experience.id
  }
  return experience
}

function recordFixExecution(storeRef, diagnosis, plan, result, options = {}) {
  const experience = storeRef.getExperience(diagnosis.experienceId, diagnosis.username) ||
    storeRef.findExperienceBySignature(diagnosis.username, diagnosis.errorSignature)
  if (!experience) return null

  const success = Number(result?.exit_code) === 0
  const now = options.now || new Date()
  const commands = [
    ...(experience.commands || []),
    {
      command: plan.command,
      cwd: plan.cwd,
      riskLevel: plan.riskLevel,
      success,
      executedAt: now.toISOString(),
      exitCode: result?.exit_code,
      stderr: result?.stderr ? String(result.stderr).slice(0, 400) : ''
    }
  ]

  return storeRef.upsertExperience({
    ...experience,
    status: success ? 'resolved' : 'unresolved',
    commands,
    updatedAt: now.toISOString(),
    successCount: success ? (Number(experience.successCount) || 0) + 1 : (Number(experience.successCount) || 0)
  })
}

function createModelClient(deepseekClient, storeRef) {
  return {
    async explainDiagnosis({ diagnosis, username }) {
      const config = storeRef.getUserConfig(username)
      if (!config.apiKey) {
        const error = new Error('Model is unavailable.')
        error.code = 'MODEL_UNAVAILABLE'
        throw error
      }
      return deepseekClient.chat({
        config,
        messages: [
          {
            role: 'system',
            content: 'You explain software development errors in concise Chinese. Keep the original diagnosis unchanged and add only supplemental explanation.'
          },
          {
            role: 'user',
            content: `Title: ${diagnosis.title}\nError Type: ${diagnosis.errorType}\nSnippet:\n${diagnosis.rawSnippet}\nExisting Meaning:\n${diagnosis.meaning}\n\nPlease provide a concise supplemental explanation in Chinese.`
          }
        ]
      })
    },

    async rewritePlan({ diagnosis, experience, username }) {
      const config = storeRef.getUserConfig(username)
      if (!config.apiKey) {
        const error = new Error('Model is unavailable.')
        error.code = 'MODEL_UNAVAILABLE'
        throw error
      }
      return deepseekClient.chatJson([
        {
          role: 'system',
          content: 'Return one JSON object with keys command, cwd, reason, expectedImpact. Adapt the previous fix plan to the current project directory while staying conservative.'
        },
        {
          role: 'user',
          content: JSON.stringify({
            diagnosis: {
              title: diagnosis.title,
              rawSnippet: diagnosis.rawSnippet,
              projectDir: diagnosis.projectDir,
              windowTitle: diagnosis.windowTitle
            },
            experience: {
              title: experience.title,
              commands: experience.commands
            }
          }, null, 2)
        }
      ], { config })
    }
  }
}

module.exports = {
  createDiagnosisFromError,
  upsertExperienceFromDiagnosis,
  recordFixExecution,
  createModelClient,
  buildTemplate
}
