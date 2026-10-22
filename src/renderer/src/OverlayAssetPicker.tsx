import { useState } from 'react'
import type { OverlayTheme } from '@shared/overlay-theme'
import { readOverlayAsset } from './lib/overlay-asset'

export function OverlayAssetPicker({
  theme,
  onChange
}: {
  theme: OverlayTheme
  onChange: (theme: OverlayTheme) => void
}) {
  const [error, setError] = useState('')
  return (
    <div className="overlay-assets">
      <label className="asset-upload">
        Upload your image
        <input
          aria-label="Upload overlay image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            try {
              const assetDataUrl = await readOverlayAsset(file)
              onChange({ ...theme, assetDataUrl })
              setError('')
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not open image.')
            }
          }}
        />
      </label>
      <small>PNG, JPEG or WebP · up to 5 MB · saved on this device</small>
      {theme.assetDataUrl && (
        <div className="asset-options">
          <label>
            Use as{' '}
            <select
              aria-label="Overlay image role"
              value={theme.assetRole}
              onChange={(e) =>
                onChange({ ...theme, assetRole: e.target.value as OverlayTheme['assetRole'] })
              }
            >
              <option value="emblem">Emblem</option>
              <option value="background">Background</option>
            </select>
          </label>
          <button
            type="button"
            className="ghost"
            onClick={() => onChange({ ...theme, assetDataUrl: '' })}
          >
            Remove image
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
