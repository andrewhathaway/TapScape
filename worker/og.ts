/**
 * Share-card images. The card is hand-built SVG rasterised with resvg in
 * WebAssembly, so no browser is needed. It deliberately shows no location
 * names or pins: the card is seen by people who haven't played yet.
 */

import { Resvg, initWasm } from '@resvg/resvg-wasm'
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm'
import interBold from './fonts/Inter-Bold.ttf'
import { MAX_ROUND_SCORE, bandForRatio } from '../src/game/scoring'

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

/** Same four colours as the history heatmap and the emoji grid. */
const BAND_FILL = ['#63a844', '#e0b43a', '#cf7430', '#4c4433']

let wasmReady: Promise<void> | null = null

function ready(): Promise<void> {
  // initWasm throws if called twice; the promise is the lock.
  wasmReady ??= initWasm(resvgWasm)
  return wasmReady
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface CardSpec {
  /** Small line above the big text, e.g. the date or "Challenge". */
  kicker: string
  /** The headline: a score, or "Day 285". */
  big: string
  /** Under the headline, e.g. "out of 25,000". */
  sub: string
  /** Round scores drawn as coloured squares; empty for none. */
  scores: number[]
  /** Line at the bottom, e.g. "Can you beat it?". */
  tagline: string
  /** Optional JPEG drawn faintly behind the panel, as raw bytes. */
  backdrop?: ArrayBuffer
}

function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let out = ''
  for (let i = 0; i < view.length; i += 0x8000) {
    out += String.fromCharCode(...view.subarray(i, i + 0x8000))
  }
  return btoa(out)
}

export function cardSvg({ kicker, big, sub, scores, tagline, backdrop }: CardSpec): string {
  const squares = scores
    .map((s, i) => {
      const fill = BAND_FILL[bandForRatio(s / MAX_ROUND_SCORE)]
      return `<rect x="${96 + i * 92}" y="392" width="76" height="76" rx="14" fill="${fill}"/>`
    })
    .join('')
  const image = backdrop
    ? `<image href="data:image/jpeg;base64,${base64(backdrop)}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="xMidYMid slice" opacity="0.55"/>`
    : ''
  const panelFill = backdrop ? 'rgba(23,21,15,0.9)' : '#17150f'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#0e0d0b"/>
  ${image}
  <rect x="48" y="48" width="${CARD_WIDTH - 96}" height="${CARD_HEIGHT - 96}" rx="28" fill="${panelFill}" stroke="#3a3426" stroke-width="3"/>
  <g font-family="Inter" font-weight="700">
    <text x="96" y="140" font-size="34" fill="#ffb833" letter-spacing="4">TAPSCAPE</text>
    <text x="96" y="196" font-size="30" fill="#a2977d">${esc(kicker)}</text>
    <text x="96" y="330" font-size="132" fill="#ffb833">${esc(big)}</text>
    <text x="${96 + 8}" y="372" font-size="26" fill="#a2977d">${esc(sub)}</text>
    ${squares}
    <text x="96" y="536" font-size="30" fill="#f0e6d2">${esc(tagline)}</text>
    <text x="${CARD_WIDTH - 96}" y="536" font-size="24" fill="#a2977d" text-anchor="end">tapscape.andrewhathaway.net</text>
  </g>
  <g transform="translate(${CARD_WIDTH - 220}, 96) scale(3.2)">
    <rect width="32" height="32" rx="7" fill="#211d14"/>
    <path d="M16 6c-4 0-7 3-7 6.8 0 5 7 12.2 7 12.2s7-7.2 7-12.2C23 9 20 6 16 6z" fill="#ffb833"/>
    <circle cx="16" cy="12.6" r="2.6" fill="#17150f"/>
  </g>
</svg>`
}

export async function renderPng(svg: string): Promise<Uint8Array> {
  await ready()
  const resvg = new Resvg(svg, {
    font: {
      fontBuffers: [new Uint8Array(interBold)],
      loadSystemFonts: false,
      defaultFontFamily: 'Inter',
    },
    fitTo: { mode: 'width', value: CARD_WIDTH },
  })
  try {
    const image = resvg.render()
    try {
      return image.asPng()
    } finally {
      image.free()
    }
  } finally {
    resvg.free()
  }
}
