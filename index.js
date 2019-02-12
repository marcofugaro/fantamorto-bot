require('dotenv').config()
const fp = require('lodash/fp')
const got = require('got')
const pEachSeries = require('p-each-series')
const rose = require('./fantamorto-rose-2019')
const { getDeadFromWikipedia } = require('./wikipedia')
const { readGoogleDoc, writeGoogleDoc } = require('./google-drive')

// read/write the list storage files
async function getSavedDeadList() {
  if (!process.env.DEAD_SAVED_DOCUMENT) {
    throw new Error('Missing DEAD_SAVED_DOCUMENT info, please check your .env file')
  }

  return await readGoogleDoc(process.env.DEAD_SAVED_DOCUMENT)
}
async function setSavedDeadList(deadList) {
  if (!process.env.DEAD_SAVED_DOCUMENT) {
    throw new Error('Missing DEAD_SAVED_DOCUMENT info, please check your .env file')
  }

  return await writeGoogleDoc(process.env.DEAD_SAVED_DOCUMENT, deadList)
}
async function getMaybeDeadList() {
  if (!process.env.DEAD_MAYBE_DOCUMENT) {
    throw new Error('Missing DEAD_MAYBE_DOCUMENT info, please check your .env file')
  }

  return await readGoogleDoc(process.env.DEAD_MAYBE_DOCUMENT)
}
async function setMaybeDeadList(deadList) {
  if (!process.env.DEAD_MAYBE_DOCUMENT) {
    throw new Error('Missing DEAD_MAYBE_DOCUMENT info, please check your .env file')
  }

  return await writeGoogleDoc(process.env.DEAD_MAYBE_DOCUMENT, deadList)
}


// returns the names of all the players of all teams from the object
const getAllNames = fp.pipe(
  Object.values,
  fp.map(Object.keys),
  fp.flatten,
  fp.uniq,
)

// returns an array with the team which contain the player received in input
function getTeamsContaining(player) {
  const teams = Object.keys(rose)
  return teams.filter(team => Object.keys(rose[team]).includes(player))
}

// returns an object with all the names and all the years
function getAllPlayers() {
  const teamPlayers = Object.values(rose)
  return teamPlayers.reduce((allPlayers, team) => {
    const players = Object.keys(team)

    players.forEach(player => {
      allPlayers[player] = team[player]
    })

    return allPlayers
  }, {})
}


// sends a message to the fantamorto slack channel
async function notifySlack(message) {
  // don't do it if we're testing
  if (process.env.NODE_ENV === 'development') {
    console.log(`☠️ FANTAMORTO-BOT SAYS: ${message}`)
    return
  }

  const body = {
    'text': message,
  }
  return await got.post(process.env.SLACK_WEBHOOK, { body: JSON.stringify(body) })
}

async function checkMorti(event, context, callback = fp.noop) {
  // notify aws lambda if there are any errors in promises
  process.on('unhandledRejection', err => {
    console.error(err.message)
    callback(err)
    process.exit(1)
  })

  const players = getAllNames(rose)

  const [ deadFromWikipedia, maybeDead, savedDead ] = await Promise.all([
    getDeadFromWikipedia(players),
    getMaybeDeadList(),
    getSavedDeadList(),
  ])

  // check if someone new is dead!
  const freshlyDead = deadFromWikipedia.filter(name => !savedDead.includes(name))


  if (freshlyDead.length === 0) {
    // we checked again and he's not dead, it was a fake news, empty the list
    if (maybeDead.length > 0) {
      await setMaybeDeadList([])
    }

    // notify aws lambda
    console.info('--------------- NOBODY DIED ---------------')
    return callback(null, 'Nobody died.')
  }

  await pEachSeries(freshlyDead, async (dead) => {
    if (!maybeDead.includes(dead)) {
      // they're dead but maybe they vandalized their page

      maybeDead.push(dead)
      await setMaybeDeadList(maybeDead)

      console.info(`--------------- ${dead.toUpperCase()} MAYBE DIED ---------------`)
    } else {
      // no they really died, we double checked

      maybeDead.splice(maybeDead.indexOf(dead), 1)
      await setMaybeDeadList(maybeDead)
      savedDead.push(dead)
      await setSavedDeadList(savedDead)

      await notifySlack(`⚰️ *${dead}* è deceduto. RIP in peace. ️✝️ 😿 🙏🏻`)
      const winningTeams = getTeamsContaining(dead)
      await notifySlack(`👏🏻 Congratulazioni ${winningTeams.length > 1 ? 'ai' : 'al'} team *${winningTeams.join(', ')}* 🎉 💪🏻 🎊 💯`)

      // calculate the holy formuoli
      const players = getAllPlayers()
      const years = players[dead]
      const points = Math.round(10 + (100 - years) / 10)

      await notifySlack(`🎯 Utilizzando la formula descritta nel regolamento ${winningTeams.length > 1 ? 'avete' : 'hai'} fatto ben *${points}* punti${winningTeams.length > 1 ? ' ciascuno' : ''}! 📝 Aggiung${winningTeams.length > 1 ? 'ete' : 'i'}ci eventuali bonus e segna${winningTeams.length > 1 ? 'te' : ''}li nel documento.`)

      console.info(`--------------- ${dead.toUpperCase()} DIED ---------------`)
    }
  })

  // notify aws lambda
  callback(null, `${freshlyDead.join(', ')} died!`)
}

module.exports = {
  checkMorti,
}

// actually call the function if we're testing
if (process.env.NODE_ENV === 'development') {
  checkMorti()
}