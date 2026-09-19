export type AndroidBackPlugin = {
  App: {
    addListener(eventName: 'backButton', callback: () => void): Promise<AndroidBackListenerHandle> | AndroidBackListenerHandle
  }
}

export type AndroidBackListenerHandle = { remove(): Promise<void> | void }

export class AndroidBackListener {
  private readonly loadPlugin: () => Promise<AndroidBackPlugin>
  private readonly isAndroid: () => boolean
  private callback: () => void
  private handle: AndroidBackListenerHandle | null = null
  private started = false
  private starting: Promise<void> | null = null

  constructor(
    loadPlugin: () => Promise<AndroidBackPlugin>,
    isAndroid: () => boolean,
    callback: () => void,
  ) {
    this.loadPlugin = loadPlugin
    this.isAndroid = isAndroid
    this.callback = callback
  }

  setCallback(callback: () => void): void {
    this.callback = callback
  }

  async start(enabled: boolean): Promise<void> {
    if (this.started || !enabled || !this.isAndroid()) return
    this.started = true
    this.starting = (async () => {
      const { App } = await this.loadPlugin()
      const handle = await App.addListener('backButton', () => this.callback())
      if (!this.started) {
        await handle.remove()
        return
      }
      this.handle = handle
    })()
    await this.starting
  }

  async stop(): Promise<void> {
    this.started = false
    await this.starting
    const handle = this.handle
    this.handle = null
    if (handle) await handle.remove()
  }
}
