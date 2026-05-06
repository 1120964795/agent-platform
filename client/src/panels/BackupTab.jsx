import { useState } from 'react'
import { Archive, Download, FolderOpen, RotateCcw, Upload } from 'lucide-react'
import { exportBackup, openFile, previewBackup, restoreBackup } from '../lib/api.js'

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-[color:var(--text-muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default function BackupTab({ setMsg }) {
  const [selectedPath, setSelectedPath] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleExport() {
    setBusy(true)
    setMsg('')
    try {
      const result = await exportBackup()
      setSelectedPath(result.packagePath)
      setPreview({ manifest: result.manifest, summary: result.manifest?.contents || {}, packagePath: result.packagePath })
      setMsg(`已导出：${result.packagePath}`)
    } catch (error) {
      setMsg(`导出失败：${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handlePick() {
    setBusy(true)
    setMsg('')
    try {
      const filePath = await window.electronAPI?.selectFile?.({
        filters: [
          { name: 'Aion Backup', extensions: ['aionbackup'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (!filePath) return
      const result = await previewBackup(filePath)
      setSelectedPath(filePath)
      setPreview(result)
      setMsg('备份预览已加载')
    } catch (error) {
      setMsg(`预览失败：${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    if (!selectedPath || !preview) return
    const accepted = window.confirm('恢复会合并本地元数据并提示重新索引项目。继续？')
    if (!accepted) return
    setBusy(true)
    setMsg('')
    try {
      const result = await restoreBackup(selectedPath)
      setMsg(`恢复完成：${result.restored.workflowSkills} 个工作流，${result.restored.projects} 个项目`)
    } catch (error) {
      setMsg(`恢复失败：${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">备份与恢复</h2>
        <p className="text-xs text-[color:var(--text-muted)]">导出本地元数据，恢复前会先隔离解析并显示摘要。</p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <button type="button" onClick={handleExport} disabled={busy} className="flex h-10 items-center justify-center gap-2 rounded-md bg-[color:var(--accent)] px-3 text-sm font-medium text-white disabled:opacity-50">
          <Download size={15} /> 导出 .aionbackup
        </button>
        <button type="button" onClick={handlePick} disabled={busy} className="flex h-10 items-center justify-center gap-2 rounded-md border border-[color:var(--border)] px-3 text-sm hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50">
          <Upload size={15} /> 选择并预览备份
        </button>
      </div>

      {selectedPath && (
        <div className="rounded-lg border border-[color:var(--border)] p-3">
          <div className="flex items-start gap-3">
            <Archive size={18} className="mt-0.5 text-[color:var(--accent)]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{selectedPath}</div>
              <button type="button" onClick={() => openFile(selectedPath)} className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--border)] px-2 text-xs hover:bg-[color:var(--bg-tertiary)]">
                <FolderOpen size={12} /> 打开
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="rounded-lg border border-[color:var(--border)] p-3">
          <div className="mb-2 text-sm font-medium">内容摘要</div>
          <div className="space-y-1">
            <SummaryRow label="经验卡片" value={preview.summary?.experiences || 0} />
            <SummaryRow label="项目" value={preview.summary?.projects || 0} />
            <SummaryRow label="项目画像" value={preview.summary?.projectProfiles || 0} />
            <SummaryRow label="Workflow Skill" value={preview.summary?.workflowSkills || 0} />
            <SummaryRow label="模板源" value={preview.summary?.templateSources || 0} />
          </div>
          <div className="mt-3 rounded-md bg-[color:var(--bg-secondary)] p-2 text-xs text-[color:var(--text-muted)]">
            不恢复源码、密钥、.env、二进制、embedding、原始截图或完整运行日志。
          </div>
          <button type="button" onClick={handleRestore} disabled={busy} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[color:var(--border)] px-3 text-sm font-medium text-[color:var(--success)] hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50">
            <RotateCcw size={14} /> 合并恢复
          </button>
        </div>
      )}
    </div>
  )
}
