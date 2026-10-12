// Wrangler bundles these as modules: .wasm as a compiled WebAssembly module by
// default, .ttf via the "Data" rule in wrangler.jsonc.
declare module '*.wasm' {
  const module: WebAssembly.Module
  export default module
}

declare module '*.ttf' {
  const data: ArrayBuffer
  export default data
}
