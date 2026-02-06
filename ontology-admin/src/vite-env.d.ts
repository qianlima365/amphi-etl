/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ONTOLOGY_API: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
