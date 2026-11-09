interface ImportMetaEnv {
  readonly VITE_AUTH_TOKEN?: string
  readonly VITE_API_URL?: string
  readonly VITE_USER_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
