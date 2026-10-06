import { SITE_URL } from '../game/share'

export default function About() {
  return (
    <div className="prose">
      <p>
        TapScape is a daily geography game for the Old School RuneScape world map, in the
        spirit of MapTap and GeoGuessr.
      </p>
      <p>
        Map tiles and location data come from the{' '}
        <a href="https://oldschool.runescape.wiki" target="_blank" rel="noreferrer">
          OSRS Wiki
        </a>{' '}
        and are used under the{' '}
        <a href="https://meta.weirdgloop.org/w/Meta:Copyrights" target="_blank" rel="noreferrer">
          Weird Gloop licence
        </a>
        . RuneScape and Old School RuneScape are trademarks of Jagex Limited. This is an
        unofficial fan project with no affiliation to Jagex.
      </p>
      <p>
        Built by{' '}
        <a href="https://andrewhathaway.net" target="_blank" rel="noreferrer">
          Andrew Hathaway
        </a>
        . Open source on{' '}
        <a href="https://github.com/andrewhathaway/TapScape" target="_blank" rel="noreferrer">
          GitHub
        </a>{' '}
        — code under MIT, location data under CC BY-NC-SA.
      </p>
      <p className="muted">{SITE_URL}</p>
    </div>
  )
}
