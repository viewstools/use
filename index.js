const { execSync } = require('child_process')
const boxen = require('boxen')
const chalk = require('chalk')
const fs = require('fs')
const hasYarn = require('has-yarn')
const ora = require('ora')
const path = require('path')
const getLatestVersion = require('latest-version')
const updateNotifier = require('update-notifier')

const cwd = process.cwd()
const pkgPath = path.join(cwd, 'package.json')
const thisPkg = require('./package.json')

if (thisPkg.name === 'use-views') {
  console.log(
    boxen(
      [
        chalk.red(
          `use-views is deprecated, use @viewstools/use instead. Run this to update:`
        ),
        chalk.green(`npm install --global @viewstools/use`),
        chalk.green(`npm uninstall --global use-views`),
      ].join('\n'),
      {
        padding: 1,
      }
    )
  )
} else {
  updateNotifier({
    pkg: thisPkg,
    updateCheckInterval: 0,
  }).notify()
}

if (!fs.existsSync(pkgPath)) {
  unsupported()
  process.exit()
}

const pkg = require(pkgPath)
const isReactDom = 'react-dom' in pkg.dependencies
const isReactNative = 'react-native' in pkg.dependencies

if (!pkg.devDependencies) {
  pkg.devDependencies = {}
}

// exit if this is already a views-morph project
if ('@viewstools/morph' in pkg.devDependencies) {
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

const addDependency = (dep, version) => (pkg.dependencies[dep] = `^${version}`)
const addDevDependency = (dep, version) =>
  (pkg.devDependencies[dep] = `^${version}`)

async function run() {
  // dependencies
  await Promise.all([
    getLatestVersion('@viewstools/morph'),
    getLatestVersion('@viewstools/e2e'),
    getLatestVersion('concurrently'),
  ]).then(([morph, e2e, concurrently]) => {
    addDevDependency('@viewstools/morph', morph)
    addDevDependency('@viewstools/e2e', e2e)
    addDevDependency('concurrently', concurrently)
  })

  const reactRouter = isReactDom ? 'react-router-dom' : 'react-router-native'
  await Promise.all([
    getLatestVersion(reactRouter),
    getLatestVersion('prop-types'),
  ]).then(([router, propTypes]) => {
    addDependency(reactRouter, router)
    addDependency('prop-types', propTypes)
  })

  if (isReactDom) {
    await Promise.all([
      getLatestVersion('emotion'),
    ]).then(([emotion]) => {
      addDependency('emotion', emotion)
    })
  }

  spinner.succeed()
  spinner = ora('Setting up the project').start()

  // setup scripts
  pkg.scripts.dev = pkg.scripts.start
  pkg.scripts.start = `concurrently "npm run dev" "npm run views"`
  pkg.scripts.views = `views-morph src --watch --as ${
    isReactDom ? 'react-dom' : 'react-native'
  }`
  if (isReactDom) {
    pkg.scripts.prebuild = `views-morph src --as react-dom`
  } else {
    pkg.scripts['dev:ios'] = pkg.scripts.ios
    pkg.scripts.ios = `concurrently "npm run dev:ios" "npm run views"`

    pkg.scripts['dev:android'] = pkg.scripts.android
    pkg.scripts.android = `concurrently "npm run dev:android" "npm run views"`
  }

  // write package.json
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))

  spinner.succeed()
  spinner = ora('Installing the dependencies').start()

  // install the dependencies
  execSync(hasYarn(cwd) ? 'yarn' : 'npm install')

  spinner.succeed()
  spinner = ora('Preparing a sample View for you to work with').start()

  // create a src directory
  try {
    fs.mkdirSync(path.join(cwd, 'src'))
  } catch (err) {}
  try {
    fs.mkdirSync(path.join(cwd, 'src', 'Main'))
  } catch (err) {}

  // bootstrap files
  if (isReactDom) {
    // in src/index.js
    const indexPath = path.join(cwd, 'src', 'index.js')
    const index = fs.readFileSync(indexPath, { encoding: 'utf-8' })
    // set App to load App.view.logic
    fs.writeFileSync(
      indexPath,
      index.replace(`./App`, `./Main/App.view.logic.js`)
    )

    // remove unused files
    ;['App.css', 'App.js', 'App.test.js', 'logo.svg'].forEach(f => {
      try {
        fs.unlinkSync(path.join(cwd, 'src', f))
      } catch (err) {}
    })

    // write views flexbox first css
    fs.writeFileSync(path.join(cwd, 'src', 'index.css'), VIEWS_CSS)

    // write App.view.logic.js
    fs.writeFileSync(
      path.join(cwd, 'src', 'Main', 'App.view.logic.js'),
      APP_VIEW_LOGIC_DOM
    )
  } else {
    // write App.js
    fs.writeFileSync(path.join(cwd, 'App.js'), APP_NATIVE)

    // write App.view.logic.js
    fs.writeFileSync(
      path.join(cwd, 'src', 'Main', 'App.view.logic.js'),
      APP_VIEW_LOGIC_NATIVE
    )

    // write fonts.js
    fs.writeFileSync(path.join(cwd, 'src', 'fonts.js'), FONTS_NATIVE)
  }

  // add views generated files to .gitignore
  fs.appendFileSync(path.join(cwd, '.gitignore'), GITIGNORE)

  // write App.view
  fs.writeFileSync(path.join(cwd, 'src', 'Main', 'App.view'), APP_VIEW)

  spinner.succeed()

  console.log('🦄 \n')

  // :)
  console.log(chalk.blue(`This is now a Views project 🎉!!!`))

  console.log(
    `Go ahead and open the file ${chalk.green(
      'src/Main/App.view'
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
    `It looks like the directory you're on isn't either a create-react-app or create-react-native-app project.`
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
    chalk.green(`npm install --global create-react-native-app
create-react-native-app my-native-app
cd my-native-app
use-views`)
  )

  getInTouch()
}

function getInTouch() {
  console.log(
    `\nIf you need any help, get in touch at ${chalk.blue(
      'https://twitter.com/viewstools'
    )} or`
  )
  console.log(
    `join our Slack community at ${chalk.blue('https://slack.views.tools')}\n`
  )
}

// start
run()

// files
const APP_VIEW = `App Vertical
alignItems center
flexGrow 1
flexShrink 1
flexBasis auto
justifyContent center
Text
fontSize 18
text < Hello Views Tools!`

const APP_VIEW_LOGIC_DOM = `import React from 'react'
import App from './App.view.js'

export default class AppLogic extends React.Component {
  render() {
    return <App {...this.props} />
  }
}`

const APP_VIEW_LOGIC_NATIVE = `import { AppLoading, Font } from 'expo'
import { Animated } from 'react-native'
import fonts from '../fonts.js'
import React from 'react'
import App from './App.view.js'

export default class AppLogic extends React.Component {
  state = {
    isReady: false,
  }

  render() {
    if (!this.state.isReady) {
      return (
        <AppLoading
          startAsync={this._cacheResourcesAsync}
          onFinish={() => this.setState({ isReady: true })}
          onError={console.warn}
        />
      );
    }

    return <App {...this.props} />
  }

  _cacheResourcesAsync() {
    return Font.loadAsync(fonts)
  }
}`

const APP_NATIVE = `import App from './src/Main/App.view.logic.js'
export default App`

const FONTS_NATIVE = `export default {
// At some point, Views will do this automatically. For now, you
// need to write your fonts by hand. Here's an example of a font used like:
// Text
// fontFamily Robot Mono
// fontWeight 300
// text hey I'm using Roboto Mono!
//
// Font definition:
//
//  'RobotoMono-300': require('./assets/fonts/RobotoMono-300.ttf'),
//
}`

const GITIGNORE = `
# views
**/*.view.js
**/Fonts/*.js`

const VIEWS_CSS = `* {
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
  box-sizing: border-box;
  color: inherit;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  hyphens: auto;
  margin: 0;
  outline: 0;
  overflow-wrap: break-word;
  padding: 0;
  position: relative;
  text-decoration: none;
  word-wrap: break-word;
  background-color: transparent;
  border-radius: 0;
  border: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  margin: 0;
  padding: 0;
  text-align: left;
  white-space: normal;
}
.views-block::-moz-focus-inner {
  border: 0;
  margin: 0;
  padding: 0;
}
/* remove number arrows */
.views-block[type='number']::-webkit-outer-spin-button,
.views-block[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}`
