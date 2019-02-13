const fp = require('lodash/fp')
const _ = require('lodash')
const got = require('got')
const chalk = require('chalk')
const pMap = require('p-map')

const MAX_WIKIPEDIA_QUERIES = 50

const wikiCall = ({ query, lang }) => `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${query}&prop=revisions&rvprop=content&format=json&formatversion=2`

// matches the word with something after which isn't a new line, it should be the death date or place
const DEAD_KEYWORDS = ['LuogoMorte = ', 'AnnoMorte = ', 'death_place = ', 'STERBEDATUM=', 'STERBEORT=']
const isDeadRegex = new RegExp(DEAD_KEYWORDS.map(word => `(${word}([^\\n]+))`).join('|'), 'g')

// skip the redirect pages, usually it's a string like '#RINVIA'
const isRedirectRegex = /^#((redirect)|(rinvia)|(umleiten))/gi

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

// check wikipedia in one language and returns the dead and the missing pages
async function checkWikipedia(players, lang) {
  const dead = []
  const missing = []

  // chunk the players array if it exceeds the max wikipedia queries in one call
  const chunkedPlayers = _.chunk(players, MAX_WIKIPEDIA_QUERIES)

  await pMap(chunkedPlayers, async (playersChunk) => {
    const response = await got(wikiCall({ query: toWikiQueryString(playersChunk), lang }), { json: true })
    console.log(`Called ${response.url}`)
    console.log()

    dead.push(...getDead(response.body))
    missing.push(...getMissing(response.body))
  })

  return { dead, missing }
}

async function getDeadFromWikipedia(players) {
  const deadFromWikipedia = []

  const { dead: deadIt, missing: missingIt } = await checkWikipedia(players, 'it')
  deadFromWikipedia.push(...deadIt)

  if (missingIt.length > 0) {
    const { dead: deadEn, missing: missingEn } = await checkWikipedia(missingIt, 'en')
    deadFromWikipedia.push(...deadEn)

    if (missingEn.length > 0) {
      const { dead: deadDe, missing: missingDe } = await checkWikipedia(missingEn, 'de')
      deadFromWikipedia.push(...deadDe)

      if (missingDe.length > 0) {
        console.log(chalk.red(`Couldn't find a wikipedia page for ${missingDe.join(', ')}`))
        process.exit(1)
      }
    }
  }

  return deadFromWikipedia
}

module.exports = {
  getDeadFromWikipedia,
}
