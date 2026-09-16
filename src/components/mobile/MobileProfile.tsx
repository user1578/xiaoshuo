import { ChevronRight, Cloud, DatabaseBackup, FileDown, FileUp, Info, LogOut, Settings2 } from 'lucide-react'
import { ThemeSelector } from './ThemeSelector'
import type { ThemeId } from '../../theme/themes'
import type { View } from '../../types/novel'

export function MobileProfile({
  theme,
  onThemeChange,
  onNavigate,
  onOpenAbout,
  cloudLogoutEnabled,
  cloudLogoutLoading,
  onCloudLogout,
  mobileMode,
  libraryStatus,
}: {
  theme: ThemeId
  onThemeChange: (theme: ThemeId) => void
  onNavigate: (view: View) => void
  onOpenAbout: () => void
  cloudLogoutEnabled: boolean
  cloudLogoutLoading: boolean
  onCloudLogout: () => Promise<void>
  mobileMode: boolean
  libraryStatus?: { novelCount: number; authorCount: number; tagCount: number; schemaVersion: number }
}) {
  const dataActions = [
    { icon: DatabaseBackup, label: '数据备份', text: mobileMode ? 'JSON 导入导出' : 'JSON 与 CSV 导入导出', onClick: () => onNavigate('backup') },
    { icon: FileUp, label: '导入数据', text: mobileMode ? '在数据管理中预览 JSON 后恢复' : '在数据管理中选择 JSON 或 CSV', onClick: () => onNavigate('backup') },
    { icon: FileDown, label: '导出数据', text: '导出当前书库备份', onClick: () => onNavigate('backup') },
  ]

  return (
    <div className="mobile-page mobile-profile-page">
      <section className="mobile-profile-hero">
        <span className="mobile-profile-mark" aria-hidden="true">袋</span>
        <div><p>我的小说袋</p><h2>把喜欢的故事装进口袋</h2></div>
      </section>
      <section className="mobile-profile-group" aria-label="数据管理">
        <div className="mobile-section-heading"><div><p>低频管理</p><h2>数据管理</h2></div></div>
        {mobileMode && <div className="mobile-setting-row static"><Settings2 size={19} /><span><strong>本地书库</strong><em>{libraryStatus ? `${libraryStatus.novelCount} 本小说 · ${libraryStatus.authorCount} 位作者 · ${libraryStatus.tagCount} 个标签 · Schema v${libraryStatus.schemaVersion}` : '本地 SQLite 正在初始化'}</em></span></div>}
        {dataActions.map((item) => {
          const Icon = item.icon
          return <button className="mobile-setting-row" key={item.label} onClick={item.onClick} type="button"><Icon size={19} /><span><strong>{item.label}</strong><em>{item.text}</em></span><ChevronRight size={18} /></button>
        })}
      </section>
      <ThemeSelector onThemeChange={onThemeChange} theme={theme} />
      <section className="mobile-profile-group" aria-label="关于软件">
        <div className="mobile-section-heading"><div><p>小说袋</p><h2>关于软件</h2></div></div>
        <button className="mobile-setting-row" onClick={onOpenAbout} type="button"><Info size={19} /><span><strong>关于小说袋</strong><em>私人小说记录与管理工具</em></span><ChevronRight size={18} /></button>
        {!mobileMode && cloudLogoutEnabled && <button className="mobile-setting-row" disabled={cloudLogoutLoading} onClick={() => void onCloudLogout()} type="button"><Cloud size={19} /><span><strong>{cloudLogoutLoading ? '退出中' : '退出云端登录'}</strong><em>仅退出当前 Supabase 会话</em></span><LogOut size={18} /></button>}
        {mobileMode ? <div className="mobile-setting-row static"><Settings2 size={19} /><span><strong>数据安全</strong><em>卸载 App 或清除应用数据会删除手机书库和本地封面。JSON 备份可恢复小说的结构化数据；自定义封面图片未包含在当前备份中，恢复后会使用默认封面。</em></span></div> : <div className="mobile-setting-row static"><Settings2 size={19} /><span><strong>本地封面</strong><em>本阶段只支持当前页面预览</em></span></div>}
      </section>
    </div>
  )
}
