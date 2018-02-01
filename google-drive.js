const readline = require('readline')
const google = require('googleapis')
const { OAuth2Client } = require('google-auth-library')
const { promisify } = require('util')

// fix google docs weird characters
function sanitize(jsonString) {
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
  const code = await promisify(rl.question)('Enter the code from that page here: ')
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

// gets the list from the google drive file
async function getDeadList(drive) {
  const fileId = await getDeadListId(drive)

  const response = await promisify(drive.files.export)({
    fileId,
    mimeType: 'text/plain',
  })

  return JSON.parse(sanitize(response.data))
}

// writes to the google drive file the list
async function setDeadList(drive, deadList) {
  const fileId = await getDeadListId(drive)

  const response = await promisify(drive.files.update)({
    fileId,
    media: {
      mimeType: 'text/plain',
      body: JSON.stringify(deadList),
    }
  })
}

// gets the id of the file where the list is stored
async function getDeadListId(drive) {
  if (!process.env.DOCUMENT_NAME) {
    throw new Error('Missing DOCUMENT_NAME info, please check your .env file')
  }

  const { data: { files } } = await promisify(drive.files.list)({
    q: `name = '${process.env.DOCUMENT_NAME}'`,
  })

  if (files.length === 0) {
    throw new Error('File morti.json was not found')
  }

  return files[0].id
}


module.exports = {
  accessGoogleDrive,
  setDeadList,
  getDeadList,
}
