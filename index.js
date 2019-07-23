let { existsSync, promises: fs } = require('fs')
let util = require('util')
let exec = util.promisify(require('child_process').exec)
let boxen = require('boxen')
let chalk = require('chalk')
let hasYarn = require('has-yarn')
let ora = require('ora')
let path = require('path')
let getLatestVersion = require('latest-version')
let updateNotifier = require('update-notifier')

let cwd = process.cwd()
let pkgPath = path.join(cwd, 'package.json')
let thisPkg = require('./package.json')

updateNotifier({
  pkg: thisPkg,
  updateCheckInterval: 0,
}).notify()

if (!existsSync(pkgPath)) {
  unsupported()
  process.exit()
}

let pkg = require(pkgPath)
let isReactNative = 'react-native' in pkg.dependencies
let isReactDom = !isReactNative && 'react-dom' in pkg.dependencies

if (!pkg.devDependencies) {
  pkg.devDependencies = {}
}

// exit if this is already a views-morph project
if ('@viewstools/morph' in pkg.dependencies) {
  console.log(chalk.blue(`This is already a Views project! 🔥 🎉 \n`))
  help()
  process.exit()
}

if (!isReactDom && !isReactNative) {
  unsupported()
  process.exit()
}

console.log(
  `In a few minutes, your ${
    isReactDom ? 'web' : 'native'
  } project will be ready to use Views! 😇\n`
)

let spinner = ora('Getting the latest versions of Views dependencies').start()

let addDependency = (dep, version) => (pkg.dependencies[dep] = `^${version}`)
let addDevDependency = (dep, version) =>
  (pkg.devDependencies[dep] = `^${version}`)

async function run() {
  // dependencies
  let [morph, concurrently] = await Promise.all([
    getLatestVersion('@viewstools/morph'),
    getLatestVersion('concurrently'),
  ])
  addDependency('@viewstools/morph', morph)
  addDevDependency('concurrently', concurrently)

  if (isReactDom) {
    addDependency('emotion', await getLatestVersion('emotion'))
  }

  spinner.succeed()
  spinner = ora('Setting up the project').start()

  // setup scripts
  pkg.scripts.dev = pkg.scripts.start
  pkg.scripts.start = `concurrently --names 'react,views' --handle-input npm:dev npm:views`
  pkg.scripts.views = `views-morph src --watch --as ${
    isReactDom ? 'react-dom' : 'react-native'
  }`
  if (isReactDom) {
    pkg.scripts.prebuild = `views-morph src --as react-dom`
  }

  // write package.json
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2))

  spinner.succeed()
  spinner = ora('Installing the dependencies').start()

  // clear yarn.lock, it's causing issues with fsevents from time to time
  try {
    await fs.unlink(path.join(cwd, 'yarn.lock'))
  } catch (error) {}
  // install the dependencies
  await exec(hasYarn(cwd) ? 'yarn' : 'npm install')
  // TODO handle errors when installing the dependencies

  spinner.succeed()
  spinner = ora('Preparing a sample View for you to work with').start()

  // create a src directory
  try {
    await fs.mkdir(path.join(cwd, 'src'))
  } catch (err) {}
  try {
    await fs.mkdir(path.join(cwd, 'src', 'Stories'))
  } catch (err) {}

  // bootstrap files
  if (isReactDom) {
    // in src/index.js
    let indexPath = path.join(cwd, 'src', 'index.js')
    let index = await fs.readFile(indexPath, { encoding: 'utf-8' })
    // set App to load App.view.logic
    await fs.writeFile(
      indexPath,
      index.replace(`./App`, `./Stories/App.view.logic.js`)
    )

    // remove unused files
    await Promise.all(
      ['App.css', 'App.js', 'App.test.js', 'logo.svg'].map(async f => {
        try {
          await fs.unlink(path.join(cwd, 'src', f))
        } catch (err) {}
      })
    )

    // write views flexbox first css
    await fs.writeFile(path.join(cwd, 'src', 'index.css'), VIEWS_CSS)

    // write App.view.logic.js
    await fs.writeFile(
      path.join(cwd, 'src', 'Stories', 'App.view.logic.js'),
      APP_VIEW_LOGIC_DOM
    )
  } else {
    // write App.js
    await fs.writeFile(path.join(cwd, 'App.js'), APP_NATIVE)

    // write App.view.logic.js
    await fs.writeFile(
      path.join(cwd, 'src', 'Stories', 'App.view.logic.js'),
      APP_VIEW_LOGIC_NATIVE
    )

    // write fonts.js
    await fs.writeFile(path.join(cwd, 'assets', 'fonts.js'), FONTS_NATIVE)
  }

  // add views generated files to .gitignore
  await fs.appendFile(path.join(cwd, '.gitignore'), GITIGNORE)

  // write App.view
  await fs.writeFile(path.join(cwd, 'src', 'Stories', 'App.view'), APP_VIEW)

  await fs.writeFile(path.join(cwd, 'jsconfig.json'), JSCONFIG_JSON)

  spinner.succeed()

  console.log('🦄 \n')

  // :)
  console.log(chalk.blue(`This is now a Views project 🎉!!!`))

  console.log(
    `Go ahead and open the file ${chalk.green(
      'src/Stories/App.view'
    )} in your editor and change something ✏️`
  )
  console.log(
    `If this is your first time using Views, here's how to get your editor to understand Views files ${chalk.blue(
      'https://github.com/viewstools/docs#syntax-highlighting'
    )}`
  )
  help()
}

function help() {
  if (isReactDom) {
    console.log(
      `Run it with ${
        hasYarn(cwd) ? chalk.green('yarn start') : chalk.green('npm start')
      }\n`
    )
  } else {
    console.log(
      `Run the iOS simulator with ${chalk.green(
        'npm run ios'
      )} and the Android one with ${chalk.green('npm run android')}`
    )
    console.log(`
Sometimes the simulator fails to load. You will want to stop the command by pressing
${chalk.yellow('ctrl+c')} and running ${chalk.yellow('npm start')} instead.
If the simulator is already open, press the button to try again.

You can also use a real device for testing, https://github.com/react-community/create-react-native-app#npm-run-ios
for more info.`)
  }
  console.log(
    `You can find the docs at ${chalk.blue(
      'https://github.com/viewstools/docs'
    )}`
  )
  getInTouch()
  console.log(`Happy coding! :)`)
}

function unsupported() {
  console.log(
    `It looks like the directory you're on isn't either a create-react-app or expo (react native) project.`
  )
  console.log(`Is ${chalk.yellow(cwd)} the right folder?\n`)
  console.log(
    `If you don't have a project and want to make a new one, follow these instructions:`
  )
  console.log(`For ${chalk.blue('React DOM')}, ie, a web project:`)
  console.log(
    chalk.green(`npm install --global create-react-app
create-react-app my-app
cd my-app
use-views`)
  )

  console.log(
    `\nFor ${chalk.blue('React Native')}, ie, an iOS or Android project:`
  )
  console.log(
    chalk.green(`npm install --global expo-cli
# choose the blank template and follow expo's wizard
expo init my-native-app
cd my-native-app
use-views`)
  )

  getInTouch()
}

function getInTouch() {
  console.log(
    `\nIf you need any help, join our GitHub community at ${chalk.blue(
      'https://docs.views.tools'
    )}\n`
  )
}

// start
run()

// files
let APP_VIEW = `App View
flow together
  Vertical
  flow together
  alignItems center
  flexBasis auto
  flexGrow 1
  flexShrink 1
  justifyContent center
    Text
    fontSize 18
    text Hello Views Tools!`

let APP_VIEW_LOGIC_DOM = `import App from './App.view.js'
import { Flow } from '../useFlow.js'
import React from 'react'

export default function AppLogic(props) {
  return (
    <Flow>
      <App {...props} />
    </Flow>
  )
}`

let APP_VIEW_LOGIC_NATIVE = `import { AppLoading, Font } from 'expo'
import App from './App.view.js'
import { Flow } from '../useFlow.js'
import fonts from '../../assets/fonts.js'
import React, { useState } from 'react'

export default function AppLogic(props) {
  let [isReady, setIsReady] = useState(false)

  if (!isReady) {
    return (
      <AppLoading
        startAsync={() => Font.loadAsync(fonts)}
        onFinish={() => setIsReady(true)}
        onError={console.warn}
      />
    );
  }

  return (
    <Flow>
      <App {...props} />
    </Flow>
  )
}`

let APP_NATIVE = `import App from './src/Stories/App.view.logic.js'
export default App`

let FONTS_NATIVE = `export default {
// At some point, Views will do this automatically. For now, you
// need to write your fonts by hand. Here's an example of a font used like:
// Text
// fontFamily Robot Mono
// fontWeight 300
// text hey I'm using Roboto Mono!
//
// Font definition:
//
//  'RobotoMono-300': require('./fonts/RobotoMono-300.ttf'),
//
}`

let GITIGNORE = `
# views
**/*.view.js
**/Fonts/*.js
src/index-viewstools.js
src/useFlow.js
src/useIsBefore.js
src/useIsMedia.js
src/useTools.js`

let VIEWS_CSS = `* {
  -webkit-overflow-scrolling: touch;
  -ms-overflow-style: -ms-autohiding-scrollbar;
}
html,
body,
#root {
  height: 100%;
  margin: 0;
}
.views-block, #root {
  align-items: stretch;
  background-color: transparent;
  border-radius: 0;
  border: 0;
  box-sizing: border-box;
  color: inherit;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  font-family: inherit;
  font-size: inherit;
  hyphens: auto;
  line-height: inherit;
  margin: 0;
  outline: 0;
  overflow-wrap: break-word;
  padding: 0;
  position: relative;
  text-align: left;
  text-decoration: none;
  white-space: normal;
  word-wrap: break-word;
}
.views-text {
  box-sizing: border-box;
  hyphens: auto;
  outline: 0;
  overflow-wrap: break-word;
  word-wrap: break-word;
}
.views-capture {
  background-color: transparent;
  box-sizing: border-box;
  border-radius: 0;
  border: 0;
  hyphens: auto;
  outline: 0;
  overflow-wrap: break-word;
  word-wrap: break-word;
}
.views-capture::-moz-focus-inner {
  border: 0;
  margin: 0;
  padding: 0;
}
/* remove number arrows */
.views-capture[type='number']::-webkit-outer-spin-button,
.views-capture[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}`

let JSCONFIG_JSON = `{
  "compilerOptions": {
    "baseUrl": "src",
    "skipLibCheck": true
  },
  "include": ["src"]
}`
