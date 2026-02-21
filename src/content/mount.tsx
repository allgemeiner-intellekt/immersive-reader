import React from 'react'
import { createRoot } from 'react-dom/client'

import globalCss from '../assets/styles/global.css?inline'
import playerCss from './player/player.css?inline'
import { App } from './App'

export function mountContentUI(): void {
  if (document.getElementById('immersive-reader-root')) return

  const host = document.createElement('div')
  host.id = 'immersive-reader-root'
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; inset: 0; pointer-events: none;'

  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = `${globalCss}\n${playerCss}`
  shadow.appendChild(style)

  const mountPoint = document.createElement('div')
  mountPoint.className = 'ir-reset'
  mountPoint.style.cssText = 'position: fixed; inset: 0; pointer-events: none;'
  shadow.appendChild(mountPoint)

  ;(document.body || document.documentElement).appendChild(host)

  createRoot(mountPoint).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
