import rose from './fantamorto-rose'
import fp from 'lodash/fp'
import got from 'got'

const wikiCall = ({ query, lang = 'it' }) => `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${query}&prop=revisions&rvprop=content&format=json&formatversion=2`

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


// returns the one it didn't find the wikipedia page for
const getMissing = fp.pipe(
  fp.get('query.pages'),
  fp.filter(page => page.missing || page.revisions[0].content.startsWith('#redirect')),
  fp.map('title'),
)


const hopefullyDead = getAllNames(rose)

const responseIt = await got(wikiCall({ query: toWikiQueryString(hopefullyDead) }), { json: true })

const missingIt = getMissing(responseIt.body)
if (missingIt.length > 0) {
  const responseEn = await got(wikiCall({ query: toWikiQueryString(missingIt), lang: 'en' }), { json: true })

  const missingEn = getMissing(responseEn.body)
  if (missingEn.length > 0) {
    throw new Error(`Couldn't find a wikipedia page for ${missingEn.join(', ')}`)
  }
}
