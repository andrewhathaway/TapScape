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
      <p>
        Wondering where somewhere actually is?{' '}
        <a href="/where/">Every location has a page</a> with a map and what's nearby.
      </p>
      <p>
        Nothing about you is stored unless you opt in. The morning reminder keeps only the
        browser's anonymous push address, your time zone and the hour you chose, and forgets
        them if you turn it off or stop playing for a couple of weeks. A friend group keeps
        the name you typed and your daily scores, visible to that group only.
      </p>
      <p className="muted">{SITE_URL}</p>
    </div>
  )
}
