import { useEffect, useMemo, useRef, useState } from 'react'
import { confirmCsvCorrections, previewCsvCorrections, previewCsvImport } from '../../api/novels'
import {
  aggregateCsvIssues,
  applyCsvCorrectionMapping,
  correctCsvImportRow,
  CSV_CORRECTION_FIELDS,
  formatCsvConfirmSummary,
  paginateCsvRows,
  resetCsvImportRow,
  setCsvImportRowSkipped,
  type CsvCorrections,
  type CsvCorrectionMapping,
  type CsvImportDraftRow,
  type CsvImportSession,
  type CsvImportTab,
  type CsvIssueGroup,
} from '../../../shared/novelCsv.mjs'
import './mobileCsvImport.css'

type SessionUpdate = (transform: (session: CsvImportSession) => CsvImportSession) => void
const tabLabels: Record<CsvImportTab, string> = { ready: '可导入', duplicate: '重复', error: '需处理', skipped: '已跳过' }

export function MobileCsvImport({ onReloadNovels }: { onReloadNovels: () => Promise<unknown> }) {
  const [file, setFile] = useState<File | null>(null)
  const [session, setSession] = useState<CsvImportSession | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const generation = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)

  // An old file read / database request must never revive a closed session.
  useEffect(() => () => { generation.current += 1 }, [])

  const clearSession = (nextFile: File | null = null) => {
    generation.current += 1
    setFile(nextFile)
    setSession(null)
    setError(null)
    setMessage(null)
    setBusy(false)
    if (!nextFile && fileInput.current) fileInput.current.value = ''
  }

  const preview = async () => {
    if (!file || busy) return
    const request = ++generation.current
    setBusy(true)
    setError(null)
    setMessage(null)
    setSession(null)
    try {
      const csv = await file.text()
      if (request !== generation.current) return
      const next = await previewCsvImport<CsvImportSession>(csv)
      if (request === generation.current) setSession(next)
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : 'CSV 预览失败')
    } finally {
      if (request === generation.current) setBusy(false)
    }
  }

  const confirm = async () => {
    if (!session || busy || session.importableCount === 0) return
    const request = ++generation.current
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const checked = await previewCsvCorrections(session.rows)
      if (request !== generation.current) return
      setSession({ ...checked, mappings: session.mappings })
      if (!checked.importableCount) {
        setMessage(`重新查重后没有可导入记录。\n${formatCsvConfirmSummary(checked)}`)
        return
      }
      if (!window.confirm(`${formatCsvConfirmSummary(checked)}\n\n确认导入 ${checked.importableCount} 本小说吗？`)) return
      // Confirmation re-reads SQLite once more, including changes made while the dialog was open.
      const result = await confirmCsvCorrections(checked.rows)
      if (request !== generation.current) return
      setSession(null)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setMessage(`已导入 ${result.importedCount} 本；重复跳过 ${result.duplicateCount}；异常未处理跳过 ${result.errorCount}；人工跳过 ${result.skippedCount}。`)
      try {
        await onReloadNovels()
      } catch {
        if (request === generation.current) setError('CSV 已导入，但书库列表刷新失败，请重新进入书库。')
      }
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : 'CSV 导入失败')
    } finally {
      if (request === generation.current) setBusy(false)
    }
  }

  const update: SessionUpdate = (transform) => setSession((current) => current ? transform(current) : null)

  return (
    <article className="backup-card import-card csv-import-panel">
      <h3>导入 CSV</h3>
      <p>预览全部记录，修正或跳过异常后导入。重复记录自动跳过。</p>
      <fieldset disabled={busy}>
        <label className="csv-file-label">选择 CSV 文件
          <input accept=".csv,text/csv" onChange={(event) => clearSession(event.target.files?.[0] ?? null)} ref={fileInput} type="file" />
        </label>
        {file && <p>已选择：{file.name}</p>}
        <div className="backup-buttons">
          <button disabled={!file} onClick={() => void preview()} type="button">{busy ? '处理中…' : '预览校验'}</button>
          {session && <button onClick={() => clearSession()} type="button">关闭预览</button>}
        </div>
        {session && <CsvSessionView onConfirm={() => void confirm()} session={session} update={update} />}
      </fieldset>
      {message && <p className="csv-message" role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </article>
  )
}

function CsvSessionView({ session, update, onConfirm }: { session: CsvImportSession; update: SessionUpdate; onConfirm: () => void }) {
  const [tab, setTab] = useState<CsvImportTab>('error')
  const [page, setPage] = useState(1)
  const [groupPage, setGroupPage] = useState(1)
  const [groupKey, setGroupKey] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const groups = useMemo(() => aggregateCsvIssues(session), [session])
  const pageData = useMemo(() => paginateCsvRows(session, { status: tab, page, groupKey }), [session, tab, page, groupKey])
  const groupPageCount = Math.max(1, Math.ceil(groups.length / 10))
  const currentGroupPage = Math.min(groupPage, groupPageCount)
  const counts: Record<CsvImportTab, number> = { ready: session.importableCount, duplicate: session.duplicateCount, error: session.errorCount, skipped: session.skippedCount }
  const selectTab = (next: CsvImportTab) => { setTab(next); setPage(1); setGroupKey(null); setEditingRow(null) }
  const applyMapping = (mapping: CsvCorrectionMapping) => {
    update((current) => applyCsvCorrectionMapping(current, mapping))
    setEditingRow(null)
  }

  return <div className="csv-session">
    <p className="csv-totals" role="status">总计 {session.totalRows} 行 · 可导入 {session.importableCount} · 重复 {session.duplicateCount} · 需要处理 {session.errorCount} · 已跳过 {session.skippedCount}</p>
    <div aria-label="CSV 分类" className="csv-tabs">
      {(Object.keys(tabLabels) as CsvImportTab[]).map((item) => <button aria-pressed={tab === item} key={item} onClick={() => selectTab(item)} type="button">{tabLabels[item]} ({counts[item]})</button>)}
    </div>
    {tab === 'error' && <section aria-label="异常聚合" className="csv-issue-groups">
      <h4>异常聚合</h4>
      <p>按问题字段和原值分组。枚举可批量映射，文本问题进入单行修正。</p>
      {groups.slice((currentGroupPage - 1) * 10, currentGroupPage * 10).map((group) => <CsvMappingGroup
        group={group}
        key={group.key}
        onApply={applyMapping}
        onView={() => { setGroupKey(group.key); setPage(1); setEditingRow(null) }}
        session={session}
      />)}
      {groups.length === 0 && <p>没有需要处理的异常。</p>}
      {groupPageCount > 1 && <CsvPagination label="异常分组分页" onPage={setGroupPage} page={currentGroupPage} pageCount={groupPageCount} />}
    </section>}
    {session.mappings.length > 0 && <details className="csv-mappings">
      <summary>本次已应用 {session.mappings.length} 条映射</summary>
      <p>仅本次导入有效。单行撤销后可再次修正；再次应用映射会更新同原值的全部行。</p>
      <ul>{session.mappings.map((mapping) => <li key={`${mapping.field}-${mapping.rawValue}`}>{CSV_CORRECTION_FIELDS.find((item) => item.field === mapping.field)?.header}：{mapping.rawValue || '（空）'} → {mapping.mappedValue}</li>)}</ul>
    </details>}
    {groupKey && <div className="csv-filter-notice"><p>正在查看所选异常：{pageData.totalRows} 行</p><button onClick={() => { setGroupKey(null); setPage(1) }} type="button">查看全部需处理</button></div>}
    <p>{tabLabels[tab]}记录 · 每页 50 行 · 共 {pageData.totalRows} 行</p>
    <ol aria-label={`${tabLabels[tab]}记录`} className="csv-rows">
      {pageData.rows.map((row) => <li className="csv-row" key={row.rowNumber}>
        <div className="csv-row-heading"><strong>第 {row.rowNumber} 行</strong><span>{row.skipped ? '已跳过' : row.status === 'error' ? '需要处理' : row.status === 'duplicate' ? '重复' : Object.keys(row.corrections).length ? '已修正 · 可导入' : '可直接导入'}</span></div>
        <p>书名：{row.novel.title || '（未填写）'}<br />作者：{row.novel.author || '（未填写）'}</p>
        {row.status === 'ready' && <p>{row.novel.cpCategory} · {row.novel.ending} · {row.novel.status} · {row.novel.rating} · 阅读 {row.novel.readCount} 次</p>}
        {row.duplicateReasons.length > 0 && <p>重复原因：{row.duplicateReasons.join('；')}</p>}
        {row.issues.map((issue) => <div className="csv-issue" key={issue.field}>
          <strong>问题字段：{CSV_CORRECTION_FIELDS.find((item) => item.field === issue.field)?.header}</strong>
          <p>原始值：<span className="csv-value">{issue.rawValue || '（空）'}</span></p>
          <p>错误原因：{issue.message}</p>
          <p>当前修正值：<span className="csv-value">{row.corrections[issue.field] === undefined ? '（未修正）' : row.corrections[issue.field] || '（空）'}</span></p>
        </div>)}
        {Object.keys(row.corrections).length > 0 && <details><summary>查看原值与本行修正</summary><ul>{CSV_CORRECTION_FIELDS.filter(({ field }) => row.corrections[field] !== undefined).map(({ field, header }) => <li key={field}>{header}：<span className="csv-value">{row.raw[header] || '（空）'}</span> → <span className="csv-value">{row.corrections[field] || '（空）'}</span></li>)}</ul></details>}
        <div className="backup-buttons">
          {!row.skipped && row.status === 'error' && <><button onClick={() => setEditingRow(row.rowNumber)} type="button">修正本行</button><button onClick={() => { update((current) => setCsvImportRowSkipped(current, row.rowNumber, true)); setEditingRow(null) }} type="button">跳过本行</button></>}
          {row.skipped && <button onClick={() => update((current) => setCsvImportRowSkipped(current, row.rowNumber, false))} type="button">恢复本行</button>}
          {Object.keys(row.corrections).length > 0 && <button onClick={() => { update((current) => resetCsvImportRow(current, row.rowNumber)); setEditingRow(null) }} type="button">撤销本行修改</button>}
        </div>
        {editingRow === row.rowNumber && !row.skipped && <CsvRowEditor
          key={`${row.rowNumber}-${JSON.stringify(row.corrections)}`}
          onCancel={() => setEditingRow(null)}
          onSave={(corrections) => { update((current) => correctCsvImportRow(current, row.rowNumber, corrections)); setEditingRow(null) }}
          row={row}
        />}
      </li>)}
    </ol>
    {pageData.rows.length === 0 && <p>当前分类没有记录。</p>}
    <CsvPagination label="CSV 行分页" onPage={(next) => { setPage(next); setEditingRow(null) }} page={pageData.page} pageCount={pageData.pageCount} />
    <div className="csv-confirm">
      <p>确认时会重新校验和查重。重复、未处理异常和人工跳过的行均不导入。</p>
      {editingRow !== null && <p role="status">请先保存或取消当前单行编辑。</p>}
      <button disabled={session.importableCount === 0 || editingRow !== null} onClick={onConfirm} type="button">确认导入 {session.importableCount} 本</button>
    </div>
  </div>
}

function CsvMappingGroup({ group, session, onApply, onView }: { group: CsvIssueGroup; session: CsvImportSession; onApply: (mapping: CsvCorrectionMapping) => void; onView: () => void }) {
  const [value, setValue] = useState('')
  const definition = CSV_CORRECTION_FIELDS.find((item) => item.field === group.field)!
  const affectedCount = session.rows.filter((row) => (row.raw[definition.header] ?? '').trim() === group.rawValue).length
  return <div className="csv-issue-group">
    <strong>{definition.header}：<span className="csv-value">{group.rawValue || '（空）'}</span> · {group.rowNumbers.length} 行</strong>
    <p>{group.message}</p>
    <button onClick={onView} type="button">查看受影响行</button>
    {definition.options && <div className="csv-mapping-controls">
      <label>批量修改为
        <select aria-label={`${definition.header} ${group.rawValue} 批量修改为`} onChange={(event) => setValue(event.target.value)} value={value}>
          <option value="">选择修正值</option>{definition.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <button disabled={!value} onClick={() => onApply({ field: group.field, rawValue: group.rawValue, mappedValue: value })} type="button">应用到 {affectedCount} 行</button>
      <small>同字段、同原值的全部行（含已修正和已跳过行）使用此值。</small>
    </div>}
  </div>
}

function CsvRowEditor({ row, onSave, onCancel }: { row: CsvImportDraftRow; onSave: (corrections: CsvCorrections) => void; onCancel: () => void }) {
  const [changes, setChanges] = useState<CsvCorrections>({})
  return <form className="csv-row-editor" onSubmit={(event) => { event.preventDefault(); onSave(changes) }}>
    <p>编辑第 {row.rowNumber} 行，保存后重新校验。原始 CSV 保持不变。</p>
    {CSV_CORRECTION_FIELDS.map(({ field, header, options }) => {
      const value = changes[field] ?? row.corrections[field] ?? row.raw[header] ?? ''
      const change = (next: string) => setChanges((current) => ({ ...current, [field]: next }))
      return <label key={field}>{header}{row.issues.some((issue) => issue.field === field) && <em> · 需要处理</em>}
        {options ? <select onChange={(event) => change(event.target.value)} value={value}>
          <option value="">使用默认值</option>
          {value && !options.includes(value) && <option value={value}>当前值：{value}</option>}
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select> : field === 'notes' ? <textarea onChange={(event) => change(event.target.value)} rows={3} value={value} /> : <input inputMode={field === 'readCount' ? 'numeric' : undefined} onChange={(event) => change(event.target.value)} type="text" value={value} />}
      </label>
    })}
    <div className="backup-buttons"><button type="submit">保存并重新校验</button><button onClick={onCancel} type="button">取消编辑</button></div>
  </form>
}

function CsvPagination({ label, page, pageCount, onPage }: { label: string; page: number; pageCount: number; onPage: (page: number) => void }) {
  return <nav aria-label={label} className="csv-pagination">
    <button disabled={page <= 1} onClick={() => onPage(page - 1)} type="button">上一页</button>
    <span>第 {page} / {pageCount} 页</span>
    <button disabled={page >= pageCount} onClick={() => onPage(page + 1)} type="button">下一页</button>
  </nav>
}
