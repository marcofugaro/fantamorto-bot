require('dotenv').config()
const fp = require('lodash/fp')
const got = require('got')
const chalk = require('chalk')
const pEachSeries = require('p-each-series')
const rose = require('./fantamorto-rose-2018')
const { accessGoogleDrive, setDeadList, getDeadList } = require('./google-drive')

const MAX_WIKIPEDIA_QUERIES = 50

const wikiCall = ({ query, lang = 'it' }) => `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${query}&prop=revisions&rvprop=content&format=json&formatversion=2`

const isDeadRegex = /(AnnoMorte = ([^\n]+))|(death_place = ([^\n]+))/g
const isRedirectRegex = /^#((redirect)|(rinvia))/gi

// returns the names of all the players of all teams from the object
const getAllNames = fp.pipe(
  Object.values,
  fp.map(Object.keys),
  fp.flatten,
  fp.uniq,
)

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

async function init() {
  const hopefullyDead = getAllNames(rose)
  const dead = []

  await pEachSeries(fp.chunk(MAX_WIKIPEDIA_QUERIES)(hopefullyDead), async (hopefullyDeadChunk) => {
    const responseIt = await got(wikiCall({ query: toWikiQueryString(hopefullyDeadChunk) }), { json: true })
    console.log(`Called ${responseIt.url}`)

    dead.push(...getDead(responseIt.body))

    const missingIt = getMissing(responseIt.body)
    if (missingIt.length > 0) {
      const responseEn = await got(wikiCall({ query: toWikiQueryString(missingIt), lang: 'en' }), { json: true })
      console.log(`Called ${responseEn.url}`)

      const missingEn = getMissing(responseEn.body)
      if (missingEn.length > 0) {
        throw new Error(`Couldn't find a wikipedia page for ${missingEn.join(', ')}`)
      }

      dead.push(...getDead(responseEn.body))
    }
  })

  const drive = await accessGoogleDrive()
  const deadList = await getDeadList(drive)
  const freshlyDead = dead.filter(name => !deadList.includes(name))

  if (freshlyDead.length > 0) {
    await setDeadList(drive, [ ...deadList, ...freshlyDead ])
    console.log('YO MAN A GUY DIED')
  }
}
init()
  .catch(err => {
    console.log(chalk.red(err.message))
    process.exit()
  })

// we now have the dead array, we will check is those in there have already been called out
