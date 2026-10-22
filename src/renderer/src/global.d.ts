import type { S2TApi } from '../../preload/index'

declare global {
  interface Window {
    s2t: S2TApi
  }
}

export {}
