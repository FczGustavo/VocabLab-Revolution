"use client"

export const SYNC_DEVICE_ID_KEY = "vocablab_sync_device_id"
export const SYNC_DEVICE_ROLE_KEY = "vocablab_sync_device_role"
export const SYNC_DEVICE_ROLE_UPDATED_EVENT = "vocablab-sync-device-role-updated"

export type SyncDeviceKind = "mobile" | "tablet" | "desktop" | "unknown"
export type SyncDeviceRole = "primary" | "study"
export const SYNC_STUDY_ONLY_ERROR = "Esta conexão está em somente estudo. Use a conexão primária para criar ou organizar conteúdo."

export function getOrCreateSyncDeviceId() {
  const saved = localStorage.getItem(SYNC_DEVICE_ID_KEY)
  if (saved && /^[a-zA-Z0-9-]{8,64}$/.test(saved)) return saved
  const generated = crypto.randomUUID()
  localStorage.setItem(SYNC_DEVICE_ID_KEY, generated)
  return generated
}

export function getSyncDeviceKind(): SyncDeviceKind {
  if (typeof navigator === "undefined") return "unknown"
  const userAgent = navigator.userAgent
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) return "tablet"
  if (/Android|iPhone|iPod|Mobile/i.test(userAgent)) return "mobile"
  if (/Windows|Macintosh|Linux|X11/i.test(userAgent)) return "desktop"
  return "unknown"
}

function browserName() {
  if (typeof navigator === "undefined") return "Navegador"
  const userAgent = navigator.userAgent
  if (/Edg\//i.test(userAgent)) return "Edge"
  if (/Chrome\//i.test(userAgent) && !/Edg\//i.test(userAgent)) return "Chrome"
  if (/Firefox\//i.test(userAgent)) return "Firefox"
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return "Safari"
  return "Navegador"
}

export function getSyncDeviceLabel() {
  const kind = getSyncDeviceKind()
  const kindLabel: Record<SyncDeviceKind, string> = {
    mobile: "celular",
    tablet: "tablet",
    desktop: "computador",
    unknown: "dispositivo",
  }
  return `${browserName()} · ${kindLabel[kind]}`
}

export function getSyncDeviceRole(): SyncDeviceRole {
  if (typeof window === "undefined") return "primary"
  return localStorage.getItem(SYNC_DEVICE_ROLE_KEY) === "study" ? "study" : "primary"
}

export function isSyncStudyOnly() {
  return getSyncDeviceRole() === "study"
}

export function setSyncDeviceRole(role: SyncDeviceRole) {
  localStorage.setItem(SYNC_DEVICE_ROLE_KEY, role)
  window.dispatchEvent(new Event(SYNC_DEVICE_ROLE_UPDATED_EVENT))
}
