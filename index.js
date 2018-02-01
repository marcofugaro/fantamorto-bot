const dotenv = require('dotenv')
dotenv.config()
const fp = require('lodash/fp')
const got = require('got')
const chalk = require('chalk')
const rose = require('./fantamorto-rose')
const { accessGoogleDrive, setDeadList, getDeadList } = require('./google-drive')

const wikiCall = ({ query, lang = 'it' }) => `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${query}&prop=revisions&rvprop=content&format=json&formatversion=2`

const isDeadRegex = /(LuogoMorte = (.+) \|GiornoMeseMorte = (.+) \|AnnoMorte)|(death_date = (.+) \| death_place)/g

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

const isMissing = page => page.missing || /^#redirect/gi.test(page.revisions[0].content)
const isNotMissing = page => !page.missing && !/^#redirect/gi.test(page.revisions[0].content)

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

  const responseIt = await got(wikiCall({ query: toWikiQueryString(hopefullyDead) }), { json: true })

  const dead = getDead(responseIt.body)

  const missingIt = getMissing(responseIt.body)
  if (missingIt.length > 0) {
    const responseEn = await got(wikiCall({ query: toWikiQueryString(missingIt), lang: 'en' }), { json: true })

    const missingEn = getMissing(responseEn.body)
    if (missingEn.length > 0) {
      throw new Error(`Couldn't find a wikipedia page for ${missingEn.join(', ')}`)
    }

    dead.push(...getDead(responseEn.body))
  }

  const drive = await accessGoogleDrive()
  const deadList = await getDeadList(drive)
  console.log(deadList)
  await setDeadList(drive, deadList)
}
init()
  .catch(err => {
    console.log(chalk.red(err.message))
    process.exit()
  })

// we now have the dead array, we will check is those in there have already been called out
