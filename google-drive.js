const fs = require('fs')
const readline = require('readline')
const google = require('googleapis')
const { OAuth2Client } = require('google-auth-library')
const pify = require('pify')

global.drive = null
global.alreadyQueriedDocs = {}

// fix google docs weird characters
function sanitizeGoogleDoc(jsonString) {
  return jsonString.slice(1)
}

// if we never connected the application, authorize it and get the token
async function authorize(auth) {
  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive']
  })

  console.log('Authorize this app by visiting this url: ')
  console.log(authUrl)
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  const code = await pify(rl.question)('Enter the code from that page here: ')
  rl.close()

  const { token, err } = await auth.getToken(code)
  if (err) {
    throw new Error(`Error while trying to retrieve access token. ${err}`)
  }

  return JSON.parse(token)
}

// initialize google drive and returns the instance
async function accessGoogleDrive() {
  if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
    throw new Error('Missing CLIENT_ID or CLIENT_SECRET, please check your .env file')
  }

  const auth = new OAuth2Client(process.env.CLIENT_ID, process.env.CLIENT_SECRET, 'https://developers.google.com')

  let token
  if (!process.env.ACCESS_TOKEN || !process.env.REFRESH_TOKEN) {
    token = await authorize(auth)
    fs.appendFileSync('.env', `ACCESS_TOKEN=${token.access_token}`)
    fs.appendFileSync('.env', `REFRESH_TOKEN=${token.refresh_token}`)
  } else {
    token = {
      access_token: process.env.ACCESS_TOKEN,
      refresh_token: process.env.REFRESH_TOKEN,
      token_type: 'Bearer',
      // expiry_date: 1517486797180,
    }
  }

  auth.credentials = token
  return google.drive({ version: 'v3', auth })
}


// gets the id of the google document
async function getDocId(documentName) {
  if (!global.drive) {
    global.drive = await accessGoogleDrive()
  }

  // check if we requested the file in the past
  if (global.alreadyQueriedDocs.hasOwnProperty(documentName)) {
    return global.alreadyQueriedDocs[documentName]
  }

  const { data: { files } } = await pify(global.drive.files.list)({
    q: `name = '${documentName}'`,
  })

  if (files.length === 0) {
    throw new Error(`File ${documentName} was not found`)
  }

  // cache the file id
  global.alreadyQueriedDocs[documentName] = files[0].id

  return files[0].id
}


// reads the first google doc that finds with the requested name
async function readGoogleDoc(documentName) {
  if (!global.drive) {
    global.drive = await accessGoogleDrive()
  }

  const fileId = await getDocId(documentName)

  const response = await pify(global.drive.files.export)({
    fileId,
    mimeType: 'text/plain',
  })

  return JSON.parse(sanitizeGoogleDoc(response.data))
}

// writes the first google doc that finds with that name
async function writeGoogleDoc(documentName, content) {
  if (!global.drive) {
    global.drive = await accessGoogleDrive()
  }

  const fileId = await getDocId(documentName)

  const response = await pify(global.drive.files.update)({
    fileId,
    media: {
      mimeType: 'text/plain',
      body: JSON.stringify(content),
    }
  })

  return response
}

module.exports = {
  readGoogleDoc,
  writeGoogleDoc,
}
