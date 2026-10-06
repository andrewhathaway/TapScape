export type Plane = 0 | 1 | 2 | 3

export interface WorldPoint {
  x: number
  y: number
  plane: Plane
}

export interface Location extends WorldPoint {
  id: string
  name: string
  /** Shown after the guess is locked in. */
  blurb?: string
  /** Rough difficulty, used to shape the daily mix. */
  tier: 1 | 2 | 3
}

export interface Guess {
  location: Location
  guessed: WorldPoint
  distance: number
  score: number
}

export type RoundState =
  | { phase: 'guessing' }
  | { phase: 'placed'; at: WorldPoint }
  | { phase: 'revealed'; result: Guess }
