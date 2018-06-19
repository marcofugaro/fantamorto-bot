const fp = require('lodash/fp')
const got = require('got')
const pMap = require('p-map')

const MAX_WIKIPEDIA_QUERIES = 50

const wikiCall = ({ query, lang = 'it' }) => `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${query}&prop=revisions&rvprop=content&format=json&formatversion=2`

const isDeadRegex = /(AnnoMorte = ([^\n]+))|(death_place = ([^\n]+))/g
const isRedirectRegex = /^#((redirect)|(rinvia))/gi

// ['name', 'Other name']  --> 'name|Other%20name'
const toWikiQueryString = fp.pipe(
  fp.map(encodeURI),
  fp.join('|')
)

const isMissing = page => page.missing || isRedirectRegex.test(page.revisions[0].content)
const isNotMissing = page => !page.missing && !isRedirectRegex.test(page.revisions[0].content)

// returns the one it didn't find the wikipedia page for
const getMissing = fp.pipe(
  fp.get('query.pages'),
  fp.filter(isMissing),
  fp.map('title'),
)

// returns the ones that are already dead
const getDead = fp.pipe(
  fp.get('query.pages'),
  fp.filter(isNotMissing),
  fp.filter(page => isDeadRegex.test(page.revisions[0].content)),
  fp.map('title'),
)

async function getDeadFromWikipedia(players) {
  const deadFromWikipedia = []

  await pMap(fp.chunk(MAX_WIKIPEDIA_QUERIES)(players), async (playersChunk) => {
    const responseIt = await got(wikiCall({ query: toWikiQueryString(playersChunk) }), { json: true })
    console.log(`Called ${responseIt.url}`)

    deadFromWikipedia.push(...getDead(responseIt.body))

    const missingIt = getMissing(responseIt.body)
    if (missingIt.length > 0) {
      const responseEn = await got(wikiCall({ query: toWikiQueryString(missingIt), lang: 'en' }), { json: true })
      console.log(`Called ${responseEn.url}`)

      const missingEn = getMissing(responseEn.body)
      if (missingEn.length > 0) {
        throw new Error(`Couldn't find a wikipedia page for ${missingEn.join(', ')}`)
      }

      deadFromWikipedia.push(...getDead(responseEn.body))
    }
  })

  return deadFromWikipedia
}

module.exports = {
  getDeadFromWikipedia,
}