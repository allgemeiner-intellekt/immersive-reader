# Security Policy

## API Key Storage

Immersive Reader stores API keys exclusively in `chrome.storage.local`, which is:

- **Local only** - Data never leaves your device via Chrome Sync
- **Extension-scoped** - Only this extension can access its storage
- **Encrypted at rest** - Protected by your OS-level disk encryption

API keys are never:
- Sent to any server other than the TTS provider you configured
- Synced to the cloud via `chrome.storage.sync`
- Logged, collected, or transmitted to the extension developers

## Data Collection

Immersive Reader collects **no data whatsoever**:

- No analytics or telemetry
- No usage tracking
- No crash reporting to external services
- No network requests except direct TTS API calls to your configured provider

## Permissions

The extension requests only the permissions it needs:

| Permission | Purpose |
|------------|---------|
| `storage` | Save provider configs and settings locally |
| `activeTab` | Access the current page to extract text |
| `scripting` | Inject the content script for highlighting |
| `offscreen` | Play audio via an offscreen document |
| `alarms` | Keep the service worker alive during playback |

## Responsible Disclosure

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email the maintainers with details of the vulnerability
3. Allow reasonable time for a fix before public disclosure

We appreciate your help keeping Immersive Reader secure for everyone.
