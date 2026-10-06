# Third-party content

The MIT licence in `LICENSE` covers the **source code only**. Parts of this
repository are derived from content owned by others, under different terms.

## Location data — `src/data/locations.json`

Built from the [Old School RuneScape Wiki](https://oldschool.runescape.wiki)
by `scripts/build-locations.mjs`, which reads the `{{Map}}` template out of
pages in `Category:Locations`. It is a derivative of wiki text, so it carries
the wiki's licence rather than this project's:

> **[CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/)** —
> Attribution, NonCommercial, ShareAlike.
> See [Weird Gloop's copyright policy](https://meta.weirdgloop.org/w/Meta:Copyrights).

Two consequences worth being explicit about:

- **NonCommercial.** Neither this project nor any fork may be used
  commercially while it carries this data. That includes running the site with
  advertising.
- **ShareAlike.** Redistributing a modified version of the data means releasing
  it under the same licence.

## Map imagery — `public/og.png` and the tiles at runtime

Map tiles are served at runtime from Weird Gloop's tile server and are not
redistributed here. `public/og.png` *is* committed, and is composed from those
tiles.

Note that Weird Gloop state non-text media should not be assumed to share the
text licence — the underlying map art is Jagex's, rendered from the game cache.
It is included here as a social preview image for a non-commercial fan project.
If you fork this, generate your own rather than reusing it.

## Trademarks

RuneScape and Old School RuneScape are trademarks of Jagex Limited. This is an
unofficial fan project with no affiliation with, or endorsement by, Jagex.

## If you fork this

The app hotlinks Weird Gloop's tile server, which is run on donations. One
deployment is a rounding error; a hundred forks is not. Before deploying your
own copy, please either self-host tiles or ask in `#wiki-tech` on the
[Weird Gloop Discord](https://discord.gg/weirdgloop).
