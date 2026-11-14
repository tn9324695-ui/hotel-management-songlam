// Static demo server only. Express overrides this URL using its validated config.
// This file is NOT an operational SQL switch. Never serve a static demo host after cutover.
globalThis.SongLamDeploymentConfig = Object.freeze({ mode: 'demo', managed: false, buildId: null });
